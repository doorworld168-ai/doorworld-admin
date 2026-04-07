import { useState, useEffect, useCallback, useRef } from 'react';
import { sbFetch, proxyCount } from '../api/supabase';
import { fmtDate, fmtPrice, CASE_STATUS_LABEL, CASE_STATUS_COLOR, CASE_STEPS, CTYPE_SHORT, DOOR_TYPE_LABEL, calcDelay, downloadCSV } from '../api/utils';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/UI/Modal';
import StatCard from '../components/UI/StatCard';
import DateQuickFilter from '../components/UI/DateQuickFilter';

const TABS = ['customer', 'measure', 'finance', 'progress', 'factory', 'status'];
const TAB_LABELS = { customer: '客戶', measure: '丈量', finance: '財務', progress: '進度', factory: '工廠', status: '狀態' };
const CTYPE_OPTIONS = [['','選擇'],['S','股東'],['C','直客'],['D','設計師'],['D1','D1(20堂+)'],['D2','D2(60堂+)'],['A','代理商'],['B','建商'],['CC','商會'],['DD','經銷商'],['E','員工'],['G','公機關'],['V','VIP'],['Z','親友'],['X','公司']];
const SS_KEY = 'cases_filters_v1';

export default function Cases() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  // Restore filters from sessionStorage on mount
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(SS_KEY) || '{}'); } catch { return {}; } })();
  const [search, setSearch] = useState(saved.search || '');
  const [statusFilter, setStatusFilter] = useState(saved.statusFilter || '');
  const [dateFrom, setDateFrom] = useState(saved.dateFrom || '');
  const [dateTo, setDateTo] = useState(saved.dateTo || '');
  const [datePreset, setDatePreset] = useState(saved.datePreset || null);
  const [mineOnly, setMineOnly] = useState(saved.mineOnly || false);
  const [pageSize, setPageSize] = useState(saved.pageSize || 20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({});
  const [modal, setModal] = useState({ open: false, data: null });
  const [tab, setTab] = useState('customer');
  const [form, setForm] = useState({});
  const [initialForm, setInitialForm] = useState({});
  const [productions, setProductions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [batchStatus, setBatchStatus] = useState('');
  const searchRef = useRef(null);
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const debouncedSearch = useDebounce(search);

  // Persist filters on change
  useEffect(() => {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ search, statusFilter, dateFrom, dateTo, datePreset, mineOnly, pageSize }));
  }, [search, statusFilter, dateFrom, dateTo, datePreset, mineOnly, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    let path = 'cases?select=*&order=created_at.desc';
    if (debouncedSearch) path += `&or=(case_no.ilike.*${encodeURIComponent(debouncedSearch)}*,customer_name.ilike.*${encodeURIComponent(debouncedSearch)}*,order_no.ilike.*${encodeURIComponent(debouncedSearch)}*)`;
    if (statusFilter) path += `&status=eq.${statusFilter}`;
    if (dateFrom) path += `&created_at=gte.${dateFrom}`;
    if (dateTo) path += `&created_at=lte.${dateTo}T23:59:59`;
    if (mineOnly && user?.display_name) path += `&sales_person=eq.${encodeURIComponent(user.display_name)}`;
    try {
      // Parallelize independent API calls
      const [cnt, data, activeCases, totalCnt, activeCnt, completedCnt, monthCnt] = await Promise.all([
        proxyCount(path.replace('select=*', 'select=id')),
        sbFetch(path + `&offset=${page * pageSize}&limit=${pageSize}`),
        sbFetch('cases?select=*&status=not.in.(completed,cancelled)&limit=500'),
        proxyCount('cases?select=id'),
        proxyCount('cases?select=id&status=in.(new,measure_scheduled,measured,official_quoted,order_confirmed,deposit_paid,production,shipped,arrived,installed)'),
        proxyCount('cases?select=id&status=eq.completed'),
        proxyCount(`cases?select=id&created_at=gte.${new Date().toISOString().slice(0, 7)}-01`)
      ]);
      setTotal(cnt);
      setRows(data || []);
      setStats({
        total: totalCnt, active: activeCnt,
        delayed: (activeCases || []).filter(c => calcDelay(c).delayed).length,
        completed: completedCnt, month: monthCnt
      });
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
    setSelected(new Set());
  }, [debouncedSearch, statusFilter, dateFrom, dateTo, mineOnly, page, pageSize, user, toast]);

  // Keyboard shortcut: `/` to focus search
  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && !modal.open && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal.open]);

  useEffect(() => { load(); }, [load]);

  // Track which case modal is open to prevent stale responses
  const activeCaseRef = useRef(null);

  function openCase(c) {
    const copy = { ...c };
    setForm(copy);
    setInitialForm(copy);
    setTab('customer');
    setModal({ open: true, data: c });
    setPayments([]);
    setProductions([]);
    activeCaseRef.current = c.id;
    const caseId = c.id;
    sbFetch(`payments?case_id=eq.${caseId}&order=paid_at.desc`).then(p => { if (activeCaseRef.current === caseId) setPayments(p || []); }).catch(() => {});
    sbFetch(`production?case_id=eq.${caseId}&order=created_at.desc`).then(p => { if (activeCaseRef.current === caseId) setProductions(p || []); }).catch(() => {});
  }

  function isDirty() {
    // Compare form vs initialForm for changed fields
    for (const k of Object.keys(form)) {
      if (JSON.stringify(form[k] ?? null) !== JSON.stringify(initialForm[k] ?? null)) return true;
    }
    return false;
  }

  function tryClose() {
    if (isDirty()) {
      confirm('尚未儲存', '有未儲存的變更，確定要關閉？', () => setModal({ open: false, data: null }));
    } else {
      setModal({ open: false, data: null });
    }
  }

  // Quick advance to next stage
  async function advanceStatus(c, e) {
    e.stopPropagation();
    const idx = CASE_STEPS.indexOf(c.status);
    if (idx === -1 || idx >= CASE_STEPS.length - 1) return;
    const next = CASE_STEPS[idx + 1];
    try {
      await sbFetch(`cases?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: next, updated_at: new Date().toISOString() }) });
      toast(`${c.customer_name || c.case_no}: ${CASE_STATUS_LABEL[c.status]} → ${CASE_STATUS_LABEL[next]}`, 'success');
      load();
    } catch (err) { toast('更新失敗: ' + err.message, 'error'); }
  }

  async function saveTab(fields) {
    setSaving(true);
    try {
      fields.updated_at = new Date().toISOString();
      await sbFetch(`cases?id=eq.${modal.data.id}`, { method: 'PATCH', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify(fields) });
      toast('已儲存', 'success');
      setForm(f => {
        const next = { ...f, ...fields };
        setInitialForm(next);
        return next;
      });
      load();
    } catch (e) { toast('儲存失敗: ' + e.message, 'error'); }
    setSaving(false);
  }

  async function createNew() {
    const no = 'CS-' + new Date().toISOString().replace(/[-T:]/g, '').slice(0, 14);
    const res = await sbFetch('cases', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify({ case_no: no, status: 'new', created_by: user?.display_name || '' }) });
    toast('案件已建立: ' + no, 'success');
    load();
    if (res?.[0]) openCase(res[0]);
  }

  async function deleteCase() {
    confirm('確定刪除？', `案件 ${form.case_no} 將永久刪除。`, async () => {
      try {
        await sbFetch(`cases?id=eq.${modal.data.id}`, { method: 'DELETE' });
        toast('已刪除', 'success');
        setModal({ open: false, data: null });
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // Batch status update
  async function batchUpdateStatus() {
    if (!batchStatus || selected.size === 0) return;
    confirm('批次更新', `確定將 ${selected.size} 筆案件狀態更新為「${CASE_STATUS_LABEL[batchStatus] || batchStatus}」？`, async () => {
      try {
        const ids = [...selected];
        for (const id of ids) {
          await sbFetch(`cases?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: batchStatus, updated_at: new Date().toISOString() }) });
        }
        toast(`已更新 ${ids.length} 筆案件`, 'success');
        setSelected(new Set());
        setBatchStatus('');
        load();
      } catch (e) { toast('批次更新失敗: ' + e.message, 'error'); }
    });
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  }

  // CSV export
  function exportCSV() {
    if (!rows.length) { toast('沒有資料可匯出', 'error'); return; }
    const headers = ['案件編號', '訂單編號', '客戶', '業務', '型態', '門型', '報價', '狀態', '建立日期'];
    const csvRows = rows.map(c => [
      c.case_no || '', c.order_no || '', c.customer_name || '', c.sales_person || '',
      CTYPE_SHORT[c.customer_type] || c.customer_type || '',
      DOOR_TYPE_LABEL[c.door_type] || c.door_type || '',
      c.total_with_tax || c.official_price || c.quoted_price || '',
      CASE_STATUS_LABEL[c.status] || c.status || '',
      c.created_at ? new Date(c.created_at).toLocaleDateString('zh-TW') : ''
    ]);
    downloadCSV(headers, csvRows, `案件管理_${new Date().toISOString().slice(0, 10)}.csv`);
    toast('已下載 CSV', 'success');
  }

  const stepIdx = CASE_STEPS.indexOf(form.status);
  const st = CASE_STATUS_COLOR[form.status] || CASE_STATUS_COLOR.new;
  const from = page * pageSize + 1, to = Math.min(from + pageSize - 1, total);

  const inp = (label, key, type = 'text', required = false) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label style={{ fontSize: 12 }}>{label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}</label>
      <input type={type} value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="search-box" style={{ padding: '8px 12px', fontSize: 13, minWidth: 0, ...(required && !form[key] ? { borderColor: 'rgba(255,68,68,.3)' } : {}) }} />
    </div>
  );

  const saveBtn = (label, onClick) => (
    <button className="btn btn-primary" style={{ gridColumn: '1/-1' }} disabled={saving} onClick={onClick}>
      {saving ? '儲存中...' : label}
    </button>
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">案件管理</div><div className="page-subtitle">追蹤從丈量到發包的完整流程</div></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={exportCSV} style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>下載 CSV</button>
          <button className="btn btn-primary" onClick={createNew}>+ 新增案件</button>
        </div>
      </div>
      <div className="stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)' }}>
        <StatCard label="總案件" value={stats.total} />
        <StatCard label="進行中" value={stats.active} />
        <StatCard label="延遲中" value={stats.delayed} color="var(--danger)" />
        <StatCard label="已結案" value={stats.completed} color="var(--success)" />
        <StatCard label="本月" value={stats.month} />
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div style={{ padding: '10px 16px', background: 'var(--gold-dim)', border: '1px solid rgba(236,194,70,.3)', borderRadius: 'var(--radius)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>已選 {selected.size} 筆</span>
          <select value={batchStatus} onChange={e => setBatchStatus(e.target.value)} style={{ padding: '6px 28px 6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
            <option value="">選擇狀態...</option>
            {CASE_STEPS.map(s => <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>)}
            <option value="cancelled">已取消</option>
          </select>
          <button className="btn btn-primary btn-sm" disabled={!batchStatus} onClick={batchUpdateStatus}>批次更新</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>取消選取</button>
        </div>
      )}

      <div className="controls">
        <input ref={searchRef} className="search-box" placeholder="搜尋案件編號、客戶... (按 / 聚焦)" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} style={{ padding: '9px 32px 9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
          <option value="">全部狀態</option>
          {CASE_STEPS.map(s => <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>)}
          <option value="cancelled">已取消</option>
        </select>
        {user?.display_name && (
          <button onClick={() => { setMineOnly(m => !m); setPage(0); }} style={{
            padding: '9px 14px', borderRadius: 'var(--radius)',
            border: `1px solid ${mineOnly ? 'var(--gold)' : 'var(--border)'}`,
            background: mineOnly ? 'var(--gold-dim)' : 'var(--surface-2)',
            color: mineOnly ? 'var(--gold)' : 'var(--text-muted)',
            fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: mineOnly ? 700 : 500
          }}>{mineOnly ? '✓ 我的' : '我的'}</button>
        )}
        <button className="btn btn-ghost" onClick={load}>↻</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>建立時間:</span>
        <DateQuickFilter
          from={dateFrom} to={dateTo}
          activePreset={datePreset}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(0); }}
          onPresetChange={k => setDatePreset(k)}
          compact
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr>
            <th style={{ width: 36 }}><input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} /></th>
            <th>訂單編號</th><th>客戶</th><th>業務</th><th>型態</th><th>報價</th><th>狀態</th><th>建立</th><th style={{ width: 40 }}></th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="9"><div className="loading"><div className="spinner" /><br />載入中...</div></td></tr>
            : rows.length === 0 ? <tr><td colSpan="9"><div className="empty"><div className="icon">📁</div>沒有案件</div></td></tr>
            : rows.map(c => {
              const cst = CASE_STATUS_COLOR[c.status] || CASE_STATUS_COLOR.new;
              const price = c.total_with_tax || c.official_price || c.quoted_price;
              const d = calcDelay(c);
              const idx = CASE_STEPS.indexOf(c.status);
              const canAdvance = idx >= 0 && idx < CASE_STEPS.length - 1;
              const nextLabel = canAdvance ? CASE_STATUS_LABEL[CASE_STEPS[idx + 1]] : '';
              return (
                <tr key={c.id} style={{ cursor: 'pointer', background: d.delayed ? 'rgba(239,68,68,.04)' : undefined, boxShadow: d.delayed ? 'inset 3px 0 0 var(--danger)' : undefined }}>
                  <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} style={{ cursor: 'pointer' }} /></td>
                  <td onClick={() => openCase(c)}><strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.order_no || c.case_no || '—'}</strong></td>
                  <td onClick={() => openCase(c)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{c.customer_name || '—'}</span>
                      {c.customer_phone && <a href={`tel:${c.customer_phone}`} onClick={e => e.stopPropagation()} title={c.customer_phone} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 11 }}>📞</a>}
                    </div>
                  </td>
                  <td onClick={() => openCase(c)} style={{ fontSize: 12 }}>{c.sales_person || '—'}</td>
                  <td onClick={() => openCase(c)} style={{ fontSize: 11 }}>{CTYPE_SHORT[c.customer_type] || c.customer_type || '—'}</td>
                  <td onClick={() => openCase(c)} className="price">{price ? fmtPrice(price) : '—'}</td>
                  <td onClick={() => openCase(c)}>
                    <span className="badge" style={{ background: cst.bg, color: cst.color }}>{CASE_STATUS_LABEL[c.status] || c.status}</span>
                    {d.delayed && <div style={{ fontSize: 9, color: 'var(--danger)', fontWeight: 700, marginTop: 2 }}>延遲{d.days}天</div>}
                  </td>
                  <td onClick={() => openCase(c)} style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(c.created_at)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {canAdvance && (
                      <button onClick={e => advanceStatus(c, e)} title={`推進至: ${nextLabel}`} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 7px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1 }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>→</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{total ? `顯示 ${from}-${to}，共 ${total} 筆` : ''}</span>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }} style={{ padding: '4px 22px 4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: 'var(--surface-2)', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
            <option value="20">20 / 頁</option>
            <option value="50">50 / 頁</option>
            <option value="100">100 / 頁</option>
          </select>
        </div>
        <div className="page-btns">
          <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
          <button className="page-btn" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}>›</button>
        </div>
      </div>

      <Modal open={modal.open} onClose={tryClose} title={`案件詳細${isDirty() ? ' •' : ''}`} maxWidth={720}
        footer={<><button className="btn btn-ghost" onClick={tryClose}>關閉</button><button className="btn btn-danger" onClick={deleteCase}>刪除</button></>}>
        {modal.open && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <strong>{form.case_no}</strong>
            <span className="badge" style={{ background: st.bg, color: st.color }}>{CASE_STATUS_LABEL[form.status]}</span>
          </div>
          {/* Stepper */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
            {CASE_STEPS.map((s, i) => (
              <span key={s} style={{ fontSize: 9, padding: '3px 6px', borderRadius: 12, whiteSpace: 'nowrap',
                ...(s === form.status ? { background: 'var(--gold)', color: '#000', fontWeight: 700 } :
                  i <= stepIdx ? { background: 'rgba(16,185,129,.2)', color: '#10b981' } :
                  { background: 'var(--surface-high)', color: 'var(--text-muted)' }) }}>{CASE_STATUS_LABEL[s]}</span>
            ))}
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '10px 6px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: tab === t ? 700 : 600, color: tab === t ? 'var(--gold)' : 'var(--text-muted)', borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent' }}>{TAB_LABELS[t]}</button>
            ))}
          </div>
          {/* Tab content */}
          {tab === 'customer' && (
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {inp('訂單編號', 'order_no')}{inp('下單編號', 'factory_order_no')}{inp('業務', 'sales_person')}{inp('客戶名稱', 'customer_name', 'text', true)}
              {inp('聯繫人', 'contact_person')}{inp('電話', 'customer_phone')}{inp('產品編號', 'product_code')}{inp('數量', 'quantity', 'number')}
              <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>客戶型態</label><select value={form.customer_type || ''} onChange={e => setForm(f => ({ ...f, customer_type: e.target.value }))} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' }}>{CTYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>防火門</label><select value={String(form.is_fireproof || false)} onChange={e => setForm(f => ({ ...f, is_fireproof: e.target.value === 'true' }))} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' }}><option value="false">NO</option><option value="true">YES</option></select></div>
              <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}><label style={{ fontSize: 12 }}>案場地址</label><input value={form.case_address || ''} onChange={e => setForm(f => ({ ...f, case_address: e.target.value }))} className="search-box" style={{ padding: '8px 12px', fontSize: 13, minWidth: 0 }} /></div>
              {saveBtn('儲存客戶資訊', () => saveTab({ order_no: form.order_no, factory_order_no: form.factory_order_no, sales_person: form.sales_person, customer_name: form.customer_name, contact_person: form.contact_person, customer_phone: form.customer_phone, product_code: form.product_code, quantity: Number(form.quantity) || 1, customer_type: form.customer_type, is_fireproof: form.is_fireproof, case_address: form.case_address }))}
            </div>
          )}
          {tab === 'measure' && (
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {inp('丈量日期', 'measure_date', 'date')}{inp('丈量人員', 'measure_staff')}{inp('實測寬度(cm)', 'actual_width_cm', 'number')}{inp('實測高度(cm)', 'actual_height_cm', 'number')}
              {inp('正式報價', 'official_price', 'number')}
              <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>原始報價</label><div style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', fontSize: 14, color: 'var(--text-muted)' }}>{fmtPrice(form.quoted_price)}</div></div>
              <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}><label style={{ fontSize: 12 }}>報價備註</label><textarea value={form.official_note || ''} onChange={e => setForm(f => ({ ...f, official_note: e.target.value }))} className="search-box" style={{ padding: '8px 12px', fontSize: 13, minHeight: 60, resize: 'vertical', minWidth: 0 }} /></div>
              {saveBtn('儲存丈量/報價', () => saveTab({ measure_date: form.measure_date || null, measure_staff: form.measure_staff, actual_width_cm: Number(form.actual_width_cm) || null, actual_height_cm: Number(form.actual_height_cm) || null, official_price: Number(form.official_price) || null, official_note: form.official_note }))}
            </div>
          )}
          {tab === 'finance' && (
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {inp('丈量費', 'measure_fee', 'number')}{inp('丈量付訖日', 'measure_fee_paid_at', 'date')}
              {inp('訂金50%', 'deposit_50', 'number')}{inp('訂金付訖日', 'deposit_50_paid_at', 'date')}
              {inp('尾款', 'balance', 'number')}{inp('尾款付訖日', 'balance_paid_at', 'date')}
              {inp('總價(含稅)', 'total_with_tax', 'number')}{inp('付清日', 'paid_complete_at', 'date')}
              <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}><label style={{ fontSize: 12 }}>發票號碼</label><input value={form.invoice_no || ''} onChange={e => setForm(f => ({ ...f, invoice_no: e.target.value }))} className="search-box" style={{ padding: '8px 12px', fontSize: 13, minWidth: 0 }} /></div>
              {saveBtn('儲存財務', () => saveTab({ measure_fee: Number(form.measure_fee) || 0, measure_fee_paid_at: form.measure_fee_paid_at || null, deposit_50: Number(form.deposit_50) || null, deposit_50_paid_at: form.deposit_50_paid_at || null, balance: Number(form.balance) || null, balance_paid_at: form.balance_paid_at || null, total_with_tax: Number(form.total_with_tax) || null, paid_complete_at: form.paid_complete_at || null, invoice_no: form.invoice_no || null }))}
              {payments.length > 0 && <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>付款紀錄</div>
                {payments.map(p => <div key={p.id} style={{ fontSize: 12, padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}><span>{p.payment_type} — {p.payment_method || ''}</span><span style={{ color: 'var(--gold)', fontWeight: 600 }}>{fmtPrice(p.amount)}</span></div>)}
              </div>}
            </div>
          )}
          {tab === 'progress' && (
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {inp('下單日', 'order_date', 'date')}{inp('簽約月', 'contract_month')}
              {inp('站框日期', 'frame_date', 'date')}{inp('預計到倉', 'estimated_arrival', 'date')}
              {inp('實際到倉', 'actual_arrival', 'date')}{inp('安裝日期', 'install_date', 'date')}
              {inp('維修日期', 'repair_date', 'date')}
              {saveBtn('儲存進度', () => saveTab({ order_date: form.order_date || null, contract_month: form.contract_month, frame_date: form.frame_date || null, estimated_arrival: form.estimated_arrival || null, actual_arrival: form.actual_arrival || null, install_date: form.install_date || null, repair_date: form.repair_date || null }))}
            </div>
          )}
          {tab === 'factory' && (
            <div>
              {productions.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>尚無工廠訂單</div> :
                productions.map(p => (
                  <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 10, overflow: 'hidden' }}>
                    <div style={{ background: 'var(--dark)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 13, color: 'var(--gold)' }}>{p.factory_code} {p.production_order_no}</strong>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.production_status}</span>
                    </div>
                    <div style={{ padding: 12 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {[['下單', p.confirmed_order], ['精雕', p.engraving_status], ['油漆', p.paint_status], ['裝配', p.assembly_status], ['驗收', p.inspection_status]].map(([l, v]) => (
                          <span key={l} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, background: v ? 'rgba(16,185,129,.15)' : 'var(--surface-high)', color: v ? '#10b981' : 'var(--text-muted)' }}>{l}{v ? ' ✔' : ''}</span>
                        ))}
                      </div>
                      {p.production_note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>備註: {p.production_note}</div>}
                      {p.workshop_shipment && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>出貨: {fmtDate(p.workshop_shipment)}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={async () => {
                          const note = prompt('備註:', p.production_note || '');
                          const status = prompt('狀態 (pending/confirmed/engraving/painting/assembly/inspection/shipped/installed):', p.production_status || 'pending');
                          if (status === null) return;
                          await sbFetch(`production?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ production_note: note, production_status: status, updated_at: new Date().toISOString() }) });
                          toast('已更新', 'success');
                          sbFetch(`production?case_id=eq.${modal.data.id}&order=created_at.desc`).then(r => setProductions(r || []));
                        }}>編輯</button>
                        <button className="btn btn-danger btn-sm" onClick={async () => {
                          if (!window.confirm('確定刪除？')) return;
                          await sbFetch(`production?id=eq.${p.id}`, { method: 'DELETE' });
                          toast('已刪除', 'success');
                          sbFetch(`production?case_id=eq.${modal.data.id}&order=created_at.desc`).then(r => setProductions(r || []));
                        }}>刪除</button>
                      </div>
                    </div>
                  </div>
                ))}
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 10, borderColor: 'var(--gold)', color: 'var(--gold)' }}
                onClick={async () => { const code = prompt('工廠代號 (ZY/TW/MF):') || 'ZY'; const no = prompt('訂單編號:') || ''; await sbFetch('production', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ case_id: modal.data.id, case_no: form.case_no, factory_code: code.toUpperCase(), production_order_no: no, production_status: 'pending', order_person: user?.display_name || '' }) }); toast('已新增', 'success'); sbFetch(`production?case_id=eq.${modal.data.id}&order=created_at.desc`).then(p => setProductions(p || [])); }}>+ 新增工廠訂單</button>
            </div>
          )}
          {tab === 'status' && (
            <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>備註</label><textarea value={form.note || ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="search-box" style={{ padding: '8px 12px', fontSize: 13, minHeight: 70, resize: 'vertical', minWidth: 0 }} /></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ margin: 0, flex: 1 }}><label style={{ fontSize: 12 }}>狀態</label><select value={form.status || 'new'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{CASE_STEPS.map(s => <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>)}<option value="cancelled">已取消</option></select></div>
                <button className="btn btn-primary" disabled={saving} onClick={() => saveTab({ status: form.status, note: form.note })}>{saving ? '儲存中...' : '儲存'}</button>
              </div>
            </div>
          )}
        </>}
      </Modal>
    </div>
  );
}

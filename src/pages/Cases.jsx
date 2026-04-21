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

const CTYPE_OPTIONS = [['','選擇'],['S','股東'],['C','直客'],['D','設計師'],['D1','D1(20堂+)'],['D2','D2(60堂+)'],['A','代理商'],['B','建商'],['CC','商會'],['DD','經銷商'],['E','員工'],['G','公機關'],['V','VIP'],['Z','親友'],['X','公司']];
const SS_KEY = 'cases_filters_v1';
// 「進階」狀態 — 已進入後續流程，不可隨意刪除
const ADVANCED_STATUSES = ['order_confirmed', 'deposit_paid', 'production', 'shipped', 'arrived', 'installed', 'completed'];

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
  const [form, setForm] = useState({});
  const [initialForm, setInitialForm] = useState({});
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
    setModal({ open: true, data: c });
    activeCaseRef.current = c.id;
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

  // ── 下游資料檢查（回傳問題清單，空陣列 = 可刪） ──
  async function checkDownstream(c) {
    const issues = [];
    try {
      const pays = await sbFetch(`payments?case_id=eq.${c.id}&select=id&limit=1`);
      if (pays?.length > 0) issues.push('已有收款紀錄（請到「收款追蹤」清除）');
    } catch {}
    if (ADVANCED_STATUSES.includes(c.status)) issues.push(`案件狀態為「${CASE_STATUS_LABEL[c.status] || c.status}」`);
    if (c.sales_order_date) issues.push('業務已下單給內勤');
    if (c.internal_order_date) issues.push('內勤已下單給工廠');
    if (Array.isArray(c.case_files) && c.case_files.length > 0) issues.push(`已上傳 ${c.case_files.length} 個附件`);
    return issues;
  }

  async function deleteCase() {
    if (!user?.isAdmin) { toast('僅管理員可刪除案件', 'error'); return; }
    const c = modal.data;
    const issues = await checkDownstream(c);
    if (issues.length > 0) {
      toast(`此案件無法刪除：\n${issues.map((x, i) => `${i + 1}. ${x}`).join('\n')}`, 'error');
      return;
    }
    confirm('確定刪除案件？', `${c.order_no || c.case_no} (${c.customer_name || '—'}) 將永久刪除，此動作無法復原。\n\n相關估價單的 case_id 會被清除。`, async () => {
      try {
        await sbFetch(`quotes?case_id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ case_id: null }) }).catch(() => {});
        await sbFetch(`cases?id=eq.${c.id}`, { method: 'DELETE' });
        toast('已刪除', 'success');
        setModal({ open: false, data: null });
        load();
      } catch (e) {
        if (String(e.message).includes('foreign key') || String(e.message).includes('violates')) {
          toast('刪除失敗：此案件仍被其他資料引用', 'error');
        } else {
          toast('刪除失敗：' + e.message, 'error');
        }
      }
    });
  }

  // ── 批量刪除 ──
  async function bulkDelete() {
    if (!user?.isAdmin) { toast('僅管理員可批量刪除', 'error'); return; }
    if (selected.size === 0) return;
    const allSelected = rows.filter(r => selected.has(r.id));
    const blocked = [];
    const deletable = [];
    for (const c of allSelected) {
      const issues = await checkDownstream(c);
      if (issues.length > 0) blocked.push({ c, issues });
      else deletable.push(c);
    }
    if (deletable.length === 0) {
      toast(`選取的 ${allSelected.length} 筆全部有下游資料，無法刪除`, 'error');
      return;
    }
    const blockedNote = blocked.length > 0
      ? `\n\n⚠ 其中 ${blocked.length} 筆有下游資料會跳過：\n${blocked.slice(0, 3).map(b => `${b.c.order_no || b.c.case_no}：${b.issues[0]}`).join('\n')}${blocked.length > 3 ? `\n...另 ${blocked.length - 3} 筆` : ''}`
      : '';
    confirm(`批量刪除 ${deletable.length} 筆案件？`, `將永久刪除 ${deletable.length} 筆，無法復原。${blockedNote}`, async () => {
      let okCount = 0, failCount = 0;
      const failures = [];
      for (const c of deletable) {
        try {
          await sbFetch(`quotes?case_id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ case_id: null }) }).catch(() => {});
          await sbFetch(`cases?id=eq.${c.id}`, { method: 'DELETE' });
          okCount++;
        } catch (e) {
          failCount++;
          failures.push(c.order_no || c.case_no || c.id);
        }
      }
      if (failCount === 0) {
        toast(`已刪除 ${okCount} 筆${blocked.length > 0 ? `（跳過 ${blocked.length} 筆有下游資料）` : ''}`, 'success');
      } else {
        toast(`成功 ${okCount} 筆，失敗 ${failCount} 筆 (${failures.slice(0, 3).join(', ')})`, failCount === deletable.length ? 'error' : 'warning');
      }
      setSelected(new Set());
      load();
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
          {user?.isAdmin && (
            <>
              <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,.15)' }} />
              <button className="btn btn-danger btn-sm" onClick={bulkDelete} title="批量刪除（會檢查下游資料）">🗑 批量刪除</button>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>取消選取</button>
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
                  <td onClick={() => openCase(c)}><strong style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gold)' }}>{c.order_no || c.case_no || '—'}</strong></td>
                  <td onClick={() => openCase(c)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontWeight: 600 }}>{c.customer_name || '—'}</strong>
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
        footer={<><button className="btn btn-ghost" onClick={tryClose}>關閉</button>{user?.isAdmin && <button className="btn btn-danger" onClick={deleteCase}>🗑 刪除</button>}</>}>
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
          {/* Section: 客戶資料 */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>客戶資料</div>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {inp('客戶名稱', 'customer_name', 'text', true)}{inp('電話', 'customer_phone')}
            {inp('聯繫人', 'contact_person')}{inp('Email', 'customer_email', 'email')}
            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>客戶型態</label><select value={form.customer_type || ''} onChange={e => setForm(f => ({ ...f, customer_type: e.target.value }))} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' }}>{CTYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            {inp('業務', 'sales_person')}
            <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}><label style={{ fontSize: 12 }}>案場地址</label><input value={form.case_address || ''} onChange={e => setForm(f => ({ ...f, case_address: e.target.value }))} className="search-box" style={{ padding: '8px 12px', fontSize: 13, minWidth: 0 }} /></div>
            {saveBtn('儲存客戶資訊', () => saveTab({ customer_name: form.customer_name, customer_phone: form.customer_phone, contact_person: form.contact_person, customer_email: form.customer_email, customer_type: form.customer_type, sales_person: form.sales_person, case_address: form.case_address }))}
          </div>

          {/* Section: 報價單資訊 */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>報價單資訊</div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {inp('產品編號', 'product_code')}
              <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>門型</label><div style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text)' }}>{DOOR_TYPE_LABEL[form.door_type] || form.door_type || '—'}</div></div>
              {inp('數量', 'quantity', 'number')}
              <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>總價</label><div style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', fontSize: 14, color: 'var(--gold)', fontWeight: 700 }}>{fmtPrice(form.total_with_tax || form.official_price || form.quoted_price)}</div></div>
              {inp('正式報價單號', 'formal_quote_no')}
              <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>原始報價</label><div style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text-muted)' }}>{fmtPrice(form.quoted_price)}</div></div>
              {form.addon_items && (
                <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12 }}>附加項目明細</label>
                  <div style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{form.addon_items}</div>
                </div>
              )}
              {form.official_note && (
                <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12 }}>報價備註</label>
                  <div style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{form.official_note}</div>
                </div>
              )}
            </div>
          </div>
        </>}
      </Modal>
    </div>
  );
}

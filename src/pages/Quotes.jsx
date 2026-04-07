import { useState, useEffect, useCallback } from 'react';
import { sbFetch, proxyCount } from '../api/supabase';
import { fmtDate, fmtPrice, DOOR_TYPE_LABEL, PAGE_SIZE } from '../api/utils';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/UI/Modal';
import StatCard from '../components/UI/StatCard';
import { useNavigate } from 'react-router-dom';

const STATUS_MAP = { draft: ['草稿', '#94a3b8', '#f1f5f9'], sent: ['已送出', '#3b82f6', '#eff6ff'], confirmed: ['已確認', '#22c55e', '#f0fdf4'], cancelled: ['已取消', '#ef4444', '#fef2f2'] };

const TW_DISTRICTS_URL = 'https://raw.githubusercontent.com/donma/TaiwanAddressCityAreaRoadChineseEnglishJSON/master/CityCountyData.json';

export default function Quotes() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, month: 0, confirmed: 0 });
  const [modal, setModal] = useState({ open: false, data: null });
  const [measureFee, setMeasureFee] = useState(500);
  const [measureMethod, setMeasureMethod] = useState('transfer');
  const [twDistricts, setTwDistricts] = useState({});

  // Editable customer fields
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editDist, setEditDist] = useState('');
  const [editAddr, setEditAddr] = useState('');

  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const navigate = useNavigate();
  const debouncedSearch = useDebounce(search);

  // Load TW districts
  useEffect(() => {
    fetch(TW_DISTRICTS_URL)
      .then(r => r.json())
      .then(data => {
        const map = {};
        data.forEach(c => { map[c.CityName] = c.AreaList.map(a => a.AreaName); });
        setTwDistricts(map);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let path = 'quotes?select=*&order=created_at.desc';
    if (debouncedSearch) path += `&or=(quote_no.ilike.*${encodeURIComponent(debouncedSearch)}*,customer_name.ilike.*${encodeURIComponent(debouncedSearch)}*)`;
    if (statusFilter) path += `&status=eq.${statusFilter}`;
    try {
      setTotal(await proxyCount(path.replace('select=*', 'select=id')));
      setRows(await sbFetch(path + `&offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`) || []);
      const all = await proxyCount('quotes?select=id');
      const month = new Date().toISOString().slice(0, 7);
      const mo = await proxyCount(`quotes?select=id&created_at=gte.${month}-01`);
      const conf = await proxyCount('quotes?select=id&status=eq.confirmed');
      setStats({ total: all, month: mo, confirmed: conf });
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }, [debouncedSearch, statusFilter, page, toast]);

  useEffect(() => { load(); }, [load]);

  function openDetail(q) {
    setModal({ open: true, data: q });
    setEditName(q.customer_name || '');
    setEditPhone(q.customer_phone || '');
    // Parse address into city/district/rest
    const fullAddr = q.customer_addr || '';
    let city = '', dist = '', rest = fullAddr;
    for (const c of Object.keys(twDistricts)) {
      if (fullAddr.startsWith(c)) { city = c; rest = fullAddr.slice(c.length); break; }
    }
    if (city) {
      for (const d of (twDistricts[city] || [])) {
        if (rest.startsWith(d)) { dist = d; rest = rest.slice(d.length); break; }
      }
    }
    setEditCity(city);
    setEditDist(dist);
    setEditAddr(rest);
  }

  async function saveStatus(status) {
    try {
      await sbFetch(`quotes?id=eq.${modal.data.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast('狀態已更新', 'success');
      setModal({ open: false, data: null });
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function saveQuoteCustomer() {
    if (!modal.data) return;
    const fullAddress = [editCity, editDist, editAddr].filter(Boolean).join('') || null;
    const body = {
      customer_name: editName || null,
      customer_phone: editPhone || null,
      customer_addr: fullAddress,
    };
    try {
      await sbFetch(`quotes?id=eq.${modal.data.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('客戶資料已更新', 'success');
      load();
      // Update local modal data
      setModal(prev => ({ ...prev, data: { ...prev.data, ...body } }));
    } catch (e) { toast('儲存失敗: ' + e.message, 'error'); }
  }

  async function deleteQuote(q) {
    confirm('確認刪除？', `估價單 ${q.quote_no} 將永久刪除。`, async () => {
      try {
        await sbFetch(`quotes?id=eq.${q.id}`, { method: 'DELETE' });
        toast('已刪除', 'success');
        setModal({ open: false, data: null });
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function createCase(q) {
    const no = 'CS-' + new Date().toISOString().replace(/[-T:]/g, '').slice(0, 14);
    try {
      const res = await sbFetch('cases', {
        method: 'POST', headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ case_no: no, quote_id: q.id, quote_no: q.quote_no, customer_name: q.customer_name, customer_phone: q.customer_phone, customer_addr: q.customer_addr, product_code: q.product_code, door_type: q.door_type, quantity: q.quantity, quoted_price: q.total_price, status: 'new', created_by: user?.display_name || '' })
      });
      if (res?.[0]) await sbFetch(`quotes?id=eq.${q.id}`, { method: 'PATCH', body: JSON.stringify({ case_id: res[0].id }) });
      toast('案件已建立: ' + no, 'success');
      setModal({ open: false, data: null });
    } catch (e) { toast(e.message, 'error'); }
  }

  const q = modal.data || {};
  const [sLabel, sColor, sBg] = STATUS_MAP[q.status] || ['未知', '#94a3b8', '#f1f5f9'];
  const from = page * PAGE_SIZE + 1, to = Math.min(from + PAGE_SIZE - 1, total);

  const inputStyle = {
    padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%'
  };
  const selectStyle = { ...inputStyle };

  const renderRow = (label, value) => (
    <div style={{ display: 'flex', borderBottom: '1px solid rgba(77,70,53,0.06)', minHeight: 36 }}>
      <div style={{ width: 90, padding: '9px 12px', background: 'var(--bg)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{label}</div>
      <div style={{ padding: '9px 12px', fontSize: 13, flex: 1 }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">估價單</div><div className="page-subtitle">管理所有客戶報價單與確認狀態</div></div>
        <button className="btn btn-primary" onClick={() => navigate('/quotes/new')}>+ 新增估價單</button>
      </div>
      <div className="stats">
        <StatCard label="總筆數" value={stats.total} />
        <StatCard label="本月" value={stats.month} />
        <StatCard label="已確認" value={stats.confirmed} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['', '全部', stats.total], ['draft', '草稿'], ['sent', '已送出'], ['confirmed', '已確認', stats.confirmed, 'var(--success)'], ['cancelled', '已取消', undefined, 'var(--danger)']].map(([val, label, count, color]) => (
          <button key={val} onClick={() => { setStatusFilter(val); setPage(0); }} style={{
            padding: '5px 11px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
            border: `1px solid ${statusFilter === val ? 'var(--gold)' : 'var(--border)'}`,
            background: statusFilter === val ? 'var(--gold-dim)' : 'var(--surface-2)',
            color: statusFilter === val ? (color || 'var(--gold)') : 'var(--text-muted)',
            fontWeight: statusFilter === val ? 700 : 500
          }}>{label}{count !== undefined ? ` (${count})` : ''}</button>
        ))}
      </div>
      <div className="controls">
        <input className="search-box" placeholder="搜尋單號、客戶名稱..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <button className="btn btn-ghost" onClick={load}>↻</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>單號</th><th>客戶</th><th>電話</th><th>產品</th><th>門型</th><th>數量</th><th>總價</th><th>狀態</th><th>建立時間</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="9"><div className="loading"><div className="spinner" /><br />載入中...</div></td></tr>
            : rows.length === 0 ? <tr><td colSpan="9"><div className="empty"><div className="icon">📋</div>沒有估價單</div></td></tr>
            : rows.map(q => {
              const [sl, sc, sb] = STATUS_MAP[q.status] || STATUS_MAP.draft;
              return (
                <tr key={q.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(q)}>
                  <td><strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{q.quote_no || '—'}</strong></td>
                  <td>{q.customer_name || '—'}</td>
                  <td>{q.customer_phone || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{q.product_code || '—'}</td>
                  <td>{DOOR_TYPE_LABEL[q.door_type] || q.door_type || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{q.quantity || 1}</td>
                  <td className="price">{fmtPrice(q.total_price)}</td>
                  <td><span className="badge" style={{ background: sb, color: sc, border: `1px solid ${sc}40` }}>{sl}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(q.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>{total ? `${from}-${to} / ${total}` : ''}</span>
        <div className="page-btns">
          <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
          <button className="page-btn" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>›</button>
        </div>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, data: null })} title={`估價單 ${q.quote_no || ''}`} maxWidth={620}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setModal({ open: false, data: null })}>關閉</button>
          <button className="btn btn-ghost" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }} onClick={() => window.open(`${import.meta.env.VITE_N8N_BASE_URL}/webhook/quote-pdf?no=${encodeURIComponent(q.quote_no)}`, '_blank')}>PDF</button>
          <button className="btn btn-danger" onClick={() => deleteQuote(q)}>刪除</button>
        </>}>
        {modal.open && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span className="badge" style={{ background: sBg, color: sColor, border: `1px solid ${sColor}40` }}>{sLabel}</span>
            {q.created_by && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>建單：{q.created_by}</span>}
          </div>

          {/* Editable customer info */}
          <div style={{ border: '1px solid rgba(77,70,53,0.08)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ background: 'var(--dark)', padding: '8px 14px', fontSize: 10, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>客戶資料</span>
              <button className="btn btn-ghost btn-sm" onClick={saveQuoteCustomer} style={{ fontSize: 10, padding: '2px 8px', borderColor: 'var(--gold)', color: 'var(--gold)' }}>儲存客戶資料</button>
            </div>
            <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>姓名</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>電話</label>
                <input value={editPhone} onChange={e => setEditPhone(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>縣市</label>
                <select value={editCity} onChange={e => { setEditCity(e.target.value); setEditDist(''); }} style={selectStyle}>
                  <option value="">縣市</option>
                  {Object.keys(twDistricts).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>鄉鎮區</label>
                <select value={editDist} onChange={e => setEditDist(e.target.value)} style={selectStyle}>
                  <option value="">鄉鎮區</option>
                  {(twDistricts[editCity] || []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>地址</label>
                <input value={editAddr} onChange={e => setEditAddr(e.target.value)} placeholder="路/街/巷/弄/號/樓" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Product / pricing info */}
          <div style={{ border: '1px solid rgba(77,70,53,0.08)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 14 }}>
            {renderRow('產品', q.product_code || '—')}
            {renderRow('門型', DOOR_TYPE_LABEL[q.door_type] || '—')}
            {renderRow('尺寸', q.width_cm && q.height_cm ? `${q.width_cm} x ${q.height_cm} cm` : '—')}
            {renderRow('數量', q.quantity || 1)}
            {renderRow('單價', fmtPrice(q.unit_price))}
            {renderRow('加價', fmtPrice((q.oversize_charge || 0) + (q.elevator_charge || 0) + (q.addon_total || 0)))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#1a1a1a', borderRadius: 'var(--radius)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2 }}>總計金額</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>{fmtPrice(q.total_price)}</span>
          </div>
          {/* 狀態修改 */}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={q.status} onChange={e => saveStatus(e.target.value)} style={{ flex: 1, padding: '9px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
              <option value="draft">草稿</option><option value="sent">已送出</option><option value="confirmed">已確認</option><option value="cancelled">已取消</option>
            </select>
          </div>

          {/* 丈量費 / 建立案件 */}
          <div style={{ marginTop: 14, border: '1px solid rgba(77,70,53,0.08)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--dark)', padding: '9px 14px', fontSize: 10, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase' }}>丈量費 / 建立案件</div>
            <div style={{ padding: '12px 16px' }}>
              {q.case_id ? (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <span style={{ color: '#10b981', fontWeight: 700 }}>已建立案件</span>
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10, borderColor: 'var(--gold)', color: 'var(--gold)' }} onClick={() => { setModal({ open: false, data: null }); navigate('/cases'); }}>前往案件</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>丈量費金額</label><input type="number" value={measureFee} onChange={e => setMeasureFee(Number(e.target.value))} className="search-box" style={{ padding: '8px 12px', fontSize: 13, minWidth: 0 }} /></div>
                    <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>付款方式</label><select value={measureMethod} onChange={e => setMeasureMethod(e.target.value)} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' }}><option value="transfer">轉帳</option><option value="cash">現金</option><option value="card">刷卡</option></select></div>
                  </div>
                  <button className="btn btn-primary" style={{ marginTop: 12, width: '100%', background: '#10b981', borderColor: '#10b981' }} onClick={async () => {
                    const no = 'CS-' + new Date().toISOString().replace(/[-T:]/g, '').slice(0, 14);
                    try {
                      const res = await sbFetch('cases', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify({ case_no: no, quote_id: q.id, quote_no: q.quote_no, customer_name: q.customer_name, customer_phone: q.customer_phone, customer_addr: q.customer_addr, product_code: q.product_code, door_type: q.door_type, quantity: q.quantity, quoted_price: q.total_price, measure_fee: measureFee, status: 'new', created_by: user?.display_name || '' }) });
                      if (res?.[0] && measureFee > 0) {
                        await sbFetch('payments', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify({ case_id: res[0].id, case_no: no, payment_type: 'measurement', amount: measureFee, payment_method: measureMethod, note: '丈量費', recorded_by: user?.display_name || '' }) });
                      }
                      if (res?.[0]) await sbFetch(`quotes?id=eq.${q.id}`, { method: 'PATCH', body: JSON.stringify({ case_id: res[0].id }) });
                      toast('已收丈量費，案件已建立: ' + no, 'success');
                      setModal({ open: false, data: null }); navigate('/cases');
                    } catch (e) { toast(e.message, 'error'); }
                  }}>收取丈量費 - 建立案件</button>
                </>
              )}
            </div>
          </div>
        </>}
      </Modal>
    </div>
  );
}

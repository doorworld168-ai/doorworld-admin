import { useState, useEffect } from 'react';
import { sbFetch, proxyCount } from '../api/supabase';
import { fmtDate, fmtPrice, CASE_STATUS_LABEL, CASE_STATUS_COLOR, CTYPE_SHORT, PAGE_SIZE } from '../api/utils';
import { useToast } from '../components/UI/Toast';
import StatCard from '../components/UI/StatCard';
import { useNavigate } from 'react-router-dom';
import { printFormalQuote } from '../api/pdf';
import { exportFormalQuoteExcel } from '../api/excel';

export default function FormalQuote() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    let path = 'cases?select=*&order=created_at.desc';
    if (search) path += `&or=(case_no.ilike.*${encodeURIComponent(search)}*,customer_name.ilike.*${encodeURIComponent(search)}*,order_no.ilike.*${encodeURIComponent(search)}*)`;
    if (filter !== 'all') path += `&status=eq.${filter}`;
    try {
      setTotal(await proxyCount(path.replace('select=*', 'select=id')));
      setRows(await sbFetch(path + `&offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`) || []);
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [search, filter, page]);

  const from = page * PAGE_SIZE + 1, to = Math.min(from + PAGE_SIZE - 1, total);

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">報價單總表</div><div className="page-subtitle">所有正式報價單 — 追蹤報價 → 成案 → 付款 → 發包 → 完工</div></div>
        <button className="btn btn-primary" onClick={() => navigate('/formalquote/new')}>+ 新增報價單</button>
      </div>
      <div className="stats">
        <StatCard label="總數" value={total} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['all', '全部'], ['official_quoted', '已報價'], ['order_confirmed', '已下單'], ['deposit_paid', '已付訂', 'var(--success)'], ['production', '製作中', '#3b82f6'], ['shipped', '已出貨', '#f59e0b'], ['arrived', '已到倉'], ['installed', '已安裝', 'var(--success)'], ['completed', '已結案', 'var(--success)'], ['cancelled', '已取消', 'var(--danger)']].map(([val, label, color]) => (
          <button key={val} onClick={() => { setFilter(val); setPage(0); }} style={{
            padding: '5px 11px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
            border: `1px solid ${filter === val ? 'var(--gold)' : 'var(--border)'}`,
            background: filter === val ? 'var(--gold-dim)' : 'var(--surface-2)',
            color: filter === val ? (color || 'var(--gold)') : 'var(--text-muted)',
            fontWeight: filter === val ? 700 : 500
          }}>{label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input className="search-box" placeholder="搜尋單號、客戶..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} style={{ width: 250 }} />
        <button className="btn btn-ghost" onClick={load}>↻</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>訂單編號</th><th>客戶</th><th>型態</th><th>業務</th><th>報價金額</th><th>總價</th><th>狀態</th><th>建立</th><th style={{ width: 50 }}>PDF</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="9"><div className="loading"><div className="spinner" /><br />載入中...</div></td></tr>
            : rows.length === 0 ? <tr><td colSpan="9"><div className="empty"><div className="icon">📋</div>無資料</div></td></tr>
            : rows.map(c => {
              const st = CASE_STATUS_COLOR[c.status] || CASE_STATUS_COLOR.new;
              return (
                <tr key={c.id}>
                  <td><strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.order_no || c.case_no || '—'}</strong></td>
                  <td>{c.customer_name || '—'}</td>
                  <td style={{ fontSize: 11 }}>{CTYPE_SHORT[c.customer_type] || c.customer_type || '—'}</td>
                  <td style={{ fontSize: 12 }}>{c.sales_person || '—'}</td>
                  <td className="price">{fmtPrice(c.official_price || c.quoted_price)}</td>
                  <td className="price">{fmtPrice(c.total_with_tax)}</td>
                  <td><span className="badge" style={{ background: st.bg, color: st.color }}>{CASE_STATUS_LABEL[c.status] || c.status}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(c.created_at)}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => printFormalQuote(c)} title="列印報價單 PDF" style={{ background: 'transparent', border: '1px solid var(--gold)', borderRadius: 4, padding: '4px 9px', cursor: 'pointer', color: 'var(--gold)', fontSize: 11, fontWeight: 600 }}>PDF</button>
                    <button onClick={() => exportFormalQuoteExcel(c)} title="匯出報價單 Excel" style={{ background: 'transparent', border: '1px solid #22c55e', borderRadius: 4, padding: '4px 9px', cursor: 'pointer', color: '#22c55e', fontSize: 11, fontWeight: 600 }}>XLS</button>
                  </td>
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
    </div>
  );
}

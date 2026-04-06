import { useState, useEffect, useRef } from 'react';
import { sbFetch } from '../api/supabase';
import { fmtPrice, CTYPE_SHORT, downloadCSV } from '../api/utils';
import { useToast } from '../components/UI/Toast';
import StatCard from '../components/UI/StatCard';
import DateQuickFilter from '../components/UI/DateQuickFilter';
import Chart from 'chart.js/auto';

function getTotal(c) { return c.total_with_tax || c.official_price || c.quoted_price || 0; }
function getCollected(c) {
  let p = 0;
  if (c.measure_fee && c.measure_fee_paid_at) p += c.measure_fee;
  if (c.deposit_50 && c.deposit_50_paid_at) p += c.deposit_50;
  if (c.deposit_amount && c.deposit_paid_at && !c.deposit_50) p += c.deposit_amount;
  if (c.balance && c.balance_paid_at) p += c.balance;
  return p;
}
function getStatus(c) { const t = getTotal(c); if (!t) return 'none'; const p = getCollected(c); if (c.paid_complete_at || p >= t) return 'paid'; if (p > 0) return 'partial'; return 'outstanding'; }

export default function Finance() {
  const [cases, setCases] = useState([]);
  const [filter, setFilter] = useState('outstanding');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const charts = useRef({});
  const collRef = useRef(null), ctypeRef = useRef(null), monthRef = useRef(null);

  useEffect(() => { return () => { Object.values(charts.current).forEach(c => c.destroy()); charts.current = {}; }; }, []);

  async function load() {
    setLoading(true);
    try { setCases(await sbFetch('cases?select=*&status=not.eq.cancelled&order=created_at.desc&limit=500') || []); }
    catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { renderCharts(); }, [cases]);

  function renderCharts() {
    Object.values(charts.current).forEach(c => c.destroy());
    charts.current = {};
    let paid = 0, partial = 0, out = 0;
    cases.forEach(c => { const s = getStatus(c); if (s === 'paid') paid++; else if (s === 'partial') partial++; else if (s === 'outstanding') out++; });
    if (collRef.current) charts.current.coll = new Chart(collRef.current, { type: 'doughnut', data: { labels: ['已付清', '部分收', '未收款'], datasets: [{ data: [paid, partial, out], backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'], borderWidth: 0 }] }, options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#99907b', font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } } } } });

    const ctypeMap = {};
    cases.forEach(c => { const l = CTYPE_SHORT[c.customer_type] || c.customer_type || '未分類'; ctypeMap[l] = (ctypeMap[l] || 0) + getTotal(c); });
    const sorted = Object.entries(ctypeMap).sort((a, b) => b[1] - a[1]);
    if (ctypeRef.current) charts.current.ctype = new Chart(ctypeRef.current, { type: 'bar', data: { labels: sorted.map(s => s[0]), datasets: [{ data: sorted.map(s => s[1]), backgroundColor: 'rgba(201,162,39,0.5)', borderColor: '#c9a227', borderWidth: 1, borderRadius: 4, barThickness: 28 }] }, options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(77,70,53,0.15)' }, ticks: { color: '#99907b', callback: v => v >= 10000 ? (v / 10000).toFixed(0) + '萬' : v } }, y: { grid: { display: false }, ticks: { color: '#e5e2e1', font: { size: 12 } } } } } });

    const mp = {}, mo = {};
    cases.forEach(c => { const m = (c.created_at || '').slice(0, 7); if (!m) return; const t = getTotal(c), p = getCollected(c); mp[m] = (mp[m] || 0) + p; mo[m] = (mo[m] || 0) + Math.max(0, t - p); });
    const months = [...new Set([...Object.keys(mp), ...Object.keys(mo)])].sort().slice(-12);
    if (monthRef.current) charts.current.month = new Chart(monthRef.current, { type: 'bar', data: { labels: months.map(m => m.split('-')[1] + '月'), datasets: [{ label: '已收', data: months.map(m => mp[m] || 0), backgroundColor: 'rgba(34,197,94,0.5)', borderColor: '#22c55e', borderWidth: 1, borderRadius: 4 }, { label: '未收', data: months.map(m => mo[m] || 0), backgroundColor: 'rgba(239,68,68,0.3)', borderColor: '#ef4444', borderWidth: 1, borderRadius: 4 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#99907b', font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { color: '#99907b' } }, y: { stacked: true, grid: { color: 'rgba(77,70,53,0.12)' }, ticks: { color: '#99907b', callback: v => v >= 10000 ? (v / 10000).toFixed(0) + '萬' : v } } } } });
  }

  let totalRev = 0, collected = 0, outstanding = 0, mFees = 0;
  cases.forEach(c => { const t = getTotal(c), p = getCollected(c); totalRev += t; collected += p; outstanding += Math.max(0, t - p); if (c.measure_fee) mFees += c.measure_fee; });

  let list = cases.filter(c => getTotal(c) > 0);
  if (dateFrom) list = list.filter(c => (c.created_at || '') >= dateFrom);
  if (dateTo) list = list.filter(c => (c.created_at || '') <= dateTo + 'T23:59:59');
  if (filter === 'outstanding') list = list.filter(c => getStatus(c) !== 'paid');
  else if (filter === 'paid') list = list.filter(c => getStatus(c) === 'paid');
  else if (filter === 'partial') list = list.filter(c => getStatus(c) === 'partial');
  list.sort((a, b) => { const sa = getStatus(a) === 'outstanding' ? 0 : getStatus(a) === 'partial' ? 1 : 2; const sb2 = getStatus(b) === 'outstanding' ? 0 : getStatus(b) === 'partial' ? 1 : 2; return sa !== sb2 ? sa - sb2 : getTotal(b) - getTotal(a); });

  const statusBadge = s => s === 'paid' ? <span className="badge badge-active">已付清</span> : s === 'partial' ? <span className="badge" style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>部分收</span> : <span className="badge badge-inactive">未收</span>;

  return (
    <div>
      <div className="page-header"><div className="page-title-wrap"><div className="page-title">財務管理</div><div className="page-subtitle">應收帳款、收款紀錄與營收分析</div></div><button className="btn btn-primary" onClick={load}>↻ 更新</button></div>
      <div className="stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
        <StatCard label="總營收" value={fmtPrice(totalRev)} /><StatCard label="已收款" value={fmtPrice(collected)} color="var(--success)" /><StatCard label="未收款" value={fmtPrice(outstanding)} color="var(--danger)" /><StatCard label="丈量費" value={fmtPrice(mFees)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }} id="fin-charts-row">
        <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 20 }}><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>收款狀態</div><div style={{ maxWidth: 240, margin: '0 auto' }}><canvas ref={collRef} /></div></div>
        <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 20 }}><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>客戶型態營收</div><canvas ref={ctypeRef} style={{ maxHeight: 220 }} /></div>
      </div>
      <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 24 }}><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>月度已收 vs 未收</div><canvas ref={monthRef} style={{ maxHeight: 240 }} /></div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700 }}>應收帳款</div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '7px 32px 7px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
          <option value="outstanding">未收清</option><option value="all">全部</option><option value="paid">已付清</option><option value="partial">部分收</option>
        </select>
        <DateQuickFilter
          from={dateFrom} to={dateTo}
          activePreset={datePreset}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
          onPresetChange={k => setDatePreset(k)}
          compact
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>共 {list.length} 筆</span>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            if (!list.length) return toast('沒有資料可匯出', 'error');
            downloadCSV(
              ['訂單', '客戶', '總價', '已收', '未收', '狀態'],
              list.map(c => { const t = getTotal(c), p = getCollected(c); return [c.order_no || c.case_no || '', c.customer_name || '', t, p, Math.max(0, t - p), getStatus(c) === 'paid' ? '已付清' : getStatus(c) === 'partial' ? '部分收' : '未收']; }),
              `財務管理_${new Date().toISOString().slice(0, 10)}.csv`
            );
            toast('已下載 CSV', 'success');
          }} style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>下載 CSV</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>訂單</th><th>客戶</th><th>總價</th><th>已收</th><th>未收</th><th>狀態</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6"><div className="loading"><div className="spinner" /><br />載入中...</div></td></tr>
            : list.length === 0 ? <tr><td colSpan="6"><div className="empty"><div className="icon">✔</div>無資料</div></td></tr>
            : list.map(c => { const t = getTotal(c), p = getCollected(c), owed = Math.max(0, t - p); return (
              <tr key={c.id}>
                <td><strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.order_no || c.case_no || '—'}</strong></td>
                <td>{c.customer_name || '—'}</td>
                <td className="price">{fmtPrice(t)}</td>
                <td style={{ color: 'var(--success)', fontWeight: 600 }}>{fmtPrice(p || null)}</td>
                <td style={{ color: owed > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>{fmtPrice(owed || null)}</td>
                <td>{statusBadge(getStatus(c))}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

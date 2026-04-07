import { useState, useEffect, useRef } from 'react';
import { sbFetch } from '../api/supabase';
import { fmtPrice, CTYPE_SHORT, DOOR_TYPE_LABEL, downloadCSV } from '../api/utils';
import { printFormalQuote } from '../api/pdf';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import Modal from '../components/UI/Modal';
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
  const [payModal, setPayModal] = useState({ open: false, data: null });
  const [payForm, setPayForm] = useState({});
  const toast = useToast();
  const confirm = useConfirm();
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

  function openPayModal(c) {
    setPayForm({
      measure_fee: c.measure_fee || '',
      measure_fee_paid_at: c.measure_fee_paid_at ? c.measure_fee_paid_at.slice(0, 10) : '',
      deposit_50: c.deposit_50 || '',
      deposit_50_paid_at: c.deposit_50_paid_at ? c.deposit_50_paid_at.slice(0, 10) : '',
      balance: c.balance || '',
      balance_paid_at: c.balance_paid_at ? c.balance_paid_at.slice(0, 10) : '',
    });
    setPayModal({ open: true, data: c });
  }

  async function savePayment() {
    if (!payModal.data) return;
    const body = { updated_at: new Date().toISOString() };
    body.measure_fee = payForm.measure_fee ? Number(payForm.measure_fee) : null;
    body.measure_fee_paid_at = payForm.measure_fee_paid_at || null;
    body.deposit_50 = payForm.deposit_50 ? Number(payForm.deposit_50) : null;
    body.deposit_50_paid_at = payForm.deposit_50_paid_at || null;
    body.balance = payForm.balance ? Number(payForm.balance) : null;
    body.balance_paid_at = payForm.balance_paid_at || null;
    // Auto mark paid_complete if all paid
    const t = getTotal(payModal.data);
    let p = 0;
    if (body.measure_fee && body.measure_fee_paid_at) p += body.measure_fee;
    if (body.deposit_50 && body.deposit_50_paid_at) p += body.deposit_50;
    if (body.balance && body.balance_paid_at) p += body.balance;
    if (t > 0 && p >= t) body.paid_complete_at = new Date().toISOString();
    else body.paid_complete_at = null;
    try {
      await sbFetch(`cases?id=eq.${payModal.data.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('收款紀錄已更新', 'success');
      setPayModal({ open: false, data: null });
      load();
    } catch (e) { toast('儲存失敗: ' + e.message, 'error'); }
  }

  const inpS = { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' };
  const pm = payModal.data || {};

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
          <thead><tr><th>訂單</th><th>客戶</th><th>電話</th><th>總價</th><th>丈量費</th><th>訂金 50%</th><th>尾款</th><th>未收</th><th>狀態</th><th>操作</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="10"><div className="loading"><div className="spinner" /><br />載入中...</div></td></tr>
            : list.length === 0 ? <tr><td colSpan="10"><div className="empty"><div className="icon">✔</div>無資料</div></td></tr>
            : list.map(c => { const t = getTotal(c), p = getCollected(c), owed = Math.max(0, t - p); return (
              <tr key={c.id}>
                <td><strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.formal_quote_no || c.order_no || c.case_no || '—'}</strong></td>
                <td>{c.customer_name || '—'}</td>
                <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{c.customer_phone ? <a href={`tel:${c.customer_phone}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>{c.customer_phone}</a> : '—'}</td>
                <td className="price">{fmtPrice(t)}</td>
                <td style={{ fontSize: 11 }}>{c.measure_fee_paid_at ? <span style={{ color: 'var(--success)' }}>{fmtPrice(c.measure_fee)} ✓</span> : c.measure_fee ? <span style={{ color: 'var(--text-muted)' }}>{fmtPrice(c.measure_fee)}</span> : '—'}</td>
                <td style={{ fontSize: 11 }}>{c.deposit_50_paid_at ? <span style={{ color: 'var(--success)' }}>{fmtPrice(c.deposit_50)} ✓</span> : c.deposit_50 ? <span style={{ color: 'var(--text-muted)' }}>{fmtPrice(c.deposit_50)}</span> : '—'}</td>
                <td style={{ fontSize: 11 }}>{c.balance_paid_at ? <span style={{ color: 'var(--success)' }}>{fmtPrice(c.balance)} ✓</span> : c.balance ? <span style={{ color: 'var(--danger)' }}>{fmtPrice(c.balance)}</span> : '—'}</td>
                <td style={{ color: owed > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>{fmtPrice(owed || null)}</td>
                <td>{statusBadge(getStatus(c))}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openPayModal(c)} style={{ fontSize: 10, borderColor: 'var(--gold)', color: 'var(--gold)' }}>收款</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => printFormalQuote(c)} style={{ fontSize: 10 }}>PDF</button>
                  </div>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>

      {/* Payment Modal */}
      <Modal open={payModal.open} onClose={() => setPayModal({ open: false, data: null })} title={`收款管理 — ${pm.formal_quote_no || pm.order_no || pm.case_no || ''}`} maxWidth={560}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setPayModal({ open: false, data: null })}>取消</button>
          <button className="btn btn-primary" onClick={savePayment}>儲存</button>
        </>}>
        {payModal.open && <>
          {/* Customer info */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>客戶資訊</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            <div><strong style={{ color: 'var(--text)' }}>{pm.customer_name || '—'}</strong></div>
            <div>{pm.customer_phone ? <a href={`tel:${pm.customer_phone}`} style={{ color: 'var(--gold)', textDecoration: 'none' }}>{pm.customer_phone}</a> : '—'}</div>
            <div style={{ gridColumn: '1/-1' }}>{pm.case_address || pm.customer_addr || '—'}</div>
          </div>

          {/* Quote info */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>報價單資訊</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 12 }}>
            <div style={{ color: 'var(--text-muted)' }}>產品: <span style={{ color: 'var(--text)' }}>{pm.product_code || '—'}</span></div>
            <div style={{ color: 'var(--text-muted)' }}>門型: <span style={{ color: 'var(--text)' }}>{DOOR_TYPE_LABEL[pm.door_type] || pm.door_type || '—'}</span></div>
            <div style={{ color: 'var(--text-muted)' }}>數量: <span style={{ color: 'var(--text)' }}>{pm.quantity || '—'}</span></div>
            <div style={{ fontWeight: 700, color: 'var(--gold)', fontSize: 14 }}>總價: {fmtPrice(getTotal(pm))}</div>
            <div style={{ gridColumn: '1/-1' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => printFormalQuote(pm)} style={{ fontSize: 10, borderColor: 'var(--gold)', color: 'var(--gold)' }}>查看報價單 PDF</button>
            </div>
          </div>

          {/* Payment fields */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, borderTop: '1px solid var(--border)', paddingTop: 16 }}>收款紀錄</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Measure fee */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>丈量費</span>
              <input type="number" placeholder="金額" value={payForm.measure_fee} onChange={e => setPayForm(f => ({ ...f, measure_fee: e.target.value }))} style={inpS} />
              <input type="date" value={payForm.measure_fee_paid_at} onChange={e => setPayForm(f => ({ ...f, measure_fee_paid_at: e.target.value }))} style={inpS} />
            </div>
            {/* Deposit 50% */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>訂金 50%</span>
              <input type="number" placeholder="金額" value={payForm.deposit_50} onChange={e => setPayForm(f => ({ ...f, deposit_50: e.target.value }))} style={inpS} />
              <input type="date" value={payForm.deposit_50_paid_at} onChange={e => setPayForm(f => ({ ...f, deposit_50_paid_at: e.target.value }))} style={inpS} />
            </div>
            {/* Balance */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>尾款</span>
              <input type="number" placeholder="金額" value={payForm.balance} onChange={e => setPayForm(f => ({ ...f, balance: e.target.value }))} style={inpS} />
              <input type="date" value={payForm.balance_paid_at} onChange={e => setPayForm(f => ({ ...f, balance_paid_at: e.target.value }))} style={inpS} />
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>填入金額和收款日期後儲存。三筆收齊會自動標記為已付清。</div>
        </>}
      </Modal>
    </div>
  );
}

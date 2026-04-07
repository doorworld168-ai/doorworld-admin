import { useState, useEffect, useRef } from 'react';
import { sbFetch, proxyCount } from '../api/supabase';
import { fmtDate, fmtPrice, CASE_STATUS_LABEL, CASE_STATUS_COLOR, CASE_STEPS, CTYPE_SHORT, calcDelay } from '../api/utils';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/UI/Toast';
import StatCard from '../components/UI/StatCard';
import Chart from 'chart.js/auto';

function fmtD(d) { return d ? new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '—'; }

function addWorkDays(date, days) {
  const d = new Date(date); let added = 0;
  while (added < days) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) added++; }
  return d;
}

function ordCalcTimeline(c) {
  const depositDate = c.deposit_50_paid_at || c.order_confirmed_at;
  const salesDeadline = depositDate ? addWorkDays(depositDate, 3) : null;
  const salesOverdue = salesDeadline && !c.sales_order_date && new Date() > salesDeadline;
  const internalDeadline = c.sales_order_date ? addWorkDays(c.sales_order_date, 5) : null;
  const internalOverdue = internalDeadline && !c.internal_order_date && new Date() > internalDeadline;
  return { salesDeadline, salesOverdue, internalDeadline, internalOverdue };
}

// calcDelay imported from utils.js

export default function Dashboard() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('overview'); // overview | sales | internal
  const { user } = useAuth();
  const toast = useToast();
  const statusChartRef = useRef(null);
  const salesChartRef = useRef(null);
  const revenueChartRef = useRef(null);
  const charts = useRef({});

  useEffect(() => { loadData(); }, []);

  const chartTimer = useRef(null);
  useEffect(() => { return () => { clearTimeout(chartTimer.current); Object.values(charts.current).forEach(c => c.destroy()); charts.current = {}; }; }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await sbFetch('cases?select=*&status=not.in.(completed,cancelled)&order=created_at.desc&limit=200');
      setCases(data || []);
      clearTimeout(chartTimer.current);
      chartTimer.current = setTimeout(() => renderCharts(data || []), 100);
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }

  function renderCharts(data) {
    Object.values(charts.current).forEach(c => c.destroy());
    charts.current = {};
    if (statusChartRef.current) {
      const counts = {};
      data.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
      const statusColors = { new: '#c9a227', measure_scheduled: '#3b82f6', measured: '#10b981', official_quoted: '#8b5cf6', order_confirmed: '#f59e0b', deposit_paid: '#10b981', production: '#3b82f6', shipped: '#f59e0b', arrived: '#c9a227', installed: '#22c55e', completed: '#10b981', cancelled: '#ef4444' };
      charts.current.status = new Chart(statusChartRef.current, {
        type: 'doughnut',
        data: { labels: Object.keys(counts).map(k => CASE_STATUS_LABEL[k] || k), datasets: [{ data: Object.values(counts), backgroundColor: Object.keys(counts).map(k => statusColors[k] || '#666'), borderWidth: 0 }] },
        options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#99907b', font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', padding: 10 } } } }
      });
    }
    if (salesChartRef.current) {
      const salesMap = {};
      data.forEach(c => { const n = c.sales_person || '未指定'; salesMap[n] = (salesMap[n] || 0) + 1; });
      const sorted = Object.entries(salesMap).sort((a, b) => b[1] - a[1]);
      charts.current.sales = new Chart(salesChartRef.current, {
        type: 'bar',
        data: { labels: sorted.map(s => s[0]), datasets: [{ data: sorted.map(s => s[1]), backgroundColor: 'rgba(201,162,39,0.6)', borderColor: '#c9a227', borderWidth: 1, borderRadius: 4, barThickness: 28 }] },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(77,70,53,0.15)' }, ticks: { color: '#99907b' } }, y: { grid: { display: false }, ticks: { color: '#e5e2e1', font: { size: 12 } } } } }
      });
    }
    if (revenueChartRef.current) {
      sbFetch('cases?select=total_with_tax,official_price,quoted_price,created_at,status&order=created_at.asc&limit=500').then(all => {
        const monthMap = {};
        (all || []).forEach(c => {
          if (c.status === 'cancelled') return;
          const m = (c.created_at || '').slice(0, 7);
          if (!m) return;
          monthMap[m] = (monthMap[m] || 0) + (c.total_with_tax || c.official_price || c.quoted_price || 0);
        });
        const months = Object.keys(monthMap).sort().slice(-12);
        charts.current.revenue = new Chart(revenueChartRef.current, {
          type: 'bar',
          data: { labels: months.map(m => m.split('-')[1] + '月'), datasets: [{ data: months.map(m => monthMap[m]), backgroundColor: 'rgba(201,162,39,0.25)', borderColor: '#c9a227', borderWidth: 1.5, borderRadius: 6 }] },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#99907b' } }, y: { grid: { color: 'rgba(77,70,53,0.12)' }, ticks: { color: '#99907b', callback: v => v >= 10000 ? (v / 10000).toFixed(0) + '萬' : v } } } }
        });
      }).catch(err => toast(err.message, 'error'));
    }
  }

  // Pipeline status bar
  const pipelineStages = [
    { key: 'new', label: '新案件' },
    { key: 'measure_scheduled', label: '已排丈量' },
    { key: 'measured', label: '丈量完成' },
    { key: 'official_quoted', label: '已報價' },
    { key: 'order_confirmed', label: '已下單' },
    { key: 'deposit_paid', label: '訂金已付' },
    { key: 'production', label: '製作中' },
    { key: 'shipped', label: '已出貨' },
    { key: 'arrived', label: '已到倉' },
    { key: 'installed', label: '已安裝' }
  ];
  const stageCounts = {};
  pipelineStages.forEach(s => { stageCounts[s.key] = cases.filter(c => c.status === s.key).length; });
  const maxCount = Math.max(1, ...Object.values(stageCounts));

  // Sales dashboard
  const userName = user?.display_name || '';
  const myCases = cases.filter(c => c.sales_person === userName);
  const salesPending = myCases.filter(c => c.status === 'deposit_paid' && !c.sales_order_date);
  const salesInProgress = myCases.filter(c => ['production', 'shipped'].includes(c.status));
  const salesWaitInstall = myCases.filter(c => c.status === 'arrived' || c.status === 'installed');
  const salesOverdue = salesPending.filter(c => ordCalcTimeline(c).salesOverdue);

  // Internal dashboard
  const allActive = cases.filter(c => c.status !== 'completed');
  const ioWaitOrder = allActive.filter(c => c.sales_order_date && !c.internal_order_date);
  const ioOrdered = allActive.filter(c => !!c.internal_order_date);
  const ioInProduction = allActive.filter(c => c.status === 'production');
  const ioWaitTw = allActive.filter(c => c.is_fireproof && c.internal_order_date && !c.tw_secondary_done);
  const ioOverdue = ioWaitOrder.filter(c => ordCalcTimeline(c).internalOverdue);

  // Pre-compute delay once per case to avoid redundant calcDelay calls
  const delayMap = cases.map(c => ({ c, d: calcDelay(c) }));
  const stats = {
    active: cases.length,
    ontime: delayMap.filter(x => !x.d.delayed).length,
    delayed: delayMap.filter(x => x.d.delayed).length,
    pendingMeasure: cases.filter(c => ['new', 'measure_scheduled'].includes(c.status)).length,
    pendingInstall: cases.filter(c => ['shipped', 'arrived'].includes(c.status)).length,
  };

  const delayed = delayMap.filter(x => x.d.delayed).sort((a, b) => b.d.days - a.d.days).map(x => x.c);

  let filtered = cases.filter(c => c.status !== 'cancelled');
  if (filter === 'delayed') filtered = filtered.filter(c => calcDelay(c).delayed);
  else if (filter === 'measure') filtered = filtered.filter(c => ['new', 'measure_scheduled', 'measured', 'official_quoted'].includes(c.status));
  else if (filter === 'production') filtered = filtered.filter(c => ['order_confirmed', 'deposit_paid', 'production'].includes(c.status));
  else if (filter === 'shipping') filtered = filtered.filter(c => ['shipped', 'arrived'].includes(c.status));

  const tabBtn = (label, val) => (
    <button key={val} onClick={() => setTab(val)} style={{
      padding: '8px 16px', borderRadius: '8px 8px 0 0',
      border: `1px solid ${tab === val ? 'var(--gold)' : 'var(--border)'}`,
      borderBottom: tab === val ? '2px solid var(--gold)' : '1px solid var(--border)',
      background: tab === val ? 'var(--gold-dim)' : 'var(--surface-2)',
      color: tab === val ? 'var(--gold)' : 'var(--text-muted)',
      fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
      fontWeight: tab === val ? 700 : 500
    }}>{label}</button>
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap">
          <div className="page-title">儀表板</div>
          <div className="page-subtitle">案件進度追蹤與營運數據</div>
        </div>
        <button className="btn btn-primary" onClick={loadData}>↻ 更新數據</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
        {tabBtn('總覽', 'overview')}
        {tabBtn('業務看板', 'sales')}
        {tabBtn('內勤看板', 'internal')}
      </div>

      {tab === 'overview' && (
        <>
          <div className="stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', marginTop: 16 }}>
            <StatCard label="進行中" value={stats.active} />
            <StatCard label="正常" value={stats.ontime} color="var(--success)" />
            <StatCard label="延遲中" value={stats.delayed} color="var(--danger)" style={{ borderColor: 'rgba(239,68,68,.3)' }} />
            <StatCard label="待丈量" value={stats.pendingMeasure} />
            <StatCard label="待安裝" value={stats.pendingInstall} />
          </div>

          {/* Pipeline overview bar */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>案件流程分布</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
              {pipelineStages.map(s => {
                const count = stageCounts[s.key];
                const h = count ? Math.max(10, (count / maxCount) * 70) : 4;
                const sc = CASE_STATUS_COLOR[s.key] || { bg: 'var(--surface-high)', color: 'var(--text-muted)' };
                return (
                  <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sc.color }}>{count || ''}</span>
                    <div style={{ width: '100%', height: h, background: sc.color, borderRadius: 3, opacity: 0.7 }} />
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'center' }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {delayed.length > 0 ? (
            <div style={{ padding: '14px 18px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius)', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>⚠ {delayed.length} 件案件延遲中</div>
              {delayed.slice(0, 5).map(c => {
                const d = calcDelay(c);
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                    <span style={{ color: 'var(--danger)', fontWeight: 700, minWidth: 60 }}>延遲{d.days}天</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{c.order_no || c.case_no}</span>
                    <span>{c.customer_name || ''}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{d.milestone}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '14px 18px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 'var(--radius)', marginBottom: 20, color: '#10b981', fontSize: 13, fontWeight: 600 }}>
              所有案件進度正常，無延遲
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>案件狀態分布</div>
              <div style={{ maxWidth: 260, margin: '0 auto' }}><canvas ref={statusChartRef} /></div>
            </div>
            <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>業務人員案件數</div>
              <canvas ref={salesChartRef} style={{ maxHeight: 220 }} />
            </div>
          </div>
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>月度營收趨勢</div>
            <canvas ref={revenueChartRef} style={{ maxHeight: 240 }} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700 }}>案件進度追蹤</div>
            <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '7px 32px 7px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              <option value="all">全部進行中</option>
              <option value="delayed">僅延遲</option>
              <option value="measure">待丈量/報價</option>
              <option value="production">製作中</option>
              <option value="shipping">待到倉/安裝</option>
            </select>
          </div>

          {loading ? (
            <div className="loading"><div className="spinner" /><br />載入中...</div>
          ) : filtered.length === 0 ? (
            <div className="empty"><div className="icon">✔</div>無符合條件的案件</div>
          ) : (
            filtered.map(c => {
              const d = calcDelay(c);
              const st = CASE_STATUS_COLOR[c.status] || CASE_STATUS_COLOR.new;
              const pct = c.status === 'cancelled' ? 0 : Math.round((CASE_STEPS.indexOf(c.status) / (CASE_STEPS.length - 1)) * 100);
              const price = c.total_with_tax ? fmtPrice(c.total_with_tax) : c.official_price ? fmtPrice(c.official_price) : c.quoted_price ? fmtPrice(c.quoted_price) : '';
              const timeDots = [['丈量', c.measure_date], ['下單', c.order_date], ['到倉', c.actual_arrival || c.estimated_arrival], ['安裝', c.install_date]];
              return (
                <div key={c.id} style={{ border: `1px solid ${d.delayed ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: 'var(--radius)', marginBottom: 10, background: 'var(--surface-low)' }}>
                  <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.order_no || c.case_no || ''}</strong>
                    <span style={{ fontSize: 13 }}>{c.customer_name || ''}</span>
                    {c.sales_person && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.sales_person}</span>}
                    <span style={{ marginLeft: 'auto' }}><span className="badge" style={{ background: st.bg, color: st.color }}>{CASE_STATUS_LABEL[c.status] || c.status}</span></span>
                    {d.delayed && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>延遲{d.days}天 ({d.milestone})</span>}
                  </div>
                  <div style={{ padding: '0 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--surface-high)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: d.delayed ? 'var(--danger)' : 'var(--success)', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pct}%</span>
                  </div>
                  <div style={{ padding: '4px 16px 12px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {timeDots.map(([label, date]) => (
                      <div key={label} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: date ? '#10b981' : 'var(--surface-high)', border: `1px solid ${date ? '#10b981' : 'var(--text-muted)'}` }} />
                        <span style={{ color: date ? 'var(--text)' : 'var(--text-muted)' }}>{label}</span>
                        {date && <span style={{ color: 'var(--text-muted)' }}>{new Date(date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>}
                      </div>
                    ))}
                    {price && <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>{price}</div>}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {tab === 'sales' && (
        <>
          <div className="stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', marginTop: 16 }}>
            <StatCard label="我的案件" value={myCases.length} />
            <StatCard label="待下單給內勤" value={salesPending.length} color={salesPending.length ? 'var(--gold)' : undefined} />
            <StatCard label="生產中" value={salesInProgress.length} color="#3b82f6" />
            <StatCard label="待安裝" value={salesWaitInstall.length} color="var(--success)" />
            {salesOverdue.length > 0
              ? <StatCard label="逾期" value={salesOverdue.length} color="var(--danger)" style={{ borderColor: 'rgba(239,68,68,.3)' }} />
              : <StatCard label="已結案" value={myCases.filter(c => c.status === 'completed').length} />
            }
          </div>

          {/* Alert */}
          {salesOverdue.length > 0 ? (
            <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius)', marginBottom: 16, marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>⚠ {salesOverdue.length} 件超過 3 天未下單給內勤</div>
              {salesOverdue.map(c => (
                <div key={c.id} style={{ fontSize: 11, padding: '3px 0', display: 'flex', gap: 8 }}>
                  <span style={{ fontFamily: 'monospace' }}>{c.formal_quote_no || c.case_no}</span>
                  <span>{c.customer_name || ''}</span>
                  <span style={{ color: 'var(--gold)' }}>{fmtPrice(c.total_with_tax || 0)}</span>
                </div>
              ))}
            </div>
          ) : salesPending.length > 0 ? (
            <div style={{ padding: '12px 16px', background: 'rgba(236,194,70,.08)', border: '1px solid rgba(236,194,70,.2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--gold)', fontWeight: 600, marginBottom: 16, marginTop: 16 }}>
              有 {salesPending.length} 件待下單給內勤，請盡快處理
            </div>
          ) : (
            <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 'var(--radius)', color: '#10b981', fontSize: 12, fontWeight: 600, marginBottom: 16, marginTop: 16 }}>
              所有案件已下單，進度正常
            </div>
          )}

          {/* Case list */}
          {myCases.length === 0 ? <div className="empty"><div className="icon">✔</div>無案件</div> :
            myCases.map(c => {
              const d = calcDelay(c);
              const st = CASE_STATUS_COLOR[c.status] || CASE_STATUS_COLOR.new;
              const salesStatus = !c.sales_order_date ? <span style={{ color: 'var(--gold)', fontWeight: 600 }}>待下單給內勤</span>
                : !c.internal_order_date ? <span style={{ color: 'var(--text-muted)' }}>內勤處理中</span>
                : c.cn_status ? <span style={{ color: '#3b82f6' }}>{c.cn_status}</span>
                : <span style={{ color: 'var(--success)' }}>進行中</span>;
              return (
                <div key={c.id} style={{ border: `1px solid ${d.delayed ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: 'var(--radius)', marginBottom: 8, background: 'var(--surface-low)' }}>
                  <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <strong style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gold)' }}>{c.formal_quote_no || c.order_no || c.case_no || ''}</strong>
                    <span style={{ fontWeight: 600 }}>{c.customer_name || '—'}</span>
                    <span className="badge" style={{ background: st.bg, color: st.color, fontSize: 10 }}>{CASE_STATUS_LABEL[c.status] || c.status}</span>
                    {d.delayed && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>延遲{d.days}天</span>}
                    {c.total_with_tax && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gold)', fontWeight: 700 }}>{fmtPrice(c.total_with_tax)}</span>}
                  </div>
                  <div style={{ padding: '4px 16px 10px', fontSize: 11, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    {salesStatus}
                    {c.estimated_arrival && <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>預計到倉 {fmtD(c.estimated_arrival)}</span>}
                    {c.is_fireproof && <span style={{ marginLeft: 8, fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(239,68,68,.1)', color: 'var(--danger)' }}>防火</span>}
                  </div>
                </div>
              );
            })
          }
        </>
      )}

      {tab === 'internal' && (
        <>
          <div className="stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', marginTop: 16 }}>
            <StatCard label="待內勤下單" value={ioWaitOrder.length} color={ioWaitOrder.length ? 'var(--gold)' : undefined} />
            <StatCard label="已下單廠商" value={ioOrdered.length} color="var(--success)" />
            <StatCard label="生產中" value={ioInProduction.length} color="#3b82f6" />
            <StatCard label="待台廠加工" value={ioWaitTw.length} color="#ec4899" />
            {ioOverdue.length > 0 && <StatCard label="逾期" value={ioOverdue.length} color="var(--danger)" style={{ borderColor: 'rgba(239,68,68,.3)' }} />}
          </div>

          {ioOverdue.length > 0 ? (
            <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius)', marginBottom: 16, marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>⚠ {ioOverdue.length} 件超過 5 天未下單給廠商</div>
              {ioOverdue.map(c => (
                <div key={c.id} style={{ fontSize: 11, padding: '3px 0', display: 'flex', gap: 8 }}>
                  <span style={{ fontFamily: 'monospace' }}>{c.formal_quote_no || c.case_no}</span>
                  <span>{c.customer_name || ''}</span>
                </div>
              ))}
            </div>
          ) : ioWaitOrder.length > 0 ? (
            <div style={{ padding: '12px 16px', background: 'rgba(236,194,70,.08)', border: '1px solid rgba(236,194,70,.2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--gold)', fontWeight: 600, marginBottom: 16, marginTop: 16 }}>
              有 {ioWaitOrder.length} 件業務已下單，請盡快下單給廠商
            </div>
          ) : (
            <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 'var(--radius)', color: '#10b981', fontSize: 12, fontWeight: 600, marginBottom: 16, marginTop: 16 }}>
              所有案件已下單給廠商，進度正常
            </div>
          )}

          {allActive.length === 0 ? <div className="empty"><div className="icon">✔</div>無案件</div> :
            allActive.map(c => {
              const d = calcDelay(c);
              const st = CASE_STATUS_COLOR[c.status] || CASE_STATUS_COLOR.new;
              const ioStatus = !c.sales_order_date ? <span style={{ color: 'var(--text-muted)' }}>業務尚未下單</span>
                : !c.internal_order_date ? <span style={{ color: 'var(--gold)', fontWeight: 600 }}>待下單給廠商</span>
                : c.cn_status ? <span style={{ color: '#3b82f6' }}>廠商: {c.cn_status}</span>
                : <span style={{ color: 'var(--success)' }}>已下單</span>;
              return (
                <div key={c.id} style={{ border: `1px solid ${d.delayed ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: 'var(--radius)', marginBottom: 8, background: 'var(--surface-low)' }}>
                  <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <strong style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gold)' }}>{c.formal_quote_no || c.order_no || c.case_no || ''}</strong>
                    <span style={{ fontWeight: 600 }}>{c.customer_name || '—'}</span>
                    <span className="badge" style={{ background: st.bg, color: st.color, fontSize: 10 }}>{CASE_STATUS_LABEL[c.status] || c.status}</span>
                    {d.delayed && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>延遲{d.days}天</span>}
                  </div>
                  <div style={{ padding: '4px 16px 10px', fontSize: 11, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    {ioStatus}
                    {c.factory_type && <span style={{ marginLeft: 12 }}>{c.factory_type === 'tw' ? '台廠' : '陸廠'}</span>}
                    {c.estimated_arrival && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>到倉 {fmtD(c.estimated_arrival)}</span>}
                    {c.is_fireproof && !c.tw_secondary_done && <span style={{ marginLeft: 8, fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(236,72,153,.1)', color: '#ec4899' }}>需台廠加工</span>}
                  </div>
                </div>
              );
            })
          }
        </>
      )}
    </div>
  );
}

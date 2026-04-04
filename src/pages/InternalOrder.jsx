import { useState, useEffect } from 'react';
import { sbFetch } from '../api/supabase';
import { fmtDate, fmtPrice, CASE_STATUS_LABEL, DOOR_TYPE_LABEL } from '../api/utils';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import { useAuth } from '../contexts/AuthContext';
import StatCard from '../components/UI/StatCard';

const PROC_TYPES = [
  { value: 'plain', label: '純板', days: 0 },
  { value: 'emboss', label: '壓花', days: 15 },
  { value: 'etch', label: '蝕刻', days: 15 },
  { value: 'engrave', label: '精雕(線上)', days: 15 },
  { value: 'ab', label: 'A+B 雙加工', days: 20 },
  { value: 'full_double_engrave', label: '整樘門-雙面精雕', days: 25 },
  { value: 'full_double_etch', label: '整樘門-雙面蝕刻', days: 25 }
];
const SHIP_METHODS = [{ value: 'sea', label: '海運', days: 16 }, { value: 'air', label: '空運', days: 7 }];

function fmtD(d) { return d ? new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '—'; }
function addWorkDays(date, days) {
  const d = new Date(date); let added = 0;
  while (added < days) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) added++; }
  return d;
}
function calcTimeline(c) {
  const internalDeadline = c.sales_order_date ? addWorkDays(c.sales_order_date, 5) : null;
  const internalOverdue = internalDeadline && !c.internal_order_date && new Date() > internalDeadline;
  const factoryConfirmDeadline = c.internal_order_date ? new Date(new Date(c.internal_order_date).getTime() + 10 * 86400000) : null;
  const factoryOverdue = c.factory_type === 'tw' && factoryConfirmDeadline && !c.factory_confirmed_date && new Date() > factoryConfirmDeadline;
  return { internalDeadline, internalOverdue, factoryOverdue, twSecondaryDate: c.tw_secondary_date, twSecondaryDone: c.tw_secondary_done };
}

export default function InternalOrder() {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [factoryRows, setFactoryRows] = useState({}); // caseId -> rows
  const [rejectedCount, setRejectedCount] = useState(0);
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { user } = useAuth();

  async function load() {
    setLoading(true);
    try {
      let allData = await sbFetch('cases?select=*&status=in.(deposit_paid,production)&order=created_at.desc&limit=200') || [];
      // Count rejected
      try {
        const rejData = await sbFetch('cases?select=id&rejected_reason=not.is.null&status=eq.deposit_paid') || [];
        setRejectedCount(Array.isArray(rejData) ? rejData.length : 0);
      } catch { setRejectedCount(0); }
      setData(allData);
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Factory row management
  function addFactoryRow(caseId) {
    setFactoryRows(prev => ({
      ...prev,
      [caseId]: [...(prev[caseId] || []), { factory: '', proc: 'emboss', ship: 'sea', wide: false, part: '整樘門', qty: 1 }]
    }));
  }
  function removeFactoryRow(caseId, idx) {
    setFactoryRows(prev => ({
      ...prev,
      [caseId]: (prev[caseId] || []).filter((_, i) => i !== idx)
    }));
  }
  function updateFactoryRow(caseId, idx, field, value) {
    setFactoryRows(prev => {
      const rows = [...(prev[caseId] || [])];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, [caseId]: rows };
    });
  }

  // Submit
  async function ioSubmit(caseId) {
    let rows = factoryRows[caseId] || [];
    const today = new Date().toISOString().slice(0, 10);
    const caseData = data.find(c => c.id === caseId);
    const isFire = caseData?.is_fireproof;

    if (rows.length === 0) {
      // Single mode
      const factoryEl = document.getElementById(`io-factory-${caseId}`);
      const procEl = document.getElementById(`io-proc-${caseId}`);
      const shipEl = document.getElementById(`io-ship-${caseId}`);
      const wideEl = document.getElementById(`io-wide-${caseId}`);
      const factory = factoryEl?.value || '';
      const proc = procEl?.value || 'emboss';
      const ship = shipEl?.value || 'sea';
      const wide = wideEl?.checked || false;
      if (!factory) { toast('請選擇廠商', 'error'); return; }
      rows = [{ factory, proc, ship, wide, part: '整樘門', qty: caseData?.quantity || 1 }];
    } else {
      for (let i = 0; i < rows.length; i++) {
        if (!rows[i].factory) { toast(`第 ${i + 1} 筆工廠單請選擇廠商`, 'error'); return; }
      }
    }

    confirmDialog('確認下單', `確認下單 ${rows.length} 筆工廠單？`, async () => {
      try {
        let latestArrival = today;
        for (const r of rows) {
          const procObj = PROC_TYPES.find(p => p.value === r.proc);
          let procDays = procObj ? procObj.days : 0;
          if (r.wide) procDays += 10;
          const shipObj = SHIP_METHODS.find(s => s.value === r.ship);
          const shipDays = shipObj ? shipObj.days : 16;
          const twDays = (isFire && r.factory === 'cn') ? 7 : 0;
          const est = new Date(today);
          est.setDate(est.getDate() + procDays + shipDays + twDays);
          const estStr = est.toISOString().slice(0, 10);
          if (estStr > latestArrival) latestArrival = estStr;
          // Factory order info stored on case itself
        }
        const firstRow = rows[0];
        await sbFetch(`cases?id=eq.${caseId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            internal_order_date: today, factory_type: firstRow.factory,
            processing_type: firstRow.proc, shipping_method: firstRow.ship,
            is_overwidth: firstRow.wide, estimated_arrival: latestArrival,
            updated_at: new Date().toISOString()
          })
        });
        setFactoryRows(prev => { const next = { ...prev }; delete next[caseId]; return next; });
        toast(`已下單 ${rows.length} 筆工廠單`, 'success');
        load();
      } catch (e) { toast('操作失敗: ' + e.message, 'error'); }
    });
  }

  async function ioConfirmFactory(caseId) {
    try {
      await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify({ factory_confirmed_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }) });
      toast('已確認台廠回簽', 'success'); load();
    } catch (e) { toast('操作失敗: ' + e.message, 'error'); }
  }

  async function ioSendTw(caseId) {
    confirmDialog('送台廠加工', '確認送台灣工廠進行二次加工？(預計 7 天)', async () => {
      try {
        await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify({ tw_secondary_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }) });
        toast('已送台廠加工', 'success'); load();
      } catch (e) { toast('操作失敗: ' + e.message, 'error'); }
    });
  }

  async function ioTwDone(caseId) {
    confirmDialog('台廠完工', '確認台灣工廠二次加工已完成？', async () => {
      try {
        await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify({ tw_secondary_done: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }) });
        toast('台廠加工完成', 'success'); load();
      } catch (e) { toast('操作失敗: ' + e.message, 'error'); }
    });
  }

  async function ioAdvance(caseId) {
    confirmDialog('進入生產', '確認進入生產階段？進入後將從內勤下單列表移除。', async () => {
      try {
        await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify({ status: 'production', updated_at: new Date().toISOString() }) });
        toast('已進入生產階段', 'success'); load();
      } catch (e) { toast('操作失敗: ' + e.message, 'error'); }
    });
  }

  async function ioReject(caseId) {
    const reason = window.prompt('請輸入退回原因（業務端會看到此備註）：');
    if (!reason?.trim()) return;
    try {
      await sbFetch(`cases?id=eq.${caseId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sales_order_date: null, rejected_reason: reason.trim(),
          rejected_at: new Date().toISOString(), rejected_by: user?.display_name || '內勤',
          updated_at: new Date().toISOString()
        })
      });
      toast('已退回業務', 'success'); load();
    } catch (e) { toast('退回失敗: ' + e.message, 'error'); }
  }

  async function ioRejectDone(caseId) {
    const reason = window.prompt('此案件已下單給廠商，確定要退回業務嗎？\n請輸入退回原因：');
    if (!reason?.trim()) return;
    try {
      await sbFetch(`cases?id=eq.${caseId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sales_order_date: null, internal_order_date: null, factory_confirmed_date: null,
          rejected_reason: reason.trim(), rejected_at: new Date().toISOString(),
          rejected_by: user?.display_name || '內勤', updated_at: new Date().toISOString()
        })
      });
      toast('已退回業務', 'success'); load();
    } catch (e) { toast('退回失敗: ' + e.message, 'error'); }
  }

  // CSV download for single case
  function downloadCaseCSV(caseId) {
    const c = data.find(x => x.id === caseId);
    if (!c) { toast('找不到案件資料', 'error'); return; }
    const fd = c.formal_quote_data || {};
    const acc = fd.accessories || [];
    const fireLabel = fd.fire_type === 'f60a' ? 'f60A防火' : fd.fire_type === 'f60a_smoke' ? 'f60A遮煙門' : c.is_fireproof ? '防火' : '不防火';
    const doorLabel = DOOR_TYPE_LABEL[c.door_type] || c.door_type || '';
    const procLabel = (PROC_TYPES.find(p => p.value === c.processing_type) || {}).label || '';
    const wCM = c.actual_width_cm || (fd.width_mm ? Math.round(fd.width_mm / 10) : '');
    const hCM = c.actual_height_cm || (fd.height_mm ? Math.round(fd.height_mm / 10) : '');

    const rows = [
      ['報價單號', c.formal_quote_no || ''], ['案件編號', c.case_no || ''], [''],
      ['客戶資訊'], ['客戶名稱', c.customer_name || ''], ['電話', c.customer_phone || ''],
      ['案場地址', c.case_address || ''], ['業務人員', c.sales_person || ''], [''],
      ['產品規格'], ['產品代碼', c.product_code || ''], ['門型', doorLabel],
      ['防火需求', fireLabel], ['門寬(cm)', wCM], ['門高(cm)', hCM],
      ['數量', c.quantity || 1], [''],
      ['金額明細'], ['報價金額', c.official_price || ''], ['含稅總價', c.total_with_tax || ''],
      [''], ['下單資訊'], ['業務下單日', c.sales_order_date || ''],
      ['內勤下單日', c.internal_order_date || ''],
      ['廠商', c.factory_type === 'tw' ? '台廠' : c.factory_type === 'cn' ? '陸廠' : ''],
      ['加工類型', procLabel],
      ['運送方式', c.shipping_method === 'sea' ? '海運' : c.shipping_method === 'air' ? '空運' : ''],
      ['預計到倉', c.estimated_arrival || '']
    ];
    const csvContent = '\uFEFF' + rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${c.formal_quote_no || c.case_no || 'quote'}.csv`; a.click();
    toast(`已下載 ${c.formal_quote_no || c.case_no}`, 'success');
  }

  function exportCSV() {
    if (!data.length) { toast('沒有資料可匯出', 'error'); return; }
    const headers = ['報價單號', '案件編號', '客戶名稱', '業務', '門型', '防火', '總價', '業務下單日', '內勤下單日', '廠商', '預計到倉'];
    const rows = data.map(c => [
      c.formal_quote_no || '', c.case_no || '', c.customer_name || '', c.sales_person || '',
      DOOR_TYPE_LABEL[c.door_type] || c.door_type || '', c.is_fireproof ? '是' : '否',
      c.total_with_tax || c.official_price || '', c.sales_order_date || '', c.internal_order_date || '',
      c.factory_type === 'tw' ? '台廠' : c.factory_type === 'cn' ? '陸廠' : '', c.estimated_arrival || ''
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `內勤下單_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    toast('已下載 CSV', 'success');
  }

  // Filter
  const pending = data.filter(c => !c.internal_order_date);
  const done = data.filter(c => !!c.internal_order_date);
  const overdue = pending.filter(c => calcTimeline(c).internalOverdue);
  const waitSign = done.filter(c => c.factory_type === 'tw' && !c.factory_confirmed_date);

  let filtered = data;
  if (filter === 'pending') filtered = pending;
  if (filter === 'done') filtered = done;
  if (filter === 'overdue') filtered = overdue;
  if (filter === 'waitsign') filtered = waitSign;

  const filterBtn = (label, val, color) => {
    const on = filter === val;
    return <button key={val} onClick={() => setFilter(val)} style={{ padding: '5px 11px', borderRadius: 6, border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}`, background: on ? 'var(--gold-dim)' : 'var(--surface-2)', color: on ? (color || 'var(--gold)') : 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: on ? 700 : 500 }}>{label}</button>;
  };

  const selS = { padding: '3px 5px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)' };
  const btnS = { fontSize: 11, padding: '4px 10px', whiteSpace: 'nowrap' };

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">內勤下單</div><div className="page-subtitle">整理資料，下單給廠商（5 個工作天內）</div></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={exportCSV} style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>下載 CSV</button>
          <button className="btn btn-ghost" onClick={load}>↻</button>
        </div>
      </div>
      <div className="stats">
        <StatCard label="全部" value={data.length} />
        <StatCard label="待下單" value={pending.length} />
        <StatCard label="已下單" value={done.length} color="var(--success)" />
        {rejectedCount > 0 && <StatCard label="已退回待補資料" value={rejectedCount} color="var(--danger)" style={{ borderColor: 'rgba(239,68,68,.3)' }} />}
        {overdue.length > 0 && <StatCard label="逾期" value={overdue.length} color="var(--danger)" style={{ borderColor: 'rgba(239,68,68,.3)' }} />}
        {waitSign.length > 0 && <StatCard label="待回簽" value={waitSign.length} color="#d97706" style={{ borderColor: 'rgba(245,158,11,.3)' }} />}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {filterBtn(`全部 (${data.length})`, 'all')}
        {filterBtn(`待下單 (${pending.length})`, 'pending')}
        {filterBtn(`已下單 (${done.length})`, 'done', 'var(--success)')}
        {overdue.length > 0 && filterBtn(`逾期 (${overdue.length})`, 'overdue', 'var(--danger)')}
        {waitSign.length > 0 && filterBtn(`待回簽 (${waitSign.length})`, 'waitsign', '#d97706')}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>顯示 {filtered.length} 件</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>狀態</th><th>單號</th><th>客戶</th><th>業務</th><th>金額</th><th>流程路線</th>
            <th>工廠單</th><th>台廠加工</th><th>附件</th><th>期限/進度</th><th>操作</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="11"><div className="loading"><div className="spinner" /><br />載入中...</div></td></tr>
            : filtered.length === 0 ? <tr><td colSpan="11"><div className="empty"><div className="icon">✔</div>無符合條件的案件</div></td></tr>
            : filtered.map(c => {
              const t = calcTimeline(c);
              const isPending = !c.internal_order_date;
              const files = Array.isArray(c.case_files) ? c.case_files : [];
              const signedFile = files.find(f => f.type === 'signed_quote');
              const pdfFile = files.find(f => f.type === 'quote_pdf');
              const bgColor = isPending && t.internalOverdue ? 'rgba(239,68,68,.04)' : 'transparent';

              // Status cell
              const statusCell = isPending
                ? <span style={{ color: 'var(--gold)', fontWeight: 600 }}>待下單</span>
                : <span style={{ color: 'var(--success)' }}>✓ 已下單</span>;

              // Route cell
              const routeCell = c.is_fireproof
                ? <span style={{ fontSize: 10, lineHeight: 1.4, whiteSpace: 'nowrap' }}><span style={{ color: 'var(--danger)' }}>陸廠門板</span> → 運送 → <span style={{ color: '#3b82f6' }}>台廠加工</span><br /><span style={{ fontSize: 9, color: 'var(--text-muted)' }}>(+7天)</span></span>
                : <span style={{ fontSize: 10, color: 'var(--success)', whiteSpace: 'nowrap' }}>陸廠整樘 → 運送</span>;

              // TW secondary cell
              let twCell;
              if (!c.is_fireproof) twCell = <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>不需要</span>;
              else if (t.twSecondaryDone) twCell = <span style={{ color: 'var(--success)', fontSize: 10 }}>✓ 完成 {fmtD(t.twSecondaryDone)}</span>;
              else if (t.twSecondaryDate) twCell = <span style={{ color: '#3b82f6', fontSize: 10 }}>加工中 {fmtD(t.twSecondaryDate)}</span>;
              else if (c.internal_order_date) twCell = <span style={{ color: 'var(--gold)', fontSize: 10 }}>待送台廠</span>;
              else twCell = <span style={{ color: 'var(--text-muted)' }}>—</span>;

              // Attach cell
              const attachCell = (
                <span>
                  {signedFile && <a href={signedFile.url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none', fontSize: 11 }} title="客人回簽">📄</a>}
                  {pdfFile && <a href={pdfFile.url} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none', fontSize: 11, marginLeft: 4 }} title="報價單PDF">📑</a>}
                  {!signedFile && !pdfFile && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </span>
              );

              // Time cell
              let timeCell;
              if (isPending) {
                if (t.internalOverdue) timeCell = <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠ 逾期!</span>;
                else if (t.internalDeadline) timeCell = <span style={{ color: 'var(--text-muted)' }}>{fmtD(t.internalDeadline)}</span>;
                else timeCell = '—';
              } else {
                timeCell = (
                  <span>
                    <span style={{ color: 'var(--text-muted)' }}>下單 {fmtD(c.internal_order_date)}</span>
                    {c.factory_confirmed_date && <><br /><span style={{ color: 'var(--success)' }}>回簽 {fmtD(c.factory_confirmed_date)}</span></>}
                    {c.factory_type === 'tw' && !c.factory_confirmed_date && <><br /><span style={{ color: t.factoryOverdue ? 'var(--danger)' : 'var(--gold)' }}>待回簽{t.factoryOverdue && ' ⚠'}</span></>}
                  </span>
                );
              }

              // Factory cell
              const caseFactoryRows = factoryRows[c.id] || [];
              let factoryCell;
              if (isPending) {
                if (caseFactoryRows.length === 0) {
                  // Single mode
                  factoryCell = (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select id={`io-factory-${c.id}`} style={selS}><option value="">廠商</option><option value="cn">陸廠</option><option value="tw">台廠</option></select>
                        <select id={`io-proc-${c.id}`} style={selS}>{PROC_TYPES.map(p => <option key={p.value} value={p.value}>{p.label} ({p.days}天)</option>)}</select>
                        <select id={`io-ship-${c.id}`} style={selS}>{SHIP_METHODS.map(s => <option key={s.value} value={s.value}>{s.label} ({s.days}天)</option>)}</select>
                        <label style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 2 }}><input type="checkbox" id={`io-wide-${c.id}`} style={{ width: 12, height: 12 }} />超寬</label>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => addFactoryRow(c.id)} style={{ fontSize: 10, padding: '2px 6px', color: '#3b82f6', borderColor: '#3b82f6', alignSelf: 'flex-start' }}>+ 多廠下單</button>
                    </div>
                  );
                } else {
                  // Multi mode
                  factoryCell = (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {caseFactoryRows.map((row, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', padding: 4, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface-2)' }}>
                          <input value={row.part} placeholder="項目" onChange={e => updateFactoryRow(c.id, idx, 'part', e.target.value)} style={{ ...selS, width: 70 }} />
                          <select value={row.factory} onChange={e => updateFactoryRow(c.id, idx, 'factory', e.target.value)} style={selS}><option value="">廠商</option><option value="cn">陸廠</option><option value="tw">台廠</option></select>
                          <select value={row.proc} onChange={e => updateFactoryRow(c.id, idx, 'proc', e.target.value)} style={selS}>{PROC_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
                          <select value={row.ship} onChange={e => updateFactoryRow(c.id, idx, 'ship', e.target.value)} style={selS}><option value="sea">海運</option><option value="air">空運</option></select>
                          <input type="number" value={row.qty} min="1" onChange={e => updateFactoryRow(c.id, idx, 'qty', Number(e.target.value))} style={{ ...selS, width: 35 }} />
                          <label style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 1 }}><input type="checkbox" checked={row.wide} onChange={e => updateFactoryRow(c.id, idx, 'wide', e.target.checked)} style={{ width: 11, height: 11 }} />超寬</label>
                          <button onClick={() => removeFactoryRow(c.id, idx)} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
                        </div>
                      ))}
                      <button className="btn btn-ghost btn-sm" onClick={() => addFactoryRow(c.id)} style={{ fontSize: 10, padding: '2px 6px', color: '#3b82f6', borderColor: '#3b82f6', alignSelf: 'flex-start' }}>+ 再加一筆</button>
                    </div>
                  );
                }
              } else {
                const factoryLabel = c.factory_type === 'tw' ? '台廠' : c.factory_type === 'cn' ? '陸廠' : '—';
                const procLabel = (PROC_TYPES.find(p => p.value === c.processing_type) || {}).label || '—';
                const shipLabel = c.shipping_method === 'sea' ? '海運' : c.shipping_method === 'air' ? '空運' : '—';
                factoryCell = <span style={{ fontSize: 11 }}>{factoryLabel} / {procLabel} / {shipLabel}{c.is_overwidth && <span style={{ color: 'var(--danger)' }}> 超寬</span>}</span>;
              }

              // Action buttons
              const actionBtns = [];
              actionBtns.push(<button key="csv" className="btn btn-ghost btn-sm" onClick={() => downloadCaseCSV(c.id)} style={{ ...btnS, borderColor: 'var(--gold)', color: 'var(--gold)' }} title="CSV">CSV</button>);
              if (isPending) {
                actionBtns.push(<button key="submit" className="btn btn-primary btn-sm" onClick={() => ioSubmit(c.id)} style={{ ...btnS, background: '#10b981', borderColor: '#10b981' }}>確認下單</button>);
                actionBtns.push(<button key="reject" className="btn btn-danger btn-sm" onClick={() => ioReject(c.id)} style={btnS}>退回業務</button>);
              } else {
                if (c.factory_type === 'tw' && !c.factory_confirmed_date) {
                  actionBtns.push(<button key="confirm" className="btn btn-ghost btn-sm" onClick={() => ioConfirmFactory(c.id)} style={btnS}>確認回簽</button>);
                }
                if (c.is_fireproof && c.internal_order_date && !c.tw_secondary_date) {
                  actionBtns.push(<button key="sendtw" className="btn btn-ghost btn-sm" onClick={() => ioSendTw(c.id)} style={{ ...btnS, borderColor: '#3b82f6', color: '#3b82f6' }}>送台廠加工</button>);
                }
                if (c.is_fireproof && c.tw_secondary_date && !c.tw_secondary_done) {
                  actionBtns.push(<button key="twdone" className="btn btn-ghost btn-sm" onClick={() => ioTwDone(c.id)} style={{ ...btnS, borderColor: 'var(--success)', color: 'var(--success)' }}>台廠完工</button>);
                }
                const canAdvance = c.internal_order_date && (c.factory_type !== 'tw' || c.factory_confirmed_date) && (!c.is_fireproof || c.tw_secondary_done);
                if (canAdvance) {
                  actionBtns.push(<button key="advance" className="btn btn-ghost btn-sm" onClick={() => ioAdvance(c.id)} style={{ ...btnS, borderColor: 'var(--gold)', color: 'var(--gold)' }}>進入生產→</button>);
                }
                actionBtns.push(<button key="rejectdone" className="btn btn-danger btn-sm" onClick={() => ioRejectDone(c.id)} style={btnS}>退回業務</button>);
              }

              return (
                <tr key={c.id} style={{ background: bgColor }}>
                  <td>{statusCell}</td>
                  <td>
                    <strong style={{ fontFamily: 'monospace', color: 'var(--gold)', fontSize: 11 }}>{c.formal_quote_no || c.order_no || c.case_no || '—'}</strong>
                    {c.is_fireproof && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(239,68,68,.1)', color: 'var(--danger)', marginLeft: 4 }}>防火</span>}
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.customer_name || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.sales_person || '—'}</td>
                  <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmtPrice(c.total_with_tax || c.official_price || 0)}</td>
                  <td>{routeCell}</td>
                  <td>{factoryCell}</td>
                  <td>{twCell}</td>
                  <td>{attachCell}</td>
                  <td>{timeCell}</td>
                  <td><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{actionBtns}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { sbFetch } from '../api/supabase';
import { fmtDate, fmtPrice } from '../api/utils';
import { useToast } from '../components/UI/Toast';
import Modal from '../components/UI/Modal';
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

const CN_STAGES = [
  { field: 'cn_confirm_order', label: '確定訂單', short: '訂單', days: '3D' },
  { field: 'cn_engraving', label: '精雕/蝕刻', short: '精雕', days: '10-15D' },
  { field: 'cn_painting', label: '油漆/打印', short: '油漆', days: '' },
  { field: 'cn_assembly', label: '領料組裝', short: '組裝', days: '5D' },
  { field: 'cn_inspection', label: '驗收打包', short: '驗收', days: '2D' },
  { field: 'cn_factory_ship', label: '車間出貨', short: '出貨', days: '' }
];

const STATUS_OPTS = ['', '製作中', '已發海運', '已發空運', '已發海運(已逾期)', '已發空運(逾期)', '已安裝', '已安裝(已逾期)', '已逾期', '已完成'];

function fmtD(d) { return d ? new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '—'; }

function cnAutoStatus(c) {
  if (c.cn_sea_ship || c.cn_air_ship) return '運送中';
  if (c.cn_factory_ship) return '已出貨';
  if (c.cn_inspection) return '打包完成';
  if (c.cn_assembly) return '組裝中';
  if (c.cn_painting) return '油漆完成';
  if (c.cn_engraving) return '板已回';
  if (c.cn_confirm_order) return '備料中';
  return '未開始';
}

export default function ChinaFactory() {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState(null); // {caseId, field, type}
  const [editValue, setEditValue] = useState('');
  const [editModal, setEditModal] = useState({ open: false, data: null });
  const [editForm, setEditForm] = useState({});
  const [advanceInput, setAdvanceInput] = useState({}); // {caseId: 'input value'}
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      setData(await sbFetch('cases?select=*&status=in.(production,shipped)&order=internal_order_date.asc&limit=200') || []);
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Inline cell edit - text
  function startEditCell(caseId, field, currentVal) {
    setEditingCell({ caseId, field, type: 'text' });
    setEditValue(currentVal || '');
  }

  // Inline cell edit - date
  function startEditDate(caseId, field, currentVal) {
    setEditingCell({ caseId, field, type: 'date' });
    setEditValue(currentVal || '');
  }

  async function saveCell() {
    if (!editingCell) return;
    const { caseId, field } = editingCell;
    const val = editValue.trim() || null;
    const c = data.find(x => x.id === caseId);
    const updated = { ...c, [field]: val };
    const body = { [field]: val, cn_status: cnAutoStatus(updated), updated_at: new Date().toISOString() };
    try {
      await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('已更新', 'success');
      setEditingCell(null);
      load();
    } catch (e) { toast('更新失敗: ' + e.message, 'error'); setEditingCell(null); }
  }

  // Full row edit modal
  function openEditRow(c) {
    const formData = {};
    const fields = ['cn_ilande_no', 'cn_status', 'cn_order_date', 'cn_delivery_days', 'cn_est_delivery',
      'cn_confirm_order', 'cn_engraving', 'cn_painting', 'cn_assembly', 'cn_inspection', 'cn_factory_ship',
      'cn_sea_ship', 'cn_air_ship', 'cn_sea_deadline', 'cn_air_deadline', 'cn_note', 'cn_ordered_by'];
    fields.forEach(f => { formData[f] = c[f] || ''; });
    setEditForm(formData);
    setEditModal({ open: true, data: c });
  }

  async function saveRow() {
    if (!editModal.data) return;
    const caseId = editModal.data.id;
    const body = { updated_at: new Date().toISOString() };
    Object.entries(editForm).forEach(([k, v]) => {
      if (k === 'cn_delivery_days') body[k] = v ? parseInt(v) : null;
      else body[k] = v || null;
    });
    // Auto-compute status
    const updated = { ...editModal.data, ...body };
    body.cn_status = cnAutoStatus(updated);
    try {
      await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('已儲存生產進度', 'success');
      setEditModal({ open: false, data: null });
      load();
    } catch (e) { toast('儲存失敗: ' + e.message, 'error'); }
  }

  // Advance to next stage
  async function advanceStage(caseId, nextField, inputVal) {
    if (!inputVal || !inputVal.trim()) { toast('請輸入內容（日期或備註）才能推進', 'error'); return; }
    const c = data.find(x => x.id === caseId);
    const updated = { ...c, [nextField]: inputVal.trim() };
    const body = { [nextField]: inputVal.trim(), cn_status: cnAutoStatus(updated), updated_at: new Date().toISOString() };
    try {
      await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('已推進', 'success');
      setAdvanceInput(prev => ({ ...prev, [caseId]: '' }));
      load();
    } catch (e) { toast('推進失敗: ' + e.message, 'error'); }
  }

  // Retreat to previous stage
  async function retreatStage(caseId, currentField) {
    const c = data.find(x => x.id === caseId);
    const updated = { ...c, [currentField]: null };
    const body = { [currentField]: null, cn_status: cnAutoStatus(updated), updated_at: new Date().toISOString() };
    try {
      await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('已退回', 'success');
      load();
    } catch (e) { toast('退回失敗: ' + e.message, 'error'); }
  }

  // Step bar component with advance/retreat
  function StepBar({ c }) {
    let completedIdx = -1;
    for (let i = CN_STAGES.length - 1; i >= 0; i--) {
      if (c[CN_STAGES[i].field]) { completedIdx = i; break; }
    }
    const nextIdx = completedIdx + 1;
    const nextStage = nextIdx < CN_STAGES.length ? CN_STAGES[nextIdx] : null;
    const currentStage = completedIdx >= 0 ? CN_STAGES[completedIdx] : null;
    const inputVal = advanceInput[c.id] || '';

    return (
      <div>
        {/* Progress dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 220 }}>
          {CN_STAGES.map((s, idx) => {
            const val = c[s.field] || '';
            const done = idx <= completedIdx;
            const isCurrent = idx === completedIdx;
            const dotColor = done ? (isCurrent ? 'var(--gold)' : 'var(--success)') : 'var(--surface-highest)';
            const dotBorder = done ? (isCurrent ? 'var(--gold)' : 'var(--success)') : 'rgba(77,70,53,0.5)';
            const lineColor = (idx > 0 && idx <= completedIdx) ? 'var(--success)' : 'rgba(77,70,53,0.3)';
            const tooltip = s.label + (s.days ? ` (${s.days})` : '') + (val && val !== '✓' ? `：${val}` : '');
            return (
              <div key={s.field} style={{ display: 'contents' }}>
                {idx > 0 && <div style={{ flex: 1, height: 2, background: lineColor, minWidth: 8 }} />}
                <div title={tooltip} style={{
                  width: 14, height: 14, borderRadius: '50%', background: dotColor,
                  border: `2px solid ${dotBorder}`, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {done && <span style={{ color: '#fff', fontSize: 8, fontWeight: 900 }}>✓</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, textAlign: 'center' }}>
          {completedIdx >= 0 ? CN_STAGES[completedIdx].label : '未開始'}
        </div>
        {/* Advance/Retreat controls */}
        {nextStage && (
          <div style={{ marginTop: 6, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {currentStage && (
              <button onClick={() => retreatStage(c.id, currentStage.field)}
                style={{ fontSize: 9, padding: '2px 6px', border: '1px solid var(--text-muted)', borderRadius: 4, background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                ← {currentStage.short}
              </button>
            )}
            <input
              value={inputVal}
              onChange={e => setAdvanceInput(prev => ({ ...prev, [c.id]: e.target.value }))}
              placeholder={nextStage.label}
              style={{ flex: 1, minWidth: 80, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 10, fontFamily: 'var(--font-body)' }}
              onKeyDown={e => { if (e.key === 'Enter') advanceStage(c.id, nextStage.field, inputVal); }}
            />
            <button
              onClick={() => advanceStage(c.id, nextStage.field, inputVal)}
              disabled={!inputVal.trim()}
              style={{ fontSize: 9, padding: '2px 8px', border: '1px solid var(--gold)', borderRadius: 4, background: inputVal.trim() ? 'var(--gold-dim)' : 'none', color: inputVal.trim() ? 'var(--gold)' : 'var(--text-muted)', cursor: inputVal.trim() ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
              {nextStage.short} →
            </button>
          </div>
        )}
        {!nextStage && completedIdx === CN_STAGES.length - 1 && currentStage && (
          <div style={{ marginTop: 6 }}>
            <button onClick={() => retreatStage(c.id, currentStage.field)}
              style={{ fontSize: 9, padding: '2px 6px', border: '1px solid var(--text-muted)', borderRadius: 4, background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              ← 退回 {currentStage.short}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Overdue check
  function isOverdue(c) {
    const proc = PROC_TYPES.find(x => x.value === c.processing_type);
    const ship = SHIP_METHODS.find(x => x.value === c.shipping_method);
    let pd = proc ? proc.days : 0; if (c.is_overwidth) pd += 10;
    const sd = ship ? ship.days : 0;
    const od = c.cn_order_date || c.internal_order_date;
    if (c.cn_est_delivery) return new Date() > new Date(c.cn_est_delivery);
    if (od && (pd + sd)) { const d = new Date(od); d.setDate(d.getDate() + pd + sd); return new Date() > d; }
    return false;
  }

  const prodCount = data.filter(c => c.status === 'production').length;
  const shipCount = data.filter(c => c.status === 'shipped').length;
  const fireCount = data.filter(c => c.is_fireproof).length;
  const overdueCount = data.filter(c => isOverdue(c)).length;

  let filtered = data;
  if (filter === 'production') filtered = data.filter(c => c.status === 'production');
  else if (filter === 'shipped') filtered = data.filter(c => c.status === 'shipped');
  else if (filter === 'fire') filtered = data.filter(c => c.is_fireproof);
  else if (filter === 'overdue') filtered = data.filter(c => isOverdue(c));

  const filterBtn = (label, val, color) => {
    const on = filter === val;
    return <button key={val} onClick={() => setFilter(val)} style={{ padding: '5px 11px', borderRadius: 6, border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}`, background: on ? 'var(--gold-dim)' : 'var(--surface-2)', color: on ? (color || 'var(--gold)') : 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: on ? 700 : 500 }}>{label}</button>;
  };

  const inputStyle = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12, background: 'var(--surface-2)', color: 'var(--text)', width: '100%', fontFamily: 'var(--font-body)' };

  const editFields = [
    { key: 'cn_ilande_no', label: '意郎德編號', type: 'text' },
    { key: 'cn_status', label: '訂單狀態', type: 'select' },
    { key: 'cn_order_date', label: '下單日期', type: 'date' },
    { key: 'cn_delivery_days', label: '交貨天數', type: 'number' },
    { key: 'cn_est_delivery', label: '預計交貨日', type: 'date' },
    { key: 'cn_confirm_order', label: '確定訂單 (3D)', type: 'text' },
    { key: 'cn_engraving', label: '精雕/蝕刻/鈑金 (10-15D)', type: 'text' },
    { key: 'cn_painting', label: '油漆/UV打印', type: 'text' },
    { key: 'cn_assembly', label: '領料組裝 (5D)', type: 'text' },
    { key: 'cn_inspection', label: '驗收打包 (2D)', type: 'text' },
    { key: 'cn_factory_ship', label: '車間出貨', type: 'text' },
    { key: 'cn_sea_ship', label: '怡優奇 海出', type: 'date' },
    { key: 'cn_air_ship', label: '怡優奇 空出', type: 'date' },
    { key: 'cn_sea_deadline', label: '海運最晚發貨日', type: 'date' },
    { key: 'cn_air_deadline', label: '空運最晚發貨日', type: 'date' },
    { key: 'cn_note', label: '備註', type: 'textarea' },
    { key: 'cn_ordered_by', label: '下單人', type: 'text' }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">大陸工廠</div><div className="page-subtitle">製作進度表（B表）— 確定訂單 → 精雕蝕刻 → 油漆 → 組裝 → 打包 → 出貨</div></div>
        <button className="btn btn-ghost" onClick={load}>↻ 更新</button>
      </div>
      <div className="stats">
        <StatCard label="全部" value={data.length} />
        <StatCard label="製作中" value={prodCount} />
        <StatCard label="已出貨" value={shipCount} color="var(--success)" />
        <StatCard label="防火門" value={fireCount} color="var(--danger)" />
        {overdueCount > 0 && <StatCard label="逾期" value={overdueCount} color="var(--danger)" style={{ borderColor: 'rgba(239,68,68,.3)' }} />}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {filterBtn(`全部 (${data.length})`, 'all')}
        {filterBtn(`製作中 (${prodCount})`, 'production')}
        {filterBtn(`已出貨 (${shipCount})`, 'shipped', 'var(--success)')}
        {filterBtn(`防火 (${fireCount})`, 'fire', 'var(--danger)')}
        {overdueCount > 0 && filterBtn(`逾期 (${overdueCount})`, 'overdue', 'var(--danger)')}
      </div>

      {loading ? <div className="loading"><div className="spinner" /><br />載入中...</div> :
        filtered.length === 0 ? <div className="empty"><div className="icon">✔</div>目前無大陸工廠訂單</div> :
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th style={{ textAlign: 'left', minWidth: 80 }}>訂單編號</th>
              <th style={{ textAlign: 'left', minWidth: 60 }}>客戶</th>
              <th style={{ minWidth: 55 }}>下單日</th>
              <th style={{ minWidth: 40 }}>天數</th>
              <th style={{ minWidth: 55 }}>預計交貨</th>
              <th style={{ minWidth: 240 }}>生產進度</th>
              <th style={{ minWidth: 55 }}>海出</th>
              <th style={{ minWidth: 55 }}>空出</th>
              <th style={{ minWidth: 80 }}>備註</th>
              <th style={{ minWidth: 40 }}>操作</th>
            </tr></thead>
            <tbody>
              {filtered.map(c => {
                const proc = PROC_TYPES.find(p => p.value === c.processing_type);
                const ship = SHIP_METHODS.find(s => s.value === c.shipping_method);
                let procDays = proc ? proc.days : 0;
                const procLabel = proc ? proc.label : '—';
                if (c.is_overwidth) procDays += 10;
                const shipDays = ship ? ship.days : 0;
                const shipLabel = ship ? ship.label : '—';
                const totalDays = procDays + shipDays;
                const orderDate = c.cn_order_date || c.internal_order_date;
                let autoEstDelivery = null;
                if (orderDate && totalDays) {
                  autoEstDelivery = new Date(orderDate);
                  autoEstDelivery.setDate(autoEstDelivery.getDate() + totalDays);
                }
                const estDelivery = c.cn_est_delivery ? new Date(c.cn_est_delivery) : autoEstDelivery;
                const overdue = estDelivery && new Date() > estDelivery;

                // Inline editing
                const isEditingSeaShip = editingCell?.caseId === c.id && editingCell?.field === 'cn_sea_ship';
                const isEditingAirShip = editingCell?.caseId === c.id && editingCell?.field === 'cn_air_ship';
                const isEditingNote = editingCell?.caseId === c.id && editingCell?.field === 'cn_note';

                function renderDateCell(field, val) {
                  const isEditing = editingCell?.caseId === c.id && editingCell?.field === field;
                  if (isEditing) {
                    return (
                      <td style={{ padding: 8, borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                        <input type="date" value={editValue} onChange={e => setEditValue(e.target.value)}
                          onBlur={saveCell} onKeyDown={e => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditingCell(null); }}
                          autoFocus style={{ width: '100%', padding: '3px 4px', border: '1px solid var(--gold)', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--font-body)' }} />
                      </td>
                    );
                  }
                  return (
                    <td onClick={() => startEditDate(c.id, field, val || '')} style={{ padding: 8, borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'monospace', fontSize: 10, textAlign: 'center' }} title="點擊編輯">
                      {val ? fmtD(val) : <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>—</span>}
                    </td>
                  );
                }

                return (
                  <tr key={c.id} style={{ background: overdue ? 'rgba(239,68,68,.04)' : 'transparent' }}>
                    <td style={{ textAlign: 'left' }}>
                      <strong style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gold)' }}>{c.formal_quote_no || c.order_no || c.case_no || '—'}</strong>
                      {c.is_fireproof && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 6, background: 'rgba(239,68,68,.1)', color: 'var(--danger)', marginLeft: 4 }}>防火</span>}
                    </td>
                    <td style={{ textAlign: 'left', fontWeight: 600 }}>{c.customer_name || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 10, textAlign: 'center' }}>{orderDate ? fmtD(orderDate) : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {totalDays ? (
                        <span><span style={{ fontWeight: 700 }}>{totalDays}</span><br /><span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{procLabel} {procDays}d + {shipLabel} {shipDays}d</span></span>
                      ) : (c.cn_delivery_days || '—')}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 10, color: overdue ? 'var(--danger)' : 'var(--text)', fontWeight: overdue ? 700 : 400, textAlign: 'center' }}>
                      {estDelivery ? fmtD(estDelivery) : '—'}{overdue && ' ⚠'}
                    </td>
                    <td style={{ padding: '6px 12px' }}><StepBar c={c} /></td>
                    {renderDateCell('cn_sea_ship', c.cn_sea_ship)}
                    {renderDateCell('cn_air_ship', c.cn_air_ship)}
                    {/* Note cell - inline edit */}
                    {isEditingNote ? (
                      <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                        <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                          onBlur={saveCell} onKeyDown={e => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditingCell(null); }}
                          autoFocus style={{ width: '100%', padding: '3px 5px', border: '1px solid var(--gold)', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--font-body)', textAlign: 'center' }} />
                      </td>
                    ) : (
                      <td onClick={() => startEditCell(c.id, 'cn_note', c.cn_note)} style={{ cursor: 'pointer', maxWidth: 120, fontSize: 11, padding: 8, borderBottom: '1px solid var(--border)' }} title="點擊編輯備註">
                        {c.cn_note || <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>—</span>}
                      </td>
                    )}
                    <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditRow(c)} style={{ fontSize: 10, padding: '3px 8px' }} title="編輯整行">✎</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }

      {/* Edit Row Modal */}
      <Modal open={editModal.open} onClose={() => setEditModal({ open: false, data: null })}
        title={`編輯大陸生產進度 ${editModal.data?.formal_quote_no || editModal.data?.case_no || ''} ${editModal.data?.customer_name || ''}`}
        maxWidth={600}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditModal({ open: false, data: null })}>取消</button>
          <button className="btn btn-primary" onClick={saveRow}>儲存</button>
        </>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '4px 0' }}>
          {editFields.map(f => {
            const span = f.type === 'textarea' ? { gridColumn: 'span 2' } : {};
            let inputEl;
            if (f.type === 'select') {
              inputEl = <select value={editForm[f.key] || ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle}>{STATUS_OPTS.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select>;
            } else if (f.type === 'textarea') {
              inputEl = <textarea value={editForm[f.key] || ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />;
            } else {
              inputEl = <input type={f.type} value={editForm[f.key] || ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />;
            }
            return (
              <div key={f.key} style={span}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>{f.label}</label>
                {inputEl}
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { sbFetch } from '../api/supabase';
import { fmtPrice } from '../api/utils';
import StatCard from '../components/UI/StatCard';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';

function fmtD(d) {
  return d ? new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '—';
}

const STATUS_MAP = {
  pending: { label: '待加工', color: 'var(--gold)', bg: 'rgba(236,194,70,.12)' },
  confirmed: { label: '已確認', color: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
  engraving: { label: '精雕中', color: '#8b5cf6', bg: 'rgba(139,92,246,.12)' },
  painting: { label: '油漆中', color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
  assembly: { label: '裝配中', color: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
  inspection: { label: '驗收中', color: '#10b981', bg: 'rgba(16,185,129,.12)' },
  shipped: { label: '已出貨', color: '#10b981', bg: 'rgba(16,185,129,.15)' },
  installed: { label: '已安裝', color: '#10b981', bg: 'rgba(16,185,129,.2)' },
  cancelled: { label: '已取消', color: 'var(--danger)', bg: 'rgba(239,68,68,.1)' }
};

export default function TwFactory() {
  const [rows, setRows] = useState([]);
  const [cases, setCases] = useState({});
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, caseData] = await Promise.all([
        sbFetch('production?select=*&factory_code=eq.TW&order=created_at.desc&limit=200'),
        sbFetch('cases?select=id,case_no,order_no,customer_name,customer_phone,product_code,door_type,is_fireproof,quantity,official_price,total_with_tax,sales_person,tw_secondary_date,tw_secondary_done&status=not.eq.cancelled&limit=500')
      ]);
      // Build case lookup
      const caseMap = {};
      (caseData || []).forEach(c => { caseMap[c.id] = c; });
      setCases(caseMap);
      setRows(prods || []);
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(prodId, newStatus) {
    try {
      await sbFetch(`production?id=eq.${prodId}`, { method: 'PATCH', body: JSON.stringify({ production_status: newStatus, updated_at: new Date().toISOString() }) });
      toast('已更新', 'success');
      load();
    } catch (e) { toast('更新失敗: ' + e.message, 'error'); }
  }

  async function markShipped(prodId) {
    try {
      await sbFetch(`production?id=eq.${prodId}`, { method: 'PATCH', body: JSON.stringify({ production_status: 'shipped', workshop_shipment: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      toast('已標記出貨', 'success');
      load();
    } catch (e) { toast('操作失敗: ' + e.message, 'error'); }
  }

  async function deleteProd(p) {
    confirm('確認刪除', `確定刪除此工廠單？(${p.production_order_no || p.case_no || ''})`, async () => {
      try {
        await sbFetch(`production?id=eq.${p.id}`, { method: 'DELETE' });
        toast('已刪除', 'success');
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // Filter
  const active = rows.filter(r => r.production_status !== 'cancelled' && r.production_status !== 'shipped' && r.production_status !== 'installed');
  const shipped = rows.filter(r => r.production_status === 'shipped' || r.production_status === 'installed');
  const cancelled = rows.filter(r => r.production_status === 'cancelled');

  let filtered = rows;
  if (filter === 'active') filtered = active;
  if (filter === 'shipped') filtered = shipped;
  if (filter === 'cancelled') filtered = cancelled;

  const filterBtn = (label, val, color) => {
    const on = filter === val;
    return (
      <button key={val} onClick={() => setFilter(val)} style={{
        padding: '5px 11px', borderRadius: 6,
        border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}`,
        background: on ? 'var(--gold-dim)' : 'var(--surface-2)',
        color: on ? (color || 'var(--gold)') : 'var(--text-muted)',
        fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
        fontWeight: on ? 700 : 500
      }}>{label}</button>
    );
  };

  const STEPS = ['pending', 'confirmed', 'engraving', 'painting', 'assembly', 'inspection', 'shipped'];

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap">
          <div className="page-title">台灣工廠</div>
          <div className="page-subtitle">台廠下單、加工進度追蹤</div>
        </div>
        <button className="btn btn-primary" onClick={load}>↻ 重新載入</button>
      </div>

      <div className="stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="加工中" value={active.length} color={active.length ? 'var(--gold)' : undefined} />
        <StatCard label="已出貨/安裝" value={shipped.length} color="var(--success)" />
        <StatCard label="已取消" value={cancelled.length} color="var(--danger)" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {filterBtn(`加工中 (${active.length})`, 'active')}
        {filterBtn(`已出貨 (${shipped.length})`, 'shipped', 'var(--success)')}
        {filterBtn(`全部 (${rows.length})`, 'all')}
        {cancelled.length > 0 && filterBtn(`已取消 (${cancelled.length})`, 'cancelled', 'var(--danger)')}
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /><br />載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="icon">✔</div>目前無台廠工單</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(p => {
            const c = cases[p.case_id] || {};
            const st = STATUS_MAP[p.production_status] || STATUS_MAP.pending;
            const stepIdx = STEPS.indexOf(p.production_status);

            return (
              <div key={p.id} style={{
                border: `1px solid ${p.production_status === 'cancelled' ? 'rgba(239,68,68,.3)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                background: 'var(--surface-low)',
                overflow: 'hidden'
              }}>
                {/* Header */}
                <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <strong style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--gold)' }}>{c.order_no || c.case_no || p.case_no || '—'}</strong>
                  <span style={{ fontWeight: 600 }}>{c.customer_name || '—'}</span>
                  {c.product_code && <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{c.product_code}</span>}
                  {c.is_fireproof && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(239,68,68,.1)', color: 'var(--danger)' }}>防火</span>}
                  <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  {p.production_order_no && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>單號: {p.production_order_no}</span>}
                  {c.total_with_tax && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gold)', fontWeight: 700 }}>{fmtPrice(c.total_with_tax)}</span>}
                </div>

                {/* Step bar */}
                {p.production_status !== 'cancelled' && (
                  <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
                    {STEPS.map((s, i) => {
                      const label = (STATUS_MAP[s] || {}).label || s;
                      const done = i <= stepIdx;
                      const current = i === stepIdx;
                      return (
                        <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                          {i > 0 && <div style={{ width: 12, height: 2, background: done ? '#10b981' : 'var(--surface-high)' }} />}
                          <span style={{
                            fontSize: 8, padding: '2px 6px', borderRadius: 10, whiteSpace: 'nowrap',
                            background: current ? st.bg : done ? 'rgba(16,185,129,.15)' : 'var(--surface-high)',
                            color: current ? st.color : done ? '#10b981' : 'var(--text-muted)',
                            fontWeight: current ? 700 : 500
                          }}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Details */}
                <div style={{ padding: '6px 16px 10px', display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                  {p.production_note && <span>{p.production_note}</span>}
                  {p.order_date && <span>下單 {fmtD(p.order_date)}</span>}
                  {p.estimated_delivery && <span>預計 {fmtD(p.estimated_delivery)}</span>}
                  {p.workshop_shipment && <span style={{ color: 'var(--success)' }}>出貨 {fmtD(p.workshop_shipment)}</span>}
                  {c.sales_person && <span>業務: {c.sales_person}</span>}
                  {p.order_person && <span>下單: {p.order_person}</span>}
                </div>

                {/* Actions */}
                {p.production_status !== 'cancelled' && (
                  <div style={{ padding: '6px 16px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {stepIdx > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => confirm('確認退回？', `將狀態從「${st.label}」退回「${(STATUS_MAP[STEPS[stepIdx - 1]] || {}).label}」`, () => updateStatus(p.id, STEPS[stepIdx - 1]))}
                        style={{ fontSize: 10, borderColor: 'var(--text-muted)', color: 'var(--text-muted)' }}>
                        ← {(STATUS_MAP[STEPS[stepIdx - 1]] || {}).label}
                      </button>
                    )}
                    {stepIdx < STEPS.length - 1 && stepIdx >= 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => confirm('確認推進？', `將狀態推進到「${(STATUS_MAP[STEPS[stepIdx + 1]] || {}).label}」`, () => updateStatus(p.id, STEPS[stepIdx + 1]))}
                        style={{ fontSize: 10, borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                        推進 → {(STATUS_MAP[STEPS[stepIdx + 1]] || {}).label}
                      </button>
                    )}
                    {p.production_status !== 'shipped' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => confirm('確認出貨？', '將此工單標記為已出貨', () => markShipped(p.id))}
                        style={{ fontSize: 10, borderColor: 'var(--success)', color: 'var(--success)' }}>
                        標記出貨
                      </button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => deleteProd(p)} style={{ fontSize: 10 }}>刪除</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { sbFetch } from '../api/supabase';
import { uploadFile as storageUpload } from '../api/storage';
import { fmtDate, fmtPrice, CASE_STATUS_LABEL, CASE_STATUS_COLOR } from '../api/utils';
import { printFormalQuote } from '../api/pdf';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import { useAuth } from '../contexts/AuthContext';
import StatCard from '../components/UI/StatCard';


function fmtD(d) { return d ? new Date(d).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '—'; }

function addWorkDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) added++; }
  return d;
}

function calcTimeline(c) {
  const depositDate = c.deposit_50_paid_at || c.order_confirmed_at;
  const salesDeadline = depositDate ? addWorkDays(depositDate, 3) : null;
  const salesOverdue = salesDeadline && !c.sales_order_date && new Date() > salesDeadline;
  return { depositDate, salesDeadline, salesOverdue };
}

export default function SalesOrder() {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { user } = useAuth();
  const fileInputRefs = useRef({});

  async function load() {
    setLoading(true);
    try {
      setData(await sbFetch('cases?select=*&status=in.(deposit_paid,production,shipped,arrived)&order=created_at.desc&limit=200') || []);
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // File upload (single-replace for signed_quote/quote_pdf, append for attachment)
  async function uploadFile(caseId, fileType, file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('檔案不可超過 10MB', 'error'); return; }
    const c = data.find(x => x.id === caseId);
    const ext = file.name.split('.').pop().toLowerCase();
    const caseNo = (c?.case_no || 'unknown').replace(/[^a-zA-Z0-9-]/g, '');
    const fileName = `${caseNo}/${fileType}_${Date.now()}.${ext}`;
    try {
      const url = await storageUpload('case-files', fileName, file);
      let files = Array.isArray(c?.case_files) ? c.case_files.slice() : [];
      if (fileType !== 'attachment') {
        files = files.filter(f => f.type !== fileType);
      }
      files.push({ type: fileType, url, name: file.name, uploaded_at: new Date().toISOString() });
      await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify({ case_files: files }) });
      toast('已上傳', 'success');
      load();
    } catch (e) { toast('上傳失敗: ' + e.message, 'error'); }
  }

  async function removeAttachment(caseId, fileUrl) {
    const c = data.find(x => x.id === caseId);
    const files = Array.isArray(c?.case_files) ? c.case_files.filter(f => f.url !== fileUrl) : [];
    try {
      await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify({ case_files: files }) });
      toast('已移除', 'success');
      load();
    } catch (e) { toast('操作失敗: ' + e.message, 'error'); }
  }

  async function removeFile(caseId, fileType) {
    const c = data.find(x => x.id === caseId);
    const files = Array.isArray(c?.case_files) ? c.case_files.filter(f => f.type !== fileType) : [];
    try {
      await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify({ case_files: files }) });
      toast('已移除', 'success');
      load();
    } catch (e) { toast('操作失敗: ' + e.message, 'error'); }
  }

  async function editFile(caseId, fileType) {
    const label = fileType === 'signed_quote' ? '客人回簽' : '報價單PDF';
    confirmDialog('確認替換', `確認要替換「${label}」？將記錄修改時間。`, () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { toast('檔案不可超過 10MB', 'error'); return; }
        const c = data.find(x => x.id === caseId);
        const ext = file.name.split('.').pop().toLowerCase();
        const caseNo = (c?.case_no || 'unknown').replace(/[^a-zA-Z0-9-]/g, '');
        const fileName = `${caseNo}/${fileType}_edit_${Date.now()}.${ext}`;
        try {
          const url = await storageUpload('case-files', fileName, file);
          let files = Array.isArray(c?.case_files) ? c.case_files.slice() : [];
          files = files.filter(f => f.type !== fileType);
          files.push({ type: fileType, url, name: file.name, uploaded_at: new Date().toISOString(), edited_at: new Date().toISOString(), edited_by: user?.display_name || '' });
          await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify({ case_files: files }) });
          toast('已修改', 'success');
          load();
        } catch (e) { toast('上傳失敗: ' + e.message, 'error'); }
      };
      input.click();
    });
  }

  // 撤回業務下單（僅管理員）— 把 sales_order_date 設為 null
  async function withdrawSalesOrder(caseId) {
    if (!user?.isAdmin) { toast('僅管理員可撤回下單', 'error'); return; }
    const c = data.find(x => x.id === caseId);
    if (c?.internal_order_date) {
      toast('此案件內勤已下單，請改用「內勤下單」頁的「退回業務」', 'error');
      return;
    }
    confirmDialog('撤回業務下單', `${c?.formal_quote_no || c?.case_no}\n\n會把「業務下單日」清除，案件回到「待下單」狀態。是否確認？`, async () => {
      try {
        await sbFetch(`cases?id=eq.${caseId}`, {
          method: 'PATCH',
          body: JSON.stringify({ sales_order_date: null, updated_at: new Date().toISOString() })
        });
        toast('已撤回下單', 'success');
        load();
      } catch (e) { toast('撤回失敗: ' + e.message, 'error'); }
    });
  }

  async function soSubmit(caseId) {
    const c = data.find(x => x.id === caseId);
    const files = Array.isArray(c?.case_files) ? c.case_files : [];
    const hasSigned = files.some(f => f.type === 'signed_quote');
    const hasPdf = files.some(f => f.type === 'quote_pdf');
    if (!hasSigned || !hasPdf) {
      toast('請先上傳「客人回簽」和「報價單 PDF」才能下單', 'error');
      return;
    }
    confirmDialog('確認下單', '確認下單給內勤？', async () => {
      try {
        await sbFetch(`cases?id=eq.${caseId}`, { method: 'PATCH', body: JSON.stringify({
          sales_order_date: new Date().toISOString().slice(0, 10),
          rejected_reason: null, rejected_at: null, rejected_by: null,
          updated_at: new Date().toISOString()
        }) });
        toast('已下單給內勤', 'success');
        load();
      } catch (e) { toast('操作失敗: ' + e.message, 'error'); }
    });
  }

  // Filter
  const pending = data.filter(c => !c.sales_order_date);
  const done = data.filter(c => !!c.sales_order_date);
  const rejected = data.filter(c => c.rejected_reason && c.rejected_at);
  const overdue = pending.filter(c => calcTimeline(c).salesOverdue);

  let filtered = data;
  if (filter === 'pending') filtered = pending;
  if (filter === 'done') filtered = done;
  if (filter === 'overdue') filtered = overdue;

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

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">業務下單</div><div className="page-subtitle">整理圖面資料，下單給內勤（3 個工作天內）</div></div>
        <button className="btn btn-ghost" onClick={load}>↻ 更新</button>
      </div>
      <div className="stats">
        <StatCard label="總數" value={data.length} />
        <StatCard label="待下單" value={pending.length} color={pending.length ? 'var(--gold)' : undefined} />
        <StatCard label="已下單" value={done.length} color="var(--success)" />
        {rejected.length > 0 && <StatCard label="被退回" value={rejected.length} color="var(--danger)" style={{ borderColor: 'rgba(239,68,68,.3)' }} />}
        {overdue.length > 0 && <StatCard label="逾期" value={overdue.length} color="var(--danger)" style={{ borderColor: 'rgba(239,68,68,.3)' }} />}
      </div>

      {/* Rejected alert */}
      {rejected.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>⚠ 有 {rejected.length} 件被內勤退回，請補齊資料</div>
          {rejected.map(c => {
            const historyCount = Array.isArray(c.rejection_history) ? c.rejection_history.length : 0;
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid rgba(239,68,68,.15)', flexWrap: 'wrap' }}>
                <strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.formal_quote_no || c.case_no || '—'}</strong>
                <span style={{ fontWeight: 600, fontSize: 12 }}>{c.customer_name || ''}</span>
                <span style={{ color: 'var(--danger)', fontSize: 12, flex: 1 }}>退回原因：{c.rejected_reason}</span>
                {historyCount > 1 && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: 'rgba(239,68,68,.15)', color: 'var(--danger)', fontWeight: 700 }}>第 {historyCount} 次退回</span>}
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{c.rejected_by || ''} {fmtD(c.rejected_at)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {filterBtn(`全部 (${data.length})`, 'all')}
        {filterBtn(`待下單 (${pending.length})`, 'pending')}
        {filterBtn(`已下單 (${done.length})`, 'done', 'var(--success)')}
        {overdue.length > 0 && filterBtn(`逾期 (${overdue.length})`, 'overdue', 'var(--danger)')}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>顯示 {filtered.length} 件</span>
      </div>

      {loading ? <div className="loading"><div className="spinner" /><br />載入中...</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.length === 0 ? <div className="empty"><div className="icon">✔</div>無符合條件的案件</div> :
            filtered.map(c => {
              const t = calcTimeline(c);
              const isPending = !c.sales_order_date;
              const files = Array.isArray(c.case_files) ? c.case_files : [];
              const signedFile = files.find(f => f.type === 'signed_quote');
              const pdfFile = files.find(f => f.type === 'quote_pdf');
              const isRejected = c.rejected_reason && c.rejected_at;
              const canEdit = user?.isAdmin || (user?.permissions?.internalorder?.edit);

              if (isPending) {
                const borderC = isRejected ? 'rgba(239,68,68,.5)' : t.salesOverdue ? 'rgba(239,68,68,.35)' : 'var(--border)';
                const bgC = isRejected ? 'rgba(239,68,68,.08)' : 'var(--surface-low)';
                return (
                  <div key={c.id} style={{ border: `1px solid ${borderC}`, borderRadius: 'var(--radius)', overflow: 'hidden', background: bgC }}>
                    {isRejected && (() => {
                      const hCount = Array.isArray(c.rejection_history) ? c.rejection_history.length : 0;
                      return (
                        <div style={{ padding: '8px 18px', background: 'rgba(239,68,68,.12)', borderBottom: '1px solid rgba(239,68,68,.2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>⚠ 被內勤退回</span>
                          {hCount > 1 && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: 'rgba(239,68,68,.2)', color: 'var(--danger)', fontWeight: 700 }}>第 {hCount} 次</span>}
                          <span style={{ fontSize: 12, color: 'var(--danger)' }}>{c.rejected_reason}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{c.rejected_by || ''} {fmtD(c.rejected_at)}</span>
                        </div>
                      );
                    })()}
                    <div style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                        <strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.formal_quote_no || c.order_no || c.case_no || '—'}</strong>
                        <span style={{ fontWeight: 600 }}>{c.customer_name || '—'}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>{fmtPrice(c.total_with_tax || c.official_price || 0)}</span>
                        {t.salesOverdue && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>⚠ 逾期!</span>}
                        {t.salesDeadline && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>期限 {fmtD(t.salesDeadline)}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                        <span>匯款日 {fmtD(t.depositDate)}</span>
                        {c.product_code && <span style={{ fontFamily: 'monospace' }}>{c.product_code}</span>}
                        {c.is_fireproof && <span style={{ color: 'var(--danger)' }}>防火</span>}
                        <button className="btn btn-ghost btn-sm" onClick={() => printFormalQuote(c)} style={{ fontSize: 10, borderColor: 'var(--gold)', color: 'var(--gold)', marginLeft: 'auto' }}>報價單 PDF</button>
                      </div>
                      {/* File upload boxes */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', background: 'var(--surface-2)' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 6 }}>客人報價單回簽</div>
                          {signedFile ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <a href={signedFile.url} target="_blank" rel="noreferrer" style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>已上傳</a>
                              <button className="btn btn-danger btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => removeFile(c.id, 'signed_quote')}>移除</button>
                            </div>
                          ) : (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
                              <span style={{ fontSize: 16, color: 'var(--gold)' }}>+</span>上傳檔案
                              <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => uploadFile(c.id, 'signed_quote', e.target.files[0])} />
                            </label>
                          )}
                        </div>
                        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', background: 'var(--surface-2)' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 6 }}>案件報價單 PDF</div>
                          {pdfFile ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <a href={pdfFile.url} target="_blank" rel="noreferrer" style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>已上傳</a>
                              <button className="btn btn-danger btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => removeFile(c.id, 'quote_pdf')}>移除</button>
                            </div>
                          ) : (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
                              <span style={{ fontSize: 16, color: 'var(--gold)' }}>+</span>上傳檔案
                              <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => uploadFile(c.id, 'quote_pdf', e.target.files[0])} />
                            </label>
                          )}
                        </div>
                      </div>
                      {/* Other attachments */}
                      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', background: 'var(--surface-2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1 }}>其他附件</div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: 'var(--gold)', fontWeight: 600 }}>
                            <span style={{ fontSize: 14 }}>+</span>上傳
                            <input type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" multiple style={{ display: 'none' }} onChange={e => {
                              Array.from(e.target.files).forEach(f => uploadFile(c.id, 'attachment', f));
                              e.target.value = '';
                            }} />
                          </label>
                        </div>
                        {(() => {
                          const attachments = files.filter(f => f.type === 'attachment');
                          if (attachments.length === 0) return <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>尚無附件</div>;
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {attachments.map((f, i) => (
                                <div key={f.url || i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                                  <a href={f.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text)', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name || '附件'}</a>
                                  <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtD(f.uploaded_at)}</span>
                                  <button onClick={() => removeAttachment(c.id, f.url)} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0 }}>✕</button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => soSubmit(c.id)} style={{ background: '#10b981', borderColor: '#10b981' }}>確認下單給內勤</button>
                    </div>
                  </div>
                );
              } else {
                // Already submitted
                return (
                  <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--surface-low)' }}>
                    <div style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--success)', fontSize: 14 }}>✓</span>
                      <strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.formal_quote_no || c.order_no || c.case_no || '—'}</strong>
                      <span style={{ fontWeight: 600 }}>{c.customer_name || '—'}</span>
                      {c.is_fireproof && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(239,68,68,.1)', color: 'var(--danger)' }}>防火</span>}
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginLeft: 'auto' }}>{fmtPrice(c.total_with_tax || c.official_price || 0)}</span>
                    </div>
                    <div style={{ padding: '6px 18px 10px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                      <span>業務下單 {fmtD(c.sales_order_date)}</span>
                      {c.internal_order_date ? <span style={{ color: 'var(--success)' }}>內勤下單 {fmtD(c.internal_order_date)}</span> : <span style={{ color: 'var(--gold)' }}>內勤處理中</span>}
                      {c.factory_type && <span>{c.factory_type === 'tw' ? '台廠' : '陸廠'}</span>}
                      {c.estimated_arrival && <span>預計到倉 {fmtD(c.estimated_arrival)}</span>}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => printFormalQuote(c)} style={{ fontSize: 10, borderColor: 'var(--gold)', color: 'var(--gold)' }}>報價單 PDF</button>
                        {user?.isAdmin && !c.internal_order_date && (
                          <button onClick={() => withdrawSalesOrder(c.id)} title="撤回下單（僅管理員）— 會把案件回到待下單"
                            style={{ padding: '4px 10px', fontSize: 10, background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 4, cursor: 'pointer' }}>
                            ↩ 撤回下單
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Attachments for completed orders */}
                    <div style={{ padding: '6px 18px 10px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1 }}>業務附件</span>
                      {signedFile ? (
                        <>
                          <a href={signedFile.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--success)', textDecoration: 'none' }}>客人回簽 ✓</a>
                          {canEdit && <button className="btn btn-danger btn-sm" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => editFile(c.id, 'signed_quote')}>內勤修改</button>}
                          {user?.isAdmin && <button onClick={() => removeFile(c.id, 'signed_quote')} title="刪除回簽（管理員）" style={{ fontSize: 9, padding: '1px 5px', background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 3, cursor: 'pointer' }}>🗑</button>}
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>回簽未上傳</span>
                          {canEdit && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 11, color: 'var(--gold)' }}>
                              +補傳<input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => uploadFile(c.id, 'signed_quote', e.target.files[0])} />
                            </label>
                          )}
                        </>
                      )}
                      {pdfFile ? (
                        <>
                          <a href={pdfFile.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--success)', textDecoration: 'none', marginLeft: 8 }}>報價單PDF ✓</a>
                          {canEdit && <button className="btn btn-danger btn-sm" style={{ fontSize: 9, padding: '1px 5px' }} onClick={() => editFile(c.id, 'quote_pdf')}>內勤修改</button>}
                          {user?.isAdmin && <button onClick={() => removeFile(c.id, 'quote_pdf')} title="刪除PDF（管理員）" style={{ fontSize: 9, padding: '1px 5px', background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 3, cursor: 'pointer' }}>🗑</button>}
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>PDF未上傳</span>
                          {canEdit && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 11, color: 'var(--gold)' }}>
                              +補傳<input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => uploadFile(c.id, 'quote_pdf', e.target.files[0])} />
                            </label>
                          )}
                        </>
                      )}
                      {/* 其他附件 + 一鍵清除全部 */}
                      {(() => {
                        const others = files.filter(f => f.type === 'attachment');
                        if (others.length === 0 && !signedFile && !pdfFile) return null;
                        return (
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                            {others.length > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>其他附件 {others.length} 個</span>}
                            {user?.isAdmin && files.length > 0 && (
                              <button
                                onClick={() => {
                                  confirmDialog('清除全部附件？', `會把這個案件的 ${files.length} 個附件全部移除（從 case_files 欄位）。\n\n注意：Supabase Storage 檔案不會自動刪除。`, async () => {
                                    try {
                                      await sbFetch(`cases?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ case_files: [] }) });
                                      toast('已清除全部附件', 'success');
                                      load();
                                    } catch (e) { toast('清除失敗: ' + e.message, 'error'); }
                                  });
                                }}
                                title="一鍵清除此案件全部附件（管理員）"
                                style={{ padding: '3px 8px', fontSize: 10, background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                              >🗑 全部清除</button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              }
            })}
        </div>
      }
    </div>
  );
}

import { useState, useEffect } from 'react';
import { sbFetch, proxyCount } from '../api/supabase';
import { fmtDate, fmtPrice, CASE_STATUS_LABEL, CASE_STATUS_COLOR, CTYPE_SHORT, PAGE_SIZE } from '../api/utils';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import { useAuth } from '../contexts/AuthContext';
import StatCard from '../components/UI/StatCard';
import { useNavigate } from 'react-router-dom';
import { printFormalQuote } from '../api/pdf';
import { exportFormalQuoteExcel } from '../api/excel';

// 「進階」狀態 — 實際生產/出貨後才擋
const ADVANCED_STATUSES = ['production', 'shipped', 'arrived', 'installed', 'completed'];

export default function FormalQuote() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
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

  // ── 下游資料檢查（回傳問題清單，空陣列 = 可刪） ──
  async function checkDownstream(c) {
    const issues = [];
    // 1. 收款紀錄
    try {
      const pays = await sbFetch(`payments?case_id=eq.${c.id}&select=id&limit=1`);
      if (pays?.length > 0) issues.push('已有收款紀錄（請到「收款追蹤」刪除）');
    } catch {}
    if (c.measure_fee_paid_at || c.deposit_50_paid_at || c.balance_paid_at) {
      issues.push('案件已標記收款（請到「收款追蹤」取消標記）');
    }
    // 2. 案件狀態進階
    if (ADVANCED_STATUSES.includes(c.status)) issues.push(`案件狀態為「${CASE_STATUS_LABEL[c.status] || c.status}」`);
    // 3. 已下單
    if (c.sales_order_date) issues.push('業務已下單給內勤（請到「業務下單」撤回）');
    if (c.internal_order_date) issues.push('內勤已下單給工廠（請到「內勤下單」退回業務）');
    // 4. 台廠生產記錄（排除已取消）
    try {
      const prods = await sbFetch(`production?case_id=eq.${c.id}&production_status=neq.cancelled&select=id&limit=1`);
      if (prods?.length > 0) issues.push('已有未取消的台廠生產記錄（請到「台灣工廠」刪除）');
    } catch {}
    // 5. 大陸工廠
    if (c.cn_order_date || c.cn_ilande_no) issues.push('已下大陸工廠單（請到「大陸工廠」清除）');
    // 6. 安裝排程
    if (c.install_date) issues.push('已排定安裝日期（請到「安裝排程」取消）');
    // 7. 附件
    if (Array.isArray(c.case_files) && c.case_files.length > 0) {
      issues.push(`已上傳 ${c.case_files.length} 個附件（請到「業務下單」清除）`);
    }
    return issues;
  }

  // ── 單筆刪除 ──
  async function deleteOne(c) {
    if (!user?.isAdmin) { toast('僅管理員可刪除報價單', 'error'); return; }
    const issues = await checkDownstream(c);
    if (issues.length > 0) {
      toast(`此報價單無法刪除：\n${issues.map((x, i) => `${i + 1}. ${x}`).join('\n')}`, 'error');
      return;
    }
    confirm('確認刪除報價單？', `${c.order_no || c.case_no} (${c.customer_name || '—'}) 將永久刪除，此動作無法復原。\n\n• 相關估價單的 case_id 會被清除\n• 已取消的工廠生產記錄會一併刪除`, async () => {
      try {
        if (c.quote_id) {
          await sbFetch(`quotes?case_id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ case_id: null }) }).catch(() => {});
        }
        await sbFetch(`production?case_id=eq.${c.id}&production_status=eq.cancelled`, { method: 'DELETE' }).catch(() => {});
        await sbFetch(`cases?id=eq.${c.id}`, { method: 'DELETE' });
        toast('已刪除', 'success');
        load();
      } catch (e) {
        if (String(e.message).includes('foreign key') || String(e.message).includes('violates')) {
          toast('刪除失敗：此報價單仍被其他資料引用，請先清除', 'error');
        } else {
          toast('刪除失敗：' + e.message, 'error');
        }
      }
    });
  }

  // ── 批量刪除 ──
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selectedIds.size === rows.length && rows.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map(r => r.id)));
  }
  async function bulkDelete() {
    if (!user?.isAdmin) { toast('僅管理員可批量刪除', 'error'); return; }
    if (selectedIds.size === 0) return;
    const allSelected = rows.filter(r => selectedIds.has(r.id));
    // 逐筆檢查下游資料
    const blocked = [];
    const deletable = [];
    for (const c of allSelected) {
      const issues = await checkDownstream(c);
      if (issues.length > 0) blocked.push({ c, issues });
      else deletable.push(c);
    }
    if (deletable.length === 0) {
      toast(`選取的 ${allSelected.length} 筆全部有下游資料，無法刪除`, 'error');
      // 顯示前 3 筆的問題
      blocked.slice(0, 3).forEach(b => {
        console.warn(`${b.c.order_no || b.c.case_no}: ${b.issues.join(', ')}`);
      });
      return;
    }
    const blockedNote = blocked.length > 0
      ? `\n\n⚠ 其中 ${blocked.length} 筆有下游資料會跳過：\n${blocked.slice(0, 3).map(b => `${b.c.order_no || b.c.case_no}：${b.issues[0]}`).join('\n')}${blocked.length > 3 ? `\n...另 ${blocked.length - 3} 筆` : ''}`
      : '';
    confirm(`批量刪除 ${deletable.length} 筆報價單？`, `將永久刪除 ${deletable.length} 筆，無法復原。${blockedNote}`, async () => {
      let okCount = 0, failCount = 0;
      const failures = [];
      for (const c of deletable) {
        try {
          if (c.quote_id) {
            await sbFetch(`quotes?case_id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ case_id: null }) }).catch(() => {});
          }
          await sbFetch(`production?case_id=eq.${c.id}&production_status=eq.cancelled`, { method: 'DELETE' }).catch(() => {});
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
      setSelectedIds(new Set());
      load();
    });
  }

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

      {/* 批量操作 bar — 僅管理員、有勾選時顯示 */}
      {user?.isAdmin && selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
          borderRadius: 'var(--radius)', marginBottom: 10
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>已選取 {selectedIds.size} 筆</span>
          <button className="btn btn-danger btn-sm" onClick={bulkDelete} style={{ fontSize: 12 }}>🗑 批量刪除</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())} style={{ fontSize: 12, marginLeft: 'auto' }}>取消選取</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr>
            {user?.isAdmin && (
              <th style={{ width: 36, textAlign: 'center' }}>
                <input type="checkbox" checked={rows.length > 0 && selectedIds.size === rows.length}
                  onChange={toggleSelectAll} style={{ accentColor: 'var(--gold)', cursor: 'pointer' }} title="全選" />
              </th>
            )}
            <th>訂單編號</th><th>客戶</th><th>型態</th><th>業務</th><th>報價金額</th><th>總價</th><th>狀態</th><th>建立</th>
            <th style={{ width: 100 }}>操作</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={user?.isAdmin ? 10 : 9}><div className="loading"><div className="spinner" /><br />載入中...</div></td></tr>
            : rows.length === 0 ? <tr><td colSpan={user?.isAdmin ? 10 : 9}><div className="empty"><div className="icon">📋</div>無資料</div></td></tr>
            : rows.map(c => {
              const st = CASE_STATUS_COLOR[c.status] || CASE_STATUS_COLOR.new;
              const isSelected = selectedIds.has(c.id);
              return (
                <tr key={c.id} style={{ background: isSelected ? 'rgba(239,68,68,.05)' : undefined }}>
                  {user?.isAdmin && (
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(c.id)}
                        style={{ accentColor: 'var(--gold)', cursor: 'pointer' }} />
                    </td>
                  )}
                  <td><strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.order_no || c.case_no || '—'}</strong></td>
                  <td>{c.customer_name || '—'}</td>
                  <td style={{ fontSize: 11 }}>{CTYPE_SHORT[c.customer_type] || c.customer_type || '—'}</td>
                  <td style={{ fontSize: 12 }}>{c.sales_person || '—'}</td>
                  <td className="price">{fmtPrice(c.official_price || c.quoted_price)}</td>
                  <td className="price">{fmtPrice(c.total_with_tax)}</td>
                  <td><span className="badge" style={{ background: st.bg, color: st.color }}>{CASE_STATUS_LABEL[c.status] || c.status}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(c.created_at)}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => printFormalQuote(c)} title="列印 PDF" style={{ background: 'transparent', border: '1px solid var(--gold)', borderRadius: 4, padding: '4px 9px', cursor: 'pointer', color: 'var(--gold)', fontSize: 11, fontWeight: 600 }}>PDF</button>
                    <button onClick={() => exportFormalQuoteExcel(c)} title="匯出 Excel" style={{ background: 'transparent', border: '1px solid #22c55e', borderRadius: 4, padding: '4px 9px', cursor: 'pointer', color: '#22c55e', fontSize: 11, fontWeight: 600 }}>XLS</button>
                    {user?.isAdmin && (
                      <button onClick={() => deleteOne(c)} title="刪除（僅管理員）" style={{ background: 'transparent', border: '1px solid var(--danger)', borderRadius: 4, padding: '4px 9px', cursor: 'pointer', color: 'var(--danger)', fontSize: 11, fontWeight: 600 }}>🗑</button>
                    )}
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

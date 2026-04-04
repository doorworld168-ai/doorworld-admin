import { useState, useEffect, useCallback } from 'react';
import { sbFetch, proxyCount } from '../api/supabase';
import { fmtDate, fmtPrice, PAGE_SIZE, downloadCSV } from '../api/utils';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import Modal from '../components/UI/Modal';
import StatCard from '../components/UI/StatCard';

const CTYPE_OPTIONS = [['','選擇'],['S','股東'],['C','直客'],['D','設計師'],['D1','D1'],['D2','D2'],['A','代理商'],['B','建商'],['CC','商會'],['DD','經銷商'],['E','員工'],['G','公機關'],['V','VIP'],['Z','親友'],['X','公司']];

export default function Members() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, month: 0, contact: 0, manual: 0 });
  const [modal, setModal] = useState({ open: false, data: null });
  const [chatModal, setChatModal] = useState({ open: false, name: '', messages: [] });
  const [quotesModal, setQuotesModal] = useState({ open: false, name: '', quotes: [] });
  const [lightbox, setLightbox] = useState('');
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    let path = 'members?select=*,quotes(id)&order=created_at.desc';
    if (search) path += `&or=(display_name.ilike.*${encodeURIComponent(search)}*,phone.ilike.*${encodeURIComponent(search)}*)`;
    if (filterMode === 'need_contact') path += '&need_contact=eq.true';
    if (filterMode === 'manual') path += '&manual_mode=eq.true';
    try {
      const t = await proxyCount(path.replace('select=*,quotes(id)', 'select=id'));
      setTotal(t);
      const data = await sbFetch(path + `&offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`);
      setRows(data || []);
      const all = await proxyCount('members?select=id');
      const month = new Date().toISOString().slice(0, 7);
      const mo = await proxyCount(`members?select=id&created_at=gte.${month}-01`);
      const contact = await proxyCount('members?select=id&need_contact=eq.true');
      const manual = await proxyCount('members?select=id&manual_mode=eq.true');
      setStats({ total: all, month: mo, contact, manual });
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }, [search, filterMode, page, toast]);

  useEffect(() => { load(); }, [load]);

  async function saveMember(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      display_name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'),
      company: fd.get('company') || null, customer_type: fd.get('customer_type') || null,
      note: fd.get('note') || null
    };
    try {
      if (modal.data?.id) {
        await sbFetch(`members?id=eq.${modal.data.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast('已更新', 'success');
      } else {
        await sbFetch('members', { method: 'POST', body: JSON.stringify(body) });
        toast('已新增', 'success');
      }
      setModal({ open: false, data: null });
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function deleteMember(m) {
    confirm('確認刪除會員？', `「${m.display_name}」的資料將永久刪除（含對話紀錄）。`, async () => {
      try {
        if (m.line_user_id) await sbFetch(`sessions?line_user_id=eq.${m.line_user_id}`, { method: 'DELETE' });
        await sbFetch(`quotes?member_id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ member_id: null }) });
        await sbFetch(`members?id=eq.${m.id}`, { method: 'DELETE' });
        toast('已刪除', 'success');
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function toggleNeedContact(m) {
    try {
      await sbFetch(`members?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ need_contact: !m.need_contact }) });
      toast(!m.need_contact ? '已標記需業務聯繫' : '已取消聯繫標記', !m.need_contact ? 'error' : 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function toggleManualMode(m) {
    try {
      await sbFetch(`members?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ manual_mode: !m.manual_mode }) });
      toast(!m.manual_mode ? '已切換為人工模式' : '已恢復AI自動回覆', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function viewMemberQuotes(m) {
    try {
      const quotes = await sbFetch(`quotes?member_id=eq.${m.id}&select=*&order=created_at.desc`);
      setQuotesModal({ open: true, name: m.display_name || '會員', quotes: quotes || [] });
    } catch { setQuotesModal({ open: true, name: m.display_name || '會員', quotes: [] }); }
  }

  async function viewChat(userId, name) {
    try {
      const sessions = await sbFetch(`sessions?line_user_id=eq.${userId}&select=messages`);
      setChatModal({ open: true, name, messages: sessions?.[0]?.messages || [] });
    } catch { setChatModal({ open: true, name, messages: [] }); }
  }

  const FilterBtn = ({ label, value, count, color }) => (
    <button onClick={() => { setFilterMode(value); setPage(0); }} style={{
      padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)',
      border: `1px solid ${filterMode === value ? 'var(--gold)' : 'var(--border)'}`,
      background: filterMode === value ? 'var(--gold-dim)' : 'var(--surface-2)',
      color: filterMode === value ? (color || 'var(--gold)') : 'var(--text-muted)',
      fontWeight: filterMode === value ? 700 : 500
    }}>{label}{count !== undefined ? ` (${count})` : ''}</button>
  );

  const from = page * PAGE_SIZE + 1, to = Math.min(from + PAGE_SIZE - 1, total);
  const d = modal.data || {};

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">會員管理</div><div className="page-subtitle">管理所有 LINE 會員資料與對話紀錄</div></div>
      </div>
      <div className="stats">
        <StatCard label="總會員數" value={stats.total} />
        <StatCard label="本月新增" value={stats.month} />
        <StatCard label="待聯繫" value={stats.contact} color="var(--danger)" style={stats.contact > 0 ? { borderColor: 'rgba(239,68,68,.3)' } : undefined} />
        <StatCard label="人工模式" value={stats.manual} />
      </div>

      {stats.contact > 0 && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>有 {stats.contact} 位客人要找業務聯繫</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterMode('need_contact'); setPage(0); }} style={{ borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: 11 }}>查看</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <FilterBtn label="全部" value="all" count={stats.total} />
        <FilterBtn label="找業務" value="need_contact" count={stats.contact} color="var(--danger)" />
        <FilterBtn label="人工模式" value="manual" count={stats.manual} color="var(--gold)" />
      </div>

      <div className="controls">
        <input className="search-box" placeholder="搜尋姓名、電話..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <button className="btn btn-ghost" onClick={() => {
          if (!rows.length) return toast('沒有資料可匯出', 'error');
          downloadCSV(
            ['姓名', '電話', '公司', '型態', 'Email', '需聯繫', '模式', '建立日期'],
            rows.map(m => [m.display_name || '', m.phone || '', m.company || '', m.customer_type || '', m.email || '', m.need_contact ? '是' : '否', m.manual_mode ? '人工' : 'AI', m.created_at ? new Date(m.created_at).toLocaleDateString('zh-TW') : '']),
            `會員管理_${new Date().toISOString().slice(0, 10)}.csv`
          );
          toast('已下載 CSV', 'success');
        }} style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>下載 CSV</button>
        <button className="btn btn-ghost" onClick={load}>↻</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>姓名</th><th>電話</th><th>公司</th><th>型態</th><th>聯繫</th><th>模式</th><th>估價單</th><th>操作</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="8"><div className="loading"><div className="spinner" /><br />載入中...</div></td></tr>
            : rows.length === 0 ? <tr><td colSpan="8"><div className="empty"><div className="icon">👥</div>沒有會員資料</div></td></tr>
            : rows.map(m => (
              <tr key={m.id} style={m.need_contact ? { background: 'rgba(239,68,68,.04)' } : undefined}>
                <td>
                  <strong>{m.display_name || '—'}</strong>
                  {m.need_contact && <div style={{ fontSize: 9, color: 'var(--danger)', fontWeight: 700 }}>需聯繫</div>}
                </td>
                <td>{m.phone || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.company || '—'}</td>
                <td style={{ fontSize: 11 }}>{m.customer_type || '—'}</td>
                <td>
                  <button onClick={() => toggleNeedContact(m)} style={{
                    padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 10,
                    border: `1px solid ${m.need_contact ? 'var(--danger)' : 'var(--border)'}`,
                    background: m.need_contact ? 'rgba(239,68,68,.12)' : 'transparent',
                    color: m.need_contact ? 'var(--danger)' : 'var(--text-muted)',
                    fontWeight: m.need_contact ? 700 : 400
                  }}>{m.need_contact ? '需聯繫' : '—'}</button>
                </td>
                <td>
                  <button onClick={() => toggleManualMode(m)} style={{
                    padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 10,
                    border: `1px solid ${m.manual_mode ? 'var(--gold)' : 'var(--border)'}`,
                    background: m.manual_mode ? 'var(--gold-dim)' : 'transparent',
                    color: m.manual_mode ? 'var(--gold)' : 'var(--text-muted)',
                    fontWeight: m.manual_mode ? 700 : 400
                  }}>{m.manual_mode ? '人工' : 'AI'}</button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {(m.quotes?.length || 0) > 0
                    ? <button className="btn btn-ghost btn-sm" style={{ borderColor: 'var(--gold)', color: 'var(--gold)', fontWeight: 700, minWidth: 36 }} onClick={() => viewMemberQuotes(m)}>📋 {m.quotes.length}</button>
                    : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                </td>
                <td>
                  <div className="actions">
                    {m.line_user_id && <button className="btn btn-ghost btn-sm" onClick={() => viewChat(m.line_user_id, m.display_name)}>💬</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => setModal({ open: true, data: m })}>編輯</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteMember(m)}>刪除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>{total ? `顯示 ${from}-${to}，共 ${total} 筆` : ''}</span>
        <div className="page-btns">
          <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
          <button className="page-btn" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>›</button>
        </div>
      </div>

      {/* 編輯會員 Modal */}
      <Modal open={modal.open} onClose={() => setModal({ open: false, data: null })} title={d.id ? '編輯會員' : '新增會員'}
        footer={<><button className="btn btn-ghost" onClick={() => setModal({ open: false, data: null })}>取消</button><button className="btn btn-primary" type="submit" form="member-form">儲存</button></>}>
        <form id="member-form" onSubmit={saveMember} className="form-grid">
          <div className="form-group"><label>姓名</label><input name="name" defaultValue={d.display_name || ''} /></div>
          <div className="form-group"><label>電話</label><input name="phone" defaultValue={d.phone || ''} /></div>
          <div className="form-group"><label>公司</label><input name="company" defaultValue={d.company || ''} /></div>
          <div className="form-group"><label>客戶型態</label><select name="customer_type" defaultValue={d.customer_type || ''}>{CTYPE_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="form-group full"><label>Email</label><input name="email" defaultValue={d.email || ''} /></div>
          <div className="form-group full"><label>備註</label><input name="note" defaultValue={d.note || ''} /></div>
        </form>
      </Modal>

      {/* 會員估價單 Modal */}
      <Modal open={quotesModal.open} onClose={() => setQuotesModal({ open: false, name: '', quotes: [] })} title={`${quotesModal.name} 的估價單`} maxWidth={680}>
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {quotesModal.quotes.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>無估價單</div> :
            quotesModal.quotes.map(q => (
              <div key={q.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{q.quote_no}</strong>
                    <span className="badge" style={{ background: q.status === 'confirmed' ? 'rgba(34,197,94,.15)' : q.status === 'sent' ? 'rgba(59,130,246,.15)' : 'rgba(148,163,184,.15)', color: q.status === 'confirmed' ? '#22c55e' : q.status === 'sent' ? '#3b82f6' : '#94a3b8' }}>{q.status === 'confirmed' ? '已確認' : q.status === 'sent' ? '已送出' : q.status === 'cancelled' ? '已取消' : '草稿'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{q.product_code || ''} · {fmtDate(q.created_at)}</div>
                </div>
                <div className="price" style={{ fontSize: 16 }}>{fmtPrice(q.total_price)}</div>
              </div>
            ))}
        </div>
      </Modal>

      {/* 對話紀錄 Modal */}
      <Modal open={chatModal.open} onClose={() => setChatModal({ open: false, name: '', messages: [] })} title={`對話紀錄 — ${chatModal.name}`} maxWidth={640}>
        <div className="chat-wrap">
          {chatModal.messages.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>無對話紀錄</div> :
            chatModal.messages.map((msg, i) => (
              <div key={i}>
                <div className="chat-label">{msg.role === 'user' ? '客戶' : 'AI'}</div>
                <div className={`chat-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`}>{msg.content}</div>
              </div>
            ))}
        </div>
      </Modal>

      {/* Lightbox */}
      {lightbox && (
        <div style={{ display: 'flex', position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }} onClick={() => setLightbox('')}>
          <img src={lightbox} style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 16, objectFit: 'contain' }} alt="" />
        </div>
      )}
    </div>
  );
}

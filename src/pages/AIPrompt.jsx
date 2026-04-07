import { useState, useEffect } from 'react';
import { sbFetch } from '../api/supabase';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/UI/Modal';

function fmtDate(s) { return s ? new Date(s).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'; }

export default function AIPrompt() {
  const [mainSection, setMainSection] = useState(null);
  const [periodics, setPeriodics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mainEdit, setMainEdit] = useState(false);
  const [mainDraft, setMainDraft] = useState('');
  const [modal, setModal] = useState({ open: false, data: null });
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();

  async function load() {
    setLoading(true);
    try {
      const all = await sbFetch('ai_prompt_sections?select=*&order=sort_order.asc,created_at.desc');
      const main = (all || []).find(s => s.section_type === 'main');
      setMainSection(main || null);
      setPeriodics((all || []).filter(s => s.section_type === 'periodic'));
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // === Main prompt (admin only) ===
  async function saveMain() {
    if (!mainSection) return;
    try {
      await sbFetch(`ai_prompt_sections?id=eq.${mainSection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: mainDraft, updated_by: user?.display_name, updated_at: new Date().toISOString() })
      });
      toast('主要提示詞已更新', 'success');
      setMainEdit(false);
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  // === Periodic sections ===
  function openPeriodicModal(item) {
    setModal({
      open: true,
      data: item || { title: '', content: '', start_date: '', end_date: '', is_active: true }
    });
  }

  async function savePeriodic(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      section_type: 'periodic',
      title: fd.get('title'),
      content: fd.get('content'),
      start_date: fd.get('start_date') || null,
      end_date: fd.get('end_date') || null,
      is_active: fd.get('is_active') === 'true',
      updated_by: user?.display_name,
      updated_at: new Date().toISOString()
    };
    if (!body.title) { toast('請輸入標題', 'error'); return; }
    if (!body.content) { toast('請輸入內容', 'error'); return; }

    try {
      if (modal.data?.id) {
        await sbFetch(`ai_prompt_sections?id=eq.${modal.data.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast('已更新', 'success');
      } else {
        body.created_by = user?.display_name;
        await sbFetch('ai_prompt_sections', { method: 'POST', body: JSON.stringify(body) });
        toast('已新增', 'success');
      }
      setModal({ open: false, data: null });
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function deletePeriodic(item) {
    confirm('確認刪除？', `「${item.title}」將永久刪除。`, async () => {
      try {
        await sbFetch(`ai_prompt_sections?id=eq.${item.id}`, { method: 'DELETE' });
        toast('已刪除', 'success');
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function toggleActive(item) {
    try {
      await sbFetch(`ai_prompt_sections?id=eq.${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !item.is_active, updated_by: user?.display_name })
      });
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  const today = new Date().toISOString().slice(0, 10);
  const d = modal.data || {};

  const sectionS = { background: 'var(--surface)', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid var(--outline)' };
  const headS = { fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  const textareaS = { width: '100%', minHeight: 400, padding: 12, background: 'var(--surface-high)', border: '1px solid var(--outline)', borderRadius: 8, color: 'var(--text)', fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6, resize: 'vertical' };
  const preS = { whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)', maxHeight: 400, overflow: 'auto', padding: 12, background: 'var(--surface-high)', borderRadius: 8, fontFamily: 'monospace' };
  const badgeS = (active) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: active ? 'rgba(76,175,125,0.15)' : 'rgba(255,68,68,0.15)', color: active ? 'var(--success)' : 'var(--danger)' });

  if (loading) return <div className="loading"><div className="spinner" /><br />載入中...</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* === Section 1: Main Prompt === */}
      <div style={sectionS}>
        <div style={headS}>
          <span>🤖 主要系統提示詞</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
            {mainSection?.updated_by ? `最後更新: ${mainSection.updated_by} (${fmtDate(mainSection.updated_at)})` : ''}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          AI 估價助理的核心行為設定。{user?.isAdmin ? '管理員可編輯。' : '僅管理員可修改，目前為唯讀。'}
        </div>

        {mainEdit && user?.isAdmin ? (
          <>
            <textarea style={textareaS} value={mainDraft} onChange={e => setMainDraft(e.target.value)} />
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={saveMain}>儲存</button>
              <button className="btn btn-ghost" onClick={() => setMainEdit(false)}>取消</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>{mainDraft.length} 字元</span>
            </div>
          </>
        ) : (
          <>
            <pre style={preS}>{mainSection?.content || '（尚未設定）'}</pre>
            {user?.isAdmin && (
              <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => { setMainDraft(mainSection?.content || ''); setMainEdit(true); }}>
                編輯主要提示詞
              </button>
            )}
          </>
        )}
      </div>

      {/* === Section 2: Periodic Additions === */}
      <div style={sectionS}>
        <div style={headS}>
          <span>📅 期間限定附加話語</span>
          <button className="btn btn-primary btn-sm" onClick={() => openPeriodicModal(null)}>+ 新增</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          會自動附加在主要提示詞之後。可設定生效期間，過期自動停用。
        </div>

        {periodics.length === 0 ? (
          <div className="empty" style={{ padding: 30 }}><div className="icon">📝</div>目前沒有期間限定的附加話語</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {periodics.map(p => {
              const expired = p.end_date && p.end_date < today;
              const notStarted = p.start_date && p.start_date > today;
              const statusLabel = !p.is_active ? '已停用' : expired ? '已過期' : notStarted ? '未到期' : '生效中';
              const statusColor = !p.is_active || expired ? 'var(--danger)' : notStarted ? 'var(--text-muted)' : 'var(--success)';

              return (
                <div key={p.id} style={{ background: 'var(--surface-high)', borderRadius: 8, padding: 14, border: '1px solid var(--outline)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{p.title}</strong>
                      <span style={badgeS(p.is_active && !expired && !notStarted)}>{statusLabel}</span>
                    </div>
                    <div className="actions" style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(p)}>{p.is_active ? '停用' : '啟用'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openPeriodicModal(p)}>編輯</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deletePeriodic(p)}>刪除</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {p.start_date || p.end_date ? `${fmtDate(p.start_date)} ~ ${fmtDate(p.end_date)}` : '無期限'}
                    {p.created_by ? ` · ${p.created_by}` : ''}
                  </div>
                  <pre style={{ ...preS, maxHeight: 120, fontSize: 11 }}>{p.content}</pre>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* === Periodic Edit Modal === */}
      <Modal open={modal.open} onClose={() => setModal({ open: false, data: null })} title={d.id ? '編輯附加話語' : '新增附加話語'} maxWidth={600}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setModal({ open: false, data: null })}>取消</button>
          <button className="btn btn-primary" type="submit" form="periodic-form">儲存</button>
        </>}>
        {modal.open && (
          <form id="periodic-form" onSubmit={savePeriodic} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label>標題</label>
              <input name="title" defaultValue={d.title || ''} placeholder="例：春節促銷活動話術" required />
            </div>
            <div className="form-group">
              <label>內容（會附加在主提示詞之後）</label>
              <textarea name="content" defaultValue={d.content || ''} rows={8} placeholder="例：【春節活動】即日起至2/15，所有門款享 95 折優惠，AI 回覆時請主動告知客人..." style={{ width: '100%', minHeight: 150, padding: 10, background: 'var(--surface-high)', border: '1px solid var(--outline)', borderRadius: 8, color: 'var(--text)', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} required />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>開始日期（選填）</label>
                <input name="start_date" type="date" defaultValue={d.start_date || ''} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>結束日期（選填）</label>
                <input name="end_date" type="date" defaultValue={d.end_date || ''} />
              </div>
            </div>
            <div className="form-group">
              <label>狀態</label>
              <select name="is_active" defaultValue={d.is_active !== false ? 'true' : 'false'}>
                <option value="true">啟用</option>
                <option value="false">停用</option>
              </select>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { uploadFile } from '../api/storage';
import { sbFetch } from '../api/supabase';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import Modal from '../components/UI/Modal';

export default function Colors() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, data: null });
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      setRows(await sbFetch('color_cards?select=*&order=sort_order.asc,code.asc') || []);
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openModal(c) {
    setModal({ open: true, data: c || {} });
    setImageUrl(c?.image_url || '');
  }

  async function uploadImage(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('圖片不可超過 5MB', 'error'); return; }
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    setUploading(true);
    try {
      const url = await uploadFile('color-cards', fileName, file);
      setImageUrl(url);
      toast('圖片已上傳', 'success');
    } catch (e) { toast('上傳失敗: ' + e.message, 'error'); }
    setUploading(false);
  }

  async function save(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      code: (fd.get('code') || '').trim(),
      alt_code: (fd.get('alt_code') || '').trim() || null,
      name_en: (fd.get('name_en') || '').trim() || null,
      name_zh: (fd.get('name_zh') || '').trim() || null,
      category: (fd.get('category') || '').trim() || null,
      sort_order: parseInt(fd.get('sort_order'), 10) || 999,
      is_active: fd.get('is_active') !== 'false',
      image_url: imageUrl || null,
      updated_at: new Date().toISOString()
    };
    if (!body.code) { toast('色卡編號必填', 'error'); return; }
    try {
      if (modal.data?.id) {
        await sbFetch(`color_cards?id=eq.${modal.data.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await sbFetch('color_cards', { method: 'POST', body: JSON.stringify(body) });
      }
      toast('已儲存', 'success');
      setModal({ open: false, data: null });
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  function del(c) {
    confirm('確認刪除？', `${c.code} ${c.name_zh || ''} 將永久刪除。`, async () => {
      await sbFetch(`color_cards?id=eq.${c.id}`, { method: 'DELETE' });
      toast('已刪除', 'success');
      load();
    });
  }

  async function toggleActive(c) {
    try {
      await sbFetch(`color_cards?id=eq.${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !c.is_active, updated_at: new Date().toISOString() })
      });
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  const d = modal.data || {};
  const inputStyle = { padding: '9px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' };

  const filtered = rows.filter(r => {
    if (!showInactive && !r.is_active) return false;
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (r.code || '').toLowerCase().includes(s)
        || (r.alt_code || '').toLowerCase().includes(s)
        || (r.name_en || '').toLowerCase().includes(s)
        || (r.name_zh || '').toLowerCase().includes(s);
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap">
          <div className="page-title">色卡管理</div>
          <div className="page-subtitle">管理門扇色卡 — 編號、色票圖、英文/中文名稱</div>
        </div>
        <button className="btn btn-primary" onClick={() => openModal(null)}>+ 新增色卡</button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="搜尋編號 / 名稱..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 280, fontSize: 13 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
          顯示已停用
        </label>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>共 {filtered.length} 張</span>
      </div>

      {loading ? <div className="loading"><div className="spinner" /><br />載入中...</div> :
        filtered.length === 0 ? <div className="empty"><div className="icon">🎨</div>{search ? '查無符合的色卡' : '尚無色卡資料'}</div> :
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {filtered.map(c => (
            <div key={c.id} style={{
              background: 'var(--surface-low)', borderRadius: 'var(--radius)', overflow: 'hidden',
              border: `1px solid ${c.is_active ? 'var(--border)' : 'rgba(239,68,68,.3)'}`,
              opacity: c.is_active ? 1 : 0.6
            }}>
              {/* 色票圖 */}
              <div style={{ width: '100%', height: 140, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {c.image_url
                  ? <img src={c.image_url} alt={c.code} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>無圖</span>
                }
              </div>
              {/* 資訊 */}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', fontFamily: 'monospace', marginBottom: 4 }}>
                  {c.code}
                  {c.alt_code && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>/ {c.alt_code}</span>}
                </div>
                {c.name_en && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{c.name_en}</div>}
                {c.name_zh && <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name_zh}</div>}
                {!c.is_active && <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4, fontWeight: 700 }}>已停用</div>}
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => openModal(c)}>編輯</button>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => toggleActive(c)}>{c.is_active ? '停用' : '啟用'}</button>
                <button className="btn btn-danger btn-sm" style={{ flex: 1, fontSize: 11 }} onClick={() => del(c)}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      }

      <Modal open={modal.open} onClose={() => setModal({ open: false, data: null })} title={d.id ? '編輯色卡' : '新增色卡'} maxWidth={560}
        footer={<><button className="btn btn-ghost" onClick={() => setModal({ open: false, data: null })}>取消</button><button className="btn btn-primary" type="submit" form="color-form">儲存</button></>}>
        <form id="color-form" onSubmit={save} className="form-grid">
          <div className="form-group"><label>主編號 *</label><input name="code" defaultValue={d.code || ''} required placeholder="例：DP-2423M1" /></div>
          <div className="form-group"><label>副編號</label><input name="alt_code" defaultValue={d.alt_code || ''} placeholder="例：0-2423M1（選填）" /></div>
          <div className="form-group"><label>英文名稱</label><input name="name_en" defaultValue={d.name_en || ''} placeholder="例：Signal Grey Matt" /></div>
          <div className="form-group"><label>中文名稱</label><input name="name_zh" defaultValue={d.name_zh || ''} placeholder="例：銀灰消光" /></div>
          <div className="form-group"><label>分類 / 系列</label><input name="category" defaultValue={d.category || ''} placeholder="選填，例：消光、砂紋" /></div>
          <div className="form-group"><label>排序</label><input name="sort_order" type="number" defaultValue={d.sort_order || 999} /></div>
          <div className="form-group full" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" name="is_active" defaultChecked={d.is_active !== false} style={{ accentColor: 'var(--gold)' }} value="true" />
              啟用（取消勾選代表停用）
            </label>
          </div>

          {/* 色票圖 */}
          <div className="form-group full" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <label>色票圖片</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 6 }}>
              {imageUrl && (
                <div style={{ position: 'relative' }}>
                  <img src={imageUrl} alt="" style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                  <button type="button" onClick={() => setImageUrl('')} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', fontSize: 11 }}>
                    {uploading ? '上傳中...' : (imageUrl ? '替換圖片' : '上傳圖片')}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadImage(e.target.files[0])} disabled={uploading} />
                  </label>
                </div>
                <input
                  type="text" placeholder="或輸入圖片 URL" value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  style={{ ...inputStyle, fontSize: 11, padding: '6px 10px' }}
                />
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

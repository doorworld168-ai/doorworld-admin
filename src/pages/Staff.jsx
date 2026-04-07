import { useState, useEffect } from 'react';
import { sbFetch } from '../api/supabase';
import { fmtDate } from '../api/utils';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import Modal from '../components/UI/Modal';

const PERM_MODULES = [
  { key: 'members', label: '會員管理', actions: ['view', 'edit', 'delete'], group: '前置作業' },
  { key: 'quotes', label: '估價單', actions: ['view', 'edit', 'delete'], group: '前置作業' },
  { key: 'measurement', label: '丈量安排', actions: ['view', 'edit'], group: '前置作業' },
  { key: 'drafting', label: '製圖進度', actions: ['view', 'edit'], group: '前置作業' },
  { key: 'formalquote', label: '報價單', actions: ['view', 'edit', 'delete'], group: '前置作業' },
  { key: 'cases', label: '案件總覽', actions: ['view', 'edit', 'delete'], group: '案件進行' },
  { key: 'ordering', label: '下單追蹤', actions: ['view'], group: '案件進行' },
  { key: 'salesorder', label: '業務下單', actions: ['view', 'edit'], group: '案件進行' },
  { key: 'internalorder', label: '內勤下單', actions: ['view', 'edit'], group: '案件進行' },
  { key: 'chinafactory', label: '大陸工廠', actions: ['view', 'edit'], group: '案件進行' },
  { key: 'twfactory', label: '台灣工廠', actions: ['view', 'edit'], group: '案件進行' },
  { key: 'installation', label: '安裝排程', actions: ['view', 'edit'], group: '案件進行' },
  { key: 'payment', label: '收款追蹤', actions: ['view', 'edit'], group: '財務' },
  { key: 'finance', label: '財務報表', actions: ['view'], group: '財務' },
  { key: 'products', label: '產品管理', actions: ['view', 'edit', 'delete'], group: '設定' },
  { key: 'service', label: '施工費用', actions: ['view', 'edit'], group: '設定' },
  { key: 'accessories', label: '五金配件', actions: ['view', 'edit', 'delete'], group: '設定' }
];

const PERM_PRESETS = {
  sales: {
    members: { view: true, edit: true, delete: false }, quotes: { view: true, edit: true, delete: false },
    measurement: { view: true, edit: true }, drafting: { view: true, edit: false },
    formalquote: { view: true, edit: true, delete: false }, cases: { view: true, edit: false, delete: false },
    ordering: { view: true }, salesorder: { view: true, edit: true },
    internalorder: { view: true, edit: false }, chinafactory: { view: true, edit: false },
    twfactory: { view: true, edit: false }, installation: { view: true, edit: false },
    payment: { view: true, edit: false }, finance: { view: false },
    products: { view: true, edit: false, delete: false }, service: { view: true, edit: false },
    accessories: { view: true, edit: false, delete: false }
  },
  internal: {
    members: { view: true, edit: false, delete: false }, quotes: { view: true, edit: false, delete: false },
    measurement: { view: true, edit: false }, drafting: { view: true, edit: false },
    formalquote: { view: true, edit: false, delete: false }, cases: { view: true, edit: true, delete: false },
    ordering: { view: true }, salesorder: { view: true, edit: false },
    internalorder: { view: true, edit: true }, chinafactory: { view: true, edit: true },
    twfactory: { view: true, edit: true }, installation: { view: true, edit: true },
    payment: { view: true, edit: true }, finance: { view: true },
    products: { view: true, edit: false, delete: false }, service: { view: true, edit: false },
    accessories: { view: true, edit: false, delete: false }
  },
  drafting: {
    members: { view: false, edit: false, delete: false }, quotes: { view: true, edit: false, delete: false },
    measurement: { view: true, edit: true }, drafting: { view: true, edit: true },
    formalquote: { view: true, edit: true, delete: false }, cases: { view: true, edit: false, delete: false },
    ordering: { view: false }, salesorder: { view: false, edit: false },
    internalorder: { view: false, edit: false }, chinafactory: { view: false, edit: false },
    twfactory: { view: false, edit: false }, installation: { view: false, edit: false },
    payment: { view: false, edit: false }, finance: { view: false },
    products: { view: true, edit: false, delete: false }, service: { view: true, edit: false },
    accessories: { view: true, edit: false, delete: false }
  }
};

export default function Staff() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, data: null });
  const [perms, setPerms] = useState({});
  const [formData, setFormData] = useState({ name: '', username: '', password: '', is_active: 'true' });
  const toast = useToast();
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try { setRows(await sbFetch('staff?select=*&order=created_at.desc') || []); }
    catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openModal(s = null) {
    setFormData({
      name: s?.display_name || '',
      username: s?.username || '',
      password: '',
      is_active: s ? String(s.is_active) : 'true'
    });
    setPerms(s?.permissions || {});
    setModal({ open: true, data: s || {} });
  }

  function togglePerm(moduleKey, action, checked) {
    setPerms(prev => {
      const mp = { ...(prev[moduleKey] || {}) };
      mp[action] = checked;
      // If unchecking view, also uncheck edit and delete
      if (action === 'view' && !checked) {
        mp.edit = false;
        mp.delete = false;
      }
      return { ...prev, [moduleKey]: mp };
    });
  }

  function applyPreset(preset) {
    if (preset === 'none') {
      const empty = {};
      PERM_MODULES.forEach(m => {
        const obj = {};
        m.actions.forEach(a => { obj[a] = false; });
        empty[m.key] = obj;
      });
      setPerms(empty);
      return;
    }
    if (preset === 'all') {
      const full = {};
      PERM_MODULES.forEach(m => {
        const obj = {};
        m.actions.forEach(a => { obj[a] = true; });
        full[m.key] = obj;
      });
      setPerms(full);
      return;
    }
    const p = PERM_PRESETS[preset];
    if (p) setPerms({ ...p });
  }

  async function save() {
    if (!formData.name || !formData.username) { toast('姓名和帳號為必填', 'error'); return; }
    if (!modal.data?.id && !formData.password) { toast('新增員工請設定密碼', 'error'); return; }

    const body = {
      display_name: formData.name,
      username: formData.username,
      permissions: perms,
      is_active: formData.is_active === 'true'
    };
    if (formData.password) body.password = formData.password;

    try {
      if (modal.data?.id) {
        await sbFetch(`staff?id=eq.${modal.data.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast('員工帳號已更新', 'success');
      } else {
        await sbFetch('staff', { method: 'POST', body: JSON.stringify(body) });
        toast('員工帳號已新增', 'success');
      }
      setModal({ open: false, data: null });
      load();
    } catch (e) { toast('儲存失敗: ' + e.message, 'error'); }
  }

  function del(s) {
    confirm('確認刪除？', `員工 ${s.display_name} 將永久刪除。`, async () => {
      try {
        await sbFetch(`staff?id=eq.${s.id}`, { method: 'DELETE' });
        toast('已刪除', 'success');
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  const tdS = { padding: '6px 10px', border: '1px solid var(--border)' };

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">員工帳號</div><div className="page-subtitle">管理員工登入帳號與存取權限</div></div>
        <button className="btn btn-primary" onClick={() => openModal()}>+ 新增員工</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>姓名</th><th>帳號</th><th>狀態</th><th>權限</th><th>建立時間</th><th>操作</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6"><div className="loading"><div className="spinner" /><br />載入中...</div></td></tr>
            : rows.length === 0 ? <tr><td colSpan="6"><div className="empty"><div className="icon">👤</div>沒有員工</div></td></tr>
            : rows.map(s => (
              <tr key={s.id}>
                <td><strong>{s.display_name}</strong></td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.username}</td>
                <td>{s.is_active !== false ? <span style={{ color: 'var(--success)', fontSize: 11 }}>啟用</span> : <span style={{ color: 'var(--danger)', fontSize: 11 }}>停用</span>}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Object.entries(s.permissions || {}).filter(([, v]) => v?.view).map(([k]) => { const m = PERM_MODULES.find(p => p.key === k); return m ? m.label : k; }).join('、') || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(s.created_at)}</td>
                <td><div className="actions"><button className="btn btn-ghost btn-sm" onClick={() => openModal(s)}>編輯</button><button className="btn btn-danger btn-sm" onClick={() => del(s)}>刪除</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, data: null })} title={modal.data?.id ? '編輯員工' : '新增員工'} maxWidth={650}
        footer={<><button className="btn btn-ghost" onClick={() => setModal({ open: false, data: null })}>取消</button><button className="btn btn-primary" onClick={save}>儲存</button></>}>
        <div className="form-grid">
          <div className="form-group"><label>姓名</label><input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="form-group"><label>帳號</label><input value={formData.username} onChange={e => setFormData(p => ({ ...p, username: e.target.value }))} /></div>
          <div className="form-group"><label>密碼</label><input type="password" value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} placeholder={modal.data?.id ? '留空不修改' : '設定密碼'} /></div>
          <div className="form-group"><label>狀態</label>
            <select value={formData.is_active} onChange={e => setFormData(p => ({ ...p, is_active: e.target.value }))} style={{ padding: '9px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' }}>
              <option value="true">啟用</option><option value="false">停用</option>
            </select>
          </div>
        </div>

        {/* Permission presets */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontWeight: 700, fontSize: 13 }}>模組權限</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['業務', 'sales'], ['內勤', 'internal'], ['製圖', 'drafting'], ['全選', 'all'], ['清空', 'none']].map(([l, v]) => (
                <button key={v} className="btn btn-ghost btn-sm" onClick={() => applyPreset(v)} style={{ fontSize: 10, padding: '3px 8px', borderColor: v === 'all' ? 'var(--gold)' : 'var(--border)', color: v === 'all' ? 'var(--gold)' : 'var(--text-muted)' }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...tdS, fontWeight: 600 }}>模組</th>
                  <th style={{ ...tdS, textAlign: 'center', fontWeight: 600 }}>查看</th>
                  <th style={{ ...tdS, textAlign: 'center', fontWeight: 600 }}>編輯</th>
                  <th style={{ ...tdS, textAlign: 'center', fontWeight: 600 }}>刪除</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let lastGroup = '';
                  return PERM_MODULES.map(m => {
                    const groupRow = m.group !== lastGroup ? (
                      <tr key={`g-${m.group}`}>
                        <td colSpan={4} style={{ ...tdS, background: 'var(--surface-2)', fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1 }}>{m.group}</td>
                      </tr>
                    ) : null;
                    lastGroup = m.group;
                    const mp = perms[m.key] || {};
                    const hasEdit = m.actions.includes('edit');
                    const hasDel = m.actions.includes('delete');
                    return [
                      groupRow,
                      <tr key={m.key}>
                        <td style={{ ...tdS, fontWeight: 500 }}>{m.label}</td>
                        <td style={{ ...tdS, textAlign: 'center' }}><input type="checkbox" checked={!!mp.view} onChange={e => togglePerm(m.key, 'view', e.target.checked)} style={{ accentColor: 'var(--gold)' }} /></td>
                        <td style={{ ...tdS, textAlign: 'center' }}>{hasEdit ? <input type="checkbox" checked={!!mp.edit} onChange={e => togglePerm(m.key, 'edit', e.target.checked)} style={{ accentColor: 'var(--gold)' }} /> : '—'}</td>
                        <td style={{ ...tdS, textAlign: 'center' }}>{hasDel ? <input type="checkbox" checked={!!mp.delete} onChange={e => togglePerm(m.key, 'delete', e.target.checked)} style={{ accentColor: 'var(--gold)' }} /> : '—'}</td>
                      </tr>
                    ];
                  }).flat().filter(Boolean);
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { sbFetch, proxyCount } from '../api/supabase';
import { fmtPrice, PAGE_SIZE } from '../api/utils';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../components/UI/Toast';
import { useConfirm } from '../components/UI/Confirm';
import Modal from '../components/UI/Modal';
import StatCard from '../components/UI/StatCard';

export default function Products() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, data: null });
  const [lightbox, setLightbox] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const debouncedSearch = useDebounce(search);

  const load = useCallback(async () => {
    setLoading(true);
    let path = 'products?select=*&order=series_code.asc,year.asc,seq.asc';
    if (debouncedSearch) path += `&or=(full_code.ilike.*${encodeURIComponent(debouncedSearch)}*,name.ilike.*${encodeURIComponent(debouncedSearch)}*)`;
    if (filterActive !== '') path += `&is_active=eq.${filterActive}`;
    try {
      setTotal(await proxyCount(path.replace('select=*', 'select=id')));
      setRows(await sbFetch(path + `&offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`) || []);
    } catch (e) { toast(e.message, 'error'); }
    setLoading(false);
  }, [debouncedSearch, filterActive, page, toast]);

  useEffect(() => { load(); }, [load]);

  function openEdit(p) { setModal({ open: true, data: p || {} }); }

  async function save(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      full_code: fd.get('code'), name: fd.get('name'), style: fd.get('style'),
      price: Number(fd.get('price')) || null, price_mother: Number(fd.get('price_mother')) || null,
      price_double: Number(fd.get('price_double')) || null, price_fire: Number(fd.get('price_fire')) || null,
      thumbnail_url: fd.get('thumb') || null, is_active: fd.get('active') === 'true'
    };
    try {
      if (modal.data?.id) {
        await sbFetch(`products?id=eq.${modal.data.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await sbFetch('products', { method: 'POST', body: JSON.stringify(body) });
      }
      toast('已儲存', 'success');
      setModal({ open: false, data: null });
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function del(p) {
    confirm('確認刪除？', `產品 ${p.full_code} 將永久刪除。`, async () => {
      try {
        await sbFetch(`products?id=eq.${p.id}`, { method: 'DELETE' });
        toast('已刪除', 'success');
        load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  const from = page * PAGE_SIZE + 1, to = Math.min(from + PAGE_SIZE - 1, total);
  const d = modal.data || {};

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">產品管理</div><div className="page-subtitle">管理門的世界所有產品與定價</div></div>
        <button className="btn btn-primary" onClick={() => openEdit(null)}>+ 新增產品</button>
      </div>
      <div className="stats">
        <StatCard label="總產品" value={total} />
      </div>
      <div className="controls">
        <input className="search-box" placeholder="搜尋產品編號、名稱..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <select value={filterActive} onChange={e => { setFilterActive(e.target.value); setPage(0); }} style={{ padding: '9px 32px 9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
          <option value="">全部</option><option value="true">上架</option><option value="false">下架</option>
        </select>
        <button className="btn btn-ghost" onClick={load}>↻</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>圖片</th><th>編號</th><th>名稱</th><th>風格</th><th>牌價(單門)</th><th>牌價(子母)</th><th>牌價(雙開)</th><th>牌價(防火)</th><th>狀態</th><th>操作</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="10"><div className="loading"><div className="spinner" /><br />載入中...</div></td></tr>
            : rows.length === 0 ? <tr><td colSpan="10"><div className="empty"><div className="icon">🚪</div>沒有產品資料</div></td></tr>
            : rows.map(p => (
              <tr key={p.id}>
                <td>{p.thumbnail_url ? <img className="thumb" src={p.thumbnail_url} onClick={() => setLightbox(p.thumbnail_url)} style={{ cursor: 'zoom-in' }} alt="" /> : <div className="no-thumb">🚪</div>}</td>
                <td><strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.full_code || '—'}</strong></td>
                <td>{p.name || '—'}</td>
                <td>{p.style || '—'}</td>
                <td className="price">{fmtPrice(p.price)}</td>
                <td className="price">{fmtPrice(p.price_mother)}</td>
                <td className="price">{fmtPrice(p.price_double)}</td>
                <td className="price">{fmtPrice(p.price_fire)}</td>
                <td><span className={`badge ${p.is_active ? 'badge-active' : 'badge-inactive'}`}>{p.is_active ? '上架' : '下架'}</span></td>
                <td><div className="actions"><button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>編輯</button><button className="btn btn-danger btn-sm" onClick={() => del(p)}>刪除</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>{total ? `${from}-${to} / ${total}` : ''}</span>
        <div className="page-btns">
          <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ 上一頁</button>
          <button className="page-btn" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>下一頁 ›</button>
        </div>
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, data: null })} title={d.id ? '編輯產品' : '新增產品'}
        footer={<><button className="btn btn-ghost" onClick={() => setModal({ open: false, data: null })}>取消</button><button className="btn btn-primary" type="submit" form="prod-form">儲存</button></>}>
        <form id="prod-form" onSubmit={save} className="form-grid">
          <div className="form-group"><label>產品編號</label><input name="code" defaultValue={d.full_code || ''} required /></div>
          <div className="form-group"><label>名稱</label><input name="name" defaultValue={d.name || ''} /></div>
          <div className="form-group"><label>風格</label><input name="style" defaultValue={d.style || ''} /></div>
          <div className="form-group"><label>狀態</label><select name="active" defaultValue={String(d.is_active ?? true)}><option value="true">上架</option><option value="false">下架</option></select></div>
          <div className="form-group"><label>牌價(單門)</label><input name="price" type="number" defaultValue={d.price || ''} /></div>
          <div className="form-group"><label>牌價(子母)</label><input name="price_mother" type="number" defaultValue={d.price_mother || ''} /></div>
          <div className="form-group"><label>牌價(雙開)</label><input name="price_double" type="number" defaultValue={d.price_double || ''} /></div>
          <div className="form-group"><label>牌價(防火)</label><input name="price_fire" type="number" defaultValue={d.price_fire || ''} /></div>
          <div className="form-group full"><label>縮圖網址</label><input name="thumb" defaultValue={d.thumbnail_url || ''} /></div>
        </form>
      </Modal>

      {lightbox && (
        <div id="img-lightbox" style={{ display: 'flex', position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }} onClick={() => setLightbox('')}>
          <img src={lightbox} style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.6)', objectFit: 'contain' }} alt="" />
        </div>
      )}
    </div>
  );
}

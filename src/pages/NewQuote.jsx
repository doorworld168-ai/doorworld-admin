import { useState, useEffect, useRef } from 'react';
import { sbFetch } from '../api/supabase';
import { fmtPrice, DOOR_TYPE_LABEL } from '../api/utils';
import { useToast } from '../components/UI/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const INSTALL_LABELS = { wet: '濕式安裝', dry: '乾式安裝', none: '不安裝' };

export default function NewQuote() {
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [serviceCosts, setServiceCosts] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [customReqs, setCustomReqs] = useState({}); // service_items.id -> bool
  const [twDistricts, setTwDistricts] = useState({});
  const searchTimerM = useRef(null);
  const searchTimerP = useRef(null);
  const searchSeqM = useRef(0);
  const searchSeqP = useRef(0);

  useEffect(() => {
    return () => {
      clearTimeout(searchTimerM.current);
      clearTimeout(searchTimerP.current);
    };
  }, []);

  const [form, setForm] = useState({
    member_id: null, line_user_id: '', customer_name: '', customer_phone: '',
    city: '', district: '', addr: '', note: '',
    product_id: null, product_code: '', door_type: 'single', unit_price: 0,
    width_cm: '', height_cm: '', quantity: 1,
    demolition: false, install_type: 'wet', soundproof: false, smoke_seal: false, fireproof: false,
    elevator: true, floor_count: 0
  });

  useEffect(() => {
    sbFetch('service_costs?select=*').then(d => setServiceCosts(d || [])).catch(() => {});
    sbFetch('service_items?select=*&is_active=eq.true&show_on_quote=eq.true&order=sort_order.asc,name.asc').then(d => setServiceItems(d || [])).catch(() => {});
    fetch('https://raw.githubusercontent.com/donma/TaiwanAddressCityAreaRoadChineseEnglishJSON/master/CityCountyData.json')
      .then(r => r.json()).then(data => {
        const map = {};
        data.forEach(c => { map[c.CityName] = c.AreaList.map(a => a.AreaName); });
        setTwDistricts(map);
      }).catch(() => {});
  }, []);

  function searchMembers(q) {
    setMemberSearch(q);
    clearTimeout(searchTimerM.current);
    if (!q.trim()) { setShowMembers(false); return; }
    const seq = ++searchSeqM.current;
    searchTimerM.current = setTimeout(async () => {
      try {
        const data = await sbFetch(`members?or=(display_name.ilike.*${encodeURIComponent(q)}*,phone.ilike.*${encodeURIComponent(q)}*)&limit=10`);
        if (seq !== searchSeqM.current) return;
        setMembers(data || []);
        setShowMembers(true);
      } catch (e) {
        if (seq === searchSeqM.current) toast(e.message, 'error');
      }
    }, 300);
  }

  function selectMember(m) {
    setForm(f => ({ ...f, member_id: m.id, line_user_id: m.line_user_id || '', customer_name: m.display_name || '', customer_phone: m.phone || '' }));
    setMemberSearch(m.display_name || '');
    setShowMembers(false);
  }

  function searchProducts(q) {
    setProductSearch(q);
    clearTimeout(searchTimerP.current);
    if (!q.trim()) { setShowProducts(false); return; }
    const seq = ++searchSeqP.current;
    searchTimerP.current = setTimeout(async () => {
      try {
        const data = await sbFetch(`products?or=(full_code.ilike.*${encodeURIComponent(q)}*,name.ilike.*${encodeURIComponent(q)}*)&is_active=eq.true&limit=10`);
        if (seq !== searchSeqP.current) return;
        setProducts(data || []);
        setShowProducts(true);
      } catch (e) {
        if (seq === searchSeqP.current) toast(e.message, 'error');
      }
    }, 300);
  }

  function selectProduct(p) {
    const priceKey = form.door_type === 'mother' ? 'price_mother' : form.door_type === 'double' ? 'price_double' : form.fireproof ? 'price_fire' : 'price';
    setForm(f => ({ ...f, product_id: p.id, product_code: p.full_code, unit_price: p[priceKey] || p.price || 0 }));
    setProductSearch(p.full_code + ' ' + (p.name || ''));
    setShowProducts(false);
  }

  function getStdSize() {
    if (form.door_type === 'mother') return { w: 140, h: 210 };
    if (form.door_type === 'double') return { w: 180, h: 210 };
    return { w: 100, h: 210 };
  }

  function calcOversize() {
    const std = getStdSize();
    const w = Number(form.width_cm) || std.w;
    const h = Number(form.height_cm) || std.h;
    let charge = 0;
    if (w > std.w) charge += Math.ceil((w - std.w) / 10) * 2000;
    if (h > std.h) charge += Math.ceil((h - std.h) / 10) * 2000;
    return charge;
  }

  function calcAddon() {
    const sc = serviceCosts.find(s => s.door_type === form.door_type) || {};
    let total = 0;
    if (form.demolition) total += Number(sc.old_door_removal) || 0;
    if (form.install_type === 'wet') total += (Number(sc.wet_grout) || 0) + (Number(sc.wet_paint) || 0);
    if (form.install_type === 'dry') total += Number(sc.dry_frame) || 0;
    if (form.soundproof) total += Number(sc.soundproof_basic) || 0;
    if (form.smoke_seal) total += Number(sc.smoke_seal) || 0;
    if (form.fireproof) total += Number(sc.fire_cert_60a) || 0;
    // 自訂附加項目（與報價單共用 service_items）
    serviceItems.forEach(it => { if (customReqs[it.id]) total += Number(it.unit_price) || 0; });
    return total;
  }

  // 顯示在 checkbox 旁邊的單價
  function priceFor(key) {
    const sc = serviceCosts.find(s => s.door_type === form.door_type) || {};
    if (key === 'demolition') return Number(sc.old_door_removal) || 0;
    if (key === 'soundproof') return Number(sc.soundproof_basic) || 0;
    if (key === 'smoke_seal') return Number(sc.smoke_seal) || 0;
    if (key === 'fireproof') return Number(sc.fire_cert_60a) || 0;
    if (key === 'wet') return (Number(sc.wet_grout) || 0) + (Number(sc.wet_paint) || 0);
    if (key === 'dry') return Number(sc.dry_frame) || 0;
    return 0;
  }

  function calcElevator() {
    if (form.elevator || !form.floor_count) return 0;
    return form.floor_count * 500 * (form.quantity || 1);
  }

  function calcTotal() {
    const base = (form.unit_price || 0) * (form.quantity || 1);
    return base + calcOversize() + calcAddon() + calcElevator();
  }

  async function submit() {
    if (!form.product_code) { toast('請選擇產品', 'error'); return; }
    const no = 'QT-' + new Date().toISOString().replace(/[-T:]/g, '').slice(0, 14);
    const addr = [form.city, form.district, form.addr].filter(Boolean).join('');
    const body = {
      quote_no: no, status: 'draft',
      customer_name: form.customer_name || null, customer_phone: form.customer_phone || null,
      customer_addr: addr || null, note: form.note || null,
      member_id: form.member_id || null, line_user_id: form.line_user_id || null,
      product_code: form.product_code, product_id: form.product_id,
      door_type: form.door_type, width_cm: Number(form.width_cm) || null, height_cm: Number(form.height_cm) || null,
      quantity: form.quantity || 1, unit_price: form.unit_price || 0,
      oversize_charge: calcOversize(), elevator_charge: calcElevator(), addon_total: calcAddon(),
      total_price: calcTotal(), created_by: user?.display_name || ''
    };
    try {
      await sbFetch('quotes', { method: 'POST', body: JSON.stringify(body) });
      toast('估價單已建立: ' + no, 'success');
      navigate('/quotes');
    } catch (e) { toast(e.message, 'error'); }
  }

  const std = getStdSize();
  const inp = (label, key, type = 'text', extra = {}) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label style={{ fontSize: 12 }}>{label}</label>
      <input type={type} value={form[key] ?? ''} onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? e.target.value : e.target.value }))}
        className="search-box" style={{ padding: '8px 12px', fontSize: 13, minWidth: 0 }} {...extra} />
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">新增估價單</div><div className="page-subtitle">建立新的客戶報價單</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left: customer + product */}
        <div>
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>客戶資訊</div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
              <div className="form-group" style={{ margin: 0, position: 'relative' }}>
                <label style={{ fontSize: 12 }}>搜尋會員</label>
                <input value={memberSearch} onChange={e => searchMembers(e.target.value)} className="search-box" style={{ padding: '8px 12px', fontSize: 13, minWidth: 0 }} placeholder="輸入姓名或電話搜尋..." />
                {showMembers && members.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.4)' }}>
                    {members.map(m => <div key={m.id} onClick={() => selectMember(m)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 14 }} onMouseOver={e => e.currentTarget.style.background = 'rgba(201,162,39,0.08)'} onMouseOut={e => e.currentTarget.style.background = ''}>{m.display_name} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{m.phone || ''}</span></div>)}
                  </div>
                )}
              </div>
              {inp('姓名', 'customer_name')}{inp('電話', 'customer_phone')}
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>地址</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value, district: '' }))} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
                    <option value="">縣市</option>
                    {Object.keys(twDistricts).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
                    <option value="">鄉鎮區</option>
                    {(twDistricts[form.city] || []).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <input value={form.addr} onChange={e => setForm(f => ({ ...f, addr: e.target.value }))} className="search-box" style={{ padding: '8px 12px', fontSize: 13, minWidth: 0, marginTop: 6 }} placeholder="路名、門牌" />
              </div>
              {inp('備註', 'note')}
            </div>
          </div>

          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>產品選擇</div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
              <div className="form-group" style={{ margin: 0, position: 'relative' }}>
                <label style={{ fontSize: 12 }}>搜尋產品</label>
                <input value={productSearch} onChange={e => searchProducts(e.target.value)} className="search-box" style={{ padding: '8px 12px', fontSize: 13, minWidth: 0 }} placeholder="輸入產品編號或名稱..." />
                {showProducts && products.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.4)' }}>
                    {products.map(p => <div key={p.id} onClick={() => selectProduct(p)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }} onMouseOver={e => e.currentTarget.style.background = 'rgba(201,162,39,0.08)'} onMouseOut={e => e.currentTarget.style.background = ''}>
                      <div><strong>{p.full_code}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.name || ''}</div></div>
                      <span style={{ marginLeft: 'auto', color: 'var(--gold)' }}>{fmtPrice(p.price)}</span>
                    </div>)}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>門型</label>
                  <select value={form.door_type} onChange={e => setForm(f => ({ ...f, door_type: e.target.value }))} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' }}>
                    <option value="single">單門</option><option value="mother">子母門</option><option value="double">雙開門</option>
                  </select>
                </div>
                {inp('數量', 'quantity', 'number')}
                {inp(`寬度 (標準 ${std.w}cm)`, 'width_cm', 'number')}
                {inp(`高度 (標準 ${std.h}cm)`, 'height_cm', 'number')}
              </div>
            </div>
          </div>
        </div>

        {/* Right: options + summary */}
        <div>
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>施工選項</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['demolition', '拆除舊門'], ['soundproof', '隔音'], ['smoke_seal', '遮煙'], ['fireproof', '防火證']].map(([k, l]) => {
                const p = priceFor(k);
                return (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} style={{ accentColor: 'var(--gold)' }} />{l}
                    </span>
                    <span style={{ fontSize: 12, color: p > 0 ? 'var(--gold)' : 'var(--text-muted)', fontWeight: p > 0 ? 700 : 400 }}>{p > 0 ? '+' + fmtPrice(p) : '—'}</span>
                  </label>
                );
              })}
              <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: 12 }}>安裝方式 <span style={{ color: 'var(--gold)', marginLeft: 6 }}>{priceFor(form.install_type) > 0 ? '+' + fmtPrice(priceFor(form.install_type)) : ''}</span></label>
                <select value={form.install_type} onChange={e => setForm(f => ({ ...f, install_type: e.target.value }))} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' }}>
                  <option value="wet">濕式安裝</option><option value="dry">乾式安裝</option><option value="none">不安裝</option>
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.elevator} onChange={e => setForm(f => ({ ...f, elevator: e.target.checked }))} style={{ accentColor: 'var(--gold)' }} />有電梯
              </label>
              {!form.elevator && inp('樓層數', 'floor_count', 'number')}
            </div>

            {/* 自訂附加項目（共用 service_items） */}
            {serviceItems.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>附加項目（共用施工費用設定）</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {serviceItems.map(it => (
                    <label key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, cursor: 'pointer' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={!!customReqs[it.id]} onChange={e => setCustomReqs(p => ({ ...p, [it.id]: e.target.checked }))} style={{ accentColor: 'var(--gold)' }} />
                        {it.name}
                      </span>
                      <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 700 }}>+{fmtPrice(it.unit_price)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>報價摘要</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>門型</span><span>{DOOR_TYPE_LABEL[form.door_type]}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>單價 × {form.quantity || 1}</span><span className="price">{fmtPrice(form.unit_price * (form.quantity || 1))}</span></div>
              {calcOversize() > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>超尺寸加價</span><span className="price">{fmtPrice(calcOversize())}</span></div>}
              {calcAddon() > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>施工附加</span><span className="price">{fmtPrice(calcAddon())}</span></div>}
              {calcElevator() > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>無電梯費</span><span className="price">{fmtPrice(calcElevator())}</span></div>}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', letterSpacing: 2 }}>總計</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--gold)' }}>{fmtPrice(calcTotal())}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit}>建立估價單</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setForm({ member_id: null, line_user_id: '', customer_name: '', customer_phone: '', city: '', district: '', addr: '', note: '', product_id: null, product_code: '', door_type: 'single', unit_price: 0, width_cm: '', height_cm: '', quantity: 1, demolition: false, install_type: 'wet', soundproof: false, smoke_seal: false, fireproof: false, elevator: true, floor_count: 0 }); setMemberSearch(''); setProductSearch(''); }}>清空重填</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

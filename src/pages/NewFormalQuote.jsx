import { useState, useEffect, useRef } from 'react';
import { sbFetch } from '../api/supabase';
import { fmtPrice, DOOR_TYPE_LABEL } from '../api/utils';
import { useToast } from '../components/UI/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const TW_DISTRICTS_URL = 'https://raw.githubusercontent.com/donma/TaiwanAddressCityAreaRoadChineseEnglishJSON/master/CityCountyData.json';

const FIRE_TYPES = [
  { value: 'none', label: '不防火' },
  { value: 'f60a', label: 'f60A 防火' },
  { value: 'f60a_smoke', label: 'f60A 遮煙門' },
  { value: 'soundproof', label: '隔音' }
];

const INSTALL_METHODS = [
  { value: '甲方派送安裝', label: '甲方派送安裝' },
  { value: '乙方取件安裝', label: '乙方取件安裝' }
];

const PAY_METHODS = [
  { value: '', label: '未指定' },
  { value: 'cash', label: '現金' },
  { value: 'transfer', label: '匯款' },
  { value: 'card', label: '信用卡(綠界)' },
  { value: 'measure_paid', label: '丈量費已付' }
];

const ACC_CATS = ['lock', 'hinge', 'sill', 'closer', 'frame'];
const ACC_LABELS = { lock: '門鎖', hinge: '鉸鍊', sill: '門檻', closer: '門弓器', frame: '門框' };

export default function NewFormalQuote() {
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const productTimer = useRef(null);
  const productSeq = useRef(0);

  useEffect(() => {
    return () => { clearTimeout(productTimer.current); };
  }, []);

  const [twDistricts, setTwDistricts] = useState({});
  const [staffList, setStaffList] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [accessories, setAccessories] = useState([]);
  const [products, setProducts] = useState([]);
  const [showProducts, setShowProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [importedQuote, setImportedQuote] = useState(null);

  const [form, setForm] = useState({
    region: 'NTPC', category: 'D', year: new Date().getFullYear().toString(),
    month: String(new Date().getMonth() + 1).padStart(2, '0'), seq: '001',
    contact: '', phone: '', taxId: '', city: '', dist: '', address: '',
    custType: '', salesPerson: '',
    doorType: 'single', fireType: 'none', direction: '',
    frameThick: '', panelThick: '', artFrame: '', deliveryType: '框扇同時',
    color: '', lockStyle: '', installMethod: '甲方派送安裝',
    width: '', height: '', qty: 1, unitPrice: '', discount: '1', installFee: 8000,
    addonItems: '', note: '', deliveryDays: 75, hasElevator: true, floor: 0,
    quoteId: '',
    // ─ 公司報價單範本新增欄位 ─
    material: '', frontPanelStyle: '', backPanelStyle: '',
    deliveryFee: '', drawingNo: '', frameCount: '',
    measureFee: 3000,
    payMeasure: '', payDeposit: '', payBalance: '',
  });

  const [accState, setAccState] = useState({}); // cat -> { useUpgrade: bool }
  const [calcResult, setCalcResult] = useState(null);

  // Checkboxes — 加入「無、站框」
  const [reqs, setReqs] = useState({ none: false, demolish: false, recycle: false, occupy: false, wet: false, dry: false, frame: false });

  // Auto-generate next sequence number for this month
  async function loadNextSeq(region, category, year, month) {
    try {
      const prefix = `${region}-${category}-${year}-${month}-`;
      const existing = await sbFetch(`cases?select=formal_quote_no&formal_quote_no=like.${encodeURIComponent(prefix)}*&order=formal_quote_no.desc&limit=1`);
      if (existing && existing.length > 0) {
        const lastNo = existing[0].formal_quote_no;
        const lastSeq = parseInt(lastNo.split('-').pop()) || 0;
        return String(lastSeq + 1).padStart(3, '0');
      }
      return '001';
    } catch { return '001'; }
  }

  useEffect(() => {
    fetch(TW_DISTRICTS_URL).then(r => r.json()).then(data => {
      const map = {};
      data.forEach(c => { map[c.CityName] = c.AreaList.map(a => a.AreaName); });
      setTwDistricts(map);
    }).catch(() => {});
    sbFetch('staff?select=display_name&is_active=eq.true').then(d => setStaffList((d || []).map(s => s.display_name))).catch(() => {});
    sbFetch('quotes?select=*&status=neq.cancelled&order=created_at.desc&limit=100').then(d => setQuotes(d || [])).catch(() => {});
    sbFetch('accessories?select=*&is_active=eq.true&order=category.asc,sort_order.asc').then(d => setAccessories(d || [])).catch(() => {});
    // Auto seq
    loadNextSeq(form.region, form.category, form.year, form.month).then(seq => setForm(f => ({ ...f, seq })));
  }, []);

  // Calculate totals whenever relevant fields change
  useEffect(() => {
    const unitPrice = parseInt(form.unitPrice) || 0;
    const qty = parseInt(form.qty) || 1;
    const discount = parseFloat(form.discount) || 1;
    const installFee = parseInt(form.installFee) || 0;

    let addonTotal = 0;
    const addonLines = [];
    form.addonItems.split('\n').forEach(line => {
      line = line.trim();
      if (!line) return;
      const match = line.match(/(\d[\d,]+)\s*$/);
      if (match) {
        const amt = parseInt(match[1].replace(/,/g, ''));
        const label = line.replace(match[0], '').trim();
        addonTotal += amt;
        addonLines.push([label, amt]);
      }
    });

    const doorSubtotal = unitPrice * qty;
    const discounted = Math.round(doorSubtotal * discount);
    const total = discounted + addonTotal + installFee;
    const deposit = Math.round(total * 0.5);
    const balance = total - deposit;

    setCalcResult({ unitPrice, qty, discount, doorSubtotal, discounted, addonTotal, addonLines, installFee, total, deposit, balance });
  }, [form.unitPrice, form.qty, form.discount, form.installFee, form.addonItems]);

  function selectQuote(id) {
    setForm(f => ({ ...f, quoteId: id }));
    if (!id) { setImportedQuote(null); return; }
    const q = quotes.find(r => r.id === id);
    if (!q) return;
    setImportedQuote(q);
    setForm(f => ({
      ...f,
      contact: q.customer_name || '', phone: q.customer_phone || '', address: q.customer_addr || '',
      doorType: q.door_type === 'fire' ? 'single' : (q.door_type || 'single'),
      fireType: q.door_type === 'fire' ? 'f60a' : 'none',
      qty: q.quantity || 1,
      width: q.width_cm ? String(q.width_cm * 10) : '',
      height: q.height_cm ? String(q.height_cm * 10) : '',
      unitPrice: q.unit_price ? String(q.unit_price) : ''
    }));
    if (q.product_code) {
      setProductSearch(q.product_code);
      searchProducts(q.product_code);
    }
  }

  function searchProducts(q) {
    setProductSearch(q);
    clearTimeout(productTimer.current);
    if (!q.trim()) { setShowProducts(false); return; }
    const seq = ++productSeq.current;
    productTimer.current = setTimeout(async () => {
      try {
        const data = await sbFetch(`products?select=*&is_active=eq.true&or=(full_code.ilike.*${encodeURIComponent(q)}*,name.ilike.*${encodeURIComponent(q)}*)&limit=6`);
        if (seq !== productSeq.current) return;
        setProducts(data || []);
        setShowProducts(true);
      } catch (e) {
        if (seq === productSeq.current) toast(e.message, 'error');
      }
    }, 300);
  }

  function selectProduct(p) {
    setSelectedProduct(p);
    setProductSearch(p.full_code);
    setShowProducts(false);
    // Auto-fill unit price
    let price = 0;
    if (form.fireType !== 'none') price = p.price_fire || p.price || 0;
    else if (form.doorType === 'single') price = p.price || 0;
    else if (form.doorType === 'mother') price = p.price_mother || 0;
    else if (form.doorType === 'double') price = p.price_double || 0;
    if (price) setForm(f => ({ ...f, unitPrice: String(price) }));
  }

  function collectAccessories() {
    return ACC_CATS.map(k => {
      const items = accessories.filter(a => a.category === k);
      const isFire = form.fireType !== 'none';
      const allStd = items.filter(a => a.type === 'standard');
      const fireStd = allStd.filter(a => a.fire_only);
      const regularStd = allStd.filter(a => !a.fire_only);
      const activeStd = isFire && fireStd.length ? fireStd : regularStd;
      const upgItems = items.filter(a => a.type === 'upgrade');

      return {
        key: k,
        label: ACC_LABELS[k],
        standard: activeStd.map(a => a.name).join(', ') || '',
        upgrade: accState[k]?.selectedUpgrade || (upgItems[0]?.name || ''),
        useUpgrade: accState[k]?.useUpgrade || false
      };
    });
  }

  async function submit() {
    if (!form.contact) { toast('請填寫聯絡人', 'error'); return; }
    if (!form.unitPrice) { toast('請填寫門扇單價', 'error'); return; }
    const c = calcResult || {};
    const formalQuoteNo = `${form.region}-${form.category}-${form.year}-${form.month}-${form.seq || '001'}`;
    const reqLabelMap = { none: '無', demolish: '拆舊', recycle: '回收', occupy: '佔框', wet: '濕式施工', dry: '乾式包框', frame: '站框' };
    const specialReqs = Object.entries(reqs).filter(([, v]) => v).map(([k]) => reqLabelMap[k]).filter(Boolean);

    const formalData = {
      region: form.region, category: form.category, fire_type: form.fireType,
      door_direction: form.direction, frame_thickness: form.frameThick || null,
      panel_thickness: form.panelThick || null, art_frame: form.artFrame,
      delivery_type: form.deliveryType, door_color: form.color || null,
      lock_style: form.lockStyle || null, special_requirements: specialReqs,
      install_method: form.installMethod,
      width_mm: parseInt(form.width) || null, height_mm: parseInt(form.height) || null,
      has_elevator: form.hasElevator,
      floor: parseInt(form.floor) || 0,
      imported_quote_no: importedQuote?.quote_no || null,
      imported_quote_id: importedQuote?.id || null,
      accessories: collectAccessories(),
      // ─ 公司報價單範本新增欄位 ─
      material: form.material || null,
      front_panel_style: form.frontPanelStyle || null,
      back_panel_style: form.backPanelStyle || null,
      delivery_fee: parseInt(form.deliveryFee) || 0,
      drawing_no: form.drawingNo || null,
      frame_count: parseInt(form.frameCount) || null,
      unit_price: parseInt(form.unitPrice) || null,
      payment_methods: {
        measure: form.payMeasure || '',
        deposit: form.payDeposit || '',
        balance: form.payBalance || ''
      }
    };

    const fullAddress = [form.city, form.dist, form.address].filter(Boolean).join('') || null;

    const body = {
      case_no: 'CS-' + new Date().toISOString().replace(/[-T:]/g, '').slice(0, 14),
      formal_quote_no: formalQuoteNo,
      customer_name: form.contact,
      customer_phone: form.phone || null,
      contact_person: form.contact,
      customer_type: form.custType || null,
      case_address: fullAddress,
      tax_id: form.taxId || null,
      sales_person: form.salesPerson || null,
      product_code: selectedProduct?.full_code || productSearch || null,
      door_type: form.doorType,
      is_fireproof: form.fireType !== 'none',
      quantity: c.qty || 1,
      official_price: c.discounted || c.total || null,
      quoted_price: importedQuote?.total_price || null,
      total_with_tax: c.total || null,
      discount_rate: c.discount || null,
      addon_items: form.addonItems.trim() || null,
      install_fee: c.installFee || null,
      delivery_days: parseInt(form.deliveryDays) || 75,
      actual_width_cm: formalData.width_mm ? Math.round(formalData.width_mm / 10) : null,
      actual_height_cm: formalData.height_mm ? Math.round(formalData.height_mm / 10) : null,
      deposit_50: c.deposit || null,
      balance: c.balance || null,
      measure_fee: parseInt(form.measureFee) || 3000,
      note: form.note || null,
      official_note: `門扇單價:${c.unitPrice} x${c.qty}${c.discount < 1 ? ` 折扣${Math.round(c.discount * 100)}%` : ''} 安裝費:${c.installFee}`,
      official_quote_at: new Date().toISOString(),
      status: 'official_quoted',
      created_by: user?.display_name || null,
      formal_quote_data: formalData
    };

    if (importedQuote) {
      body.quote_id = importedQuote.id;
      body.quote_no = importedQuote.quote_no;
    }

    try {
      const res = await sbFetch('cases', { method: 'POST', headers: { 'Prefer': 'return=representation' }, body: JSON.stringify(body) });
      if (importedQuote) {
        await sbFetch(`quotes?id=eq.${importedQuote.id}`, { method: 'PATCH', body: JSON.stringify({ case_id: res?.[0]?.id, status: 'confirmed' }) }).catch(e => toast(`估價單連結失敗: ${e.message}`, 'error'));
      }
      toast(`報價單已建立: ${formalQuoteNo}`, 'success');
      navigate('/formalquote');
    } catch (e) { toast('建立失敗: ' + e.message, 'error'); }
  }

  const inputStyle = { padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-body)', width: '100%' };
  const c = calcResult || {};

  // Accessories rendering
  const isFire = form.fireType !== 'none';

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">新增報價單</div><div className="page-subtitle">建立正式報價 - 選配五金、計算金額、產出報價單號</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left column */}
        <div>
          {/* Import from estimate */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 8 }}>匯入估價單</div>
            <select value={form.quoteId} onChange={e => selectQuote(e.target.value)} style={inputStyle}>
              <option value="">選擇估價單（不匯入）</option>
              {quotes.map(q => <option key={q.id} value={q.id}>{q.quote_no || '—'} — {q.customer_name || '未知'} ${(q.total_price || 0).toLocaleString()}</option>)}
            </select>
            {importedQuote && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--success)' }}>已匯入: <strong>{importedQuote.quote_no}</strong> — {importedQuote.customer_name} {fmtPrice(importedQuote.total_price)}</div>}
          </div>

          {/* Quote number */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 8 }}>報價單號</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div><label style={{ fontSize: 10, color: 'var(--text-muted)' }}>區域</label><select value={form.region} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, region: v })); loadNextSeq(v, form.category, form.year, form.month).then(s => setForm(f => ({ ...f, seq: s }))); }} style={inputStyle}><option value="NTPC">NTPC</option><option value="TPE">TPE</option><option value="TYC">TYC</option><option value="HSC">HSC</option></select></div>
              <div><label style={{ fontSize: 10, color: 'var(--text-muted)' }}>分類</label><select value={form.category} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, category: v })); loadNextSeq(form.region, v, form.year, form.month).then(s => setForm(f => ({ ...f, seq: s }))); }} style={inputStyle}><option value="D">D</option><option value="S">S</option><option value="B">B</option><option value="C">C</option></select></div>
              <div><label style={{ fontSize: 10, color: 'var(--text-muted)' }}>月份</label><input value={form.month} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, month: v })); if (v.length === 2) loadNextSeq(form.region, form.category, form.year, v).then(s => setForm(f => ({ ...f, seq: s }))); }} style={inputStyle} maxLength={2} /></div>
              <div><label style={{ fontSize: 10, color: 'var(--text-muted)' }}>序號</label><input value={form.seq} onChange={e => setForm(f => ({ ...f, seq: e.target.value }))} style={inputStyle} readOnly title="自動產生，每月從 001 開始" /></div>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--gold)', fontFamily: 'monospace' }}>{form.region}-{form.category}-{form.year}-{form.month}-{form.seq || '001'}</div>
          </div>

          {/* Customer info */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 8 }}>客戶資料</div>
            <div className="form-grid">
              <div className="form-group"><label>聯絡人</label><input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} /></div>
              <div className="form-group"><label>電話</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="form-group"><label>統編</label><input value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} /></div>
              <div className="form-group"><label>客戶類型</label>
                <select value={form.custType} onChange={e => setForm(f => ({ ...f, custType: e.target.value }))} style={inputStyle}>
                  <option value="">選擇</option><option value="D">設計師</option><option value="C">直客</option><option value="B">建商</option><option value="A">代理</option>
                </select>
              </div>
              <div className="form-group"><label>業務人員</label>
                <select value={form.salesPerson} onChange={e => setForm(f => ({ ...f, salesPerson: e.target.value }))} style={inputStyle}>
                  <option value="">選擇業務人員</option>
                  {staffList.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="form-group"><label>縣市</label>
                <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value, dist: '' }))} style={inputStyle}>
                  <option value="">縣市</option>
                  {Object.keys(twDistricts).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label>鄉鎮區</label>
                <select value={form.dist} onChange={e => setForm(f => ({ ...f, dist: e.target.value }))} style={inputStyle}>
                  <option value="">鄉鎮區</option>
                  {(twDistricts[form.city] || []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group full"><label>地址</label><input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="路/街/巷/弄/號/樓" /></div>
            </div>
          </div>

          {/* Product */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 8 }}>產品規格</div>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input value={productSearch} onChange={e => searchProducts(e.target.value)} placeholder="搜尋產品代碼或名稱..." style={inputStyle} />
              {showProducts && products.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', zIndex: 10, maxHeight: 200, overflow: 'auto' }}>
                  {products.map(p => (
                    <div key={p.id} onClick={() => selectProduct(p)} style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(201,162,39,0.08)'} onMouseOut={e => e.currentTarget.style.background = ''}>
                      <strong>{p.full_code}</strong> <span style={{ color: 'var(--text-muted)' }}>{p.name || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedProduct && <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 10 }}><strong>{selectedProduct.full_code}</strong> {selectedProduct.name || ''}{selectedProduct.style ? ` · ${selectedProduct.style}` : ''}</div>}
            <div className="form-grid">
              <div className="form-group"><label>門型</label>
                <select value={form.doorType} onChange={e => setForm(f => ({ ...f, doorType: e.target.value }))} style={inputStyle}>
                  <option value="single">單門</option><option value="mother">子母門</option><option value="double">雙開門</option>
                </select>
              </div>
              <div className="form-group"><label>防火</label>
                <select value={form.fireType} onChange={e => setForm(f => ({ ...f, fireType: e.target.value }))} style={inputStyle}>
                  {FIRE_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label>寬度 (mm)</label><input type="number" value={form.width} onChange={e => setForm(f => ({ ...f, width: e.target.value }))} /></div>
              <div className="form-group"><label>高度 (mm)</label><input type="number" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} /></div>
              <div className="form-group"><label>數量</label><input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} min="1" /></div>
              <div className="form-group"><label>交貨天數</label><input type="number" value={form.deliveryDays} onChange={e => setForm(f => ({ ...f, deliveryDays: e.target.value }))} /></div>
            </div>
          </div>

          {/* Special requirements */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 8 }}>特殊需求</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[['none', '無'], ['demolish', '拆舊'], ['recycle', '回收'], ['occupy', '佔框'], ['wet', '濕式施工'], ['dry', '乾式包框'], ['frame', '站框']].map(([k, l]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={reqs[k]} onChange={e => setReqs(r => ({ ...r, [k]: e.target.checked }))} style={{ accentColor: 'var(--gold)' }} />{l}
                </label>
              ))}
            </div>
          </div>

          {/* 完整門體規格（範本對應） */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 8 }}>門體規格詳細（公司報價單範本）</div>
            <div className="form-grid">
              <div className="form-group"><label>材質 / 工藝</label><input value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} placeholder="例：鋼板烤漆" /></div>
              <div className="form-group"><label>前板樣式</label><input value={form.frontPanelStyle} onChange={e => setForm(f => ({ ...f, frontPanelStyle: e.target.value }))} placeholder="編號或名稱" /></div>
              <div className="form-group"><label>背板樣式</label><input value={form.backPanelStyle} onChange={e => setForm(f => ({ ...f, backPanelStyle: e.target.value }))} placeholder="編號或名稱" /></div>
              <div className="form-group"><label>門開方向</label>
                <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} style={inputStyle}>
                  <option value="">未指定</option><option value="左外開">左外開</option><option value="左內開">左內開</option><option value="右外開">右外開</option><option value="右內開">右內開</option>
                </select>
              </div>
              <div className="form-group"><label>運送安裝方式</label>
                <select value={form.installMethod} onChange={e => setForm(f => ({ ...f, installMethod: e.target.value }))} style={inputStyle}>
                  {INSTALL_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label>交貨方式</label>
                <select value={form.deliveryType} onChange={e => setForm(f => ({ ...f, deliveryType: e.target.value }))} style={inputStyle}>
                  <option value="框扇同時">框扇同時</option><option value="先框後扇">先框後扇</option>
                </select>
              </div>
              <div className="form-group"><label>框厚 (可空白)</label><input value={form.frameThick} onChange={e => setForm(f => ({ ...f, frameThick: e.target.value }))} placeholder="例：50mm" /></div>
              <div className="form-group"><label>扇厚 (可空白)</label><input value={form.panelThick} onChange={e => setForm(f => ({ ...f, panelThick: e.target.value }))} placeholder="例：45mm" /></div>
              <div className="form-group"><label>藝術框 (顯示編號)</label><input value={form.artFrame} onChange={e => setForm(f => ({ ...f, artFrame: e.target.value }))} placeholder="編號或無" /></div>
              <div className="form-group"><label>門扇顏色 / 色卡編號</label><input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></div>
              <div className="form-group"><label>門鎖樣式 / 編號</label><input value={form.lockStyle} onChange={e => setForm(f => ({ ...f, lockStyle: e.target.value }))} /></div>
              <div className="form-group"><label>圖號</label><input value={form.drawingNo} onChange={e => setForm(f => ({ ...f, drawingNo: e.target.value }))} /></div>
              <div className="form-group"><label>門樘數量</label><input type="number" value={form.frameCount} onChange={e => setForm(f => ({ ...f, frameCount: e.target.value }))} placeholder="預設同數量" /></div>
              <div className="form-group"><label>樓層</label><input type="number" value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} /></div>
              <div className="form-group"><label>電梯</label>
                <select value={form.hasElevator ? '1' : '0'} onChange={e => setForm(f => ({ ...f, hasElevator: e.target.value === '1' }))} style={inputStyle}>
                  <option value="1">有電梯</option><option value="0">無電梯</option>
                </select>
              </div>
              <div className="form-group"><label>搬運費用 (NT$)</label><input type="number" value={form.deliveryFee} onChange={e => setForm(f => ({ ...f, deliveryFee: e.target.value }))} placeholder="0=無" /></div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>* 桃園以北適用，新竹以南/宜蘭/花蓮/台東另議</div>
          </div>

          {/* 付款方式 */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 8 }}>付款方式（範本下方訂單金額區）</div>
            <div className="form-grid">
              <div className="form-group"><label>丈量費用 (NT$)</label><input type="number" value={form.measureFee} onChange={e => setForm(f => ({ ...f, measureFee: e.target.value }))} /></div>
              <div className="form-group"><label>丈量費 收款方式</label>
                <select value={form.payMeasure} onChange={e => setForm(f => ({ ...f, payMeasure: e.target.value }))} style={inputStyle}>
                  {PAY_METHODS.filter(m => m.value !== 'measure_paid').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label>訂金 50% 收款方式</label>
                <select value={form.payDeposit} onChange={e => setForm(f => ({ ...f, payDeposit: e.target.value }))} style={inputStyle}>
                  {PAY_METHODS.filter(m => m.value !== 'measure_paid').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label>尾款 收款方式</label>
                <select value={form.payBalance} onChange={e => setForm(f => ({ ...f, payBalance: e.target.value }))} style={inputStyle}>
                  {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Accessories */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 8 }}>五金配件</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ACC_CATS.map(cat => {
                const items = accessories.filter(a => a.category === cat);
                const allStd = items.filter(a => a.type === 'standard');
                const upgItems = items.filter(a => a.type === 'upgrade');
                const fireStd = allStd.filter(a => a.fire_only);
                const regularStd = allStd.filter(a => !a.fire_only);
                const activeStd = isFire && fireStd.length ? fireStd : regularStd;
                const switchedToFire = isFire && fireStd.length > 0;
                const stdDisplay = activeStd.map(a => a.name).join(', ') || '—';

                return (
                  <div key={cat} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 70px', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--surface-2)', border: `1px solid ${switchedToFire ? 'rgba(239,68,68,.25)' : 'var(--border)'}`, borderRadius: 3 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>
                      {ACC_LABELS[cat]}
                      {switchedToFire && <div style={{ fontSize: 8, color: 'var(--danger)', fontWeight: 600, marginTop: 2 }}>防火標配</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>標配{switchedToFire ? ' (防火)' : ''}</div>
                      <div style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600, color: switchedToFire ? 'var(--danger)' : 'var(--text)', background: switchedToFire ? 'rgba(239,68,68,.06)' : 'var(--surface-high)', border: `1px solid ${switchedToFire ? 'rgba(239,68,68,.2)' : 'var(--border)'}`, borderRadius: 'var(--radius)' }}>{stdDisplay}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>加購選配</div>
                      {upgItems.length ? (
                        <select value={accState[cat]?.selectedUpgrade || ''} onChange={e => setAccState(s => ({ ...s, [cat]: { ...s[cat], selectedUpgrade: e.target.value } }))} style={{ ...inputStyle, fontSize: 12, padding: '6px 8px' }}>
                          {upgItems.map(a => <option key={a.name} value={a.name}>{a.name}{a.price ? ` ($${a.price.toLocaleString()})` : ''}</option>)}
                        </select>
                      ) : <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>—</div>}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                      <input type="checkbox" checked={accState[cat]?.useUpgrade || false} onChange={e => setAccState(s => ({ ...s, [cat]: { ...s[cat], useUpgrade: e.target.checked } }))} disabled={!upgItems.length} style={{ accentColor: 'var(--gold)' }} /> 加購
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pricing */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 8 }}>金額計算</div>
            <div className="form-grid">
              <div className="form-group"><label>門扇單價</label><input type="number" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} /></div>
              <div className="form-group"><label>折扣</label>
                <select value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} style={inputStyle}>
                  <option value="1">無折扣</option><option value="0.95">95折</option><option value="0.9">9折</option><option value="0.85">85折</option><option value="0.8">8折</option>
                </select>
              </div>
              <div className="form-group"><label>安裝費</label><input type="number" value={form.installFee} onChange={e => setForm(f => ({ ...f, installFee: e.target.value }))} /></div>
              <div className="form-group full"><label>附加施工費明細</label><textarea value={form.addonItems} onChange={e => setForm(f => ({ ...f, addonItems: e.target.value }))} placeholder="格式: 項目名稱 金額&#10;例: 拆舊門 3000" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} /></div>
            </div>

            {/* Price breakdown */}
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {c.unitPrice ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(201,162,39,0.1)' }}><span style={{ color: 'var(--text-muted)' }}>門扇單價 x {c.qty}</span><span style={{ fontWeight: 600 }}>{fmtPrice(c.doorSubtotal)}</span></div>
                  {c.discount < 1 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(201,162,39,0.1)' }}><span style={{ color: 'var(--text-muted)' }}>折扣 ({Math.round(c.discount * 100)}%)</span><span style={{ fontWeight: 600 }}>{fmtPrice(c.discounted)}</span></div>}
                  {(c.addonLines || []).map((a, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(201,162,39,0.1)' }}><span style={{ color: 'var(--text-muted)' }}>{a[0]}</span><span style={{ fontWeight: 600 }}>{fmtPrice(a[1])}</span></div>)}
                  {c.installFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(201,162,39,0.1)' }}><span style={{ color: 'var(--text-muted)' }}>安裝費</span><span style={{ fontWeight: 600 }}>{fmtPrice(c.installFee)}</span></div>}
                </>
              ) : <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 10 }}>請填寫門扇單價</div>}
            </div>

            {/* Totals */}
            <div style={{ marginTop: 14, background: '#1a1a1a', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: 2 }}>總計</span><span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>{c.total ? fmtPrice(c.total) : '—'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>訂金 50%</span><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.total ? fmtPrice(c.deposit) : '—'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>尾款</span><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.total ? fmtPrice(c.balance) : '—'}</span></div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
            <div className="form-group"><label>備註</label><textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} /></div>
          </div>

          {/* Submit */}
          <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 16, borderRadius: 14 }} onClick={submit}>儲存報價單</button>
        </div>
      </div>
    </div>
  );
}

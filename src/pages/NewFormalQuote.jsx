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

// 材質/工藝 hard-code 選項
const MATERIAL_OPTIONS = [
  '鋼板烤漆', '不銹鋼', '鋁合金', '鍍鋅鋼板', '實木貼皮', '陶瓷烤漆', '原木', '其他'
];

const ACC_CATS = ['lock', 'hinge', 'sill', 'closer', 'frame'];
const ACC_LABELS = { lock: '門鎖', hinge: '鉸鍊', sill: '門檻', closer: '門弓器', frame: '門框' };

// 內建特殊需求（無金額描述）
const BUILTIN_REQS = [
  { key: 'none', label: '無' },
  { key: 'recycle', label: '回收' },
  { key: 'frame', label: '站框' }
];

// service_costs 欄位 → 在報價單可勾選的施工費（依門型自動帶價）
const SC_FEE_FIELDS = [
  { key: 'old_door_removal', label: '拆舊門' },
  { key: 'old_frame_remove', label: '拆舊框' },
  { key: 'wet_grout', label: '濕式灌漿' },
  { key: 'wet_paint', label: '油漆' },
  { key: 'dry_frame', label: '乾式包框' },
  { key: 'soundproof_basic', label: '隔音（基本）' },
  { key: 'soundproof_50db', label: '隔音（50dB）' },
  { key: 'fire_cert_60a', label: '防火認證 60A' },
  { key: 'smoke_seal', label: '煙氣封條' }
];

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
  const [colorCards, setColorCards] = useState([]);
  const [panelStyles, setPanelStyles] = useState([]);
  const [artFrames, setArtFrames] = useState([]);
  const [serviceItems, setServiceItems] = useState([]); // 自訂附加項目
  const [serviceCosts, setServiceCosts] = useState([]); // 依門型固定施工費
  const [linkedCase, setLinkedCase] = useState(null);
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
    material: '', frontPanelStyle: '', backPanelStyle: '',
    deliveryFee: '', drawingNo: '', frameCount: '',
    measureFee: 3000,
    payMeasure: '', payDeposit: '', payBalance: '',
  });

  const [accState, setAccState] = useState({});
  const [calcResult, setCalcResult] = useState(null);

  // 內建勾選 + 依門型施工費勾選 + 自訂項目勾選
  const [reqs, setReqs] = useState({ none: false, recycle: false, frame: false });
  const [scReqs, setScReqs] = useState({}); // service_costs fee field -> bool
  const [customReqs, setCustomReqs] = useState({}); // service_items.id -> bool

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
    sbFetch('color_cards?select=code,alt_code,name_en,name_zh,image_url&is_active=eq.true&order=sort_order.asc').then(d => setColorCards(d || [])).catch(() => {});
    sbFetch('panel_styles?select=*&is_active=eq.true&order=sort_order.asc').then(d => setPanelStyles(d || [])).catch(() => {});
    sbFetch('art_frames?select=code,name_zh,name_en,image_url&is_active=eq.true&order=sort_order.asc').then(d => setArtFrames(d || [])).catch(() => {});
    sbFetch('service_items?select=*&is_active=eq.true&show_on_quote=eq.true&order=sort_order.asc,name.asc').then(d => setServiceItems(d || [])).catch(() => {});
    sbFetch('service_costs?select=*').then(d => setServiceCosts(d || [])).catch(() => {});
    loadNextSeq(form.region, form.category, form.year, form.month).then(seq => setForm(f => ({ ...f, seq })));
  }, []);

  // Calculate totals
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

    // 依門型施工費
    const sc = serviceCosts.find(s => s.door_type === form.doorType) || {};
    const reqLines = [];
    let reqTotal = 0;
    SC_FEE_FIELDS.forEach(f => {
      if (scReqs[f.key]) {
        const p = Number(sc[f.key]) || 0;
        reqTotal += p;
        reqLines.push([f.label, p]);
      }
    });
    // 自訂特殊需求項目費用
    serviceItems.forEach(it => {
      if (customReqs[it.id]) {
        reqTotal += (it.unit_price || 0);
        reqLines.push([it.name + (it.unit ? ` (${it.unit})` : ''), it.unit_price || 0]);
      }
    });

    const doorSubtotal = unitPrice * qty;
    const discounted = Math.round(doorSubtotal * discount);
    const total = discounted + addonTotal + installFee + reqTotal;
    const deposit = Math.round(total * 0.5);
    const balance = total - deposit;

    setCalcResult({ unitPrice, qty, discount, doorSubtotal, discounted, addonTotal, addonLines, installFee, total, deposit, balance, reqTotal, reqLines });
  }, [form.unitPrice, form.qty, form.discount, form.installFee, form.addonItems, customReqs, scReqs, serviceItems, serviceCosts, form.doorType]);

  async function selectQuote(id) {
    setForm(f => ({ ...f, quoteId: id }));
    if (!id) { setImportedQuote(null); setLinkedCase(null); return; }
    const q = quotes.find(r => r.id === id);
    if (!q) return;
    setImportedQuote(q);

    // 推導 fireType 優先序：smoke_seal > fireproof/door_type=fire > soundproof > 無
    let fireType = 'none';
    if (q.smoke_seal) fireType = 'f60a_smoke';
    else if (q.fireproof || q.door_type === 'fire') fireType = 'f60a';
    else if (q.soundproof) fireType = 'soundproof';

    setForm(f => ({
      ...f,
      contact: q.customer_name || '', phone: q.customer_phone || '', address: q.customer_addr || '',
      doorType: q.door_type === 'fire' ? 'single' : (q.door_type || 'single'),
      fireType,
      qty: q.quantity || 1,
      width: q.width_cm ? String(q.width_cm * 10) : '',
      height: q.height_cm ? String(q.height_cm * 10) : '',
      unitPrice: q.unit_price ? String(q.unit_price) : '',
      floor: q.floor_count != null ? q.floor_count : f.floor,
      hasElevator: q.elevator != null ? !!q.elevator : f.hasElevator,
    }));

    // 估價單勾的施工選項 → 報價單對應的 service_costs 勾選
    setScReqs({
      old_door_removal: !!q.demolition,
      wet_grout: q.install_type === 'wet',
      wet_paint: q.install_type === 'wet',
      dry_frame: q.install_type === 'dry',
      soundproof_basic: !!q.soundproof,
      smoke_seal: !!q.smoke_seal,
      fire_cert_60a: !!q.fireproof,
    });

    // 估價算出來但無對應 service_costs 欄位的金額（超寬/無電梯），帶到「附加施工費明細」文字框
    const extraLines = [];
    if (q.oversize_charge) extraLines.push(`超尺寸加價 ${q.oversize_charge}`);
    if (q.elevator_charge) extraLines.push(`無電梯搬運 ${q.elevator_charge}`);
    if (extraLines.length) setForm(f => ({ ...f, addonItems: extraLines.join('\n') }));

    if (q.product_code) {
      setProductSearch(q.product_code);
      searchProducts(q.product_code);
    }
    if (q.case_id) {
      try {
        const cases = await sbFetch(`cases?id=eq.${q.case_id}&select=id,actual_width_cm,actual_height_cm,measure_date,measure_staff,measured_at`);
        if (cases && cases[0]) setLinkedCase(cases[0]);
      } catch {}
    }
  }

  function fillFromMeasurement() {
    if (!linkedCase) return;
    setForm(f => ({
      ...f,
      width: linkedCase.actual_width_cm ? String(linkedCase.actual_width_cm * 10) : f.width,
      height: linkedCase.actual_height_cm ? String(linkedCase.actual_height_cm * 10) : f.height
    }));
    toast(`已填入丈量尺寸 ${linkedCase.actual_width_cm}×${linkedCase.actual_height_cm} cm`, 'success');
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

  // 收集特殊需求 (含金額)
  function collectSpecialReqs() {
    const out = [];
    BUILTIN_REQS.forEach(r => {
      if (reqs[r.key]) out.push({ name: r.label, amount: 0, builtin: true });
    });
    const sc = serviceCosts.find(s => s.door_type === form.doorType) || {};
    SC_FEE_FIELDS.forEach(f => {
      if (scReqs[f.key]) out.push({ key: f.key, name: f.label, amount: Number(sc[f.key]) || 0 });
    });
    serviceItems.forEach(it => {
      if (customReqs[it.id]) out.push({ id: it.id, name: it.name, amount: it.unit_price || 0, unit: it.unit });
    });
    return out;
  }

  async function submit() {
    if (!form.contact) { toast('請填寫聯絡人', 'error'); return; }
    if (!form.unitPrice) { toast('請填寫門扇單價', 'error'); return; }
    const c = calcResult || {};
    const formalQuoteNo = `${form.region}-${form.category}-${form.year}-${form.month}-${form.seq || '001'}`;
    const specialReqs = collectSpecialReqs();

    // 找出選中的鎖（從 accessories）
    const lockAcc = accessories.find(a => a.id === form.lockStyle);

    const formalData = {
      region: form.region, category: form.category, fire_type: form.fireType,
      door_direction: form.direction, frame_thickness: form.frameThick || null,
      panel_thickness: form.panelThick || null, art_frame: form.artFrame,
      delivery_type: form.deliveryType, door_color: form.color || null,
      lock_style: lockAcc?.name || form.lockStyle || null,
      lock_style_id: lockAcc?.id || null,
      lock_style_image: lockAcc?.image_url || null,
      special_requirements: specialReqs,
      install_method: form.installMethod,
      width_mm: parseInt(form.width) || null, height_mm: parseInt(form.height) || null,
      has_elevator: form.hasElevator,
      floor: parseInt(form.floor) || 0,
      imported_quote_no: importedQuote?.quote_no || null,
      imported_quote_id: importedQuote?.id || null,
      accessories: collectAccessories(),
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
  const isFire = form.fireType !== 'none';

  const sectionStyle = { background: 'var(--surface-low)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 14 };
  const sectionTitle = { fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 };

  const frontPanelOptions = panelStyles.filter(p => p.position === 'front' || p.position === 'both');
  const backPanelOptions  = panelStyles.filter(p => p.position === 'back'  || p.position === 'both');
  const lockOptions = accessories.filter(a => a.category === 'lock'); // 門鎖樣式 = accessories.lock

  return (
    <div>
      <div className="page-header">
        <div className="page-title-wrap"><div className="page-title">新增報價單</div><div className="page-subtitle">分區塊輸入：基本資訊 → 門款 → 尺寸 → 外觀 → 配件 → 金額</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ═══════════════ 左側欄 ═══════════════ */}
        <div>

          {/* 1. 匯入估價單 */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>upload</span>匯入估價單</div>
            <select value={form.quoteId} onChange={e => selectQuote(e.target.value)} style={inputStyle}>
              <option value="">選擇估價單（不匯入）</option>
              {quotes.map(q => <option key={q.id} value={q.id}>{q.quote_no || '—'} — {q.customer_name || '未知'} ${(q.total_price || 0).toLocaleString()}</option>)}
            </select>
            {importedQuote && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--success)' }}>
                已匯入: <strong>{importedQuote.quote_no}</strong> — {importedQuote.customer_name} {fmtPrice(importedQuote.total_price)}
                {linkedCase && <span style={{ marginLeft: 8, color: 'var(--gold)' }}>· 已找到丈量資料 ({linkedCase.actual_width_cm}×{linkedCase.actual_height_cm} cm)</span>}
                <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 11 }}>* 已自動帶入特殊需求（拆舊/濕式/乾式），請至下方檢查</div>
              </div>
            )}
          </div>

          {/* 2. 報價單編號 */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>tag</span>報價單編號</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div><label style={{ fontSize: 10, color: 'var(--text-muted)' }}>區域</label><select value={form.region} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, region: v })); loadNextSeq(v, form.category, form.year, form.month).then(s => setForm(f => ({ ...f, seq: s }))); }} style={inputStyle}><option value="NTPC">NTPC</option><option value="TPE">TPE</option><option value="TYC">TYC</option><option value="HSC">HSC</option></select></div>
              <div><label style={{ fontSize: 10, color: 'var(--text-muted)' }}>分類</label><select value={form.category} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, category: v })); loadNextSeq(form.region, v, form.year, form.month).then(s => setForm(f => ({ ...f, seq: s }))); }} style={inputStyle}><option value="D">D</option><option value="S">S</option><option value="B">B</option><option value="C">C</option></select></div>
              <div><label style={{ fontSize: 10, color: 'var(--text-muted)' }}>月份</label><input value={form.month} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, month: v })); if (v.length === 2) loadNextSeq(form.region, form.category, form.year, v).then(s => setForm(f => ({ ...f, seq: s }))); }} style={inputStyle} maxLength={2} /></div>
              <div><label style={{ fontSize: 10, color: 'var(--text-muted)' }}>序號</label><input value={form.seq} onChange={e => setForm(f => ({ ...f, seq: e.target.value }))} style={inputStyle} readOnly /></div>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--gold)', fontFamily: 'monospace' }}>{form.region}-{form.category}-{form.year}-{form.month}-{form.seq || '001'}</div>
          </div>

          {/* 3. 客戶資料 */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>person</span>客戶資料</div>
            <div className="form-grid">
              <div className="form-group"><label>聯絡人</label><input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} /></div>
              <div className="form-group"><label>電話</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="form-group"><label>統編</label><input value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} /></div>
              <div className="form-group"><label>客戶類型</label>
                <select value={form.custType} onChange={e => setForm(f => ({ ...f, custType: e.target.value }))} style={inputStyle}>
                  <option value="">選擇</option><option value="D">設計師</option><option value="C">直客</option><option value="B">建商</option><option value="A">代理</option>
                </select>
              </div>
              <div className="form-group full"><label>業務人員</label>
                <select value={form.salesPerson} onChange={e => setForm(f => ({ ...f, salesPerson: e.target.value }))} style={inputStyle}>
                  <option value="">選擇業務人員</option>
                  {staffList.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 4. 安裝地點 (含 安裝方式) */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>location_on</span>安裝地點</div>
            <div className="form-grid">
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
              <div className="form-group"><label>樓層</label><input type="number" value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} /></div>
              <div className="form-group"><label>電梯</label>
                <select value={form.hasElevator ? '1' : '0'} onChange={e => setForm(f => ({ ...f, hasElevator: e.target.value === '1' }))} style={inputStyle}>
                  <option value="1">有電梯</option><option value="0">無電梯</option>
                </select>
              </div>
              <div className="form-group"><label>運送安裝方式</label>
                <select value={form.installMethod} onChange={e => setForm(f => ({ ...f, installMethod: e.target.value }))} style={inputStyle}>
                  {INSTALL_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label>搬運費用 (NT$)</label><input type="number" value={form.deliveryFee} onChange={e => setForm(f => ({ ...f, deliveryFee: e.target.value }))} placeholder="0=無，桃園以北適用" /></div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>* 桃園以北適用搬運費，新竹以南/宜蘭/花蓮/台東另議</div>
          </div>

          {/* 5. 門款基本 */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>door_front</span>門款基本</div>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input value={productSearch} onChange={e => searchProducts(e.target.value)} placeholder="搜尋產品代碼或名稱..." style={inputStyle} />
              {showProducts && products.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', zIndex: 10, maxHeight: 200, overflow: 'auto' }}>
                  {products.map(p => (
                    <div key={p.id} onClick={() => selectProduct(p)} style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(201,162,39,0.08)'} onMouseOut={e => e.currentTarget.style.background = ''}>
                      {p.thumbnail_url && <img src={p.thumbnail_url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 3 }} />}
                      <div><strong>{p.full_code}</strong> <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.name || ''}</span></div>
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
              <div className="form-group"><label>防火 / 隔音</label>
                <select value={form.fireType} onChange={e => setForm(f => ({ ...f, fireType: e.target.value }))} style={inputStyle}>
                  {FIRE_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                </select>
              </div>
              <div className="form-group"><label>數量</label><input type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} min="1" /></div>
              <div className="form-group"><label>交貨天數</label><input type="number" value={form.deliveryDays} onChange={e => setForm(f => ({ ...f, deliveryDays: e.target.value }))} /></div>
            </div>
          </div>

          {/* 6. 尺寸規格 */}
          <div style={sectionStyle}>
            <div style={{ ...sectionTitle, justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>straighten</span>尺寸規格 (mm)
              </span>
              {linkedCase && (linkedCase.actual_width_cm || linkedCase.actual_height_cm) && (
                <button type="button" onClick={fillFromMeasurement} style={{ padding: '4px 10px', fontSize: 11, background: 'var(--gold-dim)', color: 'var(--gold)', border: '1px solid var(--gold)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                  ↓ 從丈量資料填入 ({linkedCase.actual_width_cm}×{linkedCase.actual_height_cm} cm)
                </button>
              )}
            </div>
            <div className="form-grid">
              <div className="form-group"><label>門洞寬 (mm)</label><input type="number" value={form.width} onChange={e => setForm(f => ({ ...f, width: e.target.value }))} placeholder="例：1000" /></div>
              <div className="form-group"><label>門洞高 (mm)</label><input type="number" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} placeholder="例：2100" /></div>
              <div className="form-group"><label>框厚 (可空白)</label><input value={form.frameThick} onChange={e => setForm(f => ({ ...f, frameThick: e.target.value }))} placeholder="例：50mm" /></div>
              <div className="form-group"><label>扇厚 (可空白)</label><input value={form.panelThick} onChange={e => setForm(f => ({ ...f, panelThick: e.target.value }))} placeholder="例：45mm" /></div>
              <div className="form-group"><label>圖號</label><input value={form.drawingNo} onChange={e => setForm(f => ({ ...f, drawingNo: e.target.value }))} /></div>
              <div className="form-group"><label>門樘數量</label><input type="number" value={form.frameCount} onChange={e => setForm(f => ({ ...f, frameCount: e.target.value }))} placeholder="預設同數量" /></div>
              <div className="form-group"><label>門開方向 <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(人在外向內看)</span></label>
                <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} style={inputStyle}>
                  <option value="">未指定</option><option value="左外開">左外開</option><option value="左內開">左內開</option><option value="右外開">右外開</option><option value="右內開">右內開</option>
                </select>
              </div>
              <div className="form-group"><label>交貨方式</label>
                <select value={form.deliveryType} onChange={e => setForm(f => ({ ...f, deliveryType: e.target.value }))} style={inputStyle}>
                  <option value="框扇同時">框扇同時</option><option value="先框後扇">先框後扇</option>
                </select>
              </div>
            </div>
          </div>

          {/* 7. 外觀設計 */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>palette</span>外觀設計</div>
            <div className="form-grid">
              <div className="form-group full"><label>材質 / 工藝</label>
                <select value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} style={inputStyle}>
                  <option value="">未指定</option>
                  {MATERIAL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label>前板樣式</label>
                <select value={form.frontPanelStyle} onChange={e => setForm(f => ({ ...f, frontPanelStyle: e.target.value }))} style={inputStyle}>
                  <option value="">未指定</option>
                  {frontPanelOptions.map(p => (
                    <option key={p.code} value={p.code}>{p.code} — {p.name_zh || p.name_en || ''}</option>
                  ))}
                </select>
                {form.frontPanelStyle && frontPanelOptions.find(p => p.code === form.frontPanelStyle)?.image_url && (
                  <img src={frontPanelOptions.find(p => p.code === form.frontPanelStyle).image_url} alt={form.frontPanelStyle} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, marginTop: 6, border: '1px solid var(--border)' }} />
                )}
                {frontPanelOptions.length === 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>尚未建立前板樣式 → <a href="/panelstyles" style={{ color: 'var(--gold)' }}>去新增</a></div>}
              </div>

              <div className="form-group">
                <label>背板樣式</label>
                <select value={form.backPanelStyle} onChange={e => setForm(f => ({ ...f, backPanelStyle: e.target.value }))} style={inputStyle}>
                  <option value="">未指定</option>
                  {backPanelOptions.map(p => (
                    <option key={p.code} value={p.code}>{p.code} — {p.name_zh || p.name_en || ''}</option>
                  ))}
                </select>
                {form.backPanelStyle && backPanelOptions.find(p => p.code === form.backPanelStyle)?.image_url && (
                  <img src={backPanelOptions.find(p => p.code === form.backPanelStyle).image_url} alt={form.backPanelStyle} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, marginTop: 6, border: '1px solid var(--border)' }} />
                )}
                {backPanelOptions.length === 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>尚未建立背板樣式 → <a href="/panelstyles" style={{ color: 'var(--gold)' }}>去新增</a></div>}
              </div>

              <div className="form-group"><label>藝術框</label>
                <select value={form.artFrame} onChange={e => setForm(f => ({ ...f, artFrame: e.target.value }))} style={inputStyle}>
                  <option value="">無</option>
                  {artFrames.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name_zh || a.name_en || ''}</option>)}
                </select>
                {form.artFrame && artFrames.find(a => a.code === form.artFrame)?.image_url && (
                  <img src={artFrames.find(a => a.code === form.artFrame).image_url} alt={form.artFrame} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4, marginTop: 6, border: '1px solid var(--border)' }} />
                )}
                {artFrames.length === 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>尚未建立藝術框 → <a href="/artframes" style={{ color: 'var(--gold)' }}>去新增</a></div>}
              </div>

              <div className="form-group">
                <label>門扇顏色 / 色卡</label>
                <select value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={inputStyle}>
                  <option value="">未指定</option>
                  {colorCards.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.code}{c.alt_code ? ` / ${c.alt_code}` : ''} — {c.name_zh || c.name_en || ''}
                    </option>
                  ))}
                </select>
                {form.color && colorCards.find(c => c.code === form.color)?.image_url && (
                  <img src={colorCards.find(c => c.code === form.color).image_url} alt={form.color} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, marginTop: 6, border: '1px solid var(--border)' }} />
                )}
              </div>

              {/* 門鎖樣式 — 改用 accessories.lock */}
              <div className="form-group full"><label>門鎖樣式 <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(來源：五金配件 → 門鎖)</span></label>
                <select value={form.lockStyle} onChange={e => setForm(f => ({ ...f, lockStyle: e.target.value }))} style={inputStyle}>
                  <option value="">未指定</option>
                  {lockOptions.map(l => <option key={l.id} value={l.id}>{l.name}{l.brand ? ` (${l.brand})` : ''}{l.price ? ` $${l.price.toLocaleString()}` : ''}</option>)}
                </select>
                {form.lockStyle && lockOptions.find(l => l.id === form.lockStyle)?.image_url && (
                  <img src={lockOptions.find(l => l.id === form.lockStyle).image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4, marginTop: 6, border: '1px solid var(--border)' }} />
                )}
                {lockOptions.length === 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>尚未建立門鎖配件 → <a href="/accessories" style={{ color: 'var(--gold)' }}>去五金配件新增</a></div>}
              </div>
            </div>
          </div>

          {/* 8. 特殊需求 */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>build</span>特殊需求</div>

            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>一般選項（不計費）</label>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
              {BUILTIN_REQS.map(r => (
                <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!reqs[r.key]} onChange={e => setReqs(prev => ({ ...prev, [r.key]: e.target.checked }))} style={{ accentColor: 'var(--gold)' }} />{r.label}
                </label>
              ))}
            </div>

            {/* 依門型施工費 */}
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              施工附加（依當前門型 — {DOOR_TYPE_LABEL[form.doorType] || form.doorType}）
              <a href="/service" style={{ color: 'var(--gold)', marginLeft: 8 }}>→ 改價</a>
            </label>
            {(() => {
              const sc = serviceCosts.find(s => s.door_type === form.doorType);
              if (!sc) return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8, background: 'var(--surface-2)', borderRadius: 6, marginBottom: 14 }}>未找到對應門型的施工費用</div>;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 14 }}>
                  {SC_FEE_FIELDS.map(f => {
                    const p = Number(sc[f.key]) || 0;
                    if (p === 0) return null;
                    const on = !!scReqs[f.key];
                    return (
                      <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: on ? 'rgba(201,162,39,.08)' : 'var(--surface-2)', border: `1px solid ${on ? 'var(--gold)' : 'var(--border)'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input type="checkbox" checked={on} onChange={e => setScReqs(prev => ({ ...prev, [f.key]: e.target.checked }))} style={{ accentColor: 'var(--gold)' }} />
                          {f.label}
                        </span>
                        <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 12 }}>+{fmtPrice(p)}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })()}

            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              自訂附加項目
              {serviceItems.length === 0 && <a href="/service" style={{ color: 'var(--gold)', marginLeft: 8 }}>→ 去施工費用新增</a>}
            </label>
            {serviceItems.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8, background: 'var(--surface-2)', borderRadius: 6 }}>
                尚未建立任何「報價單顯示」的自訂附加項目
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {serviceItems.map(it => (
                  <label key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: customReqs[it.id] ? 'rgba(201,162,39,.08)' : 'var(--surface-2)', border: `1px solid ${customReqs[it.id] ? 'var(--gold)' : 'var(--border)'}`, borderRadius: 6, fontSize: 13, cursor: 'pointer', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={!!customReqs[it.id]} onChange={e => setCustomReqs(prev => ({ ...prev, [it.id]: e.target.checked }))} style={{ accentColor: 'var(--gold)' }} />
                      {it.name}
                    </span>
                    <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 12 }}>+{fmtPrice(it.unit_price)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════ 右側欄 ═══════════════ */}
        <div>

          {/* 9. 五金配件 */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>hardware</span>五金配件</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ACC_CATS.map(cat => {
                const items = accessories.filter(a => a.category === cat);
                const allStd = items.filter(a => a.type === 'standard');
                const upgItems = items.filter(a => a.type === 'upgrade');
                const fireStd = allStd.filter(a => a.fire_only);
                const regularStd = allStd.filter(a => !a.fire_only);
                const activeStd = isFire && fireStd.length ? fireStd : regularStd;
                const switchedToFire = isFire && fireStd.length > 0;
                const stdItems = activeStd;
                const selectedUpgName = accState[cat]?.selectedUpgrade || (upgItems[0]?.name || '');
                const selectedUpg = upgItems.find(u => u.name === selectedUpgName);
                const useUpgrade = accState[cat]?.useUpgrade || false;

                return (
                  <div key={cat} style={{ padding: '10px 12px', background: 'var(--surface-2)', border: `1px solid ${switchedToFire ? 'rgba(239,68,68,.25)' : 'var(--border)'}`, borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', flex: 1 }}>
                        {ACC_LABELS[cat]}
                        {switchedToFire && <span style={{ fontSize: 9, color: 'var(--danger)', fontWeight: 600, marginLeft: 6 }}>防火標配</span>}
                      </span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: upgItems.length ? 'pointer' : 'not-allowed', color: useUpgrade ? 'var(--gold)' : 'var(--text-muted)' }}>
                        <input type="checkbox" checked={useUpgrade} onChange={e => setAccState(s => ({ ...s, [cat]: { ...s[cat], useUpgrade: e.target.checked } }))} disabled={!upgItems.length} style={{ accentColor: 'var(--gold)' }} />加購選配
                      </label>
                    </div>

                    <div style={{ marginBottom: useUpgrade ? 8 : 0 }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>標配{switchedToFire ? ' (防火)' : ''}</div>
                      {stdItems.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div> : (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {stdItems.map(a => (
                            <div key={a.id || a.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: switchedToFire ? 'rgba(239,68,68,.06)' : 'var(--surface-high)', border: `1px solid ${switchedToFire ? 'rgba(239,68,68,.2)' : 'var(--border)'}`, borderRadius: 4 }}>
                              {a.image_url
                                ? <img src={a.image_url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 3 }} />
                                : <div style={{ width: 28, height: 28, background: 'var(--surface-2)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-muted)' }}>—</div>
                              }
                              <span style={{ fontSize: 12, fontWeight: 600, color: switchedToFire ? 'var(--danger)' : 'var(--text)' }}>{a.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {useUpgrade && upgItems.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>加購選配</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <select value={selectedUpgName} onChange={e => setAccState(s => ({ ...s, [cat]: { ...s[cat], selectedUpgrade: e.target.value } }))} style={{ ...inputStyle, fontSize: 12, padding: '6px 8px', flex: 1 }}>
                            {upgItems.map(a => <option key={a.name} value={a.name}>{a.name}{a.price ? ` ($${a.price.toLocaleString()})` : ''}</option>)}
                          </select>
                          {selectedUpg?.image_url && <img src={selectedUpg.image_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 10. 金額計算 */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>calculate</span>金額計算</div>
            <div className="form-grid">
              <div className="form-group"><label>門扇單價</label><input type="number" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} /></div>
              <div className="form-group"><label>折扣</label>
                <select value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} style={inputStyle}>
                  <option value="1">無折扣</option><option value="0.95">95折</option><option value="0.9">9折</option><option value="0.85">85折</option><option value="0.8">8折</option>
                </select>
              </div>
              <div className="form-group"><label>安裝費</label><input type="number" value={form.installFee} onChange={e => setForm(f => ({ ...f, installFee: e.target.value }))} /></div>
              <div className="form-group full"><label>附加施工費明細 (自由輸入)</label><textarea value={form.addonItems} onChange={e => setForm(f => ({ ...f, addonItems: e.target.value }))} placeholder="格式: 項目名稱 金額&#10;例: 拆舊門 3000" style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} /></div>
            </div>

            <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {c.unitPrice ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(201,162,39,0.1)' }}><span style={{ color: 'var(--text-muted)' }}>門扇單價 x {c.qty}</span><span style={{ fontWeight: 600 }}>{fmtPrice(c.doorSubtotal)}</span></div>
                  {c.discount < 1 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(201,162,39,0.1)' }}><span style={{ color: 'var(--text-muted)' }}>折扣 ({Math.round(c.discount * 100)}%)</span><span style={{ fontWeight: 600 }}>{fmtPrice(c.discounted)}</span></div>}
                  {(c.addonLines || []).map((a, i) => <div key={'a'+i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(201,162,39,0.1)' }}><span style={{ color: 'var(--text-muted)' }}>{a[0]}</span><span style={{ fontWeight: 600 }}>{fmtPrice(a[1])}</span></div>)}
                  {(c.reqLines || []).map((a, i) => <div key={'r'+i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(201,162,39,0.1)', color: 'var(--gold)' }}><span>{a[0]}</span><span style={{ fontWeight: 600 }}>{fmtPrice(a[1])}</span></div>)}
                  {c.installFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid rgba(201,162,39,0.1)' }}><span style={{ color: 'var(--text-muted)' }}>安裝費</span><span style={{ fontWeight: 600 }}>{fmtPrice(c.installFee)}</span></div>}
                </>
              ) : <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 10 }}>請填寫門扇單價</div>}
            </div>

            <div style={{ marginTop: 14, background: '#1a1a1a', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: 2 }}>總計</span><span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>{c.total ? fmtPrice(c.total) : '—'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>訂金 50%</span><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.total ? fmtPrice(c.deposit) : '—'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>尾款</span><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.total ? fmtPrice(c.balance) : '—'}</span></div>
            </div>
          </div>

          {/* 11. 付款方式 */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>payments</span>付款方式</div>
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

          {/* 12. 備註 */}
          <div style={sectionStyle}>
            <div style={sectionTitle}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit_note</span>備註</div>
            <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} placeholder="其他補充說明..." />
          </div>

          <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 16, borderRadius: 14 }} onClick={submit}>儲存報價單</button>
        </div>
      </div>
    </div>
  );
}

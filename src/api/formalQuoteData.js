// 共用報價單 view-model — PDF 跟 Excel 都從這裡拿資料，避免重複計算邏輯不一致
// Usage: const vm = buildFormalQuoteVM(c)

export const COMPANY = {
  nameZh: '門的世界 DOORWORLD',
  fullNameZh: '展億室內開發有限公司',
  taxId: '60667469',
  addr: '新北市五股區成泰路一段130-3號',
  phone: '02-2292-0366',
  email: 'doorworld168@gmail.com',
};

export const DOOR_TYPE_LABEL = {
  single: '單開門', mother: '子母門', double: '雙開門',
  fire: '防火單門', room: '房間門', bathroom: '衛浴門', sliding: '橫拉門'
};

// 報價單注意事項 16 條（依官方範本 v001/20251212）
export const QUOTE_TERMS = [
  '定義：工作日（不含假日）、日曆天（含假日）',
  '1. 下單時乙方先預付50%訂金，收訂金日視為下單日。',
  '2. 客製化產品下單後如要求改單，由下單日起算第3個曆天下午1點（台灣時間）後，改單所造成的損失由乙方承擔訂單總價之80%。',
  '3. 有品質問題時自驗收後5個工作天內經乙方提出，逾期甲方不再負責，其需修復缺件之所造成的二次上門工費材料費由乙方承擔。',
  '4. 依客製化生產週期約在45-60個日曆天，如遇外界不可抗因素（非人為,外力,天災,地變因素導致）工期延長，甲方應提前20個工作天提出，調整交貨時間。',
  '5. 驗收日後7個日曆天前乙方必須付清尾款（50%），交貨日起算30個日曆天後，必須離開甲方倉庫，如超出時間需收取倉儲費用（以總價款3%/日曆天收取）。',
  '6. 出廠價格預設不含稅金、敲牆、拆舊回收、灌漿及選配零件等額外項目，如有需要以追加報價單核定為準。',
  '7. 通訊軟體及電話均屬於溝通過程，所有產品內容和細節最終以簽署報價單最終版本為準。',
  '8. 兩造就契約履行所發生之爭議時，以臺灣新北地方法院為第一審管轄法院。',
  '9. 乙方如無鎖具要求，一律依甲方標準鎖體開孔，如乙方有自備鎖具，以乙方提供鎖具開孔圖或有備註時起為生產日。',
  '10. 本交易為附條件買賣，依動產擔保交易法第三章之規定，在貨款未完全付清或票據未兌現付價前，報價單之標的所有權仍屬甲方所有。',
  '11. 報價適用於上述條件與產品本身，如有特殊安裝需求及現場有礙難施工之情形，可委託甲方前往丈量確認。',
  '12. 如需委請甲方丈量，乙方需先付訂金3,000，訂金可折抵訂單總價。',
  '13. 保固服務：A.保證提供之（門體）非人為,外力,天災,地變因素導致外，皆有不變形3年保固服務。B.五金配件：如門鎖、鉸鏈等保固3年，他牌電子鎖依廠商保固期限為主。C.安裝保固：完工日起6個月內如有施工瑕疵免費處理。',
  '14. 保養：門片、把手及配件五金請用抹布搭配清水保養，請勿使用刺激性清潔產品（如：酒精、漂白水...等）。',
  '15. 乙方如需提前付款委請甲方丈量者；該款項將開立「暫收款憑證」，待最終報價單確認後，始一併開立統一發票；如未進入正式訂單階段，甲方無須另開發票，惟仍可提供收據作為付款憑證。',
  '16. 如有任何疑問，請即時聯絡業務人員。',
];

// 特殊需求清單（與後台表單一致）
export const REQUIREMENT_OPTIONS = ['無', '拆舊', '回收', '佔框', '濕式施工', '乾式包框', '站框'];

// helpers
export function fmtP(v) { return v ? 'NT$ ' + Number(v).toLocaleString() : '—'; }
export function fmtDate(str) {
  const d = str ? new Date(str) : new Date();
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
export function fmtDateLong(str) {
  const d = str ? new Date(str) : new Date();
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}

// 解析訂單編號：NTPC-A-2026-04-001 → { region, category, year, month, serial }
export function parseQuoteNo(no) {
  if (!no) return { full: '', region: '', category: '', year: '', month: '', serial: '' };
  const parts = String(no).split('-');
  if (parts.length >= 5) return {
    full: no, region: parts[0], category: parts[1],
    year: parts[2], month: parts[3], serial: parts.slice(4).join('-')
  };
  return { full: no, region: no, category: '', year: '', month: '', serial: '' };
}

// 從 official_note 抽單價（"門扇單價:78000 ..."）
function extractUnitPriceFromNote(note) {
  if (!note) return 0;
  const idx = note.indexOf('門扇單價:');
  if (idx === -1) return 0;
  let j = idx + 5, ns = '';
  while (j < note.length && note.charCodeAt(j) >= 48 && note.charCodeAt(j) <= 57) { ns += note[j]; j++; }
  return ns ? parseInt(ns, 10) : 0;
}

// 解析 addon_items 文字 → [{ label, amount }, ...]
function parseAddonItems(text) {
  const items = [];
  let total = 0;
  if (!text) return { items, total };
  text.split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    let i = line.length - 1;
    while (i >= 0 && (line[i] === ' ' || (line.charCodeAt(i) >= 48 && line.charCodeAt(i) <= 57) || line[i] === ',')) i--;
    const numStart = i + 1;
    if (numStart < line.length) {
      const amt = parseInt(line.substring(numStart).trim().replace(/,/g, ''), 10);
      if (!isNaN(amt)) {
        items.push({ label: line.substring(0, numStart).trim(), amount: amt });
        total += amt;
        return;
      }
    }
    items.push({ label: line, amount: null });
  });
  return { items, total };
}

// 主函數：從 case 物件建構報價單 view model
export function buildFormalQuoteVM(c) {
  if (!c) return null;
  const fd = c.formal_quote_data || {};
  const qty = c.quantity || 1;

  // 訂單編號分段
  const no = parseQuoteNo(c.formal_quote_no || c.order_no || c.case_no);

  // 門型 + 防火 label
  const typeLabel = DOOR_TYPE_LABEL[c.door_type] || c.door_type || '單開門';
  const fireLabel = fd.fire_type === 'f60a' ? 'f60A防火'
                  : fd.fire_type === 'f60a_smoke' ? 'f60A遮煙門'
                  : fd.fire_type === 'soundproof' ? '隔音'
                  : c.is_fireproof ? 'f60A防火' : '不防火';

  // 尺寸
  const widthMM = fd.width_mm || (c.actual_width_cm ? c.actual_width_cm * 10 : null);
  const heightMM = fd.height_mm || (c.actual_height_cm ? c.actual_height_cm * 10 : null);
  const widthCM = widthMM ? Math.round(widthMM / 10) : null;
  const heightCM = heightMM ? Math.round(heightMM / 10) : null;

  // 特殊需求
  const reqList = fd.special_requirements || [];
  const reqString = REQUIREMENT_OPTIONS.map(r => (reqList.includes(r) ? '■' : '☐') + r).join('   ');

  // 單價
  let unitPrice = fd.unit_price || extractUnitPriceFromNote(c.official_note);
  if (!unitPrice && c.official_price && qty > 0) unitPrice = Math.round(c.official_price / qty);

  // 追加項目
  const addon = parseAddonItems(c.addon_items);

  // 各項金額
  const discountRate = c.discount_rate || 1;
  const doorSubtotal = unitPrice * qty;
  const discounted = c.official_price || Math.round(doorSubtotal * discountRate);
  const installFee = c.install_fee || 0;
  const deliveryFee = fd.delivery_fee || 0;
  const measureFee = c.measure_fee || 3000;
  const totalPrice = c.total_with_tax || (discounted + addon.total + installFee + deliveryFee);
  const deposit = c.deposit_50 || Math.round(totalPrice * 0.5);
  const balance = c.balance != null
    ? c.balance
    : Math.max(0, totalPrice - deposit - measureFee);

  // 付款方式
  const payMethods = fd.payment_methods || {};

  return {
    company: COMPANY,
    no,
    dates: {
      quote: c.official_quote_at || c.created_at,
      created: c.created_at,
    },
    sales: {
      person: c.sales_person || null,
      createdBy: c.created_by || null,
    },
    customer: {
      name: c.customer_name || c.contact_person || '',
      phone: c.customer_phone || '',
      taxId: c.tax_id || '',
      address: c.case_address || c.customer_addr || '',
      floor: fd.floor || 0,
      hasElevator: fd.has_elevator !== false,
      type: c.customer_type || '',
    },
    door: {
      productCode: c.product_code || '',
      type: c.door_type || 'single',
      typeLabel,
      fireType: fd.fire_type || (c.is_fireproof ? 'f60a' : 'none'),
      fireLabel,
      qty,
      frameCount: fd.frame_count || qty,
      drawingNo: fd.drawing_no || '',
      deliveryDays: c.delivery_days || 90,
      widthMM, heightMM, widthCM, heightCM,
      frameThick: fd.frame_thickness || '',
      panelThick: fd.panel_thickness || '',
      direction: fd.door_direction || '',
      deliveryType: fd.delivery_type || '框扇同時',
      material: fd.material || '',
      frontPanel: fd.front_panel_style || '',
      backPanel: fd.back_panel_style || '',
      artFrame: fd.art_frame || '',
      color: fd.door_color || '',
      lockStyle: fd.lock_style || '',
      installMethod: fd.install_method || '甲方派送安裝',
    },
    requirements: {
      list: reqList,
      displayString: reqString,
    },
    accessories: fd.accessories || [],
    pricing: {
      unitPrice, doorSubtotal, discountRate, discounted,
      installFee, deliveryFee, measureFee,
      addonItems: addon.items,
      addonTotal: addon.total,
      totalPrice, deposit, balance,
    },
    payment: {
      methods: {
        measure: payMethods.measure || '',
        deposit: payMethods.deposit || '',
        balance: payMethods.balance || '',
      }
    },
    notes: {
      general: c.note || '',
      official: c.official_note || '',
    }
  };
}

// CORS 安全：只 fetch Supabase Storage 的圖片，doorworld.com.tw 等跳過
export function isSupabaseStorageUrl(url) {
  return !!url && url.includes('supabase.co/storage');
}

export async function safeFetchImageBuffer(url) {
  if (!isSupabaseStorageUrl(url)) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch { return null; }
}

export function imgExtension(url) {
  const ext = (url || '').split('?')[0].split('.').pop().toLowerCase();
  if (ext === 'jpg') return 'jpeg';
  if (['png', 'jpeg', 'gif', 'bmp'].includes(ext)) return ext;
  return 'jpeg';
}

// 付款方式 label
export const PAY_METHOD_LABEL = {
  '': '未指定', cash: '現金', transfer: '匯款', card: '信用卡(綠界)', measure_paid: '丈量費已付'
};

// 客戶類型 label
export const CUSTOMER_TYPE_LABEL = {
  D: '設計師', C: '直客', B: '建商', A: '代理', S: '股東', E: '員工', V: 'VIP'
};

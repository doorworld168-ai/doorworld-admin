// Formal Quote (報價單) PDF generator — opens print-ready HTML in new window
// Ported from admin.html v1, adapted for React and new company info
import { sbFetch } from './supabase';

const COMPANY = {
  nameZh: '門的世界 DOORWORLD',
  fullNameZh: '展億室內開發有限公司',
  taxId: '60667469',
  addr: '新北市五股區成泰路一段130-3號',
  phone: '02-2292-0366',
  email: 'doorworld168@gmail.com',
  web: 'doorworld.com.tw'
};

const DOOR_TYPE_LABEL = { single: '單開門', mother: '子母門', double: '雙開門', fire: '防火單門', room: '房間門', bathroom: '衛浴門', sliding: '橫拉門' };

function fmtP(v) { return v ? 'NT$ ' + Number(v).toLocaleString() : '—'; }
function fmtDate(str) {
  const d = str ? new Date(str) : new Date();
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}
function esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[m])); }

/**
 * Open a formal quote PDF (報價單) in a new window with print dialog
 * @param {object} c - case record from Supabase
 */
export async function printFormalQuote(c) {
  if (!c) { alert('找不到案件資料'); return; }
  const fd = c.formal_quote_data || {};

  // Fetch product image
  let thumbnailUrl = '';
  if (c.product_code) {
    try {
      const imgs = await sbFetch(`products?full_code=eq.${encodeURIComponent(c.product_code)}&select=thumbnail_url,image_url`);
      thumbnailUrl = (imgs && imgs[0] && (imgs[0].thumbnail_url || imgs[0].image_url)) || '';
    } catch {}
  }

  // Fetch accessory images from DB
  const accImgMap = {};
  try {
    const accRows = await sbFetch('accessories?select=name,image_url&is_active=eq.true&image_url=not.is.null');
    (accRows || []).forEach(a => { if (a.image_url) accImgMap[a.name] = a.image_url; });
  } catch {}

  const fireLabel = fd.fire_type === 'f60a' ? 'f60A防火' : fd.fire_type === 'f60a_smoke' ? 'f60A遮煙門' : c.is_fireproof ? 'f60A防火' : '不防火';
  const doorLabel = DOOR_TYPE_LABEL[c.door_type] || c.door_type || '單開門';
  const dateStr = fmtDate(c.official_quote_at || c.created_at);

  // Special requirements
  const reqs = fd.special_requirements || [];
  const reqChecks = ['拆舊', '回收', '佔框', '濕式施工', '乾式包框'];
  const reqStr = reqChecks.map(r => (reqs.indexOf(r) >= 0 ? '■' : '□') + r).join(' ');

  // Addon items parsing
  let addonRows = '';
  let addonTotal = 0;
  if (c.addon_items) {
    c.addon_items.split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      // Find trailing number
      let i = line.length - 1;
      while (i >= 0 && (line[i] === ' ' || (line.charCodeAt(i) >= 48 && line.charCodeAt(i) <= 57) || line[i] === ',')) i--;
      const numStart = i + 1;
      if (numStart < line.length) {
        const numStr = line.substring(numStart).trim().replace(/,/g, '');
        const amt = parseInt(numStr, 10);
        if (!isNaN(amt)) {
          const label = line.substring(0, numStart).trim();
          addonTotal += amt;
          addonRows += `<tr><td class="tdl">${esc(label)}</td><td class="tdv ra">${fmtP(amt)}</td></tr>`;
          return;
        }
      }
      addonRows += `<tr><td class="tdl" colspan="2">${esc(line)}</td></tr>`;
    });
  }

  // Price calculations
  let unitPrice = 0;
  const qty = c.quantity || 1;
  if (c.official_note) {
    const idx = c.official_note.indexOf('門扇單價:');
    if (idx !== -1) {
      let j = idx + 5;
      let numStr = '';
      while (j < c.official_note.length && c.official_note.charCodeAt(j) >= 48 && c.official_note.charCodeAt(j) <= 57) {
        numStr += c.official_note[j];
        j++;
      }
      if (numStr) unitPrice = parseInt(numStr, 10);
    }
  }
  if (!unitPrice && c.official_price && qty > 0) unitPrice = Math.round(c.official_price / qty);

  const discountRate = c.discount_rate || 1;
  const doorSubtotal = unitPrice * qty;
  const discounted = c.official_price || Math.round(doorSubtotal * discountRate);
  const installFee = c.install_fee || 0;
  const totalPrice = c.total_with_tax || (discounted + addonTotal + installFee);
  const deposit = c.deposit_50 || Math.round(totalPrice * 0.5);
  const balance = c.balance || (totalPrice - deposit);

  // Width/height in mm
  const wMM = fd.width_mm || (c.actual_width_cm ? c.actual_width_cm * 10 : '');
  const hMM = fd.height_mm || (c.actual_height_cm ? c.actual_height_cm * 10 : '');

  // Accessories block with images
  const acc = fd.accessories || [];
  const accessoryBlock = acc.length === 0 ? '' : `
    <div style="margin-top:6px">
      <div style="font-size:8px;font-weight:700;letter-spacing:3px;color:#c9a227;text-transform:uppercase;padding:3px 10px;background:#1a1a1a;display:inline-block;margin-bottom:4px">五金配件</div>
      <table style="width:100%"><tr>
        ${acc.map(a => {
          const chosen = a.useUpgrade ? a.upgrade : a.standard;
          const bg = a.useUpgrade ? '#f9f6ec' : '#fff';
          const imgUrl = accImgMap[chosen] || accImgMap[a.standard] || '';
          return `<td style="border:1px solid #e2d5a0;padding:6px 8px;text-align:center;background:${bg};vertical-align:top;width:${100/acc.length}%">
            <div style="font-size:8px;font-weight:700;color:#c9a227;letter-spacing:1px;margin-bottom:3px">${esc(a.label)}</div>
            ${imgUrl ? `<img src="${esc(imgUrl)}" alt="" style="width:60px;height:60px;object-fit:contain;border:1px solid #e2d5a0;border-radius:3px;margin-bottom:3px">` : '<div style="width:60px;height:60px;display:inline-block"></div>'}
            <div style="font-size:9px;font-weight:600;line-height:1.3">${esc(chosen || '—')}</div>
            ${a.useUpgrade ? '<div style="font-size:7px;color:#c9a227;margin-top:1px;font-weight:700">選配</div>' : '<div style="font-size:7px;color:#888;margin-top:1px">標配</div>'}
          </td>`;
        }).join('')}
      </tr></table>
    </div>`;

  const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>${esc(c.formal_quote_no || '報價單')}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:210mm}
body{font-family:"Noto Sans TC",sans-serif;background:#fff;color:#1a1a1a;font-size:11px;line-height:1.5}
.page{width:210mm;min-height:297mm;padding:12mm 14mm 10mm;display:flex;flex-direction:column}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:8px;border-bottom:2.5px solid #c9a227;margin-bottom:8px}
.hdr-l{flex:1}
.hdr-r{text-align:right;font-size:10px;color:#555}
.doc-title{font-size:28px;font-weight:900;color:#1a1a1a;letter-spacing:2px}
.doc-sub{font-size:10px;font-weight:700;color:#c9a227;letter-spacing:4px;text-transform:uppercase;margin-top:2px}
.company-info{font-size:9px;color:#666;margin-top:4px;line-height:1.6}
.qno{font-size:15px;font-weight:900;color:#1a1a1a;letter-spacing:1px;margin-bottom:4px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d4af37;margin-bottom:8px}
.info-cell{padding:5px 10px;border-bottom:1px solid #e8ddb5;font-size:10px}
.info-cell:nth-child(odd){border-right:1px solid #e8ddb5}
.info-lbl{color:#999;font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}
.info-val{font-weight:600;color:#1a1a1a;margin-top:1px}
.stitle{font-size:8px;font-weight:700;letter-spacing:3px;color:#c9a227;text-transform:uppercase;padding:4px 10px;background:#1a1a1a;display:inline-block;margin-bottom:4px}
.sec{margin-bottom:6px}
table{width:100%;border-collapse:collapse;margin-bottom:2px}
.tdl{padding:4px 8px;background:#f9f6ec;color:#555;font-size:9px;font-weight:600;border:1px solid #e2d5a0;white-space:nowrap}
.tdv{padding:4px 8px;color:#1a1a1a;font-size:10px;border:1px solid #e2d5a0;word-break:break-word}
.ra{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.prod-tbl th{padding:4px 6px;background:#1a1a1a;color:#c9a227;font-size:8px;font-weight:700;letter-spacing:1px;border:1px solid #333;text-align:center}
.prod-tbl td{padding:4px 6px;border:1px solid #e2d5a0;text-align:center;font-size:10px}
.total-box{background:#1a1a1a;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:4px}
.total-lbl{font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a227;text-transform:uppercase}
.total-amt{font-size:24px;font-weight:900;color:#c9a227;font-variant-numeric:tabular-nums}
.pay-grid{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #d4af37;margin-top:4px}
.pay-cell{padding:6px 10px;text-align:center;border-right:1px solid #e8ddb5}
.pay-cell:last-child{border-right:none}
.pay-lbl{font-size:8px;color:#999;font-weight:700;letter-spacing:1px}
.pay-val{font-size:14px;font-weight:900;color:#1a1a1a;margin-top:2px;font-variant-numeric:tabular-nums}
.terms{font-size:7.5px;color:#666;line-height:1.5;column-count:2;column-gap:12px;margin-top:6px;padding:6px 8px;border:1px solid #e2d5a0;background:#fdfcf7}
.terms b{color:#333}
.foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding-top:8px;border-top:1px solid #d4af37}
.seal{width:72px;height:72px;border-radius:50%;border:2px solid #c9a227;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#c9a227;text-align:center;line-height:1.3}
.sign-area{border:1px solid #d4af37;padding:8px 12px;min-width:200px;text-align:center}
.sign-lbl{font-size:8px;color:#999;letter-spacing:1px;margin-bottom:4px}
.sign-line{border-bottom:1px solid #ccc;height:40px}
.noprint{text-align:center;padding:10px;background:#1a1a1a;border-bottom:2px solid #c9a227}
.noprint button{background:#c9a227;color:#1a1a1a;border:none;padding:9px 28px;font-size:13px;font-weight:900;cursor:pointer;font-family:"Noto Sans TC",sans-serif;letter-spacing:2px}
@media print{.noprint{display:none}html,body{width:210mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{page-break-after:avoid}@page{margin:0;size:A4}}
</style></head><body>
<div class="noprint"><button onclick="window.print()">列印 / 儲存 PDF</button></div>
<div class="page">
  <div class="hdr">
    <div class="hdr-l">
      <div class="doc-title">報價單</div>
      <div class="doc-sub">QUOTATION</div>
      <div class="company-info">
        甲方：${COMPANY.nameZh}（${COMPANY.fullNameZh}）　統編 ${COMPANY.taxId}<br>
        ${COMPANY.addr}　TEL: ${COMPANY.phone}　Email: ${COMPANY.email}
      </div>
    </div>
    <div class="hdr-r">
      <div class="qno">${esc(c.formal_quote_no || c.order_no || c.case_no || '—')}</div>
      <div>日期：${dateStr}</div>
      ${c.sales_person ? `<div>業務：${esc(c.sales_person)}</div>` : ''}
      ${c.created_by ? `<div>建單：${esc(c.created_by)}</div>` : ''}
    </div>
  </div>

  <div class="info-grid">
    <div class="info-cell"><div class="info-lbl">乙方 / 聯絡人</div><div class="info-val">${esc(c.customer_name || c.contact_person || '—')}</div></div>
    <div class="info-cell"><div class="info-lbl">統編</div><div class="info-val">${esc(c.tax_id || '—')}</div></div>
    <div class="info-cell"><div class="info-lbl">電話</div><div class="info-val">${esc(c.customer_phone || '—')}</div></div>
    <div class="info-cell"><div class="info-lbl">樓層 / 電梯</div><div class="info-val">${fd.has_elevator === false ? '無電梯' : '有電梯'}</div></div>
    <div class="info-cell" style="grid-column:span 2"><div class="info-lbl">案場地址</div><div class="info-val">${esc(c.case_address || c.customer_addr || '—')}</div></div>
  </div>

  <div class="sec">
    <div class="stitle">報價明細</div>
    <div style="display:flex;gap:12px;align-items:flex-start">
      <table style="flex:1">
        <tr><td class="tdl">款式名稱</td><td class="tdv" style="font-weight:700">${esc(c.product_code || '—')}</td>
            <td class="tdl">門的需求</td><td class="tdv">${esc(doorLabel)}</td></tr>
        <tr><td class="tdl">防火需求</td><td class="tdv">${esc(fireLabel)}</td>
            <td class="tdl">交貨時間</td><td class="tdv">${c.delivery_days || 90} 日曆天</td></tr>
        <tr><td class="tdl">特殊需求</td><td class="tdv" colspan="3" style="font-size:9px">${reqs.length ? reqStr : '□無 ' + reqStr}</td></tr>
        <tr><td class="tdl">派送安裝</td><td class="tdv" colspan="3">${esc(fd.install_method || '甲方派送安裝')}</td></tr>
      </table>
      ${thumbnailUrl ? `<div style="flex-shrink:0;border:1px solid #e2d5a0;background:#fdfcf7;border-radius:4px;padding:6px;text-align:center"><img src="${esc(thumbnailUrl)}" alt="" style="width:150px;height:150px;object-fit:contain"><div style="font-size:7px;color:#999;margin-top:3px">效果圖僅供參考</div></div>` : ''}
    </div>
  </div>

  <div class="sec">
    <div class="stitle">門框尺寸 / 產品規格</div>
    <table class="prod-tbl">
      <tr><th>門洞寬(W)</th><th>門洞高(H)</th><th>框厚</th><th>扇厚</th><th>門開方向</th><th>數量</th><th>藝術框</th><th>交貨方式</th><th>門扇顏色</th><th>門鎖樣式</th><th>門扇單價</th></tr>
      <tr>
        <td>${wMM ? Math.round(wMM / 10) + ' cm' : '—'}</td>
        <td>${hMM ? Math.round(hMM / 10) + ' cm' : '—'}</td>
        <td>${esc(fd.frame_thickness || '—')}</td>
        <td>${esc(fd.panel_thickness || '—')}</td>
        <td>${esc(fd.door_direction || '—')}</td>
        <td>${qty}</td>
        <td>${esc(fd.art_frame || '無')}</td>
        <td>${esc(fd.delivery_type || '框扇同時')}</td>
        <td>${esc(fd.door_color || '—')}</td>
        <td>${esc(fd.lock_style || '—')}</td>
        <td style="font-weight:700">${fmtP(unitPrice)}</td>
      </tr>
    </table>
    ${accessoryBlock}
    ${c.note ? `<div style="margin-top:4px;font-size:9px;color:#555;padding:4px 8px;background:#f9f6ec;border:1px solid #e2d5a0">備註：${esc(c.note)}</div>` : ''}
  </div>

  <div class="sec">
    <div class="stitle">訂單金額</div>
    <table>
      <tr><td class="tdl">門扇費用 (${qty}樘)</td><td class="tdv ra">${fmtP(doorSubtotal)}</td></tr>
      ${discountRate < 1 ? `<tr><td class="tdl">折扣 (${Math.round(discountRate * 100)}%)</td><td class="tdv ra">${fmtP(discounted)}</td></tr>` : ''}
      ${installFee ? `<tr><td class="tdl">安裝費</td><td class="tdv ra">${fmtP(installFee)}</td></tr>` : ''}
      ${addonRows ? `<tr><td class="tdl" colspan="2" style="background:#1a1a1a;color:#c9a227;font-size:8px;font-weight:700;letter-spacing:2px;text-align:left">附加施工費明細</td></tr>${addonRows}` : ''}
    </table>
    <div class="total-box">
      <div><div class="total-lbl">含稅總價</div></div>
      <div class="total-amt">${fmtP(totalPrice)}</div>
    </div>
    <div class="pay-grid">
      <div class="pay-cell"><div class="pay-lbl">訂金 50%</div><div class="pay-val">${fmtP(deposit)}</div></div>
      <div class="pay-cell"><div class="pay-lbl">尾款</div><div class="pay-val">${fmtP(balance)}</div></div>
      <div class="pay-cell"><div class="pay-lbl">含稅總價</div><div class="pay-val" style="color:#c9a227">${fmtP(totalPrice)}</div></div>
    </div>
  </div>

  <div class="terms">
    <b>報價單注意事項：</b><br>
    1.下單時乙方先預付50%訂金，收訂金日視為下單日。<br>
    2.客製化產品下單後如要求改單，由下單日起算第3個日曆天下午1點後，改單所造成的損失由乙方承擔訂單總價之80%。<br>
    3.有品質問題時自驗收後5個工作天內經乙方提出，逾期甲方不再負責。<br>
    4.依客製化生產週期約在45~60個日曆天，如遇不可抗因素工期延長，甲方應提前20個工作天提出。<br>
    5.驗收日後7個日曆天前乙方必須付清尾款(50%)，交貨日起算30個日曆天後須離開甲方倉庫，超出時間收取倉儲費(總貨款3%/日曆天)。<br>
    6.出廠價格預設不含敲牆、拆舊回收、灌漿及選配零件等額外項目，如有需要以追加報價單核定為準。<br>
    7.通訊軟體及電話均屬溝通過程，所有內容以簽署報價單最終版本為準。<br>
    8.爭議時以臺灣新北市地方法院為第一審管轄法院。<br>
    9.乙方如無鎖具要求，一律依甲方標準鎖體開孔。<br>
    10.本交易為附條件買賣，貨款未付清前標的所有權屬甲方。<br>
    11.報價適用於上述條件與產品，如有特殊安裝需求可委託甲方丈量確認。<br>
    12.委請甲方丈量需先付訂金$3,000，可折抵訂單總價。<br>
    13.保固：門體非人為因素3年不變形保固；五金3年；安裝保固完工6個月。<br>
    14.保養請用抹布搭配清水，勿使用刺激性清潔產品。<br>
    15.提前付款開立暫收款憑證，待報價單確認後一併開立發票。<br>
    16.如有任何疑問，請即時聯絡業務人員。
  </div>

  <div class="foot">
    <div>
      <div style="font-size:12px;font-weight:900;color:#1a1a1a;margin-bottom:3px">${COMPANY.nameZh}</div>
      <div style="font-size:9px;color:#555">列印日期：${fmtDate(null)}</div>
    </div>
    <div class="sign-area">
      <div class="sign-lbl">客戶確認回傳（發票章 / 簽章 / 全名 / 日期）</div>
      <div class="sign-line"></div>
      <div style="font-size:7px;color:#999;margin-top:2px">已詳細核對上述訂購單注意事項，確保其正確性。</div>
    </div>
    <div class="seal">公司<br>印章</div>
  </div>
</div>
<script>window.onload=function(){
  var p=document.querySelector(".page");
  var maxH=297*3.7795;
  if(p.scrollHeight>maxH){
    var s=maxH/p.scrollHeight;
    p.style.transform="scale("+s+")";
    p.style.transformOrigin="top left";
    p.style.width=(210/s)+"mm";
  }
};<\/script>
</body></html>`;

  const win = window.open('', '_blank', 'width=820,height=1160');
  if (!win) { alert('請允許彈出視窗以列印 PDF'); return; }
  win.document.write(html);
  win.document.close();
}

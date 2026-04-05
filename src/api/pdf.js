// Formal Quote (報價單) PDF generator — opens print-ready HTML in new window
// Used by FormalQuote and NewFormalQuote pages
import { sbFetch } from './supabase';

const COMPANY = {
  nameZh: '展億室內開發有限公司',
  nameEn: 'Door World',
  brandZh: '門的世界',
  taxId: '60667469',
  addr: '新北市五股區成泰路一段130-3號',
  phone: '02-2292-0366',
  web: 'doorworld.com.tw',
  tagline: '頂級大門・專業安裝・品質保證'
};

const DOOR_LABEL = { single: '單門', mother: '子母門', double: '雙開門', fire: '防火單門', room: '房間門', bathroom: '衛浴門', sliding: '橫拉門' };
const FIRE_LABEL = { none: '一般（非防火）', f60a: 'F60A 防火', f60a_smoke: 'F60A 防火遮煙' };

function fmtP(v) { return (v || v === 0) ? 'NT$ ' + Number(v).toLocaleString() : '—'; }
function fmtDate(str) {
  const d = str ? new Date(str) : new Date();
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}
function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m])); }

/**
 * Open a formal quote PDF (報價單) in a new window with print dialog
 * Fetches product thumbnail before rendering
 * @param {object} c - case record from Supabase
 */
export async function printFormalQuote(c) {
  if (!c) { alert('找不到報價單資料'); return; }

  // Fetch product thumbnail
  let thumbnailUrl = '';
  if (c.product_code) {
    try {
      const imgs = await sbFetch(`products?full_code=eq.${encodeURIComponent(c.product_code)}&select=thumbnail_url`);
      thumbnailUrl = (imgs && imgs[0] && imgs[0].thumbnail_url) || '';
    } catch {}
  }

  const fq = c.formal_quote_data || {};
  const accessories = Array.isArray(fq.accessories) ? fq.accessories : [];
  const specialReqs = Array.isArray(fq.special_requirements) ? fq.special_requirements : [];
  const quoteNo = c.formal_quote_no || c.order_no || c.case_no || '—';
  const today = fmtDate(null);
  const dateStr = fmtDate(c.created_at);

  const doorLabel = DOOR_LABEL[c.door_type] || c.door_type || '—';
  const fireLabel = FIRE_LABEL[fq.fire_type] || (c.is_fireproof ? '防火' : '一般');
  const wCM = c.actual_width_cm || (fq.width_mm ? Math.round(fq.width_mm / 10) : '');
  const hCM = c.actual_height_cm || (fq.height_mm ? Math.round(fq.height_mm / 10) : '');
  const sizeStr = wCM && hCM ? `寬 ${wCM} × 高 ${hCM} cm` : '—';
  const qty = c.quantity || 1;

  // Accessory rows: show standard OR upgrade based on useUpgrade flag
  const accList = accessories
    .map(a => {
      const choice = a.useUpgrade && a.upgrade ? a.upgrade : a.standard;
      const level = a.useUpgrade && a.upgrade ? '升級' : '標配';
      return { label: a.label || a.key, item: choice || '—', level };
    })
    .filter(a => a.item && a.item !== '—');

  const accRowsHtml = accList.length === 0 ? '' : `
    <div class="sec"><div class="stitle"><span class="stitle-txt">五金配件</span></div>
    <table class="bd-table">
      <colgroup><col style="width:90px"><col><col style="width:54px"></colgroup>
      ${accList.map(a => `<tr>
        <td class="bdl">${esc(a.label)}</td>
        <td class="bdv" style="text-align:left;font-weight:500">${esc(a.item)}</td>
        <td class="bdv" style="text-align:center;font-size:9px;color:${a.level === '升級' ? '#c9a227' : '#888'}">${a.level}</td>
      </tr>`).join('')}
    </table></div>`;

  // Specs block (install method, frame, direction, etc.)
  const specPairs = [
    ['開門方向', fq.door_direction],
    ['交貨方式', fq.delivery_type],
    ['安裝方式', fq.install_method],
    ['有無電梯', fq.has_elevator === true ? '有' : fq.has_elevator === false ? '無' : null],
    ['畫框', fq.art_frame && fq.art_frame !== '無' ? fq.art_frame : null],
  ].filter(([, v]) => v);
  const specHtml = specPairs.length === 0 ? '' : `
    <div class="sec"><div class="stitle"><span class="stitle-txt">安裝規格</span></div>
    <table class="spec-grid">
      ${specPairs.reduce((acc, p, i) => {
        if (i % 2 === 0) acc.push([p]); else acc[acc.length - 1].push(p);
        return acc;
      }, []).map(row => `<tr>${row.map(([l, v]) => `<td class="tdl">${esc(l)}</td><td class="tdv">${esc(v)}</td>`).join('')}${row.length === 1 ? '<td class="tdl" style="border:none;background:none"></td><td class="tdv" style="border:none;background:none"></td>' : ''}</tr>`).join('')}
    </table></div>`;

  const specReqHtml = specialReqs.length === 0 ? '' : `
    <div class="sec"><div class="stitle"><span class="stitle-txt">特殊需求</span></div>
    <div class="special-box">${specialReqs.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div></div>`;

  // Financial calculation: total_with_tax is already tax-included, break it down
  const totalWithTax = Number(c.total_with_tax || 0);
  const subtotal = totalWithTax ? Math.round(totalWithTax / 1.05) : Number(c.official_price || 0);
  const tax = totalWithTax ? totalWithTax - subtotal : Math.round(subtotal * 0.05);
  const finalTotal = totalWithTax || (subtotal + tax);
  const unitPrice = qty > 0 ? Math.round(subtotal / qty) : subtotal;

  const imgHtml = thumbnailUrl
    ? `<img src="${esc(thumbnailUrl)}" alt="" style="width:120px;height:120px;object-fit:cover;border:1px solid #d4af37;display:block">`
    : `<div style="width:120px;height:120px;border:1px dashed #d4af37;display:flex;align-items:center;justify-content:center;font-size:9px;color:#c9a227;letter-spacing:1px">暫無圖片</div>`;

  const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>報價單 ${esc(quoteNo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:210mm}
body{font-family:"Noto Sans TC",sans-serif;background:#fff;color:#1a1a1a;font-size:11px;line-height:1.55}
.page{width:210mm;min-height:297mm;padding:12mm 14mm 10mm;display:flex;flex-direction:column}
.hdr{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:10px;border-bottom:2.5px solid #c9a227;margin-bottom:10px}
.logo-zh{font-size:30px;font-weight:900;color:#1a1a1a;letter-spacing:2px;line-height:1}
.logo-en{font-size:10px;font-weight:700;color:#c9a227;letter-spacing:4px;text-transform:uppercase;margin-top:3px}
.co-info{font-size:8.5px;color:#666;line-height:1.65;margin-top:6px}
.co-info strong{color:#1a1a1a;font-weight:700}
.hdr-r{text-align:right;flex-shrink:0}
.doc-type{font-size:9px;font-weight:700;letter-spacing:4px;color:#888;text-transform:uppercase;margin-bottom:4px}
.qno{font-size:16px;font-weight:900;color:#1a1a1a;letter-spacing:1px}
.badge{display:inline-block;margin-top:4px;padding:3px 12px;border-radius:2px;font-size:9px;font-weight:700;letter-spacing:1px;color:#fff;background:#1a5c38}
.doc-date{font-size:9px;color:#666;margin-top:6px}
.infobar{display:flex;border:1px solid #d4af37;margin-bottom:8px}
.ic{flex:1;padding:7px 12px;border-right:1px solid #d4af37}
.ic:last-child{border-right:none}
.icl{font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a227;text-transform:uppercase;margin-bottom:3px}
.icv{font-size:11.5px;font-weight:700;color:#1a1a1a}
.addr{margin-bottom:8px;padding:6px 11px;background:#f9f6ec;border:1px solid #d4af37;font-size:10.5px;color:#3a3a3a}
.addr-lbl{font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a227;margin-right:8px}
.stitle{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.stitle-txt{font-size:8px;font-weight:700;letter-spacing:3px;text-transform:uppercase;white-space:nowrap;padding:3px 10px;background:#1a1a1a;color:#c9a227}
.stitle::after{content:"";flex:1;height:1px;background:#d4af37}
.sec{margin-bottom:9px}
.prod-row{display:flex;gap:11px;align-items:flex-start}
.prod-info{flex:1}
table{width:100%;border-collapse:collapse}
.tdl{width:95px;padding:5px 10px;background:#f9f6ec;color:#555;font-size:9.5px;font-weight:600;border:1px solid #e2d5a0;vertical-align:middle}
.tdv{padding:5px 10px;color:#1a1a1a;font-size:11px;border:1px solid #e2d5a0;word-break:break-word}
.spec-grid .tdl{width:68px}
.spec-grid .tdv{font-size:10.5px}
.bd-table{border:1px solid #e2d5a0}
.bdl{padding:5px 12px;background:#f9f6ec;color:#555;font-size:10px;font-weight:600;border-bottom:1px solid #e8dfb8}
.bdv{padding:5px 12px;color:#1a1a1a;font-size:11px;text-align:right;font-weight:600;border-bottom:1px solid #e8dfb8;font-variant-numeric:tabular-nums}
.bd-table tr:last-child .bdl,.bd-table tr:last-child .bdv{border-bottom:none}
.special-box{padding:8px 10px;background:#fff8e5;border:1px dashed #d4af37;border-radius:3px}
.tag{display:inline-block;padding:2px 10px;background:#1a1a1a;color:#c9a227;font-size:10px;font-weight:700;border-radius:2px;margin:2px 4px 2px 0;letter-spacing:1px}
.tax-box{margin-top:8px;border:1px solid #1a1a1a}
.tax-row{display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #333}
.tax-row:last-child{border-bottom:none;background:#1a1a1a;color:#c9a227}
.tax-row.subtotal,.tax-row.tax{background:#fafafa}
.tax-lbl{font-size:10px;font-weight:600;letter-spacing:1px;color:#555}
.tax-val{font-size:12px;font-weight:700;color:#1a1a1a;font-variant-numeric:tabular-nums}
.tax-row:last-child .tax-lbl{color:#c9a227;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase}
.tax-row:last-child .tax-val{color:#c9a227;font-size:22px;font-weight:900;letter-spacing:1px}
.disclaimer{margin-top:7px;padding:6px 10px;background:#f9f6ec;border-left:3px solid #c9a227;font-size:8.5px;color:#666;line-height:1.75}
.spacer{flex:1;min-height:10px}
.sign-row{display:flex;gap:14px;margin-top:14px;margin-bottom:12px}
.sign-box{flex:1;border:1px solid #ccc;padding:10px 14px;min-height:68px;position:relative}
.sign-lbl{font-size:8.5px;font-weight:700;letter-spacing:2px;color:#888;text-transform:uppercase;position:absolute;top:-7px;left:10px;background:#fff;padding:0 6px}
.sign-date{position:absolute;bottom:6px;right:10px;font-size:8px;color:#999}
.foot{padding-top:8px;border-top:1px solid #d4af37;display:flex;justify-content:space-between;align-items:flex-end;font-size:9px;color:#666}
.foot-brand{font-size:11px;font-weight:900;color:#1a1a1a;letter-spacing:1px}
.noprint{text-align:center;padding:12px;background:#1a1a1a;border-bottom:2px solid #c9a227}
.noprint button{background:#c9a227;color:#1a1a1a;border:none;padding:9px 30px;font-size:13px;font-weight:900;cursor:pointer;font-family:"Noto Sans TC",sans-serif;letter-spacing:2px}
@media print{.noprint{display:none}html,body{width:210mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{page-break-after:avoid}@page{margin:0;size:A4}}
</style></head><body>
<div class="noprint"><button onclick="window.print()">列印 / 儲存 PDF</button></div>
<div class="page">
  <div class="hdr">
    <div>
      <div class="logo-zh">${COMPANY.brandZh}</div>
      <div class="logo-en">${COMPANY.nameEn}</div>
      <div class="co-info">
        <strong>${COMPANY.nameZh}</strong>　統編 ${COMPANY.taxId}<br>
        ${COMPANY.addr}　T. ${COMPANY.phone}<br>
        ${COMPANY.web}
      </div>
    </div>
    <div class="hdr-r">
      <div class="doc-type">正式報價單 Formal Quotation</div>
      <div class="qno">${esc(quoteNo)}</div>
      <span class="badge">正式報價</span>
      <div class="doc-date">${dateStr}</div>
    </div>
  </div>
  <div class="infobar">
    <div class="ic"><div class="icl">客戶姓名</div><div class="icv">${esc(c.customer_name || '—')}</div></div>
    <div class="ic"><div class="icl">聯絡電話</div><div class="icv">${esc(c.customer_phone || '—')}</div></div>
    ${c.sales_person ? `<div class="ic"><div class="icl">業務窗口</div><div class="icv">${esc(c.sales_person)}</div></div>` : ''}
  </div>
  ${c.case_address ? `<div class="addr"><span class="addr-lbl">施工地址</span>${esc(c.case_address)}</div>` : ''}

  <div class="sec"><div class="stitle"><span class="stitle-txt">產品資訊</span></div>
    <div class="prod-row">
      <div class="prod-info"><table>
        <tr><td class="tdl">產品編號</td><td class="tdv" style="font-family:monospace;font-size:12px;font-weight:700">${esc(c.product_code || '—')}</td></tr>
        <tr><td class="tdl">門型</td><td class="tdv">${esc(doorLabel)}</td></tr>
        <tr><td class="tdl">防火規格</td><td class="tdv">${esc(fireLabel)}</td></tr>
        <tr><td class="tdl">尺寸規格</td><td class="tdv">${esc(sizeStr)}</td></tr>
        <tr><td class="tdl">數量</td><td class="tdv">${qty} 樘</td></tr>
      </table></div>
      <div style="flex-shrink:0">${imgHtml}</div>
    </div>
  </div>

  ${specHtml}
  ${accRowsHtml}
  ${specReqHtml}

  <div class="sec"><div class="stitle"><span class="stitle-txt">金額明細</span></div>
    <table class="bd-table">
      <tr><td class="bdl">單樘報價（未稅）</td><td class="bdv">${fmtP(unitPrice)}</td></tr>
      <tr><td class="bdl">數量</td><td class="bdv">× ${qty} 樘</td></tr>
    </table>
    <div class="tax-box">
      <div class="tax-row subtotal"><div class="tax-lbl">小計（未稅）</div><div class="tax-val">${fmtP(subtotal)}</div></div>
      <div class="tax-row tax"><div class="tax-lbl">營業稅 5%</div><div class="tax-val">${fmtP(tax)}</div></div>
      <div class="tax-row"><div class="tax-lbl">含稅總計</div><div class="tax-val">${fmtP(finalTotal)}</div></div>
    </div>
  </div>

  <div class="disclaimer">
    ・本報價單為正式報價，經雙方簽署後生效，報價含大門本體、五金配件與基礎安裝。
    ・付款方式：簽約時付 50% 訂金，到貨安裝完成驗收後付尾款 50%。
    ・本報價有效期限自出單日起 <strong>30 天</strong>，逾期請重新詢價。
  </div>

  <div class="spacer"></div>

  <div class="sign-row">
    <div class="sign-box"><span class="sign-lbl">客戶簽章</span><span class="sign-date">日期：　　　年　　月　　日</span></div>
    <div class="sign-box"><span class="sign-lbl">公司簽章</span><span class="sign-date">${COMPANY.nameZh}</span></div>
  </div>

  <div class="foot">
    <div><span class="foot-brand">${COMPANY.brandZh} ${COMPANY.nameEn}</span>　${COMPANY.tagline}</div>
    <div>列印日期：${today}</div>
  </div>
</div>
</body></html>`;

  const win = window.open('', '_blank', 'width=820,height=1160');
  if (!win) { alert('請允許彈出視窗以列印 PDF'); return; }
  win.document.write(html);
  win.document.close();
}

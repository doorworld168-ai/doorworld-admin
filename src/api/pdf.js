// Formal Quote (報價單) PDF generator — 對齊 Excel 內容 schema
// 從 formalQuoteData.buildFormalQuoteVM 取資料
import { sbFetch } from './supabase';
import {
  buildFormalQuoteVM, fmtP, fmtDateLong, QUOTE_TERMS,
  CUSTOMER_TYPE_LABEL, PAY_METHOD_LABEL
} from './formalQuoteData';

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, m =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[m]));
}

const checkMark = (val, target) => val === target ? '■' : '☐';

/**
 * Open a formal quote PDF (報價單) in a new window with print dialog
 */
export async function printFormalQuote(c) {
  if (!c) { alert('找不到案件資料'); return; }
  const vm = buildFormalQuoteVM(c);

  // Fetch product image
  let thumbnailUrl = '';
  if (vm.door.productCode) {
    try {
      const imgs = await sbFetch(`products?full_code=eq.${encodeURIComponent(vm.door.productCode)}&select=thumbnail_url,image_url`);
      thumbnailUrl = (imgs && imgs[0] && (imgs[0].thumbnail_url || imgs[0].image_url)) || '';
    } catch {}
  }

  // Fetch accessory images map (by name)
  const accImgMap = {};
  try {
    const accRows = await sbFetch('accessories?select=name,image_url&is_active=eq.true&image_url=not.is.null');
    (accRows || []).forEach(a => { if (a.image_url) accImgMap[a.name] = a.image_url; });
  } catch {}

  // Fetch color card image
  let colorImgUrl = '', colorName = '';
  if (vm.door.color) {
    try {
      const cc = await sbFetch(`color_cards?code=eq.${encodeURIComponent(vm.door.color)}&select=image_url,name_zh,name_en`);
      if (cc && cc[0]) { colorImgUrl = cc[0].image_url || ''; colorName = cc[0].name_zh || cc[0].name_en || ''; }
    } catch {}
  }

  // Fetch panel style images
  let frontPanelImg = '', backPanelImg = '';
  if (vm.door.frontPanel || vm.door.backPanel) {
    try {
      const codes = [vm.door.frontPanel, vm.door.backPanel].filter(Boolean);
      const ps = await sbFetch(`panel_styles?code=in.(${codes.map(c => `"${c}"`).join(',')})&select=code,image_url`);
      (ps || []).forEach(p => {
        if (p.code === vm.door.frontPanel) frontPanelImg = p.image_url || '';
        if (p.code === vm.door.backPanel) backPanelImg = p.image_url || '';
      });
    } catch {}
  }

  const dateStr = fmtDateLong(vm.dates.quote);

  // Addon rows HTML
  let addonRows = '';
  vm.pricing.addonItems.forEach(item => {
    if (item.amount != null) {
      addonRows += `<tr><td class="tdl">${esc(item.label)}</td><td class="tdv ra">${fmtP(item.amount)}</td></tr>`;
    } else {
      addonRows += `<tr><td class="tdl" colspan="2">${esc(item.label)}</td></tr>`;
    }
  });

  // Accessory block with images
  const acc = vm.accessories;
  const accessoryBlock = acc.length === 0 ? '' : `
    <div style="margin-top:6px">
      <div style="font-size:8px;font-weight:700;letter-spacing:3px;color:#c9a227;text-transform:uppercase;padding:3px 10px;background:#1a1a1a;display:inline-block;margin-bottom:4px">五金配件</div>
      <table style="width:100%"><tr>
        ${acc.map(a => {
          const chosen = a.useUpgrade ? a.upgrade : a.standard;
          const bg = a.useUpgrade ? '#f9f6ec' : '#fff';
          const imgUrl = accImgMap[chosen] || accImgMap[a.standard] || '';
          return `<td style="border:1px solid #e2d5a0;padding:6px 8px;text-align:center;background:${bg};vertical-align:top;width:${100 / acc.length}%">
            <div style="font-size:8px;font-weight:700;color:#c9a227;letter-spacing:1px;margin-bottom:3px">${esc(a.label)}</div>
            ${imgUrl ? `<img src="${esc(imgUrl)}" alt="" style="width:50px;height:50px;object-fit:contain;border:1px solid #e2d5a0;border-radius:3px;margin-bottom:3px">` : '<div style="width:50px;height:50px;display:inline-block"></div>'}
            <div style="font-size:9px;font-weight:600;line-height:1.3">${esc(chosen || '—')}</div>
            ${a.useUpgrade ? '<div style="font-size:7px;color:#c9a227;margin-top:1px;font-weight:700">選配</div>' : '<div style="font-size:7px;color:#888;margin-top:1px">標配</div>'}
          </td>`;
        }).join('')}
      </tr></table>
    </div>`;

  // 16 條條款 HTML
  const termsHtml = QUOTE_TERMS.map((line, idx) => {
    if (idx === 0) return `<b>${esc(line)}</b>`;
    return esc(line);
  }).join('<br>');

  // 付款方式 row
  function payCheckboxRow(label, amount, methodVal, allowMeasurePaid) {
    const opts = ['cash', 'transfer', 'card'];
    if (allowMeasurePaid) opts.push('measure_paid');
    return `<tr>
      <td class="tdl">${esc(label)}</td>
      <td class="tdv ra" style="font-weight:700">${fmtP(amount)}</td>
      <td class="tdv" colspan="2" style="font-size:9px">${opts.map(o => `${checkMark(methodVal, o)}${PAY_METHOD_LABEL[o]}`).join('   ')}</td>
    </tr>`;
  }

  const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>${esc(vm.no.full || '報價單')}</title>
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
.doc-ver{font-size:8px;color:#888;margin-top:1px}
.company-info{font-size:9px;color:#666;margin-top:4px;line-height:1.6}
.qno{font-size:15px;font-weight:900;color:#1a1a1a;letter-spacing:1px;margin-bottom:4px}
.qno-seg{font-size:8px;color:#999;font-weight:500;letter-spacing:0.5px}
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
.style-row{display:flex;gap:6px;margin-top:4px}
.style-cell{flex:1;border:1px solid #e2d5a0;background:#fdfcf7;padding:5px;text-align:center;font-size:9px}
.style-cell img{width:54px;height:54px;object-fit:contain;display:block;margin:0 auto 3px}
.total-box{background:#1a1a1a;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:4px}
.total-lbl{font-size:8px;font-weight:700;letter-spacing:2px;color:#c9a227;text-transform:uppercase}
.total-amt{font-size:24px;font-weight:900;color:#c9a227;font-variant-numeric:tabular-nums}
.terms{font-size:7.5px;color:#444;line-height:1.55;column-count:2;column-gap:12px;margin-top:6px;padding:6px 8px;border:1px solid #e2d5a0;background:#fdfcf7}
.terms b{color:#c9a227;display:block;margin-bottom:2px;font-size:8px;letter-spacing:1px}
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
      <div class="doc-ver">版本/更新日期：001/20251212</div>
      <div class="company-info">
        甲方：${vm.company.nameZh}（${vm.company.fullNameZh}）　統編 ${vm.company.taxId}<br>
        ${vm.company.addr}　TEL: ${vm.company.phone}　Email: ${vm.company.email}
      </div>
    </div>
    <div class="hdr-r">
      <div class="qno">${esc(vm.no.full || '—')}</div>
      ${vm.no.region ? `<div class="qno-seg">${esc(vm.no.region)} / ${esc(vm.no.category)} / ${esc(vm.no.year)} / ${esc(vm.no.month)} / ${esc(vm.no.serial)}</div>` : ''}
      <div style="margin-top:3px">建單日期：${dateStr}</div>
      ${vm.sales.person ? `<div>承辦業務：${esc(vm.sales.person)}</div>` : ''}
      ${vm.sales.createdBy ? `<div>建單者：${esc(vm.sales.createdBy)}</div>` : ''}
    </div>
  </div>

  <div class="info-grid">
    <div class="info-cell"><div class="info-lbl">乙方 / 聯絡人</div><div class="info-val">${esc(vm.customer.name || '—')}</div></div>
    <div class="info-cell"><div class="info-lbl">統編</div><div class="info-val">${esc(vm.customer.taxId || '—')}</div></div>
    <div class="info-cell"><div class="info-lbl">電話</div><div class="info-val">${esc(vm.customer.phone || '—')}</div></div>
    <div class="info-cell"><div class="info-lbl">樓層 / 電梯</div><div class="info-val">${vm.customer.floor || '—'} F　${vm.customer.hasElevator ? '■有電梯  ☐無電梯' : '☐有電梯  ■無電梯'}</div></div>
    <div class="info-cell" style="grid-column:span 2"><div class="info-lbl">案場地址</div><div class="info-val">${esc(vm.customer.address || '—')}</div></div>
    ${vm.customer.type ? `<div class="info-cell" style="grid-column:span 2"><div class="info-lbl">客戶型態</div><div class="info-val">${esc(CUSTOMER_TYPE_LABEL[vm.customer.type] || vm.customer.type)}</div></div>` : ''}
  </div>

  <div class="sec">
    <div class="stitle">報價明細</div>
    <div style="display:flex;gap:12px;align-items:flex-start">
      <table style="flex:1">
        <tr><td class="tdl">款式名稱</td><td class="tdv" style="font-weight:700">${esc(vm.door.productCode || '—')}</td>
            <td class="tdl">材質/工藝</td><td class="tdv">${esc(vm.door.material || '—')}</td></tr>
        <tr><td class="tdl">門的需求</td><td class="tdv">${esc(vm.door.typeLabel)}</td>
            <td class="tdl">其他需求</td><td class="tdv">${esc(vm.door.fireLabel)}</td></tr>
        <tr><td class="tdl">運送安裝方式</td><td class="tdv">${esc(vm.door.installMethod)}</td>
            <td class="tdl">交貨時間</td><td class="tdv">${vm.door.deliveryDays} 日曆天</td></tr>
        <tr><td class="tdl">特殊需求</td><td class="tdv" colspan="3" style="font-size:9px">${vm.requirements.displayString}</td></tr>
        <tr><td class="tdl">搬運費用</td><td class="tdv">${vm.pricing.deliveryFee ? fmtP(vm.pricing.deliveryFee) : '無'}</td>
            <td class="tdv" colspan="2" style="font-size:8px;color:#888">*桃園以北適用，新竹以南/宜蘭/花蓮/台東另議</td></tr>
      </table>
      ${thumbnailUrl ? `<div style="flex-shrink:0;border:1px solid #e2d5a0;background:#fdfcf7;border-radius:4px;padding:6px;text-align:center"><img src="${esc(thumbnailUrl)}" alt="" style="width:140px;height:140px;object-fit:contain"><div style="font-size:7px;color:#999;margin-top:3px">效果圖僅供參考</div></div>` : ''}
    </div>
  </div>

  <div class="sec">
    <div class="stitle">門框尺寸 / 產品規格</div>
    <table class="prod-tbl">
      <tr><th>門洞寬</th><th>門洞高</th><th>框厚</th><th>扇厚</th><th>門開方向</th><th>數量</th><th>門樘</th><th>圖號</th><th>交貨方式</th><th>門扇單價</th></tr>
      <tr>
        <td>${vm.door.widthMM ? vm.door.widthMM + ' mm' : '—'}</td>
        <td>${vm.door.heightMM ? vm.door.heightMM + ' mm' : '—'}</td>
        <td>${esc(vm.door.frameThick || '—')}</td>
        <td>${esc(vm.door.panelThick || '—')}</td>
        <td>${esc(vm.door.direction || '—')}</td>
        <td>${vm.door.qty}</td>
        <td>${vm.door.frameCount}</td>
        <td>${esc(vm.door.drawingNo || '—')}</td>
        <td>${esc(vm.door.deliveryType)}</td>
        <td style="font-weight:700;color:#c9a227">${fmtP(vm.pricing.unitPrice)}</td>
      </tr>
    </table>

    <!-- 樣式三件套 -->
    ${(frontPanelImg || backPanelImg || colorImgUrl || vm.door.artFrame || vm.door.lockStyle) ? `
    <div class="style-row">
      <div class="style-cell">
        <div style="font-size:8px;font-weight:700;color:#c9a227;letter-spacing:1px;margin-bottom:2px">前板樣式</div>
        ${frontPanelImg ? `<img src="${esc(frontPanelImg)}" alt="">` : '<div style="width:54px;height:54px;display:inline-block"></div>'}
        <div>${esc(vm.door.frontPanel || '—')}</div>
      </div>
      <div class="style-cell">
        <div style="font-size:8px;font-weight:700;color:#c9a227;letter-spacing:1px;margin-bottom:2px">背板樣式</div>
        ${backPanelImg ? `<img src="${esc(backPanelImg)}" alt="">` : '<div style="width:54px;height:54px;display:inline-block"></div>'}
        <div>${esc(vm.door.backPanel || '—')}</div>
      </div>
      <div class="style-cell">
        <div style="font-size:8px;font-weight:700;color:#c9a227;letter-spacing:1px;margin-bottom:2px">門扇顏色 / 色卡</div>
        ${colorImgUrl ? `<img src="${esc(colorImgUrl)}" alt="">` : '<div style="width:54px;height:54px;display:inline-block"></div>'}
        <div>${esc(vm.door.color || '—')}${colorName ? ` ${esc(colorName)}` : ''}</div>
      </div>
      <div class="style-cell">
        <div style="font-size:8px;font-weight:700;color:#c9a227;letter-spacing:1px;margin-bottom:2px">藝術框</div>
        <div style="width:54px;height:54px;display:inline-block"></div>
        <div>${esc(vm.door.artFrame || '無')}</div>
      </div>
      <div class="style-cell">
        <div style="font-size:8px;font-weight:700;color:#c9a227;letter-spacing:1px;margin-bottom:2px">門鎖樣式</div>
        <div style="width:54px;height:54px;display:inline-block"></div>
        <div>${esc(vm.door.lockStyle || '—')}</div>
      </div>
    </div>` : ''}

    ${accessoryBlock}
    ${vm.notes.general ? `<div style="margin-top:4px;font-size:9px;color:#555;padding:4px 8px;background:#f9f6ec;border:1px solid #e2d5a0">備註：${esc(vm.notes.general)}</div>` : ''}
  </div>

  <div class="sec">
    <div class="stitle">追加報價 / 訂單金額</div>
    <table>
      <tr><td class="tdl">門扇費用 (${vm.door.qty}樘)</td><td class="tdv ra">${fmtP(vm.pricing.doorSubtotal)}</td></tr>
      ${vm.pricing.discountRate < 1 ? `<tr><td class="tdl">折扣 (${Math.round(vm.pricing.discountRate * 100)}%)</td><td class="tdv ra">${fmtP(vm.pricing.discounted)}</td></tr>` : ''}
      ${vm.pricing.installFee ? `<tr><td class="tdl">安裝費</td><td class="tdv ra">${fmtP(vm.pricing.installFee)}</td></tr>` : ''}
      ${vm.pricing.deliveryFee ? `<tr><td class="tdl">搬運費</td><td class="tdv ra">${fmtP(vm.pricing.deliveryFee)}</td></tr>` : ''}
      ${addonRows ? `<tr><td class="tdl" colspan="2" style="background:#1a1a1a;color:#c9a227;font-size:8px;font-weight:700;letter-spacing:2px;text-align:left">追加施工費明細</td></tr>${addonRows}<tr><td class="tdl" style="text-align:right">小計金額</td><td class="tdv ra" style="font-weight:700;color:#c9a227">${fmtP(vm.pricing.addonTotal)}</td></tr>` : ''}
    </table>
    <div class="total-box">
      <div><div class="total-lbl">含稅總價</div></div>
      <div class="total-amt">${fmtP(vm.pricing.totalPrice)}</div>
    </div>

    <!-- 付款方式分項 -->
    <table style="margin-top:4px">
      <tr><th class="tdl" style="text-align:center;width:90px">項目</th><th class="tdl" style="text-align:right;width:100px">金額</th><th class="tdl" colspan="2" style="text-align:center">付款方式</th></tr>
      ${payCheckboxRow('丈量費用', vm.pricing.measureFee, vm.payment.methods.measure, false)}
      ${payCheckboxRow('訂金 50%', vm.pricing.deposit, vm.payment.methods.deposit, false)}
      ${payCheckboxRow('尾款', vm.pricing.balance, vm.payment.methods.balance, true)}
    </table>
  </div>

  <div class="terms">
    ${termsHtml}
  </div>

  <div class="foot">
    <div>
      <div style="font-size:12px;font-weight:900;color:#1a1a1a;margin-bottom:3px">${vm.company.nameZh}</div>
      <div style="font-size:9px;color:#555">列印日期：${fmtDateLong(null)}</div>
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

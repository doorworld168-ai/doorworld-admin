import * as XLSX from 'xlsx';
import { sbFetch } from './supabase';

const COMPANY_NAME = '門的世界 DOORWORLD　展億室內開發有限公司';
const COMPANY_INFO = '統編 60667469　新北市五股區成泰路一段130-3號　TEL: 02-2292-0366　Email: doorworld168@gmail.com';

const DOOR_TYPE_LABEL = {
  single: '單開門', mother: '子母門', double: '雙開門',
  fire: '防火單門', room: '房間門', bathroom: '衛浴門', sliding: '橫拉門'
};
const STATUS_LABEL = { draft: '草稿', sent: '已送出', confirmed: '已確認', cancelled: '已取消' };

function fmtP(v) { return v ? 'NT$ ' + Number(v).toLocaleString() : '—'; }
function fmtDate(str) {
  const d = str ? new Date(str) : new Date();
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

async function fetchImageBuffer(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch { return null; }
}

function imgExtension(url) {
  const ext = (url || '').split('?')[0].split('.').pop().toLowerCase();
  if (ext === 'jpg') return 'jpeg';
  if (['png', 'jpeg', 'gif', 'bmp'].includes(ext)) return ext;
  return 'jpeg';
}

// ─── 估價單（SheetJS，純文字）────────────────────────────────────────────────
export function exportQuoteExcel(q) {
  const doorLabel = DOOR_TYPE_LABEL[q.door_type] || q.door_type || '—';
  const statusLabel = STATUS_LABEL[q.status] || q.status || '—';

  const aoa = [
    [COMPANY_NAME, '', '', ''],
    [COMPANY_INFO, '', '', ''],
    ['', '', '', ''],
    ['估價單', '', '', ''],
    ['', '', '', ''],
    ['估價單號', q.quote_no || '—', '日期', fmtDate(q.created_at)],
    ['狀態', statusLabel, '建單人', q.created_by || '—'],
    ['', '', '', ''],
    ['客戶姓名', q.customer_name || '—', '電話', q.customer_phone || '—'],
    ['地址', q.customer_addr || '—', '', ''],
    ['', '', '', ''],
    ['── 產品明細 ──', '', '', ''],
    ['產品代碼', '門型', '尺寸（cm）', '數量（堂）'],
    [q.product_code || '—', doorLabel, `${q.width_cm || '—'} × ${q.height_cm || '—'}`, q.quantity || 1],
    ['', '', '', ''],
    ['── 費用明細 ──', '', '', ''],
    ['門扇單價', '', '', fmtP(q.unit_price)],
    ['超規加價', '', '', fmtP(q.oversize_charge)],
    ['無電梯加價', '', '', fmtP(q.elevator_charge)],
    ['附加施工費', '', '', fmtP(q.addon_total)],
    ['', '', '', ''],
    ['含稅合計', '', '', fmtP(q.total_price)],
  ];

  if (q.breakdown) {
    aoa.push(['', '', '', '']);
    aoa.push(['── 費用說明 ──', '', '', '']);
    q.breakdown.split('\n').forEach(line => line.trim() && aoa.push(['', line.trim(), '', '']));
  }
  if (q.note) {
    aoa.push(['', '', '', '']);
    aoa.push(['備註', q.note, '', '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 18 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
    { s: { r: 9, c: 1 }, e: { r: 9, c: 3 } },
    { s: { r: 11, c: 0 }, e: { r: 11, c: 3 } },
    { s: { r: 15, c: 0 }, e: { r: 15, c: 3 } },
    { s: { r: 17, c: 0 }, e: { r: 17, c: 2 } },
    { s: { r: 18, c: 0 }, e: { r: 18, c: 2 } },
    { s: { r: 19, c: 0 }, e: { r: 19, c: 2 } },
    { s: { r: 20, c: 0 }, e: { r: 20, c: 2 } },
    { s: { r: 22, c: 0 }, e: { r: 22, c: 2 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '估價單');
  XLSX.writeFile(wb, `估價單_${q.quote_no || 'export'}.xlsx`);
}

// ─── 報價單（ExcelJS，含圖片 + 樣式）────────────────────────────────────────
export async function exportFormalQuoteExcel(c) {
  if (!c) return;

  // Dynamic import — ExcelJS 較大，只在需要時載入
  const ExcelJS = (await import('exceljs')).default;

  const fd = c.formal_quote_data || {};
  const doorLabel = DOOR_TYPE_LABEL[c.door_type] || c.door_type || '單開門';
  const fireLabel = fd.fire_type === 'f60a' ? 'f60A防火' : fd.fire_type === 'f60a_smoke' ? 'f60A遮煙門' : c.is_fireproof ? 'f60A防火' : '不防火';
  const qty = c.quantity || 1;
  const wCM = fd.width_mm ? Math.round(fd.width_mm / 10) : (c.actual_width_cm || '');
  const hCM = fd.height_mm ? Math.round(fd.height_mm / 10) : (c.actual_height_cm || '');

  const reqs = fd.special_requirements || [];
  const reqChecks = ['拆舊', '回收', '佔框', '濕式施工', '乾式包框'];
  const reqStr = reqChecks.map(r => (reqs.includes(r) ? '■' : '□') + r).join('  ');

  // Unit price
  let unitPrice = 0;
  if (c.official_note) {
    const idx = c.official_note.indexOf('門扇單價:');
    if (idx !== -1) {
      let j = idx + 5, ns = '';
      while (j < c.official_note.length && c.official_note.charCodeAt(j) >= 48 && c.official_note.charCodeAt(j) <= 57) { ns += c.official_note[j]; j++; }
      if (ns) unitPrice = parseInt(ns, 10);
    }
  }
  if (!unitPrice && c.official_price && qty > 0) unitPrice = Math.round(c.official_price / qty);

  const discountRate = c.discount_rate || 1;
  const doorSubtotal = unitPrice * qty;
  const discounted = c.official_price || Math.round(doorSubtotal * discountRate);
  const installFee = c.install_fee || 0;

  let addonTotal = 0;
  const addonParsed = [];
  if (c.addon_items) {
    c.addon_items.split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      let i = line.length - 1;
      while (i >= 0 && (line[i] === ' ' || (line.charCodeAt(i) >= 48 && line.charCodeAt(i) <= 57) || line[i] === ',')) i--;
      const numStart = i + 1;
      if (numStart < line.length) {
        const amt = parseInt(line.substring(numStart).trim().replace(/,/g, ''), 10);
        if (!isNaN(amt)) { addonTotal += amt; addonParsed.push([line.substring(0, numStart).trim(), amt]); return; }
      }
      addonParsed.push([line, null]);
    });
  }

  const totalPrice = c.total_with_tax || (discounted + addonTotal + installFee);
  const deposit = c.deposit_50 || Math.round(totalPrice * 0.5);
  const balance = c.balance || (totalPrice - deposit);

  // Accessories text
  const acc = fd.accessories || [];
  const accStr = acc.length ? acc.map(a => `${a.label}：${a.useUpgrade ? a.upgrade : a.standard}${a.useUpgrade ? '（選配）' : ''}`).join('\n') : '—';

  // Fetch product image
  let thumbBuf = null, thumbExt = 'jpeg';
  try {
    const imgs = await sbFetch(`products?full_code=eq.${encodeURIComponent(c.product_code)}&select=thumbnail_url,image_url`);
    const imgUrl = imgs?.[0]?.thumbnail_url || imgs?.[0]?.image_url || '';
    if (imgUrl) { thumbBuf = await fetchImageBuffer(imgUrl); thumbExt = imgExtension(imgUrl); }
  } catch {}

  // ── Build workbook ──────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = '門的世界 DOORWORLD';
  const ws = wb.addWorksheet('報價單');

  // Column widths: A=標籤 B=值 C=標籤 D=值 E-F=圖片區
  ws.columns = [
    { key: 'A', width: 16 },
    { key: 'B', width: 22 },
    { key: 'C', width: 14 },
    { key: 'D', width: 20 },
    { key: 'E', width: 18 },
    { key: 'F', width: 18 },
  ];

  const GOLD   = 'FFC9A227';
  const DARK   = 'FF1A1A1A';
  const CREAM  = 'FFFFF9F0';
  const LBLUE  = 'FFF5ECC8';
  const WHITE  = 'FFFFFFFF';
  const BORDER = { style: 'thin', color: { argb: 'FFD4AF37' } };
  const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

  function s(cell, { fill, font, align, border } = {}) {
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    if (font) cell.font = { name: '微軟正黑體', ...font };
    if (align) cell.alignment = align;
    if (border) cell.border = border;
  }

  function labelCell(addr, text, opts = {}) {
    const cell = ws.getCell(addr);
    cell.value = text;
    s(cell, { fill: LBLUE, font: { bold: true, size: 10, color: { argb: 'FF5A4800' } }, align: { vertical: 'middle' }, border: ALL_BORDERS, ...opts });
    return cell;
  }
  function valueCell(addr, text, opts = {}) {
    const cell = ws.getCell(addr);
    cell.value = text ?? '—';
    s(cell, { fill: WHITE, font: { size: 11 }, align: { vertical: 'middle', wrapText: true }, border: ALL_BORDERS, ...opts });
    return cell;
  }

  // Row 1: Company header
  ws.mergeCells('A1:F1');
  s(ws.getCell('A1'), { fill: DARK, font: { bold: true, size: 14, color: { argb: GOLD } }, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getCell('A1').value = COMPANY_NAME;
  ws.getRow(1).height = 30;

  // Row 2: Company info
  ws.mergeCells('A2:F2');
  s(ws.getCell('A2'), { fill: DARK, font: { size: 9, color: { argb: 'FF888888' } }, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getCell('A2').value = COMPANY_INFO;
  ws.getRow(2).height = 16;

  // Row 3: Title
  ws.mergeCells('A3:F3');
  s(ws.getCell('A3'), { fill: CREAM, font: { bold: true, size: 20, color: { argb: DARK } }, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getCell('A3').value = '報  價  單';
  ws.getRow(3).height = 40;

  // Row 4-5: Quote meta
  let r = 4;
  labelCell(`A${r}`, '報價單號'); valueCell(`B${r}`, c.formal_quote_no || c.order_no || c.case_no || '—', { font: { bold: true, size: 12 } });
  labelCell(`C${r}`, '日期');    valueCell(`D${r}`, fmtDate(c.official_quote_at || c.created_at));
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 22; r++;

  labelCell(`A${r}`, '業務');    valueCell(`B${r}`, c.sales_person || '—');
  labelCell(`C${r}`, '建單人');  valueCell(`D${r}`, c.created_by || '—');
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  // Spacer row (image will float here, rows 6-13 = image zone)
  const imgTopRow = r; // row 6

  // Row 6-8: Customer info (left cols A-D, right cols E-F = image)
  labelCell(`A${r}`, '聯絡人');  valueCell(`B${r}`, c.customer_name || c.contact_person || '—');
  labelCell(`C${r}`, '統編');    valueCell(`D${r}`, c.tax_id || '—');
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '電話');    valueCell(`B${r}`, c.customer_phone || '—');
  labelCell(`C${r}`, '樓層/電梯'); valueCell(`D${r}`, fd.has_elevator === false ? '無電梯' : '有電梯');
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  ws.mergeCells(`A${r}:A${r}`);
  labelCell(`A${r}`, '案場地址');
  ws.mergeCells(`B${r}:D${r}`);
  valueCell(`B${r}`, c.case_address || c.customer_addr || '—', { align: { vertical: 'middle', wrapText: true } });
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  // Row 9: Section header
  ws.mergeCells(`A${r}:D${r}`);
  s(ws.getCell(`A${r}`), { fill: DARK, font: { bold: true, size: 10, color: { argb: GOLD } }, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getCell(`A${r}`).value = '▌ 產品規格';
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '款式名稱'); valueCell(`B${r}`, c.product_code || '—', { font: { bold: true, size: 11 } });
  labelCell(`C${r}`, '門的需求'); valueCell(`D${r}`, doorLabel);
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '防火需求'); valueCell(`B${r}`, fireLabel);
  labelCell(`C${r}`, '交貨時間'); valueCell(`D${r}`, `${c.delivery_days || 90} 日曆天`);
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '門洞寬(W)'); valueCell(`B${r}`, wCM ? `${wCM} cm` : '—');
  labelCell(`C${r}`, '門洞高(H)'); valueCell(`D${r}`, hCM ? `${hCM} cm` : '—');
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '框厚'); valueCell(`B${r}`, fd.frame_thickness || '—');
  labelCell(`C${r}`, '扇厚'); valueCell(`D${r}`, fd.panel_thickness || '—');
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '門開方向'); valueCell(`B${r}`, fd.door_direction || '—');
  labelCell(`C${r}`, '數量');     valueCell(`D${r}`, qty);
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '門扇顏色'); valueCell(`B${r}`, fd.door_color || '—');
  labelCell(`C${r}`, '門鎖樣式'); valueCell(`D${r}`, fd.lock_style || '—');
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '藝術框');   valueCell(`B${r}`, fd.art_frame || '無');
  labelCell(`C${r}`, '交貨方式'); valueCell(`D${r}`, fd.delivery_type || '框扇同時');
  ws.mergeCells(`E${r}:F${r}`); s(ws.getCell(`E${r}`), { fill: CREAM });
  ws.getRow(r).height = 20; r++;

  const imgBotRow = r - 1; // image ends here

  ws.mergeCells(`A${r}:A${r}`);
  labelCell(`A${r}`, '特殊需求');
  ws.mergeCells(`B${r}:F${r}`);
  valueCell(`B${r}`, reqStr || '無');
  ws.getRow(r).height = 20; r++;

  ws.mergeCells(`A${r}:A${r}`);
  labelCell(`A${r}`, '派送安裝');
  ws.mergeCells(`B${r}:F${r}`);
  valueCell(`B${r}`, fd.install_method || '甲方派送安裝');
  ws.getRow(r).height = 20; r++;

  // Accessories
  if (acc.length > 0) {
    ws.mergeCells(`A${r}:F${r}`);
    s(ws.getCell(`A${r}`), { fill: DARK, font: { bold: true, size: 10, color: { argb: GOLD } }, align: { horizontal: 'center', vertical: 'middle' } });
    ws.getCell(`A${r}`).value = '▌ 五金配件';
    ws.getRow(r).height = 20; r++;

    ws.mergeCells(`A${r}:A${r}`);
    labelCell(`A${r}`, '配件清單');
    ws.mergeCells(`B${r}:F${r}`);
    valueCell(`B${r}`, accStr, { align: { vertical: 'top', wrapText: true } });
    ws.getRow(r).height = Math.max(20, acc.length * 18); r++;
  }

  // Pricing section
  ws.mergeCells(`A${r}:F${r}`);
  s(ws.getCell(`A${r}`), { fill: DARK, font: { bold: true, size: 10, color: { argb: GOLD } }, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getCell(`A${r}`).value = '▌ 費用明細';
  ws.getRow(r).height = 20; r++;

  function priceRow(label, val, highlight = false) {
    ws.mergeCells(`A${r}:C${r}`);
    labelCell(`A${r}`, label);
    ws.mergeCells(`D${r}:F${r}`);
    const vc = valueCell(`D${r}`, val, { align: { horizontal: 'right', vertical: 'middle' }, font: { bold: highlight, size: highlight ? 14 : 11, color: { argb: highlight ? GOLD : DARK } } });
    if (highlight) s(vc, { fill: DARK });
    ws.getRow(r).height = highlight ? 28 : 20; r++;
  }

  priceRow(`門扇費用（${qty} 樘）`, fmtP(doorSubtotal));
  if (discountRate < 1) priceRow(`折扣（${Math.round(discountRate * 100)}%）`, fmtP(discounted));
  if (installFee) priceRow('安裝費', fmtP(installFee));
  if (addonParsed.length) {
    ws.mergeCells(`A${r}:F${r}`);
    s(ws.getCell(`A${r}`), { fill: LBLUE, font: { bold: true, size: 9, color: { argb: 'FF5A4800' } }, align: { horizontal: 'center' } });
    ws.getCell(`A${r}`).value = '附加施工費明細';
    ws.getRow(r).height = 16; r++;
    addonParsed.forEach(([lbl, amt]) => priceRow(lbl, amt != null ? fmtP(amt) : ''));
  }
  priceRow('含稅總價', fmtP(totalPrice), true);

  // Payment split
  const payLabels = ['訂金 50%', '尾款', '含稅總價'];
  const payVals   = [fmtP(deposit), fmtP(balance), fmtP(totalPrice)];
  const colPairs  = [['A', 'B'], ['C', 'D'], ['E', 'F']];
  colPairs.forEach(([lc, vc], i) => {
    ws.mergeCells(`${lc}${r}:${vc}${r}`);
    s(ws.getCell(`${lc}${r}`), { fill: LBLUE, font: { bold: true, size: 10, color: { argb: 'FF5A4800' } }, align: { horizontal: 'center', vertical: 'middle' }, border: ALL_BORDERS });
    ws.getCell(`${lc}${r}`).value = payLabels[i];
  });
  ws.getRow(r).height = 20; r++;
  colPairs.forEach(([lc, vc], i) => {
    ws.mergeCells(`${lc}${r}:${vc}${r}`);
    s(ws.getCell(`${lc}${r}`), { fill: i === 2 ? DARK : WHITE, font: { bold: true, size: 13, color: { argb: i === 2 ? GOLD : DARK } }, align: { horizontal: 'center', vertical: 'middle' }, border: ALL_BORDERS });
    ws.getCell(`${lc}${r}`).value = payVals[i];
  });
  ws.getRow(r).height = 28; r++;

  if (c.note) {
    ws.mergeCells(`A${r}:A${r}`);
    labelCell(`A${r}`, '備註');
    ws.mergeCells(`B${r}:F${r}`);
    valueCell(`B${r}`, c.note, { align: { vertical: 'top', wrapText: true } });
    ws.getRow(r).height = 32;
  }

  // ── Embed product image (right columns E-F, rows imgTopRow to imgBotRow) ──
  if (thumbBuf) {
    const imgId = wb.addImage({ buffer: thumbBuf, extension: thumbExt });
    ws.addImage(imgId, {
      tl: { col: 4, row: imgTopRow - 1 },      // col E (0-indexed=4), row imgTopRow (0-indexed)
      br: { col: 6, row: imgBotRow },            // col G (exclusive), row imgBotRow+1
      editAs: 'oneCell',
    });
    // Label above image
    ws.mergeCells(`E4:F4`);
    s(ws.getCell('E4'), { fill: DARK, font: { size: 8, color: { argb: 'FF888888' } }, align: { horizontal: 'center', vertical: 'middle' } });
    ws.getCell('E4').value = '效果圖（僅供參考）';
  } else {
    // No image: fill the zone with cream
    for (let row = imgTopRow; row <= imgBotRow; row++) {
      ws.mergeCells(`E${row}:F${row}`);
      s(ws.getCell(`E${row}`), { fill: CREAM });
    }
  }

  // ── Download ────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `報價單_${c.formal_quote_no || c.order_no || 'export'}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

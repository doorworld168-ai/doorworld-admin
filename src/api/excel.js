import * as XLSX from 'xlsx';
import { sbFetch } from './supabase';
import {
  buildFormalQuoteVM, fmtP, fmtDate, QUOTE_TERMS,
  CUSTOMER_TYPE_LABEL, safeFetchImageBuffer, imgExtension, isSupabaseStorageUrl
} from './formalQuoteData';

const COMPANY_NAME = '門的世界 DOORWORLD　展億室內開發有限公司';
const COMPANY_INFO = '統編 60667469　新北市五股區成泰路一段130-3號　TEL: 02-2292-0366　Email: doorworld168@gmail.com';

const DOOR_TYPE_LABEL = {
  single: '單開門', mother: '子母門', double: '雙開門',
  fire: '防火單門', room: '房間門', bathroom: '衛浴門', sliding: '橫拉門'
};
const STATUS_LABEL = { draft: '草稿', sent: '已送出', confirmed: '已確認', cancelled: '已取消' };

// ─── 估價單（SheetJS，純文字）— 維持原樣 ──────────────────────────────────
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
  if (q.note) { aoa.push(['', '', '', '']); aoa.push(['備註', q.note, '', '']); }

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

// ─── 報價單（ExcelJS，6 欄版面 + 4 類圖片 + 完整公司範本）────────────────
export async function exportFormalQuoteExcel(c) {
  if (!c) return;
  const ExcelJS = (await import('exceljs')).default;
  const vm = buildFormalQuoteVM(c);

  // ── 並行抓所有圖片（CORS 安全）──
  const [productImgBuf, colorImgBuf, frontPanelBuf, backPanelBuf, accImgMap] = await Promise.all([
    fetchProductImage(vm.door.productCode),
    fetchColorImage(vm.door.color),
    fetchPanelImage(vm.door.frontPanel),
    fetchPanelImage(vm.door.backPanel),
    fetchAccessoryImageMap(vm.accessories),
  ]);

  const checkMark = (val, target) => val === target ? '■' : '☐';

  // ── Build workbook ──
  const wb = new ExcelJS.Workbook();
  wb.creator = '門的世界 DOORWORLD';
  const ws = wb.addWorksheet('報價單');

  // 6 欄：A=標籤 B=值 C=標籤 D=值 E-F=圖片區
  ws.columns = [
    { width: 14 }, { width: 22 },
    { width: 14 }, { width: 22 },
    { width: 14 }, { width: 14 },
  ];

  const GOLD   = 'FFC9A227';
  const DARK   = 'FF1A1A1A';
  const CREAM  = 'FFFFF9F0';
  const LBLUE  = 'FFF5ECC8';
  const WHITE  = 'FFFFFFFF';
  const GRAY   = 'FFF5F5F5';
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
    s(cell, { fill: LBLUE, font: { bold: true, size: 10, color: { argb: 'FF5A4800' } }, align: { vertical: 'middle', horizontal: 'center' }, border: ALL_BORDERS, ...opts });
    return cell;
  }
  function valueCell(addr, text, opts = {}) {
    const cell = ws.getCell(addr);
    cell.value = text ?? '—';
    s(cell, { fill: WHITE, font: { size: 11 }, align: { vertical: 'middle', wrapText: true }, border: ALL_BORDERS, ...opts });
    return cell;
  }
  function sectionHeader(addr, text) {
    s(ws.getCell(addr), { fill: DARK, font: { bold: true, size: 11, color: { argb: GOLD } }, align: { horizontal: 'center', vertical: 'middle' } });
    ws.getCell(addr).value = text;
  }
  function imageRowFiller(row) {
    // 把 E,F 也填淡色背景（避免空白）
    ws.mergeCells(`E${row}:F${row}`);
    s(ws.getCell(`E${row}`), { fill: CREAM });
  }

  let r = 1;

  // ── 1. 公司頁首 ──
  ws.mergeCells(`A${r}:F${r}`);
  s(ws.getCell(`A${r}`), { fill: DARK, font: { bold: true, size: 14, color: { argb: GOLD } }, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getCell(`A${r}`).value = COMPANY_NAME;
  ws.getRow(r).height = 30; r++;

  ws.mergeCells(`A${r}:F${r}`);
  s(ws.getCell(`A${r}`), { fill: DARK, font: { size: 9, color: { argb: 'FFAAAAAA' } }, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getCell(`A${r}`).value = COMPANY_INFO;
  ws.getRow(r).height = 16; r++;

  // ── 2. 報價單標題 ──
  ws.mergeCells(`A${r}:F${r}`);
  s(ws.getCell(`A${r}`), { fill: CREAM, font: { bold: true, size: 22, color: { argb: DARK } }, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getCell(`A${r}`).value = '報  價  單  QUOTE';
  ws.getRow(r).height = 44; r++;

  ws.mergeCells(`A${r}:F${r}`);
  s(ws.getCell(`A${r}`), { fill: GRAY, font: { size: 9, color: { argb: 'FF666666' } }, align: { horizontal: 'right', vertical: 'middle' } });
  ws.getCell(`A${r}`).value = '版本/更新日期：001/20251212    ';
  ws.getRow(r).height = 14; r++;

  // ── 3. 訂單資訊 + 產品圖（並排） ──
  ws.mergeCells(`A${r}:D${r}`);
  sectionHeader(`A${r}`, '▌ 訂單資訊');
  // 產品圖 label 在 E:F
  ws.mergeCells(`E${r}:F${r}`);
  s(ws.getCell(`E${r}`), { fill: DARK, font: { size: 9, color: { argb: GOLD } }, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getCell(`E${r}`).value = '效果圖（僅供參考）';
  ws.getRow(r).height = 22;
  const imgTopRow = r;
  r++;

  labelCell(`A${r}`, '訂單編號'); valueCell(`B${r}`, vm.no.full || '—', { font: { bold: true, size: 12 } });
  labelCell(`C${r}`, '建單日期'); valueCell(`D${r}`, fmtDate(vm.dates.quote));
  imageRowFiller(r); ws.getRow(r).height = 22; r++;

  labelCell(`A${r}`, '地區/類別'); valueCell(`B${r}`, `${vm.no.region || '—'} / ${vm.no.category || '—'}`);
  labelCell(`C${r}`, '年度/月份/流水'); valueCell(`D${r}`, `${vm.no.year || '—'} / ${vm.no.month || '—'} / ${vm.no.serial || '—'}`);
  imageRowFiller(r); ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '建單者/CODE'); valueCell(`B${r}`, vm.sales.createdBy || '—');
  labelCell(`C${r}`, '承辦業務'); valueCell(`D${r}`, vm.sales.person || '—');
  imageRowFiller(r); ws.getRow(r).height = 20; r++;

  // ── 4. 客戶資料 ──
  ws.mergeCells(`A${r}:D${r}`);
  sectionHeader(`A${r}`, '▌ 甲方（賣方） / 乙方（買方）');
  imageRowFiller(r); ws.getRow(r).height = 22; r++;

  labelCell(`A${r}`, '甲方'); valueCell(`B${r}`, '門的世界 DOORWORLD');
  labelCell(`C${r}`, '甲方電話'); valueCell(`D${r}`, '02-2292-0366');
  imageRowFiller(r); ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '聯絡人'); valueCell(`B${r}`, vm.customer.name || '—', { font: { bold: true, size: 11 } });
  labelCell(`C${r}`, '統編'); valueCell(`D${r}`, vm.customer.taxId || '—');
  imageRowFiller(r); ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '電話'); valueCell(`B${r}`, vm.customer.phone || '—');
  labelCell(`C${r}`, '客戶型態'); valueCell(`D${r}`, CUSTOMER_TYPE_LABEL[vm.customer.type] || vm.customer.type || '—');
  imageRowFiller(r); ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '樓層/電梯'); valueCell(`B${r}`, `${vm.customer.floor || '—'} F  ${vm.customer.hasElevator ? '■有電梯  ☐無電梯' : '☐有電梯  ■無電梯'}`);
  labelCell(`C${r}`, '搬運費用'); valueCell(`D${r}`, vm.pricing.deliveryFee ? fmtP(vm.pricing.deliveryFee) : '無');
  imageRowFiller(r); ws.getRow(r).height = 20; r++;

  const imgBotRow = r - 1;

  labelCell(`A${r}`, '案場地址');
  ws.mergeCells(`B${r}:F${r}`);
  valueCell(`B${r}`, vm.customer.address || '—');
  ws.getRow(r).height = 22; r++;

  // 嵌入產品圖（如果有）
  if (productImgBuf) {
    const imgId = wb.addImage({ buffer: productImgBuf.buf, extension: productImgBuf.ext });
    ws.addImage(imgId, {
      tl: { col: 4, row: imgTopRow - 1 },     // E (0-indexed=4), 第 imgTopRow 行
      br: { col: 6, row: imgBotRow },          // 結束位置
      editAs: 'oneCell',
    });
  }

  // ── 5. 門體規格 ──
  ws.mergeCells(`A${r}:F${r}`);
  sectionHeader(`A${r}`, '▌ 門體規格');
  ws.getRow(r).height = 22; r++;

  labelCell(`A${r}`, '產品編號'); valueCell(`B${r}`, vm.door.productCode || '—', { font: { bold: true, size: 11 } });
  labelCell(`C${r}`, '材質/工藝'); valueCell(`D${r}`, vm.door.material || '—');
  ws.mergeCells(`E${r}:F${r}`); valueCell(`E${r}`, '');
  ws.getRow(r).height = 20; r++;

  // 前板樣式（含圖）
  const frontPanelRow = r;
  labelCell(`A${r}`, '前板樣式');
  ws.mergeCells(`B${r}:D${r}`); valueCell(`B${r}`, vm.door.frontPanel || '—', { font: { bold: true, size: 11 } });
  ws.mergeCells(`E${r}:F${r}`);
  s(ws.getCell(`E${r}`), { fill: WHITE, border: ALL_BORDERS, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getRow(r).height = 56; r++;
  if (frontPanelBuf) {
    const imgId = wb.addImage({ buffer: frontPanelBuf.buf, extension: frontPanelBuf.ext });
    ws.addImage(imgId, { tl: { col: 4, row: frontPanelRow - 1 }, br: { col: 6, row: frontPanelRow }, editAs: 'oneCell' });
  }

  // 背板樣式（含圖）
  const backPanelRow = r;
  labelCell(`A${r}`, '背板樣式');
  ws.mergeCells(`B${r}:D${r}`); valueCell(`B${r}`, vm.door.backPanel || '—', { font: { bold: true, size: 11 } });
  ws.mergeCells(`E${r}:F${r}`);
  s(ws.getCell(`E${r}`), { fill: WHITE, border: ALL_BORDERS, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getRow(r).height = 56; r++;
  if (backPanelBuf) {
    const imgId = wb.addImage({ buffer: backPanelBuf.buf, extension: backPanelBuf.ext });
    ws.addImage(imgId, { tl: { col: 4, row: backPanelRow - 1 }, br: { col: 6, row: backPanelRow }, editAs: 'oneCell' });
  }

  labelCell(`A${r}`, '門的需求'); valueCell(`B${r}`, vm.door.typeLabel);
  labelCell(`C${r}`, '其他需求'); valueCell(`D${r}`, vm.door.fireLabel);
  ws.mergeCells(`E${r}:F${r}`); valueCell(`E${r}`, '');
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '運送安裝方式'); valueCell(`B${r}`, vm.door.installMethod);
  labelCell(`C${r}`, '交貨時間'); valueCell(`D${r}`, `${vm.door.deliveryDays} 日曆天`);
  ws.mergeCells(`E${r}:F${r}`); valueCell(`E${r}`, '');
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '特殊需求');
  ws.mergeCells(`B${r}:F${r}`);
  valueCell(`B${r}`, vm.requirements.displayString);
  ws.getRow(r).height = 22; r++;

  // ── 6. 門框尺寸 ──
  ws.mergeCells(`A${r}:F${r}`);
  sectionHeader(`A${r}`, '▌ 門框尺寸 (mm) — 請務必再次確認');
  ws.getRow(r).height = 22; r++;

  labelCell(`A${r}`, '圖號'); valueCell(`B${r}`, vm.door.drawingNo || '—');
  labelCell(`C${r}`, '門樘數量'); valueCell(`D${r}`, vm.door.frameCount);
  ws.mergeCells(`E${r}:F${r}`); valueCell(`E${r}`, '');
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '門洞寬(W)'); valueCell(`B${r}`, vm.door.widthMM ? `${vm.door.widthMM} mm (${vm.door.widthCM} cm)` : '—');
  labelCell(`C${r}`, '門洞高(H)'); valueCell(`D${r}`, vm.door.heightMM ? `${vm.door.heightMM} mm (${vm.door.heightCM} cm)` : '—');
  ws.mergeCells(`E${r}:F${r}`); valueCell(`E${r}`, '');
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '門開方向'); valueCell(`B${r}`, `${vm.door.direction || '—'} （人在外向內看）`);
  labelCell(`C${r}`, '交貨方式'); valueCell(`D${r}`, vm.door.deliveryType);
  ws.mergeCells(`E${r}:F${r}`); valueCell(`E${r}`, '');
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '框厚 (可空白)'); valueCell(`B${r}`, vm.door.frameThick || '—');
  labelCell(`C${r}`, '扇厚 (可空白)'); valueCell(`D${r}`, vm.door.panelThick || '—');
  ws.mergeCells(`E${r}:F${r}`); valueCell(`E${r}`, '');
  ws.getRow(r).height = 20; r++;

  labelCell(`A${r}`, '藝術框'); valueCell(`B${r}`, vm.door.artFrame || '無');
  labelCell(`C${r}`, '門扇單價'); valueCell(`D${r}`, fmtP(vm.pricing.unitPrice), { font: { bold: true, size: 11, color: { argb: GOLD } } });
  ws.mergeCells(`E${r}:F${r}`); valueCell(`E${r}`, '');
  ws.getRow(r).height = 20; r++;

  // 門扇顏色（含色卡圖）
  const colorRow = r;
  labelCell(`A${r}`, '門扇顏色 / 色卡');
  ws.mergeCells(`B${r}:D${r}`); valueCell(`B${r}`, vm.door.color || '—', { font: { bold: true, size: 11 } });
  ws.mergeCells(`E${r}:F${r}`);
  s(ws.getCell(`E${r}`), { fill: WHITE, border: ALL_BORDERS, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getRow(r).height = 56; r++;
  if (colorImgBuf) {
    const imgId = wb.addImage({ buffer: colorImgBuf.buf, extension: colorImgBuf.ext });
    ws.addImage(imgId, { tl: { col: 4, row: colorRow - 1 }, br: { col: 6, row: colorRow }, editAs: 'oneCell' });
  }

  labelCell(`A${r}`, '門鎖樣式');
  ws.mergeCells(`B${r}:F${r}`); valueCell(`B${r}`, vm.door.lockStyle || '—');
  ws.getRow(r).height = 20; r++;

  // ── 7. 五金配件（含圖片）──
  if (vm.accessories.length > 0) {
    ws.mergeCells(`A${r}:F${r}`);
    sectionHeader(`A${r}`, '▌ 五金配件');
    ws.getRow(r).height = 22; r++;

    // 表頭
    labelCell(`A${r}`, '類別');
    ws.mergeCells(`B${r}:C${r}`); labelCell(`B${r}`, '名稱');
    labelCell(`D${r}`, '類型');
    ws.mergeCells(`E${r}:F${r}`); labelCell(`E${r}`, '圖片');
    ws.getRow(r).height = 20; r++;

    // 每個配件一行
    for (const a of vm.accessories) {
      const accRow = r;
      const chosen = a.useUpgrade ? a.upgrade : a.standard;
      labelCell(`A${r}`, a.label, { fill: WHITE, font: { bold: true, size: 11, color: { argb: 'FF5A4800' } } });
      ws.mergeCells(`B${r}:C${r}`); valueCell(`B${r}`, chosen || '—');
      valueCell(`D${r}`, a.useUpgrade ? '加購選配' : '標配', { font: { size: 10, color: { argb: a.useUpgrade ? GOLD : 'FF888888' } } });
      ws.mergeCells(`E${r}:F${r}`);
      s(ws.getCell(`E${r}`), { fill: WHITE, border: ALL_BORDERS, align: { horizontal: 'center', vertical: 'middle' } });
      ws.getRow(r).height = 56; r++;
      // 嵌入配件圖
      const accImgBuf = accImgMap[chosen] || accImgMap[a.standard];
      if (accImgBuf) {
        const imgId = wb.addImage({ buffer: accImgBuf.buf, extension: accImgBuf.ext });
        ws.addImage(imgId, { tl: { col: 4, row: accRow - 1 }, br: { col: 6, row: accRow }, editAs: 'oneCell' });
      }
    }
  }

  // ── 8. 追加報價（3 行 + 小計）──
  ws.mergeCells(`A${r}:F${r}`);
  sectionHeader(`A${r}`, '▌ 追加報價');
  ws.getRow(r).height = 22; r++;

  for (let i = 0; i < 3; i++) {
    const item = vm.pricing.addonItems[i] || { label: null, amount: null };
    labelCell(`A${r}`, `項目 ${i + 1}`);
    ws.mergeCells(`B${r}:D${r}`); valueCell(`B${r}`, item.label || '—');
    ws.mergeCells(`E${r}:F${r}`); valueCell(`E${r}`, item.amount != null ? fmtP(item.amount) : '—', { align: { horizontal: 'right', vertical: 'middle' } });
    ws.getRow(r).height = 20; r++;
  }
  if (vm.pricing.addonItems.length > 3) {
    const extraStr = vm.pricing.addonItems.slice(3).map(i => `${i.label}：${i.amount != null ? fmtP(i.amount) : '—'}`).join('\n');
    labelCell(`A${r}`, '其他項目');
    ws.mergeCells(`B${r}:F${r}`); valueCell(`B${r}`, extraStr, { align: { vertical: 'top', wrapText: true } });
    ws.getRow(r).height = Math.max(20, (vm.pricing.addonItems.length - 3) * 18); r++;
  }

  // 小計
  labelCell(`A${r}`, '小計金額');
  ws.mergeCells(`B${r}:D${r}`); valueCell(`B${r}`, '');
  ws.mergeCells(`E${r}:F${r}`); valueCell(`E${r}`, fmtP(vm.pricing.addonTotal), { font: { bold: true, size: 12, color: { argb: GOLD } }, align: { horizontal: 'right', vertical: 'middle' } });
  ws.getRow(r).height = 22; r++;

  // ── 9. 備註 ──
  if (vm.notes.general) {
    labelCell(`A${r}`, '備註事項');
    ws.mergeCells(`B${r}:F${r}`);
    valueCell(`B${r}`, vm.notes.general, { align: { vertical: 'top', wrapText: true } });
    ws.getRow(r).height = 40; r++;
  }

  // ── 10. 訂單金額 / 付款方式 ──
  ws.mergeCells(`A${r}:F${r}`);
  sectionHeader(`A${r}`, '▌ 訂單金額 / 付款方式');
  ws.getRow(r).height = 22; r++;

  labelCell(`A${r}`, '項目');
  ws.mergeCells(`B${r}:C${r}`); labelCell(`B${r}`, '金額', { align: { horizontal: 'right', vertical: 'middle' } });
  ws.mergeCells(`D${r}:F${r}`); labelCell(`D${r}`, '付款方式');
  ws.getRow(r).height = 20; r++;

  // 丈量費
  labelCell(`A${r}`, '丈量費用', { fill: WHITE, font: { bold: false, size: 11, color: { argb: DARK } } });
  ws.mergeCells(`B${r}:C${r}`); valueCell(`B${r}`, fmtP(vm.pricing.measureFee), { align: { horizontal: 'right', vertical: 'middle' } });
  ws.mergeCells(`D${r}:F${r}`); valueCell(`D${r}`, `${checkMark(vm.payment.methods.measure, 'cash')}現金   ${checkMark(vm.payment.methods.measure, 'transfer')}匯款   ${checkMark(vm.payment.methods.measure, 'card')}信用卡(綠界)`);
  ws.getRow(r).height = 22; r++;

  // 訂金
  labelCell(`A${r}`, '訂金 50%', { fill: WHITE, font: { bold: false, size: 11, color: { argb: DARK } } });
  ws.mergeCells(`B${r}:C${r}`); valueCell(`B${r}`, fmtP(vm.pricing.deposit), { align: { horizontal: 'right', vertical: 'middle' } });
  ws.mergeCells(`D${r}:F${r}`); valueCell(`D${r}`, `${checkMark(vm.payment.methods.deposit, 'cash')}現金   ${checkMark(vm.payment.methods.deposit, 'transfer')}匯款   ${checkMark(vm.payment.methods.deposit, 'card')}信用卡(綠界)`);
  ws.getRow(r).height = 22; r++;

  // 尾款
  labelCell(`A${r}`, '尾款', { fill: WHITE, font: { bold: false, size: 11, color: { argb: DARK } } });
  ws.mergeCells(`B${r}:C${r}`); valueCell(`B${r}`, fmtP(vm.pricing.balance), { align: { horizontal: 'right', vertical: 'middle' } });
  ws.mergeCells(`D${r}:F${r}`); valueCell(`D${r}`, `${checkMark(vm.payment.methods.balance, 'cash')}現金   ${checkMark(vm.payment.methods.balance, 'transfer')}匯款   ${checkMark(vm.payment.methods.balance, 'card')}信用卡(綠界)   ${checkMark(vm.payment.methods.balance, 'measure_paid')}丈量費已付`);
  ws.getRow(r).height = 22; r++;

  // 含稅總價
  s(ws.getCell(`A${r}`), { fill: DARK, font: { bold: true, size: 13, color: { argb: GOLD } }, align: { horizontal: 'center', vertical: 'middle' }, border: ALL_BORDERS });
  ws.getCell(`A${r}`).value = '含稅總價';
  ws.mergeCells(`B${r}:F${r}`);
  s(ws.getCell(`B${r}`), { fill: DARK, font: { bold: true, size: 16, color: { argb: GOLD } }, align: { horizontal: 'right', vertical: 'middle' }, border: ALL_BORDERS });
  ws.getCell(`B${r}`).value = fmtP(vm.pricing.totalPrice);
  ws.getRow(r).height = 32; r++;

  // ── 11. 客戶確認回傳 ──
  r++;
  ws.mergeCells(`A${r}:F${r}`);
  s(ws.getCell(`A${r}`), { fill: GRAY, font: { bold: true, size: 11, color: { argb: DARK } }, align: { horizontal: 'left', vertical: 'middle' } });
  ws.getCell(`A${r}`).value = '客戶確認回傳（發票章 / 簽章 / 全名 / 日期）';
  ws.getRow(r).height = 22; r++;

  ws.mergeCells(`A${r}:F${r}`);
  s(ws.getCell(`A${r}`), { fill: WHITE, font: { size: 10, color: { argb: 'FF555555' } }, align: { horizontal: 'left', vertical: 'middle', wrapText: true }, border: ALL_BORDERS });
  ws.getCell(`A${r}`).value = '本人已詳細核對上述訂購單注意事項，確保其正確性。\n\n簽章：____________________     日期：____________________';
  ws.getRow(r).height = 60; r++;

  // ── 12. 報價單注意事項 16 條 ──
  r++;
  ws.mergeCells(`A${r}:F${r}`);
  sectionHeader(`A${r}`, '▌ 報價單注意事項');
  ws.getRow(r).height = 22; r++;

  QUOTE_TERMS.forEach((line, idx) => {
    ws.mergeCells(`A${r}:F${r}`);
    const isHeader = idx === 0;
    s(ws.getCell(`A${r}`), {
      fill: isHeader ? LBLUE : WHITE,
      font: { size: 9, color: { argb: 'FF333333' }, bold: isHeader },
      align: { vertical: 'top', wrapText: true, horizontal: 'left' },
      border: ALL_BORDERS,
    });
    ws.getCell(`A${r}`).value = line;
    ws.getRow(r).height = Math.max(18, Math.ceil(line.length / 60) * 16);
    r++;
  });

  // ── 13. 頁尾 ──
  r++;
  ws.mergeCells(`A${r}:F${r}`);
  s(ws.getCell(`A${r}`), { fill: DARK, font: { size: 8, color: { argb: 'FF888888' } }, align: { horizontal: 'center', vertical: 'middle' } });
  ws.getCell(`A${r}`).value = '門的世界 DOORWORLD　展億室內開發有限公司　|　TEL: 02-2292-0366　|　Email: doorworld168@gmail.com';
  ws.getRow(r).height = 20;

  // ── Download ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `報價單_${vm.no.full || 'export'}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── 圖片抓取 helpers ──────────────────────────────────────────────────────

async function fetchProductImage(productCode) {
  if (!productCode) return null;
  try {
    const imgs = await sbFetch(`products?full_code=eq.${encodeURIComponent(productCode)}&select=thumbnail_url,image_url`);
    const url = imgs?.[0]?.thumbnail_url || imgs?.[0]?.image_url || '';
    if (!url || !isSupabaseStorageUrl(url)) return null;
    const buf = await safeFetchImageBuffer(url);
    return buf ? { buf, ext: imgExtension(url) } : null;
  } catch { return null; }
}

async function fetchColorImage(colorCode) {
  if (!colorCode) return null;
  try {
    const cc = await sbFetch(`color_cards?code=eq.${encodeURIComponent(colorCode)}&select=image_url`);
    const url = cc?.[0]?.image_url || '';
    if (!url) return null;
    const buf = await safeFetchImageBuffer(url);
    return buf ? { buf, ext: imgExtension(url) } : null;
  } catch { return null; }
}

async function fetchPanelImage(panelCode) {
  if (!panelCode) return null;
  try {
    const ps = await sbFetch(`panel_styles?code=eq.${encodeURIComponent(panelCode)}&select=image_url`);
    const url = ps?.[0]?.image_url || '';
    if (!url) return null;
    const buf = await safeFetchImageBuffer(url);
    return buf ? { buf, ext: imgExtension(url) } : null;
  } catch { return null; }
}

async function fetchAccessoryImageMap(accessories) {
  // 用 accessory.standard / accessory.upgrade 名稱去 accessories 表查 image_url
  const map = {};
  if (!accessories || accessories.length === 0) return map;
  try {
    const names = new Set();
    accessories.forEach(a => { if (a.standard) names.add(a.standard); if (a.upgrade) names.add(a.upgrade); });
    if (names.size === 0) return map;
    const rows = await sbFetch(`accessories?select=name,image_url&is_active=eq.true&image_url=not.is.null`);
    const urlByName = {};
    (rows || []).forEach(a => { if (a.image_url && names.has(a.name)) urlByName[a.name] = a.image_url; });
    // 並行抓 buffer
    const fetches = Object.entries(urlByName).map(async ([name, url]) => {
      const buf = await safeFetchImageBuffer(url);
      if (buf) map[name] = { buf, ext: imgExtension(url) };
    });
    await Promise.all(fetches);
  } catch {}
  return map;
}

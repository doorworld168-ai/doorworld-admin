import * as XLSX from 'xlsx';

const COMPANY_NAME = '門的世界 DOORWORLD（展億室內開發有限公司）';
const COMPANY_INFO = '統編 60667469　新北市五股區成泰路一段130-3號　02-2292-0366';

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

// ─── 估價單 ────────────────────────────────────────────────────────────────
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

// ─── 報價單 ────────────────────────────────────────────────────────────────
export function exportFormalQuoteExcel(c) {
  if (!c) return;
  const fd = c.formal_quote_data || {};
  const doorLabel = DOOR_TYPE_LABEL[c.door_type] || c.door_type || '單開門';
  const fireLabel = fd.fire_type === 'f60a' ? 'f60A防火' : fd.fire_type === 'f60a_smoke' ? 'f60A遮煙門' : c.is_fireproof ? 'f60A防火' : '不防火';
  const dateStr = fmtDate(c.official_quote_at || c.created_at);
  const qty = c.quantity || 1;

  const wMM = fd.width_mm || (c.actual_width_cm ? c.actual_width_cm * 10 : '');
  const hMM = fd.height_mm || (c.actual_height_cm ? c.actual_height_cm * 10 : '');
  const wCM = wMM ? Math.round(wMM / 10) + ' cm' : '—';
  const hCM = hMM ? Math.round(hMM / 10) + ' cm' : '—';

  const reqs = fd.special_requirements || [];
  const reqChecks = ['拆舊', '回收', '佔框', '濕式施工', '乾式包框'];
  const reqStr = reqChecks.map(r => (reqs.includes(r) ? '■' : '□') + r).join('  ');

  // Unit price
  let unitPrice = 0;
  if (c.official_note) {
    const idx = c.official_note.indexOf('門扇單價:');
    if (idx !== -1) {
      let j = idx + 5, numStr = '';
      while (j < c.official_note.length && c.official_note.charCodeAt(j) >= 48 && c.official_note.charCodeAt(j) <= 57) { numStr += c.official_note[j]; j++; }
      if (numStr) unitPrice = parseInt(numStr, 10);
    }
  }
  if (!unitPrice && c.official_price && qty > 0) unitPrice = Math.round(c.official_price / qty);

  const discountRate = c.discount_rate || 1;
  const doorSubtotal = unitPrice * qty;
  const discounted = c.official_price || Math.round(doorSubtotal * discountRate);
  const installFee = c.install_fee || 0;

  // Addon items
  const addonLines = [];
  let addonTotal = 0;
  if (c.addon_items) {
    c.addon_items.split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      let i = line.length - 1;
      while (i >= 0 && (line[i] === ' ' || (line.charCodeAt(i) >= 48 && line.charCodeAt(i) <= 57) || line[i] === ',')) i--;
      const numStart = i + 1;
      if (numStart < line.length) {
        const amt = parseInt(line.substring(numStart).trim().replace(/,/g, ''), 10);
        if (!isNaN(amt)) {
          addonTotal += amt;
          addonLines.push([line.substring(0, numStart).trim(), '', '', fmtP(amt)]);
          return;
        }
      }
      addonLines.push([line, '', '', '']);
    });
  }

  const totalPrice = c.total_with_tax || (discounted + addonTotal + installFee);
  const deposit = c.deposit_50 || Math.round(totalPrice * 0.5);
  const balance = c.balance || (totalPrice - deposit);

  // Accessories
  const acc = fd.accessories || [];
  const accStr = acc.length ? acc.map(a => {
    const chosen = a.useUpgrade ? a.upgrade : a.standard;
    return `${a.label}：${chosen}${a.useUpgrade ? '（選配）' : ''}`;
  }).join('　') : '—';

  const aoa = [
    [COMPANY_NAME, '', '', ''],
    [COMPANY_INFO, '', '', ''],
    ['', '', '', ''],
    ['報價單', '', '', ''],
    ['', '', '', ''],
    ['報價單號', c.formal_quote_no || c.order_no || c.case_no || '—', '日期', dateStr],
    ['業務', c.sales_person || '—', '建單人', c.created_by || '—'],
    ['', '', '', ''],
    ['── 客戶資料 ──', '', '', ''],
    ['聯絡人', c.customer_name || c.contact_person || '—', '統編', c.tax_id || '—'],
    ['電話', c.customer_phone || '—', '樓層/電梯', fd.has_elevator === false ? '無電梯' : '有電梯'],
    ['地址', c.case_address || c.customer_addr || '—', '', ''],
    ['', '', '', ''],
    ['── 產品明細 ──', '', '', ''],
    ['款式名稱', c.product_code || '—', '門的需求', doorLabel],
    ['防火需求', fireLabel, '交貨時間', `${c.delivery_days || 90} 日曆天`],
    ['特殊需求', reqStr, '', ''],
    ['派送安裝', fd.install_method || '甲方派送安裝', '', ''],
    ['', '', '', ''],
    ['── 門框尺寸 / 規格 ──', '', '', ''],
    ['門洞寬(W)', wCM, '門洞高(H)', hCM],
    ['框厚', fd.frame_thickness || '—', '扇厚', fd.panel_thickness || '—'],
    ['門開方向', fd.door_direction || '—', '數量', qty],
    ['藝術框', fd.art_frame || '無', '交貨方式', fd.delivery_type || '框扇同時'],
    ['門扇顏色', fd.door_color || '—', '門鎖樣式', fd.lock_style || '—'],
    ['', '', '', ''],
    ['── 五金配件 ──', accStr, '', ''],
    ['', '', '', ''],
    ['── 費用明細 ──', '', '', ''],
    [`門扇費用（${qty}樘）`, '', '', fmtP(doorSubtotal)],
  ];

  if (discountRate < 1) {
    aoa.push([`折扣（${Math.round(discountRate * 100)}%）`, '', '', fmtP(discounted)]);
  }
  if (installFee) {
    aoa.push(['安裝費', '', '', fmtP(installFee)]);
  }
  if (addonLines.length) {
    aoa.push(['── 附加施工費明細 ──', '', '', '']);
    addonLines.forEach(row => aoa.push(row));
  }

  aoa.push(['', '', '', '']);
  aoa.push(['含稅總價', '', '', fmtP(totalPrice)]);
  aoa.push(['訂金 50%', '', '', fmtP(deposit)]);
  aoa.push(['尾款', '', '', fmtP(balance)]);

  if (c.note) {
    aoa.push(['', '', '', '']);
    aoa.push(['備註', c.note, '', '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 18 }];

  // Merge title rows and full-width section headers
  const fullMergeRows = [0, 1, 3, 8, 13, 19, 27, 28];
  ws['!merges'] = fullMergeRows.map(r => ({ s: { r, c: 0 }, e: { r, c: 3 } }));
  // Address merges
  ws['!merges'].push({ s: { r: 11, c: 1 }, e: { r: 11, c: 3 } });
  ws['!merges'].push({ s: { r: 16, c: 1 }, e: { r: 16, c: 3 } });
  ws['!merges'].push({ s: { r: 17, c: 1 }, e: { r: 17, c: 3 } });
  ws['!merges'].push({ s: { r: 26, c: 1 }, e: { r: 26, c: 3 } });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '報價單');
  XLSX.writeFile(wb, `報價單_${c.formal_quote_no || c.order_no || 'export'}.xlsx`);
}

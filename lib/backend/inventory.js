import CACHE from '../cache.js';
import { getSheet, getDataRange, appendRow, updateRow, deleteRow } from '../googleSheets.js';
import { CONFIG_HEADERS } from '../sheetsMap.js';
import { safeNum } from '../format.js';

export async function getInventory(skipCache) {
  if (!skipCache) {
    const cached = CACHE.get('inventory');
    if (cached) return cached;
  }

  await getSheet('Config', CONFIG_HEADERS);
  const allData = await getDataRange('Config');
  if (allData.length < 2) return [];

  const headers = allData[0];
  const colMixQty = headers.indexOf('Định lượng Mix');
  const colMixPrice = headers.indexOf('Giá bán Mix');
  const colNote = headers.indexOf('Ghi chú');

  const result = [];
  for (let ri = 1; ri < allData.length; ri++) {
    const r = allData[ri];
    if (!r[2] || String(r[2]).trim() === '') continue;
    result.push({
      sheetRow: ri + 1,
      code: String(r[0] || '').trim(),
      type: String(r[1] != null ? r[1] : '')
        .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
        .trim(),
      name: String(r[2] != null ? r[2] : '')
        .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
        .trim(),
      unit: String(r[3] || '').trim(),
      supplier: String(r[4] || ''),
      size: safeNum(r[5]),
      price: safeNum(r[6]),
      mixQty: colMixQty > -1 ? safeNum(r[colMixQty]) : 0,
      mixPrice: colMixPrice > -1 ? safeNum(r[colMixPrice]) : 0,
      note: colNote > -1 ? String(r[colNote] || '') : '',
      unitPrice: safeNum(r[5]) > 0 ? safeNum(r[6]) / safeNum(r[5]) : 0,
    });
  }

  CACHE.set('inventory', result, 180);
  return result;
}

export async function addIngredient(data) {
  await appendRow('Config', [
    data.code,
    data.type,
    data.name,
    data.unit,
    data.supplier,
    data.size,
    data.price,
    data.mixQty || 0,
    data.mixPrice || 0,
    data.note,
  ]);
  CACHE.clear(['inventory', 'stock_month', 'stock_today', 'stock_week']);
  return 'Đã thêm nguyên liệu mới vào Danh mục!';
}

export async function updateIngredient(sheetRow, data) {
  const row = parseInt(sheetRow, 10);
  if (isNaN(row) || row < 2) throw new Error('Dòng sheet không hợp lệ');
  await updateRow('Config', row, [
    data.code,
    data.type,
    data.name,
    data.unit,
    data.supplier,
    data.size,
    data.price,
    data.mixQty || 0,
    data.mixPrice || 0,
    data.note,
  ]);
  CACHE.clear(['inventory', 'stock_month', 'stock_today', 'stock_week']);
  return 'Đã cập nhật nguyên liệu!';
}

export async function deleteIngredient(sheetRow) {
  const row = parseInt(sheetRow, 10);
  if (isNaN(row) || row < 2) throw new Error('Dòng sheet không hợp lệ');
  await deleteRow('Config', row);
  CACHE.clear(['inventory', 'stock_month', 'stock_today', 'stock_week']);
  return 'Đã xóa nguyên liệu!';
}

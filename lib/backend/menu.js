import CACHE from '../cache.js';
import {
  getSheet,
  getDataRange,
  appendRow,
  updateRow,
  deleteRow,
  updateCell,
} from '../googleSheets.js';
import {
  MENU_HEADERS_BASE,
  MENU_HEADERS_EXTRA,
} from '../sheetsMap.js';
import { safeNum, parseBoolCell } from '../format.js';

const DEFAULT_LARGE_EXTRA = 8000;

export function defaultMenuLabelCatalog() {
  return [
    { id: 'hot', name: 'Hot', style: 'hot' },
    { id: 'nen-thu', name: 'Nên thử', style: 'try' },
    { id: 'bestseller', name: 'Best seller', style: 'bestseller' },
    { id: 'mon-moi', name: 'Món mới', style: 'new' },
  ];
}

export function defaultMenuTagCatalog() {
  return [
    { id: 'giam-can', name: 'Giảm cân', style: 'giam' },
    { id: 'dep-da', name: 'Đẹp da', style: 'da' },
    { id: 'thai-doc', name: 'Thải độc', style: 'detox' },
    { id: 'tieu-hoa', name: 'Tiêu hóa', style: 'tieu' },
  ];
}

export function normalizeMenuLabelCatalog(raw) {
  const base = defaultMenuLabelCatalog();
  if (!raw || !Array.isArray(raw)) return base;
  const out = [];
  const seen = {};
  raw.forEach((it) => {
    if (!it || typeof it !== 'object') return;
    const id = String(it.id || it.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '');
    const name = String(it.name || it.id || '').trim();
    if (!id || !name || seen[id]) return;
    seen[id] = 1;
    out.push({ id, name, style: String(it.style || id).trim() || id });
  });
  return out.length ? out : base;
}

export function normalizeMenuTagCatalog(raw) {
  const base = defaultMenuTagCatalog();
  if (!raw || !Array.isArray(raw)) return base;
  const out = [];
  const seen = {};
  raw.forEach((it) => {
    if (!it || typeof it !== 'object') return;
    const id = String(it.id || it.name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '');
    const name = String(it.name || it.id || '').trim();
    if (!id || !name || seen[id]) return;
    out.push({ id, name, style: String(it.style || id).trim() || id });
  });
  return out.length ? out : base;
}

function parseMenuTagsCell(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  return s.split(/[,|;]/).map((x) => String(x || '').trim()).filter(Boolean);
}

function parseToppingsCell(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t) => ({
        name: String(t?.name || '').trim(),
        price: safeNum(t?.price),
        noTopping: !!(t?.noTopping || t?.exclusive),
      }))
      .filter((t) => t.name);
  } catch {
    return [];
  }
}

async function ensureMenuExtraColumns() {
  const sheetName = 'Menu';
  await getSheet(sheetName, MENU_HEADERS_BASE);
  const all = await getDataRange(sheetName);
  if (!all.length) return;
  let headers = [...all[0]];
  let changed = false;
  for (const title of MENU_HEADERS_EXTRA) {
    if (headers.indexOf(title) === -1) {
      headers.push(title);
      changed = true;
    }
  }
  if (changed) {
    await updateRow(sheetName, 1, headers);
  }
}

function buildValMap(data, id) {
  const largeExtra =
    data.largeCupExtra != null && data.largeCupExtra !== ''
      ? parseFloat(data.largeCupExtra)
      : 8000;
  const smallDisc =
    data.smallCupDiscount != null && data.smallCupDiscount !== ''
      ? parseFloat(data.smallCupDiscount)
      : 0;
  const plasticX =
    data.plasticBottleExtra != null && data.plasticBottleExtra !== ''
      ? parseFloat(data.plasticBottleExtra)
      : 0;
  let sizeRecipeJson = '';
  if (data.sizeRecipeExtra != null && typeof data.sizeRecipeExtra === 'string') sizeRecipeJson = data.sizeRecipeExtra;
  else if (data.sizeRecipeExtra && typeof data.sizeRecipeExtra === 'object')
    sizeRecipeJson = JSON.stringify(data.sizeRecipeExtra);
  else if (data.sizeRecipeExtraJson) sizeRecipeJson = String(data.sizeRecipeExtraJson);
  else sizeRecipeJson = '[]';

  return {
    ID: id,
    Tên: data.name,
    'Danh mục': data.category,
    'Giá cơ bản': data.basePrice,
    'Mô tả': data.description || '',
    'Hình ảnh': data.imageUrl || '',
    'Ảnh bìa': data.coverImageUrl || '',
    'Thành phần': JSON.stringify(data.ingredients || []),
    'Còn hàng': data.available !== false,
    'Phổ biến': data.popular === true,
    'Ghi chú': data.note || '',
    'Giá vốn': data.costPrice || 0,
    'Phí VH': data.opEx || 0,
    'Giảm ly nhỏ': smallDisc,
    'Phụ thu ly lớn': isNaN(largeExtra) ? 8000 : largeExtra,
    'Bật cỡ nhỏ': data.enableSmall === true,
    'Bật cỡ thường': data.enableRegular !== false,
    'Bật cỡ lớn': data.enableLarge !== false,
    'Phụ thu chai nhựa': isNaN(plasticX) ? 0 : Math.max(0, plasticX),
    'Định mức size (JSON)': sizeRecipeJson || '[]',
    'Phụ thu gia đình 500ml':
      data.familyPackExtra500 != null && data.familyPackExtra500 !== ''
        ? parseFloat(data.familyPackExtra500)
        : 0,
    'Phụ thu gia đình 1L':
      data.familyPackExtra1L != null && data.familyPackExtra1L !== ''
        ? parseFloat(data.familyPackExtra1L)
        : 0,
    'Giá bán chai 500ml':
      data.familySell500 != null && data.familySell500 !== ''
        ? parseFloat(data.familySell500)
        : 0,
    'Giá bán chai 1 lít':
      data.familySell1L != null && data.familySell1L !== ''
        ? parseFloat(data.familySell1L)
        : 0,
    'Calo ước (kcal)':
      data.nutritionKcal != null && data.nutritionKcal !== ''
        ? parseFloat(data.nutritionKcal)
        : 0,
    'Protein ước (g)':
      data.nutritionProteinG != null && data.nutritionProteinG !== ''
        ? parseFloat(data.nutritionProteinG)
        : 0,
    'Chất béo ước (g)':
      data.nutritionFatG != null && data.nutritionFatG !== ''
        ? parseFloat(data.nutritionFatG)
        : 0,
    'Công dụng': data.benefits != null ? String(data.benefits) : '',
    'Nhãn HV': data.memLabel != null ? String(data.memLabel).trim() : '',
    'Tag HV': Array.isArray(data.memTags)
      ? data.memTags.join(', ')
      : data.memTags != null
        ? String(data.memTags)
        : '',
    'Topping (JSON)':
      data.toppingsJson != null
        ? String(data.toppingsJson)
        : Array.isArray(data.toppings)
          ? JSON.stringify(data.toppings)
          : '[]',
  };
}

export async function getMenu() {
  const cached = CACHE.get('menu');
  if (cached) return cached;

  await ensureMenuExtraColumns();
  const allData = await getDataRange('Menu');
  if (allData.length < 2) return [];

  const headers = allData[0];
  const data = allData.slice(1).filter((r) => r[1] && String(r[1]).trim() !== '');
  const ix = (name) => headers.indexOf(name);

  const result = data.map((r) => {
    let parsedIngredients = [];
    const colIng = ix('Thành phần');
    const ingCell = colIng > -1 ? r[colIng] : r[6];
    if (ingCell) {
      try {
        parsedIngredients = JSON.parse(ingCell);
      } catch {
        parsedIngredients = String(ingCell)
          .split(',')
          .map((s) => ({ name: s.trim(), qty: 1 }));
      }
    }
    const parseBool = (v) => v === true || String(v).trim().toUpperCase() === 'TRUE';
    const isAvailable = (v) => v !== false && String(v).trim().toUpperCase() !== 'FALSE';

    const colSmall = ix('Giảm ly nhỏ');
    const colLarge = ix('Phụ thu ly lớn');
    const smallDisc = colSmall > -1 ? safeNum(r[colSmall]) : 0;
    let largeExtra = DEFAULT_LARGE_EXTRA;
    if (colLarge > -1) {
      if (r[colLarge] === '' || r[colLarge] == null) largeExtra = DEFAULT_LARGE_EXTRA;
      else largeExtra = safeNum(r[colLarge]);
    }

    const ingredientNames = [];
    const seenN = {};
    parsedIngredients.forEach((ing) => {
      let nm = '';
      if (typeof ing === 'string') nm = String(ing).trim();
      else if (ing?.name) nm = String(ing.name).trim();
      if (!nm || seenN[nm]) return;
      seenN[nm] = 1;
      ingredientNames.push(nm);
    });

    return {
      id: String(r[0] || ''),
      name: String(r[1] || ''),
      category: String(r[2] || ''),
      basePrice: safeNum(r[3]),
      description: String(r[4] || ''),
      imageUrl: String(r[5] || ''),
      coverImageUrl: ix('Ảnh bìa') > -1 ? String(r[ix('Ảnh bìa')] || '') : '',
      ingredients: parsedIngredients,
      benefits: ix('Công dụng') > -1 ? String(r[ix('Công dụng')] || '').trim() : '',
      ingredientNames,
      available: ix('Còn hàng') > -1 ? isAvailable(r[ix('Còn hàng')]) : isAvailable(r[7]),
      popular: ix('Phổ biến') > -1 ? parseBool(r[ix('Phổ biến')]) : parseBool(r[8]),
      note: ix('Ghi chú') > -1 ? String(r[ix('Ghi chú')] || '') : '',
      costPrice: ix('Giá vốn') > -1 ? safeNum(r[ix('Giá vốn')]) : 0,
      opEx: ix('Phí VH') > -1 ? safeNum(r[ix('Phí VH')]) : 0,
      smallCupDiscount: smallDisc,
      largeCupExtra: largeExtra,
      hasLargeSize: largeExtra >= 0,
      enableSmall: ix('Bật cỡ nhỏ') > -1 ? parseBoolCell(r[ix('Bật cỡ nhỏ')], false) : smallDisc > 0,
      enableRegular: ix('Bật cỡ thường') > -1 ? parseBoolCell(r[ix('Bật cỡ thường')], true) : true,
      enableLarge: ix('Bật cỡ lớn') > -1 ? parseBoolCell(r[ix('Bật cỡ lớn')], true) : true,
      plasticBottleExtra: ix('Phụ thu chai nhựa') > -1 ? safeNum(r[ix('Phụ thu chai nhựa')]) : 0,
      familyPackExtra500: ix('Phụ thu gia đình 500ml') > -1 ? safeNum(r[ix('Phụ thu gia đình 500ml')]) : 0,
      familyPackExtra1L: ix('Phụ thu gia đình 1L') > -1 ? safeNum(r[ix('Phụ thu gia đình 1L')]) : 0,
      familySell500: ix('Giá bán chai 500ml') > -1 ? safeNum(r[ix('Giá bán chai 500ml')]) : 0,
      familySell1L: ix('Giá bán chai 1 lít') > -1 ? safeNum(r[ix('Giá bán chai 1 lít')]) : 0,
      nutritionKcal: ix('Calo ước (kcal)') > -1 ? safeNum(r[ix('Calo ước (kcal)')]) : 0,
      nutritionProteinG: ix('Protein ước (g)') > -1 ? safeNum(r[ix('Protein ước (g)')]) : 0,
      nutritionFatG: ix('Chất béo ước (g)') > -1 ? safeNum(r[ix('Chất béo ước (g)')]) : 0,
      memLabel: ix('Nhãn HV') > -1 ? String(r[ix('Nhãn HV')] || '').trim() : '',
      memTags: ix('Tag HV') > -1 ? parseMenuTagsCell(r[ix('Tag HV')]) : [],
      toppings:
        ix('Topping (JSON)') > -1 ? parseToppingsCell(r[ix('Topping (JSON)')]) : [],
    };
  });

  CACHE.set('menu', result, 600);
  return result;
}

export async function saveMenuItem(data) {
  await ensureMenuExtraColumns();
  const id = data.id || `MENU_${Date.now()}`;
  const all = await getDataRange('Menu');
  const headers = all[0] || MENU_HEADERS_BASE;
  const valMap = buildValMap(data, id);
  const row = headers.map((h) => (valMap[h] !== undefined ? valMap[h] : ''));
  await appendRow('Menu', row);
  CACHE.clear('menu');
  return id;
}

export async function updateMenuItem(id, data) {
  await ensureMenuExtraColumns();
  const allRows = await getDataRange('Menu');
  const headers = allRows[0];
  const valMap = buildValMap(data, id);
  for (let i = 1; i < allRows.length; i++) {
    if (String(allRows[i][0]) === String(id)) {
      const rowOut = headers.map((h, colIdx) =>
        valMap[h] !== undefined ? valMap[h] : allRows[i][colIdx] !== undefined ? allRows[i][colIdx] : '',
      );
      await updateRow('Menu', i + 1, rowOut);
      CACHE.clear('menu');
      return true;
    }
  }
  return false;
}

export async function deleteMenuItem(rowIndex) {
  await deleteRow('Menu', rowIndex + 2);
  CACHE.clear('menu');
  return 'Đã xóa sản phẩm khỏi Menu!';
}

export async function updateMenuAvailability(id, available) {
  await ensureMenuExtraColumns();
  const data = await getDataRange('Menu');
  const headers = data[0];
  const colAvail = headers.indexOf('Còn hàng');
  if (colAvail < 0) return false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      await updateCell('Menu', i + 1, colAvail + 1, available);
      CACHE.clear('menu');
      return true;
    }
  }
  return false;
}

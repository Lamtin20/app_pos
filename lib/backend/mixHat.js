import CACHE from '../cache.js';
import {
  getSheet,
  getDataRange,
  appendRow,
  updateRow,
  deleteRow,
  listSheetNames,
} from '../googleSheets.js';
import { MIXHAT_HEADERS, CONFIG_HEADERS } from '../sheetsMap.js';
import { safeNum, parseBoolCell } from '../format.js';

function isConfigLoaiHat(v) {
  const raw = String(v != null ? v : '')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .trim();
  if (!raw) return false;
  let t;
  try {
    t = raw.normalize('NFKC').toLowerCase();
  } catch {
    t = raw.toLowerCase();
  }
  if (t === 'hạt' || t === 'hat') return true;
  try {
    const d = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return d === 'hat';
  } catch {
    return false;
  }
}

async function getMixHatSheetName() {
  const tryNames = ['MixHat', 'Mix Hạt', 'Mix hạt', 'MIX HẠT', 'Mix HẠT'];
  const names = await listSheetNames();
  for (const n of tryNames) {
    if (names.includes(n)) return n;
  }
  for (const nm of names) {
    const norm = String(nm || '').replace(/\s+/g, ' ').trim();
    const low = norm.toLowerCase();
    if (low === 'mixhat' || low === 'mix hạt') return nm;
  }
  await getSheet('MixHat', MIXHAT_HEADERS);
  return 'MixHat';
}

function mixHatNormHeader(h) {
  return String(h != null ? h : '')
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .trim();
}

function mixHatColIx(headers, exactNames, defaultIdx) {
  const norm = headers.map(mixHatNormHeader);
  for (const e of exactNames) {
    const want = mixHatNormHeader(e);
    const j = norm.indexOf(want);
    if (j > -1) return j;
  }
  if (defaultIdx >= 0 && defaultIdx < headers.length) return defaultIdx;
  return -1;
}

function mixHatNameColIx(headers) {
  let j = mixHatColIx(headers, ['Tên hạt', 'Tên Hạt', 'Ten hat', 'Name'], -1);
  if (j > -1) return j;
  for (let hi = 0; hi < headers.length; hi++) {
    const t = String(headers[hi] || '').trim().toLowerCase();
    if (t.indexOf('tên') !== -1 && t.indexOf('hạt') !== -1) return hi;
  }
  if (headers.length > 1) return 1;
  return -1;
}

async function ensureMixHatColumns(sheetName) {
  const all = await getDataRange(sheetName);
  if (!all.length) return;
  let headers = [...all[0]];
  let changed = false;
  for (const title of MIXHAT_HEADERS) {
    if (headers.indexOf(title) === -1) {
      headers.push(title);
      changed = true;
    }
  }
  if (changed) await updateRow(sheetName, 1, headers);
}

export async function getMixHatPickerSeeds() {
  await getSheet('Config', CONFIG_HEADERS);
  const all = await getDataRange('Config');
  if (all.length < 2) return [];
  const headers = all[0];
  const colMixQty = headers.indexOf('Định lượng Mix');
  const colMixPrice = headers.indexOf('Giá bán Mix');
  let colLoai = headers.indexOf('Loại');
  let colTen = headers.indexOf('Tên nguyên liệu');
  if (colLoai < 0) colLoai = 1;
  if (colTen < 0) colTen = 2;

  const out = [];
  for (let r = 1; r < all.length; r++) {
    const row = all[r];
    if (!row || !isConfigLoaiHat(row[colLoai])) continue;
    const name = String(row[colTen] != null ? row[colTen] : '').trim();
    if (!name) continue;
    out.push({
      name,
      mixQty: colMixQty > -1 ? safeNum(row[colMixQty]) : 0,
      mixPrice: colMixPrice > -1 ? Math.round(safeNum(row[colMixPrice])) : 0,
    });
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
  return out;
}

export async function getMixHats(skipCache) {
  if (!skipCache) {
    const cached = CACHE.get('mixhats');
    if (cached) return cached;
  }
  const sheetName = await getMixHatSheetName();
  await ensureMixHatColumns(sheetName);
  const all = await getDataRange(sheetName);
  if (all.length < 2) return [];

  const headers = all[0].map(mixHatNormHeader);
  const colId = mixHatColIx(headers, ['ID'], 0);
  let colName = mixHatNameColIx(headers);
  const colDesc = mixHatColIx(headers, ['Mô tả', 'Mo ta', 'Description'], 2);
  const colPrice = mixHatColIx(headers, ['Giá bán', 'Gia ban', 'Price'], 3);
  const colMixQty = mixHatColIx(headers, ['Định lượng Mix', 'Dinh luong Mix', 'Mix Qty'], 4);
  const colImg = mixHatColIx(headers, ['Ảnh', 'Anh', 'Image', 'URL'], 5);
  const colOn = mixHatColIx(headers, ['Bật', 'Bat', 'Enabled', 'Active'], 6);
  const colOrd = mixHatColIx(headers, ['Thứ tự', 'Thu tu', 'Order', 'STT'], 7);
  if (colName < 0) return [];

  const bodyMatrix = all.slice(1);
  const bodyRows = bodyMatrix
    .map((r, idx) => ({ r, sheetRow: idx + 2 }))
    .filter((o) => o.r && o.r[colName] != null && String(o.r[colName]).trim() !== '');

  const result = bodyRows
    .map((o, i) => {
      const r = o.r;
      const id =
        colId > -1 && r[colId] ? String(r[colId]) : `MIX_${Date.now()}_${i}`;
      return {
        id,
        name: String(r[colName] || '').trim(),
        description: colDesc > -1 ? String(r[colDesc] || '').trim() : '',
        price: colPrice > -1 ? safeNum(r[colPrice]) : 0,
        mixQty: colMixQty > -1 ? safeNum(r[colMixQty]) : 0,
        imageUrl: colImg > -1 ? String(r[colImg] || '').trim() : '',
        enabled: colOn > -1 ? parseBoolCell(r[colOn], true) : true,
        order: colOrd > -1 ? safeNum(r[colOrd]) : i,
        sheetRow: o.sheetRow,
      };
    })
    .sort(
      (a, b) =>
        a.order - b.order || String(a.name).localeCompare(String(b.name), 'vi'),
    );

  CACHE.set('mixhats', result, 600);
  return result;
}

export async function upsertMixHat(data) {
  const sheetName = await getMixHatSheetName();
  await ensureMixHatColumns(sheetName);
  const all = await getDataRange(sheetName);
  const headers = all[0].map((h) => String(h || '').trim());
  const ix = (name) => headers.indexOf(name);
  const colId = ix('ID');
  const id = String(data?.id || '').trim() || `MIX_${Date.now()}`;
  const name = String(data?.name || '').trim();
  if (!name) throw new Error('Thiếu tên hạt');

  let rowIdx = -1;
  for (let r = 1; r < all.length; r++) {
    if (colId > -1 && String(all[r][colId] || '') === id) {
      rowIdx = r + 1;
      break;
    }
  }

  const valMap = {
    ID: id,
    'Tên hạt': name,
    'Mô tả': data?.description ? String(data.description) : '',
    'Giá bán': safeNum(data?.price),
    'Định lượng Mix': safeNum(data?.mixQty),
    Ảnh: data?.imageUrl ? String(data.imageUrl) : '',
    Bật: data?.enabled === false ? false : true,
    'Thứ tự': data?.order != null && data?.order !== '' ? safeNum(data.order) : 0,
  };
  const row = headers.map((h) => (valMap[h] !== undefined ? valMap[h] : ''));

  if (rowIdx === -1) await appendRow(sheetName, row);
  else await updateRow(sheetName, rowIdx, row);

  CACHE.clear('mixhats');
  return { ok: true, id };
}

export async function deleteMixHat(id) {
  const sheetName = await getMixHatSheetName();
  const all = await getDataRange(sheetName);
  if (all.length < 2) return { ok: true };
  const headers = all[0].map((h) => String(h || '').trim());
  const colId = headers.indexOf('ID');
  if (colId < 0) throw new Error('Thiếu cột ID');
  const target = String(id || '').trim();
  if (!target) throw new Error('Thiếu id');
  for (let r = 1; r < all.length; r++) {
    if (String(all[r][colId] || '') === target) {
      await deleteRow(sheetName, r + 1);
      CACHE.clear('mixhats');
      return { ok: true };
    }
  }
  return { ok: true };
}

import {
  getDataRange,
  getLastRow,
  getSheet,
  updateCell,
  updateRange,
  getSheetByNames,
} from '../googleSheets.js';
import {
  ORDERS_HEADERS_STD,
  BANK_TRANSFER_HEADERS,
  SUN_PENDING_ORDER_CANCEL_HOURS,
} from '../sheetsMap.js';
import {
  normalizeVnPhoneDigits,
  parseOrderDate,
  safeJsonParse,
  formatDateTz,
} from '../format.js';

const locks = new Map();

export async function withLock(key, fn) {
  const deadline = Date.now() + 8000;
  while (locks.get(key)) {
    if (Date.now() > deadline) throw new Error('Lock timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
  locks.set(key, true);
  try {
    return await fn();
  } finally {
    locks.delete(key);
  }
}

export async function tryWithLock(key, fn, waitMs = 1200) {
  if (locks.get(key)) return { busy: true };
  locks.set(key, true);
  try {
    return await fn();
  } finally {
    locks.delete(key);
  }
}

export function ordersColumnMap(headers) {
  const map = {};
  (headers || []).forEach((h, c) => {
    const k = String(h || '').trim();
    if (k) map[k] = c;
  });
  return map;
}

export function ordersCell(row, map, colName, fallbackIndex) {
  if (map && map[colName] !== undefined && map[colName] !== null) return row[map[colName]];
  if (fallbackIndex !== undefined && row[fallbackIndex] !== undefined) return row[fallbackIndex];
  return '';
}

export function ordersHeaderPick(headers, candidates, fallbackIdx) {
  if (!headers?.length) return fallbackIdx;
  for (const c of candidates) {
    const ix = headers.indexOf(c);
    if (ix >= 0) return ix;
  }
  const candL = candidates.map((c) => String(c || '').trim().toLowerCase());
  for (let j = 0; j < headers.length; j++) {
    const h = String(headers[j] || '').trim().toLowerCase();
    for (const k of candL) {
      if (h === k) return j;
    }
  }
  return fallbackIdx;
}

export function ordersTimeRaw(row, cmap) {
  const names = ['Thời gian', 'Ngày giờ', 'Time', 'Ngày đặt'];
  for (const n of names) {
    if (cmap && cmap[n] !== undefined && cmap[n] !== null) {
      const v = row[cmap[n]];
      if (v !== '' && v != null) return v;
    }
  }
  return ordersCell(row, cmap, 'Thời gian', 1);
}

export function ordersCompletedStatus(st) {
  const s = String(st || '').trim();
  if (s.indexOf('Hủy') >= 0 || s.toLowerCase().indexOf('huy') === 0) return false;
  return s === 'Hoàn thành' || s.indexOf('Hoàn') === 0;
}

export function normalizeOrderIdForMatch(orderId) {
  return String(orderId || '').trim().replace(/^#/, '').toUpperCase().replace(/\s+/g, '');
}

export function orderStatusIsCancelled(st) {
  const s = String(st || '').trim().toLowerCase();
  return s.indexOf('hủy') >= 0 || s.indexOf('huy') >= 0;
}

export function orderStatusCanConfirmFromBank(st) {
  const s = String(st || '').trim().toLowerCase();
  if (!s) return true;
  if (orderStatusIsCancelled(st)) return false;
  if (s.indexOf('hoàn thành') >= 0 || s.indexOf('hoan thanh') >= 0) return false;
  return orderStatusIsAwaitingBank(st) || s.indexOf('chờ') >= 0 || s.indexOf('cho ') >= 0;
}

export function orderStatusIsAwaitingBank(st) {
  const s = String(st || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return false;
  if (orderStatusIsCancelled(s)) return false;
  if (s.indexOf('hoàn thành') >= 0 || s.indexOf('hoan thanh') >= 0) return false;
  return (
    s.indexOf('chờ thanh toán') >= 0 ||
    s === 'chờ tt' ||
    s.indexOf('chờ tt') === 0 ||
    s.indexOf('cho thanh toan') >= 0 ||
    s.indexOf('chưa tt') >= 0 ||
    s.indexOf('chua tt') >= 0 ||
    s.indexOf('chưa thanh toán') >= 0 ||
    s.indexOf('pending') >= 0
  );
}

export function bankMemoMatchesOrder(memoNorm, oidNorm) {
  if (!memoNorm || !oidNorm) return false;
  // VD cột F: "137268923952-SUN93006589-CHUYEN TIEN-..." → khớp mã SUN93006589
  if (memoNorm.indexOf(oidNorm) >= 0) return true;
  const segs = memoNorm.split(/[-_\s,;|/\\]+/);
  for (const seg of segs) {
    const s = String(seg || '').toUpperCase().replace(/\s+/g, '');
    if (s && s === oidNorm) return true;
  }
  const reOrderId = /(?:SUN|SUB)\d{6,}/gi;
  let m;
  while ((m = reOrderId.exec(memoNorm)) !== null) {
    if (String(m[0] || '').toUpperCase() === oidNorm) return true;
  }
  const onlyDigitsMemo = memoNorm.replace(/\D/g, '');
  const onlyDigitsOid = oidNorm.replace(/\D/g, '');
  if (onlyDigitsOid.length >= 6 && onlyDigitsMemo.indexOf(onlyDigitsOid) >= 0) return true;
  const tail8 = oidNorm.slice(-8);
  if (tail8.length === 8 && /^\d+$/.test(tail8) && memoNorm.indexOf(tail8) >= 0) return true;
  return false;
}

export function bankTransferRowProcessed(statusCell) {
  const s = String(statusCell || '').trim().toLowerCase();
  return (
    s.indexOf('đã xử lý') >= 0 ||
    s.indexOf('da xu ly') >= 0 ||
    s === 'xong' ||
    s.indexOf('done') >= 0
  );
}

export async function getOrdersSheet(headersDef = ORDERS_HEADERS_STD) {
  const shOrders = await getSheetByNames(['Orders']);
  const shOrder = await getSheetByNames(['Order']);
  if (shOrders && shOrder) {
    const ro = await getLastRow('Orders');
    const r1 = await getLastRow('Order');
    if (ro < 2 && r1 >= 2) return 'Order';
    if (r1 < 2 && ro >= 2) return 'Orders';
    if (ro >= 2 && r1 >= 2) return 'Orders';
    return shOrders.name;
  }
  if (shOrders) return shOrders.name;
  if (shOrder) return shOrder.name;
  await getSheet('Orders', headersDef);
  return 'Orders';
}

export async function getBankTransferSheet() {
  const found =
    (await getSheetByNames(['Bank transfer'])) ||
    (await getSheetByNames(['Bank tranfer'])) ||
    (await getSheetByNames(['Bank Transfer']));
  if (found) return found.name;
  await getSheet('Bank transfer', BANK_TRANSFER_HEADERS);
  return 'Bank transfer';
}

export function bankSheetColOrderRef(headers) {
  return ordersHeaderPick(
    headers,
    [
      'Mã tham chiếu',
      'Mã đơn hàng CK',
      'Số HĐ CK',
      'Mã HĐ CK',
      'Mã thanh toán',
      'Mã đơn hàng',
      'Số HĐ',
      'Mã HĐ',
    ],
    -1,
  );
}

export async function getOrdersColumnMap() {
  const sheetName = await getOrdersSheet();
  const data = await getDataRange(sheetName);
  if (!data.length) return null;
  return ordersColumnMap(data[0]);
}

export function safeSerializeOrderItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const opts = it.options || {};
    const safeOpts = {
      size: opts.size != null ? String(opts.size) : '',
      sizePrice: parseFloat(opts.sizePrice) || 0,
      ice: opts.ice != null ? String(opts.ice) : '',
      sweetness: opts.sweetness != null ? String(opts.sweetness) : '',
      serveTemp: opts.serveTemp != null ? String(opts.serveTemp) : '',
      packaging: opts.packaging != null ? String(opts.packaging) : '',
      packagingPrice: parseFloat(opts.packagingPrice) || 0,
      addons: Array.isArray(opts.addons) ? opts.addons.map(String) : [],
      addonPrices: Array.isArray(opts.addonPrices)
        ? opts.addonPrices.map((p) => parseFloat(p) || 0)
        : [],
      familyPack: opts.familyPack === true,
    };
    const ings = [];
    if (Array.isArray(it.ingredients)) {
      it.ingredients.forEach((ing) => {
        if (!ing?.name) return;
        ings.push({ name: String(ing.name), qty: parseFloat(ing.qty) || 0 });
      });
    }
    const qty = parseInt(it.quantity, 10) || 1;
    const totalP = parseFloat(it.totalPrice) || 0;
    return {
      id: String(it.id || ''),
      name: String(it.name || ''),
      quantity: qty,
      price: parseFloat(it.price) || (qty > 0 ? Math.round(totalP / qty) : 0),
      totalPrice: totalP,
      excludeFromLoyaltyPoints: it.excludeFromLoyaltyPoints === true,
      extraNuts: Array.isArray(it.extraNuts) ? it.extraNuts.map(String) : [],
      ingredients: ings,
      options: safeOpts,
      note: String(it.note || ''),
      groupMember: String(it.groupMember || ''),
    };
  });
}

export async function cancelOrderIfExpired(orderIdNorm, nowDate, hoursLimit) {
  let limitH = hoursLimit != null ? parseFloat(hoursLimit) : SUN_PENDING_ORDER_CANCEL_HOURS;
  if (isNaN(limitH) || limitH <= 0) limitH = 12;
  const now = nowDate instanceof Date ? nowDate : new Date();
  const sheetName = await getOrdersSheet();
  const data = await getDataRange(sheetName);
  if (data.length < 2) return false;
  const headers = data[0];
  const cmap = ordersColumnMap(headers);
  const colId = ordersHeaderPick(headers, ['Mã ĐH', 'Mã đơn', 'Mã DH', 'Order ID'], 0);
  const colSt = ordersHeaderPick(headers, ['Trạng thái', 'Trạng thái đơn', 'Status'], 11);
  const colPm = ordersHeaderPick(headers, ['Phương thức TT', 'PTTT', 'Thanh toán'], 9);
  const colNote = ordersHeaderPick(headers, ['Ghi chú', 'Note'], 10);
  const oidWant = String(orderIdNorm || '').trim().toUpperCase();
  if (!oidWant) return false;

  for (let r = 1; r < data.length; r++) {
    const oidCell = normalizeOrderIdForMatch(data[r][colId >= 0 ? colId : 0]);
    if (oidCell !== oidWant) continue;
    const st = String(data[r][colSt >= 0 ? colSt : 11] || '').trim();
    if (!orderStatusIsAwaitingBank(st)) return false;
    const pm = String(data[r][colPm >= 0 ? colPm : 9] || '');
    if (
      pm.indexOf('Chuyển') < 0 &&
      pm.toLowerCase().indexOf('chuyen') < 0 &&
      pm.toLowerCase().indexOf('transfer') < 0
    )
      return false;
    const t = parseOrderDate(ordersTimeRaw(data[r], cmap));
    if (!t || isNaN(t.getTime()) || t.getTime() <= 0) return false;
    if (now.getTime() - t.getTime() < limitH * 3600 * 1000) return false;
    await updateCell(sheetName, r + 1, (colSt >= 0 ? colSt : 11) + 1, 'Hủy');
    if (colNote > -1) {
      const prev = String(data[r][colNote] || '');
      const tag = `[AUTO_HUY_CK_QUA_HAN ${now.toLocaleString('vi-VN')}]`;
      await updateCell(sheetName, r + 1, colNote + 1, prev ? `${prev} ${tag}` : tag);
    }
    return true;
  }
  return false;
}

export { parseOrderDate, safeJsonParse, normalizeVnPhoneDigits, formatDateTz };

import CACHE from '../cache.js';
import {
  getSheet,
  getDataRange,
  appendRow,
  updateRow,
} from '../googleSheets.js';
import { CUSTOMERS_HEADERS } from '../sheetsMap.js';
import { safeNum, normalizeVnPhoneDigits, parseOrderDate } from '../format.js';
import {
  getOrdersSheet,
  ordersColumnMap,
  ordersCell,
  ordersTimeRaw,
  ordersCompletedStatus,
} from './helpers.js';

async function getCustomersFromSheetOnly() {
  await getSheet('Customers', CUSTOMERS_HEADERS);
  const rows = await getDataRange('Customers');
  if (rows.length < 2) return [];
  return rows
    .slice(1)
    .map((r) => ({
      phone: String(r[0] || '').trim(),
      name: String(r[1] || ''),
      cups: safeNum(r[2]),
      points: safeNum(r[2]),
      totalSpent: safeNum(r[3]),
      visitCount: safeNum(r[4]),
      firstVisit: r[5],
      lastVisit: r[6],
      tier: String(r[7] || ''),
      note: String(r[8] || ''),
    }))
    .filter((c) => c.phone);
}

async function aggregateCustomersFromOrders() {
  try {
    const sheetName = await getOrdersSheet();
    const data = await getDataRange(sheetName);
    if (data.length < 2) return [];
    const cmap = ordersColumnMap(data[0]);
    const colPhone = cmap['SĐT'] ?? 3;
    const colName = cmap['Tên KH'] ?? 2;
    const colStatus = cmap['Trạng thái'] ?? 11;
    const colFinal = cmap['Thanh toán'] ?? 8;
    const colTime = cmap['Thời gian'] ?? 1;
    const acc = {};
    for (let j = 1; j < data.length; j++) {
      const row = data[j];
      const phone = normalizeVnPhoneDigits(row[colPhone]);
      if (!phone || phone.length < 9) continue;
      const st = String(row[colStatus] || '').trim();
      if (st.indexOf('Hủy') >= 0) continue;
      const nm = String(row[colName] || '').trim() || 'Khách lẻ';
      const t = parseOrderDate(row[colTime]);
      const amt = parseFloat(String(row[colFinal] || '').replace(/,/g, '')) || 0;
      if (!acc[phone]) {
        acc[phone] = {
          phone,
          name: nm,
          visitCount: 0,
          totalSpent: 0,
          lastVisit: null,
          firstVisit: null,
          completedCount: 0,
          cupsBought: 0,
        };
      }
      acc[phone].visitCount += 1;
      if (ordersCompletedStatus(st)) {
        acc[phone].completedCount += 1;
        acc[phone].totalSpent += amt;
        try {
          const rawItems = cmap['Các món'] !== undefined ? row[cmap['Các món']] : row[5];
          let items = [];
          if (Array.isArray(rawItems)) items = rawItems;
          else if (typeof rawItems === 'string' && rawItems) items = JSON.parse(rawItems);
          if (Array.isArray(items)) {
            for (const it of items) {
              acc[phone].cupsBought += parseInt(it?.quantity, 10) || 1;
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (t && !isNaN(t.getTime())) {
        if (!acc[phone].lastVisit || t.getTime() > new Date(acc[phone].lastVisit).getTime())
          acc[phone].lastVisit = t;
        if (!acc[phone].firstVisit || t.getTime() < new Date(acc[phone].firstVisit).getTime())
          acc[phone].firstVisit = t;
      }
      if (nm && nm !== 'Khách lẻ') acc[phone].name = nm;
    }
    return Object.values(acc).map((c) => {
      const cc = c.completedCount || 0;
      const tier = cc >= 50 ? 'Vàng' : cc >= 20 ? 'Bạc' : 'Thành viên';
      return {
        phone: c.phone,
        name: c.name,
        cups: c.cupsBought || 0,
        points: c.cupsBought || 0,
        totalSpent: c.totalSpent,
        visitCount: c.visitCount,
        firstVisit: c.firstVisit,
        lastVisit: c.lastVisit,
        tier,
        note: c.completedCount < c.visitCount ? '(có đơn chưa hoàn tất)' : '',
      };
    });
  } catch {
    return [];
  }
}

export async function getCustomers(skipCache) {
  if (!skipCache) {
    const cached = CACHE.get('customers_v1');
    if (cached) return cached;
  }
  const sheetList = await getCustomersFromSheetOnly();
  const fromOrders = await aggregateCustomersFromOrders();
  const byPhone = {};
  sheetList.forEach((c) => {
    const p = normalizeVnPhoneDigits(c.phone);
    if (p) byPhone[p] = { ...c, phone: p };
  });
  fromOrders.forEach((c) => {
    const p = c.phone;
    if (!byPhone[p]) {
      byPhone[p] = c;
    } else {
      const a = byPhone[p];
      if ((parseFloat(a.totalSpent) || 0) < (parseFloat(c.totalSpent) || 0)) a.totalSpent = c.totalSpent;
      if ((parseInt(a.visitCount, 10) || 0) < (parseInt(c.visitCount, 10) || 0))
        a.visitCount = c.visitCount;
      if (c.lastVisit && (!a.lastVisit || new Date(c.lastVisit).getTime() > new Date(a.lastVisit).getTime()))
        a.lastVisit = c.lastVisit;
      if (
        (!a.firstVisit && c.firstVisit) ||
        (c.firstVisit && a.firstVisit && new Date(c.firstVisit).getTime() < new Date(a.firstVisit).getTime())
      )
        a.firstVisit = c.firstVisit;
      if ((parseInt(a.cups, 10) || 0) < (parseInt(c.cups, 10) || 0)) {
        a.cups = c.cups;
        a.points = c.points;
      }
      if ((a.name === 'Khách hàng' || a.name === 'Khách lẻ') && c.name && c.name !== 'Khách lẻ')
        a.name = c.name;
      if (c.note && !a.note) a.note = c.note;
    }
  });
  const out = Object.values(byPhone).sort((a, b) => {
    const ta = a.lastVisit ? new Date(a.lastVisit).getTime() : 0;
    const tb = b.lastVisit ? new Date(b.lastVisit).getTime() : 0;
    return tb - ta;
  });
  CACHE.set('customers_v1', out, 120);
  return out;
}

export async function getCustomerByPhone(phone) {
  const want = normalizeVnPhoneDigits(phone);
  if (!want || want.length < 9) return null;
  const customers = await getCustomers();
  return customers.find((c) => normalizeVnPhoneDigits(c.phone) === want) || null;
}

export async function lookupCustomer(phone) {
  const customer = await getCustomerByPhone(String(phone).trim());
  if (customer) {
    return {
      found: true,
      name: customer.name,
      phone: customer.phone,
      points: customer.cups || customer.points || 0,
      totalSpent: customer.totalSpent || 0,
      tier: customer.tier || 'Thành viên',
      visitCount: customer.visitCount || 0,
      vouchers: [],
    };
  }
  return { found: false };
}

export async function saveCustomer(data) {
  await getSheet('Customers', CUSTOMERS_HEADERS);
  const phone = normalizeVnPhoneDigits(data.phone);
  if (phone.length < 9) {
    return { ok: false, message: 'Số điện thoại không hợp lệ (cần ít nhất 9 chữ số)' };
  }
  const existing = await getDataRange('Customers');
  for (let i = 1; i < existing.length; i++) {
    if (normalizeVnPhoneDigits(existing[i][0]) === phone) {
      const row9 = existing[i].slice(0, 9);
      while (row9.length < 9) row9.push('');
      row9[1] = data.name != null && String(data.name).trim() !== '' ? String(data.name).trim() : row9[1];
      row9[8] = data.note != null ? String(data.note) : row9[8];
      await updateRow('Customers', i + 1, row9);
      CACHE.clear('customers_v1');
      return { ok: true, message: 'Đã cập nhật khách hàng!' };
    }
  }
  await appendRow('Customers', [
    phone,
    data.name && String(data.name).trim() ? String(data.name).trim() : 'Khách hàng',
    0,
    0,
    0,
    new Date(),
    new Date(),
    'Thành viên',
    data.note != null ? String(data.note) : '',
  ]);
  CACHE.clear('customers_v1');
  return { ok: true, message: 'Đã thêm khách hàng mới!' };
}

export async function ensureCustomerForPos(phone, name) {
  const p = normalizeVnPhoneDigits(phone);
  if (p.length < 9) return { ok: false, message: 'SĐT không hợp lệ' };
  const existedBefore = !!(await getCustomerByPhone(p));
  const nm = String(name || '').trim();
  if (!existedBefore) {
    await saveCustomer({ phone: p, name: nm || 'Khách mới' });
  } else if (nm) {
    await saveCustomer({ phone: p, name: nm });
  }
  return { ok: true, isNew: !existedBefore };
}

export async function addLoyaltyPoints(phone, cups, amount) {
  await getSheet('Customers', CUSTOMERS_HEADERS);
  const want = normalizeVnPhoneDigits(phone);
  if (!want || want.length < 9) return;
  const cupsAdd = Math.max(0, parseInt(cups, 10) || 0);
  const amtAdd = parseFloat(amount) || 0;
  if (cupsAdd <= 0 && amtAdd <= 0) return;

  const data = await getDataRange('Customers');
  for (let i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits(data[i][0]) === want) {
      const newCups = (parseInt(data[i][2], 10) || 0) + cupsAdd;
      const newSpent = (parseFloat(data[i][3]) || 0) + amtAdd;
      const newVisits = (parseInt(data[i][4], 10) || 0) + 1;
      const tier = newCups >= 50 ? 'Vàng' : newCups >= 20 ? 'Bạc' : 'Thành viên';
      let firstVisit = data[i][5];
      if (!firstVisit || firstVisit === '') firstVisit = new Date();
      await updateRow('Customers', i + 1, [
        data[i][0],
        data[i][1],
        newCups,
        newSpent,
        newVisits,
        firstVisit,
        new Date(),
        tier,
        data[i][8] || '',
      ]);
      CACHE.clear('customers_v1');
      return;
    }
  }
  const tier0 = cupsAdd >= 50 ? 'Vàng' : cupsAdd >= 20 ? 'Bạc' : 'Thành viên';
  await appendRow('Customers', [want, 'Khách hàng', cupsAdd, amtAdd, 1, new Date(), new Date(), tier0, '']);
  CACHE.clear('customers_v1');
}

export async function redeemPoints(phone, cupsToRedeem) {
  await getSheet('Customers', CUSTOMERS_HEADERS);
  const want = normalizeVnPhoneDigits(phone);
  if (!want || want.length < 9) return { success: false, message: 'SĐT không hợp lệ' };
  const data = await getDataRange('Customers');
  for (let i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits(data[i][0]) === want) {
      if (data[i][2] < cupsToRedeem) return { success: false, message: 'Không đủ ly tích luỹ!' };
      await updateRow('Customers', i + 1, [
        data[i][0],
        data[i][1],
        Math.max(0, data[i][2] - cupsToRedeem),
        data[i][3],
        data[i][4],
        data[i][5],
        data[i][6],
        data[i][7],
        data[i][8],
      ]);
      return { success: true, message: `Đã đổi ${cupsToRedeem} ly = 1 ly miễn phí` };
    }
  }
  return { success: false, message: 'Không tìm thấy khách hàng' };
}

function cupCountFromOrderItems(items) {
  if (!items?.length) return 0;
  return items.reduce((n, it) => n + (parseInt(it?.quantity, 10) || 1), 0);
}

export async function getOrdersByPhone(phone, maxRows) {
  const p = normalizeVnPhoneDigits(phone);
  if (!p || p.length < 9) return [];
  const { mapOrderRow } = await import('./orders.js');
  const sheetName = await getOrdersSheet();
  const data = await getDataRange(sheetName);
  if (data.length < 2) return [];
  const cmap = ordersColumnMap(data[0]);
  const lim = maxRows ? parseInt(maxRows, 10) : 200;
  const out = [];
  for (let i = data.length - 1; i >= 1 && out.length < lim; i--) {
    const ph = normalizeVnPhoneDigits(ordersCell(data[i], cmap, 'SĐT', 3));
    if (ph !== p) continue;
    out.push(await mapOrderRow(data[i], cmap));
  }
  return out;
}

export async function getPosCustomerInsight(phone) {
  const p = normalizeVnPhoneDigits(phone);
  if (!p || p.length < 9) return { ok: false, message: 'SĐT không hợp lệ' };
  const cust = await getCustomerByPhone(p);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const day = now.getDay() || 7;
  const startWeek = new Date(now);
  startWeek.setHours(0, 0, 0, 0);
  startWeek.setDate(startWeek.getDate() - (day - 1));
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const orders = await getOrdersByPhone(p, 500);
  let revToday = 0,
    cupsToday = 0,
    revWeek = 0,
    cupsWeek = 0,
    revMonth = 0,
    cupsMonth = 0;
  let completedCount = 0;
  for (const o of orders) {
    if (!ordersCompletedStatus(o.status)) continue;
    completedCount++;
    const t = new Date(o.time);
    if (isNaN(t.getTime())) continue;
    const amt = parseFloat(o.finalAmount) || 0;
    const cups = cupCountFromOrderItems(o.items);
    if (t.getTime() >= startToday.getTime()) {
      revToday += amt;
      cupsToday += cups;
    }
    if (t.getTime() >= startWeek.getTime()) {
      revWeek += amt;
      cupsWeek += cups;
    }
    if (t.getTime() >= startMonth.getTime()) {
      revMonth += amt;
      cupsMonth += cups;
    }
  }
  return {
    ok: true,
    found: !!cust,
    isReturningBuyer: completedCount > 0,
    phoneDigits: p,
    name: cust ? String(cust.name || '') : '',
    points: cust ? parseFloat(cust.cups || cust.points) || 0 : 0,
    totalSpent: cust ? parseFloat(cust.totalSpent) || 0 : 0,
    tier: cust ? String(cust.tier || 'Thành viên') : 'Thành viên',
    visitCount: cust ? parseInt(cust.visitCount, 10) || 0 : 0,
    completedOrders: completedCount,
    revenueToday: revToday,
    cupsToday,
    revenueWeek: revWeek,
    cupsWeek,
    revenueMonth: revMonth,
    cupsMonth,
  };
}

export async function getPosCustomerBasic(phoneOrCode) {
  try {
    const { resolveCustomerIdentifier } = await import('./members.js');
    const r = await resolveCustomerIdentifier(phoneOrCode);
    if (!r?.ok) return { ok: false, message: r?.message || 'Không tra cứu được' };
    return {
      ok: true,
      found: true,
      phoneDigits: r.phone,
      memberCode: r.memberCode || '',
      name: String(r.name || '').trim(),
      points: parseFloat(r.points) || 0,
      tier: String(r.tier || 'Thành viên'),
    };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
}

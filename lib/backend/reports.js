import CACHE from '../cache.js';
import { getProperty } from '../properties.js';
import { getMenu } from './menu.js';
import { getOrders, mapOrderRow } from './orders.js';
import { getStockReportAdvanced } from './stock.js';
import {
  getOrdersSheet,
  ordersColumnMap,
  ordersCell,
  ordersTimeRaw,
  ordersCompletedStatus,
  parseOrderDate,
} from './helpers.js';
import { getDataRange } from '../googleSheets.js';
import { fmtVnd } from '../format.js';

export async function getDashboardData(periodRaw) {
  const period = String(periodRaw || 'today').trim().toLowerCase();
  const cacheKey = `dashboard_${period}`;
  const emptyDash = {
    period,
    todayRevenue: 0,
    yesterdayRevenue: 0,
    todayOrders: 0,
    yesterdayOrders: 0,
    monthRevenue: 0,
    monthOrders: 0,
    periodRevenue: 0,
    periodOrders: 0,
    prevPeriodRevenue: 0,
    revenueChange: 0,
    topItems: [],
    preferences: {
      sweet: 0,
      lessSweet: 0,
      fullFat: 0,
      lessFat: 0,
      withIce: 0,
      noIce: 0,
      withMilk: 0,
      noMilk: 0,
    },
    recentOrders: [],
  };
  try {
    const cached = CACHE.get(cacheKey);
    if (cached && typeof cached.periodRevenue === 'number') return cached;

    const sheetName = await getOrdersSheet();
    const allData = await getDataRange(sheetName);
    if (allData.length < 2) return emptyDash;

    const cmap = ordersColumnMap(allData[0]);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startYesterday = new Date(startToday.getTime() - 86400000);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const dayOfWeek = startToday.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startWeek = new Date(startToday.getTime() - mondayOffset * 86400000);

    let periodStart = startToday;
    let periodEnd = new Date(startToday.getTime() + 86400000);
    let prevStart = startYesterday;
    let prevEnd = startToday;
    if (period === 'week') {
      periodStart = startWeek;
      periodEnd = new Date(startWeek.getTime() + 7 * 86400000);
      prevStart = new Date(startWeek.getTime() - 7 * 86400000);
      prevEnd = startWeek;
    } else if (period === 'month') {
      periodStart = startMonth;
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = startMonth;
    }

    let todayRev = 0,
      yestRev = 0,
      monthRev = 0;
    let todayOrdCount = 0,
      yestOrdCount = 0,
      monthOrdCount = 0;
    let periodRev = 0,
      periodOrdCount = 0,
      prevPeriodRev = 0;
    const itemCount = {};
    const prefs = { ...emptyDash.preferences };
    const recentOrders = [];

    function bumpPrefsFromItem(i) {
      const opt = i?.options || {};
      const sw = String(opt.sweetness || i.sweetness || '');
      if (sw.indexOf('Nhiều') >= 0 || sw.indexOf('nhiều') >= 0) prefs.sweet++;
      else prefs.lessSweet++;
      const ice = String(opt.ice || i.ice || '');
      if (ice && ice.indexOf('Không') !== 0 && ice !== '') prefs.withIce++;
      else prefs.noIce++;
    }

    function inRange(t, start, end) {
      return t >= start && t < end;
    }

    for (const r of allData.slice(1)) {
      const t = parseOrderDate(ordersTimeRaw(r, cmap));
      if (!t || isNaN(t.getTime()) || t.getTime() === 0) continue;
      const stRow = String(ordersCell(r, cmap, 'Trạng thái', 11) || '').trim();
      const completed = ordersCompletedStatus(stRow);
      const amt = parseFloat(ordersCell(r, cmap, 'Thanh toán', 8)) || 0;
      if (t >= startMonth && completed) {
        monthRev += amt;
        monthOrdCount++;
      }
      if (t >= startToday && completed) {
        todayRev += amt;
        todayOrdCount++;
      } else if (t >= startYesterday && t < startToday && completed) {
        yestRev += amt;
        yestOrdCount++;
      }

      if (completed && inRange(t, periodStart, periodEnd)) {
        periodRev += amt;
        periodOrdCount++;
      } else if (completed && inRange(t, prevStart, prevEnd)) {
        prevPeriodRev += amt;
      }

      if (inRange(t, periodStart, periodEnd)) {
        let items = [];
        try {
          const raw = ordersCell(r, cmap, 'Các món', 5);
          items =
            typeof raw === 'string' && raw ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
        } catch {
          items = [];
        }
        if (completed) {
          items.forEach((i) => {
            if (!i) return;
            const nm = i.name || i.productName || '';
            if (nm) itemCount[nm] = (itemCount[nm] || 0) + (i.quantity || 1);
            bumpPrefsFromItem(i);
          });
        }
        if (stRow.indexOf('Hủy') === -1) {
          const parsedTr = parseOrderDate(ordersTimeRaw(r, cmap));
          const timeRecent = parsedTr.getTime() !== 0 ? parsedTr.getTime() : ordersTimeRaw(r, cmap);
          recentOrders.push({
            orderId: String(ordersCell(r, cmap, 'Mã ĐH', 0) || ''),
            time: timeRecent,
            customerName: String(ordersCell(r, cmap, 'Tên KH', 2) || ''),
            finalAmount: amt,
            paymentMethod: String(ordersCell(r, cmap, 'Phương thức TT', 9) || ''),
            status: stRow,
            items: items.map((it) => ({
              name: it.name || '',
              quantity: it.quantity || 1,
              totalPrice: parseFloat(it.totalPrice) || 0,
              costPrice: parseFloat(it.costPrice) || 0,
            })),
          });
        }
      }
    }

    const topItems = Object.keys(itemCount)
      .map((k) => ({ name: k, count: itemCount[k] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    let change = 0;
    if (period === 'today') {
      change = yestRev > 0 ? (((todayRev - yestRev) / yestRev) * 100).toFixed(1) : 0;
    } else {
      change =
        prevPeriodRev > 0
          ? (((periodRev - prevPeriodRev) / prevPeriodRev) * 100).toFixed(1)
          : 0;
    }

    const result = {
      period,
      todayRevenue: todayRev,
      yesterdayRevenue: yestRev,
      monthRevenue: monthRev,
      todayOrders: todayOrdCount,
      yesterdayOrders: yestOrdCount,
      monthOrders: monthOrdCount,
      periodRevenue: periodRev,
      periodOrders: periodOrdCount,
      prevPeriodRevenue: prevPeriodRev,
      revenueChange: change,
      topItems,
      preferences: prefs,
      recentOrders: recentOrders.slice(-10).reverse(),
    };
    CACHE.set(cacheKey, result, period === 'today' ? 15 : 45);
    return result;
  } catch {
    return emptyDash;
  }
}

export async function getCashFlowReport(periodType) {
  const cacheKey = `cashflow_${periodType}`;
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;

  const now = new Date();
  let startDate = new Date(2000, 0, 1);
  if (periodType === 'today') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (periodType === 'week') {
    const d = now.getDay() || 7;
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (d - 1));
  } else if (periodType === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);

  const { getStockTransactionLog } = await import('./stock.js');
  const stockTx = (await getStockTransactionLog(null, null)).filter(
    (tx) => tx.type === 'Phiếu Nhập' && new Date(tx.time) >= startDate,
  );
  const orders = await getOrders(periodType);
  const ordersDone = orders.filter((o) => ordersCompletedStatus(o.status));
  const revenue = ordersDone.reduce((s, o) => s + (o.finalAmount || 0), 0);
  const stockCost = stockTx.reduce((s, tx) => s + (tx.total || 0), 0);

  const dailyMap = {};
  ordersDone.forEach((o) => {
    const day = new Date(o.time).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    if (!dailyMap[day]) dailyMap[day] = { revenue: 0, orders: 0, cost: 0 };
    dailyMap[day].revenue += o.finalAmount || 0;
    dailyMap[day].orders++;
  });

  const result = {
    revenue,
    stockCost,
    grossProfit: revenue - stockCost,
    orderCount: ordersDone.length,
    avgOrder: ordersDone.length > 0 ? Math.round(revenue / ordersDone.length) : 0,
    dailyData: Object.entries(dailyMap).map(([date, d]) => ({ date, ...d })),
  };
  CACHE.set(cacheKey, result, 15);
  return result;
}

export async function getShiftData() {
  const openCash = parseFloat(await getProperty('SHIFT_CASH')) || 0;
  const openBank = parseFloat(await getProperty('SHIFT_BANK')) || 0;
  const cashExpenses = parseFloat(await getProperty('SHIFT_EXPENSE')) || 0;
  const todayOrders = (await getOrders('today')).filter((o) => ordersCompletedStatus(o.status));
  let cashSales = 0,
    bankSales = 0;
  todayOrders.forEach((o) => {
    if (o.paymentMethod === 'Tiền mặt') cashSales += o.finalAmount;
    else bankSales += o.finalAmount;
  });
  return { openCash, openBank, cashSales, bankSales, cashExpenses };
}

export async function getSuppliers() {
  const { getSheet, getDataRange } = await import('../googleSheets.js');
  const headers = ['Mã NCC', 'Tên', 'SĐT', 'Email', 'Địa chỉ', 'Ghi chú', 'Zalo'];
  await getSheet('Suppliers', headers);
  const rows = await getDataRange('Suppliers');
  return rows.slice(1).map((r, idx) => ({
    sheetRow: idx + 2,
    code: String(r[0] || ''),
    name: String(r[1] || ''),
    phone: String(r[2] || ''),
    email: String(r[3] || ''),
    address: String(r[4] || ''),
    note: String(r[5] || ''),
    zalo: String(r[6] || ''),
  }));
}

export async function saveSupplier(data) {
  const { getSheet, appendRow } = await import('../googleSheets.js');
  const headers = ['Mã NCC', 'Tên', 'SĐT', 'Email', 'Địa chỉ', 'Ghi chú', 'Zalo'];
  await getSheet('Suppliers', headers);
  await appendRow('Suppliers', [
    data.code,
    data.name,
    data.phone || '',
    data.email || '',
    data.address || '',
    data.note || '',
    data.zalo || '',
  ]);
  return 'Đã thêm nhà cung cấp!';
}

export async function updateSupplier(data) {
  const { updateRow } = await import('../googleSheets.js');
  const row = parseInt(data.sheetRow, 10);
  if (isNaN(row) || row < 2) throw new Error('Dòng không hợp lệ');
  await updateRow('Suppliers', row, [
    data.code,
    data.name,
    data.phone || '',
    data.email || '',
    data.address || '',
    data.note || '',
    data.zalo || '',
  ]);
  return 'Đã cập nhật!';
}

export async function getPartners() {
  const { getSheet, getDataRange } = await import('../googleSheets.js');
  const headers = ['Tên', 'Vốn góp', 'Tỷ lệ %', 'Ngày góp', 'Ghi chú'];
  await getSheet('Partners', headers);
  const rows = await getDataRange('Partners');
  return rows.slice(1).map((r, idx) => ({
    sheetRow: idx + 2,
    name: String(r[0] || ''),
    capital: parseFloat(r[1]) || 0,
    sharePct: parseFloat(r[2]) || 0,
    date: r[3],
    note: String(r[4] || ''),
  }));
}

export async function savePartner(data) {
  const { getSheet, appendRow } = await import('../googleSheets.js');
  const headers = ['Tên', 'Vốn góp', 'Tỷ lệ %', 'Ngày góp', 'Ghi chú'];
  await getSheet('Partners', headers);
  await appendRow('Partners', [
    data.name,
    data.capital || 0,
    data.sharePct || 0,
    data.date ? new Date(data.date) : new Date(),
    data.note || '',
  ]);
  return 'Đã lưu đối tác!';
}

export async function deletePartnerByRow(rowIndex) {
  const { deleteRow } = await import('../googleSheets.js');
  const ri = parseInt(rowIndex, 10) + 2;
  await deleteRow('Partners', ri);
  return 'Đã xóa!';
}

export async function saveOperatingCost(data) {
  const { getSheet, appendRow } = await import('../googleSheets.js');
  const headers = ['Ngày', 'Loại', 'Mô tả', 'Số tiền', 'Ghi chú'];
  await getSheet('OperatingCosts', headers);
  await appendRow('OperatingCosts', [
    data.date ? new Date(data.date) : new Date(),
    data.type || 'KHAC',
    data.desc || '',
    parseFloat(data.amount) || 0,
    data.note || '',
  ]);
  return 'Đã lưu chi phí!';
}

export async function getFixedAssets() {
  const { getSheet, getDataRange } = await import('../googleSheets.js');
  const headers = ['Tên TS', 'Ngày mua', 'Giá mua', 'Khấu hao/năm', 'Ghi chú'];
  await getSheet('FixedAssets', headers);
  const rows = await getDataRange('FixedAssets');
  return rows.slice(1).map((r, idx) => ({
    sheetRow: idx + 2,
    name: String(r[0] || ''),
    purchaseDate: r[1],
    purchasePrice: parseFloat(r[2]) || 0,
    depreciationPerYear: parseFloat(r[3]) || 0,
    note: String(r[4] || ''),
  }));
}

export async function saveFixedAsset(data) {
  const { getSheet, appendRow } = await import('../googleSheets.js');
  const headers = ['Tên TS', 'Ngày mua', 'Giá mua', 'Khấu hao/năm', 'Ghi chú'];
  await getSheet('FixedAssets', headers);
  await appendRow('FixedAssets', [
    data.name,
    data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
    parseFloat(data.purchasePrice) || 0,
    parseFloat(data.depreciationPerYear) || 0,
    data.note || '',
  ]);
  return 'Đã lưu tài sản!';
}

export async function updateFixedAsset(data) {
  const { updateRow } = await import('../googleSheets.js');
  const row = parseInt(data.sheetRow, 10);
  if (isNaN(row) || row < 2) throw new Error('Dòng không hợp lệ');
  await updateRow('FixedAssets', row, [
    data.name,
    data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
    parseFloat(data.purchasePrice) || 0,
    parseFloat(data.depreciationPerYear) || 0,
    data.note || '',
  ]);
  return 'Đã cập nhật!';
}

export async function deleteFixedAssetByRow(rowIndex) {
  const { deleteRow } = await import('../googleSheets.js');
  await deleteRow('FixedAssets', parseInt(rowIndex, 10) + 2);
  return 'Đã xóa!';
}

export async function getCapitalReport(year, month) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  const m = parseInt(month, 10) || new Date().getMonth() + 1;
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59);
  const orders = await getOrders('month');
  const revenue = orders
    .filter((o) => {
      const t = new Date(o.time);
      return ordersCompletedStatus(o.status) && t >= start && t <= end;
    })
    .reduce((s, o) => s + (o.finalAmount || 0), 0);
  const stockAll = await getStockReportAdvanced('month', true);
  const stockValue = stockAll.reduce((s, x) => s + (parseFloat(x.closing) || 0), 0);
  return {
    ok: true,
    year: y,
    month: m,
    revenue,
    stockValueEstimate: stockValue,
    note: 'Báo cáo vốn ước tính từ doanh thu tháng và tồn kho.',
  };
}

export async function getTaxDeclarationSupport(year, quarter) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  const q = parseInt(quarter, 10) || 1;
  const startMonth = (q - 1) * 3;
  const start = new Date(y, startMonth, 1);
  const end = new Date(y, startMonth + 3, 0, 23, 59, 59);
  const orders = await getOrders('all');
  let revenue = 0;
  let orderCount = 0;
  for (const o of orders) {
    const t = new Date(o.time);
    if (!ordersCompletedStatus(o.status) || t < start || t > end) continue;
    revenue += parseFloat(o.finalAmount) || 0;
    orderCount++;
  }
  return {
    ok: true,
    year: y,
    quarter: q,
    revenue,
    orderCount,
    vatNote: 'Tham khảo kê khai - đối chiếu sổ sách thực tế.',
    links: [
      { label: 'eTax (khai nộp)', url: 'https://etax.dientu.gdt.gov.vn/' },
      { label: 'Chính phủ - chính sách / hướng dẫn', url: 'https://www.chinhphu.vn/' },
    ],
  };
}

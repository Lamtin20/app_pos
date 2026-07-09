import CACHE from '../cache.js';
import { getSheet, getDataRange, appendRow } from '../googleSheets.js';
import { CONFIG_HEADERS, STOCK_LOG_HEADERS, COST_HISTORY_HEADERS } from '../sheetsMap.js';
import { safeNum, parseOrderDate } from '../format.js';
import { getMenu, saveMenuItem } from './menu.js';

export async function logStockTransaction(data) {
  const isImport = data.type === 'NHAP';
  const sheetName = isImport ? 'Log_NhapKho' : 'Log_XuatKho';
  await getSheet(sheetName, STOCK_LOG_HEADERS);
  let txTime = new Date();
  if (data?.transDate) {
    const s = String(data.transDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const p = s.split('-');
      txTime = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0, 0);
    } else {
      const pd = parseOrderDate(s);
      if (pd && !isNaN(pd.getTime()) && pd.getTime() !== 0) txTime = pd;
    }
  }
  await appendRow(sheetName, [
    txTime,
    isImport ? 'Phiếu Nhập' : 'Phiếu Xuất',
    data.name,
    data.qty,
    data.unitPrice || 0,
    data.qty * (data.unitPrice || 0),
    data.expiryDate || '',
    data.note || '',
  ]);
  CACHE.clear(['stock_month', 'stock_today', 'stock_week', 'cashflow_month', 'cashflow_today', 'cashflow_week']);
  return isImport ? 'Đã nhập kho thành công!' : 'Đã xuất kho thành công!';
}

export async function getStockReportAdvanced(periodType, skipCache) {
  const cacheKey = `stock_${periodType}`;
  if (!skipCache) {
    const cached = CACHE.get(cacheKey);
    if (cached) return cached;
  }

  await getSheet('Config', CONFIG_HEADERS);
  const configRows = await getDataRange('Config');
  if (configRows.length < 2) return [];

  const now = new Date();
  let startDate = new Date(2000, 0, 1);
  let endDate = new Date(2100, 0, 1);

  if (periodType === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (periodType === 'week') {
    const day = now.getDay() || 7;
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (day - 1));
    endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000 + 86399000);
  } else if (periodType === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  const stockDict = {};
  for (let ri = 1; ri < configRows.length; ri++) {
    const r = configRows[ri];
    if (r[2]) {
      stockDict[r[2]] = {
        name: r[2],
        unit: r[3] || '',
        opening: 0,
        inPeriod: 0,
        outPeriod: 0,
        closing: 0,
        transactions: [],
      };
    }
  }

  async function processSheet(shName, isIn) {
    const rows = await getDataRange(shName);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const transDate = parseOrderDate(r[0]);
      if (!transDate || isNaN(transDate.getTime()) || transDate.getTime() === 0) continue;
      const itemName = r[2];
      const qty = parseFloat(r[3] || 0);
      if (!itemName) continue;
      if (!stockDict[itemName]) {
        stockDict[itemName] = {
          name: itemName,
          unit: '',
          opening: 0,
          inPeriod: 0,
          outPeriod: 0,
          closing: 0,
          transactions: [],
        };
      }
      if (transDate < startDate) {
        stockDict[itemName].opening += isIn ? qty : -qty;
      } else if (transDate >= startDate && transDate <= endDate) {
        if (isIn) stockDict[itemName].inPeriod += qty;
        else stockDict[itemName].outPeriod += qty;
        stockDict[itemName].transactions.push({
          time: r[0],
          type: isIn ? 'Nhập' : 'Xuất',
          qty,
          expiryDate: r[6] || '',
          note: r[7] || '',
        });
      }
    }
  }

  await getSheet('Log_NhapKho', STOCK_LOG_HEADERS);
  await getSheet('Log_XuatKho', STOCK_LOG_HEADERS);
  await processSheet('Log_NhapKho', true);
  await processSheet('Log_XuatKho', false);

  const result = Object.values(stockDict).map((item) => {
    item.closing = item.opening + item.inPeriod - item.outPeriod;
    return item;
  });

  CACHE.set(cacheKey, result, periodType === 'all' ? 60 : 30);
  return result;
}

export async function getStockTransactionLog(itemName, limit) {
  await getSheet('Log_NhapKho', STOCK_LOG_HEADERS);
  await getSheet('Log_XuatKho', STOCK_LOG_HEADERS);
  let allTx = [];
  for (const shName of ['Log_NhapKho', 'Log_XuatKho']) {
    const data = await getDataRange(shName);
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (!itemName || r[2] === itemName) {
        allTx.push({
          time: r[0],
          type: r[1],
          name: r[2],
          qty: r[3],
          unitPrice: r[4],
          total: r[5],
          expiryDate: r[6] || '',
          note: r[7] || '',
        });
      }
    }
  }
  allTx.sort((a, b) => new Date(b.time) - new Date(a.time));
  return limit ? allTx.slice(0, limit) : allTx;
}

export async function getStockLedgerRange(itemName, startIso, endIso) {
  const dStart = startIso ? new Date(startIso) : new Date(Date.now() - 30 * 86400000);
  if (startIso) dStart.setHours(0, 0, 0, 0);
  const dEnd = endIso ? new Date(endIso) : new Date();
  if (endIso) dEnd.setHours(23, 59, 59, 999);
  const t0 = dStart.getTime();
  const t1 = dEnd.getTime();
  const all = await getStockTransactionLog(itemName, null);
  const transactions = all.filter((tx) => {
    const tm = new Date(tx.time).getTime();
    return !isNaN(tm) && tm >= t0 && tm <= t1;
  });
  const dailyMap = {};
  transactions.forEach((tx) => {
    const dk = new Date(tx.time).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    if (!dailyMap[dk]) dailyMap[dk] = { date: dk, inQty: 0, outQty: 0 };
    const q = parseFloat(tx.qty) || 0;
    if (String(tx.type || '').indexOf('Nhập') >= 0) dailyMap[dk].inQty += q;
    else dailyMap[dk].outQty += q;
  });
  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  return { itemName: itemName || '', transactions, daily };
}

export async function saveRecipe(data) {
  await getSheet('LichSu_GiaVon', COST_HISTORY_HEADERS);
  const sizeExtra = data.sizeRecipeDetails || [];
  let cogsStd =
    data.cogsStandard != null && data.cogsStandard !== ''
      ? parseFloat(data.cogsStandard)
      : parseFloat(data.cogs);
  let cogsLg =
    data.cogsLarge != null && data.cogsLarge !== '' ? parseFloat(data.cogsLarge) : cogsStd;
  if (isNaN(cogsStd)) cogsStd = 0;
  if (isNaN(cogsLg)) cogsLg = cogsStd;
  const sellStd = parseFloat(data.sellingPrice) || 0;
  const sellLg =
    data.sellingPriceLarge != null && data.sellingPriceLarge !== ''
      ? parseFloat(data.sellingPriceLarge)
      : NaN;
  const profitStd = sellStd - cogsStd;
  const marginStd = sellStd > 0 ? ((profitStd / sellStd) * 100).toFixed(1) : '0';
  const chiTiet = JSON.stringify({
    base: data.recipeDetails,
    sizeLarge: sizeExtra,
    cogsStandard: cogsStd,
    cogsLarge: cogsLg,
    sellingPriceLarge: !isNaN(sellLg) && sellLg > 0 ? sellLg : null,
  });
  await appendRow('LichSu_GiaVon', [
    new Date(),
    data.productName,
    cogsStd,
    data.opEx,
    sellStd,
    profitStd,
    `${marginStd}%`,
    chiTiet,
  ]);

  const menuData = await getDataRange('Menu');
  const menuHeaders = menuData[0] || [];
  const ixSz = menuHeaders.indexOf('Định mức size (JSON)');
  const ixLarge = menuHeaders.indexOf('Phụ thu ly lớn');
  let found = false;
  for (let i = 1; i < menuData.length; i++) {
    if (
      String(menuData[i][1]).trim().toLowerCase() ===
      String(data.productName).trim().toLowerCase()
    ) {
      const { updateCell } = await import('../googleSheets.js');
      await updateCell('Menu', i + 1, 4, sellStd);
      await updateCell('Menu', i + 1, 7, JSON.stringify(data.recipeDetails));
      await updateCell('Menu', i + 1, 11, cogsStd);
      await updateCell('Menu', i + 1, 12, data.opEx);
      if (!isNaN(sellLg) && sellLg > 0 && sellLg >= sellStd && ixLarge > -1) {
        await updateCell('Menu', i + 1, ixLarge + 1, Math.round(sellLg - sellStd));
      }
      if (ixSz > -1) {
        await updateCell('Menu', i + 1, ixSz + 1, JSON.stringify(sizeExtra));
      }
      found = true;
      break;
    }
  }
  if (!found) {
    const largeExtra =
      !isNaN(sellLg) && sellLg > 0 && sellLg >= sellStd ? Math.round(sellLg - sellStd) : 8000;
    await saveMenuItem({
      name: String(data.productName || '').trim(),
      category: 'Sữa đơn',
      basePrice: sellStd,
      ingredients: data.recipeDetails || [],
      costPrice: cogsStd,
      opEx: data.opEx || 0,
      largeCupExtra: largeExtra,
      sizeRecipeExtra: sizeExtra,
      note: '[auto từ Tab Giá]',
    });
    found = true;
  }
  CACHE.clear('menu');
  return found
    ? 'Đã lưu công thức và cập nhật vào Menu!'
    : 'Đã lưu (nhưng không tìm thấy món trong Menu để cập nhật tự động)';
}

export async function getCostHistory() {
  await getSheet('LichSu_GiaVon', COST_HISTORY_HEADERS);
  const rows = await getDataRange('LichSu_GiaVon');
  return rows
    .slice(1)
    .map((r) => ({
      date: r[0],
      productName: String(r[1] || ''),
      cogs: safeNum(r[2]),
      opEx: safeNum(r[3]),
      sellingPrice: safeNum(r[4]),
      profit: safeNum(r[5]),
      margin: safeNum(r[6]),
      details: String(r[7] || ''),
    }))
    .filter((c) => c.productName);
}

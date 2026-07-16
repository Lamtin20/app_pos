import CACHE from '../cache.js';
import {
  getSheet,
  getDataRange,
  appendRow,
  appendRows,
  updateRow,
  updateCell,
  updateRange,
} from '../googleSheets.js';
import {
  ORDERS_HEADERS_STD,
  GROUP_ORDERS_HEADERS,
  GROUP_MAX_MEMBERS,
  GROUP_TTL_HOURS,
  STOCK_LOG_HEADERS,
  FEEDBACK_VOUCHER_HEADERS,
  FEEDBACK_VOUCHER_DAYS,
} from '../sheetsMap.js';
import { safeNum, normalizeVnPhoneDigits, parseOrderDate, roundDiscountToThousand, parseVnAmount } from '../format.js';
import {
  getOrdersSheet,
  ordersColumnMap,
  ordersCell,
  ordersTimeRaw,
  ordersHeaderPick,
  ordersCompletedStatus,
  orderStatusIsAwaitingBank,
  orderStatusIsCancelled,
  orderStatusCanConfirmFromBank,
  normalizeOrderIdForMatch,
  bankMemoMatchesOrder,
  bankTransferRowProcessed,
  getBankTransferSheet,
  bankSheetColOrderRef,
  safeSerializeOrderItems,
  cancelOrderIfExpired,
  withLock,
} from './helpers.js';
import { getInventory } from './inventory.js';
import { addLoyaltyPoints, redeemPoints, saveCustomer, pickCustomerNameForSave } from './customers.js';
import { applyPromoCode, markPersonalVoucherUsed, groupDiscountPct, feedbackRewardPct } from './promotions.js';

export async function mapOrderRow(r, cmap) {
  function c(name, fb) {
    return ordersCell(r, cmap, name, fb);
  }
  let items = [];
  try {
    const rawItems = c('Các món', 5);
    if (Array.isArray(rawItems)) items = rawItems;
    else if (typeof rawItems === 'string' && rawItems) items = JSON.parse(rawItems);
  } catch {
    items = [];
  }
  const rawTime = ordersTimeRaw(r, cmap);
  const parsedTime = parseOrderDate(rawTime);
  const timeForClient = parsedTime.getTime() !== 0 ? parsedTime.getTime() : rawTime;

  return {
    orderId: String(c('Mã ĐH', 0) || ''),
    time: timeForClient,
    customerName: String(c('Tên KH', 2) || ''),
    customerPhone: String(c('SĐT', 3) || ''),
    pointsUsed: safeNum(c('Điểm thành viên', 4)),
    items,
    totalAmount: safeNum(c('Tổng tiền', 6)),
    discount: safeNum(c('Giảm giá', 7)),
    finalAmount: safeNum(c('Thanh toán', 8)),
    paymentMethod: String(c('Phương thức TT', 9) || ''),
    note: String(c('Ghi chú', 10) || ''),
    status: String(c('Trạng thái', 11) || ''),
    promoCode: String(c('Mã KM', 12) || ''),
  };
}

export async function getOrders(periodType) {
  const sheetName = await getOrdersSheet();
  const data = await getDataRange(sheetName);
  if (data.length < 2) return [];
  const cmap = ordersColumnMap(data[0]);

  const now = new Date();
  let startDate = new Date(2000, 0, 1);
  let endYesterday = null;
  const modeAll = periodType === 'all' || periodType === 'ALL';

  if (!modeAll) {
    if (periodType === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    } else if (periodType === 'yesterday') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      endYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
    } else if (periodType === 'week') {
      const day = now.getDay() || 7;
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      startDate.setDate(startDate.getDate() - (day - 1));
    } else if (periodType === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    }
  }

  let rows = data
    .slice(1)
    .filter((r) => {
      if (modeAll) return true;
      const t = parseOrderDate(ordersTimeRaw(r, cmap));
      if (t.getTime() === 0) return false;
      if (periodType === 'yesterday' && endYesterday) {
        return t >= startDate && t <= endYesterday;
      }
      return t >= startDate;
    })
    .map((r) => mapOrderRow(r, cmap));

  rows = await Promise.all(rows);
  rows.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  if (modeAll && rows.length > 2000) return rows.slice(0, 2000);
  return rows;
}

async function processOrderCompletion(orderId, orderData) {
  let totalCups = 0;
  if (orderData.items?.length) {
    orderData.items.forEach((i) => {
      if (i.excludeFromLoyaltyPoints === true) return;
      let lineTotal = parseFloat(i.totalPrice);
      if (isNaN(lineTotal)) lineTotal = 0;
      if (lineTotal <= 0.5) return;
      totalCups += parseInt(i.quantity, 10) || 1;
    });
  }

  if (orderData.customerPhone) {
    await addLoyaltyPoints(orderData.customerPhone, totalCups, orderData.finalAmount);
    if (orderData.promoCode === 'FREECUP') await redeemPoints(orderData.customerPhone, 10);
    try {
      const { clearCompletedOrderCountCache } = await import('./promotions.js');
      clearCompletedOrderCountCache(orderData.customerPhone);
    } catch {
      /* optional */
    }
  }

  const stockLogs = [];
  const inventory = await getInventory();
  const invMap = {};
  inventory.forEach((i) => {
    invMap[i.name] = i;
  });

  if (orderData.items?.length) {
    for (const item of orderData.items) {
      if (item.ingredients && Array.isArray(item.ingredients)) {
        for (const ing of item.ingredients) {
          if (ing.name && ing.qty) {
            const cost = invMap[ing.name] ? invMap[ing.name].unitPrice : 0;
            stockLogs.push([
              new Date(),
              'Phiếu Xuất',
              ing.name,
              ing.qty * item.quantity,
              cost,
              ing.qty * item.quantity * cost,
              '',
              `Bán - ${orderId}`,
            ]);
          }
        }
      }
      let extras = item.extraNuts;
      if ((!extras || !extras.length) && item.options?.addons) extras = item.options.addons;
      if (extras && Array.isArray(extras)) {
        for (const nutName of extras) {
          const nutData = invMap[nutName];
          if (nutData?.mixQty) {
            const cost = nutData.unitPrice || 0;
            stockLogs.push([
              new Date(),
              'Phiếu Xuất',
              nutName,
              nutData.mixQty * item.quantity,
              cost,
              nutData.mixQty * item.quantity * cost,
              '',
              `Mix thêm - ${orderId}`,
            ]);
          }
        }
      }
    }
  }

  if (stockLogs.length > 0) {
    await getSheet('Log_XuatKho', STOCK_LOG_HEADERS);
    await appendRows('Log_XuatKho', stockLogs);
  }

  CACHE.clear([
    'dashboard',
    'cashflow_month',
    'cashflow_today',
    'cashflow_week',
    'stock_month',
    'stock_today',
    'stock_week',
  ]);
}

async function runOrderCompletionEffects(orderId, orderData, meta = {}) {
  await processOrderCompletion(orderId, orderData);
  try {
    const { recordOfficeStreakForCompletedOrder } = await import('./officeStreak.js');
    await recordOfficeStreakForCompletedOrder({
      items: orderData.items,
      customerPhone: orderData.customerPhone,
      note: meta.note || orderData.note || '',
      orderTime: meta.orderTime || new Date(),
    });
  } catch {
    /* streak optional */
  }
}

export async function saveOrder(orderData) {
  const orderId = `SUN${Date.now().toString().slice(-8)}`;
  const orderTime = new Date();
  const status = orderData.paymentMethod === 'Chuyển khoản' ? 'Chờ thanh toán' : 'Hoàn thành';
  const itemsSafe = safeSerializeOrderItems(orderData.items);
  let phoneCol = normalizeVnPhoneDigits(orderData.customerPhone);
  if (!phoneCol || phoneCol.length < 9) {
    phoneCol = String(orderData.customerPhone || '').replace(/\D/g, '');
  }

  const sheetName = await getOrdersSheet();
  await appendRow(sheetName, [
    orderId,
    orderTime,
    orderData.customerName || 'Khách lẻ',
    phoneCol || String(orderData.customerPhone || '').trim(),
    orderData.pointsUsed || 0,
    JSON.stringify(itemsSafe),
    orderData.totalAmount,
    orderData.discount || 0,
    orderData.finalAmount,
    orderData.paymentMethod || 'Tiền mặt',
    orderData.note || '',
    status,
    orderData.promoCode || '',
  ]);

  if (orderData.promoCode) await markPersonalVoucherUsed(orderData.promoCode, orderId);
  if (phoneCol && phoneCol.length >= 9) {
    const saveNm = pickCustomerNameForSave(orderData.customerName, '', '');
    if (saveNm) await saveCustomer({ phone: phoneCol, name: saveNm });
  }
  if (status === 'Hoàn thành') {
    try {
      await runOrderCompletionEffects(orderId, { ...orderData, items: itemsSafe }, { orderTime });
    } catch {
      /* log */
    }
  }
  CACHE.clear(['dashboard', 'cashflow_month', 'cashflow_today', 'cashflow_week']);
  return { orderId, message: 'Đã lưu đơn hàng!', status };
}

export async function savePickupOnlineOrder(orderData) {
  if (!orderData) throw new Error('Thiếu dữ liệu đơn');
  const { resolveCustomerIdentifier } = await import('./members.js');
  const resolved = await resolveCustomerIdentifier(orderData.customerPhone || orderData.memberCode || '');
  if (!resolved.ok) throw new Error(resolved.message || 'Không xác định được khách');
  const phoneCol = resolved.phone;
  const payMeth = String(orderData.paymentMethod || 'Thanh toán khi nhận').trim();
  const isTransfer = payMeth.indexOf('Chuyển') >= 0;
  const fulfillment = String(orderData.fulfillment || 'pickup').toLowerCase();
  const status = isTransfer ? 'Chờ thanh toán' : 'Chờ xác nhận';
  const orderId = `SUN${Date.now().toString().slice(-8)}`;
  const itemsSafe = safeSerializeOrderItems(orderData.items);
  let subtotal = parseFloat(orderData.totalAmount) || 0;
  if (!subtotal && itemsSafe.length) {
    subtotal = itemsSafe.reduce(
      (s, it) => s + (parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 1),
      0,
    );
  }
  let discount = parseFloat(orderData.discount) || 0;
  const promoCode = String(orderData.promoCode || '').trim().toUpperCase();
  if (promoCode && !orderData.lockDiscount) {
    const cartJson = JSON.stringify(
      itemsSafe.map((it) => ({
        id: it.id,
        quantity: parseInt(it.quantity, 10) || 1,
        qty: parseInt(it.quantity, 10) || 1,
        price: parseFloat(it.price) || 0,
      })),
    );
    const pv = await applyPromoCode(promoCode, subtotal, phoneCol, cartJson);
    if (pv?.ok) discount = parseFloat(pv.discount) || 0;
    else throw new Error(pv?.message || 'Mã khuyến mãi không hợp lệ');
  }
  const finalAmount = Math.max(0, subtotal - discount);
  const noteParts = ['[PICKUP][ONLINE]'];
  if (fulfillment.indexOf('deliver') >= 0 || fulfillment.indexOf('giao') >= 0) {
    noteParts.push(`Giao:${String(orderData.addressDetail || orderData.address || '').trim()}`);
    if (orderData.ward) noteParts.push(orderData.ward);
  } else {
    noteParts.push('Nhận tại quầy');
  }
  if (orderData.deliveryZone) noteParts.push(`KV:${orderData.deliveryZone}`);
  if (orderData.deliveryAt) noteParts.push(`GIAO_AT:${String(orderData.deliveryAt).trim()}`);
  if (orderData.note) noteParts.push(String(orderData.note).trim());
  const note = noteParts.join(' | ');

  const orderName = String(orderData.customerName || '').trim();
  const customerDisplayName = pickCustomerNameForSave(orderName, resolved.name, '') || orderName || resolved.name || 'Khách online';
  const ordersSheet = await getOrdersSheet();
  await appendRow(ordersSheet, [
    orderId,
    new Date(),
    customerDisplayName,
    phoneCol,
    orderData.pointsUsed || 0,
    JSON.stringify(itemsSafe),
    subtotal,
    discount,
    finalAmount,
    payMeth,
    note,
    status,
    promoCode || '',
  ]);
  const saveNm = pickCustomerNameForSave(orderName, resolved.name, '');
  if (saveNm) await saveCustomer({ phone: phoneCol, name: saveNm });
  if (promoCode) await markPersonalVoucherUsed(promoCode, orderId);
  CACHE.clear(['dashboard', 'cashflow_month', 'cashflow_today', 'cashflow_week']);
  return {
    ok: true,
    orderId,
    status,
    memberCode: resolved.memberCode,
    discount,
    finalAmount,
  };
}

export async function confirmOrderInOrdersSheet(orderId, opts = {}) {
  const fromBank = opts.fromBankMatch === true;
  const sheetName = await getOrdersSheet();
  const ordersData = await getDataRange(sheetName, { skipCache: true });
  const headers = ordersData[0];
  const colOrderId = ordersHeaderPick(headers, ['Mã ĐH', 'Mã đơn', 'Mã DH', 'Order ID'], 0);
  const colOrderStatus = ordersHeaderPick(headers, ['Trạng thái', 'Trạng thái đơn', 'Status'], 11);
  const colItems = ordersHeaderPick(headers, ['Các món', 'Chi tiết món', 'Items', 'Món'], 5);
  const colCustomerName = ordersHeaderPick(headers, ['Tên KH', 'Khách hàng', 'Tên khách'], 2);
  const colCustomerPhone = ordersHeaderPick(headers, ['SĐT', 'SDT', 'Điện thoại', 'Phone'], 3);
  const colPointsUsed = ordersHeaderPick(headers, ['Điểm thành viên', 'Điểm'], 4);
  const colTotalAmount = ordersHeaderPick(headers, ['Tổng tiền'], 6);
  const colDiscount = ordersHeaderPick(headers, ['Giảm giá'], 7);
  const colFinalAmount = ordersHeaderPick(headers, ['Thanh toán', 'Thực thu', 'Số tiền TT'], 8);
  const colPromoCode = ordersHeaderPick(headers, ['Mã KM', 'Mã khuyến mãi'], 12);
  const colNote = ordersHeaderPick(headers, ['Ghi chú', 'Note'], 10);
  const colOrderTime = ordersHeaderPick(headers, ['Thời gian', 'Ngày đặt', 'Order time'], 1);

  const oidWant = normalizeOrderIdForMatch(orderId);
  for (let j = 1; j < ordersData.length; j++) {
    const idCol = colOrderId >= 0 ? colOrderId : 0;
    const stCol = colOrderStatus >= 0 ? colOrderStatus : 11;
    const oidCell = normalizeOrderIdForMatch(ordersData[j][idCol]);
    const st = String(ordersData[j][stCol] || '').trim();
    const canConfirm = fromBank ? orderStatusCanConfirmFromBank(st) : orderStatusIsAwaitingBank(st);
    if (oidCell === oidWant && canConfirm) {
      await updateCell(sheetName, j + 1, stCol + 1, 'Hoàn thành');
      let itemsParsed = [];
      try {
        const rawIt = ordersData[j][colItems >= 0 ? colItems : 5];
        if (typeof rawIt === 'string') itemsParsed = JSON.parse(rawIt || '[]');
        else if (Array.isArray(rawIt)) itemsParsed = rawIt;
      } catch {
        itemsParsed = [];
      }
      await runOrderCompletionEffects(orderId, {
        customerName: ordersData[j][colCustomerName >= 0 ? colCustomerName : 2],
        customerPhone: ordersData[j][colCustomerPhone >= 0 ? colCustomerPhone : 3],
        items: itemsParsed,
        totalAmount: ordersData[j][colTotalAmount >= 0 ? colTotalAmount : 6],
        discount: ordersData[j][colDiscount >= 0 ? colDiscount : 7],
        finalAmount: ordersData[j][colFinalAmount >= 0 ? colFinalAmount : 8] || 0,
        promoCode: ordersData[j][colPromoCode >= 0 ? colPromoCode : 12],
        pointsUsed: ordersData[j][colPointsUsed >= 0 ? colPointsUsed : 4],
      }, {
        note: String(ordersData[j][colNote >= 0 ? colNote : 10] || ''),
        orderTime: ordersData[j][colOrderTime >= 0 ? colOrderTime : 1] || new Date(),
      });
      return true;
    }
  }
  return false;
}

export async function checkBankTransferPayment(orderId, expectedAmount) {
  const oidNorm = normalizeOrderIdForMatch(orderId);
  let exp = parseVnAmount(expectedAmount);

  const sheetName = await getOrdersSheet();
  const oData = await getDataRange(sheetName, { skipCache: true });
  let ordersFinal = 0;
  let ordersStatus = '';
  if (oData.length >= 2) {
    const oHeaders = oData[0];
    const cId = ordersHeaderPick(oHeaders, ['Mã ĐH', 'Mã đơn', 'Mã DH', 'Order ID'], 0);
    const cSt = ordersHeaderPick(oHeaders, ['Trạng thái', 'Trạng thái đơn', 'Status'], 11);
    const cFinal = ordersHeaderPick(oHeaders, ['Thanh toán', 'Thực thu', 'Số tiền TT', 'Final', 'Số tiền'], 8);
    for (let r = 1; r < oData.length; r++) {
      const idCell = normalizeOrderIdForMatch(oData[r][cId >= 0 ? cId : 0]);
      if (idCell !== oidNorm) continue;
      ordersStatus = String(oData[r][cSt >= 0 ? cSt : 11] || '').trim();
      ordersFinal = parseVnAmount(oData[r][cFinal >= 0 ? cFinal : 8]);
      break;
    }
  }

  if (ordersStatus && orderStatusIsCancelled(ordersStatus)) {
    return { status: 'cancelled', message: 'order_cancelled' };
  }

  if (ordersStatus && !orderStatusIsAwaitingBank(ordersStatus)) {
    if (ordersStatus.indexOf('Hoàn thành') >= 0 || ordersStatus.indexOf('hoan thanh') >= 0) {
      return { status: 'paid', alreadyCompleted: true, expectedAmount: ordersFinal || exp || 0 };
    }
  }

  if (await cancelOrderIfExpired(oidNorm, new Date())) {
    return { status: 'error', message: 'expired_cancelled' };
  }

  if (ordersFinal > 0) exp = ordersFinal;
  if (exp <= 0) exp = parseVnAmount(expectedAmount);
  if (exp <= 0 && !oidNorm) return { status: 'pending' };

  const bankSheetName = await getBankTransferSheet();
  const allData = await getDataRange(bankSheetName, { skipCache: true });
  if (allData.length < 2) return { status: 'pending', message: 'no_bank_rows' };

  const headers = allData[0];
  const data = allData.slice(1);
  const colContent = (() => {
    const picked = ordersHeaderPick(headers, ['Nội dung thanh toán', 'Nội dung CK', 'Mô tả giao dịch'], -1);
    return picked >= 0 ? picked : 5;
  })();
  const colAmount = (() => {
    const picked = ordersHeaderPick(headers, ['Số tiền', 'Số tiền GD'], -1);
    return picked >= 0 ? picked : 7;
  })();
  const colProcessingStatus = ordersHeaderPick(
    headers,
    ['Trạng thái xử lý', 'Trạng thái xử lý CK'],
    -1,
  );
  const hasProcCol = colProcessingStatus >= 0;
  const colCodeTT = ordersHeaderPick(headers, ['Code TT', 'Mã TT'], -1);
  const colOrderRef = bankSheetColOrderRef(headers);

  const unprocessedRows = [];
  const allMatchRows = [];
  for (let ri = data.length - 1; ri >= 0; ri--) {
    const row = data[ri];
    const partMemo = String(row[colContent] || '').trim();
    if (!partMemo) continue;
    const partCode = colCodeTT > -1 ? String(row[colCodeTT] || '').trim() : '';
    const memoNorm = `${partMemo} ${partCode}`.trim().toUpperCase().replace(/\s+/g, '');
    const transactionAmount = parseVnAmount(row[colAmount]);
    const currentProcessingStatus = hasProcCol ? String(row[colProcessingStatus] || '').trim() : '';
    const memoOk = bankMemoMatchesOrder(memoNorm, oidNorm);
    const kNorm =
      colOrderRef > -1 ? String(row[colOrderRef] || '').trim().toUpperCase().replace(/\s+/g, '') : '';
    const kOk = kNorm && bankMemoMatchesOrder(kNorm, oidNorm);
    if (!(memoOk || kOk)) continue;
    const proc = hasProcCol ? bankTransferRowProcessed(currentProcessingStatus) : false;
    const entry = { sheetRow: ri + 2, amount: transactionAmount, processed: proc, memoMatch: true };
    allMatchRows.push(entry);
    if (!proc) unprocessedRows.push(entry);
  }

  if (allMatchRows.length === 0) {
    return { status: 'pending', message: 'memo_not_found', orderId: oidNorm };
  }

  const unpaidTotal = unprocessedRows.reduce((s, x) => s + (x.amount || 0), 0);
  const markBankRowProcessed = async (sheetRow) => {
    if (!hasProcCol) return;
    await updateCell(bankSheetName, sheetRow, colProcessingStatus + 1, 'Đã xử lý');
  };

  const confirmPaid = async (amountPaid) => {
    return withLock(`bank_confirm_${oidNorm}`, async () => {
      let hit = unprocessedRows.find((x) => x.memoMatch) || unprocessedRows[0] || allMatchRows[0];
      if (hit) await markBankRowProcessed(hit.sheetRow);
      const ok = await confirmOrderInOrdersSheet(orderId, { fromBankMatch: true });
      return ok
        ? { status: 'paid', amountPaid: amountPaid || hit?.amount || exp, expectedAmount: exp, matchedMemo: true }
        : { status: 'error', message: 'confirm_failed', orderId: oidNorm };
    });
  };

  if (unprocessedRows.length) {
    let hit =
      unprocessedRows.find((x) => x.memoMatch && exp > 0 && Math.abs((x.amount || 0) - exp) <= 5) ||
      unprocessedRows.find((x) => x.memoMatch) ||
      unprocessedRows[0];
    if (hit) return confirmPaid(hit.amount || exp);
  }

  if (allMatchRows.length && !unprocessedRows.length) {
    return confirmPaid(allMatchRows.reduce((s, x) => s + (x.amount || 0), 0));
  }

  if (unpaidTotal > 0 && exp > 0 && unpaidTotal >= exp - 5) {
    return confirmPaid(unpaidTotal);
  }

  return { status: 'pending', message: 'waiting_amount', amountSeen: unpaidTotal, expectedAmount: exp };
}

export async function confirmManualTransferPayment(orderId) {
  return confirmOrderInOrdersSheet(orderId, { fromBankMatch: true });
}

export async function confirmAwaitingOrderPaidCashRemainder(orderId) {
  const sheetName = await getOrdersSheet();
  const ordersData = await getDataRange(sheetName);
  const headers = ordersData[0];
  const colId = ordersHeaderPick(headers, ['Mã ĐH', 'Mã đơn', 'Order ID'], 0);
  const colSt = ordersHeaderPick(headers, ['Trạng thái', 'Trạng thái đơn', 'Status'], 11);
  const colPm = ordersHeaderPick(headers, ['Phương thức TT', 'PTTT', 'Thanh toán'], 9);
  const colNote = ordersHeaderPick(headers, ['Ghi chú', 'Note'], 10);
  const oidWant = normalizeOrderIdForMatch(orderId);
  for (let j = 1; j < ordersData.length; j++) {
    const oidCell = normalizeOrderIdForMatch(ordersData[j][colId >= 0 ? colId : 0]);
    const st = String(ordersData[j][colSt >= 0 ? colSt : 11] || '').trim();
    if (oidCell === oidWant && orderStatusIsAwaitingBank(st)) {
      if (colPm > -1)
        await updateCell(sheetName, j + 1, colPm + 1, 'Chuyển khoản + Tiền mặt');
      if (colNote > -1) {
        const prev = String(ordersData[j][colNote] || '');
        const tag = `[TM bù phần thiếu ${new Date().toLocaleString('vi-VN')}]`;
        await updateCell(sheetName, j + 1, colNote + 1, prev ? `${prev} ${tag}` : tag);
      }
      break;
    }
  }
  return confirmOrderInOrdersSheet(orderId);
}

export async function cancelAwaitingBankOrder(orderId) {
  return withLock('cancel_bank', async () => {
    const oidWant = normalizeOrderIdForMatch(orderId);
    if (!oidWant) return { ok: false, message: 'missing_order_id' };
    const sheetName = await getOrdersSheet();
    const all = await getDataRange(sheetName);
    if (all.length < 2) return { ok: false, message: 'orders_sheet_empty' };
    const headers = all[0];
    const colId = ordersHeaderPick(headers, ['Mã ĐH', 'Mã đơn', 'Mã DH', 'Order ID'], 0);
    const colSt = ordersHeaderPick(headers, ['Trạng thái', 'Trạng thái đơn', 'Status'], 11);
    const colNote = ordersHeaderPick(headers, ['Ghi chú', 'Note'], 10);

    for (let r = 1; r < all.length; r++) {
      const oidCell = normalizeOrderIdForMatch(all[r][colId >= 0 ? colId : 0]);
      if (oidCell !== oidWant) continue;
      const st = String(all[r][colSt >= 0 ? colSt : 11] || '').trim();
      if (!orderStatusIsAwaitingBank(st)) {
        return { ok: true, status: st, message: 'not_awaiting' };
      }
      await updateCell(sheetName, r + 1, (colSt >= 0 ? colSt : 11) + 1, 'Hủy');
      if (colNote > -1) {
        const prev = String(all[r][colNote] || '');
        const tag = `[Hủy CK POS ${new Date().toLocaleString('vi-VN')}]`;
        await updateCell(sheetName, r + 1, colNote + 1, prev ? `${prev} ${tag}` : tag);
      }
      CACHE.clear(['dashboard', 'cashflow_month', 'cashflow_today', 'cashflow_week']);
      return { ok: true, status: 'Hủy' };
    }
    return { ok: false, message: 'order_not_found' };
  });
}

export async function getOnlineOrdersForAdmin(maxRows) {
  const lim = Math.min(80, parseInt(maxRows, 10) || 40);
  const sheetName = await getOrdersSheet();
  const data = await getDataRange(sheetName);
  if (data.length < 2) return { ok: true, orders: [] };
  const cmap = ordersColumnMap(data[0]);
  const out = [];
  for (let i = data.length - 1; i >= 1 && out.length < lim; i--) {
    const note = String(ordersCell(data[i], cmap, 'Ghi chú', 10) || '');
    if (note.indexOf('[PICKUP') < 0 && note.indexOf('[ONLINE') < 0) continue;
    const o = await mapOrderRow(data[i], cmap);
    o.sheetRow = i + 2;
    out.push(o);
  }
  return { ok: true, orders: out };
}

export async function getOnlineOrderStatusPublic(orderId) {
  const oid = String(orderId || '').trim();
  if (!oid) return { ok: false, message: 'Thiếu mã đơn' };
  const sheetName = await getOrdersSheet();
  const data = await getDataRange(sheetName);
  if (data.length < 2) return { ok: false, message: `Không tìm thấy đơn ${oid}` };
  const cmap = ordersColumnMap(data[0]);
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(ordersCell(data[i], cmap, 'Mã ĐH', 0) || '').trim() === oid) {
      return {
        ok: true,
        orderId: oid,
        status: String(ordersCell(data[i], cmap, 'Trạng thái', 11) || ''),
        fbPercent: await feedbackRewardPct(),
      };
    }
  }
  return { ok: false, message: `Không tìm thấy đơn ${oid}` };
}

export async function updateOnlineOrderStatus(orderId, newStatus) {
  const oid = String(orderId || '').trim();
  const st = String(newStatus || '').trim();
  if (!oid || !st) throw new Error('Thiếu mã đơn hoặc trạng thái');
  const sheetName = await getOrdersSheet();
  const data = await getDataRange(sheetName);
  const cmap = ordersColumnMap(data[0]);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cmap['Mã ĐH']] || data[i][0] || '').trim() === oid) {
      await updateCell(sheetName, i + 1, (cmap['Trạng thái'] != null ? cmap['Trạng thái'] : 11) + 1, st);
      if (ordersCompletedStatus(st)) {
        try {
          const items = JSON.parse(String(data[i][cmap['Các món'] != null ? cmap['Các món'] : 5] || '[]'));
          const noteCol = cmap['Ghi chú'] != null ? cmap['Ghi chú'] : 10;
          const timeCol = cmap['Thời gian'] != null ? cmap['Thời gian'] : 1;
          await runOrderCompletionEffects(oid, {
            customerPhone: String(data[i][cmap['SĐT'] != null ? cmap['SĐT'] : 3] || ''),
            customerName: String(data[i][cmap['Tên KH'] != null ? cmap['Tên KH'] : 2] || ''),
            items,
            finalAmount: parseFloat(data[i][cmap['Thanh toán'] != null ? cmap['Thanh toán'] : 8]) || 0,
            paymentMethod: String(data[i][cmap['Phương thức TT'] != null ? cmap['Phương thức TT'] : 9] || ''),
            promoCode: String(data[i][cmap['Mã KM'] != null ? cmap['Mã KM'] : 12] || ''),
          }, {
            note: String(data[i][noteCol] || ''),
            orderTime: data[i][timeCol] || new Date(),
          });
        } catch {
          /* ignore */
        }
      }
      CACHE.clear(['dashboard', 'cashflow_month']);
      return { ok: true, orderId: oid, status: st };
    }
  }
  throw new Error(`Không tìm thấy đơn ${oid}`);
}

export async function submitDrinkFeedback(payload) {
  const p = payload || {};
  const msg = String(p.message || '').trim().slice(0, 1000);
  const ph = normalizeVnPhoneDigits(p.phone);
  if (!msg && !ph) throw new Error('Nhập góp ý giúp SUN nhé');
  const pct = await feedbackRewardPct();
  let voucher = null;
  if (ph && pct > 0) {
    await getSheet('Voucher góp ý', FEEDBACK_VOUCHER_HEADERS);
    const code = `GY${(Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)).toUpperCase()}`;
    const now = new Date();
    const expires = new Date(now.getTime() + FEEDBACK_VOUCHER_DAYS * 24 * 3600 * 1000);
    await appendRow('Voucher góp ý', [
      code,
      ph,
      pct,
      now,
      expires,
      'Chưa dùng',
      String(p.orderId || ''),
      '',
    ]);
    voucher = {
      code,
      percent: pct,
      expires: expires.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    };
  }
  await getSheet('Góp ý', ['Thời gian', 'Mã đơn', 'Nhóm', 'Tên', 'SĐT', 'Góp ý', 'Ưu đãi']);
  await appendRow('Góp ý', [
    new Date(),
    String(p.orderId || ''),
    String(p.groupName || p.groupId || ''),
    String(p.name || '').slice(0, 80),
    ph,
    msg,
    voucher ? `Voucher ${voucher.code} -${pct}% (HSD ${voucher.expires})` : '',
  ]);
  return {
    ok: true,
    reward: voucher ? pct : 0,
    voucherCode: voucher ? voucher.code : '',
    voucherExpires: voucher ? voucher.expires : '',
  };
}

/* ---- Group orders ---- */

function groupNormCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function groupNormPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.indexOf('84') === 0 && d.length >= 10) d = '0' + d.slice(2);
  if (d.length === 9 && d.charAt(0) !== '0') d = '0' + d;
  return d;
}

function groupNormMemberId(id) {
  const s = String(id || '').trim();
  if (/^\d{9,11}$/.test(s.replace(/\D/g, '')) && s.indexOf('g_') !== 0) return groupNormPhone(s);
  return s.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 48);
}

function groupMemberIdsMatch(a, b) {
  const x = groupNormMemberId(typeof a === 'object' ? a?.id || a?.phone : a);
  const y = groupNormMemberId(b);
  return !!x && !!y && x === y;
}

function groupSanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 40).map((it) => {
    const o = it?.options || {};
    return {
      id: String(it?.id || ''),
      name: String(it?.name || '').slice(0, 90),
      quantity: Math.max(1, Math.min(99, parseInt(it?.quantity, 10) || 1)),
      price: Math.max(0, parseFloat(it?.price) || 0),
      basePrice: Math.max(0, parseFloat(it?.basePrice) || 0),
      imageUrl: String(it?.imageUrl || '').slice(0, 500),
      note: String(it?.note || '').slice(0, 160),
      options: {
        size: String(o.size || ''),
        sizePrice: parseFloat(o.sizePrice) || 0,
        ice: String(o.ice || ''),
        sweetness: String(o.sweetness || ''),
        serveTemp: String(o.serveTemp || ''),
        packaging: String(o.packaging || ''),
        packagingPrice: parseFloat(o.packagingPrice) || 0,
        addons: Array.isArray(o.addons) ? o.addons.slice(0, 12).map(String) : [],
        addonPrices: Array.isArray(o.addonPrices)
          ? o.addonPrices.slice(0, 12).map((p) => parseFloat(p) || 0)
          : [],
        familyPack: o.familyPack === true,
      },
    };
  });
}

function groupMemberSubtotal(items) {
  return (items || []).reduce(
    (s, it) => s + (parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 1),
    0,
  );
}

function groupMemberRow(m) {
  return {
    id: m.id,
    phone: m.phone,
    name: m.name,
    items: m.items,
    promoCode: String(m.promoCode || '').trim().toUpperCase(),
    discount: Math.max(0, parseFloat(m.discount) || 0),
    updatedAt: m.updatedAt,
  };
}

function groupMembersPayload(state) {
  return {
    groupName: state.groupName,
    members: (state.members || []).map(groupMemberRow),
  };
}

function groupCreatedMs(createdAt) {
  try {
    return new Date(createdAt).getTime() || 0;
  } catch {
    return 0;
  }
}

function isGroupPastTtl(createdAt) {
  const createdMs = groupCreatedMs(createdAt);
  return createdMs > 0 && Date.now() - createdMs > GROUP_TTL_HOURS * 3600 * 1000;
}

async function finalizeGroupOrderCore(found, state, checkout, opts = {}) {
  const co = checkout || {};
  const ph = groupNormPhone(opts.hostPhone || state.hostPhone);
  if (!opts.skipHostCheck && ph !== state.hostPhone) throw new Error('Chỉ trưởng nhóm mới đặt đơn được');
  if (state.status === 'ordered') throw new Error(`Nhóm đã đặt đơn rồi (mã ${state.orderId})`);
  if (state.status === 'cancelled') throw new Error('Nhóm đã bị hủy');
  if (state.status === 'expired') throw new Error(`Nhóm đã hết hạn (quá ${GROUP_TTL_HOURS} giờ)`);

  const mergedItems = [];
  let totalMemberDisc = 0;
  const memberPromoNotes = [];
  state.members.forEach((m) => {
    const mName = m.name || `KH ${String(m.id || '').slice(-4)}`;
    const mDisc = Math.max(0, parseFloat(m.discount) || 0);
    totalMemberDisc += mDisc;
    if (m.promoCode && mDisc > 0) {
      memberPromoNotes.push(`${mName}: ${m.promoCode} −${mDisc.toLocaleString('vi-VN')}đ`);
    }
    (m.items || []).forEach((it) => {
      const unit = parseFloat(it.price) || 0;
      const qty = parseInt(it.quantity, 10) || 1;
      const mPhone = groupNormPhone(m.phone || m.id);
      mergedItems.push({
        id: it.id,
        name: it.name,
        quantity: qty,
        qty,
        price: unit,
        totalPrice: unit * qty,
        options: it.options,
        groupMember: mName,
        groupMemberPhone: mPhone,
        note: `[${mName}] ${String(it.note || '')}`.trim(),
      });
    });
  });
  if (!mergedItems.length) throw new Error('Giỏ nhóm đang trống');

  const subtotal = mergedItems.reduce((s, it) => s + it.totalPrice, 0);
  const groupPct = await groupDiscountPct();
  const groupDisc = groupPct > 0 ? roundDiscountToThousand((subtotal * groupPct) / 100) : 0;
  const hostPromoDisc = parseFloat(co.discount) || 0;
  const usedGroupDisc = groupDisc > 0 && groupDisc >= hostPromoDisc;
  const hostPromoCode = usedGroupDisc ? '' : (co.promoCode || '');
  const groupWideDisc = Math.max(groupDisc, hostPromoDisc);
  const discount = totalMemberDisc + groupWideDisc;
  const membersWithItems = state.members.filter((m) => (m.items || []).length);
  const noteExtra =
    `[GROUP:${state.groupId}] «${state.groupName}» - ${membersWithItems.length} người: ` +
    `${membersWithItems.map((m) => m.name || String(m.id || '').slice(-4)).join(', ')}` +
    (usedGroupDisc ? ` | Ưu đãi đơn nhóm −${groupPct}%` : '') +
    (memberPromoNotes.length ? ` | Voucher cá nhân: ${memberPromoNotes.join('; ')}` : '');

  const res = await savePickupOnlineOrder({
    customerPhone: ph,
    customerName: co.customerName || state.hostName,
    items: mergedItems,
    totalAmount: subtotal,
    discount,
    paymentMethod: co.paymentMethod || 'Thanh toán khi nhận',
    fulfillment: co.fulfillment || 'pickup',
    addressDetail: co.addressDetail || '',
    deliveryZone: co.deliveryZone || '',
    promoCode: hostPromoCode,
    lockDiscount: true,
    deliveryAt: co.deliveryAt || '',
    note: (co.note ? `${co.note} | ` : '') + noteExtra,
  });

  for (const m of state.members) {
    if (m.promoCode) await markPersonalVoucherUsed(m.promoCode, res.orderId);
  }
  if (hostPromoCode) await markPersonalVoucherUsed(hostPromoCode, res.orderId);

  const newState = await groupSave(found.row, 'ordered', groupMembersPayload(state), res.orderId);
  res.group = newState;
  return res;
}

/** Quá TTL: khóa thêm món và tự chốt đơn (hoặc hủy nếu giỏ trống). */
async function resolveGroupExpiry(found) {
  const state = await groupStateFromRow(found.values);
  if (!['open', 'locked', 'expired'].includes(state.status)) return state;
  if (!isGroupPastTtl(state.createdAt)) return state;

  const hasItems = (state.members || []).some((m) => (m.items || []).length > 0);
  if (!hasItems) {
    return groupSave(found.row, 'cancelled', groupMembersPayload(state), null);
  }

  try {
    const res = await finalizeGroupOrderCore(found, { ...state, status: 'open' }, {
      customerName: state.hostName,
      paymentMethod: 'Thanh toán khi nhận',
      fulfillment: 'pickup',
      note: `Tự động chốt đơn sau ${GROUP_TTL_HOURS} giờ`,
    }, { skipHostCheck: true });
    return res.group;
  } catch (e) {
    return groupSave(found.row, 'expired', groupMembersPayload(state), null);
  }
}

async function groupFindRow(code) {
  await getSheet('GroupOrders', GROUP_ORDERS_HEADERS);
  const all = await getDataRange('GroupOrders');
  if (all.length < 2) return null;
  for (let i = all.length - 1; i >= 1; i--) {
    if (groupNormCode(all[i][0]) === code) {
      return { row: i + 1, values: all[i] };
    }
  }
  return null;
}

async function groupStateFromRow(vals) {
  let data = { members: [] };
  try {
    data = JSON.parse(String(vals[6] || '{}')) || { members: [] };
  } catch {
    data = { members: [] };
  }
  const members = (data.members || []).map((m) => {
    const items = Array.isArray(m.items) ? m.items : [];
    const subtotal = groupMemberSubtotal(items);
    const discount = Math.max(0, parseFloat(m.discount) || 0);
    return {
      id: String(m.id || m.phone || ''),
      phone: String(m.phone || ''),
      name: String(m.name || ''),
      items,
      subtotal,
      promoCode: String(m.promoCode || '').trim().toUpperCase(),
      discount,
      subtotalAfter: Math.max(0, subtotal - discount),
      updatedAt: String(m.updatedAt || ''),
    };
  });
  const total = members.reduce((s, m) => s + m.subtotal, 0);
  const totalMemberDiscount = members.reduce((s, m) => s + m.discount, 0);
  const totalAfterDiscount = Math.max(0, total - totalMemberDiscount);
  let createdMs = 0;
  try {
    createdMs = new Date(vals[4]).getTime() || 0;
  } catch {
    createdMs = 0;
  }
  let status = String(vals[3] || 'open');
  if (
    (status === 'open' || status === 'locked') &&
    createdMs > 0 &&
    Date.now() - createdMs > GROUP_TTL_HOURS * 3600 * 1000
  ) {
    status = 'expired';
  }
  return {
    ok: true,
    groupId: groupNormCode(vals[0]),
    hostPhone: groupNormPhone(vals[1]),
    hostName: String(vals[2] || ''),
    groupName: String(data.groupName || '') || `Đơn nhóm của ${String(vals[2] || 'bạn')}`,
    status,
    createdAt: String(vals[4] || ''),
    updatedAt: String(vals[5] || ''),
    orderId: String(vals[7] || ''),
    members,
    total,
    totalMemberDiscount,
    totalAfterDiscount,
    discountPct: await groupDiscountPct(),
  };
}

async function groupSave(row, status, data, orderId) {
  const now = new Date();
  const json = JSON.stringify(data || { members: [] });
  if (json.length > 45000) throw new Error('Giỏ nhóm quá lớn - bớt món giúp mình nhé');
  const all = await getDataRange('GroupOrders');
  const createdAt = all[row - 1]?.[4] || now;
  await updateRange('GroupOrders', row, 4, row, 7, [
    [status, createdAt, now, json],
  ]);
  if (orderId != null) await updateCell('GroupOrders', row, 8, String(orderId));
  const vals = (await getDataRange('GroupOrders'))[row - 1];
  const state = await groupStateFromRow(vals);
  CACHE.set(`grp_${state.groupId}`, state, 600);
  return state;
}

export async function createGroupOrder(hostPhone, hostName, groupName) {
  const phone = groupNormPhone(hostPhone);
  if (!/^0\d{9}$/.test(phone)) throw new Error('SĐT trưởng nhóm không hợp lệ');
  const name = String(hostName || '').slice(0, 40) || 'Trưởng nhóm';
  const gname = String(groupName || '').trim().slice(0, 60) || `Đơn nhóm của ${name}`;
  return withLock('group_orders', async () => {
    await getSheet('GroupOrders', GROUP_ORDERS_HEADERS);
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      code = '';
      for (let i = 0; i < 6; i++) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      if (!(await groupFindRow(code))) break;
    }
    const now = new Date();
    const data = {
      groupName: gname,
      members: [{ id: phone, phone, name, items: [], promoCode: '', discount: 0, updatedAt: now.toISOString() }],
    };
    await appendRow('GroupOrders', [code, phone, name, 'open', now, now, JSON.stringify(data), '']);
    const newRow = (await getDataRange('GroupOrders')).length;
    const vals = (await getDataRange('GroupOrders'))[newRow - 1];
    const state = await groupStateFromRow(vals);
    CACHE.set(`grp_${code}`, state, 600);
    return state;
  });
}

export async function getGroupOrder(groupId) {
  const code = groupNormCode(groupId);
  if (!code) return { ok: false, message: 'Thiếu mã nhóm' };
  const cached = CACHE.get(`grp_${code}`);
  if (cached) return cached;
  const found = await groupFindRow(code);
  if (!found) return { ok: false, message: `Không tìm thấy nhóm ${code}` };
  const state = await resolveGroupExpiry(found);
  CACHE.set(`grp_${code}`, state, 600);
  return state;
}

export async function joinGroupOrder(groupId, memberId, name, guestPhone) {
  const code = groupNormCode(groupId);
  const mid = groupNormMemberId(memberId);
  if (!code) throw new Error('Thiếu mã nhóm');
  if (!mid) throw new Error('Thiếu định danh thành viên');
  if (!/^0\d{9}$/.test(mid)) throw new Error('Đăng nhập SĐT để vào đơn nhóm');
  const cleanName = String(name || '').trim().slice(0, 40);
  if (!cleanName) throw new Error('Cập nhật tên hồ sơ để vào đơn nhóm');
  return withLock('group_orders', async () => {
    const found = await groupFindRow(code);
    if (!found) throw new Error(`Không tìm thấy nhóm ${code}`);
    const state = await resolveGroupExpiry(found);
    if (state.status === 'ordered') throw new Error(`Nhóm này đã đặt đơn xong (mã ${state.orderId || ''})`);
    if (state.status === 'cancelled') throw new Error('Nhóm này đã bị hủy');
    if (state.status === 'expired') throw new Error(`Nhóm này đã hết hạn (quá ${GROUP_TTL_HOURS} giờ)`);
    if (state.status === 'locked' && mid !== state.hostPhone)
      throw new Error('Trưởng nhóm đã khóa nhóm - không vào thêm được');
    const data = {
      groupName: state.groupName,
      members: state.members.map(groupMemberRow),
    };
    let me = data.members.find((m) => groupMemberIdsMatch(m, mid));
    if (!me) {
      if (GROUP_MAX_MEMBERS > 0 && data.members.length >= GROUP_MAX_MEMBERS)
        throw new Error(`Nhóm đã đủ ${GROUP_MAX_MEMBERS} người`);
      data.members.push({
        id: mid,
        phone: mid,
        name: cleanName || `KH ${mid.slice(-4)}`,
        items: [],
        promoCode: '',
        discount: 0,
        updatedAt: new Date().toISOString(),
      });
    } else if (cleanName) {
      me.name = cleanName;
    }
    return groupSave(found.row, state.status, data, null);
  });
}

export async function syncGroupCart(groupId, memberId, name, items, promoCode, discount, clearCart) {
  const code = groupNormCode(groupId);
  const mid = groupNormMemberId(memberId);
  if (!code) throw new Error('Thiếu mã nhóm');
  const promo = String(promoCode || '').trim().toUpperCase();
  const disc = Math.max(0, parseFloat(discount) || 0);
  const wipeOk = clearCart === true || clearCart === 'true' || clearCart === 1;
  return withLock('group_orders', async () => {
    const found = await groupFindRow(code);
    if (!found) throw new Error(`Không tìm thấy nhóm ${code}`);
    const state = await resolveGroupExpiry(found);
    if (['ordered', 'cancelled', 'expired'].includes(state.status)) return state;
    if (state.status === 'locked' && mid !== state.hostPhone) {
      throw new Error('Nhóm đã khóa - không sửa được giỏ. Nhờ trưởng nhóm mở khóa.');
    }
    const data = {
      groupName: state.groupName,
      members: state.members.map((m) => {
        const sanitized = groupMemberIdsMatch(m, mid) ? groupSanitizeItems(items) : null;
        let nextItems = m.items;
        if (sanitized) {
          nextItems =
            sanitized.length === 0 && !wipeOk && (m.items || []).length > 0 ? m.items : sanitized;
        }
        return {
          id: m.id,
          phone: m.phone,
          name: m.name,
          items: nextItems,
          promoCode: groupMemberIdsMatch(m, mid) ? promo : (m.promoCode || ''),
          discount: groupMemberIdsMatch(m, mid) ? disc : (parseFloat(m.discount) || 0),
          updatedAt: groupMemberIdsMatch(m, mid) ? new Date().toISOString() : m.updatedAt,
        };
      }),
    };
    const me = data.members.find((m) => groupMemberIdsMatch(m, mid));
    if (!me) throw new Error('Bạn chưa ở trong nhóm này - vào nhóm trước nhé');
    if (name) me.name = String(name).slice(0, 40);
    return groupSave(found.row, state.status, data, null);
  });
}

export async function leaveGroupOrder(groupId, memberId) {
  const code = groupNormCode(groupId);
  const mid = groupNormMemberId(memberId);
  return withLock('group_orders', async () => {
    const found = await groupFindRow(code);
    if (!found) return { ok: true, groupId: code, status: 'cancelled', members: [], total: 0 };
    const state = await groupStateFromRow(found.values);
    const data = {
      groupName: state.groupName,
      members: state.members
        .filter((m) => m.id !== mid)
        .map(groupMemberRow),
    };
    if (mid === state.hostPhone) {
      if (state.status === 'open' || state.status === 'locked') {
        return groupSave(found.row, 'cancelled', data, null);
      }
      return state;
    }
    return groupSave(found.row, state.status, data, null);
  });
}

export async function setGroupOrderLock(groupId, memberId, locked) {
  const code = groupNormCode(groupId);
  const mid = groupNormMemberId(memberId);
  return withLock('group_orders', async () => {
    const found = await groupFindRow(code);
    if (!found) throw new Error(`Không tìm thấy nhóm ${code}`);
    const state = await resolveGroupExpiry(found);
    if (mid !== state.hostPhone) throw new Error('Chỉ trưởng nhóm mới khóa/mở nhóm được');
    if (state.status !== 'open' && state.status !== 'locked') return state;
    const data = {
      groupName: state.groupName,
      members: state.members.map(groupMemberRow),
    };
    return groupSave(found.row, locked ? 'locked' : 'open', data, null);
  });
}

export async function finalizeGroupOrder(groupId, hostPhone, checkout) {
  const code = groupNormCode(groupId);
  const ph = groupNormPhone(hostPhone);
  return withLock('group_orders', async () => {
    const found = await groupFindRow(code);
    if (!found) throw new Error(`Không tìm thấy nhóm ${code}`);
    const state = await resolveGroupExpiry(found);
    return finalizeGroupOrderCore(found, state, checkout || {}, { hostPhone: ph });
  });
}

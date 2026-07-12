import CACHE from '../cache.js';
import {
  getSheet,
  getDataRange,
  appendRow,
  updateRow,
  findRowByColumn,
} from '../googleSheets.js';
import {
  PROMOTIONS_HEADERS,
  PROMO_HEADERS_EXTRA,
  FEEDBACK_VOUCHER_HEADERS,
  FEEDBACK_VOUCHER_DAYS,
  WELCOME_MEMBER_VOUCHER_HEADERS,
  WELCOME_MEMBER_VOUCHER_DAYS,
  WELCOME_MEMBER_VOUCHER_PCT,
} from '../sheetsMap.js';
import { safeNum, formatDateTz, normalizeVnPhoneDigits, roundDiscountToThousand } from '../format.js';
import { getOrdersSheet, ordersColumnMap, ordersCell, ordersCompletedStatus, parseOrderDate } from './helpers.js';

async function ensurePromotionsExtraColumns() {
  const all = await getDataRange('Promotions');
  if (!all.length) return;
  let headers = [...all[0]];
  let changed = false;
  for (const title of PROMO_HEADERS_EXTRA) {
    if (headers.indexOf(title) === -1) {
      headers.push(title);
      changed = true;
    }
  }
  if (changed) await updateRow('Promotions', 1, headers);
}

function mapPromoRow(r, headers, includeInactive = false) {
  const ix = (name) => headers.indexOf(name);
  const colCode = ix('Mã KM');
  const colRule = ix('Quy tắc');
  const colCfg = ix('Cấu hình JSON');
  let ruleConfig = {};
  if (colCfg > -1 && r[colCfg]) {
    try {
      ruleConfig = JSON.parse(String(r[colCfg]));
    } catch {
      ruleConfig = {};
    }
  }
  const activeCol = ix('Kích hoạt');
  const active =
    activeCol > -1
      ? r[activeCol] !== false && String(r[activeCol]).trim().toUpperCase() !== 'FALSE'
      : true;
  const safeDate = (v) =>
    v instanceof Date && !isNaN(v.getTime()) ? v.toISOString() : String(v || '');
  const obj = {
    code: String(r[ix('Mã KM')] || ''),
    name: String(r[ix('Tên')] || ''),
    type: String(r[ix('Loại')] || ''),
    value: safeNum(r[ix('Giá trị')]),
    minOrder: safeNum(r[ix('Đơn tối thiểu')]),
    startDate: safeDate(r[ix('Bắt đầu')]),
    endDate: safeDate(r[ix('Kết thúc')]),
    active,
    ruleType: colRule > -1 ? String(r[colRule] || '').trim() : '',
    ruleConfig,
  };
  if (!includeInactive && !active) return null;
  return obj;
}

export async function getPromotions() {
  const cached = CACHE.get('promotions_v2');
  if (cached) return cached;

  await getSheet('Promotions', PROMOTIONS_HEADERS);
  await ensurePromotionsExtraColumns();
  const all = await getDataRange('Promotions');
  if (all.length < 2) return [];

  const headers = all[0];
  const colCode = headers.indexOf('Mã KM');
  const result = all
    .slice(1)
    .filter((r) => r[colCode] && String(r[colCode]).trim() !== '')
    .map((r) => mapPromoRow(r, headers, false))
    .filter(Boolean);

  CACHE.set('promotions_v2', result, 1800);
  return result;
}

export async function getPromotionsAdmin() {
  await getSheet('Promotions', PROMOTIONS_HEADERS);
  await ensurePromotionsExtraColumns();
  const all = await getDataRange('Promotions');
  if (all.length < 2) return [];
  const headers = all[0];
  const colCode = headers.indexOf('Mã KM');
  return all
    .slice(1)
    .filter((r) => r[colCode] && String(r[colCode]).trim() !== '')
    .map((r) => mapPromoRow(r, headers, true))
    .filter(Boolean);
}

export async function savePromotion(data) {
  await getSheet('Promotions', PROMOTIONS_HEADERS);
  await ensurePromotionsExtraColumns();
  const all = await getDataRange('Promotions');
  const headers = all[0];
  const ruleType = String(data.ruleType || '').trim();
  let ruleJson = String(data.ruleConfigJson || '').trim() || '{}';
  try {
    JSON.parse(ruleJson);
  } catch {
    ruleJson = '{}';
  }
  const activeCell = !(
    data.active === false ||
    String(data.active).toUpperCase() === 'FALSE' ||
    data.active === 0
  );
  const rowObj = {
    'Mã KM': data.code,
    Tên: data.name,
    Loại: data.type,
    'Giá trị': data.value,
    'Đơn tối thiểu': data.minOrder || 0,
    'Bắt đầu': data.startDate || '',
    'Kết thúc': data.endDate || '',
    'Kích hoạt': activeCell,
    'Quy tắc': ruleType,
    'Cấu hình JSON': ruleJson,
  };
  const row = headers.map((h) => (rowObj[h] !== undefined ? rowObj[h] : ''));
  const colCodeIx = headers.indexOf('Mã KM');
  const codeNorm = String(data.code || '').trim().toUpperCase();
  let updated = false;
  for (let rr = 1; rr < all.length; rr++) {
    const cv = String(all[rr][colCodeIx] || '').trim().toUpperCase();
    if (cv === codeNorm) {
      await updateRow('Promotions', rr + 1, row);
      updated = true;
      break;
    }
  }
  if (!updated) await appendRow('Promotions', row);
  CACHE.clear(['promotions', 'promotions_v2']);
  return updated ? 'Đã cập nhật khuyến mãi!' : 'Đã thêm khuyến mãi!';
}

export async function deletePromotion(codeRaw) {
  const code = String(codeRaw || '').trim().toUpperCase();
  if (!code) throw new Error('Thiếu mã KM');
  const { deleteRow } = await import('../googleSheets.js');
  await getSheet('Promotions', PROMOTIONS_HEADERS);
  await ensurePromotionsExtraColumns();
  const all = await getDataRange('Promotions');
  if (all.length < 2) throw new Error('Không tìm thấy mã ' + code);
  const headers = all[0];
  const colCode = headers.indexOf('Mã KM');
  for (let i = 1; i < all.length; i++) {
    if (String(all[i][colCode] || '').trim().toUpperCase() === code) {
      await deleteRow('Promotions', i + 1);
      CACHE.clear(['promotions', 'promotions_v2']);
      return { ok: true, message: 'Đã xóa mã ' + code };
    }
  }
  throw new Error('Không tìm thấy mã ' + code);
}

async function validateFeedbackVoucher(code, orderAmount) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^GY[A-Z0-9]{4,10}$/.test(c)) return null;
  await getSheet('Voucher góp ý', FEEDBACK_VOUCHER_HEADERS);
  const rows = await getDataRange('Voucher góp ý');
  if (rows.length < 2) return null;
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0] || '').trim().toUpperCase() !== c) continue;
    const status = String(rows[i][5] || '').trim();
    if (status !== 'Chưa dùng')
      return { valid: false, message: 'Voucher góp ý này đã được sử dụng rồi!' };
    const exp = new Date(rows[i][4]);
    if (!isNaN(exp.getTime()) && exp < new Date())
      return {
        valid: false,
        message: `Voucher góp ý đã hết hạn (hiệu lực ${FEEDBACK_VOUCHER_DAYS} ngày từ ngày phát hành)!`,
      };
    const pct = Math.max(0, Math.min(50, parseFloat(rows[i][2]) || 0));
    if (!pct) return { valid: false, message: 'Voucher không có mức giảm hợp lệ!' };
    const disc = roundDiscountToThousand((parseFloat(orderAmount) || 0) * pct / 100);
    return {
      valid: true,
      discount: disc,
      message: `Voucher góp ý - Giảm ${pct}% (${disc.toLocaleString('vi-VN')}đ)`,
    };
  }
  return { valid: false, message: `Không tìm thấy voucher ${c}!` };
}

export async function markFeedbackVoucherUsed(code, orderId) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^GY[A-Z0-9]{4,10}$/.test(c)) return;
  const rows = await getDataRange('Voucher góp ý');
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0] || '').trim().toUpperCase() === c) {
      await updateRow('Voucher góp ý', i + 1, [
        rows[i][0],
        rows[i][1],
        rows[i][2],
        rows[i][3],
        rows[i][4],
        'Đã dùng',
        rows[i][6],
        String(orderId || ''),
      ]);
      return;
    }
  }
}

async function validateWelcomeMemberVoucher(code, orderAmount) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^TV[A-Z0-9]{4,10}$/.test(c)) return null;
  await getSheet('Voucher thành viên', WELCOME_MEMBER_VOUCHER_HEADERS);
  const rows = await getDataRange('Voucher thành viên');
  if (rows.length < 2) return null;
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0] || '').trim().toUpperCase() !== c) continue;
    const status = String(rows[i][5] || '').trim();
    if (status !== 'Chưa dùng')
      return { valid: false, message: 'Voucher thành viên này đã được sử dụng rồi!' };
    const exp = new Date(rows[i][4]);
    if (!isNaN(exp.getTime()) && exp < new Date())
      return {
        valid: false,
        message: `Voucher thành viên đã hết hạn (hiệu lực ${WELCOME_MEMBER_VOUCHER_DAYS} ngày)!`,
      };
    const pct = Math.max(0, Math.min(50, parseFloat(rows[i][2]) || 0));
    if (!pct) return { valid: false, message: 'Voucher không có mức giảm hợp lệ!' };
    const disc = roundDiscountToThousand((parseFloat(orderAmount) || 0) * pct / 100);
    return {
      valid: true,
      discount: disc,
      message: `Voucher thành viên mới - Giảm ${pct}% (${disc.toLocaleString('vi-VN')}đ)`,
    };
  }
  return { valid: false, message: `Không tìm thấy voucher ${c}!` };
}

export async function markWelcomeMemberVoucherUsed(code, orderId) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^TV[A-Z0-9]{4,10}$/.test(c)) return;
  await getSheet('Voucher thành viên', WELCOME_MEMBER_VOUCHER_HEADERS);
  const rows = await getDataRange('Voucher thành viên');
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0] || '').trim().toUpperCase() === c) {
      await updateRow('Voucher thành viên', i + 1, [
        rows[i][0],
        rows[i][1],
        rows[i][2],
        rows[i][3],
        rows[i][4],
        'Đã dùng',
        String(orderId || ''),
      ]);
      return;
    }
  }
}

/** Đánh dấu voucher cá nhân (GY / TV / CL) đã dùng. */
export async function markPersonalVoucherUsed(code, orderId) {
  const c = String(code || '').trim().toUpperCase();
  if (/^GY[A-Z0-9]{4,10}$/.test(c)) return markFeedbackVoucherUsed(c, orderId);
  if (/^TV[A-Z0-9]{4,10}$/.test(c)) return markWelcomeMemberVoucherUsed(c, orderId);
  if (/^CL[A-Z0-9]{4,10}$/.test(c)) {
    const { markOfficeStreakVoucherUsed } = await import('./officeStreak.js');
    return markOfficeStreakVoucherUsed(c, orderId);
  }
  if (/^DS[A-Z0-9]{4,10}$/.test(c)) {
    const { markSunRedeemVoucherUsed } = await import('./sunRedeem.js');
    return markSunRedeemVoucherUsed(c, orderId);
  }
}

export async function welcomeMemberRewardPct() {
  const r = await activeRulePromo('welcome_member');
  if (!r.promo) return 0;
  const p = r.promo;
  const pct = parseFloat(p.ruleConfig?.percent != null ? p.ruleConfig.percent : p.value) || 0;
  return Math.max(0, Math.min(50, pct));
}

export async function welcomeMemberValidDays() {
  const r = await activeRulePromo('welcome_member');
  if (!r.promo) return WELCOME_MEMBER_VOUCHER_DAYS;
  const days = parseInt(r.promo.ruleConfig?.validDays, 10);
  return days > 0 ? days : WELCOME_MEMBER_VOUCHER_DAYS;
}

export async function issueWelcomeMemberVoucher(phone) {
  const ph = normalizeVnPhoneDigits(phone);
  if (!ph || ph.length < 9) return null;
  const pct = await welcomeMemberRewardPct();
  if (pct <= 0) return null;
  const validDays = await welcomeMemberValidDays();
  await getSheet('Voucher thành viên', WELCOME_MEMBER_VOUCHER_HEADERS);
  const rows = await getDataRange('Voucher thành viên');
  for (let i = rows.length - 1; i >= 1; i--) {
    const rowPh = normalizeVnPhoneDigits(rows[i][1]);
    const status = String(rows[i][5] || '').trim();
    if (rowPh === ph && status === 'Chưa dùng') {
      const exp = new Date(rows[i][4]);
      if (!isNaN(exp.getTime()) && exp >= new Date()) {
        return {
          code: String(rows[i][0] || '').trim().toUpperCase(),
          percent: parseFloat(rows[i][2]) || WELCOME_MEMBER_VOUCHER_PCT,
          expires: exp.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        };
      }
    }
  }
  const code = `TV${(Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)).toUpperCase()}`;
  const now = new Date();
  const expires = new Date(now.getTime() + validDays * 24 * 3600 * 1000);
  await appendRow('Voucher thành viên', [
    code,
    ph,
    pct,
    now,
    expires,
    'Chưa dùng',
    '',
  ]);
  return {
    code,
    percent: pct,
    expires: expires.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
  };
}

export async function getPersonalVouchersForPhone(phone) {
  const ph = normalizeVnPhoneDigits(phone);
  if (!ph || ph.length < 9) return [];
  const out = [];
  const seen = {};
  await getSheet('Voucher góp ý', FEEDBACK_VOUCHER_HEADERS);
  const fbRows = await getDataRange('Voucher góp ý');
  for (let i = fbRows.length - 1; i >= 1; i--) {
    if (normalizeVnPhoneDigits(fbRows[i][1]) !== ph) continue;
    if (String(fbRows[i][5] || '').trim() !== 'Chưa dùng') continue;
    const exp = new Date(fbRows[i][4]);
    if (!isNaN(exp.getTime()) && exp < new Date()) continue;
    const code = String(fbRows[i][0] || '').trim().toUpperCase();
    if (!code || seen[code]) continue;
    seen[code] = true;
    out.push({
      code,
      percent: parseFloat(fbRows[i][2]) || 0,
      kind: 'feedback',
      title: 'Voucher góp ý',
      expires: exp.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    });
  }
  await getSheet('Voucher thành viên', WELCOME_MEMBER_VOUCHER_HEADERS);
  const tvRows = await getDataRange('Voucher thành viên');
  for (let i = tvRows.length - 1; i >= 1; i--) {
    if (normalizeVnPhoneDigits(tvRows[i][1]) !== ph) continue;
    if (String(tvRows[i][5] || '').trim() !== 'Chưa dùng') continue;
    const exp = new Date(tvRows[i][4]);
    if (!isNaN(exp.getTime()) && exp < new Date()) continue;
    const code = String(tvRows[i][0] || '').trim().toUpperCase();
    if (!code || seen[code]) continue;
    seen[code] = true;
    out.push({
      code,
      percent: parseFloat(tvRows[i][2]) || WELCOME_MEMBER_VOUCHER_PCT,
      kind: 'welcome',
      title: 'Voucher thành viên mới',
      expires: exp.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    });
  }
  const { getOfficeStreakVouchersForPhone } = await import('./officeStreak.js');
  const streakVouchers = await getOfficeStreakVouchersForPhone(ph);
  for (const sv of streakVouchers) {
    if (!sv?.code || seen[sv.code]) continue;
    seen[sv.code] = true;
    out.push({
      code: sv.code,
      maxAmount: sv.maxAmount,
      kind: 'office_streak',
      title: sv.title || 'Voucher chuỗi văn phòng',
      expires: sv.expires,
    });
  }
  const { getSunRedeemVouchersForPhone } = await import('./sunRedeem.js');
  const sunVouchers = await getSunRedeemVouchersForPhone(ph);
  for (const uv of sunVouchers) {
    if (!uv?.code || seen[uv.code]) continue;
    seen[uv.code] = true;
    out.push({
      code: uv.code,
      maxAmount: uv.maxAmount,
      kind: 'sun_redeem',
      title: uv.title || 'Voucher đổi Sun',
      imageUrl: uv.imageUrl || uv.menuItemImage || '',
      menuItemName: uv.menuItemName || '',
      expires: uv.expires,
    });
  }
  return out;
}

let promosHotCache = null;
let promosHotCacheAt = 0;

async function getPromotionsHot() {
  if (promosHotCache && Date.now() - promosHotCacheAt < 8000) return promosHotCache;
  promosHotCache = await getPromotions();
  promosHotCacheAt = Date.now();
  return promosHotCache;
}

export async function getCompletedOrderCountByPhone(phone) {
  const p = normalizeVnPhoneDigits(phone);
  if (!p || p.length < 9) return 0;
  const cacheKey = `completed_orders_v1_${p}`;
  const cached = CACHE.get(cacheKey);
  if (typeof cached === 'number') return cached;
  const sheetName = await getOrdersSheet();
  const data = await getDataRange(sheetName);
  if (data.length < 2) return 0;
  const cmap = ordersColumnMap(data[0]);
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    const ph = normalizeVnPhoneDigits(ordersCell(data[i], cmap, 'SĐT', 3));
    if (ph !== p) continue;
    if (ordersCompletedStatus(ordersCell(data[i], cmap, 'Trạng thái', 11))) n++;
  }
  CACHE.set(cacheKey, n, 90);
  return n;
}

export function clearCompletedOrderCountCache(phone) {
  const p = normalizeVnPhoneDigits(phone);
  if (p) CACHE.clear(`completed_orders_v1_${p}`);
}

export async function validatePromo(code, orderAmount, customerPhone, cartJson) {
  const promos = await getPromotionsHot();
  const now = new Date();
  const promo = promos.find(
    (p) => p.code.toUpperCase() === String(code || '').trim().toUpperCase() && p.active,
  );

  if (!promo) {
    const fbv = await validateFeedbackVoucher(code, orderAmount);
    if (fbv) return fbv;
    const wmv = await validateWelcomeMemberVoucher(code, orderAmount);
    if (wmv) return wmv;
    const { validateOfficeStreakVoucher } = await import('./officeStreak.js');
    const osv = await validateOfficeStreakVoucher(code, orderAmount, cartJson);
    if (osv) return osv;
    const { validateSunRedeemVoucher } = await import('./sunRedeem.js');
    const dsv = await validateSunRedeemVoucher(code, orderAmount, cartJson);
    if (dsv) return dsv;
    return { valid: false, message: 'Mã không hợp lệ!' };
  }

  const rtEarly = String(promo.ruleType || '').trim().toLowerCase();
  if (promo.type === 'info' || rtEarly === 'holiday_note' || rtEarly === 'playbook_note') {
    return { valid: false, message: 'Mã này chỉ để tham khảo CTKM - không giảm giá tự động.' };
  }
  if (rtEarly === 'group_order' || rtEarly === 'feedback_reward' || rtEarly === 'welcome_member' || rtEarly === 'office_week_streak') {
    return {
      valid: false,
      message: 'Đây là mã cấu hình hệ thống - hệ thống tự áp dụng, không nhập trực tiếp.',
    };
  }
  if (promo.startDate && new Date(promo.startDate) > now)
    return { valid: false, message: 'Chưa đến ngày áp dụng!' };
  if (promo.endDate && new Date(promo.endDate) < now)
    return { valid: false, message: 'Mã đã hết hạn!' };
  if (promo.minOrder && orderAmount < promo.minOrder)
    return {
      valid: false,
      message: `Đơn tối thiểu ${promo.minOrder.toLocaleString('vi-VN')}đ!`,
    };

  const phone = normalizeVnPhoneDigits(customerPhone);
  const rt = String(promo.ruleType || '').trim().toLowerCase();

  if (rt === 'new_customer') {
    if (phone.length < 9) return { valid: false, message: 'Nhập SĐT để áp mã khách hàng mới!' };
    if ((await getCompletedOrderCountByPhone(phone)) > 0)
      return { valid: false, message: 'Mã chỉ dành cho khách hàng mới!' };
  }

  if (rt === 'repeat_2nd_cup') {
    if (phone.length < 9) return { valid: false, message: 'Nhập SĐT để áp mã này!' };
    const minCups = promo.ruleConfig?.minCups != null ? parseInt(promo.ruleConfig.minCups, 10) : 2;
    let cart = [];
    try {
      cart = JSON.parse(String(cartJson || '[]'));
    } catch {
      cart = [];
    }
    let cups = 0;
    cart.forEach((it) => {
      cups += parseInt(it.quantity, 10) || 1;
    });
    if ((await getCompletedOrderCountByPhone(phone)) < 1 || cups < minCups) {
      return {
        valid: false,
        message: `Cần là khách quay lại và có ít nhất ${minCups} ly trong giỏ!`,
      };
    }
  }

  if (rt === 'buy2get1_any' || rt === 'buy2get1') {
    let cart = [];
    try {
      cart = JSON.parse(String(cartJson || '[]'));
    } catch {
      cart = [];
    }
    let cups = 0;
    cart.forEach((it) => {
      cups += parseInt(it.quantity, 10) || 1;
    });
    if (cups < 2) return { valid: false, message: 'Cần ít nhất 2 ly trong giỏ để dùng mã này!' };
  }

  if (rt === 'buy1get1_same') {
    let ok = false;
    let cart = [];
    try {
      cart = JSON.parse(String(cartJson || '[]'));
    } catch {
      cart = [];
    }
    cart.forEach((it) => {
      if ((parseInt(it.quantity, 10) || 1) >= 2) ok = true;
    });
    if (!ok) return { valid: false, message: 'Cần ít nhất 2 ly cùng loại (cùng dòng) trong giỏ!' };
  }

  if (rt === 'happy_hours') {
    const wins = promo.ruleConfig?.windows;
    if (wins?.length) {
      const h = now.getHours();
      let okh = false;
      for (const w of wins) {
        const sh = parseInt(w.startHour, 10);
        const eh = parseInt(w.endHour, 10);
        if (isNaN(sh) || isNaN(eh)) continue;
        if (sh <= eh) {
          if (h >= sh && h < eh) okh = true;
        } else if (h >= sh || h < eh) okh = true;
      }
      if (!okh) return { valid: false, message: 'Chỉ áp dụng trong khung giờ CTKM (giờ vàng)!' };
    }
  }

  if (rt === 'payday_month') {
    const d0 = now.getDate();
    const ps = promo.ruleConfig?.paydayStart != null ? parseInt(promo.ruleConfig.paydayStart, 10) : 25;
    const pe = promo.ruleConfig?.paydayEnd != null ? parseInt(promo.ruleConfig.paydayEnd, 10) : 5;
    if (!(d0 >= ps || d0 <= pe)) {
      return {
        valid: false,
        message: `Mã chỉ dùng đợt lương về (từ ngày ${ps} đến hết tháng & đầu tháng đến ngày ${pe})!`,
      };
    }
  }

  if (rt === 'second_order') {
    if (phone.length < 9) return { valid: false, message: 'Nhập SĐT để áp mã mua lần 2!' };
    if ((await getCompletedOrderCountByPhone(phone)) < 1) {
      return { valid: false, message: 'Mã dành cho khách đã có ít nhất 1 đơn hoàn thành trước đó!' };
    }
  }

  if (rt === 'vip_ltv') {
    const minL =
      promo.ruleConfig?.minLifetimeSpend != null
        ? parseFloat(promo.ruleConfig.minLifetimeSpend)
        : 0;
    if (phone.length < 9) return { valid: false, message: 'Nhập SĐT để xác nhận VIP!' };
    const { getCustomerByPhone } = await import('./customers.js');
    const custV = await getCustomerByPhone(phone);
    if (!custV || (custV.totalSpent || 0) < minL) {
      return {
        valid: false,
        message: `Mã chỉ dành cho khách tích lũy chi tiêu từ ${minL.toLocaleString('vi-VN')}đ!`,
      };
    }
  }

  if (rt === 'combo_qty_tiers') {
    let cartT = [];
    try {
      cartT = JSON.parse(String(cartJson || '[]'));
    } catch {
      cartT = [];
    }
    let cupsT = 0;
    cartT.forEach((it) => {
      cupsT += parseInt(it.quantity, 10) || 1;
    });
    const tiers = promo.ruleConfig?.tiers || [];
    const sorted = tiers.slice().sort((a, b) => (parseInt(b.minQty, 10) || 0) - (parseInt(a.minQty, 10) || 0));
    let bestP = 0;
    for (const t of sorted) {
      const mq = parseInt(t.minQty, 10) || 0;
      const pc = parseFloat(t.percent) || 0;
      if (mq > 0 && cupsT >= mq && pc > 0) {
        bestP = pc;
        break;
      }
    }
    if (!bestP) return { valid: false, message: 'Chưa đủ số ly / lốc theo bậc combo!' };
    const discountTier = roundDiscountToThousand((orderAmount * bestP) / 100);
    return {
      valid: true,
      discount: discountTier,
      message: `Combo - giảm ${bestP}% (ước ${discountTier.toLocaleString('vi-VN')}đ)`,
    };
  }

  let discount = 0;
  if (promo.type === 'percent') discount = roundDiscountToThousand((orderAmount * promo.value) / 100);
  else if (promo.type === 'fixed') discount = promo.value;

  return {
    valid: true,
    discount,
    message: `Áp dụng "${promo.name}" - Giảm ${discount.toLocaleString('vi-VN')}đ`,
  };
}

export async function applyPromoCode(code, orderAmount, customerPhone, cartJson) {
  const v = await validatePromo(String(code || '').trim(), parseFloat(orderAmount) || 0, customerPhone, cartJson);
  if (!v.valid) return { ok: false, discount: 0, message: v.message };
  return { ok: true, discount: v.discount || 0, message: v.message };
}

export async function applyPickupPromo(code, phone, items) {
  const itemsArr = items?.length ? items : [];
  const sub = itemsArr.reduce(
    (s, it) => s + (parseFloat(it.price) || 0) * (parseInt(it.qty, 10) || parseInt(it.quantity, 10) || 1),
    0,
  );
  const cartJson = JSON.stringify(
    itemsArr.map((it) => ({
      id: it.id,
      quantity: parseInt(it.qty, 10) || parseInt(it.quantity, 10) || 1,
      qty: parseInt(it.qty, 10) || parseInt(it.quantity, 10) || 1,
      price: parseFloat(it.price) || 0,
    })),
  );
  return applyPromoCode(code, sub, phone, cartJson);
}

export async function getSuggestedPromosWithContext(phone, customerName, cartJson, subtotal, includeAutoApply) {
  const allowAuto = includeAutoApply === true || includeAutoApply === 'true';
  const p = normalizeVnPhoneDigits(phone);
  if (p.length < 9) return { suggestions: [], autoApplyCode: '', message: 'Nhập đủ SĐT để nhận gợi ý' };

  let cart = [];
  try {
    cart = JSON.parse(String(cartJson || '[]'));
  } catch {
    cart = [];
  }
  let cupCount = 0;
  cart.forEach((it) => {
    cupCount += parseInt(it.quantity, 10) || 1;
  });

  const { getCustomerByPhone } = await import('./customers.js');
  const cust = await getCustomerByPhone(p);
  const completed = await getCompletedOrderCountByPhone(p);
  const points = cust ? parseFloat(cust.points) || 0 : 0;
  const promos = await getPromotions();
  const suggestions = [];
  let autoApplyCode = '';

  for (const promo of promos) {
    const rt = String(promo.ruleType || '').trim().toLowerCase();
    if (!rt || rt === 'manual') continue;

    if (rt === 'holiday_note') {
      suggestions.push({
        code: promo.code,
        name: promo.name,
        reason: promo.ruleConfig?.message || promo.ruleConfig?.giftNote || promo.name,
        type: 'info',
      });
      continue;
    }

    if (rt === 'new_customer' && completed === 0) {
      suggestions.push({
        code: promo.code,
        name: promo.name,
        reason: 'Dành cho khách hàng mới (chưa có đơn Hoàn thành)',
        type: 'promo',
      });
      if (!autoApplyCode && (promo.type === 'percent' || promo.type === 'fixed')) autoApplyCode = promo.code;
      continue;
    }

    if (rt === 'repeat_2nd_cup') {
      const minCups = promo.ruleConfig?.minCups != null ? parseInt(promo.ruleConfig.minCups, 10) : 2;
      if (completed >= 1 && cupCount >= minCups) {
        suggestions.push({
          code: promo.code,
          name: promo.name,
          reason: `Khách quay lại - đủ ${minCups} ly trong giỏ`,
          type: 'promo',
        });
      }
      continue;
    }

    if (rt === 'points_redeem_hint' && points >= 10) {
      suggestions.push({
        code: promo.ruleConfig?.redeemCode || 'FREECUP',
        name: 'Đổi 10 điểm → 1 ly nhỏ',
        reason: `Bạn đang có ${Math.floor(points)} điểm (10 điểm = 1 ly size nhỏ)`,
        type: 'promo',
      });
      continue;
    }

    if ((rt === 'buy2get1_any' || rt === 'buy2get1') && cupCount >= 2) {
      suggestions.push({
        code: promo.code,
        name: promo.name,
        reason: 'Giỏ có từ 2 ly - xem điều kiện mã',
        type: 'promo',
      });
    }

    if (rt === 'buy1get1_same') {
      let hasDouble = false;
      cart.forEach((it) => {
        if ((parseInt(it.quantity, 10) || 1) >= 2) hasDouble = true;
      });
      if (hasDouble) {
        suggestions.push({
          code: promo.code,
          name: promo.name,
          reason: 'Cùng loại từ 2 ly trong một dòng',
          type: 'promo',
        });
      }
    }
  }

  if (!allowAuto) autoApplyCode = '';
  return {
    suggestions,
    autoApplyCode,
    visitCount: cust ? parseFloat(cust.visitCount) || 0 : 0,
    completedOrders: completed,
    cupCount,
    points,
  };
}

export async function getCheckoutPromoOptions(phone, cartJson, subtotal) {
  const sub = parseFloat(subtotal) || 0;
  const cartStr = String(cartJson || '[]');
  const p = String(phone || '').replace(/\D/g, '');
  const options = [];
  const seen = {};
  const candidates = [];

  const [sug, promos, personal] = await Promise.all([
    getSuggestedPromosWithContext(p, '', cartStr, sub, false),
    getPromotionsHot(),
    p.length >= 9 ? getPersonalVouchersForPhone(p) : Promise.resolve([]),
  ]);

  for (const s of sug.suggestions || []) {
    if (!s?.code || seen[s.code]) continue;
    if (s.type === 'info') {
      options.push({ code: s.code, title: s.name, subtitle: s.reason, kind: 'info', discount: 0 });
      seen[s.code] = true;
      continue;
    }
    seen[s.code] = true;
    candidates.push({
      code: s.code,
      title: s.name,
      subtitle: s.reason || '',
      kind: 'promo',
    });
  }
  for (const pr of promos) {
    const rt = String(pr.ruleType || '').trim().toLowerCase();
    if (!pr?.code || seen[pr.code]) continue;
    if (rt && rt !== 'manual') continue;
    if (pr.type === 'info') continue;
    seen[pr.code] = true;
    candidates.push({
      code: pr.code,
      title: pr.name,
      subtitle: '',
      kind: 'promo',
    });
  }
  for (const pv of personal) {
    if (!pv?.code || seen[pv.code]) continue;
    seen[pv.code] = true;
    candidates.push({
      code: pv.code,
      title: pv.title || pv.code,
      subtitle: pv.expires ? `HSD ${pv.expires}` : '',
      kind: 'voucher',
      expires: pv.expires,
    });
  }

  const validations = await Promise.all(
    candidates.map(async (c) => {
      const v = await validatePromo(c.code, sub, p, cartStr);
      return { c, v };
    }),
  );
  for (const { c, v } of validations) {
    if (!v.valid) continue;
    options.push({
      code: c.code,
      title: c.title,
      subtitle: (c.subtitle || v.message || '') + (c.expires ? ` · HSD ${c.expires}` : ''),
      kind: c.kind,
      discount: v.discount,
    });
  }
  return { options };
}

export async function applyPromoTemplate(templateId) {
  const id = String(templateId || '').trim().toLowerCase();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 30);
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const s = ymd(start);
  const e = ymd(end);
  const suffix = String(now.getTime()).slice(-4);
  const presets = {
    new_customer: {
      code: `NEW${suffix}`,
      name: 'Khách mới giảm 20%',
      type: 'percent',
      value: 20,
      minOrder: 0,
      startDate: s,
      endDate: e,
      ruleType: 'new_customer',
      ruleConfigJson: '{}',
    },
    group_order_10: {
      code: 'NHOM10',
      name: 'Ưu đãi đơn nhóm -10%',
      type: 'percent',
      value: 10,
      minOrder: 0,
      startDate: s,
      endDate: e,
      ruleType: 'group_order',
      ruleConfigJson: '{"percent":10}',
    },
    feedback_reward_5: {
      code: 'GOPY5',
      name: 'Voucher góp ý -5% (hạn 7 ngày)',
      type: 'percent',
      value: 5,
      minOrder: 0,
      startDate: s,
      endDate: e,
      ruleType: 'feedback_reward',
      ruleConfigJson: '{"percent":5,"validDays":7}',
    },
    welcome_member_5: {
      code: 'TVNEW5',
      name: 'Voucher 5% thành viên mới',
      type: 'percent',
      value: 5,
      minOrder: 0,
      startDate: s,
      endDate: e,
      ruleType: 'welcome_member',
      ruleConfigJson: '{"percent":5,"validDays":30}',
      memberDesc: 'Giảm 5% cho đơn đầu sau khi đăng ký',
      memberCond: 'Tự phát hành khi đăng ký · Hạn 30 ngày · Dùng 1 lần',
      memberVisible: true,
    },
    office_week_streak: {
      code: 'VPSTREAK',
      name: 'Chuỗi văn phòng T2–T5 → voucher T6',
      type: 'info',
      value: 0,
      minOrder: 0,
      startDate: s,
      endDate: e,
      ruleType: 'office_week_streak',
      ruleConfigJson: JSON.stringify({
        streakDays: 4,
        maxFreeAmount: 30000,
        rewardWeekday: 5,
        memberTitle: 'Chuỗi đặt văn phòng',
        memberDescription: 'Mua 4 ngày liên tiếp (T2–T5) → tặng 1 ly miễn phí thứ 6',
        memberConditions: 'Đơn cá nhân & đơn nhóm đều tính · Mất chuỗi = bắt đầu lại thứ 2',
        messageProgress: 'Giữ chuỗi 4 ngày T2–T5 liên tiếp để nhận 1 ly bất kỳ thứ 6',
        messageComplete: 'Đủ chuỗi! Dùng voucher vào thứ 6 để nhận 1 ly miễn phí',
        memberVisible: true,
      }),
      memberDesc: 'Mua 4 ngày liên tiếp (T2–T5) → tặng 1 ly miễn phí thứ 6',
      memberCond: 'Đơn cá nhân & đơn nhóm đều tính · Mất chuỗi = bắt đầu lại thứ 2',
      memberVisible: true,
    },
  };
  const data = presets[id];
  if (!data) return { ok: false, message: `Không có mẫu: ${id}` };
  await savePromotion(data);
  return { ok: true, message: `Đã tạo mã ${data.code}`, code: data.code };
}

export async function getPromoImpactSummary(periodType) {
  const { getOrders } = await import('./orders.js');
  const orders = await getOrders(periodType || 'month');
  const map = {};
  let totalDisc = 0;
  for (const o of orders) {
    const c = String(o.promoCode || '').trim().toUpperCase();
    if (!c) continue;
    const d = parseFloat(o.discount) || 0;
    totalDisc += d;
    if (!map[c]) map[c] = { code: c, orders: 0, promoDiscount: 0, revenue: 0 };
    map[c].orders += 1;
    map[c].promoDiscount += d;
    map[c].revenue += parseFloat(o.finalAmount) || 0;
  }
  const lines = Object.values(map).sort((a, b) => b.promoDiscount - a.promoDiscount);
  return {
    period: periodType || 'month',
    totalPromoDiscount: totalDisc,
    lines,
    note: 'Chi phí KM ≈ tổng giảm giá ghi trên đơn; LN thực tế = doanh thu − vốn (xem tab Giá / báo cáo).',
  };
}

export async function getTodayPromoDigest() {
  const now = new Date();
  const promos = await getPromotions();
  const activeLines = [];
  for (const p of promos) {
    if (String(p.type || '').toLowerCase() === 'info') continue;
    const sd = p.startDate ? new Date(p.startDate) : null;
    const ed = p.endDate ? new Date(p.endDate) : null;
    if (sd && sd > now) continue;
    if (ed && ed < now) continue;
    const off =
      p.type === 'percent'
        ? `${p.value}%`
        : `${(p.value || 0).toLocaleString('vi-VN')}₫`;
    activeLines.push({
      code: p.code,
      name: p.name,
      type: p.type,
      value: p.value,
      minOrder: p.minOrder || 0,
      ruleType: p.ruleType || '',
      discountLabel: off,
      summary: `${p.name} - Mã ${p.code}: giảm ${off}`,
    });
  }

  const { getOrders } = await import('./orders.js');
  const orders = await getOrders('today');
  let ordersWithDiscount = 0;
  let totalDiscount = 0;
  const codeCount = {};
  const hourlyDisc = Array(24).fill(0);
  for (const o of orders) {
    const st = String(o.status || '');
    if (st.indexOf('Hủy') !== -1 || st !== 'Hoàn thành') continue;
    const d = parseFloat(o.discount) || 0;
    if (d <= 0) continue;
    ordersWithDiscount++;
    totalDiscount += d;
    const c = String(o.promoCode || '').trim();
    if (c) codeCount[c] = (codeCount[c] || 0) + 1;
    const th = parseOrderDate(o.time).getHours();
    if (!isNaN(th) && th >= 0 && th < 24) hourlyDisc[th] += d;
  }

  return {
    dateLabel: now.toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }),
    activePromos: activeLines,
    ordersWithPromoToday: ordersWithDiscount,
    totalPromoCostToday: totalDiscount,
    promoCodeUsageToday: codeCount,
    promoDiscountHourlyToday: hourlyDisc,
  };
}

export async function rulePromoConfig(ruleType) {
  const promos = await getPromotionsAdmin();
  const want = String(ruleType || '').trim().toLowerCase();
  const matches = promos.filter(
    (p) => String(p.ruleType || '').trim().toLowerCase() === want
  );
  const now = new Date();
  let active = null;
  let configPromo = matches[0] || null;
  for (const p of matches) {
    if (!p.active) continue;
    if (p.startDate && new Date(p.startDate) > now) continue;
    if (p.endDate && new Date(p.endDate) < now) continue;
    active = active || p;
  }
  if (active) configPromo = active;
  return { found: matches.length > 0, active, configPromo };
}

export async function activeRulePromo(ruleType) {
  const r = await rulePromoConfig(ruleType);
  return { found: r.found, promo: r.active };
}

export async function groupDiscountPct() {
  const { GROUP_DISCOUNT_PCT } = await import('../sheetsMap.js');
  const r = await activeRulePromo('group_order');
  if (!r.found) return GROUP_DISCOUNT_PCT;
  const p = r.promo;
  if (!p) return 0;
  const pct = parseFloat(p.ruleConfig?.percent != null ? p.ruleConfig.percent : p.value) || 0;
  return Math.max(0, Math.min(50, pct));
}

export async function feedbackRewardPct() {
  const r = await activeRulePromo('feedback_reward');
  const p = r.promo;
  if (!p) return 0;
  const pct = parseFloat(p.ruleConfig?.percent != null ? p.ruleConfig.percent : p.value) || 0;
  return Math.max(0, Math.min(50, pct));
}

export async function welcomeMemberRewardLabel() {
  const pct = await welcomeMemberRewardPct();
  if (pct <= 0) return '';
  const days = await welcomeMemberValidDays();
  return `Voucher giảm ${pct}% (hạn ${days} ngày)`;
}

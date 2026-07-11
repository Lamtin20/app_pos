import {
  getSheet,
  getDataRange,
  appendRow,
  updateRow,
} from '../googleSheets.js';
import {
  SUN_REDEEM_VOUCHER_HEADERS,
  SUN_REDEEM_VOUCHER_DAYS,
  SUN_REDEEM_DEFAULT_MAX,
} from '../sheetsMap.js';
import { normalizeVnPhoneDigits } from '../format.js';
import { redeemPoints, getCustomerByPhone } from './customers.js';
import { CACHE } from '../cache.js';

export function sunRedeemValidDays(program) {
  const d = parseInt(program?.validDays, 10);
  return d > 0 ? d : SUN_REDEEM_VOUCHER_DAYS;
}

export function sunRedeemMaxAmount(program) {
  const m = parseFloat(program?.maxAmount);
  return m > 0 ? m : SUN_REDEEM_DEFAULT_MAX;
}

export async function issueSunRedeemVoucher(phone, sunCost, maxAmount, validDays) {
  const ph = normalizeVnPhoneDigits(phone);
  if (!ph || ph.length < 9) return null;
  await getSheet('Voucher đổi Sun', SUN_REDEEM_VOUCHER_HEADERS);
  const code = `DS${(Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)).toUpperCase()}`;
  const now = new Date();
  const days = Math.max(1, parseInt(validDays, 10) || SUN_REDEEM_VOUCHER_DAYS);
  const expires = new Date(now.getTime() + days * 24 * 3600 * 1000);
  const maxAmt = Math.max(1000, parseFloat(maxAmount) || SUN_REDEEM_DEFAULT_MAX);
  await appendRow('Voucher đổi Sun', [
    code,
    ph,
    maxAmt,
    Math.max(1, parseInt(sunCost, 10) || 10),
    now,
    expires,
    'Chưa dùng',
    '',
  ]);
  return {
    code,
    maxAmount: maxAmt,
    sunCost: Math.max(1, parseInt(sunCost, 10) || 10),
    expires: expires.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    validDays: days,
  };
}

/** Đổi Sun → voucher 1 ly (hạn 30 ngày mặc định). */
export async function redeemSunForVoucher(phoneRaw, program) {
  const phone = normalizeVnPhoneDigits(phoneRaw);
  if (!phone || phone.length < 9) return { ok: false, message: 'SĐT không hợp lệ' };
  const sunCost = Math.max(1, parseInt(program?.sun, 10) || 10);
  const cust = await getCustomerByPhone(phone);
  const balance = parseInt(cust?.points ?? cust?.cups, 10) || 0;
  if (balance < sunCost) {
    return { ok: false, message: `Không đủ Sun (cần ${sunCost}, đang có ${balance})` };
  }
  const deduct = await redeemPoints(phone, sunCost);
  if (!deduct?.success) return { ok: false, message: deduct?.message || 'Không trừ được Sun' };
  const voucher = await issueSunRedeemVoucher(
    phone,
    sunCost,
    sunRedeemMaxAmount(program),
    sunRedeemValidDays(program),
  );
  if (!voucher) {
    return { ok: false, message: 'Không tạo được voucher — liên hệ quầy để được hỗ trợ' };
  }
  CACHE.clear(['customers_v1', `portal_lookup_${phone}`]);
  const after = await getCustomerByPhone(phone);
  const pointsRemaining = parseInt(after?.points ?? after?.cups, 10) || 0;
  return {
    ok: true,
    message: `Đã đổi ${sunCost} Sun — voucher ${voucher.code}`,
    voucher,
    sunDeducted: sunCost,
    pointsRemaining,
  };
}

export async function validateSunRedeemVoucher(code, orderAmount, itemsJson) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^DS[A-Z0-9]{4,10}$/.test(c)) return null;
  await getSheet('Voucher đổi Sun', SUN_REDEEM_VOUCHER_HEADERS);
  const rows = await getDataRange('Voucher đổi Sun');
  const now = new Date();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0] || '').trim().toUpperCase() !== c) continue;
    const status = String(rows[i][6] || '').trim();
    if (status !== 'Chưa dùng')
      return { valid: false, message: 'Voucher đổi Sun này đã được sử dụng rồi!' };
    const exp = new Date(rows[i][5]);
    if (!isNaN(exp.getTime()) && exp < now)
      return { valid: false, message: 'Voucher đổi Sun đã hết hạn!' };
    const maxAmt = Math.max(0, parseFloat(rows[i][2]) || SUN_REDEEM_DEFAULT_MAX);
    let items = [];
    try {
      items = JSON.parse(String(itemsJson || '[]'));
    } catch {
      items = [];
    }
    let best = 0;
    items.forEach((it) => {
      const unit = parseFloat(it.price) || 0;
      const qty = parseInt(it.qty, 10) || parseInt(it.quantity, 10) || 1;
      const line = unit * qty;
      if (unit > 0 && unit <= maxAmt && line > best) best = Math.min(line, maxAmt);
    });
    if (!best) {
      return {
        valid: false,
        message: `Cần có món dưới ${maxAmt.toLocaleString('vi-VN')}đ trong giỏ để dùng voucher!`,
      };
    }
    return {
      valid: true,
      discount: best,
      message: `Voucher đổi Sun — Miễn phí 1 ly (giảm ${best.toLocaleString('vi-VN')}đ)`,
    };
  }
  return { valid: false, message: `Không tìm thấy voucher ${c}!` };
}

export async function markSunRedeemVoucherUsed(code, orderId) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^DS[A-Z0-9]{4,10}$/.test(c)) return;
  const rows = await getDataRange('Voucher đổi Sun');
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0] || '').trim().toUpperCase() === c) {
      await updateRow('Voucher đổi Sun', i + 1, [
        rows[i][0],
        rows[i][1],
        rows[i][2],
        rows[i][3],
        rows[i][4],
        rows[i][5],
        'Đã dùng',
        String(orderId || ''),
      ]);
      return;
    }
  }
}

export async function getSunRedeemVouchersForPhone(phone) {
  const ph = normalizeVnPhoneDigits(phone);
  if (!ph || ph.length < 9) return [];
  await getSheet('Voucher đổi Sun', SUN_REDEEM_VOUCHER_HEADERS);
  const rows = await getDataRange('Voucher đổi Sun');
  const out = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    if (normalizeVnPhoneDigits(rows[i][1]) !== ph) continue;
    if (String(rows[i][6] || '').trim() !== 'Chưa dùng') continue;
    const exp = new Date(rows[i][5]);
    if (!isNaN(exp.getTime()) && exp < new Date()) continue;
    const code = String(rows[i][0] || '').trim().toUpperCase();
    if (!code) continue;
    out.push({
      code,
      maxAmount: parseFloat(rows[i][2]) || SUN_REDEEM_DEFAULT_MAX,
      kind: 'sun_redeem',
      title: 'Voucher đổi Sun (1 ly)',
      expires: exp.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    });
  }
  return out;
}

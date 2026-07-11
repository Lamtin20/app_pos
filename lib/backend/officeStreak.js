import {
  getSheet,
  getDataRange,
  appendRow,
  updateRow,
} from '../googleSheets.js';
import {
  OFFICE_STREAK_TRACK_HEADERS,
  OFFICE_STREAK_VOUCHER_HEADERS,
} from '../sheetsMap.js';
import { normalizeVnPhoneDigits } from '../format.js';

function mondayKey(d) {
  const dt = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().slice(0, 10);
}

function endOfFriday(d) {
  const mon = new Date(mondayKey(d) + 'T12:00:00');
  const fri = new Date(mon);
  fri.setDate(fri.getDate() + 4);
  fri.setHours(23, 59, 59, 999);
  return fri;
}

export async function officeStreakConfig() {
  const { activeRulePromo } = await import('./promotions.js');
  const r = await activeRulePromo('office_week_streak');
  const p = r.promo;
  const cfg = p?.ruleConfig || {};
  return {
    active: !!p && (p.active !== false),
    maxFreeAmount: Math.max(1000, parseFloat(cfg.maxFreeAmount ?? cfg.maxPrice ?? 30000) || 30000),
    streakDays: parseInt(cfg.streakDays, 10) || 4,
    rewardWeekday: parseInt(cfg.rewardWeekday, 10) || 5,
  };
}

async function findTrackRow(phone, weekMon) {
  await getSheet('Chuỗi VP', OFFICE_STREAK_TRACK_HEADERS);
  const rows = await getDataRange('Chuỗi VP');
  for (let i = rows.length - 1; i >= 1; i--) {
    if (normalizeVnPhoneDigits(rows[i][0]) !== phone) continue;
    if (String(rows[i][1] || '').slice(0, 10) === weekMon) return { row: i + 1, values: rows[i] };
  }
  return null;
}

async function upsertTrack(phone, weekMon, streak, voucherCode) {
  await getSheet('Chuỗi VP', OFFICE_STREAK_TRACK_HEADERS);
  const found = await findTrackRow(phone, weekMon);
  const now = new Date();
  const row = [phone, weekMon, streak, voucherCode || '', now];
  if (found) {
    await updateRow('Chuỗi VP', found.row, row);
    return found.row;
  }
  await appendRow('Chuỗi VP', row);
  return -1;
}

export async function issueOfficeStreakVoucher(phone, maxAmount) {
  const ph = normalizeVnPhoneDigits(phone);
  if (!ph || ph.length < 9) return null;
  await getSheet('Voucher chuỗi VP', OFFICE_STREAK_VOUCHER_HEADERS);
  const code = `CL${(Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)).toUpperCase()}`;
  const now = new Date();
  const expires = endOfFriday(now);
  await appendRow('Voucher chuỗi VP', [
    code,
    ph,
    maxAmount,
    now,
    expires,
    'Chưa dùng',
    '',
  ]);
  return {
    code,
    maxAmount,
    expires: expires.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
  };
}

/** Ghi nhận đơn T2–T5 để tích chuỗi; đủ 4 ngày liên tiếp thì tặng voucher dùng thứ 6. */
export async function recordOfficeStreakOrder(phoneRaw, orderTime, items) {
  const cfg = await officeStreakConfig();
  if (!cfg.active) return null;
  const phone = normalizeVnPhoneDigits(phoneRaw);
  if (!phone || phone.length < 9) return null;
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return null;

  const when = orderTime instanceof Date ? orderTime : new Date(orderTime || Date.now());
  const dow = when.getDay();
  if (dow < 1 || dow > 4) return null;

  const weekMon = mondayKey(when);
  const found = await findTrackRow(phone, weekMon);
  let streak = found ? parseInt(found.values[2], 10) || 0 : 0;
  const existingVoucher = found ? String(found.values[3] || '').trim() : '';

  if (dow === 1) streak = 1;
  else if (dow === 2) streak = streak >= 1 ? 2 : 0;
  else if (dow === 3) streak = streak >= 2 ? 3 : 0;
  else if (dow === 4) streak = streak >= 3 ? 4 : 0;

  let voucher = null;
  if (streak >= cfg.streakDays && !existingVoucher) {
    voucher = await issueOfficeStreakVoucher(phone, cfg.maxFreeAmount);
    await upsertTrack(phone, weekMon, streak, voucher.code);
    return voucher;
  }
  await upsertTrack(phone, weekMon, streak, existingVoucher);
  return null;
}

export async function validateOfficeStreakVoucher(code, orderAmount, itemsJson) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^CL[A-Z0-9]{4,10}$/.test(c)) return null;
  const cfg = await officeStreakConfig();
  if (!cfg.active) return { valid: false, message: 'Chương trình chuỗi văn phòng chưa được bật!' };

  const now = new Date();
  if (now.getDay() !== cfg.rewardWeekday) {
    return { valid: false, message: 'Voucher chuỗi văn phòng chỉ dùng được vào thứ 6!' };
  }

  await getSheet('Voucher chuỗi VP', OFFICE_STREAK_VOUCHER_HEADERS);
  const rows = await getDataRange('Voucher chuỗi VP');
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0] || '').trim().toUpperCase() !== c) continue;
    const status = String(rows[i][5] || '').trim();
    if (status !== 'Chưa dùng')
      return { valid: false, message: 'Voucher chuỗi này đã được sử dụng rồi!' };
    const exp = new Date(rows[i][4]);
    if (!isNaN(exp.getTime()) && exp < now)
      return { valid: false, message: 'Voucher chuỗi đã hết hạn (chỉ dùng trong thứ 6)!' };
    const maxAmt = Math.max(0, parseFloat(rows[i][2]) || cfg.maxFreeAmount);

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
      message: `Voucher chuỗi VP - Miễn phí 1 ly (giảm ${best.toLocaleString('vi-VN')}đ)`,
    };
  }
  return { valid: false, message: `Không tìm thấy voucher ${c}!` };
}

export async function markOfficeStreakVoucherUsed(code, orderId) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^CL[A-Z0-9]{4,10}$/.test(c)) return;
  const rows = await getDataRange('Voucher chuỗi VP');
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0] || '').trim().toUpperCase() === c) {
      await updateRow('Voucher chuỗi VP', i + 1, [
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

export async function getOfficeStreakVouchersForPhone(phone) {
  const ph = normalizeVnPhoneDigits(phone);
  if (!ph || ph.length < 9) return [];
  await getSheet('Voucher chuỗi VP', OFFICE_STREAK_VOUCHER_HEADERS);
  const rows = await getDataRange('Voucher chuỗi VP');
  const out = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    if (normalizeVnPhoneDigits(rows[i][1]) !== ph) continue;
    if (String(rows[i][5] || '').trim() !== 'Chưa dùng') continue;
    const exp = new Date(rows[i][4]);
    if (!isNaN(exp.getTime()) && exp < new Date()) continue;
    const code = String(rows[i][0] || '').trim().toUpperCase();
    if (!code) continue;
    out.push({
      code,
      maxAmount: parseFloat(rows[i][2]) || 30000,
      kind: 'office_streak',
      title: 'Voucher chuỗi văn phòng (T6)',
      expires: exp.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    });
  }
  return out;
}

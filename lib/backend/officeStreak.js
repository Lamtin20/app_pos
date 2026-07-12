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
import CACHE from '../cache.js';

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

const STREAK_DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const OFFICE_STREAK_DEFAULTS = {
  memberTitle: 'Chuỗi đặt văn phòng',
  memberDescription: 'Mua 4 ngày liên tiếp (T2–T5) → tặng 1 ly miễn phí thứ 6',
  memberConditions: 'Đơn cá nhân & đơn nhóm đều tính · Mất chuỗi = bắt đầu lại thứ 2',
  messageProgress: 'Giữ chuỗi 4 ngày T2–T5 liên tiếp để nhận 1 ly bất kỳ thứ 6',
  messageComplete: 'Đủ chuỗi! Dùng voucher vào thứ 6 để nhận 1 ly miễn phí',
  streakDays: 4,
  maxFreeAmount: 30000,
  rewardWeekday: 5,
  memberVisible: true,
};

export async function officeStreakConfig() {
  const { rulePromoConfig } = await import('./promotions.js');
  const r = await rulePromoConfig('office_week_streak');
  const p = r.configPromo;
  const cfg = p?.ruleConfig || {};
  const streakDays = parseInt(cfg.streakDays, 10) || OFFICE_STREAK_DEFAULTS.streakDays;
  const rewardWeekday = parseInt(cfg.rewardWeekday, 10);
  const rewardDow = Number.isFinite(rewardWeekday) ? rewardWeekday : OFFICE_STREAK_DEFAULTS.rewardWeekday;
  const rewardLabel = WEEKDAY_LABELS[rewardDow] || 'Thứ 6';
  const useDefaults = !r.found;
  return {
    configured: r.found,
    active: !!r.active,
    memberVisible: useDefaults ? true : cfg.memberVisible !== false,
    title: String(cfg.memberTitle || p?.name || OFFICE_STREAK_DEFAULTS.memberTitle).trim(),
    memberDescription: String(cfg.memberDescription || OFFICE_STREAK_DEFAULTS.memberDescription).trim(),
    memberConditions: String(cfg.memberConditions || OFFICE_STREAK_DEFAULTS.memberConditions).trim(),
    messageProgress: String(cfg.messageProgress || OFFICE_STREAK_DEFAULTS.messageProgress).trim(),
    messageComplete: String(cfg.messageComplete || OFFICE_STREAK_DEFAULTS.messageComplete).trim(),
    maxFreeAmount: Math.max(
      1000,
      parseFloat(cfg.maxFreeAmount ?? cfg.maxPrice ?? OFFICE_STREAK_DEFAULTS.maxFreeAmount) ||
        OFFICE_STREAK_DEFAULTS.maxFreeAmount
    ),
    streakDays,
    rewardWeekday: rewardDow,
    rewardLabel,
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
    CACHE.clear(`portal_lookup_${phone}`);
    return voucher;
  }
  await upsertTrack(phone, weekMon, streak, existingVoucher);
  CACHE.clear(`portal_lookup_${phone}`);
  return null;
}

export function parseDeliveryAtFromNote(note) {
  const m = String(note || '').match(/GIAO_AT:([^|]+)/i);
  if (!m) return null;
  const d = new Date(String(m[1]).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Ghi chuỗi khi đơn chuyển Hoàn thành (đơn lẻ hoặc nhóm). */
export async function recordOfficeStreakForCompletedOrder(payload) {
  const cfg = await officeStreakConfig();
  if (!cfg.active) return null;
  const p = payload || {};
  const items = Array.isArray(p.items) ? p.items : [];
  const note = String(p.note || '');
  const orderTime = p.orderTime instanceof Date ? p.orderTime : new Date(p.orderTime || Date.now());
  const effectiveTime = parseDeliveryAtFromNote(note) || orderTime;
  const isGroup = note.indexOf('[GROUP:') >= 0;

  if (isGroup && items.length) {
    const byPhone = {};
    items.forEach((it) => {
      const ph = normalizeVnPhoneDigits(it.groupMemberPhone || '');
      if (!ph || ph.length < 9) return;
      if (!byPhone[ph]) byPhone[ph] = [];
      byPhone[ph].push(it);
    });
    const vouchers = [];
    for (const ph of Object.keys(byPhone)) {
      const v = await recordOfficeStreakOrder(ph, effectiveTime, byPhone[ph]);
      if (v) vouchers.push(v);
    }
    return vouchers.length ? vouchers : null;
  }

  const phone = normalizeVnPhoneDigits(p.customerPhone);
  if (!phone || phone.length < 9 || !items.length) return null;
  return recordOfficeStreakOrder(phone, effectiveTime, items);
}

function buildStreakDays(cfg, streak, todayDow) {
  const maxDays = Math.max(2, Math.min(7, parseInt(cfg.streakDays, 10) || 4));
  return Array.from({ length: maxDays }, (_, idx) => {
    const weekday = idx + 1;
    return {
      label: STREAK_DAY_LABELS[idx] || `D${weekday}`,
      weekday,
      done: streak >= weekday,
      current: todayDow === weekday,
    };
  });
}

function defaultStreakMessage(cfg, streak) {
  const days = cfg.streakDays || 4;
  const reward = cfg.rewardLabel || 'Thứ 6';
  if (streak >= days) {
    return (
      cfg.messageComplete ||
      `Đủ chuỗi! Dùng voucher vào ${reward} để nhận 1 ly miễn phí`
    );
  }
  return (
    cfg.messageProgress ||
    `Giữ chuỗi ${days} ngày T2–T5 liên tiếp để nhận 1 ly bất kỳ ${reward}`
  );
}

export async function getOfficeStreakProgressForPhone(phoneRaw) {
  const cfg = await officeStreakConfig();
  const phone = normalizeVnPhoneDigits(phoneRaw);
  const hidden = {
    active: false,
    streak: 0,
    maxDays: cfg.streakDays || 4,
    days: [],
    voucherCode: null,
    title: cfg.title,
    description: cfg.memberDescription,
    conditions: cfg.memberConditions,
  };
  if (!phone || phone.length < 9) return hidden;
  if (!cfg.active || cfg.memberVisible === false) return hidden;

  const now = new Date();
  const weekMon = mondayKey(now);
  const found = await findTrackRow(phone, weekMon);
  const streak = found ? Math.max(0, parseInt(found.values[2], 10) || 0) : 0;
  const voucherCode = found ? String(found.values[3] || '').trim() : '';
  const todayDow = now.getDay();

  const days = buildStreakDays(cfg, streak, todayDow);

  let voucherExpires = '';
  if (voucherCode) {
    await getSheet('Voucher chuỗi VP', OFFICE_STREAK_VOUCHER_HEADERS);
    const rows = await getDataRange('Voucher chuỗi VP');
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0] || '').trim().toUpperCase() !== voucherCode) continue;
      const exp = new Date(rows[i][4]);
      if (!Number.isNaN(exp.getTime())) {
        voucherExpires = exp.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      }
      break;
    }
  }

  return {
    active: true,
    streak,
    maxDays: cfg.streakDays,
    weekMon,
    days,
    voucherCode: voucherCode || null,
    voucherExpires: voucherExpires || null,
    maxFreeAmount: cfg.maxFreeAmount,
    rewardWeekday: cfg.rewardWeekday,
    rewardLabel: cfg.rewardLabel,
    title: cfg.title,
    description: cfg.memberDescription,
    conditions: cfg.memberConditions,
    message: defaultStreakMessage(cfg, streak),
  };
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
  const cfg = await officeStreakConfig();
  if (!cfg.active) return [];
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
      maxAmount: parseFloat(rows[i][2]) || cfg.maxFreeAmount || 30000,
      kind: 'office_streak',
      title: `Voucher chuỗi văn phòng (${cfg.rewardLabel || 'T6'})`,
      expires: exp.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    });
  }
  return out;
}

/** Formatting utilities ported from GAS */

export const TZ = 'Asia/Ho_Chi_Minh';

export function normalizeVnPhoneDigits(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('84') === 0 && d.length >= 10) d = '0' + d.slice(2);
  if (d.length === 9 && d.charAt(0) !== '0') d = '0' + d;
  return d;
}

export function fmtVnd(n) {
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n || 0);
  } catch {
    return `${Math.round(n || 0)}₫`;
  }
}

export function formatDateTz(date, pattern = 'dd/MM/yyyy HH:mm') {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const opts = { timeZone: TZ };
  if (pattern === 'yyyy-MM-dd') {
    return d.toLocaleDateString('en-CA', opts);
  }
  if (pattern === 'EEEE dd/MM/yyyy') {
    return d.toLocaleDateString('vi-VN', { ...opts, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (pattern === 'dd/MM') {
    return d.toLocaleDateString('vi-VN', { ...opts, day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleString('vi-VN', {
    ...opts,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function safeNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/** Làm tròn tiền giảm theo % về hàng nghìn (VD 870đ → 1000đ). */
export function roundDiscountToThousand(amount) {
  const n = Math.max(0, parseFloat(amount) || 0);
  if (n <= 0) return 0;
  return Math.round(n / 1000) * 1000;
}

export function safeJsonParse(s, fallback) {
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

export function parseBoolCell(v, defaultVal) {
  if (v === '' || v === undefined || v === null) return defaultVal;
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const u = String(v).trim().toUpperCase();
  if (u === 'TRUE' || u === 'CÓ' || u === 'YES' || u === '1' || u === 'ON') return true;
  if (u === 'FALSE' || u === 'KHÔNG' || u === 'NO' || u === '0' || u === 'OFF') return false;
  return defaultVal;
}

export function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sunMaskSecret(s) {
  s = String(s || '');
  if (!s) return '';
  if (s.length <= 10) return '••••••••';
  return s.substring(0, 4) + '…' + s.substring(s.length - 4);
}

export function normalizeSunDriveFolderId(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const m1 = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]+$/.test(s)) return s;
  return s.replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Parse order/sheet dates (VN DD/MM/YYYY support). */
export function parseOrderDate(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number' && !isNaN(v)) {
    if (v > 20000 && v < 800000) {
      return new Date((v - 25569) * 86400 * 1000);
    }
    if (v > 946684800000) {
      const dNum = new Date(v);
      if (!isNaN(dNum.getTime())) return dNum;
    }
  }
  const s = v != null ? String(v).trim() : '';
  if (!s) return new Date(0);

  if (/^\d{4}[\/\-.]/.test(s)) {
    const mIso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (mIso) {
      const d1 = new Date(
        parseInt(mIso[1], 10),
        parseInt(mIso[2], 10) - 1,
        parseInt(mIso[3], 10),
        mIso[4] != null ? parseInt(mIso[4], 10) : 0,
        mIso[5] != null ? parseInt(mIso[5], 10) : 0,
        mIso[6] != null ? parseInt(mIso[6], 10) : 0,
      );
      if (!isNaN(d1.getTime())) return d1;
    }
  } else {
    const mDdMm = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (mDdMm) {
      let y0 = parseInt(mDdMm[3], 10);
      if (y0 < 100) y0 += 2000;
      const d0 = new Date(
        y0,
        parseInt(mDdMm[2], 10) - 1,
        parseInt(mDdMm[1], 10),
        mDdMm[4] != null ? parseInt(mDdMm[4], 10) : 0,
        mDdMm[5] != null ? parseInt(mDdMm[5], 10) : 0,
        mDdMm[6] != null ? parseInt(mDdMm[6], 10) : 0,
      );
      if (!isNaN(d0.getTime())) return d0;
    }
  }
  const d2 = new Date(s);
  if (!isNaN(d2.getTime()) && d2.getFullYear() >= 2000) return d2;
  return new Date(0);
}

export function periodRange(type, now) {
  const d = now ? new Date(now) : new Date();
  if (type === 'today') {
    return {
      start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0),
      end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
    };
  }
  if (type === 'week') {
    const day = d.getDay() || 7;
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (day - 1));
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000 + 86399000);
    return { start, end };
  }
  if (type === 'month') {
    return {
      start: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  if (type === 'ytd') {
    return {
      start: new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0),
      end: new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }
  return {
    start: new Date(2000, 0, 1, 0, 0, 0, 0),
    end: new Date(2100, 0, 1, 0, 0, 0, 0),
  };
}

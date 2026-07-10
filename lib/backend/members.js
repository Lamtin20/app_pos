import CACHE from '../cache.js';
import { getProperty, setProperty } from '../properties.js';
import {
  getSheet,
  getDataRange,
  appendRow,
  updateRow,
  updateCell,
} from '../googleSheets.js';
import {
  CUSTOMERS_HEADERS,
  MEMBER_CUSTOMER_EXT_HEADERS,
  MEMBER_PORTAL_PROP_KEY,
  MEMBER_PORTAL_CMS_KEY,
  MEMBER_DELIVERY_ZONES_KEY,
} from '../sheetsMap.js';
import { normalizeVnPhoneDigits, formatDateTz } from '../format.js';
import {
  defaultMenuLabelCatalog,
  defaultMenuTagCatalog,
  normalizeMenuLabelCatalog,
  normalizeMenuTagCatalog,
  getMenu,
} from './menu.js';
import { getMembershipPackages } from './membership.js';
import { getPromotions } from './promotions.js';
import { lookupMembershipByPhone } from './membership.js';
import { saveCustomer, getCustomerByPhone } from './customers.js';

async function ensureCustomerExtColumns() {
  await getSheet('Customers', CUSTOMERS_HEADERS);
  const all = await getDataRange('Customers');
  if (!all.length) return;
  let headers = [...all[0]];
  let changed = false;
  for (const title of MEMBER_CUSTOMER_EXT_HEADERS) {
    if (headers.indexOf(title) === -1) {
      headers.push(title);
      changed = true;
    }
  }
  if (changed) await updateRow('Customers', 1, headers);
}

function parseProfileLock(raw) {
  try {
    const o = JSON.parse(String(raw || '{}'));
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function readMemberCodeFromRow(row, headers, phone) {
  const ix = headers.indexOf('Mã HV');
  const code = ix >= 0 ? String(row[ix] || '').trim().toUpperCase() : '';
  if (code && code.indexOf('DEL_') !== 0) return code;
  return ensureMemberCodeForPhone(phone);
}

function customerRowToProfile(row, headers) {
  const ix = (n) => headers.indexOf(n);
  const phone = normalizeVnPhoneDigits(row[ix('SĐT')]);
  const lock = parseProfileLock(row[ix('Khóa hồ sơ')] != null ? row[ix('Khóa hồ sơ')] : '');
  const dob = row[ix('Ngày sinh')];
  let dobStr = '';
  if (dob instanceof Date && !isNaN(dob.getTime())) {
    dobStr = formatDateTz(dob, 'yyyy-MM-dd');
  } else if (dob) dobStr = String(dob).slice(0, 10);
  let addrJson = [];
  try {
    const aj = JSON.parse(String(row[ix('Địa chỉ JSON')] || '[]'));
    if (Array.isArray(aj)) addrJson = aj;
  } catch {
    addrJson = [];
  }
  const avatarIx = ix('Ảnh đại diện');
  return {
    phone,
    name: String(row[ix('Tên')] || '').trim(),
    email: String(row[ix('Email')] || '').trim(),
    dob: dobStr,
    gender: String(row[ix('Giới tính')] || '').trim(),
    avatarUrl: avatarIx >= 0 ? String(row[avatarIx] || '').trim() : '',
    points: parseInt(row[ix('Điểm')], 10) || 0,
    tier: String(row[ix('Hạng')] || '').trim() || 'Thành viên',
    totalSpent: parseFloat(row[ix('Tổng chi tiêu')]) || 0,
    visitCount: parseInt(row[ix('Số lần ghé')], 10) || 0,
    addresses: addrJson,
    locked: { email: false, dob: !!lock.dob || !!dobStr, phone: !!lock.phone || true },
    memberCode: '',
  };
}

function generateMemberCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = 'SUN';
  for (let i = 0; i < 10; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

async function memberCodeExists(code) {
  await ensureCustomerExtColumns();
  const data = await getDataRange('Customers');
  const headers = data[0].map((h) => String(h || '').trim());
  const ix = headers.indexOf('Mã HV');
  if (ix < 0) return false;
  const cu = String(code || '').trim().toUpperCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][ix] || '').trim().toUpperCase() === cu) return true;
  }
  return false;
}

export async function ensureMemberCodeForPhone(phoneRaw) {
  const phone = normalizeVnPhoneDigits(phoneRaw);
  if (!phone || phone.length < 9) return '';
  await ensureCustomerExtColumns();
  const data = await getDataRange('Customers');
  const headers = data[0].map((h) => String(h || '').trim());
  const ixPhone = headers.indexOf('SĐT');
  const ixCode = headers.indexOf('Mã HV');
  for (let i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits(data[i][ixPhone]) === phone) {
      const existing = ixCode >= 0 ? String(data[i][ixCode] || '').trim().toUpperCase() : '';
      if (existing && existing.indexOf('DEL_') !== 0) return existing;
      let code = '';
      for (let t = 0; t < 12; t++) {
        code = generateMemberCode();
        if (!(await memberCodeExists(code))) break;
      }
      if (ixCode >= 0) await updateCell('Customers', i + 1, ixCode + 1, code);
      CACHE.clear('customers_v1');
      return code;
    }
  }
  return generateMemberCode();
}

export async function getCustomerByMemberCode(codeRaw) {
  const code = String(codeRaw || '').trim().toUpperCase().replace(/\s/g, '');
  if (!code || code.length < 6) return null;
  await ensureCustomerExtColumns();
  const data = await getDataRange('Customers');
  const headers = data[0].map((h) => String(h || '').trim());
  const ixCode = headers.indexOf('Mã HV');
  const ixPhone = headers.indexOf('SĐT');
  if (ixCode < 0) return null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][ixCode] || '').trim().toUpperCase() === code) {
      return {
        phone: normalizeVnPhoneDigits(data[i][ixPhone]),
        name: String(data[i][headers.indexOf('Tên')] || '').trim(),
        memberCode: code,
        tier: String(data[i][headers.indexOf('Hạng')] || '').trim() || 'Thành viên',
        points: parseInt(data[i][headers.indexOf('Điểm')], 10) || 0,
      };
    }
  }
  return null;
}

export async function resolveCustomerIdentifier(inputRaw) {
  const s = String(inputRaw || '').trim();
  if (!s) return { ok: false, message: 'Chưa nhập mã hoặc SĐT' };
  const digits = normalizeVnPhoneDigits(s);
  if (digits.length >= 9) {
    const code = await ensureMemberCodeForPhone(digits);
    const prof = await getMemberProfile(digits);
    const p = prof.profile || {};
    return {
      ok: true,
      phone: digits,
      memberCode: p.memberCode || code,
      name: p.name || '',
      points: p.points || 0,
      tier: p.tier || 'Thành viên',
    };
  }
  const byCode = await getCustomerByMemberCode(s);
  if (byCode) {
    return {
      ok: true,
      phone: byCode.phone,
      memberCode: byCode.memberCode,
      name: byCode.name,
      points: byCode.points,
      tier: byCode.tier,
    };
  }
  return { ok: false, message: 'Không tìm thấy khách - kiểm tra SĐT hoặc mã vạch' };
}

export async function getMemberProfile(phoneRaw) {
  const phone = normalizeVnPhoneDigits(phoneRaw);
  if (!phone || phone.length < 9) throw new Error('SĐT không hợp lệ');
  await ensureCustomerExtColumns();
  const data = await getDataRange('Customers');
  const headers = data[0].map((h) => String(h || '').trim());
  for (let i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits(data[i][headers.indexOf('SĐT')]) === phone) {
      const profile = customerRowToProfile(data[i], headers);
      profile.memberCode = await ensureMemberCodeForPhone(phone);
      return { ok: true, profile };
    }
  }
  return {
    ok: true,
    profile: {
      phone,
      name: '',
      email: '',
      dob: '',
      gender: '',
      avatarUrl: '',
      points: 0,
      tier: 'Thành viên',
      totalSpent: 0,
      visitCount: 0,
      addresses: [],
      locked: { email: false, dob: false, phone: true },
      memberCode: await ensureMemberCodeForPhone(phone),
    },
  };
}

export async function saveMemberProfile(phoneRaw, patch) {
  const phone = normalizeVnPhoneDigits(phoneRaw);
  if (!phone || phone.length < 9) throw new Error('SĐT không hợp lệ');
  const p = patch && typeof patch === 'object' ? patch : {};
  await ensureCustomerExtColumns();
  const data = await getDataRange('Customers');
  const headers = data[0].map((h) => String(h || '').trim());
  const ix = (n) => headers.indexOf(n);
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits(data[i][ix('SĐT')]) === phone) {
      rowIdx = i + 1;
      break;
    }
  }
  if (rowIdx < 0) {
    await saveCustomer({ phone, name: String(p.name || '').trim() || 'Khách hàng' });
    return getMemberProfile(phone);
  }
  const row = data[rowIdx - 1].slice();
  if (p.name != null) row[ix('Tên')] = String(p.name).trim();
  if (p.email != null && ix('Email') >= 0) row[ix('Email')] = String(p.email).trim();
  const dobIx = ix('Ngày sinh');
  const lockIx = ix('Khóa hồ sơ');
  let existingDob = '';
  if (dobIx >= 0) {
    const rawDob = row[dobIx];
    if (rawDob instanceof Date && !isNaN(rawDob.getTime())) existingDob = formatDateTz(rawDob, 'yyyy-MM-dd');
    else if (rawDob) existingDob = String(rawDob).slice(0, 10);
  }
  if (p.dob != null && dobIx >= 0 && !existingDob) {
    const nextDob = String(p.dob).trim().slice(0, 10);
    if (nextDob) {
      row[dobIx] = nextDob;
      if (lockIx >= 0) {
        const lockObj = parseProfileLock(row[lockIx]);
        lockObj.dob = true;
        row[lockIx] = JSON.stringify(lockObj);
      }
    }
  }
  if (p.gender != null && ix('Giới tính') >= 0) row[ix('Giới tính')] = String(p.gender).trim();
  if (p.avatarUrl != null && ix('Ảnh đại diện') >= 0) {
    const av = String(p.avatarUrl || '').trim();
    if (av.length <= 120000) row[ix('Ảnh đại diện')] = av;
    else throw new Error('Ảnh đại diện quá lớn — chọn ảnh nhỏ hơn');
  }
  if (p.addresses != null && ix('Địa chỉ JSON') >= 0)
    row[ix('Địa chỉ JSON')] = JSON.stringify(p.addresses);
  await updateRow('Customers', rowIdx, row);
  CACHE.clear('customers_v1');
  return getMemberProfile(phone);
}

function customerPhoneTaken(phone, data, headers, skipRowIdx) {
  const ixPhone = headers.indexOf('SĐT');
  if (ixPhone < 0) return false;
  const want = normalizeVnPhoneDigits(phone);
  for (let i = 1; i < data.length; i++) {
    if (skipRowIdx != null && i + 1 === skipRowIdx) continue;
    const cell = String(data[i][ixPhone] || '').trim();
    if (cell.indexOf('DEL_') === 0) continue;
    if (normalizeVnPhoneDigits(cell) === want) return true;
  }
  return false;
}

export async function changeMemberPhone(oldPhoneRaw, newPhoneRaw) {
  const oldPhone = normalizeVnPhoneDigits(oldPhoneRaw);
  const newPhone = normalizeVnPhoneDigits(newPhoneRaw);
  if (!oldPhone || oldPhone.length < 9) throw new Error('SĐT hiện tại không hợp lệ');
  if (!newPhone || !/^0\d{9}$/.test(newPhone)) throw new Error('SĐT mới phải đủ 10 số, bắt đầu bằng 0');
  if (oldPhone === newPhone) throw new Error('SĐT mới trùng SĐT hiện tại');
  await ensureCustomerExtColumns();
  const data = await getDataRange('Customers');
  const headers = data[0].map((h) => String(h || '').trim());
  const ixPhone = headers.indexOf('SĐT');
  if (ixPhone < 0) throw new Error('Thiếu cột SĐT trong sheet Khách hàng');
  if (customerPhoneTaken(newPhone, data, headers, null)) {
    throw new Error('SĐT này đã được đăng ký bởi tài khoản khác');
  }
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits(data[i][ixPhone]) === oldPhone) {
      rowIdx = i + 1;
      break;
    }
  }
  if (rowIdx < 0) throw new Error('Không tìm thấy hồ sơ SĐT hiện tại');
  await updateCell('Customers', rowIdx, ixPhone + 1, newPhone);
  CACHE.clear('customers_v1');
  return getMemberProfile(newPhone);
}

export async function deleteMemberAccount(phoneRaw) {
  const phone = normalizeVnPhoneDigits(phoneRaw);
  if (!phone || phone.length < 9) throw new Error('SĐT không hợp lệ');
  await ensureCustomerExtColumns();
  const data = await getDataRange('Customers');
  const headers = data[0].map((h) => String(h || '').trim());
  const ixPhone = headers.indexOf('SĐT');
  const ixNote = headers.indexOf('Ghi chú');
  for (let i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits(data[i][ixPhone]) === phone) {
      const row = data[i].slice();
      row[ixPhone] = 'DEL_' + phone + '_' + Date.now();
      if (ixNote >= 0) row[ixNote] = 'Đã yêu cầu xóa tài khoản';
      await updateRow('Customers', i + 1, row);
      CACHE.clear('customers_v1');
      return { ok: true, message: 'Đã ghi nhận yêu cầu xóa tài khoản.' };
    }
  }
  return { ok: true, message: 'Không có hồ sơ - đã xóa phiên đăng nhập.' };
}

export async function getMemberDeliveryZones() {
  const raw = await getProperty(MEMBER_DELIVERY_ZONES_KEY);
  if (!raw) {
    return {
      ok: true,
      zones: [
        {
          province: 'Tây Ninh',
          wards: ['Xã Dương Minh Châu', 'Xã Phan'],
        },
      ],
    };
  }
  try {
    const list = JSON.parse(raw);
    return { ok: true, zones: Array.isArray(list) ? list : [] };
  } catch {
    return { ok: true, zones: [] };
  }
}

export async function saveMemberDeliveryZones(zones) {
  const list = Array.isArray(zones) ? zones : [];
  await setProperty(MEMBER_DELIVERY_ZONES_KEY, JSON.stringify(list));
  return { ok: true, count: list.length };
}

export async function isWardInDeliveryZones(province, ward) {
  const { zones } = await getMemberDeliveryZones();
  const p = String(province || '').trim().toLowerCase();
  const w = String(ward || '').trim().toLowerCase();
  return (zones || []).some((z) => {
    const zp = String(z.province || '').trim().toLowerCase();
    if (zp !== p) return false;
    const wards = z.wards || z.wardList || [];
    return wards.some((ww) => String(ww || '').trim().toLowerCase() === w);
  });
}

export async function getMemberPortalSettings(skipCache, forAdmin) {
  if (!skipCache && !forAdmin) {
    const c = CACHE.get('member_portal_settings');
    if (c) return c;
  }
  const defaults = {
    brandTitle: 'SUN Nut Milk',
    brandTagline: 'Tinh hoa từ hạt, trọn vẹn yêu thương.',
    loginCardTitle: 'Cổng vào Hội viên',
    loginCardSubtitle: 'Đăng nhập bằng số điện thoại để xem gói, lịch uống và ưu đãi.',
    heroImageUrl: 'https://images.unsplash.com/photo-1564890369479-c89fc36fb687?w=900&q=80',
    menuLabelCatalog: defaultMenuLabelCatalog(),
    menuTagCatalog: defaultMenuTagCatalog(),
    banners: [
      {
        image: 'https://images.unsplash.com/photo-1550583724-b2692b85bf19?w=1200&q=80',
        badge: '100% Tự nhiên',
        title: 'Dinh dưỡng tinh khiết mỗi ngày',
        subtitle: 'Sữa hạt tươi giao sáng - Dương Minh Châu',
      },
    ],
    categoryBanners: [],
    mediaSpecs: {
      carousel: '1200×480px (tỉ lệ ~5:2, JPG/WebP)',
      categoryBanner: '960×200px (tỉ lệ ~24:5, JPG/WebP)',
      heroLogin: '900×1200px (dọc, JPG/WebP)',
    },
    memberTiers: defaultMemberTiers(),
  };
  let merged = defaults;
  const raw = await getProperty(MEMBER_PORTAL_PROP_KEY);
  if (raw) {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') merged = { ...defaults, ...o };
    } catch {
      /* keep defaults */
    }
  }
  merged.menuLabelCatalog = normalizeMenuLabelCatalog(merged.menuLabelCatalog);
  merged.menuTagCatalog = normalizeMenuTagCatalog(merged.menuTagCatalog);
  merged.memberTiers = normalizeMemberTiers(merged.memberTiers);
  if (!forAdmin) CACHE.set('member_portal_settings', merged, 300);
  return merged;
}

export function defaultMemberTiers() {
  return [
    {
      id: 'member', name: 'Thành viên', minSun: 0, sunPerCup: 1, redeemSun: 10,
      redeemDesc: '1 ly Cà phê / Cà phê sữa / Bạc sỉu', multiplier: 1,
      benefits: [
        { icon: 'fa-sun', text: 'Tích 1 Sun mỗi ly hoàn tất' },
        { icon: 'fa-gift', text: 'Đổi 10 Sun = 1 ly Cà phê / Cà phê sữa / Bạc sỉu' },
      ],
    },
    {
      id: 'silver', name: 'Bạc', minSun: 20, sunPerCup: 1, redeemSun: 10,
      redeemDesc: '1 ly Cà phê / Cà phê sữa / Bạc sỉu', multiplier: 1,
      benefits: [
        { icon: 'fa-cake-candles', text: 'Tặng 01 phần bánh sinh nhật' },
        { icon: 'fa-ticket', text: 'Ưu đãi Mua 2 tặng 1 (theo chương trình)' },
        { icon: 'fa-gift', text: 'Đặc quyền đổi Sun nhận quà' },
      ],
    },
    {
      id: 'gold', name: 'Vàng', minSun: 50, sunPerCup: 1, redeemSun: 10,
      redeemDesc: '1 ly Cà phê / Cà phê sữa / Bạc sỉu', multiplier: 1,
      benefits: [
        { icon: 'fa-cake-candles', text: 'Tặng 01 phần bánh sinh nhật' },
        { icon: 'fa-mug-hot', text: 'Miễn phí 1 phần Cà phê / Trà' },
        { icon: 'fa-gift', text: 'Đặc quyền đổi Sun nhận quà' },
      ],
    },
    {
      id: 'diamond', name: 'Kim cương', minSun: 100, sunPerCup: 1, redeemSun: 10,
      redeemDesc: '1 ly Cà phê / Cà phê sữa / Bạc sỉu', multiplier: 1.5,
      benefits: [
        { icon: 'fa-sun', text: 'Nhân 1.5 Sun tích lũy' },
        { icon: 'fa-cake-candles', text: 'Tặng 01 phần bánh sinh nhật' },
        { icon: 'fa-mug-hot', text: 'Miễn phí 01 phần nước bất kỳ' },
        { icon: 'fa-star', text: 'Ưu đãi riêng từ SUN Nut Milk' },
        { icon: 'fa-gift', text: 'Đặc quyền đổi Sun nhận quà' },
      ],
    },
  ];
}

export function normalizeMemberTiers(raw) {
  const defs = defaultMemberTiers();
  const list = Array.isArray(raw) ? raw : [];
  return defs.map((d) => {
    const found = list.find((t) => String(t.id || t.name) === d.id || String(t.name) === d.name);
    if (!found) return d;
    return {
      ...d,
      ...found,
      id: d.id,
      name: String(found.name || d.name).trim() || d.name,
      minSun: parseInt(found.minSun, 10) >= 0 ? parseInt(found.minSun, 10) : d.minSun,
      sunPerCup: parseFloat(found.sunPerCup) || d.sunPerCup,
      redeemSun: parseInt(found.redeemSun, 10) || d.redeemSun,
      redeemDesc: String(found.redeemDesc || d.redeemDesc).trim(),
      multiplier: parseFloat(found.multiplier) || d.multiplier,
      benefits: Array.isArray(found.benefits) && found.benefits.length ? found.benefits : d.benefits,
    };
  });
}

export async function saveMemberPortalSettings(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Thiếu dữ liệu cấu hình');
  if (obj.menuLabelCatalog) obj.menuLabelCatalog = normalizeMenuLabelCatalog(obj.menuLabelCatalog);
  if (obj.menuTagCatalog) obj.menuTagCatalog = normalizeMenuTagCatalog(obj.menuTagCatalog);
  if (obj.memberTiers) obj.memberTiers = normalizeMemberTiers(obj.memberTiers);
  const toSave = { ...obj };
  delete toSave.cmsItems;
  const str = JSON.stringify(toSave);
  if (str.length > 9500) throw new Error('Dữ liệu chữ quá dài (tối đa ~9KB). Rút gọn mô tả.');
  await setProperty(MEMBER_PORTAL_PROP_KEY, str);
  CACHE.clear(['member_portal_settings', 'member_portal_cms_items']);
  return { ok: true };
}

/** Tiến độ hạng theo số Sun tích lũy. */
export function computeMemberTierProgress(cupsRaw, settingsTiers) {
  const tierSrc = settingsTiers && settingsTiers.length ? normalizeMemberTiers(settingsTiers) : defaultMemberTiers();
  const tiers = tierSrc.map((t) => ({ id: t.id, name: t.name, min: parseInt(t.minSun, 10) || 0 }));
  const c = Math.max(0, parseInt(cupsRaw, 10) || 0);
  let current = tiers[0];
  let next = tiers[1] || null;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (c >= tiers[i].min) {
      current = tiers[i];
      next = tiers[i + 1] || null;
      break;
    }
  }
  let progressPct = 100;
  let cupsToNext = 0;
  if (next) {
    const span = next.min - current.min;
    progressPct = span > 0 ? Math.min(100, Math.round(((c - current.min) / span) * 100)) : 0;
    cupsToNext = Math.max(0, next.min - c);
  }
  return {
    cups: c,
    currentTier: current.name,
    currentTierMin: current.min,
    nextTier: next ? next.name : '',
    nextTierMin: next ? next.min : null,
    progressPct,
    cupsToNext,
    tierHint: next
      ? `Còn ${cupsToNext} Sun nữa để lên hạng ${next.name}`
      : 'Bạn đang ở hạng cao nhất - cảm ơn đã đồng hành!',
  };
}

export async function getMemberOffersPayload(phoneRaw) {
  const phone = normalizeVnPhoneDigits(phoneRaw);
  const { profile } = await getMemberProfile(phone);
  const settings = await getMemberPortalSettings(false);
  const tierProgress = computeMemberTierProgress(profile.points, settings.memberTiers);
  const now = Date.now();
  const promos = [];
  (await getPromotions()).forEach((pr) => {
    const cfg = pr.ruleConfig || {};
    if (cfg.memberVisible === false) return;
    const start = pr.startDate ? new Date(pr.startDate).getTime() : 0;
    const end = pr.endDate ? new Date(pr.endDate).getTime() : 0;
    if (start && now < start) return;
    if (end && now > end + 86400000) return;
    promos.push({
      code: pr.code,
      name: pr.name,
      type: pr.type,
      value: pr.value,
      minOrder: pr.minOrder,
      description: String(cfg.memberDescription || pr.name || ''),
      conditions: String(cfg.memberConditions || cfg.conditions || ''),
      endDate: pr.endDate,
    });
    });
  return {
    ok: true,
    memberCode: profile.memberCode,
    tier: tierProgress.currentTier || profile.tier,
    cups: profile.points,
    points: profile.points,
    tierProgress,
    promos,
    supportPhone: settings.supportPhone || '',
    supportZalo: settings.supportZalo || '',
    termsHtml: settings.termsHtml || '',
  };
}

export async function memberPortalBootstrapPayload() {
  try {
    return {
      ok: true,
      settings: await getMemberPortalSettings(false),
      menu: await getMenu(),
      packages: await getMembershipPackages(),
    };
  } catch (e) {
    return {
      ok: false,
      message: String(e?.message || e || 'Lỗi máy chủ'),
      settings: null,
      menu: [],
      packages: [],
    };
  }
}

export async function memberPortalLookup(phoneRaw) {
  try {
    const r = await lookupMembershipByPhone(phoneRaw);
    if (!r) {
      return {
        ok: false,
        message: 'Không có phản hồi từ máy chủ',
        list: [],
        activeSubscriptions: [],
        hasPortalAccess: false,
        hasAnySubscription: false,
      };
    }
    if (r.ok === false) {
      return {
        ok: false,
        message: r.message || 'Không tra cứu được.',
        list: [],
        activeSubscriptions: [],
        hasPortalAccess: false,
        hasAnySubscription: false,
      };
    }
    const list = r.list || [];
    const activeSubscriptions = list.filter((x) => x.active);
    let profile = null;
    let offers = null;
    try {
      profile = (await getMemberProfile(phoneRaw)).profile;
      offers = await getMemberOffersPayload(phoneRaw);
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      list,
      activeSubscriptions,
      hasPortalAccess: activeSubscriptions.length > 0,
      hasAnySubscription: list.length > 0,
      profile,
      offers,
    };
  } catch (e) {
    return {
      ok: false,
      message: String(e?.message || e || 'Lỗi máy chủ'),
      list: [],
      activeSubscriptions: [],
      hasPortalAccess: false,
      hasAnySubscription: false,
    };
  }
}

export async function registerMemberPortalCustomer(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const phone = normalizeVnPhoneDigits(o.phone);
  if (!phone || phone.length < 9) throw new Error('SĐT không hợp lệ');
  if (o.acceptTerms !== true && o.acceptTerms !== 'true')
    throw new Error('Vui lòng đồng ý điều khoản và điều kiện');
  if (o.acceptPrivacy !== true && o.acceptPrivacy !== 'true')
    throw new Error('Vui lòng đồng ý cho phép dùng dữ liệu cá nhân');
  const existed = !!(await getCustomerByPhone(phone));
  const nm = String(o.name || '').trim() || 'Khách hàng';
  await saveCustomer({ phone, name: nm });
  return { ok: true, isNew: !existed, phone };
}

export async function getMemberOrderHistory(phoneRaw, limit) {
  const phone = normalizeVnPhoneDigits(phoneRaw);
  if (!phone || phone.length < 9) return { ok: false, message: 'SĐT không hợp lệ', orders: [] };
  const { getOrdersByPhone } = await import('./customers.js');
  const lim = parseInt(limit, 10) || 30;
  const orders = await getOrdersByPhone(phone, lim);
  return { ok: true, orders };
}

export async function memberSaveDeliveryPrefs(obj) {
  const { memberSaveDeliveryPrefs: savePrefs } = await import('./membership.js');
  return savePrefs(obj);
}

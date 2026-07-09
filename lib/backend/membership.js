import CACHE from '../cache.js';
import {
  getSheet,
  getDataRange,
  appendRow,
  updateRow,
  updateCell,
} from '../googleSheets.js';
import {
  MEMBERSHIP_PKG_HEADERS,
  MEMBERSHIP_SUB_HEADERS,
  MEMBERSHIP_SUB_HEADERS_EXTRA,
  MEMBERSHIP_PACKAGES_CACHE_KEY,
} from '../sheetsMap.js';
import { safeNum, normalizeVnPhoneDigits, parseOrderDate, formatDateTz } from '../format.js';
import { getMenu } from './menu.js';
import {
  getBankTransferSheet,
  bankSheetColOrderRef,
  ordersHeaderPick,
  bankMemoMatchesOrder,
  bankTransferRowProcessed,
  normalizeOrderIdForMatch,
  tryWithLock,
} from './helpers.js';
import { isWardInDeliveryZones } from './members.js';
import { saveCustomer } from './customers.js';

async function ensureMembershipPkgColumns(sheetName) {
  const all = await getDataRange(sheetName);
  if (!all.length) return;
  let headers = [...all[0]];
  let changed = false;
  for (const title of MEMBERSHIP_PKG_HEADERS) {
    if (headers.indexOf(title) === -1) {
      headers.push(title);
      changed = true;
    }
  }
  if (changed) await updateRow(sheetName, 1, headers);
}

async function membershipPkgSheet() {
  await getSheet('GoiThanhVien', MEMBERSHIP_PKG_HEADERS);
  await ensureMembershipPkgColumns('GoiThanhVien');
  return 'GoiThanhVien';
}

async function ensureMembershipSubHeaders(sheetName) {
  const all = await getDataRange(sheetName);
  if (!all.length) return;
  let headers = [...all[0]];
  let changed = false;
  for (const title of MEMBERSHIP_SUB_HEADERS_EXTRA) {
    if (headers.indexOf(title) === -1) {
      headers.push(title);
      changed = true;
    }
  }
  if (changed) await updateRow(sheetName, 1, headers);
}

async function membershipSubSheet() {
  await getSheet('DangKyGoi', MEMBERSHIP_SUB_HEADERS);
  await ensureMembershipSubHeaders('DangKyGoi');
  return 'DangKyGoi';
}

function membershipParsePromoCell(raw) {
  const out = { active: true, label: '', discountPct: 0, discountAmount: 0, bonusDays: 0, scenarios: [] };
  const s = String(raw != null ? raw : '').trim();
  if (!s || s === '{}' || /^không$/i.test(s)) {
    out.active = false;
    return out;
  }
  try {
    const j = JSON.parse(s);
    if (j && typeof j === 'object') {
      out.active = j.active !== false;
      out.label = String(j.label || j.title || '').trim();
      out.discountPct = Math.max(0, parseFloat(j.discountPct != null ? j.discountPct : j.percent) || 0);
      out.discountAmount = Math.max(0, parseFloat(j.discountAmount != null ? j.discountAmount : j.amount) || 0);
      out.bonusDays = Math.max(0, parseInt(j.bonusDays, 10) || 0);
      if (Array.isArray(j.scenarios))
        out.scenarios = j.scenarios.map((x) => String(x || '').trim()).filter(Boolean);
      return out;
    }
  } catch {
    /* text rules */
  }
  s.split(/[|;,\n]+/).forEach((part) => {
    const m = String(part || '').trim().match(/^([a-z_]+)\s*:\s*(.+)$/i);
    if (!m) return;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (k === 'label' || k === 'title') out.label = v;
    else if (k === 'discount_pct' || k === 'percent') out.discountPct = Math.max(0, parseFloat(v) || 0);
    else if (k === 'discount_amount' || k === 'amount') out.discountAmount = Math.max(0, parseFloat(v) || 0);
    else if (k === 'bonus_days' || k === 'bonus') out.bonusDays = Math.max(0, parseInt(v, 10) || 0);
    else if (k === 'scenario' || k === 'rule') out.scenarios.push(v);
  });
  return out;
}

function membershipRowToPkg(r) {
  return {
    id: String(r[0] || '').trim(),
    type: String(r[1] || '').trim(),
    name: String(r[2] || '').trim(),
    price: safeNum(r[3]),
    sessions: parseInt(r[4], 10) || 0,
    mainDrink: String(r[5] || '').trim(),
    costEstimate: safeNum(r[6]),
    description: String(r[7] || '').trim(),
    visible: String(r[8] || '').trim(),
    pkgKind: String(r[9] || '').trim() || 'system',
    promo: membershipParsePromoCell(r[10]),
  };
}

function membershipApplyPromoQuote(pkg) {
  const base = Math.round(parseFloat(pkg?.price) || 0);
  const promo = pkg?.promo || membershipParsePromoCell('');
  if (!promo.active) {
    return { basePrice: base, discount: 0, finalPrice: base, bonusDays: 0, promoLabel: '', promoActive: false };
  }
  const loai = String(pkg?.type || '').trim();
  const isMonth = loai.indexOf('Tháng') >= 0;
  const isWeek = loai.indexOf('Tuần') >= 0;
  let bonusDays = promo.bonusDays || 0;
  const scenarios = promo.scenarios || [];
  if (scenarios.indexOf('month_bonus_week') >= 0 && isMonth) bonusDays = Math.max(bonusDays, 7);
  if (scenarios.indexOf('week_bonus_2days') >= 0 && isWeek) bonusDays = Math.max(bonusDays, 2);
  let discountPct = promo.discountPct || 0;
  const discountAmount = promo.discountAmount || 0;
  let discount = Math.round((base * discountPct) / 100) + Math.round(discountAmount);
  if (discount > base) discount = base;
  const finalPrice = Math.max(0, base - discount);
  let label = String(promo.label || '').trim();
  if (!label && bonusDays > 0) label = `Tặng thêm ${bonusDays} ngày giao`;
  if (!label && discount > 0) label = `Giảm ${discount.toLocaleString('vi-VN')}đ`;
  if (!label && scenarios.indexOf('month_bonus_week') >= 0 && isMonth) label = 'Mua 1 tháng tặng thêm 1 tuần';
  if (!label && scenarios.indexOf('week_bonus_2days') >= 0 && isWeek) label = 'Mua 1 tuần tặng thêm 2 ngày';
  return {
    basePrice: base,
    discount,
    finalPrice,
    bonusDays,
    promoLabel: label,
    promoActive: !!(label || discount > 0 || bonusDays > 0),
  };
}

async function membershipSeedPackages(sheetName) {
  const rows = await getDataRange(sheetName);
  if (rows.length > 1) return;
  await appendRow(sheetName, [
    'PKG_WEEK',
    'Tuần',
    'Gói tuần - giao sáng (DMC)',
    189000,
    5,
    'Theo menu / ly chọn',
    85000,
    '5 buổi giao trong 7 ngày làm việc (mặc định T2–T6).',
    'Có',
    'Hệ thống',
    'week_bonus_2days|label:Mua 1 tuần tặng thêm 2 ngày',
  ]);
  await appendRow(sheetName, [
    'PKG_MONTH',
    'Tháng',
    'Gói tháng - giao sáng tiết kiệm',
    720000,
    22,
    'Theo menu / ly chọn',
    385000,
    '22 buổi trong tháng - ổn định dòng tiền & dự báo nguyên liệu.',
    'Có',
    'Hệ thống',
    'month_bonus_week|discount_pct:5|label:Mua 1 tháng tặng 1 tuần + giảm 5%',
  ]);
  await appendRow(sheetName, [
    'PKG_CUSTOM',
    'Custom',
    'Gói Custom - chọn món theo sở thích',
    0,
    7,
    'Tự chọn từ menu',
    0,
    'Chọn nhiều loại sữa bạn thích; giá tính theo món × số buổi.',
    'Có',
    'Custom',
    '',
  ]);
}

export async function getMembershipPackages() {
  const cached = CACHE.get(MEMBERSHIP_PACKAGES_CACHE_KEY);
  if (cached) return cached;
  const sheetName = await membershipPkgSheet();
  await membershipSeedPackages(sheetName);
  const rows = await getDataRange(sheetName);
  const out = rows
    .slice(1)
    .filter((r) => String(r[0] || '').trim())
    .map(membershipRowToPkg)
    .filter((p) => !(p.visible && String(p.visible).indexOf('Không') === 0))
    .map((p) => {
      const quote = membershipApplyPromoQuote(p);
      const sessions = parseInt(p.sessions, 10) || 0;
      const retailPerCup = 35000;
      const retailEst = sessions > 0 ? sessions * retailPerCup : quote.basePrice;
      const savingsRetail = Math.max(0, retailEst - quote.finalPrice);
      const savings = Math.max(quote.discount || 0, savingsRetail);
      return {
        ...p,
        basePrice: quote.basePrice,
        discount: quote.discount,
        finalPrice: quote.finalPrice,
        bonusDays: quote.bonusDays,
        promoLabel: quote.promoLabel,
        promoActive: quote.promoActive,
        retailEstimate: retailEst,
        savingsAmount: savings,
      };
    });
  CACHE.set(MEMBERSHIP_PACKAGES_CACHE_KEY, out, 300);
  return out;
}

export async function membershipQuotePackage(pkgId, customDrinkNames) {
  const id = String(pkgId || '').trim();
  if (!id) return { ok: false, error: 'Thiếu mã gói' };
  const pkgs = await getMembershipPackages();
  const pkg = pkgs.find((p) => String(p.id) === id);
  if (!pkg) return { ok: false, error: 'Không tìm thấy gói' };
  let quote = membershipApplyPromoQuote(pkg);
  if (
    String(pkg.pkgKind || '').toLowerCase().indexOf('custom') >= 0 &&
    Array.isArray(customDrinkNames) &&
    customDrinkNames.length
  ) {
    const menu = await getMenu();
    let sum = 0;
    let n = 0;
    for (const nm of customDrinkNames) {
      const w = String(nm || '').trim().toLowerCase();
      if (!w) continue;
      const m = menu.find((x) => String(x.name || '').trim().toLowerCase() === w && x.available !== false);
      if (m) {
        sum += parseFloat(m.basePrice) || 0;
        n++;
      }
    }
    if (n > 0) {
      const sessions = parseInt(pkg.sessions, 10) || (String(pkg.type || '').indexOf('Tháng') >= 0 ? 22 : 7);
      const avg = Math.round(sum / n);
      quote = membershipApplyPromoQuote({ ...pkg, price: Math.round(avg * sessions) });
    }
  }
  return {
    ok: true,
    packageId: id,
    packageName: pkg.name,
    packageType: pkg.type,
    pkgKind: pkg.pkgKind || 'system',
    ...quote,
  };
}

function phoneMatchMembership(cell, wantNorm) {
  if (!wantNorm || wantNorm.length < 9) return false;
  const p = normalizeVnPhoneDigits(cell);
  if (p === wantNorm) return true;
  if (p.length >= 9 && wantNorm.length >= 9 && p.slice(-9) === wantNorm.slice(-9)) return true;
  return false;
}

function membershipSubRowToObj(r, headerRow) {
  const headers = headerRow.map((h) => String(h || '').trim());
  const ix = (n) => headers.indexOf(n);
  const start = r[ix('Bắt đầu')];
  const end = r[ix('Kết thúc')];
  const st = String(r[ix('Trạng thái')] || '').trim();
  const now = new Date();
  const sd = parseOrderDate(start);
  const ed = parseOrderDate(end);
  const active =
    st.indexOf('Đang') >= 0 &&
    sd.getTime() > 0 &&
    ed.getTime() > 0 &&
    now.getTime() >= sd.getTime() &&
    now.getTime() <= ed.getTime();
  return {
    subId: String(r[ix('Mã ĐK')] || '').trim(),
    phone: normalizeVnPhoneDigits(r[ix('SĐT')]),
    customerName: String(r[ix('Tên KH')] || '').trim(),
    packageId: String(r[ix('Mã gói')] || '').trim(),
    type: String(r[ix('Loại')] || '').trim(),
    start,
    end,
    address: String(r[ix('Địa chỉ')] || '').trim(),
    mapLink: String(r[ix('Link Maps')] || '').trim(),
    tier: String(r[ix('Hạng')] || '').trim(),
    status: st,
    sessionsDelivered: parseInt(r[ix('Buổi đã giao')], 10) || 0,
    note: String(r[ix('Ghi chú')] || '').trim(),
    active,
  };
}

function membershipRowClientSafe(rowObj) {
  return rowObj;
}

export async function lookupMembershipByPhone(phoneRaw) {
  try {
    const phone = normalizeVnPhoneDigits(phoneRaw);
    if (!phone || phone.length < 9)
      return { ok: false, message: 'SĐT không hợp lệ (cần ít nhất 9 số)', list: [] };
    const sheetName = await membershipSubSheet();
    const rows = await getDataRange(sheetName);
    if (rows.length < 2) return { ok: true, list: [] };
    const headerRow = rows[0];
    const list = [];
    for (let i = 1; i < rows.length; i++) {
      if (!String(rows[i][0] || '').trim()) continue;
      const cPhone = rows[i][headerRow.indexOf('SĐT') >= 0 ? headerRow.indexOf('SĐT') : 1];
      if (phoneMatchMembership(cPhone, phone)) {
        list.push(membershipRowClientSafe(membershipSubRowToObj(rows[i], headerRow)));
      }
    }
    list.sort((a, b) => (parseOrderDate(b.end).getTime() || 0) - (parseOrderDate(a.end).getTime() || 0));
    return { ok: true, list };
  } catch (e) {
    return { ok: false, message: String(e?.message || e || 'Lỗi máy chủ'), list: [] };
  }
}

async function membershipBuildSubRow(map) {
  const sheetName = await membershipSubSheet();
  const headers = (await getDataRange(sheetName))[0];
  return headers.map((h) => (map.hasOwnProperty(String(h || '').trim()) ? map[String(h || '').trim()] : ''));
}

function membershipComputeDates(loai, bonusDays = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  let days = 7;
  if (String(loai || '').indexOf('Tháng') >= 0) days = 30;
  days += parseInt(bonusDays, 10) || 0;
  const end = new Date(start.getTime() + days * 86400000);
  return { start, end };
}

export async function registerMembershipSubscription(obj) {
  if (!obj) throw new Error('Thiếu dữ liệu');
  const phone = normalizeVnPhoneDigits(obj.phone);
  if (!phone || phone.length < 9) throw new Error('Số điện thoại không hợp lệ');
  const name = String(obj.customerName || '').trim() || 'Khách hàng';
  const pkgId = String(obj.packageId || '').trim();
  if (!pkgId) throw new Error('Chọn gói');
  const payRaw = String(obj.paymentMethod != null ? obj.paymentMethod : 'Tiền mặt').trim();
  const isTransfer = payRaw.indexOf('Chuyển') === 0 || payRaw.toLowerCase().indexOf('transfer') >= 0;
  const province = String(obj.province != null && obj.province !== '' ? obj.province : 'Tây Ninh').trim();
  const ward = String(obj.ward != null && obj.ward !== '' ? obj.ward : 'Xã Dương Minh Châu').trim();
  const fulfillment = String(obj.fulfillment || 'delivery').trim().toLowerCase();
  const isPickup =
    fulfillment === 'pickup' ||
    fulfillment.indexOf('cửa hàng') >= 0 ||
    fulfillment.indexOf('tai cua hang') >= 0;
  let detail = String(obj.addressDetail != null ? obj.addressDetail : obj.address || '').trim();
  if (isPickup) {
    detail = detail || 'Nhận tại cửa hàng SUN Nut Milk';
  } else {
    if (!detail) throw new Error('Nhập địa chỉ nhà (số nhà, đường, hẻm…)');
    if (!(await isWardInDeliveryZones(province, ward))) {
      throw new Error('Khu vực giao chưa hỗ trợ. Chọn Nhận tại cửa hàng hoặc địa chỉ trong vùng giao được chỉ định.');
    }
  }

  const pkgs = await getMembershipPackages();
  const pkgObj = pkgs.find((p) => p.id === pkgId);
  if (!pkgObj) throw new Error('Không tìm thấy mã gói');
  const quote = await membershipQuotePackage(pkgId, obj.customDrinks);
  const price = quote?.ok ? quote.finalPrice : pkgObj.price;
  const loai = String(pkgObj.type || '');
  const se = membershipComputeDates(loai, quote?.bonusDays || 0);
  const subId = `SUB${String(Date.now()).slice(-10)}`;
  const rowMap = {
    'Mã ĐK': subId,
    SĐT: phone,
    'Tên KH': name,
    'Mã gói': pkgId,
    Loại: loai,
    'Bắt đầu': isTransfer ? '' : se.start,
    'Kết thúc': isTransfer ? '' : se.end,
    'Địa chỉ': `${detail}, ${ward}, ${province}`,
    'Link Maps': String(obj.mapLink || '').trim(),
    Hạng: String(obj.tier || 'Đồng').trim() || 'Đồng',
    'Trạng thái': isTransfer ? 'Chờ thanh toán' : 'Đang chạy',
    'Buổi đã giao': 0,
    'Ghi chú': isTransfer ? 'TT: Chờ CK' : '',
    'Tỉnh/TP': province,
    'Xã/Phường': ward,
    'Địa chỉ chi tiết': detail,
    'Điểm nhận': String(obj.landmark || '').trim(),
    'Món yêu thích': String(obj.favoriteDrink || '').trim(),
  };
  const sheetName = await membershipSubSheet();
  await appendRow(sheetName, await membershipBuildSubRow(rowMap));
  await saveCustomer({ phone, name });
  return {
    ok: true,
    subId,
    sessions: parseInt(pkgObj.sessions, 10) || 0,
    amount: Math.round(price),
    payByTransfer: isTransfer,
    start: isTransfer ? null : se.start.getTime(),
    end: isTransfer ? null : se.end.getTime(),
  };
}

export async function adminListMembershipSubscriptions() {
  const sheetName = await membershipSubSheet();
  const rows = await getDataRange(sheetName);
  if (rows.length < 2) return [];
  const headerRow = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim())
      out.push(membershipRowClientSafe(membershipSubRowToObj(rows[i], headerRow)));
  }
  return out.sort((a, b) => String(b.subId).localeCompare(String(a.subId)));
}

export async function adminUpdateMembershipSubscription(obj) {
  if (!obj?.subId) throw new Error('Thiếu Mã ĐK');
  const sheetName = await membershipSubSheet();
  const data = await getDataRange(sheetName);
  const want = String(obj.subId).trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === want) {
      const row = i + 1;
      if (obj.address != null) await updateCell(sheetName, row, 8, String(obj.address));
      if (obj.mapLink != null) await updateCell(sheetName, row, 9, String(obj.mapLink));
      if (obj.tier != null) await updateCell(sheetName, row, 10, String(obj.tier));
      if (obj.status != null) await updateCell(sheetName, row, 11, String(obj.status));
      if (obj.note != null) await updateCell(sheetName, row, 13, String(obj.note));
      return { ok: true };
    }
  }
  throw new Error('Không tìm thấy Mã ĐK');
}

export async function markMembershipDeliverySession(subId) {
  const sheetName = await membershipSubSheet();
  const data = await getDataRange(sheetName);
  const want = String(subId || '').trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === want) {
      const cur = parseInt(data[i][11], 10) || 0;
      await updateCell(sheetName, i + 1, 12, cur + 1);
      return { ok: true, sessionsDelivered: cur + 1 };
    }
  }
  return { ok: false };
}

export async function getMembershipDeliveriesForDate(dayOffset) {
  const off = parseInt(dayOffset, 10) || 0;
  const pkgSheet = await membershipPkgSheet();
  await membershipSeedPackages(pkgSheet);
  const subSheet = await membershipSubSheet();
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off, 12, 0, 0);
  const dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, 0, 0);
  const dayEnd = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59);
  const deliveries = [];
  const pkgRows = await getDataRange(pkgSheet);
  const pkgMap = {};
  for (let pi = 1; pi < pkgRows.length; pi++) {
    pkgMap[String(pkgRows[pi][0] || '').trim()] = {
      name: String(pkgRows[pi][2] || ''),
      milk: String(pkgRows[pi][5] || ''),
    };
  }
  const rows = await getDataRange(subSheet);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const st = String(r[10] || '');
    if (st.indexOf('Hủy') >= 0 || st.indexOf('Hoàn') >= 0) continue;
    const sd = parseOrderDate(r[5]);
    const ed = parseOrderDate(r[6]);
    if (sd.getTime() === 0 || ed.getTime() === 0) continue;
    if (dayEnd.getTime() < sd.getTime() || dayStart.getTime() > ed.getTime()) continue;
    const pk = pkgMap[String(r[3] || '').trim()] || { name: '', milk: '' };
    deliveries.push({
      subId: String(r[0] || ''),
      phone: String(r[1] || ''),
      customerName: String(r[2] || ''),
      packageId: String(r[3] || ''),
      packageName: pk.name,
      milkProduct: String(pk.milk || 'Sữa hạt').trim(),
      address: String(r[7] || ''),
      mapLink: String(r[8] || ''),
      tier: String(r[9] || ''),
      sessionsDelivered: parseInt(r[11], 10) || 0,
      sessionsTotal: parseInt(r[4], 10) || 0,
    });
  }
  const drinkTotals = {};
  deliveries.forEach((d) => {
    const k = d.milkProduct || 'Khác';
    drinkTotals[k] = (drinkTotals[k] || 0) + 1;
  });
  return {
    dateLabel: formatDateTz(target, 'EEEE dd/MM/yyyy'),
    deliveries,
    estimatedMeals: deliveries.length,
    drinkTotals,
  };
}

export async function getMembershipDeliveriesToday() {
  return getMembershipDeliveriesForDate(0);
}

export async function getMemberDeliveriesTodayEnriched() {
  const base = await getMembershipDeliveriesToday();
  const out = [];
  for (const d of base.deliveries || []) {
    let code = '';
    try {
      const { ensureMemberCodeForPhone } = await import('./members.js');
      code = await ensureMemberCodeForPhone(d.phone);
    } catch {
      code = '';
    }
    out.push({
      ...d,
      memberCode: code,
      fulfillment: String(d.address || '').indexOf('cửa hàng') >= 0 ? 'Nhận tại quầy' : 'Giao hàng',
      timeSlot: '7:00 – 8:30',
      drinkToday: d.milkProduct || 'Theo lịch gói',
    });
  }
  return { ok: true, dateLabel: base.dateLabel, deliveries: out, estimatedMeals: out.length };
}

export async function memberSaveDeliveryPrefs(obj) {
  if (!obj?.subId) throw new Error('Thiếu Mã ĐK');
  const phone = normalizeVnPhoneDigits(obj.phone);
  if (!phone || phone.length < 9) throw new Error('SĐT không hợp lệ');
  const subId = String(obj.subId).trim();
  const schedObj = obj.schedule != null ? obj.schedule : {};
  const jsonStr = typeof schedObj === 'string' ? schedObj : JSON.stringify(schedObj);
  const sheetName = await membershipSubSheet();
  const data = await getDataRange(sheetName);
  const headers = data[0].map((h) => String(h || '').trim());
  const cSub = headers.indexOf('Mã ĐK');
  const cPhone = headers.indexOf('SĐT');
  const cSched = headers.indexOf('Lịch giao KH');
  if (cSub < 0 || cPhone < 0 || cSched < 0) throw new Error('Cấu trúc sheet đăng ký không hợp lệ');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cSub] || '').trim() === subId && phoneMatchMembership(data[i][cPhone], phone)) {
      await updateCell(sheetName, i + 1, cSched + 1, jsonStr);
      return { ok: true };
    }
  }
  throw new Error('Không tìm thấy gói hoặc SĐT không khớp');
}

export async function adminSaveMembershipPackage(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const pkgId = String(o['Mã gói'] || o.id || '').trim();
  if (!pkgId) throw new Error('Thiếu Mã gói');
  const sheetName = await membershipPkgSheet();
  await membershipSeedPackages(sheetName);
  let promoCell = '';
  if (o.promo != null && typeof o.promo === 'object') {
    try {
      promoCell = JSON.stringify(o.promo);
    } catch {
      promoCell = String(o.promoRules || '');
    }
  } else {
    promoCell = String(o.promoRules != null ? o.promoRules : o.promo || o['Khuyến mãi'] || '');
  }
  let pkgKind = String(o.pkgKind || o.kind || o['Kiểu gói'] || 'Hệ thống').trim();
  if (pkgKind.toLowerCase() === 'custom') pkgKind = 'Custom';
  else if (pkgKind.toLowerCase().indexOf('hệ') >= 0 || pkgKind.toLowerCase() === 'system') pkgKind = 'Hệ thống';
  const vals = [
    pkgId,
    String(o.type || o['Loại'] || 'Tuần'),
    String(o.name || o['Tên gói'] || ''),
    parseFloat(o.price ?? o['Giá']) || 0,
    parseInt(o.sessions ?? o['Số buổi'], 10) || 0,
    String(o.milkProduct || o['Món chính'] || ''),
    parseFloat(o.costEstimate ?? o['Cost ước tính']) || 0,
    String(o.description || o['Mô tả'] || ''),
    String(o.visible != null ? o.visible : o['Hiển thị'] != null ? o['Hiển thị'] : 'Có'),
    pkgKind,
    promoCell,
  ];
  const all = await getDataRange(sheetName);
  let updated = false;
  for (let i = 1; i < all.length; i++) {
    if (String(all[i][0] || '').trim() === pkgId) {
      await updateRow(sheetName, i + 1, vals);
      updated = true;
      break;
    }
  }
  if (!updated) await appendRow(sheetName, vals);
  CACHE.clear(MEMBERSHIP_PACKAGES_CACHE_KEY);
  return { ok: true, mode: updated ? 'update' : 'insert' };
}

export async function adminMembershipCostCalc(sessions, price, costTotal) {
  const s = parseInt(sessions, 10) || 0;
  const p = parseFloat(price) || 0;
  const c = parseFloat(costTotal) || 0;
  const margin = p > 0 ? Math.round(((p - c) / p) * 1000) / 10 : 0;
  return {
    ok: true,
    sessions: s,
    price: p,
    costTotal: c,
    profit: p - c,
    marginPct: margin,
    costPerSession: s > 0 ? Math.round(c / s) : 0,
  };
}

export async function checkMembershipBankPayment(subId, expectedAmount) {
  return tryWithLock('membership_bank', async () => {
    const subNorm = normalizeOrderIdForMatch(subId);
    const exp = Math.round(parseFloat(String(expectedAmount).replace(/,/g, '')) || 0);
    if (!subNorm || exp <= 0) return { status: 'pending' };

    const bankSheetName = await getBankTransferSheet();
    const allData = await getDataRange(bankSheetName);
    if (allData.length < 2) return { status: 'pending' };
    const headers = allData[0];
    const data = allData.slice(1);
    const colContent = ordersHeaderPick(headers, ['Nội dung thanh toán', 'Nội dung CK'], -1);
    const colAmount = ordersHeaderPick(headers, ['Số tiền', 'Số tiền GD'], -1);
    const colProcessingStatus = ordersHeaderPick(headers, ['Trạng thái xử lý', 'Trạng thái'], -1);
    const colCodeTT = ordersHeaderPick(headers, ['Code TT', 'Mã TT'], -1);
    const colOrderRef = bankSheetColOrderRef(headers);

    const unprocessedRows = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const partMemo = String(row[colContent] || '').trim();
      const partCode = colCodeTT > -1 ? String(row[colCodeTT] || '').trim() : '';
      const memoNorm = `${partMemo} ${partCode}`.trim().toUpperCase().replace(/\s+/g, '');
      const transactionAmount = Math.round(parseFloat(String(row[colAmount] || '').replace(/,/g, '')) || 0);
      const proc = bankTransferRowProcessed(row[colProcessingStatus]);
      const memoOk = bankMemoMatchesOrder(memoNorm, subNorm);
      const kNorm = colOrderRef > -1 ? String(row[colOrderRef] || '').trim().toUpperCase().replace(/\s+/g, '') : '';
      const kOk = kNorm && bankMemoMatchesOrder(kNorm, subNorm);
      if ((memoOk || kOk) && transactionAmount > 0 && !proc) {
        unprocessedRows.push({ sheetRow: i + 2, amount: transactionAmount });
      }
    }
    if (!unprocessedRows.length) return { status: 'pending' };
    const unpaidTotal = unprocessedRows.reduce((s, x) => s + x.amount, 0);
    if (unpaidTotal >= exp - 5) {
      for (const row of unprocessedRows) {
        await updateCell(bankSheetName, row.sheetRow, colProcessingStatus + 1, 'Đã xử lý');
      }
      await activateMembershipSubscription(subId);
      return { status: 'paid', amountPaid: unpaidTotal, expectedAmount: exp };
    }
    return { status: 'partial', amountPaid: unpaidTotal, expectedAmount: exp };
  });
}

async function activateMembershipSubscription(subId) {
  const sheetName = await membershipSubSheet();
  const data = await getDataRange(sheetName);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === String(subId).trim()) {
      const loai = String(data[i][4] || '');
      const se = membershipComputeDates(loai, 0);
      await updateCell(sheetName, i + 1, 6, se.start);
      await updateCell(sheetName, i + 1, 7, se.end);
      await updateCell(sheetName, i + 1, 11, 'Đang chạy');
      return true;
    }
  }
  return false;
}

export async function getMemberPortalScheduleAdvice(userGoal, durationOrOpts) {
  const menu = await getMenu();
  const packages = await getMembershipPackages();
  const numDays = typeof durationOrOpts === 'number' ? durationOrOpts : 7;
  const days = [];
  const pool = menu.filter((m) => m.available !== false).slice(0, numDays);
  for (let i = 0; i < numDays; i++) {
    const m = pool[i % pool.length];
    if (!m) continue;
    days.push({
      dayIndex: i + 1,
      drinkName: m.name,
      ingredients: m.ingredientNames || [],
      benefits: m.benefits || '',
      kcal: m.nutritionKcal || 0,
    });
  }
  return {
    ok: true,
    goal: String(userGoal || '').trim(),
    days,
    note: 'Gợi ý lịch từ menu hiện có (fallback khi không có Gemini).',
    packages: packages.slice(0, 5),
  };
}

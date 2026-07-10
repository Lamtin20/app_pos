import CACHE from '../cache.js';
import { getProperty, setProperty } from '../properties.js';
import { MEMBER_PROMO_CAMPAIGNS_KEY } from '../sheetsMap.js';
import { normalizeVnPhoneDigits } from '../format.js';
import { getMemberProfile } from './members.js';
import { getOrdersByPhone } from './customers.js';
import { validatePromo } from './promotions.js';

const CACHE_KEY = 'member_promo_campaigns_v1';

function nowMs() {
  return Date.now();
}

function parseDateMs(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function campaignInWindow(c) {
  if (c.active === false) return false;
  const now = nowMs();
  const start = parseDateMs(c.startDate);
  const end = parseDateMs(c.endDate);
  if (start && now < start) return false;
  if (end && now > end + 86400000) return false;
  return true;
}

async function readCampaignsRaw() {
  const cached = CACHE.get(CACHE_KEY);
  if (cached) return cached;
  const raw = await getProperty(MEMBER_PROMO_CAMPAIGNS_KEY);
  let list = [];
  if (raw) {
    try {
      const o = JSON.parse(raw);
      list = Array.isArray(o?.campaigns) ? o.campaigns : Array.isArray(o) ? o : [];
    } catch {
      list = [];
    }
  }
  CACHE.set(CACHE_KEY, list, 120);
  return list;
}

async function writeCampaigns(list) {
  await setProperty(MEMBER_PROMO_CAMPAIGNS_KEY, JSON.stringify({ campaigns: list }));
  CACHE.clear([CACHE_KEY]);
}

function normalizeCampaign(data, existing) {
  const id = String(data.id || existing?.id || `camp_${Date.now()}`).trim();
  const ruleConfig =
    data.ruleConfig && typeof data.ruleConfig === 'object'
      ? data.ruleConfig
      : existing?.ruleConfig || {};
  if (typeof data.ruleConfigJson === 'string' && data.ruleConfigJson.trim()) {
    try {
      Object.assign(ruleConfig, JSON.parse(data.ruleConfigJson));
    } catch {
      /* ignore */
    }
  }
  return {
    id,
    title: String(data.title || existing?.title || '').trim(),
    body: String(data.body || existing?.body || '').trim(),
    imageUrl: String(data.imageUrl || existing?.imageUrl || '').trim(),
    startDate: data.startDate || existing?.startDate || '',
    endDate: data.endDate || existing?.endDate || '',
    active: !(
      data.active === false ||
      String(data.active).toUpperCase() === 'FALSE' ||
      data.active === 0
    ),
    audience: String(data.audience || existing?.audience || 'all').trim() || 'all',
    ruleType: String(data.ruleType || existing?.ruleType || 'all').trim() || 'all',
    ruleConfig,
    actionType: String(data.actionType || existing?.actionType || 'order').trim() || 'order',
    actionPromoCode: String(data.actionPromoCode || existing?.actionPromoCode || '')
      .trim()
      .toUpperCase(),
    actionMenuId: String(data.actionMenuId || existing?.actionMenuId || '').trim(),
    actionCategory: String(data.actionCategory || existing?.actionCategory || '').trim(),
    actionButtonText: String(data.actionButtonText || existing?.actionButtonText || 'Xem ngay')
      .trim(),
    showPopup: data.showPopup !== false && data.showPopup !== 0 && String(data.showPopup) !== 'false',
    pushNotification:
      data.pushNotification !== false &&
      data.pushNotification !== 0 &&
      String(data.pushNotification) !== 'false',
    priority: parseInt(data.priority, 10) || parseInt(existing?.priority, 10) || 0,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function getPromoCampaignsAdmin() {
  const list = await readCampaignsRaw();
  return list.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

export async function savePromoCampaign(data) {
  const list = await readCampaignsRaw();
  const id = String(data?.id || '').trim();
  let idx = id ? list.findIndex((c) => c.id === id) : -1;
  const existing = idx >= 0 ? list[idx] : null;
  const camp = normalizeCampaign(data || {}, existing);
  if (!camp.title) throw new Error('Nhập tiêu đề chương trình');
  if (idx >= 0) list[idx] = camp;
  else list.push(camp);
  await writeCampaigns(list);
  return { ok: true, campaign: camp };
}

export async function deletePromoCampaign(idRaw) {
  const id = String(idRaw || '').trim();
  if (!id) throw new Error('Thiếu mã chương trình');
  const list = await readCampaignsRaw();
  const next = list.filter((c) => c.id !== id);
  await writeCampaigns(next);
  return { ok: true };
}

function tierMatches(profile, ruleConfig) {
  const tiers = ruleConfig?.tiers || ruleConfig?.tierIds || [];
  if (!Array.isArray(tiers) || !tiers.length) return true;
  const tier = String(profile?.tier || '').toLowerCase();
  return tiers.some((t) => {
    const s = String(t || '').toLowerCase();
    return tier.indexOf(s) >= 0 || s.indexOf(tier) >= 0;
  });
}

function completedOrderCount(orders) {
  return (orders || []).filter((o) => String(o.status || '') === 'Hoàn thành').length;
}

async function campaignMatchesMember(campaign, phone, profile, orders) {
  if (!campaignInWindow(campaign)) return false;
  const audience = String(campaign.audience || 'all').trim().toLowerCase();
  if (audience === 'all') return true;

  const rule = String(campaign.ruleType || 'all').trim().toLowerCase();
  const cfg = campaign.ruleConfig || {};
  const points = parseFloat(profile?.points) || 0;
  const spend = parseFloat(profile?.totalSpent) || parseFloat(profile?.totalSpend) || 0;
  const visits = parseFloat(profile?.visitCount) || 0;
  const completed = completedOrderCount(orders);

  switch (rule) {
    case 'all':
      return true;
    case 'tier':
      return tierMatches(profile, cfg);
    case 'min_points':
      return points >= (parseFloat(cfg.minPoints) || 0);
    case 'min_spend':
      return spend >= (parseFloat(cfg.minSpend) || 0);
    case 'min_visits':
      return visits >= (parseInt(cfg.minVisits, 10) || 0);
    case 'new_member':
      return completed === 0;
    case 'returning':
      return completed >= (parseInt(cfg.minCompletedOrders, 10) || 1);
    case 'promo_eligible': {
      const code = String(cfg.promoCode || campaign.actionPromoCode || '').trim();
      if (!code) return false;
      const v = await validatePromo(code, cfg.minOrder || 0, phone, '[]');
      return !!v.valid;
    }
    default:
      return true;
  }
}

function orderStatusLabel(st) {
  const s = String(st || '').trim();
  if (!s) return 'Cập nhật đơn hàng';
  if (s.indexOf('Hủy') >= 0) return 'Đơn đã hủy';
  if (s === 'Hoàn thành') return 'Đơn hoàn tất';
  if (s.indexOf('Chờ') >= 0) return 'Đơn đang chờ xử lý';
  if (s.indexOf('Đang') >= 0) return 'Đơn đang được chuẩn bị';
  return s;
}

function buildOrderNotifications(orders) {
  const out = [];
  const cutoff = nowMs() - 14 * 86400000;
  for (const o of orders || []) {
    const t = parseDateMs(o.time || o.createdAt);
    if (t && t < cutoff) continue;
    const oid = String(o.orderId || o.id || '').trim();
    if (!oid) continue;
    const st = String(o.status || '').trim();
    out.push({
      id: `order_${oid}_${st}`,
      kind: 'order',
      title: `Đơn #${oid}`,
      body: orderStatusLabel(st) + (o.finalAmount != null ? ` · ${Math.round(o.finalAmount).toLocaleString('vi-VN')}₫` : ''),
      time: o.time || o.createdAt || '',
      orderId: oid,
      status: st,
      actionType: st.indexOf('Hủy') >= 0 ? 'order_history' : 'order',
    });
  }
  return out.slice(0, 12);
}

function buildAccountNotifications(profile, accountMeta) {
  const out = [];
  const meta = accountMeta || {};
  if (meta.tierChanged && meta.prevTier && meta.newTier) {
    out.push({
      id: `acct_tier_${meta.newTier}`,
      kind: 'account',
      title: 'Hạng thành viên mới',
      body: `Bạn đã lên hạng ${meta.newTier}! Xem quyền lợi trong tab Ưu đãi.`,
      time: new Date().toISOString(),
      actionType: 'offers',
    });
  }
  if (meta.pointsDelta && meta.pointsDelta > 0) {
    out.push({
      id: `acct_pts_${profile?.points || 0}`,
      kind: 'account',
      title: 'Sun được cộng thêm',
      body: `+${meta.pointsDelta} Sun · Tổng ${profile?.points || 0} Sun trên tài khoản.`,
      time: new Date().toISOString(),
      actionType: 'offers',
    });
  }
  if (profile?.name && meta.profileUpdated) {
    out.push({
      id: `acct_profile_${Date.now()}`,
      kind: 'account',
      title: 'Hồ sơ đã cập nhật',
      body: 'Thông tin cá nhân của bạn vừa được lưu thành công.',
      time: new Date().toISOString(),
      actionType: 'profile',
    });
  }
  return out;
}

function campaignToNotification(c) {
  return {
    id: `camp_${c.id}`,
    kind: 'promo',
    title: c.title,
    body: c.body || c.title,
    time: c.updatedAt || c.startDate || '',
    imageUrl: c.imageUrl || '',
    campaignId: c.id,
    actionType: c.actionType,
    actionPromoCode: c.actionPromoCode,
    actionMenuId: c.actionMenuId,
    actionCategory: c.actionCategory,
  };
}

export async function getMemberNotificationsPayload(phoneRaw, accountMeta) {
  const phone = normalizeVnPhoneDigits(phoneRaw);
  if (!phone || phone.length < 9) {
    return { ok: false, message: 'SĐT không hợp lệ', notifications: [], popupCampaign: null };
  }

  const { profile } = await getMemberProfile(phone);
  const orders = await getOrdersByPhone(phone, 20);
  const campaigns = (await readCampaignsRaw()).filter(campaignInWindow);

  const matched = [];
  for (const c of campaigns) {
    if (await campaignMatchesMember(c, phone, profile, orders)) matched.push(c);
  }
  matched.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const notifications = [
    ...buildOrderNotifications(orders),
    ...buildAccountNotifications(profile, accountMeta),
    ...matched.filter((c) => c.pushNotification !== false).map(campaignToNotification),
  ];

  notifications.sort((a, b) => {
    const ta = parseDateMs(a.time) || 0;
    const tb = parseDateMs(b.time) || 0;
    return tb - ta;
  });

  const popupCampaign =
    matched.find((c) => c.showPopup !== false) || null;

  return {
    ok: true,
    notifications: notifications.slice(0, 40),
    popupCampaign,
    profileSnapshot: {
      tier: profile?.tier || '',
      points: profile?.points || 0,
      name: profile?.name || '',
    },
  };
}

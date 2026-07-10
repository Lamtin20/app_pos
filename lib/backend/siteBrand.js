import CACHE from '../cache.js';
import { getProperty, setProperty } from '../properties.js';
import { SITE_BRAND_PROP_KEY } from '../sheetsMap.js';

const DEFAULTS = {
  brandName: 'SUN Nut Milk',
  brandTagline: 'Tinh hoa từ hạt — hệ thống bán hàng trên Vercel + Google Sheets',
  logoUrl: 'https://i.ibb.co/8LV0snn8/logo-sun-web.png',
  faviconUrl: 'https://i.ibb.co/8LV0snn8/logo-sun-web.png',
};

export async function getSiteBrand(skipCache) {
  if (!skipCache) {
    const c = CACHE.get('site_brand');
    if (c) return c;
  }
  const raw = await getProperty(SITE_BRAND_PROP_KEY);
  let merged = { ...DEFAULTS };
  if (raw) {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') merged = { ...DEFAULTS, ...o };
    } catch {
      /* keep defaults */
    }
  }
  CACHE.set('site_brand', merged, 300);
  return merged;
}

export async function saveSiteBrand(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Thiếu dữ liệu thương hiệu');
  const payload = {
    brandName: String(obj.brandName || DEFAULTS.brandName).trim() || DEFAULTS.brandName,
    brandTagline: String(obj.brandTagline || DEFAULTS.brandTagline).trim(),
    logoUrl: String(obj.logoUrl || DEFAULTS.logoUrl).trim(),
    faviconUrl: String(obj.faviconUrl || obj.logoUrl || DEFAULTS.faviconUrl).trim(),
  };
  const str = JSON.stringify(payload);
  if (str.length > 4000) throw new Error('Dữ liệu thương hiệu quá dài.');
  await setProperty(SITE_BRAND_PROP_KEY, str);
  CACHE.clear('site_brand');
  return { ok: true, brand: payload };
}

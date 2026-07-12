import { getSiteBrand, saveSiteBrand } from '../../../lib/backend/siteBrand.js';
import { getMemberPortalSettings } from '../../../lib/backend/members.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [brand, portal] = await Promise.all([
    getSiteBrand(false),
    getMemberPortalSettings(false, false).catch(() => null),
  ]);
  const p = portal && typeof portal === 'object' ? portal : {};
  const merged = {
    ...brand,
    brandName: String(p.brandTitle || p.pageTitle || brand.brandName || '').trim() || brand.brandName,
    brandTagline: String(p.brandTagline || brand.brandTagline || '').trim() || brand.brandTagline,
    logoUrl: String(brand.logoUrl || p.heroImageUrl || '').trim() || brand.logoUrl,
    faviconUrl: String(brand.faviconUrl || brand.logoUrl || '').trim() || brand.faviconUrl,
    brandTitle: p.brandTitle || '',
    pageTitle: p.pageTitle || '',
  };
  return jsonOk({ ok: true, brand: merged });
}

export async function POST(request) {
  try {
    const body = await parseJsonBody(request);
    const result = await saveSiteBrand(body || {});
    return jsonOk(result);
  } catch (e) {
    return jsonError(e.message || String(e), 400);
  }
}

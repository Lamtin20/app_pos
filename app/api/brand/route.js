import { getSiteBrand, saveSiteBrand } from '../../../lib/backend/siteBrand.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const brand = await getSiteBrand(false);
  return jsonOk({ ok: true, brand });
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

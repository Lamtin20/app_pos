import { getPromotions, applyPromoCode } from '../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';

export async function GET() {
  const promotions = await getPromotions();
  return jsonOk({ promotions });
}

export async function POST(request) {
  const body = await parseJsonBody(request);
  if (!body?.code) return jsonError('Missing code');
  const r = await applyPromoCode(
    body.code,
    body.orderAmount || 0,
    body.phone || '',
    body.cartJson || '[]'
  );
  return jsonOk(r);
}

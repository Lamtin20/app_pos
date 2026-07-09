import { getPosCustomerInsight } from '../../../../lib/backend/index.js';
import { jsonError, jsonOk } from '../../../../lib/apiResponse.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  if (!phone) return jsonError('Missing phone');
  const insight = await getPosCustomerInsight(phone);
  return jsonOk(insight);
}

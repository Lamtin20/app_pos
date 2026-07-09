import { getOnlineOrderStatusPublic } from '../../../lib/backend/index.js';
import { jsonError, jsonOk } from '../../../lib/apiResponse.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const order = searchParams.get('order');
  if (!order) return jsonError('Missing order');
  const data = await getOnlineOrderStatusPublic(order);
  return jsonOk(data);
}

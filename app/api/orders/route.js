import { getOrders, saveOrder, savePickupOnlineOrder } from '../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'today';
  const orders = await getOrders(period);
  return jsonOk({ orders });
}

export async function POST(request) {
  const data = await parseJsonBody(request);
  if (!data) return jsonError('Invalid JSON');
  const result = data.fulfillment || String(data.note || '').includes('[PICKUP]')
    ? await savePickupOnlineOrder(data)
    : await saveOrder(data);
  return jsonOk(result);
}

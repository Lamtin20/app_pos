import { ensureCustomerForPos } from '../../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../../lib/apiResponse.js';

export async function POST(request) {
  const body = await parseJsonBody(request);
  if (!body?.phone) return jsonError('Missing phone');
  const r = await ensureCustomerForPos(body.phone, body.name || '');
  return jsonOk(r);
}

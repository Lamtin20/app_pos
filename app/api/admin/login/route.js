import { verifyAdminPin } from '../../../../lib/auth.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../../lib/apiResponse.js';

export async function POST(request) {
  const body = await parseJsonBody(request);
  const pin = body?.pin;
  if (!pin) return jsonError('Missing pin', 400);
  const ok = await verifyAdminPin(pin);
  if (!ok) return jsonError('PIN không đúng', 401);
  return jsonOk({ ok: true, token: 'admin-session' });
}

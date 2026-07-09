import { updateOnlineOrderStatus } from '../../../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../../../lib/apiResponse.js';

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await parseJsonBody(request);
  if (!id || !body?.status) return jsonError('Missing id or status');
  await updateOnlineOrderStatus(id, body.status);
  return jsonOk({ ok: true });
}

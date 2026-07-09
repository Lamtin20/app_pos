import { updateMenuAvailability } from '../../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../../lib/apiResponse.js';

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await parseJsonBody(request);
  if (!id) return jsonError('Missing id');
  await updateMenuAvailability(id, body?.available !== false);
  return jsonOk({ ok: true });
}

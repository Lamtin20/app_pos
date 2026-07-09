import { memberSaveDeliveryPrefs } from '../../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../../lib/apiResponse.js';

export async function PATCH(request) {
  const data = await parseJsonBody(request);
  if (!data?.phone) return jsonError('Missing phone');
  const r = await memberSaveDeliveryPrefs(data);
  return jsonOk(r);
}

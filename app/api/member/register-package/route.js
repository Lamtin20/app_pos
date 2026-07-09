import { registerMembershipSubscription } from '../../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../../lib/apiResponse.js';

export async function POST(request) {
  const data = await parseJsonBody(request);
  if (!data) return jsonError('Invalid JSON');
  const r = await registerMembershipSubscription(data);
  return jsonOk(r);
}

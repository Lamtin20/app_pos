import { memberPortalLookup } from '../../../../lib/backend/index.js';
import { jsonError, jsonOk } from '../../../../lib/apiResponse.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone') || searchParams.get('p') || '';
  if (!phone) return jsonError('Missing phone');
  const data = await memberPortalLookup(phone);
  return jsonOk(data);
}

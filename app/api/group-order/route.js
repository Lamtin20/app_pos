import { getGroupOrder } from '../../../lib/backend/index.js';
import { jsonError, jsonOk } from '../../../lib/apiResponse.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const group = searchParams.get('group');
  if (!group) return jsonError('Missing group');
  const data = await getGroupOrder(group);
  return jsonOk(data, 200, {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
  });
}

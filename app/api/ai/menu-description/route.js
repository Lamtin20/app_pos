import { suggestMenuDescriptionShort } from '../../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../../lib/apiResponse.js';

export async function POST(request) {
  const body = await parseJsonBody(request);
  if (!body?.name) return jsonError('Missing name');
  const r = await suggestMenuDescriptionShort(body.name, body.category || '', body.ingredientsHint || '');
  return jsonOk(r);
}

import { uploadProductImageToImgbb } from '../../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../../lib/apiResponse.js';

export async function POST(request) {
  const body = await parseJsonBody(request);
  if (!body?.base64Data) return jsonError('Missing base64Data');
  const r = await uploadProductImageToImgbb(body.base64Data, body.fileName || 'product.jpg');
  return jsonOk(r);
}

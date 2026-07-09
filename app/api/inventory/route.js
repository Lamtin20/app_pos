import { getInventory, addIngredient, updateIngredient } from '../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';

export async function GET() {
  const inventory = await getInventory(true);
  return jsonOk({ inventory });
}

export async function POST(request) {
  const data = await parseJsonBody(request);
  if (!data) return jsonError('Invalid JSON');
  const msg = await addIngredient(data);
  return jsonOk({ message: msg });
}

export async function PATCH(request) {
  const data = await parseJsonBody(request);
  if (!data?.sheetRow) return jsonError('Missing sheetRow');
  const msg = await updateIngredient(data.sheetRow, data);
  return jsonOk({ message: msg });
}

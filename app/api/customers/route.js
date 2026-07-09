import { getCustomers, saveCustomer, ensureCustomerForPos, getPosCustomerInsight } from '../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';

export async function GET() {
  const customers = await getCustomers();
  return jsonOk({ customers });
}

export async function POST(request) {
  const data = await parseJsonBody(request);
  if (!data) return jsonError('Invalid JSON');
  const r = await saveCustomer(data);
  return jsonOk(r);
}

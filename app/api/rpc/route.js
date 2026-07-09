import { invokeRpc } from '../../../lib/backend/rpcMap.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await parseJsonBody(request);
  if (!body || !body.method) {
    return jsonError('Missing method', 400);
  }
  const { method, args = [] } = body;
  try {
    const result = await invokeRpc(method, args);
    return jsonOk({ ok: true, result });
  } catch (err) {
    console.error('[rpc]', method, err);
    return jsonError(err.message || String(err), 500);
  }
}

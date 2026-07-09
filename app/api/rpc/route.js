import { invokeRpc } from '../../../lib/backend/rpcMap.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';
import { runWithRuntimeConfig } from '../../../lib/runtimeConfig.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await parseJsonBody(request);
  if (!body || !body.method) {
    return jsonError('Missing method', 400);
  }
  const { method, args = [], config = {} } = body;
  try {
    const result = await runWithRuntimeConfig(
      {
        sheetId: config.sheetId || '',
        driveFolderId: config.driveFolderId || '',
      },
      () => invokeRpc(method, args)
    );
    return jsonOk({ ok: true, result });
  } catch (err) {
    console.error('[rpc]', method, err);
    return jsonError(err.message || String(err), 500);
  }
}

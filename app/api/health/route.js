import { getMenu } from '../../../lib/backend/index.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';
import { runWithRuntimeConfig } from '../../../lib/runtimeConfig.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quick health check — verifies Google Sheet connection. */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sheetId = searchParams.get('sheetId') || '';
  const driveFolderId = searchParams.get('driveFolderId') || '';
  return runHealth({ sheetId, driveFolderId });
}

export async function POST(request) {
  const body = (await parseJsonBody(request)) || {};
  const cfg = body.config || body;
  return runHealth({
    sheetId: cfg.sheetId || '',
    driveFolderId: cfg.driveFolderId || '',
  });
}

async function runHealth(config) {
  try {
    const menu = await runWithRuntimeConfig(config, () => getMenu());
    return jsonOk({
      ok: true,
      connected: true,
      menuCount: Array.isArray(menu) ? menu.length : 0,
      sheetId: config.sheetId || process.env.GOOGLE_SHEET_ID || 'env',
      hasServiceAccount: !!(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
      ),
    });
  } catch (err) {
    return jsonError(err.message || String(err), 503);
  }
}

import { getMenu } from '../../../lib/backend/index.js';
import { jsonError, jsonOk } from '../../../lib/apiResponse.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quick health check — verifies Google Sheet connection. */
export async function GET() {
  try {
    const menu = await getMenu();
    return jsonOk({
      ok: true,
      connected: true,
      menuCount: Array.isArray(menu) ? menu.length : 0,
      sheetId: process.env.GOOGLE_SHEET_ID ? 'configured' : 'missing',
    });
  } catch (err) {
    return jsonError(err.message || String(err), 503);
  }
}

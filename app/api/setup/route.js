import { getMenu } from '../../../lib/backend/index.js';
import { listSheetNames } from '../../../lib/googleSheets.js';
import { parseDriveFolderId, parseSheetId } from '../../../lib/parseGoogleUrls.js';
import { runWithRuntimeConfig } from '../../../lib/runtimeConfig.js';
import { jsonError, jsonOk, parseJsonBody } from '../../../lib/apiResponse.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function pickConfig(body) {
  const sheetId =
    body?.sheetId ||
    parseSheetId(body?.sheetUrl || body?.sheet || '') ||
    parseSheetId(body?.config?.sheetId || body?.config?.sheetUrl || '');
  const driveFolderId =
    body?.driveFolderId ||
    parseDriveFolderId(body?.driveUrl || body?.drive || '') ||
    parseDriveFolderId(body?.config?.driveFolderId || body?.config?.driveUrl || '');
  return { sheetId: sheetId || '', driveFolderId: driveFolderId || '' };
}

export async function GET() {
  const hasAuth = !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
  );
  return jsonOk({
    ok: true,
    hasServiceAccount: hasAuth,
    envSheetId: process.env.GOOGLE_SHEET_ID ? 'configured' : 'missing',
    envDriveId: process.env.GOOGLE_DRIVE_FOLDER_ID ? 'configured' : 'missing',
  });
}

/** Test connection with pasted Sheet / Drive URLs */
export async function POST(request) {
  const body = await parseJsonBody(request);
  const { sheetId, driveFolderId } = pickConfig(body || {});
  if (!sheetId) {
    return jsonError('Không nhận diện được link/ID Google Sheet', 400);
  }

  try {
    const result = await runWithRuntimeConfig({ sheetId, driveFolderId }, async () => {
      const tabs = await listSheetNames();
      const menu = await getMenu();
      return {
        ok: true,
        sheetId,
        driveFolderId: driveFolderId || null,
        tabCount: tabs.length,
        tabs: tabs.slice(0, 20),
        menuCount: Array.isArray(menu) ? menu.length : 0,
        sampleMenu: (menu || []).slice(0, 3).map((m) => m.name),
      };
    });
    return jsonOk(result);
  } catch (err) {
    return jsonError(
      (err.message || String(err)) +
        ' — Kiểm tra: đã share Sheet cho email Service Account (Editor)?',
      503
    );
  }
}

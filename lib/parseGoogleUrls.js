/** Extract Google Sheet / Drive IDs from URL or raw ID string. */

export function parseSheetId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const fromUrl = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
  return null;
}

export function parseDriveFolderId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const fromUrl = s.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (fromUrl) return fromUrl[1];
  const openId = s.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (openId) return openId[1];
  if (/^[a-zA-Z0-9-_]{10,}$/.test(s)) return s;
  return null;
}

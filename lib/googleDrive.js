import { getDriveApi } from './googleSheets.js';
import { getProperty } from './properties.js';
import { SUN_DRIVE_PRODUCT_FOLDER_ID_DEFAULT } from './sheetsMap.js';
import { normalizeSunDriveFolderId } from './format.js';

function detectMime(base64Data) {
  const s = String(base64Data || '');
  if (s.indexOf('image/png') !== -1) return { mime: 'image/png', ext: '.png' };
  if (s.indexOf('image/webp') !== -1) return { mime: 'image/webp', ext: '.webp' };
  if (s.indexOf('image/gif') !== -1) return { mime: 'image/gif', ext: '.gif' };
  return { mime: 'image/jpeg', ext: '.jpg' };
}

export async function uploadBytesToDrive(bytes, mime, safeName, folderId) {
  const drive = getDriveApi();
  const parents = folderId ? [folderId] : undefined;
  const res = await drive.files.create({
    requestBody: {
      name: safeName,
      parents,
    },
    media: { mimeType: mime, body: Buffer.from(bytes) },
    fields: 'id,name',
  });
  const id = res.data.id;
  try {
    await drive.permissions.create({
      fileId: id,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch {
    /* sharing may be restricted */
  }
  const viewUrl = `https://drive.google.com/uc?export=view&id=${id}`;
  return { fileId: id, url: viewUrl, displayUrl: viewUrl };
}

export async function uploadProductImageToDrive(base64Data, fileName) {
  const clean = String(base64Data || '').replace(/^data:image\/\w+;base64,/, '');
  if (!clean || clean.length < 50) {
    return { ok: false, error: 'Dữ liệu ảnh không hợp lệ.' };
  }
  const { mime, ext } = detectMime(base64Data);
  const safeName = `${String(fileName || 'sun-product').replace(/\W+/g, '-').substring(0, 72)}${ext}`;
  const bytes = Buffer.from(clean, 'base64');

  let folderId = await getProperty('SUN_DRIVE_PRODUCT_FOLDER_ID');
  if (!folderId) folderId = SUN_DRIVE_PRODUCT_FOLDER_ID_DEFAULT;
  folderId = normalizeSunDriveFolderId(folderId);

  let usedRoot = false;
  try {
    const out = await uploadBytesToDrive(bytes, mime, safeName, folderId);
    return { ok: true, ...out };
  } catch (eFolder) {
    try {
      usedRoot = true;
      const out = await uploadBytesToDrive(bytes, mime, safeName, null);
      return {
        ok: true,
        ...out,
        storedInDriveRoot: true,
        hint: 'Ảnh đã lưu vào thư mục gốc Drive (fallback). Kiểm tra GOOGLE_DRIVE_FOLDER_ID và quyền chia sẻ.',
      };
    } catch (eRoot) {
      return {
        ok: false,
        error: `${eFolder?.message || eFolder} - ${eRoot?.message || eRoot}`,
      };
    }
  }
}

export async function saveAiImageUrlToDrive(imageUrl, fileName) {
  const url = String(imageUrl || '').trim();
  if (!url) return { ok: false, error: 'Thiếu URL ảnh' };
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    const buf = Buffer.from(await resp.arrayBuffer());
    const ct = resp.headers.get('content-type') || 'image/jpeg';
    const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg';
    const safeName = `${String(fileName || 'sun-ai').replace(/\W+/g, '-').substring(0, 72)}${ext}`;
    let folderId = await getProperty('SUN_DRIVE_PRODUCT_FOLDER_ID');
    if (!folderId) folderId = SUN_DRIVE_PRODUCT_FOLDER_ID_DEFAULT;
    folderId = normalizeSunDriveFolderId(folderId);
    const out = await uploadBytesToDrive(buf, ct.split(';')[0], safeName, folderId);
    return { ok: true, ...out, sourceUrl: url };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function testDriveFolder(folderIdOptional) {
  let id = normalizeSunDriveFolderId(folderIdOptional);
  if (!id) id = normalizeSunDriveFolderId(await getProperty('SUN_DRIVE_PRODUCT_FOLDER_ID'));
  if (!id) id = SUN_DRIVE_PRODUCT_FOLDER_ID_DEFAULT;
  if (!id) return { ok: false, error: 'Chưa có ID folder.' };
  try {
    const drive = getDriveApi();
    const f = await drive.files.get({ fileId: id, fields: 'id,name,mimeType' });
    return {
      ok: true,
      message: `Mở được folder: «${f.data.name}».`,
      folderId: id,
      folderUrl: `https://drive.google.com/drive/folders/${id}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: `${e?.message || e} - Kiểm tra ID và quyền Biên tập cho service account.`,
    };
  }
}

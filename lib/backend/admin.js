import { getProperty } from '../properties.js';
import { SUN_DRIVE_PRODUCT_FOLDER_ID_DEFAULT } from '../sheetsMap.js';
import { sunMaskSecret, normalizeSunDriveFolderId } from '../format.js';
import { uploadProductImageToDrive, testDriveFolder } from '../googleDrive.js';

function parseImgbbResponse(raw, code) {
  if (!raw) return { ok: false, error: `EMPTY_${code}` };
  const low = raw.toLowerCase();
  if (low.indexOf('you have been forbidden') !== -1 || low.indexOf('forbidden to use this website') !== -1) {
    return { ok: false, error: 'FORBIDDEN_HTML' };
  }
  if (raw.indexOf('<!DOCTYPE') === 0 || raw.indexOf('<html') === 0) {
    return { ok: false, error: `HTML_${code}` };
  }
  try {
    const body = JSON.parse(raw);
    if (body.success && body.data?.url) {
      const d = body.data;
      const u1 = String(d.url || '');
      const u2 = String(d.display_url || d.url_viewer || '');
      const pick = /\.png(\?|#|$)/i.test(u1) ? u1 : u2 || u1;
      return {
        ok: true,
        url: pick,
        displayUrl: u2 || u1,
        imgbbRawUrl: u1,
        publicHost: 'imgbb',
      };
    }
    const em = body.error?.message ? body.error.message : JSON.stringify(body).substring(0, 220);
    return { ok: false, error: `API_${em}` };
  } catch {
    return { ok: false, error: `JSON_${code}_${raw.substring(0, 120)}` };
  }
}

async function imgbbUploadWithKey(key, cleanBase64, fileName) {
  const nameStr = String(fileName || 'sun-product').replace(/\W+/g, '-').substring(0, 80);
  const urlBase = 'https://api.imgbb.com/1/upload';
  const attempts = [];

  const formBody = new URLSearchParams();
  formBody.set('key', key);
  formBody.set('image', cleanBase64);
  formBody.set('name', nameStr);

  try {
    const r1 = await fetch(urlBase, { method: 'POST', body: formBody });
    const raw1 = await r1.text();
    const o1 = parseImgbbResponse(raw1, r1.status);
    if (o1.ok) return { ...o1, imgbbAttempt: 'formUrlEncoded' };
    attempts.push(`formUrlEncoded:${o1.error}`);
  } catch (e1) {
    attempts.push(`formUrlEncoded:EXC:${e1?.message || e1}`);
  }

  const proxy = String(await getProperty('IMGBB_PROXY_URL')).trim();
  if (proxy) {
    try {
      const r4 = await fetch(proxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, image: cleanBase64, name: nameStr }),
      });
      const raw4 = await r4.text();
      const o4 = parseImgbbResponse(raw4, r4.status);
      if (o4.ok) return { ...o4, viaProxy: true, imgbbAttempt: 'proxyJson' };
      attempts.push(`proxyJson:${o4.error}`);
    } catch (e4) {
      attempts.push(`proxyJson:EXC:${e4?.message || e4}`);
    }
  }

  const errMsg =
    attempts.join('\n').indexOf('FORBIDDEN') !== -1
      ? 'imgbb / CDN từ chối kết nối từ IP máy chủ. Dùng Drive hoặc IMGBB_PROXY_URL.'
      : attempts.join('\n');
  return { ok: false, error: errMsg };
}

export async function uploadProductImageToImgbb(base64Data, fileName) {
  const key = await getProperty('IMGBB_API_KEY');
  if (!key) {
    return {
      ok: false,
      error: 'Thiếu IMGBB_API_KEY. Thêm vào ScriptConfig hoặc env.',
    };
  }
  const clean = String(base64Data || '').replace(/^data:image\/\w+;base64,/, '');
  if (!clean || clean.length < 50) return { ok: false, error: 'Dữ liệu ảnh không hợp lệ.' };
  return imgbbUploadWithKey(key, clean, fileName);
}

export { uploadProductImageToDrive, testDriveFolder as testSunAdminDriveFolder };

export async function saveAiImageUrlToDrive(imageUrl, fileName) {
  const { saveAiImageUrlToDrive: saveUrl } = await import('../googleDrive.js');
  return saveUrl(imageUrl, fileName);
}

export async function getSunAdminApiConfig() {
  const g = String(await getProperty('GEMINI_API_KEY')).trim();
  const i = String(await getProperty('IMGBB_API_KEY')).trim();
  let fid = String(await getProperty('SUN_DRIVE_PRODUCT_FOLDER_ID')).trim();
  if (!fid) fid = SUN_DRIVE_PRODUCT_FOLDER_ID_DEFAULT;
  const pxy = String(await getProperty('IMGBB_PROXY_URL')).trim();
  return {
    ok: true,
    hasGemini: !!g,
    hasImgbb: !!i,
    hasImgbbProxy: !!pxy,
    imgbbProxyUrl: pxy,
    imgbbClientUpload: true,
    driveFolderId: fid,
    driveFolderFromProperty: !!fid,
    driveFolderUrl: fid ? `https://drive.google.com/drive/folders/${fid}` : '',
    geminiMasked: sunMaskSecret(g),
    imgbbMasked: sunMaskSecret(i),
  };
}

export async function saveSunAdminApiConfig(payload) {
  const { setProperties } = await import('../properties.js');
  payload = payload || {};
  const updates = {};
  const g = String(payload.geminiKey != null ? payload.geminiKey : '').trim();
  const im = String(payload.imgbbKey != null ? payload.imgbbKey : '').trim();
  const fd = normalizeSunDriveFolderId(String(payload.driveFolderId != null ? payload.driveFolderId : '').trim());
  const px = String(payload.imgbbProxyUrl != null ? payload.imgbbProxyUrl : '').trim();
  if (px) {
    if (!/^https:\/\//i.test(px)) {
      return {
        ok: false,
        error: 'IMGBB_PROXY_URL phải là https://…',
      };
    }
    updates.IMGBB_PROXY_URL = px;
  }
  if (g) updates.GEMINI_API_KEY = g;
  if (im) updates.IMGBB_API_KEY = im;
  if (fd) updates.SUN_DRIVE_PRODUCT_FOLDER_ID = fd;
  if (Object.keys(updates).length === 0) {
    return {
      ok: false,
      error: 'Không có dữ liệu mới: nhập ít nhất một key hoặc ID folder rồi bấm Lưu.',
    };
  }
  await setProperties(updates);
  return { ok: true, savedKeys: Object.keys(updates) };
}

export async function getSunImgbbClientUploadKey() {
  const k = String(await getProperty('IMGBB_API_KEY')).trim();
  if (!k) {
    return {
      ok: false,
      error: 'Chưa lưu IMGBB_API_KEY. Tab Admin → API & Drive → dán key → Lưu.',
    };
  }
  return { ok: true, key: k };
}

export async function testSunAdminImgbb(apiKeyOptional) {
  let k = String(apiKeyOptional != null ? apiKeyOptional : '').trim();
  if (!k) k = String(await getProperty('IMGBB_API_KEY')).trim();
  if (!k) return { ok: false, error: 'Chưa có IMGBB_API_KEY.' };
  const clean = 'R0lGODlhAQABAIAAAAUEwAAAACwAAAAAAQABAAACAkQBADs=';
  const r = await imgbbUploadWithKey(k, clean, 'sun-admin-test');
  if (r?.ok) {
    return {
      ok: true,
      message: `imgbb nhận ảnh test thành công${r.viaProxy ? ' (qua IMGBB_PROXY_URL).' : '.'}`,
      sampleUrl: r.url || '',
      attempt: r.imgbbAttempt || '',
    };
  }
  return { ok: false, error: r?.error || 'Test imgbb thất bại.' };
}

export async function getInvoicePrintSettings() {
  const { INVOICE_PRINT_SETTINGS_KEY } = await import('../sheetsMap.js');
  const def = {
    storeName: 'Sữa Hạt Sun',
    storePhone: '0779997838',
    storeAddress: '',
    bankName: 'MB Bank',
    bankAccountNo: '0825825485',
    bankAccountName: 'LAM THI HONG NHU',
    vietQrBankBin: '970422',
    thankYou: 'Cảm ơn quý khách đã ủng hộ - hẹn gặp lại!',
    footerNote: 'Mọi thắc mắc xin liên hệ hotline.',
    printerHint: 'Trên máy bán: sau khi bấm In, chọn máy in nhiệt hoặc «Lưu PDF». Khổ phổ biến 72–80mm.',
    labelEnabled: false,
    labelCopies: 1,
    labelSize: '40x30',
    labelNote: 'Gợi ý: tem 40x30 hoặc 50x30 tuỳ máy in tem.',
  };
  try {
    const raw = await getProperty(INVOICE_PRINT_SETTINGS_KEY);
    if (!raw) return def;
    return { ...def, ...JSON.parse(raw) };
  } catch {
    return def;
  }
}

export async function saveInvoicePrintSettings(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Thiếu dữ liệu cấu hình');
  const { INVOICE_PRINT_SETTINGS_KEY } = await import('../sheetsMap.js');
  const { setProperty } = await import('../properties.js');
  await setProperty(INVOICE_PRINT_SETTINGS_KEY, JSON.stringify(obj));
  return { ok: true };
}

export async function setScriptProperties(props) {
  const { setProperties } = await import('../properties.js');
  await setProperties(props || {});
  return true;
}

export async function clearScriptProperties() {
  const { deleteProperties } = await import('../properties.js');
  await deleteProperties(['SHIFT_CASH', 'SHIFT_BANK']);
  return true;
}

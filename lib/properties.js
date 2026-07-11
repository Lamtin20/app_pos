import { google } from 'googleapis';
import { getDataRange as _getDataRange } from './googleSheets.js';
import { getRuntimeDriveFolderId } from './runtimeConfig.js';

const ENV_FALLBACKS = {
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  IMGBB_API_KEY: 'IMGBB_API_KEY',
  IMGBB_PROXY_URL: 'IMGBB_PROXY_URL',
  SUN_DRIVE_PRODUCT_FOLDER_ID: 'GOOGLE_DRIVE_FOLDER_ID',
  ADMIN_PIN: 'ADMIN_PIN',
};

let sheetCache = null;
let sheetCacheAt = 0;

async function loadScriptConfig() {
  if (sheetCache && Date.now() - sheetCacheAt < 120000) return sheetCache;
  try {
    const rows = await _getDataRange('ScriptConfig');
    const map = {};
    for (let i = 1; i < rows.length; i++) {
      const k = String(rows[i][0] || '').trim();
      const v = String(rows[i][1] ?? '').trim();
      if (k) map[k] = v;
    }
    sheetCache = map;
    sheetCacheAt = Date.now();
    return map;
  } catch {
    sheetCache = {};
    sheetCacheAt = Date.now();
    return sheetCache;
  }
}

export async function getProperty(key) {
  if (key === 'SUN_DRIVE_PRODUCT_FOLDER_ID') {
    const runtimeDrive = getRuntimeDriveFolderId();
    if (runtimeDrive) return runtimeDrive;
  }
  const cfg = await loadScriptConfig();
  if (cfg[key]) return cfg[key];
  const envKey = ENV_FALLBACKS[key] || key;
  return process.env[envKey] || process.env[key] || '';
}

export async function getProperties(keys) {
  const out = {};
  for (const k of keys) {
    out[k] = await getProperty(k);
  }
  return out;
}

export async function setProperty(key, value) {
  const { appendRow, findRowByColumn, updateRow, getSheet } = await import('./googleSheets.js');
  await getSheet('ScriptConfig', ['Key', 'Value']);
  const row = await findRowByColumn('ScriptConfig', 0, key);
  if (row >= 0) {
    await updateRow('ScriptConfig', row + 2, [key, String(value ?? '')]);
  } else {
    await appendRow('ScriptConfig', [key, String(value ?? '')]);
  }
  sheetCache = null;
}

export async function setProperties(props, merge = true) {
  for (const [k, v] of Object.entries(props || {})) {
    if (!merge && v === undefined) continue;
    await setProperty(k, v);
  }
}

export async function deleteProperty(key) {
  const { findRowByColumn, deleteRow } = await import('./googleSheets.js');
  const row = await findRowByColumn('ScriptConfig', 0, key);
  if (row >= 0) await deleteRow('ScriptConfig', row + 2);
  sheetCache = null;
}

export async function deleteProperties(keys) {
  for (const k of keys) await deleteProperty(k);
}

export function clearPropertyCache() {
  sheetCache = null;
}

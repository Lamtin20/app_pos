import { google } from 'googleapis';
import { getRuntimeSheetId } from './runtimeConfig.js';

let sheetsClient = null;
let driveClient = null;
const sheetIdByName = new Map();
let sheetMapForSpreadsheet = null;

function getSpreadsheetId() {
  const override = getRuntimeSheetId();
  if (override) return override;
  const envId = process.env.GOOGLE_SHEET_ID;
  if (!envId) {
    throw new Error(
      'Chưa cấu hình Google Sheet. Vào trang chủ → Setup để dán link Sheet, hoặc đặt GOOGLE_SHEET_ID trên Vercel.'
    );
  }
  return envId;
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
  }
  key = key.replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email,
    key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

export function getSheetsApi() {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: 'v4', auth: getAuth() });
  }
  return sheetsClient;
}

export function getDriveApi() {
  if (!driveClient) {
    driveClient = google.drive({ version: 'v3', auth: getAuth() });
  }
  return driveClient;
}

async function refreshSheetMap() {
  const ssId = getSpreadsheetId();
  if (sheetMapForSpreadsheet !== ssId) {
    sheetIdByName.clear();
    sheetMapForSpreadsheet = ssId;
  }
  const res = await getSheetsApi().spreadsheets.get({ spreadsheetId: ssId });
  sheetIdByName.clear();
  for (const sh of res.data.sheets || []) {
    const title = sh.properties?.title;
    const id = sh.properties?.sheetId;
    if (title != null && id != null) sheetIdByName.set(title, id);
  }
}

async function getSheetIdByName(name) {
  if (!sheetIdByName.has(name)) await refreshSheetMap();
  return sheetIdByName.get(name);
}

function colToLetter(col) {
  let s = '';
  let n = col;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function a1Range(sheetName, row1, col1, row2, col2) {
  const start = `${colToLetter(col1)}${row1}`;
  const end = `${colToLetter(col2)}${row2}`;
  return `'${sheetName.replace(/'/g, "''")}'!${start}:${end}`;
}

function normalizeCellValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v;
  return v;
}

function normalizeRow(row) {
  return (row || []).map(normalizeCellValue);
}

/** Ensure sheet exists; optionally write header row. */
export async function getSheet(name, headers) {
  const ssId = getSpreadsheetId();
  let sid = await getSheetIdByName(name);
  if (sid == null) {
    await getSheetsApi().spreadsheets.batchUpdate({
      spreadsheetId: ssId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: name } } }],
      },
    });
    await refreshSheetMap();
    sid = await getSheetIdByName(name);
    if (headers?.length) {
      await appendRow(name, headers);
      await batchUpdate([
        {
          repeatCell: {
            range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.95, green: 0.96, blue: 0.97 },
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
      ]);
    }
  } else if (headers?.length) {
    const data = await getDataRange(name);
    if (!data.length) {
      await appendRow(name, headers);
    }
  }
  return { name, sheetId: sid, spreadsheetId: ssId };
}

export async function getDataRange(sheetName) {
  const ssId = getSpreadsheetId();
  const res = await getSheetsApi().spreadsheets.values.get({
    spreadsheetId: ssId,
    range: `'${sheetName.replace(/'/g, "''")}'`,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const rows = res.data.values || [];
  return rows.map((r) => {
    const out = [...r];
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        const d = new Date(v);
        if (!isNaN(d.getTime())) out[i] = d;
      }
    }
    return out;
  });
}

export async function getSheetData(name, startRow, numCols) {
  const all = await getDataRange(name);
  if (all.length < startRow) return [];
  return all.slice(startRow - 1).map((r) => r.slice(0, numCols));
}

export async function getLastRow(sheetName) {
  const data = await getDataRange(sheetName);
  return data.length;
}

export async function appendRow(sheetName, rowArray) {
  const ssId = getSpreadsheetId();
  await getSheetsApi().spreadsheets.values.append({
    spreadsheetId: ssId,
    range: `'${sheetName.replace(/'/g, "''")}'!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [normalizeRow(rowArray)] },
  });
}

export async function appendRows(sheetName, rows) {
  if (!rows?.length) return;
  const ssId = getSpreadsheetId();
  await getSheetsApi().spreadsheets.values.append({
    spreadsheetId: ssId,
    range: `'${sheetName.replace(/'/g, "''")}'!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows.map(normalizeRow) },
  });
}

export async function updateRow(sheetName, rowIndex1Based, rowArray) {
  const ssId = getSpreadsheetId();
  const nCols = rowArray.length;
  const range = a1Range(sheetName, rowIndex1Based, 1, rowIndex1Based, nCols);
  await getSheetsApi().spreadsheets.values.update({
    spreadsheetId: ssId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [normalizeRow(rowArray)] },
  });
}

export async function updateCell(sheetName, row1, col1, value) {
  const ssId = getSpreadsheetId();
  const range = a1Range(sheetName, row1, col1, row1, col1);
  await getSheetsApi().spreadsheets.values.update({
    spreadsheetId: ssId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[normalizeCellValue(value)]] },
  });
}

export async function updateRange(sheetName, row1, col1, row2, col2, valuesMatrix) {
  const ssId = getSpreadsheetId();
  const range = a1Range(sheetName, row1, col1, row2, col2);
  await getSheetsApi().spreadsheets.values.update({
    spreadsheetId: ssId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: (valuesMatrix || []).map((r) => normalizeRow(r)) },
  });
}

export async function deleteRow(sheetName, rowIndex1Based) {
  const sid = await getSheetIdByName(sheetName);
  if (sid == null) return;
  await batchUpdate([
    {
      deleteDimension: {
        range: {
          sheetId: sid,
          dimension: 'ROWS',
          startIndex: rowIndex1Based - 1,
          endIndex: rowIndex1Based,
        },
      },
    },
  ]);
}

export async function findRowByColumn(sheetName, colIndex0, value) {
  const data = await getDataRange(sheetName);
  const want = String(value ?? '').trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex0] ?? '').trim() === want) return i;
  }
  return -1;
}

export async function batchUpdate(requests) {
  const ssId = getSpreadsheetId();
  if (!requests?.length) return;
  await getSheetsApi().spreadsheets.batchUpdate({
    spreadsheetId: ssId,
    requestBody: { requests },
  });
}

export async function getSheetByNames(tryNames) {
  for (const n of tryNames) {
    const sid = await getSheetIdByName(n);
    if (sid != null) return { name: n, sheetId: sid };
  }
  return null;
}

export async function listSheetNames() {
  await refreshSheetMap();
  return [...sheetIdByName.keys()];
}

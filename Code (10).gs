// ============================================================
// HỆ THỐNG QUẢN TRỊ SỮA HẠT - Code.gs (Main Backend)
// Version 2.0 | Multi-file Architecture
// ============================================================

// ============================================================
// ROUTING - Phân phối giao diện
// ============================================================

/** Favicon toàn bộ web app - chỉnh một chỗ. HtmlOutput.setFaviconUrl (tab trình duyệt) + thay __SUN_FAVICON_URL__ trong HTML/JS. */
var SUN_FAVICON_URL_ = 'https://i.ibb.co/8LV0snn8/logo-sun-web.png';

function injectSunFaviconUrl_(html) {
  return String(html || '').split('__SUN_FAVICON_URL__').join(SUN_FAVICON_URL_);
}

/** Sửa thẻ HTML lỗi trước HtmlService.createHtmlOutput (GAS từ chối markup không hợp lệ). */
function sanitizeHtmlForGas_(html) {
  var s = String(html || '');
  s = s.replace(/<\/?motion\b[^>]*>/gi, function (m) {
    return /^\s*<\//.test(m) ? '</div>' : '<div';
  });
  s = s.replace(/<div\s*\r?\n\s*<div class="modal-sheet"/gi,
    '<div class="modal-overlay" id="onlineOrdersModal" onclick="if(event.target===this)closeOnlineOrdersModal()">\n    <div class="modal-sheet"');
  return s;
}

/** Ghép MemberStyles + MemberScriptsCore vào Member*.html (placeholder <!--MEMBER_STYLES-->, <!--MEMBER_SCRIPTS_CORE-->).
 *  Trên Apps Script không cần file .css riêng: MemberStyles.html là khối <style>...</style> được chèn vào HTML.
 *  (Local preview) Nếu mở HTML trực tiếp (file:// / localhost) thì có thể tự nhúng CSS riêng; bản deploy dùng MemberStyles.html. */
function memberTryLoadHtmlFile_(names) {
  for (var i = 0; i < names.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(names[i]).getContent();
    } catch (e) { }
  }
  return '';
}

/** Lấy khối <style>...</style> đầu tiên nếu file bị bọc thêm HTML ngoài ý muốn. */
function memberNormalizeStyleSnippet_(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  var start = s.search(/<style[^>]*>/i);
  if (start < 0) return s;
  var end = s.toLowerCase().lastIndexOf('</style>');
  if (end > start) return s.substring(start, end + 8);
  return s;
}

/** Portal đã nhúng CSS đầy đủ (MemberStyles inlined trong MemberPortal.html). */
function memberPortalHasInlinedStyles_(html) {
  return String(html || '').indexOf('mem-gate-panel') !== -1 &&
    String(html || '').indexOf('.mem-gate-submit') !== -1;
}

/** Lấy khối <script>...</script> đầu tiên nếu file bị bọc thêm HTML. */
function memberNormalizeCoreSnippet_(raw) {
  var s = String(raw || '').trim();
  if (!s) return '<script></script>';
  var m = s.match(/<script[^>]*>[\s\S]*?<\/script>/i);
  return m ? m[0] : s;
}

/** Ghép style/core vào body HTML; nếu placeholder sai/không khớp thì chèn dự phòng trước </head> / </body>. */
function memberMergePortalHtml_(body, stylesRaw, coreRaw, orderClientRaw) {
  var styles = memberNormalizeStyleSnippet_(stylesRaw);
  var core = memberNormalizeCoreSnippet_(coreRaw);
  var orderClient = memberNormalizeCoreSnippet_(orderClientRaw || '');
  var merged = String(body || '').replace(/^\uFEFF/, '');
  var stylesFromFile = styles;
  var stylesBegin = '<!--MEMBER_STYLES_BEGIN-->';
  var stylesEnd = '<!--MEMBER_STYLES_END-->';
  if (stylesFromFile && merged.indexOf(stylesBegin) !== -1 && merged.indexOf(stylesEnd) !== -1) {
    var reBlock = new RegExp(stylesBegin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '[\\s\\S]*?' + stylesEnd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    merged = merged.replace(reBlock, stylesBegin + '\n' + stylesFromFile + '\n' + stylesEnd);
  } else {
    merged = merged.replace(/<!--\s*MEMBER_STYLES\s*-->/gi, stylesFromFile);
  }
  merged = merged.replace(/<!--\s*MEMBER_SCRIPTS_CORE\s*-->/gi, core);
  merged = merged.replace(/<!--\s*MEMBER_ORDER_CLIENT\s*-->/gi, orderClient);
  // Ép chèn MemberStyles nếu portal chưa có CSS gate (tránh nhầm với :root trong critical CSS)
  var stylesOk = stylesFromFile && stylesFromFile.indexOf('mem-gate-panel') !== -1;
  var mergedHasGateCss = memberPortalHasInlinedStyles_(merged);
  if (stylesOk && !mergedHasGateCss) {
    var hi = merged.search(/<\/head\s*>/i);
    if (hi !== -1) merged = merged.substring(0, hi) + '\n' + stylesFromFile + '\n' + merged.substring(hi);
    else merged = stylesFromFile + '\n' + merged;
  }
  if (stylesRaw && String(stylesRaw).trim() && !stylesOk) {
    Logger.log('memberMergePortalHtml_: MemberStyles.html không có khối <style> hợp lệ');
  }
  if (!memberPortalHasInlinedStyles_(merged)) {
    Logger.log('memberMergePortalHtml_: CẢNH BÁO - thiếu CSS cổng hội viên. Thêm file MemberStyles.html hoặc deploy MemberPortal đã nhúng CSS.');
  }
  // Nếu vẫn thiếu google.script.run (core) thì ép chèn trước </body>
  if (core && core.indexOf('google.script.run') !== -1 && merged.indexOf('google.script.run') === -1) {
    var bi = merged.search(/<\/body\s*>/i);
    if (bi !== -1) merged = merged.substring(0, bi) + '\n' + core + '\n' + merged.substring(bi);
    else merged = merged + '\n' + core;
  }
  merged = merged.replace(/<!--\s*MEMBER_STYLES\s*-->/gi, '');
  merged = merged.replace(/<!--\s*MEMBER_SCRIPTS_CORE\s*-->/gi, '');
  merged = merged.replace(/<!--\s*MEMBER_ORDER_CLIENT\s*-->/gi, '');
  return merged;
}

function memberHtmlBundle_(fileName, pageTitle) {
  var url = ScriptApp.getService().getUrl();
  const URL_TOKEN = '__SUN_URL_INJECT__';
  var styles = '<style>body{font-family:system-ui;padding:16px;}</style>';
  var core = '<script></script>';
  var stylesRaw = memberTryLoadHtmlFile_(['MemberStyles', 'MemberStyles.html', 'memberStyles', 'memberstyles']);
  if (stylesRaw) styles = stylesRaw;
  var coreRaw = memberTryLoadHtmlFile_(['MemberScriptsCore', 'MemberScriptsCore.html', 'memberScriptsCore', 'memberscriptscore']);
  if (coreRaw) core = coreRaw;
  var orderClientRaw = memberTryLoadHtmlFile_(['MemberOrderClient', 'MemberOrderClient.html', 'memberOrderClient', 'memberorderclient']);
  var body = HtmlService.createHtmlOutputFromFile(fileName).getContent();
  var merged = memberMergePortalHtml_(body, styles, core, orderClientRaw);
  if (merged.indexOf('function normPhone') === -1 && String(coreRaw || '').trim()) {
    var coreEmergency = memberNormalizeCoreSnippet_(coreRaw);
    if (coreEmergency.indexOf('google.script.run') !== -1) {
      var biEm = merged.search(/<\/body\s*>/i);
      if (biEm !== -1) {
        merged = merged.substring(0, biEm) + '\n' + coreEmergency + '\n' + merged.substring(biEm);
      } else {
        merged = merged + '\n' + coreEmergency;
      }
    }
  }
  var inj = JSON.stringify(url || '');
  merged = merged.split(URL_TOKEN).join(inj);
  merged = injectSunFaviconUrl_(merged);
  merged = sanitizeHtmlForGas_(merged);
  return HtmlService.createHtmlOutput(merged)
    .setTitle(pageTitle)
    .setFaviconUrl(SUN_FAVICON_URL_)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

function doGet(e) {
  // ===== JSON API endpoints (faster than google.script.run for polling) =====
  try {
    if (e && e.parameter && e.parameter.api) {
      var api = String(e.parameter.api || '').trim();
      if (api === 'menu') {
        var outM = getMenu();
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, menu: outM }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      if (api === 'ping') {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, now: new Date().toISOString() }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      if (api === 'memberPortal') {
        var phoneP = '';
        if (e.parameter) {
          phoneP = e.parameter.phone != null ? String(e.parameter.phone) : '';
          if (!phoneP && e.parameter.p != null) phoneP = String(e.parameter.p);
        }
        var outPortal = memberPortalLookup(phoneP);
        return ContentService
          .createTextOutput(JSON.stringify(outPortal))
          .setMimeType(ContentService.MimeType.JSON);
      }
      /** Một request: cài đặt cổng + menu + gói (nhanh hơn 3 lần google.script.run lần lượt). */
      if (api === 'memberPortalBootstrap') {
        var boot = memberPortalBootstrapPayload_();
        return ContentService
          .createTextOutput(JSON.stringify(boot))
          .setMimeType(ContentService.MimeType.JSON);
      }
      if (api === 'resolveCustomer') {
        var idIn = e.parameter.id != null ? String(e.parameter.id) : '';
        return ContentService.createTextOutput(JSON.stringify(resolveCustomerIdentifier(idIn)))
          .setMimeType(ContentService.MimeType.JSON);
      }
      if (api === 'deliveryZones') {
        return ContentService.createTextOutput(JSON.stringify(getMemberDeliveryZones()))
          .setMimeType(ContentService.MimeType.JSON);
      }
      /** Polling trạng thái đơn nhóm (GET nhanh hơn google.script.run). */
      if (api === 'groupOrder') {
        var gid = e.parameter.group != null ? String(e.parameter.group) : '';
        return ContentService.createTextOutput(JSON.stringify(getGroupOrder(gid)))
          .setMimeType(ContentService.MimeType.JSON);
      }
      /** Trạng thái đơn online theo mã - màn hình chờ nhận nước của thành viên nhóm. */
      if (api === 'orderStatus') {
        var oidQ = e.parameter.order != null ? String(e.parameter.order) : '';
        return ContentService.createTextOutput(JSON.stringify(getOnlineOrderStatusPublic(oidQ)))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
  } catch (eApi) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, message: String(eApi && eApi.message ? eApi.message : eApi) }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const page = e.parameter.page || 'order';
  const url = ScriptApp.getService().getUrl();
  
  /** Cổng hội viên (unified): page=member → MemberPortal (1 page). */
  if (page === 'member' || page === 'member_portal') {
    var memMap = {
      member: { file: 'MemberPortal', title: 'Hội viên | SUN Nut Milk' },
      member_portal: { file: 'MemberPortal', title: 'Hội viên | SUN Nut Milk' }
    };
    var memCfg = memMap[page] || memMap.member;
    return memberHtmlBundle_(memCfg.file, memCfg.title);
  }

  if (page === 'pickup') {
    var pickupHtml = HtmlService.createHtmlOutputFromFile('Pickup').getContent();
    pickupHtml = pickupHtml.replace('__SUN_URL_INJECT__', JSON.stringify(url || ''));
    pickupHtml = sanitizeHtmlForGas_(injectSunFaviconUrl_(pickupHtml));
    return HtmlService.createHtmlOutput(pickupHtml)
      .setTitle('Đặt hàng | SUN Nut Milk')
      .setFaviconUrl(SUN_FAVICON_URL_)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
  }

  if (page === 'admin') {
    // Không dùng HtmlTemplate cho Admin - tránh GAS nuốt ${...} trong JS (template literal).
    const URL_TOKEN = '__SUN_URL_INJECT__';
    var adminHtml = HtmlService.createHtmlOutputFromFile('Admin').getContent();
    adminHtml = adminHtml.replace(URL_TOKEN, JSON.stringify(url || ''));
    adminHtml = sanitizeHtmlForGas_(injectSunFaviconUrl_(adminHtml));
    return HtmlService.createHtmlOutput(adminHtml)
      .setTitle('Admin | Quản Trị Sữa Hạt')
      .setFaviconUrl(SUN_FAVICON_URL_)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  
  // Trang Order: KHÔNG dùng createTemplateFromFile('Order'). HtmlTemplate quét ${...} trên cả chuỗi HTML
  // sau khi ghép → làm hỏng template literal trong OrderClient (lỗi Unexpected token 'class').
  const ORDER_CLIENT_MARKER = '<!--SUN_ORDER_CLIENT_JS-->';
  const URL_TOKEN = '__SUN_URL_INJECT__';
  var html = HtmlService.createHtmlOutputFromFile('Order').getContent();
  html = html.replace(URL_TOKEN, JSON.stringify(url || ''));
  var clientHtml = HtmlService.createHtmlOutputFromFile('OrderClient').getContent();
  if (html.indexOf(ORDER_CLIENT_MARKER) !== -1) {
    html = html.split(ORDER_CLIENT_MARKER).join(clientHtml);
  } else {
    var closeBody = html.toLowerCase().lastIndexOf('</body>');
    if (closeBody !== -1) {
      html = html.substring(0, closeBody) + clientHtml + html.substring(closeBody);
    } else {
      html = html + clientHtml;
    }
  }
  html = sanitizeHtmlForGas_(injectSunFaviconUrl_(html));
  return HtmlService.createHtmlOutput(html)
    .setTitle('Order | Sữa Hạt Tươi')
    .setFaviconUrl(SUN_FAVICON_URL_)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Include helper để nhúng file HTML
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
const CACHE = {
  get: (key) => {
    const val = CacheService.getScriptCache().get(key);
    return val ? JSON.parse(val) : null;
  },
  set: (key, val, expireSec = 300) => {
    // Cẩn thận với giới hạn 100KB của Apps Script Cache
    const str = JSON.stringify(val);
    if (str.length < 90000) CacheService.getScriptCache().put(key, str, expireSec);
  },
  clear: (keys) => {
    if (!Array.isArray(keys)) keys = [keys];
    CacheService.getScriptCache().removeAll(keys);
  }
};

function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f4f6");
    }
  }
  return sheet;
}

function getSheetData(name, startRow, numCols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < startRow) return [];
  return sheet.getRange(startRow, 1, sheet.getLastRow() - startRow + 1, numCols).getValues();
}

// ============================================================
// 1. DANH MỤC NGUYÊN LIỆU (Config sheet - 8 cột)
// ============================================================
function getInventory(skipCache) {
  if (!skipCache) {
    const cached = CACHE.get('inventory');
    if (cached) return cached;
  }

  const headersDef = ["Mã", "Loại", "Tên nguyên liệu", "ĐVT", "Nhà cung cấp", "Quy cách", "Giá sỉ", "Định lượng Mix", "Giá bán Mix", "Ghi chú"];
  const sheet = getSheet("Config", headersDef);
  if (sheet.getLastRow() < 2) return [];
  
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const colMixQty = headers.indexOf("Định lượng Mix");
  const colMixPrice = headers.indexOf("Giá bán Mix");
  const colNote = headers.indexOf("Ghi chú");
  
  const safeNum = (v) => isNaN(parseFloat(v)) ? 0 : parseFloat(v);
  
  const result = [];
  for (var ri = 1; ri < allData.length; ri++) {
    var r = allData[ri];
    if (!r[2] || String(r[2]).trim() === '') continue;
    result.push({
      sheetRow: ri + 1,
      code: String(r[0] || '').trim(),
      type: String(r[1] != null ? r[1] : '').replace(/[\uFEFF\u200B-\u200D\u2060]/g, '').trim(),
      name: String(r[2] != null ? r[2] : '').replace(/[\uFEFF\u200B-\u200D\u2060]/g, '').trim(),
      unit: String(r[3] || '').trim(),
      supplier: String(r[4] || ''),
      size: safeNum(r[5]),
      price: safeNum(r[6]),
      mixQty: colMixQty > -1 ? safeNum(r[colMixQty]) : 0,
      mixPrice: colMixPrice > -1 ? safeNum(r[colMixPrice]) : 0,
      note: colNote > -1 ? String(r[colNote] || '') : '',
      unitPrice: safeNum(r[5]) > 0 ? (safeNum(r[6]) / safeNum(r[5])) : 0
    });
  }

  CACHE.set('inventory', result, 180); // skipCache chỉ bỏ qua đọc cache; sau khi đọc sheet vẫn cập nhật cache cho POS
  return result;
}

function addIngredient(data) {
  const sheet = getSheet("Config", ["Mã", "Loại", "Tên nguyên liệu", "ĐVT", "Nhà cung cấp", "Quy cách", "Giá sỉ", "Định lượng Mix", "Giá bán Mix", "Ghi chú"]);
  sheet.appendRow([data.code, data.type, data.name, data.unit, data.supplier, data.size, data.price, data.mixQty || 0, data.mixPrice || 0, data.note]);
  CACHE.clear(['inventory', 'stock_month', 'stock_today', 'stock_week']);
  return "Đã thêm nguyên liệu mới vào Danh mục!";
}

function updateIngredient(sheetRow, data) {
  const headersDef = ["Mã", "Loại", "Tên nguyên liệu", "ĐVT", "Nhà cung cấp", "Quy cách", "Giá sỉ", "Định lượng Mix", "Giá bán Mix", "Ghi chú"];
  const sheet = getSheet("Config", headersDef);
  var row = parseInt(sheetRow, 10);
  if (isNaN(row) || row < 2) throw new Error('Dòng sheet không hợp lệ');
  // setValues cần range đúng 1 dòng (numRows = 1). Nếu dùng numRows = row sẽ gây lỗi mismatch.
  sheet.getRange(row, 1, 1, 10).setValues([[data.code, data.type, data.name, data.unit, data.supplier, data.size, data.price, data.mixQty || 0, data.mixPrice || 0, data.note]]);
  CACHE.clear(['inventory', 'stock_month', 'stock_today', 'stock_week']);
  return "Đã cập nhật nguyên liệu!";
}

function deleteIngredient(sheetRow) {
  const headersDef = ["Mã", "Loại", "Tên nguyên liệu", "ĐVT", "Nhà cung cấp", "Quy cách", "Giá sỉ", "Định lượng Mix", "Giá bán Mix", "Ghi chú"];
  const sheet = getSheet("Config", headersDef);
  var row = parseInt(sheetRow, 10);
  if (isNaN(row) || row < 2) throw new Error('Dòng sheet không hợp lệ');
  sheet.deleteRow(row);
  CACHE.clear(['inventory', 'stock_month', 'stock_today', 'stock_week']);
  return "Đã xóa nguyên liệu!";
}

// ============================================================
// 1b. MIX HẠT (sheet MixHat)
// ============================================================
var MIXHAT_HEADERS = ["ID", "Tên hạt", "Mô tả", "Giá bán", "Định lượng Mix", "Ảnh", "Bật", "Thứ tự"];

/** Tìm sheet MixHat dù tab đổi tên (Mix hạt, …); chỉ tạo mới khi không có tab nào khớp. */
function getMixHatSpreadsheetSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tryNames = ['MixHat', 'Mix Hạt', 'Mix hạt', 'MIX HẠT', 'Mix HẠT'];
  for (var i = 0; i < tryNames.length; i++) {
    var sh = ss.getSheetByName(tryNames[i]);
    if (sh) return sh;
  }
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var nm = String(sheets[j].getName() || '').replace(/\s+/g, ' ').trim();
    var low = nm.toLowerCase();
    if (low === 'mixhat' || low === 'mix hạt') return sheets[j];
  }
  return getSheet('MixHat', MIXHAT_HEADERS);
}

/** Cột B sheet Config = Hạt (không phụ thuộc chữ hoa / ký tự ẩn). */
function isConfigLoaiHat_(v) {
  var raw = String(v != null ? v : '').replace(/[\uFEFF\u200B-\u200D\u2060]/g, '').trim();
  if (!raw) return false;
  var t;
  try {
    t = raw.normalize('NFKC').toLowerCase();
  } catch (e) {
    t = raw.toLowerCase();
  }
  if (t === 'hạt' || t === 'hat') return true;
  try {
    var d = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return d === 'hat';
  } catch (e2) {
    return false;
  }
}

/** Danh sách hạt cho dropdown Admin (cột B=Hạt, C=Tên) - đọc trực tiếp Config, không phụ thuộc cache inventory. */
function getMixHatPickerSeeds() {
  var headersDef = ['Mã', 'Loại', 'Tên nguyên liệu', 'ĐVT', 'Nhà cung cấp', 'Quy cách', 'Giá sỉ', 'Định lượng Mix', 'Giá bán Mix', 'Ghi chú'];
  var sheet = getSheet('Config', headersDef);
  if (sheet.getLastRow() < 2) return [];
  var all = sheet.getDataRange().getValues();
  var headers = all[0];
  var colMixQty = headers.indexOf('Định lượng Mix');
  var colMixPrice = headers.indexOf('Giá bán Mix');
  var colLoai = headers.indexOf('Loại');
  var colTen = headers.indexOf('Tên nguyên liệu');
  if (colLoai < 0) colLoai = 1;
  if (colTen < 0) colTen = 2;
  var safeNum = function (x) {
    var n = parseFloat(x);
    return isNaN(n) ? 0 : n;
  };
  var out = [];
  for (var r = 1; r < all.length; r++) {
    var row = all[r];
    if (!row || !isConfigLoaiHat_(row[colLoai])) continue;
    var name = String(row[colTen] != null ? row[colTen] : '').trim();
    if (!name) continue;
    out.push({
      name: name,
      mixQty: colMixQty > -1 ? safeNum(row[colMixQty]) : 0,
      mixPrice: colMixPrice > -1 ? Math.round(safeNum(row[colMixPrice])) : 0
    });
  }
  out.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name), 'vi');
  });
  return out;
}

function ensureMixHatColumns_(sh) {
  if (!sh) return;
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return;
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
  MIXHAT_HEADERS.forEach(function (title) {
    if (headers.indexOf(title) === -1) {
      sh.getRange(1, lastCol + 1).setValue(title);
      lastCol++;
      headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
    }
  });
}

/** Tìm chỉ số cột theo danh sách tên chính xác, rồi fallback theo chỉ số mặc định (sheet cũ / đổi tên cột). */
function mixHatNormHeader_(h) {
  return String(h != null ? h : '').replace(/[\uFEFF\u200B-\u200D\u2060]/g, '').trim();
}

function mixHatColIx_(headers, exactNames, defaultIdx) {
  var norm = headers.map(mixHatNormHeader_);
  for (var e = 0; e < exactNames.length; e++) {
    var want = mixHatNormHeader_(exactNames[e]);
    var j = norm.indexOf(want);
    if (j > -1) return j;
  }
  if (defaultIdx >= 0 && defaultIdx < headers.length) return defaultIdx;
  return -1;
}

/** Cột "Tên hạt": ưu tiên header chuẩn / đồng nghĩa; tránh cột ID trống nhưng cột tên ở B. */
function mixHatNameColIx_(headers) {
  var j = mixHatColIx_(headers, ['Tên hạt', 'Tên Hạt', 'Ten hat', 'Name'], -1);
  if (j > -1) return j;
  var hi;
  for (hi = 0; hi < headers.length; hi++) {
    var t = String(headers[hi] || '').trim().toLowerCase();
    if (t.indexOf('tên') !== -1 && t.indexOf('hạt') !== -1) return hi;
  }
  if (headers.length > 1) return 1;
  return -1;
}

function getMixHats(skipCache) {
  if (!skipCache) {
    const cached = CACHE.get('mixhats');
    if (cached) return cached;
  }
  const sh = getMixHatSpreadsheetSheet_();
  ensureMixHatColumns_(sh);
  if (sh.getLastRow() < 2) return [];
  const all = sh.getDataRange().getValues();
  const headers = all[0].map(function (h) { return mixHatNormHeader_(h); });
  const colId = mixHatColIx_(headers, ['ID'], 0);
  let colName = mixHatNameColIx_(headers);
  const colDesc = mixHatColIx_(headers, ['Mô tả', 'Mo ta', 'Description'], 2);
  const colPrice = mixHatColIx_(headers, ['Giá bán', 'Gia ban', 'Price'], 3);
  const colMixQty = mixHatColIx_(headers, ['Định lượng Mix', 'Dinh luong Mix', 'Mix Qty'], 4);
  const colImg = mixHatColIx_(headers, ['Ảnh', 'Anh', 'Image', 'URL'], 5);
  const colOn = mixHatColIx_(headers, ['Bật', 'Bat', 'Enabled', 'Active'], 6);
  const colOrd = mixHatColIx_(headers, ['Thứ tự', 'Thu tu', 'Order', 'STT'], 7);
  if (colName < 0) return [];
  var bodyMatrix = all.slice(1);
  function mixHatNameHits_(cIdx) {
    if (cIdx < 0) return 0;
    var h = 0;
    for (var r = 0; r < bodyMatrix.length && r < 300; r++) {
      var row = bodyMatrix[r];
      if (!row) continue;
      var v = row[cIdx];
      if (v != null && String(v).trim() !== '') h++;
    }
    return h;
  }
  // Sheet cũ: thêm cột "Tên hạt" trống ở cuối nhưng tên thật vẫn ở cột B/C…
  if (mixHatNameHits_(colName) === 0) {
    var cand = [];
    for (var c = 0; c < headers.length; c++) {
      var n = mixHatNameHits_(c);
      if (n === 0) continue;
      var hn = String(headers[c] || '').trim().toLowerCase();
      var score = n;
      if (hn.indexOf('tên') !== -1 && hn.indexOf('hạt') !== -1) score += 100000;
      else if (hn.indexOf('tên') !== -1 || hn.indexOf('name') !== -1) score += 50000;
      else if (c === 1) score += 1000;
      cand.push({ c: c, score: score });
    }
    cand.sort(function (a, b) { return b.score - a.score; });
    if (cand.length) colName = cand[0].c;
  }
  const safeNum = v => isNaN(parseFloat(v)) ? 0 : parseFloat(v);
  const parseBoolCell = (v, d) => {
    if (v === '' || v === undefined || v === null) return d;
    if (v === true || v === 1) return true;
    if (v === false || v === 0) return false;
    var u = String(v).trim().toUpperCase();
    if (u === 'TRUE' || u === 'CÓ' || u === 'YES' || u === '1' || u === 'ON') return true;
    if (u === 'FALSE' || u === 'KHÔNG' || u === 'NO' || u === '0' || u === 'OFF') return false;
    return d;
  };

  const bodyRows = bodyMatrix.map(function (r, idx) {
    return { r: r, sheetRow: idx + 2 };
  }).filter(function (o) {
    return o.r && o.r[colName] != null && String(o.r[colName]).trim() !== '';
  });
  const result = bodyRows.map(function (o, i) {
    var r = o.r;
    const id = (colId > -1 && r[colId]) ? String(r[colId]) : ('MIX_' + (new Date().getTime()) + '_' + i);
    const order = colOrd > -1 ? safeNum(r[colOrd]) : i;
    return {
      id: id,
      name: String(r[colName] || '').trim(),
      description: colDesc > -1 ? String(r[colDesc] || '').trim() : '',
      price: colPrice > -1 ? safeNum(r[colPrice]) : 0,
      mixQty: colMixQty > -1 ? safeNum(r[colMixQty]) : 0,
      imageUrl: colImg > -1 ? String(r[colImg] || '').trim() : '',
      enabled: colOn > -1 ? parseBoolCell(r[colOn], true) : true,
      order: order,
      sheetRow: o.sheetRow
    };
  }).sort((a, b) => (a.order - b.order) || String(a.name).localeCompare(String(b.name), 'vi'));

  CACHE.set('mixhats', result, 600);
  return result;
}

function upsertMixHat(data) {
  const sh = getMixHatSpreadsheetSheet_();
  ensureMixHatColumns_(sh);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const ix = name => headers.indexOf(name);
  const colId = ix("ID");
  const colName = ix("Tên hạt");
  const safeNum = v => isNaN(parseFloat(v)) ? 0 : parseFloat(v);
  const id = String((data && data.id) ? data.id : '').trim() || ('MIX_' + new Date().getTime());
  const name = String((data && data.name) ? data.name : '').trim();
  if (!name) throw new Error('Thiếu tên hạt');

  const all = sh.getDataRange().getValues();
  let rowIdx = -1;
  for (var r = 1; r < all.length; r++) {
    if (colId > -1 && String(all[r][colId] || '') === id) { rowIdx = r + 1; break; }
  }

  const valMap = {
    "ID": id,
    "Tên hạt": name,
    "Mô tả": data && data.description ? String(data.description) : '',
    "Giá bán": safeNum(data && data.price),
    "Định lượng Mix": safeNum(data && data.mixQty),
    "Ảnh": data && data.imageUrl ? String(data.imageUrl) : '',
    "Bật": data && data.enabled === false ? false : true,
    "Thứ tự": (data && data.order != null && data.order !== '') ? safeNum(data.order) : 0
  };
  const row = headers.map(h => valMap[h] !== undefined ? valMap[h] : '');

  if (rowIdx === -1) sh.appendRow(row);
  else sh.getRange(rowIdx, 1, 1, headers.length).setValues([row]);

  CACHE.clear('mixhats');
  return { ok: true, id: id };
}

function deleteMixHat(id) {
  const sh = getMixHatSpreadsheetSheet_();
  if (sh.getLastRow() < 2) return { ok: true };
  const all = sh.getDataRange().getValues();
  const headers = all[0].map(h => String(h || '').trim());
  const colId = headers.indexOf("ID");
  if (colId < 0) throw new Error('Thiếu cột ID');
  const target = String(id || '').trim();
  if (!target) throw new Error('Thiếu id');
  for (var r = 1; r < all.length; r++) {
    if (String(all[r][colId] || '') === target) {
      sh.deleteRow(r + 1);
      CACHE.clear('mixhats');
      return { ok: true };
    }
  }
  return { ok: true };
}

// ============================================================
// 2. MENU SẢN PHẨM
// ============================================================
var MENU_HEADERS_BASE = ["ID", "Tên", "Danh mục", "Giá cơ bản", "Mô tả", "Hình ảnh", "Thành phần", "Còn hàng", "Phổ biến", "Ghi chú", "Giá vốn", "Phí VH"];
var MENU_HEADERS_EXTRA = [
  "Ảnh bìa",
  "Giảm ly nhỏ",
  "Phụ thu ly lớn",
  "Bật cỡ nhỏ",
  "Bật cỡ thường",
  "Bật cỡ lớn",
  "Phụ thu chai nhựa",
  "Định mức size (JSON)",
  "Phụ thu gia đình 500ml",
  "Phụ thu gia đình 1L",
  "Giá bán chai 500ml",
  "Giá bán chai 1 lít",
  "Calo ước (kcal)",
  "Protein ước (g)",
  "Chất béo ước (g)",
  "Công dụng",
  "Nhãn HV",
  "Tag HV"
];

function defaultMenuLabelCatalog_() {
  return [
    { id: 'hot', name: 'Hot', style: 'hot' },
    { id: 'nen-thu', name: 'Nên thử', style: 'try' },
    { id: 'bestseller', name: 'Best seller', style: 'bestseller' },
    { id: 'mon-moi', name: 'Món mới', style: 'new' }
  ];
}

function defaultMenuTagCatalog_() {
  return [
    { id: 'giam-can', name: 'Giảm cân', style: 'giam' },
    { id: 'dep-da', name: 'Đẹp da', style: 'da' },
    { id: 'thai-doc', name: 'Thải độc', style: 'detox' },
    { id: 'tieu-hoa', name: 'Tiêu hóa', style: 'tieu' }
  ];
}

function normalizeMenuLabelCatalog_(raw) {
  var base = defaultMenuLabelCatalog_();
  if (!raw || !Array.isArray(raw)) return base;
  var out = [];
  var seen = {};
  raw.forEach(function (it) {
    if (!it || typeof it !== 'object') return;
    var id = String(it.id || it.name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    var name = String(it.name || it.id || '').trim();
    if (!id || !name || seen[id]) return;
    seen[id] = 1;
    var style = String(it.style || id).trim() || id;
    out.push({ id: id, name: name, style: style });
  });
  return out.length ? out : base;
}

function normalizeMenuTagCatalog_(raw) {
  var base = defaultMenuTagCatalog_();
  if (!raw || !Array.isArray(raw)) return base;
  var out = [];
  var seen = {};
  raw.forEach(function (it) {
    if (!it || typeof it !== 'object') return;
    var id = String(it.id || it.name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    var name = String(it.name || it.id || '').trim();
    if (!id || !name || seen[id]) return;
    var style = String(it.style || id).trim() || id;
    out.push({ id: id, name: name, style: style });
  });
  return out.length ? out : base;
}

function parseMenuTagsCell_(raw) {
  var s = String(raw || '').trim();
  if (!s) return [];
  return s.split(/[,|;]/).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
}

/** Folder Drive lưu ảnh sản phẩm (link xem: anyone with link). */
var SUN_DRIVE_PRODUCT_FOLDER_ID = '1yooGei2DggcJja0M6T1U4ixobEtvK_ak';

var PROMO_HEADERS_EXTRA = ["Quy tắc", "Cấu hình JSON"];

function ensurePromotionsExtraColumns(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  PROMO_HEADERS_EXTRA.forEach(function (title) {
    if (headers.indexOf(title) === -1) {
      sheet.getRange(1, lastCol + 1).setValue(title);
      lastCol++;
      headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    }
  });
}

function ensureMenuExtraColumns(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return;
  let lastCol = sheet.getLastColumn();
  let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  MENU_HEADERS_EXTRA.forEach(function (title) {
    if (headers.indexOf(title) === -1) {
      sheet.getRange(1, lastCol + 1).setValue(title);
      lastCol++;
      headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    }
  });
}

function getMenu() {
  const cached = CACHE.get('menu');
  if (cached) return cached;

  const sheet = getSheet("Menu", MENU_HEADERS_BASE);
  ensureMenuExtraColumns(sheet);
  if (sheet.getLastRow() < 2) return [];

  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const data = allData.slice(1).filter(function (r) { return r[1] && String(r[1]).trim() !== ''; });

  const ix = function (name) { return headers.indexOf(name); };
  const colIng = ix("Thành phần");
  const colAvail = ix("Còn hàng");
  const colPop = ix("Phổ biến");
  const colNote = ix("Ghi chú");
  const colCost = ix("Giá vốn");
  const colOpEx = ix("Phí VH");
  const colSmall = ix("Giảm ly nhỏ");
  const colLarge = ix("Phụ thu ly lớn");
  const colEnSmall = ix("Bật cỡ nhỏ");
  const colEnReg = ix("Bật cỡ thường");
  const colEnLarge = ix("Bật cỡ lớn");
  const colPlastic = ix("Phụ thu chai nhựa");
  const colSizeRecipe = ix("Định mức size (JSON)");
  const colFam500 = ix("Phụ thu gia đình 500ml");
  const colFam1L = ix("Phụ thu gia đình 1L");
  const colSellFam500 = ix("Giá bán chai 500ml");
  const colSellFam1L = ix("Giá bán chai 1 lít");
  const colKcal = ix("Calo ước (kcal)");
  const colProt = ix("Protein ước (g)");
  const colFat = ix("Chất béo ước (g)");
  const colBenefits = ix("Công dụng");
  const colCover = ix("Ảnh bìa");
  const colMemLabel = ix("Nhãn HV");
  const colMemTags = ix("Tag HV");

  const safeNum = function (v) { return isNaN(parseFloat(v)) ? 0 : parseFloat(v); };
  const DEFAULT_LARGE_EXTRA = 8000;
  const parseBoolCell = function (v, defaultVal) {
    if (v === '' || v === undefined || v === null) return defaultVal;
    if (v === true || v === 1) return true;
    if (v === false || v === 0) return false;
    var u = String(v).trim().toUpperCase();
    if (u === 'TRUE' || u === 'CÓ' || u === 'YES' || u === '1') return true;
    if (u === 'FALSE' || u === 'KHÔNG' || u === 'NO' || u === '0') return false;
    return defaultVal;
  };

  const result = data.map(function (r) {
    let parsedIngredients = [];
    const ingCell = colIng > -1 ? r[colIng] : r[6];
    if (ingCell) {
      try {
        parsedIngredients = JSON.parse(ingCell);
      } catch (e) {
        parsedIngredients = String(ingCell).split(',').map(function (s) { return { name: s.trim(), qty: 1 }; });
      }
    }
    const parseBool = function (v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; };
    const isAvailable = function (v) { return v !== false && String(v).trim().toUpperCase() !== 'FALSE'; };
    const smallDisc = colSmall > -1 ? safeNum(r[colSmall]) : 0;
    let largeExtra = DEFAULT_LARGE_EXTRA;
    if (colLarge > -1) {
      if (r[colLarge] === '' || r[colLarge] === null || r[colLarge] === undefined) largeExtra = DEFAULT_LARGE_EXTRA;
      else largeExtra = safeNum(r[colLarge]);
    }
    var plasticExtra = colPlastic > -1 ? safeNum(r[colPlastic]) : 0;
    var sizeRecipeExtra = [];
    if (colSizeRecipe > -1 && r[colSizeRecipe]) {
      try {
        var parsedSz = JSON.parse(String(r[colSizeRecipe]));
        sizeRecipeExtra = Array.isArray(parsedSz) ? parsedSz : (parsedSz && parsedSz.large ? parsedSz.large : []);
      } catch (eSz) {
        sizeRecipeExtra = [];
      }
    }
    var enableSmall = colEnSmall > -1 ? parseBoolCell(r[colEnSmall], false) : (smallDisc > 0);
    var enableRegular = colEnReg > -1 ? parseBoolCell(r[colEnReg], true) : true;
    var enableLarge = colEnLarge > -1 ? parseBoolCell(r[colEnLarge], true) : true;
    if (!enableSmall && !enableRegular && !enableLarge) enableRegular = true;

    var ingredientNames = [];
    var seenN = {};
    parsedIngredients.forEach(function (ing) {
      var nm = '';
      if (typeof ing === 'string') nm = String(ing).trim();
      else if (ing && ing.name) nm = String(ing.name).trim();
      if (!nm || seenN[nm]) return;
      seenN[nm] = 1;
      ingredientNames.push(nm);
    });

    return {
      id: String(r[0] || ''),
      name: String(r[1] || ''),
      category: String(r[2] || ''),
      basePrice: safeNum(r[3]),
      description: String(r[4] || ''),
      imageUrl: String(r[5] || ''),
      coverImageUrl: colCover > -1 ? String(r[colCover] || '') : '',
      ingredients: parsedIngredients,
      benefits: colBenefits > -1 ? String(r[colBenefits] || '').trim() : '',
      ingredientNames: ingredientNames,
      available: colAvail > -1 ? isAvailable(r[colAvail]) : isAvailable(r[7]),
      popular: colPop > -1 ? parseBool(r[colPop]) : parseBool(r[8]),
      note: colNote > -1 ? String(r[colNote] || '') : '',
      costPrice: colCost > -1 ? safeNum(r[colCost]) : 0,
      opEx: colOpEx > -1 ? safeNum(r[colOpEx]) : 0,
      smallCupDiscount: smallDisc,
      largeCupExtra: largeExtra,
      hasLargeSize: largeExtra >= 0,
      enableSmall: enableSmall,
      enableRegular: enableRegular,
      enableLarge: enableLarge,
      plasticBottleExtra: plasticExtra,
      sizeRecipeExtra: sizeRecipeExtra,
      familyPackExtra500: colFam500 > -1 ? safeNum(r[colFam500]) : 0,
      familyPackExtra1L: colFam1L > -1 ? safeNum(r[colFam1L]) : 0,
      familySell500: colSellFam500 > -1 ? safeNum(r[colSellFam500]) : 0,
      familySell1L: colSellFam1L > -1 ? safeNum(r[colSellFam1L]) : 0,
      nutritionKcal: colKcal > -1 ? safeNum(r[colKcal]) : 0,
      nutritionProteinG: colProt > -1 ? safeNum(r[colProt]) : 0,
      nutritionFatG: colFat > -1 ? safeNum(r[colFat]) : 0,
      memLabel: colMemLabel > -1 ? String(r[colMemLabel] || '').trim() : '',
      memTags: colMemTags > -1 ? parseMenuTagsCell_(r[colMemTags]) : []
    };
  });

  CACHE.set('menu', result, 600);
  return result;
}

function saveMenuItem(data) {
  const sheet = getSheet("Menu", MENU_HEADERS_BASE);
  ensureMenuExtraColumns(sheet);
  const id = data.id || 'MENU_' + new Date().getTime();
  const ingredientsJson = JSON.stringify(data.ingredients || []);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const largeExtra = data.largeCupExtra != null && data.largeCupExtra !== '' ? parseFloat(data.largeCupExtra) : 8000;
  const smallDisc = data.smallCupDiscount != null && data.smallCupDiscount !== '' ? parseFloat(data.smallCupDiscount) : 0;
  const plasticX = data.plasticBottleExtra != null && data.plasticBottleExtra !== '' ? parseFloat(data.plasticBottleExtra) : 0;

  var sizeRecipeJson = '';
  if (data.sizeRecipeExtra != null && typeof data.sizeRecipeExtra === 'string') sizeRecipeJson = data.sizeRecipeExtra;
  else if (data.sizeRecipeExtra && typeof data.sizeRecipeExtra === 'object') sizeRecipeJson = JSON.stringify(data.sizeRecipeExtra);
  else if (data.sizeRecipeExtraJson) sizeRecipeJson = String(data.sizeRecipeExtraJson);
  else sizeRecipeJson = '[]';

  const valMap = {
    'ID': id,
    'Tên': data.name,
    'Danh mục': data.category,
    'Giá cơ bản': data.basePrice,
    'Mô tả': data.description || '',
    'Hình ảnh': data.imageUrl || '',
    'Ảnh bìa': data.coverImageUrl || '',
    'Thành phần': ingredientsJson,
    'Còn hàng': data.available !== false,
    'Phổ biến': data.popular === true,
    'Ghi chú': data.note || '',
    'Giá vốn': data.costPrice || 0,
    'Phí VH': data.opEx || 0,
    'Giảm ly nhỏ': smallDisc,
    'Phụ thu ly lớn': isNaN(largeExtra) ? 8000 : largeExtra,
    'Bật cỡ nhỏ': data.enableSmall === true,
    'Bật cỡ thường': data.enableRegular !== false,
    'Bật cỡ lớn': data.enableLarge !== false,
    'Phụ thu chai nhựa': isNaN(plasticX) ? 0 : Math.max(0, plasticX),
    'Định mức size (JSON)': sizeRecipeJson || '[]',
    'Phụ thu gia đình 500ml': data.familyPackExtra500 != null && data.familyPackExtra500 !== '' ? parseFloat(data.familyPackExtra500) : 0,
    'Phụ thu gia đình 1L': data.familyPackExtra1L != null && data.familyPackExtra1L !== '' ? parseFloat(data.familyPackExtra1L) : 0,
    'Giá bán chai 500ml': data.familySell500 != null && data.familySell500 !== '' ? parseFloat(data.familySell500) : 0,
    'Giá bán chai 1 lít': data.familySell1L != null && data.familySell1L !== '' ? parseFloat(data.familySell1L) : 0,
    'Calo ước (kcal)': data.nutritionKcal != null && data.nutritionKcal !== '' ? parseFloat(data.nutritionKcal) : 0,
    'Protein ước (g)': data.nutritionProteinG != null && data.nutritionProteinG !== '' ? parseFloat(data.nutritionProteinG) : 0,
    'Chất béo ước (g)': data.nutritionFatG != null && data.nutritionFatG !== '' ? parseFloat(data.nutritionFatG) : 0,
    'Công dụng': data.benefits != null ? String(data.benefits) : '',
    'Nhãn HV': data.memLabel != null ? String(data.memLabel).trim() : '',
    'Tag HV': Array.isArray(data.memTags) ? data.memTags.join(', ') : (data.memTags != null ? String(data.memTags) : '')
  };

  const row = headers.map(function (h) {
    return valMap[h] !== undefined ? valMap[h] : '';
  });
  sheet.appendRow(row);
  CACHE.clear('menu');
  return id;
}

function updateMenuItem(id, data) {
  const sheet = getSheet("Menu", MENU_HEADERS_BASE);
  ensureMenuExtraColumns(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const allRows = sheet.getDataRange().getValues();
  const ingredientsJson = JSON.stringify(data.ingredients || []);
  const largeExtra = data.largeCupExtra != null && data.largeCupExtra !== '' ? parseFloat(data.largeCupExtra) : 8000;
  const smallDisc = data.smallCupDiscount != null && data.smallCupDiscount !== '' ? parseFloat(data.smallCupDiscount) : 0;
  const plasticX = data.plasticBottleExtra != null && data.plasticBottleExtra !== '' ? parseFloat(data.plasticBottleExtra) : 0;
  var sizeRecipeJson = '';
  if (data.sizeRecipeExtra != null && typeof data.sizeRecipeExtra === 'string') sizeRecipeJson = data.sizeRecipeExtra;
  else if (data.sizeRecipeExtra && typeof data.sizeRecipeExtra === 'object') sizeRecipeJson = JSON.stringify(data.sizeRecipeExtra);
  else if (data.sizeRecipeExtraJson) sizeRecipeJson = String(data.sizeRecipeExtraJson);
  else sizeRecipeJson = '[]';

  const valMap = {
    'ID': id,
    'Tên': data.name,
    'Danh mục': data.category,
    'Giá cơ bản': data.basePrice,
    'Mô tả': data.description || '',
    'Hình ảnh': data.imageUrl || '',
    'Ảnh bìa': data.coverImageUrl || '',
    'Thành phần': ingredientsJson,
    'Còn hàng': data.available !== false,
    'Phổ biến': data.popular === true,
    'Ghi chú': data.note || '',
    'Giá vốn': data.costPrice || 0,
    'Phí VH': data.opEx || 0,
    'Giảm ly nhỏ': smallDisc,
    'Phụ thu ly lớn': isNaN(largeExtra) ? 8000 : largeExtra,
    'Bật cỡ nhỏ': data.enableSmall === true,
    'Bật cỡ thường': data.enableRegular !== false,
    'Bật cỡ lớn': data.enableLarge !== false,
    'Phụ thu chai nhựa': isNaN(plasticX) ? 0 : Math.max(0, plasticX),
    'Định mức size (JSON)': sizeRecipeJson || '[]',
    'Phụ thu gia đình 500ml': data.familyPackExtra500 != null && data.familyPackExtra500 !== '' ? parseFloat(data.familyPackExtra500) : 0,
    'Phụ thu gia đình 1L': data.familyPackExtra1L != null && data.familyPackExtra1L !== '' ? parseFloat(data.familyPackExtra1L) : 0,
    'Giá bán chai 500ml': data.familySell500 != null && data.familySell500 !== '' ? parseFloat(data.familySell500) : 0,
    'Giá bán chai 1 lít': data.familySell1L != null && data.familySell1L !== '' ? parseFloat(data.familySell1L) : 0,
    'Calo ước (kcal)': data.nutritionKcal != null && data.nutritionKcal !== '' ? parseFloat(data.nutritionKcal) : 0,
    'Protein ước (g)': data.nutritionProteinG != null && data.nutritionProteinG !== '' ? parseFloat(data.nutritionProteinG) : 0,
    'Chất béo ước (g)': data.nutritionFatG != null && data.nutritionFatG !== '' ? parseFloat(data.nutritionFatG) : 0,
    'Công dụng': data.benefits != null ? String(data.benefits) : '',
    'Nhãn HV': data.memLabel != null ? String(data.memLabel).trim() : '',
    'Tag HV': Array.isArray(data.memTags) ? data.memTags.join(', ') : (data.memTags != null ? String(data.memTags) : '')
  };

  for (let i = 1; i < allRows.length; i++) {
    if (String(allRows[i][0]) === String(id)) {
      const rowOut = headers.map(function (h, colIdx) {
        if (valMap[h] !== undefined) return valMap[h];
        return allRows[i][colIdx] !== undefined ? allRows[i][colIdx] : '';
      });
      // NOTE: numRows phải là 1 (chỉ cập nhật đúng 1 dòng). Nếu dùng (i+1) sẽ gây mismatch rows.
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([rowOut]);
      CACHE.clear('menu');
      return true;
    }
  }
  return false;
}

function deleteMenuItem(rowIndex) {
  const sheet = getSheet("Menu", MENU_HEADERS_BASE);
  sheet.deleteRow(rowIndex + 2);
  CACHE.clear('menu');
  return "Đã xóa sản phẩm khỏi Menu!";
}

function updateMenuAvailability(id, available) {
  const sheet = getSheet("Menu", MENU_HEADERS_BASE);
  ensureMenuExtraColumns(sheet);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colAvail = headers.indexOf("Còn hàng");
  if (colAvail < 0) return false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, colAvail + 1).setValue(available);
      CACHE.clear('menu');
      return true;
    }
  }
  return false;
}

// ============================================================
// Helper function to process order completion logic (stock, loyalty, cache)
// This function is called when an order is confirmed (either cash or bank transfer)
// It handles loyalty points, stock deduction, and cache invalidation.
// ============================================================
function _processOrderCompletion(orderId, orderData) {
  // Cộng điểm: 1 ly bán có thu tiền = 1 điểm; ly tặng/KM (excludeFromLoyaltyPoints hoặc thành tiền ~0) không cộng.
  let totalCups = 0;
  if (orderData.items && orderData.items.length > 0) {
    orderData.items.forEach(function (i) {
      if (i.excludeFromLoyaltyPoints === true) return;
      var lineTotal = parseFloat(i.totalPrice);
      if (isNaN(lineTotal)) {
        lineTotal = 0;
      }
      if (lineTotal <= 0.5) return;
      totalCups += (parseInt(i.quantity, 10) || 1);
    });
  }

  if (orderData.customerPhone) {
    addLoyaltyPoints(orderData.customerPhone, totalCups, orderData.finalAmount);
    if (orderData.promoCode === 'FREECUP') redeemPoints(orderData.customerPhone, 10);
  }

  // Xuất kho tự động
  let stockLogs = [];
  const inventory = getInventory(); // Ensure this is cached or efficient
  const invMap = {};
  inventory.forEach(i => invMap[i.name] = i);

  if (orderData.items && orderData.items.length > 0) {
    orderData.items.forEach(item => {
      if (item.ingredients && Array.isArray(item.ingredients)) {
        item.ingredients.forEach(ing => {
          if (ing.name && ing.qty) {
            let cost = invMap[ing.name] ? invMap[ing.name].unitPrice : 0;
            stockLogs.push([new Date(), "Phiếu Xuất", ing.name, ing.qty * item.quantity, cost, (ing.qty * item.quantity * cost), "", `Bán - ${orderId}`]);
          }
        });
      }
      var extras = item.extraNuts;
      if ((!extras || !extras.length) && item.options && item.options.addons && Array.isArray(item.options.addons)) {
        extras = item.options.addons;
      }
      if (extras && Array.isArray(extras)) {
        extras.forEach(nutName => {
          let nutData = invMap[nutName];
          if (nutData && nutData.mixQty) {
            let cost = nutData.unitPrice || 0;
            stockLogs.push([new Date(), "Phiếu Xuất", nutName, nutData.mixQty * item.quantity, cost, (nutData.mixQty * item.quantity * cost), "", `Mix thêm - ${orderId}`]);
          }
        });
      }
    });
  }

  if (stockLogs.length > 0) {
    // Bảo đảm dữ liệu là ma trận chữ nhật (tránh lỗi setValues khi có dòng lệch cột)
    try {
      const wantCols = 8;
      stockLogs = stockLogs
        .filter(function (r) { return Array.isArray(r); })
        .map(function (r) {
          const out = r.slice(0, wantCols);
          while (out.length < wantCols) out.push('');
          return out;
        });
    } catch (eNorm) { }
    const stockSheet = getSheet("Log_XuatKho", ["Thời gian", "Loại phiếu", "Tên nguyên liệu", "Số lượng", "Đơn giá", "Thành tiền", "Hạn sử dụng", "Ghi chú"]);
    stockSheet.getRange(stockSheet.getLastRow() + 1, 1, stockLogs.length, stockLogs[0].length).setValues(stockLogs);
  }

  // Invalidate relevant caches
  CACHE.clear(['dashboard', 'cashflow_month', 'cashflow_today', 'cashflow_week', 'stock_month', 'stock_today', 'stock_week']);
}

/** Chuẩn hoá dòng món trước khi JSON.stringify - tránh lỗi tuần hoàn / kiểu lạ từ POS. */
function safeSerializeOrderItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(function (it) {
    var opts = it.options || {};
    var safeOpts = {
      size: opts.size != null ? String(opts.size) : '',
      sizePrice: parseFloat(opts.sizePrice) || 0,
      ice: opts.ice != null ? String(opts.ice) : '',
      sweetness: opts.sweetness != null ? String(opts.sweetness) : '',
      serveTemp: opts.serveTemp != null ? String(opts.serveTemp) : '',
      packaging: opts.packaging != null ? String(opts.packaging) : '',
      packagingPrice: parseFloat(opts.packagingPrice) || 0,
      addons: Array.isArray(opts.addons) ? opts.addons.map(function (a) { return String(a); }) : [],
      addonPrices: Array.isArray(opts.addonPrices) ? opts.addonPrices.map(function (p) { return parseFloat(p) || 0; }) : [],
      familyPack: opts.familyPack === true
    };
    var ings = [];
    if (Array.isArray(it.ingredients)) {
      it.ingredients.forEach(function (ing) {
        if (!ing || !ing.name) return;
        ings.push({ name: String(ing.name), qty: parseFloat(ing.qty) || 0 });
      });
    }
    var qty = parseInt(it.quantity, 10) || 1;
    var totalP = parseFloat(it.totalPrice) || 0;
    return {
      id: String(it.id || ''),
      name: String(it.name || ''),
      quantity: qty,
      price: parseFloat(it.price) || (qty > 0 ? Math.round(totalP / qty) : 0),
      totalPrice: totalP,
      excludeFromLoyaltyPoints: it.excludeFromLoyaltyPoints === true,
      extraNuts: Array.isArray(it.extraNuts) ? it.extraNuts.map(String) : [],
      ingredients: ings,
      options: safeOpts,
      note: String(it.note || ''),
      groupMember: String(it.groupMember || '')
    };
  });
}

// ============================================================
// 3. ĐƠN HÀNG (Orders / Order)
// ============================================================
var ORDERS_HEADERS_STD = ["Mã ĐH", "Thời gian", "Tên KH", "SĐT", "Điểm thành viên", "Các món", "Tổng tiền", "Giảm giá", "Thanh toán", "Phương thức TT", "Ghi chú", "Trạng thái", "Mã KM"];

/**
 * Sheet đơn: có cả "Orders" và "Order" thì dùng bản đang có dữ liệu (≥1 dòng sau header).
 * Trường hợp hay gặp: tab "Orders" mới chỉ có hàng tiêu đề, còn đơn thật nằm ở "Order".
 */
function _getOrdersSheet_(headersDef) {
  var hdr = headersDef || ORDERS_HEADERS_STD;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shOrders = ss.getSheetByName('Orders');
  var shOrder = ss.getSheetByName('Order');
  if (shOrders && shOrder) {
    var ro = shOrders.getLastRow();
    var r1 = shOrder.getLastRow();
    if (ro < 2 && r1 >= 2) return shOrder;
    if (r1 < 2 && ro >= 2) return shOrders;
    if (ro >= 2 && r1 >= 2) return shOrders;
    return shOrders || shOrder;
  }
  if (shOrders) return shOrders;
  if (shOrder) return shOrder;
  return getSheet('Orders', hdr);
}

/** Giá trị ô thời gian đơn - hỗ trợ tên cột lệch chuẩn. */
function _ordersTimeRaw_(row, cmap) {
  var names = ['Thời gian', 'Ngày giờ', 'Time', 'Ngày đặt'];
  for (var i = 0; i < names.length; i++) {
    if (cmap && cmap[names[i]] !== undefined && cmap[names[i]] !== null) {
      var v = row[cmap[names[i]]];
      if (v !== '' && v != null) return v;
    }
  }
  return _ordersCell_(row, cmap, 'Thời gian', 1);
}

function saveOrder(orderData) {
 try {
  const orderId = 'SUN' + new Date().getTime().toString().slice(-8);
  const orderTime = new Date();
  const status = orderData.paymentMethod === 'Chuyển khoản' ? 'Chờ thanh toán' : 'Hoàn thành';

  const itemsSafe = safeSerializeOrderItems(orderData.items);
  var phoneCol = normalizeVnPhoneDigits_(orderData.customerPhone);
  if (!phoneCol || phoneCol.length < 9) {
    phoneCol = String(orderData.customerPhone || '').replace(/\D/g, '');
  }

  const sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  
  sheet.appendRow([
    orderId,
    orderTime,
    orderData.customerName || 'Khách lẻ',
    phoneCol || String(orderData.customerPhone || '').trim(),
    orderData.pointsUsed || 0,
    JSON.stringify(itemsSafe),
    orderData.totalAmount,
    orderData.discount || 0,
    orderData.finalAmount,
    orderData.paymentMethod || 'Tiền mặt',
    orderData.note || '',
    status,
    orderData.promoCode || ''
  ]);

  if (orderData.promoCode) _markFeedbackVoucherUsed_(orderData.promoCode, orderId);

  if (phoneCol && phoneCol.length >= 9) {
    var nmSave = String(orderData.customerName || '').trim() || 'Khách hàng';
    saveCustomer({ phone: phoneCol, name: nmSave });
  }

  if (status === 'Hoàn thành') {
    try {
      _processOrderCompletion(orderId, Object.assign({}, orderData, { items: itemsSafe }));
    } catch (procErr) {
      Logger.log('processOrderCompletion: ' + (procErr.message || procErr));
    }
  }

  try {
    CACHE.clear(['dashboard', 'cashflow_month', 'cashflow_today', 'cashflow_week']);
  } catch (eC) { }

  return { orderId, message: 'Đã lưu đơn hàng!', status: status };
 } catch(e) {
   throw new Error("Lỗi lưu DB: " + e.message);
 }
}

/** Đơn khách đặt qua Pickup (Member) - workflow riêng, ghi chú [PICKUP][ONLINE]. */
function savePickupOnlineOrder(orderData) {
  if (!orderData) throw new Error('Thiếu dữ liệu đơn');
  var resolved = resolveCustomerIdentifier(orderData.customerPhone || orderData.memberCode || '');
  if (!resolved.ok) throw new Error(resolved.message || 'Không xác định được khách');
  var phoneCol = resolved.phone;
  var payMeth = String(orderData.paymentMethod || 'Thanh toán khi nhận').trim();
  var isTransfer = payMeth.indexOf('Chuyển') >= 0;
  var fulfillment = String(orderData.fulfillment || 'pickup').toLowerCase();
  var status = isTransfer ? 'Chờ thanh toán' : 'Chờ xác nhận';
  var orderId = 'SUN' + new Date().getTime().toString().slice(-8);
  var itemsSafe = safeSerializeOrderItems(orderData.items);
  var subtotal = parseFloat(orderData.totalAmount) || 0;
  if (!subtotal && itemsSafe.length) {
    subtotal = itemsSafe.reduce(function (s, it) {
      return s + (parseFloat(it.price) || 0) * (parseInt(it.qty, 10) || parseInt(it.quantity, 10) || 1);
    }, 0);
  }
  var discount = parseFloat(orderData.discount) || 0;
  var promoCode = String(orderData.promoCode || '').trim().toUpperCase();
  if (promoCode) {
    var cartJson = JSON.stringify(itemsSafe.map(function (it) {
      return { id: it.id, quantity: parseInt(it.qty, 10) || parseInt(it.quantity, 10) || 1 };
    }));
    var pv = applyPromoCode(promoCode, subtotal, phoneCol, cartJson);
    if (pv && pv.ok) {
      discount = parseFloat(pv.discount) || 0;
    } else {
      throw new Error((pv && pv.message) ? pv.message : 'Mã khuyến mãi không hợp lệ');
    }
  }
  var finalAmount = Math.max(0, subtotal - discount);
  var noteParts = ['[PICKUP][ONLINE]'];
  if (fulfillment.indexOf('deliver') >= 0 || fulfillment.indexOf('giao') >= 0) {
    noteParts.push('Giao:' + String(orderData.addressDetail || orderData.address || '').trim());
    if (orderData.ward) noteParts.push(orderData.ward);
  } else {
    noteParts.push('Nhận tại quầy');
  }
  if (orderData.deliveryZone) noteParts.push('KV:' + orderData.deliveryZone);
  if (orderData.note) noteParts.push(String(orderData.note).trim());
  var note = noteParts.join(' | ');
  var sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  sheet.appendRow([
    orderId,
    new Date(),
    orderData.customerName || resolved.name || 'Khách online',
    phoneCol,
    orderData.pointsUsed || 0,
    JSON.stringify(itemsSafe),
    subtotal,
    discount,
    finalAmount,
    payMeth,
    note,
    status,
    promoCode || ''
  ]);
  saveCustomer({ phone: phoneCol, name: orderData.customerName || resolved.name || 'Khách hàng' });
  if (promoCode) _markFeedbackVoucherUsed_(promoCode, orderId);
  try {
    _sendOnlineOrderEmails_(orderId, {
      customerName: orderData.customerName || resolved.name,
      customerPhone: phoneCol,
      memberCode: resolved.memberCode,
      items: itemsSafe,
      totalAmount: subtotal,
      discount: discount,
      finalAmount: finalAmount,
      promoCode: promoCode,
      paymentMethod: payMeth,
      status: status,
      fulfillment: fulfillment,
      address: orderData.addressDetail || '',
      note: note
    });
  } catch (eM) {
    Logger.log('pickup order email: ' + (eM.message || eM));
  }
  CACHE.clear(['dashboard', 'cashflow_month', 'cashflow_today', 'cashflow_week']);
  return { ok: true, orderId: orderId, status: status, memberCode: resolved.memberCode, discount: discount, finalAmount: finalAmount };
}

/** Pickup/Member: áp mã KM (cùng logic POS). */
function applyPickupPromo(code, phone, items) {
  var itemsArr = items && items.length ? items : [];
  var sub = itemsArr.reduce(function (s, it) {
    return s + (parseFloat(it.price) || 0) * (parseInt(it.qty, 10) || parseInt(it.quantity, 10) || 1);
  }, 0);
  var cartJson = JSON.stringify(itemsArr.map(function (it) {
    return { id: it.id, quantity: parseInt(it.qty, 10) || parseInt(it.quantity, 10) || 1 };
  }));
  return applyPromoCode(code, sub, phone, cartJson);
}

// ============================================================
// 3B. ĐƠN NHÓM (Group Order - kiểu GrabFood)
// Sheet GroupOrders: mỗi nhóm 1 dòng, giỏ các thành viên lưu JSON.
// Trạng thái: open → locked → ordered | cancelled
// ============================================================
var GROUP_ORDERS_HEADERS = ["Mã nhóm", "SĐT chủ nhóm", "Tên chủ nhóm", "Trạng thái", "Tạo lúc", "Cập nhật", "Dữ liệu", "Mã ĐH"];
var GROUP_MAX_MEMBERS = 10;
var GROUP_TTL_HOURS = 24;
var GROUP_DISCOUNT_PCT = 10; // Fallback khi CHƯA khai báo rule group_order trong Khuyến mãi

/** Tìm CTKM đang hiệu lực theo quy tắc (group_order / feedback_reward). */
function _activeRulePromo_(ruleType) {
  var promos = [];
  try { promos = getPromotions() || []; } catch (e) { return { found: false, promo: null }; }
  var now = new Date();
  var found = false;
  var active = null;
  promos.forEach(function (p) {
    if (String(p.ruleType || '').trim().toLowerCase() !== ruleType) return;
    found = true;
    if (active) return;
    if (!p.active) return;
    if (p.startDate && new Date(p.startDate) > now) return;
    if (p.endDate && new Date(p.endDate) < now) return;
    active = p;
  });
  return { found: found, promo: active };
}
function _rulePromoPct_(p) {
  if (!p) return 0;
  var pct = parseFloat((p.ruleConfig && p.ruleConfig.percent != null) ? p.ruleConfig.percent : p.value) || 0;
  return Math.max(0, Math.min(50, pct));
}
/**
 * % giảm đơn nhóm: admin khai báo trong Khuyến mãi (rule group_order, giá trị 5/10/15...).
 * Chưa khai báo rule nào -> dùng mặc định GROUP_DISCOUNT_PCT; đã khai báo nhưng tắt/hết hạn -> 0%.
 */
function _groupDiscountPct_() {
  var r = _activeRulePromo_('group_order');
  if (!r.found) return GROUP_DISCOUNT_PCT;
  return _rulePromoPct_(r.promo);
}
/** % voucher tặng khi khách góp ý (rule feedback_reward). Chưa khai báo / tắt -> 0 (ẩn hoàn toàn trên UI). */
function _feedbackRewardPct_() {
  var r = _activeRulePromo_('feedback_reward');
  return _rulePromoPct_(r.promo);
}

function _groupOrdersSheet_() {
  return getSheet('GroupOrders', GROUP_ORDERS_HEADERS);
}
function _groupNormCode_(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
function _groupNormPhone_(p) {
  var d = String(p || '').replace(/\D/g, '');
  if (d.indexOf('84') === 0 && d.length >= 10) d = '0' + d.slice(2);
  // Google Sheets hay ép SĐT thành số và cắt mất số 0 đầu (0838… → 838…) → khôi phục lại
  if (d.length === 9 && d.charAt(0) !== '0') d = '0' + d;
  return d;
}
/** Định danh thành viên: SĐT (host/hội viên) hoặc guest id dạng g_xxx (khách chỉ nhập tên). */
function _groupNormMemberId_(id) {
  var s = String(id || '').trim();
  if (/^\d{9,11}$/.test(s.replace(/\D/g, '')) && s.indexOf('g_') !== 0) return _groupNormPhone_(s);
  return s.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 48);
}
function _groupCacheKey_(code) { return 'grp_' + code; }

/** Tìm dòng nhóm theo mã. Trả về {row, values} hoặc null. */
function _groupFindRow_(sheet, code) {
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var codes = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = codes.length - 1; i >= 0; i--) {
    if (_groupNormCode_(codes[i][0]) === code) {
      var row = i + 2;
      return { row: row, values: sheet.getRange(row, 1, 1, GROUP_ORDERS_HEADERS.length).getValues()[0] };
    }
  }
  return null;
}

function _groupSanitizeItems_(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 40).map(function (it) {
    var o = (it && it.options) || {};
    return {
      id: String((it && it.id) || ''),
      name: String((it && it.name) || '').slice(0, 90),
      quantity: Math.max(1, Math.min(99, parseInt(it && it.quantity, 10) || 1)),
      price: Math.max(0, parseFloat(it && it.price) || 0),
      basePrice: Math.max(0, parseFloat(it && it.basePrice) || 0),
      note: String((it && it.note) || '').slice(0, 160),
      options: {
        size: String(o.size || ''),
        sizePrice: parseFloat(o.sizePrice) || 0,
        ice: String(o.ice || ''),
        sweetness: String(o.sweetness || ''),
        serveTemp: String(o.serveTemp || ''),
        packaging: String(o.packaging || ''),
        packagingPrice: parseFloat(o.packagingPrice) || 0,
        addons: Array.isArray(o.addons) ? o.addons.slice(0, 12).map(String) : [],
        addonPrices: Array.isArray(o.addonPrices) ? o.addonPrices.slice(0, 12).map(function (p) { return parseFloat(p) || 0; }) : [],
        familyPack: o.familyPack === true
      }
    };
  });
}

function _groupMemberSubtotal_(items) {
  return (items || []).reduce(function (s, it) {
    return s + (parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 1);
  }, 0);
}

/** Dựng object trạng thái nhóm trả cho client. */
function _groupStateFromRow_(vals) {
  var data = { members: [] };
  try { data = JSON.parse(String(vals[6] || '{}')) || { members: [] }; } catch (e) { }
  var members = (data.members || []).map(function (m) {
    var items = Array.isArray(m.items) ? m.items : [];
    return {
      id: String(m.id || m.phone || ''),
      phone: String(m.phone || ''),
      name: String(m.name || ''),
      items: items,
      subtotal: _groupMemberSubtotal_(items),
      updatedAt: String(m.updatedAt || '')
    };
  });
  var total = members.reduce(function (s, m) { return s + m.subtotal; }, 0);
  var createdMs = 0;
  try { createdMs = new Date(vals[4]).getTime() || 0; } catch (eC) { }
  var status = String(vals[3] || 'open');
  if ((status === 'open' || status === 'locked') && createdMs > 0 &&
    (Date.now() - createdMs) > GROUP_TTL_HOURS * 3600 * 1000) {
    status = 'expired';
  }
  return {
    ok: true,
    groupId: _groupNormCode_(vals[0]),
    hostPhone: _groupNormPhone_(vals[1]),
    hostName: String(vals[2] || ''),
    groupName: String(data.groupName || '') || ('Đơn nhóm của ' + String(vals[2] || 'bạn')),
    status: status,
    createdAt: String(vals[4] || ''),
    updatedAt: String(vals[5] || ''),
    orderId: String(vals[7] || ''),
    members: members,
    total: total,
    discountPct: _groupDiscountPct_()
  };
}

/** Chuẩn hoá lại object data để ghi xuống sheet (giữ id + groupName). */
function _groupDataFromState_(state) {
  return {
    groupName: String(state.groupName || ''),
    members: (state.members || []).map(function (m) {
      return { id: m.id, phone: m.phone, name: m.name, items: m.items, updatedAt: m.updatedAt };
    })
  };
}

function _groupSave_(sheet, row, status, data, orderId) {
  var now = new Date();
  var json = JSON.stringify(data || { members: [] });
  if (json.length > 45000) throw new Error('Giỏ nhóm quá lớn - bớt món giúp mình nhé');
  sheet.getRange(row, 4, 1, 4).setValues([[status, sheet.getRange(row, 5).getValue() || now, now, json]]);
  if (orderId != null) sheet.getRange(row, 8).setValue(String(orderId));
  var vals = sheet.getRange(row, 1, 1, GROUP_ORDERS_HEADERS.length).getValues()[0];
  var state = _groupStateFromRow_(vals);
  CACHE.set(_groupCacheKey_(state.groupId), state, 600);
  return state;
}

function _groupWithLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Tạo nhóm mới. Trả về trạng thái nhóm. */
function createGroupOrder(hostPhone, hostName, groupName) {
  var phone = _groupNormPhone_(hostPhone);
  if (!/^0\d{9}$/.test(phone)) throw new Error('SĐT trưởng nhóm không hợp lệ');
  var name = String(hostName || '').slice(0, 40) || 'Trưởng nhóm';
  var gname = String(groupName || '').trim().slice(0, 60) || ('Đơn nhóm của ' + name);
  return _groupWithLock_(function () {
    var sheet = _groupOrdersSheet_();
    var alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var attempt = 0; attempt < 8; attempt++) {
      code = '';
      for (var i = 0; i < 6; i++) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      if (!_groupFindRow_(sheet, code)) break;
    }
    var now = new Date();
    var data = { groupName: gname, members: [{ id: phone, phone: phone, name: name, items: [], updatedAt: now.toISOString() }] };
    sheet.appendRow([code, phone, name, 'open', now, now, JSON.stringify(data), '']);
    // Ép cột SĐT thành text để Sheets không cắt mất số 0 đầu
    var newRow = sheet.getLastRow();
    sheet.getRange(newRow, 2).setNumberFormat('@').setValue(phone);
    var state = _groupStateFromRow_(sheet.getRange(newRow, 1, 1, GROUP_ORDERS_HEADERS.length).getValues()[0]);
    CACHE.set(_groupCacheKey_(code), state, 600);
    return state;
  });
}

/** Lấy trạng thái nhóm (dùng cho polling - ưu tiên cache). */
function getGroupOrder(groupId) {
  var code = _groupNormCode_(groupId);
  if (!code) return { ok: false, message: 'Thiếu mã nhóm' };
  var cached = CACHE.get(_groupCacheKey_(code));
  if (cached) return cached;
  var found = _groupFindRow_(_groupOrdersSheet_(), code);
  if (!found) return { ok: false, message: 'Không tìm thấy nhóm ' + code };
  var state = _groupStateFromRow_(found.values);
  CACHE.set(_groupCacheKey_(code), state, 600);
  return state;
}

/** Tham gia nhóm bằng mã - hội viên (SĐT) hoặc khách chỉ nhập tên (guest id). */
function joinGroupOrder(groupId, memberId, name, guestPhone) {
  var code = _groupNormCode_(groupId);
  var mid = _groupNormMemberId_(memberId);
  if (!code) throw new Error('Thiếu mã nhóm');
  if (!mid) throw new Error('Thiếu định danh thành viên');
  var isGuest = !/^0\d{9}$/.test(mid);
  var cleanName = String(name || '').trim().slice(0, 40);
  if (isGuest && !cleanName) throw new Error('Nhập tên của bạn để vào nhóm nhé');
  return _groupWithLock_(function () {
    var sheet = _groupOrdersSheet_();
    var found = _groupFindRow_(sheet, code);
    if (!found) throw new Error('Không tìm thấy nhóm ' + code);
    var state = _groupStateFromRow_(found.values);
    if (state.status === 'ordered') throw new Error('Nhóm này đã đặt đơn xong');
    if (state.status === 'cancelled') throw new Error('Nhóm này đã bị hủy');
    if (state.status === 'expired') throw new Error('Nhóm này đã hết hạn (quá ' + GROUP_TTL_HOURS + ' giờ)');
    if (state.status === 'locked' && mid !== state.hostPhone) throw new Error('Trưởng nhóm đã khóa nhóm - không vào thêm được');
    var data = _groupDataFromState_(state);
    var me = null;
    for (var i = 0; i < data.members.length; i++) { if (data.members[i].id === mid) { me = data.members[i]; break; } }
    if (!me) {
      if (data.members.length >= GROUP_MAX_MEMBERS) throw new Error('Nhóm đã đủ ' + GROUP_MAX_MEMBERS + ' người');
      data.members.push({
        id: mid,
        phone: isGuest ? _groupNormPhone_(guestPhone) : mid,
        name: cleanName || ('KH ' + mid.slice(-4)),
        items: [],
        updatedAt: new Date().toISOString()
      });
    } else if (cleanName) {
      me.name = cleanName;
    }
    return _groupSave_(sheet, found.row, state.status, data, null);
  });
}

/** Đồng bộ giỏ của 1 thành viên lên nhóm (ghi đè items của người đó). */
function syncGroupCart(groupId, memberId, name, items) {
  var code = _groupNormCode_(groupId);
  var mid = _groupNormMemberId_(memberId);
  if (!code) throw new Error('Thiếu mã nhóm');
  return _groupWithLock_(function () {
    var sheet = _groupOrdersSheet_();
    var found = _groupFindRow_(sheet, code);
    if (!found) throw new Error('Không tìm thấy nhóm ' + code);
    var state = _groupStateFromRow_(found.values);
    if (state.status === 'ordered' || state.status === 'cancelled' || state.status === 'expired') {
      return state; // trả trạng thái để client tự thoát nhóm
    }
    if (state.status === 'locked' && mid !== state.hostPhone) {
      throw new Error('Nhóm đã khóa - không sửa được giỏ. Nhờ trưởng nhóm mở khóa.');
    }
    var data = _groupDataFromState_(state);
    var me = null;
    for (var i = 0; i < data.members.length; i++) { if (data.members[i].id === mid) { me = data.members[i]; break; } }
    if (!me) throw new Error('Bạn chưa ở trong nhóm này - vào nhóm trước nhé');
    me.items = _groupSanitizeItems_(items);
    if (name) me.name = String(name).slice(0, 40);
    me.updatedAt = new Date().toISOString();
    return _groupSave_(sheet, found.row, state.status, data, null);
  });
}

/** Rời nhóm (thành viên) hoặc hủy nhóm (trưởng nhóm). */
function leaveGroupOrder(groupId, memberId) {
  var code = _groupNormCode_(groupId);
  var mid = _groupNormMemberId_(memberId);
  return _groupWithLock_(function () {
    var sheet = _groupOrdersSheet_();
    var found = _groupFindRow_(sheet, code);
    if (!found) return { ok: true, groupId: code, status: 'cancelled', members: [], total: 0 };
    var state = _groupStateFromRow_(found.values);
    var data = _groupDataFromState_(state);
    if (mid === state.hostPhone) {
      if (state.status === 'open' || state.status === 'locked') {
        return _groupSave_(sheet, found.row, 'cancelled', data, null);
      }
      return state;
    }
    data.members = data.members.filter(function (m) { return m.id !== mid; });
    return _groupSave_(sheet, found.row, state.status, data, null);
  });
}

/** Trưởng nhóm khóa / mở khóa nhóm. */
function setGroupOrderLock(groupId, memberId, locked) {
  var code = _groupNormCode_(groupId);
  var mid = _groupNormMemberId_(memberId);
  return _groupWithLock_(function () {
    var sheet = _groupOrdersSheet_();
    var found = _groupFindRow_(sheet, code);
    if (!found) throw new Error('Không tìm thấy nhóm ' + code);
    var state = _groupStateFromRow_(found.values);
    if (mid !== state.hostPhone) throw new Error('Chỉ trưởng nhóm mới khóa/mở nhóm được');
    if (state.status !== 'open' && state.status !== 'locked') return state;
    var data = _groupDataFromState_(state);
    return _groupSave_(sheet, found.row, locked ? 'locked' : 'open', data, null);
  });
}

/** Trưởng nhóm chốt đơn: gộp món tất cả thành viên thành 1 đơn online. */
function finalizeGroupOrder(groupId, hostPhone, checkout) {
  var code = _groupNormCode_(groupId);
  var ph = _groupNormPhone_(hostPhone);
  var co = checkout || {};
  return _groupWithLock_(function () {
    var sheet = _groupOrdersSheet_();
    var found = _groupFindRow_(sheet, code);
    if (!found) throw new Error('Không tìm thấy nhóm ' + code);
    var state = _groupStateFromRow_(found.values);
    if (ph !== state.hostPhone) throw new Error('Chỉ trưởng nhóm mới đặt đơn được');
    if (state.status === 'ordered') throw new Error('Nhóm đã đặt đơn rồi (mã ' + state.orderId + ')');
    if (state.status === 'cancelled') throw new Error('Nhóm đã bị hủy');
    if (state.status === 'expired') throw new Error('Nhóm đã hết hạn - tạo nhóm mới nhé');
    var mergedItems = [];
    state.members.forEach(function (m) {
      var mName = m.name || ('KH ' + String(m.id || '').slice(-4));
      (m.items || []).forEach(function (it) {
        var unit = parseFloat(it.price) || 0;
        var qty = parseInt(it.quantity, 10) || 1;
        mergedItems.push({
          id: it.id, name: it.name, quantity: qty, qty: qty,
          price: unit, totalPrice: unit * qty, options: it.options,
          groupMember: mName,
          note: ('[' + mName + '] ' + String(it.note || '')).trim()
        });
      });
    });
    if (!mergedItems.length) throw new Error('Giỏ nhóm đang trống');
    var subtotal = mergedItems.reduce(function (s, it) { return s + it.totalPrice; }, 0);
    // Ưu đãi đơn nhóm: % theo cấu hình Khuyến mãi (không cộng dồn mã KM - lấy mức giảm cao hơn)
    var groupPct = _groupDiscountPct_();
    var groupDisc = groupPct > 0 ? Math.round(subtotal * groupPct / 100) : 0;
    var promoDisc = parseFloat(co.discount) || 0;
    var discount = Math.max(groupDisc, promoDisc);
    var usedGroupDisc = groupDisc > 0 && groupDisc >= promoDisc;
    // Không truyền mã ảo - ưu đãi nhóm đi bằng discount + ghi chú (promoCode thật sẽ được server tự kiểm lại)
    var promoCode = usedGroupDisc ? '' : (co.promoCode || '');
    var membersWithItems = state.members.filter(function (m) { return (m.items || []).length; });
    var noteExtra = '[GROUP:' + code + '] «' + state.groupName + '» - ' + membersWithItems.length + ' người: ' +
      membersWithItems.map(function (m) { return m.name || String(m.id || '').slice(-4); }).join(', ') +
      (usedGroupDisc ? (' | Ưu đãi đơn nhóm −' + groupPct + '%') : '');
    var res = savePickupOnlineOrder({
      customerPhone: ph,
      customerName: co.customerName || state.hostName,
      items: mergedItems,
      totalAmount: subtotal,
      discount: discount,
      paymentMethod: co.paymentMethod || 'Thanh toán khi nhận',
      fulfillment: co.fulfillment || 'pickup',
      addressDetail: co.addressDetail || '',
      deliveryZone: co.deliveryZone || '',
      promoCode: promoCode,
      note: (co.note ? String(co.note) + ' | ' : '') + noteExtra
    });
    var data = _groupDataFromState_(state);
    var newState = _groupSave_(sheet, found.row, 'ordered', data, res.orderId);
    res.group = newState;
    return res;
  });
}

function _sendOnlineOrderEmails_(orderId, o) {
  var to = ONLINE_ORDER_NOTIFY_EMAILS;
  var itemsHtml = (o.items || []).map(function (it) {
    return '<tr><td style="padding:8px;border-bottom:1px solid #eee;">' + String(it.name || it.productName || '') +
      '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">' + (it.qty || 1) +
      '</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">' + _fmtVnd_(it.price || it.unitPrice || 0) + '</td></tr>';
  }).join('');
  var html = '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#faf7f2;padding:20px;">' +
    '<div style="background:linear-gradient(135deg,#7c2d12,#ea580c);color:#fff;padding:18px 20px;border-radius:14px 14px 0 0;">' +
    '<div style="font-size:20px;font-weight:900;">Đơn online mới</div><div style="font-size:13px;opacity:.9;margin-top:4px;">Mã ' + orderId + ' · ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm') + '</div></div>' +
      '<div style="background:#fff;padding:18px 20px;border-radius:0 0 14px 14px;border:1px solid #e8dfd4;">' +
    '<p><b>Khách:</b> ' + (o.customerName || '') + '<br><b>SĐT:</b> ' + (o.customerPhone || '') + '<br><b>Mã HV:</b> ' + (o.memberCode || '') + '</p>' +
    '<p><b>Thanh toán:</b> ' + (o.paymentMethod || '') + ' · <b>TT:</b> ' + (o.status || '') + '</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;"><thead><tr style="background:#f5efe6;"><th style="padding:8px;text-align:left;">Món</th><th style="padding:8px;">SL</th><th style="padding:8px;text-align:right;">Giá</th></tr></thead><tbody>' + itemsHtml + '</tbody></table>' +
    '<p style="font-size:16px;font-weight:900;color:#7c2d12;">Tổng: ' + _fmtVnd_(o.finalAmount || 0) + '</p>' +
    '<p style="font-size:12px;color:#78716c;">' + (o.note || '') + '</p></div></div>';
  MailApp.sendEmail({
    to: to,
    subject: 'SUN Nut Milk - Đơn online ' + orderId,
    htmlBody: html
  });
}

function getOnlineOrdersForAdmin(maxRows) {
  var lim = Math.min(80, parseInt(maxRows, 10) || 40);
  var sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  if (sheet.getLastRow() < 2) return { ok: true, orders: [] };
  var cmap = _ordersColumnMap_(sheet);
  var rows = sheet.getDataRange().getValues().slice(1);
  var out = [];
  for (var i = rows.length - 1; i >= 0 && out.length < lim; i--) {
    var note = String(_ordersCell_(rows[i], cmap, 'Ghi chú', 10) || '');
    if (note.indexOf('[PICKUP') < 0 && note.indexOf('[ONLINE') < 0) continue;
    var o = mapOrderRow(rows[i], cmap);
    o.sheetRow = i + 2;
    out.push(o);
  }
  return { ok: true, orders: out };
}

/** Trạng thái đơn theo mã - public, phục vụ màn hình chờ nhận nước (đơn nhóm). */
function getOnlineOrderStatusPublic(orderId) {
  var oid = String(orderId || '').trim();
  if (!oid) return { ok: false, message: 'Thiếu mã đơn' };
  var sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  if (sheet.getLastRow() < 2) return { ok: false, message: 'Không tìm thấy đơn ' + oid };
  var cmap = _ordersColumnMap_(sheet);
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(_ordersCell_(data[i], cmap, 'Mã ĐH', 0) || '').trim() === oid) {
      return {
        ok: true, orderId: oid,
        status: String(_ordersCell_(data[i], cmap, 'Trạng thái', 11) || ''),
        fbPercent: _feedbackRewardPct_()
      };
    }
  }
  return { ok: false, message: 'Không tìm thấy đơn ' + oid };
}

// ============================================================
// 3C. GÓP Ý + VOUCHER GÓP Ý (rule feedback_reward trong Khuyến mãi)
// ============================================================
var FEEDBACK_VOUCHER_HEADERS = ['Mã voucher', 'SĐT', 'Giảm (%)', 'Phát hành', 'Hết hạn', 'Trạng thái', 'Từ đơn', 'Dùng cho đơn'];
var FEEDBACK_VOUCHER_DAYS = 7;

function _feedbackVoucherSheet_() {
  return getSheet('Voucher góp ý', FEEDBACK_VOUCHER_HEADERS);
}

/** Phát hành voucher góp ý cho SĐT (hạn 7 ngày kể từ ngày phát hành). */
function _issueFeedbackVoucher_(phone, pct, fromOrderId) {
  var sheet = _feedbackVoucherSheet_();
  var code = 'GY' + (Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5)).toUpperCase();
  var now = new Date();
  var expires = new Date(now.getTime() + FEEDBACK_VOUCHER_DAYS * 24 * 3600 * 1000);
  var row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, 2).setNumberFormat('@'); // giữ nguyên mã + số 0 đầu SĐT
  sheet.getRange(row, 1, 1, FEEDBACK_VOUCHER_HEADERS.length).setValues([[
    code, phone, pct, now, expires, 'Chưa dùng', String(fromOrderId || ''), ''
  ]]);
  return {
    code: code, percent: pct,
    expires: Utilities.formatDate(expires, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy')
  };
}

/** Kiểm tra mã voucher góp ý: còn hạn + chưa dùng. Trả về null nếu không phải voucher góp ý. */
function _validateFeedbackVoucher_(code, orderAmount) {
  var c = String(code || '').trim().toUpperCase();
  if (!/^GY[A-Z0-9]{4,10}$/.test(c)) return null;
  var sheet = _feedbackVoucherSheet_();
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0] || '').trim().toUpperCase() !== c) continue;
    var status = String(rows[i][5] || '').trim();
    if (status !== 'Chưa dùng') return { valid: false, message: 'Voucher góp ý này đã được sử dụng rồi!' };
    var exp = new Date(rows[i][4]);
    if (!isNaN(exp.getTime()) && exp < new Date()) return { valid: false, message: 'Voucher góp ý đã hết hạn (hiệu lực ' + FEEDBACK_VOUCHER_DAYS + ' ngày từ ngày phát hành)!' };
    var pct = Math.max(0, Math.min(50, parseFloat(rows[i][2]) || 0));
    if (!pct) return { valid: false, message: 'Voucher không có mức giảm hợp lệ!' };
    var disc = Math.round((parseFloat(orderAmount) || 0) * pct / 100);
    return { valid: true, discount: disc, message: 'Voucher góp ý - Giảm ' + pct + '% (' + disc.toLocaleString('vi-VN') + 'đ)' };
  }
  return { valid: false, message: 'Không tìm thấy voucher ' + c + '!' };
}

/** Đánh dấu voucher góp ý đã dùng (gọi sau khi lưu đơn thành công). */
function _markFeedbackVoucherUsed_(code, orderId) {
  var c = String(code || '').trim().toUpperCase();
  if (!/^GY[A-Z0-9]{4,10}$/.test(c)) return;
  try {
    var sheet = _feedbackVoucherSheet_();
    if (sheet.getLastRow() < 2) return;
    var rows = sheet.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0] || '').trim().toUpperCase() === c) {
        sheet.getRange(i + 1, 6, 1, 3).setValues([['Đã dùng', rows[i][6], String(orderId || '')]]);
        return;
      }
    }
  } catch (e) { Logger.log('markFeedbackVoucherUsed: ' + (e.message || e)); }
}

/** Góp ý sau khi nhận nước. Nếu bật rule feedback_reward trong Khuyến mãi thì tặng voucher giảm % (hạn 7 ngày). */
function submitDrinkFeedback(payload) {
  var p = payload || {};
  var msg = String(p.message || '').trim().slice(0, 1000);
  var ph = _groupNormPhone_(p.phone);
  if (!msg && !ph) throw new Error('Nhập góp ý giúp SUN nhé');
  var pct = _feedbackRewardPct_();
  var voucher = null;
  if (ph && pct > 0) {
    voucher = _issueFeedbackVoucher_(ph, pct, p.orderId);
  }
  var sheet = getSheet('Góp ý', ['Thời gian', 'Mã đơn', 'Nhóm', 'Tên', 'SĐT', 'Góp ý', 'Ưu đãi']);
  var row = sheet.getLastRow() + 1;
  sheet.getRange(row, 5).setNumberFormat('@'); // giữ số 0 đầu SĐT
  sheet.getRange(row, 1, 1, 7).setValues([[
    new Date(), String(p.orderId || ''), String(p.groupName || p.groupId || ''),
    String(p.name || '').slice(0, 80), ph, msg,
    voucher ? ('Voucher ' + voucher.code + ' -' + pct + '% (HSD ' + voucher.expires + ')') : ''
  ]]);
  return {
    ok: true,
    reward: voucher ? pct : 0,
    voucherCode: voucher ? voucher.code : '',
    voucherExpires: voucher ? voucher.expires : ''
  };
}

function updateOnlineOrderStatus(orderId, newStatus) {
  var oid = String(orderId || '').trim();
  var st = String(newStatus || '').trim();
  if (!oid || !st) throw new Error('Thiếu mã đơn hoặc trạng thái');
  var sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  var cmap = _ordersColumnMap_(sheet);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][cmap['Mã ĐH']] || data[i][0] || '').trim() === oid) {
      sheet.getRange(i + 1, (cmap['Trạng thái'] != null ? cmap['Trạng thái'] : 11) + 1).setValue(st);
      if (_ordersCompletedStatus_(st)) {
        try {
          var items = JSON.parse(String(data[i][cmap['Các món'] != null ? cmap['Các món'] : 5] || '[]'));
          _processOrderCompletion(oid, {
            customerPhone: String(data[i][cmap['SĐT'] != null ? cmap['SĐT'] : 3] || ''),
            customerName: String(data[i][cmap['Tên KH'] != null ? cmap['Tên KH'] : 2] || ''),
            items: items,
            finalAmount: parseFloat(data[i][cmap['Thanh toán'] != null ? cmap['Thanh toán'] : 8]) || 0,
            paymentMethod: String(data[i][cmap['Phương thức TT'] != null ? cmap['Phương thức TT'] : 9] || '')
          });
        } catch (eP) { Logger.log('updateOnlineOrderStatus complete: ' + eP); }
      }
      CACHE.clear(['dashboard', 'cashflow_month']);
      return { ok: true, orderId: oid, status: st };
    }
  }
  throw new Error('Không tìm thấy đơn ' + oid);
}

function getMemberDeliveriesTodayEnriched() {
  var base = getMembershipDeliveriesToday();
  var list = base.deliveries || [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    var code = '';
    try { code = ensureMemberCodeForPhone_(d.phone); } catch (eC) { code = ''; }
    out.push({
      subId: d.subId,
      phone: d.phone,
      customerName: d.customerName,
      memberCode: code,
      packageName: d.packageName,
      milkProduct: d.milkProduct,
      address: d.address,
      mapLink: d.mapLink,
      tier: d.tier,
      sessionsDelivered: d.sessionsDelivered,
      fulfillment: (String(d.address || '').indexOf('cửa hàng') >= 0) ? 'Nhận tại quầy' : 'Giao hàng',
      timeSlot: '7:00 – 8:30',
      drinkToday: d.milkProduct || 'Theo lịch gói',
      smsBody: buildMemberDeliverySms_(d, code)
    });
  }
  return { ok: true, dateLabel: base.dateLabel, deliveries: out, estimatedMeals: out.length };
}

function buildMemberDeliverySms_(d, memberCode) {
  var name = String(d.customerName || 'bạn').trim();
  return 'SUN Nut Milk xin chao ' + name + '. Hom nay (' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'dd/MM') +
    ') ban nhan: ' + (d.milkProduct || 'sua hat') + '. Khung gio: 7:00-8:30. ' +
    (String(d.address || '').length > 5 ? ('Dia chi: ' + d.address + '. ') : 'Nhan tai quay. ') +
    'Ma HV: ' + (memberCode || '') + '. Cam on ban!';
}

// Pickup / Display / Kiosk đã được gỡ bỏ theo yêu cầu.

/**
 * Checks the "Bank transfer" sheet for a matching payment and confirms the order.
 * @param {string} orderId The ID of the order to check.
 * @param {number} expectedAmount The expected final amount of the order.
 * @returns {{status:'paid'|'pending'|'partial'|'error', amountPaid?:number, expectedAmount?:number, message?:string}}
 */
/** Chuẩn hóa mã đơn khi so khớp sheet Ngân hàng / Orders (#SUN… / khoảng trắng). */
function _normalizeOrderIdForMatch(orderId) {
  return String(orderId || '').trim().replace(/^#/, '').toUpperCase().replace(/\s+/g, '');
}

/** Nội dung CK có chứa mã đơn: SUN… / SUB… (gói hội viên), sau dấu -, hoặc dãy số.
 *  Ví dụ ngân hàng gộp: O5CH7J99JGRV-SUN20488394 → nhận SUN20488394. */
function _bankMemoMatchesOrder(memoNorm, oidNorm) {
  if (!memoNorm || !oidNorm) return false;
  if (memoNorm.indexOf(oidNorm) >= 0) return true;
  var segs = memoNorm.split(/[-_\s,;|/\\]+/);
  for (var si = 0; si < segs.length; si++) {
    var seg = String(segs[si] || '').toUpperCase().replace(/\s+/g, '');
    if (seg && seg === oidNorm) return true;
  }
  var reOrderId = /(?:SUN|SUB)\d{6,}/gi;
  var m;
  while ((m = reOrderId.exec(memoNorm)) !== null) {
    if (String(m[0] || '').toUpperCase() === oidNorm) return true;
  }
  var onlyDigitsMemo = memoNorm.replace(/\D/g, '');
  var onlyDigitsOid = oidNorm.replace(/\D/g, '');
  if (onlyDigitsOid.length >= 6 && onlyDigitsMemo.indexOf(onlyDigitsOid) >= 0) return true;
  var tail8 = oidNorm.slice(-8);
  if (tail8.length === 8 && /^\d+$/.test(tail8) && memoNorm.indexOf(tail8) >= 0) return true;
  return false;
}

function _orderStatusIsAwaitingBank_(st) {
  var s = String(st || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return false;
  if (s.indexOf('hủy') >= 0 || s.indexOf('huy') === 0) return false;
  if (s.indexOf('hoàn thành') >= 0 || s.indexOf('hoan thanh') >= 0) return false;
  return s.indexOf('chờ thanh toán') >= 0 || s === 'chờ tt' || s.indexOf('chờ tt') === 0 || s.indexOf('cho thanh toan') >= 0
    || s.indexOf('chưa tt') >= 0 || s.indexOf('chua tt') >= 0 || s.indexOf('chưa thanh toán') >= 0 || s.indexOf('pending') >= 0;
}

/** Map tên cột sheet Orders → chỉ số (hàng 1 là tiêu đề). */
function _ordersColumnMap_(sheet) {
  var n = sheet.getLastColumn();
  if (n < 1) return null;
  var headers = sheet.getRange(1, 1, 1, n).getValues()[0];
  var map = {};
  for (var c = 0; c < headers.length; c++) {
    var k = String(headers[c] || '').trim();
    if (k) map[k] = c;
  }
  return map;
}

function _ordersCell_(row, map, colName, fallbackIndex) {
  if (map && map[colName] !== undefined && map[colName] !== null) return row[map[colName]];
  if (fallbackIndex !== undefined && row[fallbackIndex] !== undefined) return row[fallbackIndex];
  return '';
}

/** Tìm chỉ số cột tiêu đề sheet Đơn (tên cột có thể lệch chuẩn). */
function _ordersHeaderPick_(headers, candidates, fallbackIdx) {
  if (!headers || headers.length === 0) return fallbackIdx;
  for (var i = 0; i < candidates.length; i++) {
    var ix = headers.indexOf(candidates[i]);
    if (ix >= 0) return ix;
  }
  var candL = candidates.map(function (c) { return String(c || '').trim().toLowerCase(); });
  for (var j = 0; j < headers.length; j++) {
    var h = String(headers[j] || '').trim().toLowerCase();
    for (var k = 0; k < candL.length; k++) {
      if (h === candL[k]) return j;
    }
  }
  return fallbackIdx;
}

/**
 * Parse ngày giờ đơn / sheet.
 * Chuỗi kiểu "03/05/2026 1:17:42" (VN: DD/MM/YYYY) - KHÔNG dùng new Date(chuỗi) trước vì JS hay hiểu MM/DD → lọc "Hôm nay" sai, getOrders ra [].
 */
function _parseOrderDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number' && !isNaN(v)) {
    if (v > 20000 && v < 800000) {
      return new Date((v - 25569) * 86400 * 1000);
    }
    if (v > 946684800000) {
      var dNum = new Date(v);
      if (!isNaN(dNum.getTime())) return dNum;
    }
  }
  var s = v != null ? String(v).trim() : '';
  if (!s) return new Date(0);

  if (/^\d{4}[\/\-.]/.test(s)) {
    var mIso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (mIso) {
      var d1 = new Date(parseInt(mIso[1], 10), parseInt(mIso[2], 10) - 1, parseInt(mIso[3], 10),
        mIso[4] != null ? parseInt(mIso[4], 10) : 0,
        mIso[5] != null ? parseInt(mIso[5], 10) : 0,
        mIso[6] != null ? parseInt(mIso[6], 10) : 0);
      if (!isNaN(d1.getTime())) return d1;
    }
  } else {
    var mDdMm = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (mDdMm) {
      var y0 = parseInt(mDdMm[3], 10);
      if (y0 < 100) y0 += 2000;
      var d0 = new Date(y0, parseInt(mDdMm[2], 10) - 1, parseInt(mDdMm[1], 10),
        mDdMm[4] != null ? parseInt(mDdMm[4], 10) : 0,
        mDdMm[5] != null ? parseInt(mDdMm[5], 10) : 0,
        mDdMm[6] != null ? parseInt(mDdMm[6], 10) : 0);
      if (!isNaN(d0.getTime())) return d0;
    }
  }
  var d2 = new Date(s);
  if (!isNaN(d2.getTime()) && d2.getFullYear() >= 2000) return d2;
  return new Date(0);
}

/** Đơn tính doanh thu / KPI: Hoàn thành, không Hủy. */
function _ordersCompletedStatus_(st) {
  var s = String(st || '').trim();
  if (s.indexOf('Hủy') >= 0 || s.toLowerCase().indexOf('huy') === 0) return false;
  return s === 'Hoàn thành' || s.indexOf('Hoàn') === 0;
}

/** Đơn CK đã ghi Hoàn thành trên sheet (sheet Bank có thể đã «Đã xử lý» - client vẫn cần đóng QR). */
function _orderBankTransferAlreadyCompleted_(orderId) {
  try {
    var sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
    if (sheet.getLastRow() < 2) return false;
    var data = sheet.getDataRange().getValues();
    var cmap = _ordersColumnMap_(sheet);
    var oidWant = _normalizeOrderIdForMatch(orderId);
    for (var j = 1; j < data.length; j++) {
      var oidCell = _normalizeOrderIdForMatch(_ordersCell_(data[j], cmap, 'Mã ĐH', 0));
      if (oidCell !== oidWant) continue;
      var st = String(_ordersCell_(data[j], cmap, 'Trạng thái', 11) || '').trim();
      if (!_ordersCompletedStatus_(st)) continue;
      var pm = String(_ordersCell_(data[j], cmap, 'Phương thức TT', 9) || '');
      var pmLo = pm.toLowerCase().replace(/\s+/g, ' ').trim();
      if (pm.indexOf('Chuyển') >= 0 || pmLo.indexOf('transfer') >= 0 || pmLo.indexOf('chuyen') >= 0) return true;
      if (/vietqr|qr\s*code|mã\s*qr/i.test(pm)) return true;
      if (pmLo === 'ck' || pmLo.indexOf(' ck') >= 0 || pmLo.indexOf('ck ') === 0) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

function _bankTransferRowProcessed_(statusCell) {
  var s = String(statusCell || '').trim().toLowerCase();
  return s.indexOf('đã xử lý') >= 0 || s.indexOf('da xu ly') >= 0 || s === 'xong' || s.indexOf('done') >= 0;
}

/** Lấy sheet Bank transfer (hỗ trợ cả tên bị gõ sai: "Bank tranfer"). */
function _getBankTransferSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Bank transfer') || ss.getSheetByName('Bank tranfer') || ss.getSheetByName('Bank Transfer');
  if (sh) return sh;
  return getSheet("Bank transfer", ["Ngân hàng", "Ngày giao dịch", "Số tài khoản", "Tài khoản phụ", "Code TT", "Nội dung thanh toán", "Loại", "Số tiền", "Mã tham chiếu", "Lũy kế", "Trạng thái xử lý"]);
}

/** Tự động hủy đơn chờ thanh toán quá N giờ (chỉ đổi trạng thái, KHÔNG trừ kho). */
var SUN_PENDING_ORDER_CANCEL_HOURS = 12;

function _cancelOrderIfExpired_(orderIdNorm, nowDate, hoursLimit) {
  var limitH = (hoursLimit != null ? parseFloat(hoursLimit) : SUN_PENDING_ORDER_CANCEL_HOURS);
  if (isNaN(limitH) || limitH <= 0) limitH = 12;
  var now = nowDate instanceof Date ? nowDate : new Date();
  var ordersSheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  if (!ordersSheet || ordersSheet.getLastRow() < 2) return false;
  var data = ordersSheet.getDataRange().getValues();
  var headers = data[0];
  var cmap = _ordersColumnMap_(ordersSheet);
  var colId = _ordersHeaderPick_(headers, ["Mã ĐH", "Mã đơn", "Mã DH", "Order ID"], 0);
  var colSt = _ordersHeaderPick_(headers, ["Trạng thái", "Trạng thái đơn", "Status"], 11);
  var colPm = _ordersHeaderPick_(headers, ["Phương thức TT", "PTTT", "Thanh toán"], 9);
  var colNote = _ordersHeaderPick_(headers, ["Ghi chú", "Note"], 10);
  var oidWant = String(orderIdNorm || '').trim().toUpperCase();
  if (!oidWant) return false;

  for (var r = 1; r < data.length; r++) {
    var oidCell = _normalizeOrderIdForMatch(data[r][colId >= 0 ? colId : 0]);
    if (oidCell !== oidWant) continue;
    var st = String(data[r][colSt >= 0 ? colSt : 11] || '').trim();
    if (!_orderStatusIsAwaitingBank_(st)) return false;
    var pm = String(data[r][colPm >= 0 ? colPm : 9] || '');
    if (pm.indexOf('Chuyển') < 0 && pm.toLowerCase().indexOf('chuyen') < 0 && pm.toLowerCase().indexOf('transfer') < 0) return false;
    var t = _parseOrderDate_(_ordersTimeRaw_(data[r], cmap));
    if (!t || isNaN(t.getTime()) || t.getTime() <= 0) return false;
    var ageMs = now.getTime() - t.getTime();
    if (ageMs < limitH * 3600 * 1000) return false;

    // Hủy đơn
    ordersSheet.getRange(r + 1, (colSt >= 0 ? colSt : 11) + 1).setValue('Hủy');
    try {
      if (colNote > -1) {
        var prev = String(data[r][colNote] || '');
        var tag = '[AUTO_HUY_CK_QUA_HAN ' + now.toLocaleString('vi-VN') + ']';
        ordersSheet.getRange(r + 1, colNote + 1).setValue(prev ? (prev + ' ' + tag) : tag);
      }
    } catch (eN) { }
    return true;
  }
  return false;
}

/** Quét toàn bộ Orders: hủy các đơn CK "Chờ thanh toán" quá 12 tiếng. Gắn trigger time-driven để chạy tự động. */
function sunAutoCancelPendingOrders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, message: 'busy' };
  try {
    var now = new Date();
    var limitH = SUN_PENDING_ORDER_CANCEL_HOURS;
    var sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
    if (!sheet || sheet.getLastRow() < 2) return { ok: true, cancelled: 0 };
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var cmap = _ordersColumnMap_(sheet);
    var colId = _ordersHeaderPick_(headers, ["Mã ĐH", "Mã đơn", "Mã DH", "Order ID"], 0);
    var colSt = _ordersHeaderPick_(headers, ["Trạng thái", "Trạng thái đơn", "Status"], 11);
    var colPm = _ordersHeaderPick_(headers, ["Phương thức TT", "PTTT", "Thanh toán"], 9);
    var colNote = _ordersHeaderPick_(headers, ["Ghi chú", "Note"], 10);

    var cancelled = 0;
    for (var r = 1; r < data.length; r++) {
      var st = String(data[r][colSt >= 0 ? colSt : 11] || '').trim();
      if (!_orderStatusIsAwaitingBank_(st)) continue;
      var pm = String(data[r][colPm >= 0 ? colPm : 9] || '');
      var pmLo = pm.toLowerCase();
      if (pm.indexOf('Chuyển') < 0 && pmLo.indexOf('chuyen') < 0 && pmLo.indexOf('transfer') < 0) continue;
      var t = _parseOrderDate_(_ordersTimeRaw_(data[r], cmap));
      if (!t || isNaN(t.getTime()) || t.getTime() <= 0) continue;
      var ageMs = now.getTime() - t.getTime();
      if (ageMs < limitH * 3600 * 1000) continue;
      sheet.getRange(r + 1, (colSt >= 0 ? colSt : 11) + 1).setValue('Hủy');
      try {
        if (colNote > -1) {
          var prev = String(data[r][colNote] || '');
          var tag = '[AUTO_HUY_CK_QUA_HAN ' + now.toLocaleString('vi-VN') + ']';
          sheet.getRange(r + 1, colNote + 1).setValue(prev ? (prev + ' ' + tag) : tag);
        }
      } catch (eN) { }
      cancelled++;
    }
    if (cancelled) {
      try { CACHE.clear(['dashboard', 'cashflow_month', 'cashflow_today', 'cashflow_week']); } catch (eC) { }
    }
    return { ok: true, cancelled: cancelled };
  } finally {
    try { lock.releaseLock(); } catch (eL) { }
  }
}

/**
 * Tự quét Bank transfer và tự hoàn tất các đơn CK đang "Chờ thanh toán"
 * nếu cột F (Nội dung thanh toán) có chứa Mã ĐH (cột A Orders).
 * Chạy qua trigger mỗi 1 phút (Apps Script không hỗ trợ 1 giây).
 */
function sunAutoConfirmBankTransfers() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, message: 'busy' };
  try {
    // luôn quét hủy trước để tránh hoàn tất đơn quá hạn
    try { sunAutoCancelPendingOrders(); } catch (eC1) { }

    var ordersSheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
    if (!ordersSheet || ordersSheet.getLastRow() < 2) return { ok: true, confirmed: 0 };
    var ordersData = ordersSheet.getDataRange().getValues();
    var headers = ordersData[0];
    var cmap = _ordersColumnMap_(ordersSheet);
    var colId = _ordersHeaderPick_(headers, ["Mã ĐH", "Mã đơn", "Mã DH", "Order ID"], 0);
    var colSt = _ordersHeaderPick_(headers, ["Trạng thái", "Trạng thái đơn", "Status"], 11);
    var colPm = _ordersHeaderPick_(headers, ["Phương thức TT", "PTTT", "Thanh toán"], 9);
    var colFinal = _ordersHeaderPick_(headers, ["Thanh toán", "Thực thu", "Số tiền TT", "Final", "Số tiền"], 8);

    var bankSheet = _getBankTransferSheet_();
    if (!bankSheet || bankSheet.getLastRow() < 2) return { ok: true, confirmed: 0 };
    var bankAll = bankSheet.getDataRange().getValues();
    var bh = bankAll[0];
    var bd = bankAll.slice(1);
    var colContent = _ordersHeaderPick_(bh, ["Nội dung thanh toán", "Nội dung CK", "Mô tả giao dịch"], -1);
    var colAmount = _ordersHeaderPick_(bh, ["Số tiền", "Số tiền GD"], -1);
    if (colContent < 0 || colAmount < 0) return { ok: false, message: 'bank_sheet_columns' };

    // build index: memoText -> keep as array; cheap scan for small sheet
    var confirmed = 0;
    for (var r = 1; r < ordersData.length; r++) {
      var st = String(ordersData[r][colSt >= 0 ? colSt : 11] || '').trim();
      if (!_orderStatusIsAwaitingBank_(st)) continue;
      var pm = String(ordersData[r][colPm >= 0 ? colPm : 9] || '');
      var pmLo = pm.toLowerCase();
      if (pm.indexOf('Chuyển') < 0 && pmLo.indexOf('chuyen') < 0 && pmLo.indexOf('transfer') < 0) continue;

      var oid = _normalizeOrderIdForMatch(ordersData[r][colId >= 0 ? colId : 0]);
      if (!oid) continue;

      // quá hạn 12h -> hủy, skip
      try {
        if (_cancelOrderIfExpired_(oid, new Date(), SUN_PENDING_ORDER_CANCEL_HOURS)) continue;
      } catch (eX) { }

      var expAmt = Math.round(parseFloat(String(ordersData[r][colFinal >= 0 ? colFinal : 8]).replace(/,/g, '')) || 0);
      if (expAmt <= 0) expAmt = 0;

      var matched = false;
      for (var i = 0; i < bd.length; i++) {
        var memo = String(bd[i][colContent] || '').toUpperCase();
        if (!memo) continue;
        // match Mã ĐH nằm ở bất kỳ vị trí nào trong chuỗi
        if (memo.indexOf(oid) < 0) continue;
        var amt = Math.round(parseFloat(String(bd[i][colAmount] || '').replace(/,/g, '')) || 0);
        // nếu Orders có số tiền, bắt buộc khớp để tránh nhầm mã
        if (expAmt > 0 && Math.abs(amt - expAmt) > 5) continue;
        matched = true;
        break;
      }
      if (!matched) continue;

      // xác nhận hoàn tất (trừ kho + tích điểm) dùng luồng chuẩn
      if (_confirmOrderInOrdersSheet(oid)) confirmed++;
    }
    if (confirmed) {
      try { CACHE.clear(['dashboard', 'cashflow_month', 'cashflow_today', 'cashflow_week', 'stock_month', 'stock_today', 'stock_week']); } catch (eC) { }
    }
    return { ok: true, confirmed: confirmed };
  } finally {
    try { lock.releaseLock(); } catch (eL) { }
  }
}

/** Chạy 1 lần trong Editor để cài trigger tự quét hủy (mỗi 5 phút). */
function installSunAutoCancelTrigger() {
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction && all[i].getHandlerFunction() === 'sunAutoCancelPendingOrders') {
      ScriptApp.deleteTrigger(all[i]);
    }
  }
  ScriptApp.newTrigger('sunAutoCancelPendingOrders').timeBased().everyMinutes(5).create();
  return 'OK - đã cài trigger auto hủy đơn CK quá hạn (mỗi 5 phút).';
}

/** Chạy 1 lần trong Editor để cài trigger auto xác nhận CK (mỗi 1 phút). */
function installSunAutoConfirmBankTrigger() {
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction && all[i].getHandlerFunction() === 'sunAutoConfirmBankTransfers') {
      ScriptApp.deleteTrigger(all[i]);
    }
  }
  ScriptApp.newTrigger('sunAutoConfirmBankTransfers').timeBased().everyMinutes(1).create();
  return 'OK - đã cài trigger auto xác nhận CK (mỗi 1 phút).';
}

// ============================================================
// Realtime trigger: khi sheet "Bank transfer" có thay đổi → chạy quét ngay
// Lưu ý: Apps Script không hỗ trợ time trigger mỗi 1 giây.
// Cách này dùng Spreadsheet "On change" và có debounce để tránh chạy dồn dập.
// ============================================================
var SUN_BANK_ONCHANGE_DEBOUNCE_MS = 8000;
var SUN_BANK_ONCHANGE_LASTRUN_KEY = 'SUN_BANK_ONCHANGE_LASTRUN_AT';

/**
 * Handler cho trigger "On change" của Spreadsheet.
 * Chỉ khi có thay đổi liên quan tới sheet Bank transfer thì mới kích hoạt quét.
 */
function onSunBankTransferChange(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var lastAt = parseInt(props.getProperty(SUN_BANK_ONCHANGE_LASTRUN_KEY) || '0', 10) || 0;
    var now = Date.now();
    if (now - lastAt < SUN_BANK_ONCHANGE_DEBOUNCE_MS) return;

    // lọc theo sheet nếu lấy được
    try {
      if (e && e.source && e.source.getActiveSheet) {
        var sh = e.source.getActiveSheet();
        var nm = sh ? String(sh.getName() || '') : '';
        if (nm && nm !== 'Bank transfer' && nm !== 'Bank tranfer' && nm !== 'Bank Transfer') return;
      }
    } catch (eSheet) { }

    // chỉ quan tâm thay đổi dạng "INSERT_ROW" nếu có
    try {
      if (e && e.changeType && String(e.changeType).toUpperCase() === 'OTHER') {
        // OTHER có thể là sort/filter; vẫn cho qua nhưng debounce chặn spam
      }
    } catch (eType) { }

    props.setProperty(SUN_BANK_ONCHANGE_LASTRUN_KEY, String(now));
    sunAutoConfirmBankTransfers();
  } catch (err) {
    // tránh throw để không làm hỏng trigger
  }
}

/**
 * Cài trigger realtime (On change) cho Spreadsheet hiện tại.
 * Chạy 1 lần trong Editor.
 */
function installSunRealtimeBankOnChangeTrigger() {
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction && all[i].getHandlerFunction() === 'onSunBankTransferChange') {
      ScriptApp.deleteTrigger(all[i]);
    }
  }
  ScriptApp.newTrigger('onSunBankTransferChange').forSpreadsheet(SpreadsheetApp.getActive()).onChange().create();
  return 'OK - đã cài realtime trigger (On change) cho sheet Bank transfer.';
}

/** Cột sheet Bank transfer chứa mã đơn / mã CK khớp (thường là cột K - chỉ số 10). */
function _bankSheetColOrderRef_(headers) {
  if (!headers || !headers.length) return -1;
  var col = _ordersHeaderPick_(headers, [
    "Mã đơn CK", "Mã ĐH CK", "Mã hóa đơn CK", "Khớp mã đơn", "Mã chuyển khoản",
    "Mã đơn hàng CK", "Số HĐ CK", "Mã HĐ CK", "Mã thanh toán", "Mã đơn hàng", "Số HĐ", "Mã HĐ"
  ], -1);
  if (col < 0 && headers.length >= 11) col = 10;
  if (col >= headers.length) return -1;
  return col;
}

function checkBankTransferPayment(orderId, expectedAmount) {
  const lock = LockService.getScriptLock();
  // lock nhanh để UI không bị "đứng chờ" quá lâu
  if (!lock.tryLock(1200)) {
    return { status: 'pending', message: 'busy' };
  }
  try {
    try {
      const oidNorm = _normalizeOrderIdForMatch(orderId);
      let exp = Math.round(parseFloat(String(expectedAmount).replace(/,/g, '')) || 0);
      if (exp <= 0) exp = 0;

      // Luôn ưu tiên số tiền & trạng thái từ sheet Orders (đúng yêu cầu đối soát)
      let ordersFinal = 0;
      let ordersStatus = '';
      try {
        const oSheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
        if (oSheet && oSheet.getLastRow() >= 2) {
          const oData = oSheet.getDataRange().getValues();
          const oHeaders = oData[0];
          const cId = _ordersHeaderPick_(oHeaders, ["Mã ĐH", "Mã đơn", "Mã DH", "Order ID"], 0);
          const cSt = _ordersHeaderPick_(oHeaders, ["Trạng thái", "Trạng thái đơn", "Status"], 11);
          const cFinal = _ordersHeaderPick_(oHeaders, ["Thanh toán", "Thực thu", "Số tiền TT", "Final", "Số tiền"], 8);
          for (let r = 1; r < oData.length; r++) {
            const idCell = _normalizeOrderIdForMatch(oData[r][cId >= 0 ? cId : 0]);
            if (idCell !== oidNorm) continue;
            ordersStatus = String(oData[r][cSt >= 0 ? cSt : 11] || '').trim();
            ordersFinal = Math.round(parseFloat(String(oData[r][cFinal >= 0 ? cFinal : 8]).replace(/,/g, '')) || 0);
            break;
          }
        }
      } catch (eOrd) { }

      // Nếu đơn không còn "Chờ thanh toán" thì coi như đã xử lý xong.
      if (ordersStatus && !_orderStatusIsAwaitingBank_(ordersStatus)) {
        return { status: 'paid', alreadyCompleted: true, expectedAmount: ordersFinal || exp || 0 };
      }

      // Nếu đơn CK quá 12 tiếng vẫn chờ → auto hủy (không xuất kho)
      try {
        if (_cancelOrderIfExpired_(oidNorm, new Date(), SUN_PENDING_ORDER_CANCEL_HOURS)) {
          return { status: 'error', message: 'expired_cancelled' };
        }
      } catch (eX) { }

      if (ordersFinal > 0) exp = ordersFinal;
      if (exp <= 0) return { status: 'pending' };

      if (_orderBankTransferAlreadyCompleted_(orderId)) {
        return { status: 'paid', alreadyCompleted: true, expectedAmount: exp };
      }

      const bankSheet = _getBankTransferSheet_();
      if (bankSheet.getLastRow() < 2) return { status: 'pending' };

      const allData = bankSheet.getDataRange().getValues();
      const headers = allData[0];
      const data = allData.slice(1);

      const colContent = _ordersHeaderPick_(headers, ["Nội dung thanh toán", "Nội dung CK", "Mô tả giao dịch"], -1);
      const colAmount = _ordersHeaderPick_(headers, ["Số tiền", "Số tiền GD"], -1);
      const colProcessingStatus = _ordersHeaderPick_(headers, ["Trạng thái xử lý", "Trạng thái"], -1);
      const colCodeTT = _ordersHeaderPick_(headers, ["Code TT", "Mã TT"], -1);
      const colOrderRef = _bankSheetColOrderRef_(headers);

      if (colContent === -1 || colAmount === -1 || colProcessingStatus === -1) {
        Logger.log("checkBankTransferPayment: thiếu cột sheet Bank transfer");
        return { status: 'pending', message: 'bank_sheet_columns' };
      }

      var unprocessedRows = [];
      var allMatchRows = [];
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const partMemo = String(row[colContent] || '').trim();
        const partCode = colCodeTT > -1 ? String(row[colCodeTT] || '').trim() : '';
        const transactionContent = (partMemo + ' ' + partCode).trim().toUpperCase().replace(/\s+/g, ' ');
        const memoNorm = transactionContent.replace(/\s+/g, '');
        const transactionAmount = Math.round(parseFloat(String(row[colAmount] || '').toString().replace(/,/g, '')) || 0);
        const currentProcessingStatus = String(row[colProcessingStatus] || '').trim();
        const memoOk = _bankMemoMatchesOrder(memoNorm, oidNorm);
        var kNorm = '';
        if (colOrderRef > -1) {
          kNorm = String(row[colOrderRef] || '').trim().toUpperCase().replace(/\s+/g, '');
        }
        // Theo yêu cầu mới: match chính từ cột F (Nội dung thanh toán). (Vẫn hỗ trợ cột K nếu có.)
        const kOkExact = kNorm && (kNorm === oidNorm || kNorm.indexOf(oidNorm) >= 0 || oidNorm.indexOf(kNorm) >= 0);
        const kOk = kNorm && (_bankMemoMatchesOrder(kNorm, oidNorm) || kOkExact);
        if ((memoOk || kOk) && transactionAmount > 0) {
          var proc = _bankTransferRowProcessed_(currentProcessingStatus);
          allMatchRows.push({ sheetRow: i + 2, amount: transactionAmount, processed: proc });
          if (!proc) unprocessedRows.push({ sheetRow: i + 2, amount: transactionAmount });
        }
      }

      if (allMatchRows.length === 0) return { status: 'pending' };

      var unpaidTotal = 0;
      for (var u = 0; u < unprocessedRows.length; u++) unpaidTotal += unprocessedRows[u].amount;
      var allTotal = 0;
      for (var a = 0; a < allMatchRows.length; a++) allTotal += allMatchRows[a].amount;

      // Chỉ xác nhận khi khớp đúng số tiền (sheet Orders ↔ sheet Bank transfer) theo cùng Mã ĐH
      if (unprocessedRows.length) {
        var hit = null;
        for (var h = 0; h < unprocessedRows.length; h++) {
          if (Math.abs(unprocessedRows[h].amount - exp) <= 5) { hit = unprocessedRows[h]; break; }
        }
        if (!hit && unpaidTotal >= exp - 5 && unprocessedRows.length === 1) hit = unprocessedRows[0];
        if (hit) {
          bankSheet.getRange(hit.sheetRow, colProcessingStatus + 1).setValue('Đã xử lý');
          const ok = _confirmOrderInOrdersSheet(orderId);
          return ok ? { status: 'paid', amountPaid: hit.amount, expectedAmount: exp } : { status: 'error', message: 'Không xác nhận được đơn hàng' };
        }
      }

      if (unprocessedRows.length && unpaidTotal >= exp - 5) {
        for (var k = 0; k < unprocessedRows.length; k++) {
          bankSheet.getRange(unprocessedRows[k].sheetRow, colProcessingStatus + 1).setValue('Đã xử lý');
        }
        const ok = _confirmOrderInOrdersSheet(orderId);
        return ok ? { status: 'paid', amountPaid: unpaidTotal, expectedAmount: exp } : { status: 'error', message: 'Không xác nhận được đơn hàng' };
      }

      if (allTotal >= exp - 5) {
        const ok2 = _confirmOrderInOrdersSheet(orderId);
        if (ok2) {
          return { status: 'paid', amountPaid: allTotal, expectedAmount: exp, recovered: true };
        }
      }

      if (unprocessedRows.length) {
        var pt = 0;
        for (var p = 0; p < unprocessedRows.length; p++) pt += unprocessedRows[p].amount;
        return { status: 'partial', amountPaid: pt, expectedAmount: exp };
      }

      if (_orderBankTransferAlreadyCompleted_(orderId)) {
        return { status: 'paid', alreadyCompleted: true, expectedAmount: exp };
      }

      return { status: 'pending' };
    } catch (eInner) {
      Logger.log('checkBankTransferPayment: ' + (eInner.message || eInner));
      return { status: 'pending', message: 'scan_error' };
    }
  } finally {
    try {
      lock.releaseLock();
    } catch (eL) { }
  }
}

/**
 * Đơn CK đang chờ: khách đã CK một phần, phần còn lại thu tiền mặt - xác nhận hoàn tất đơn.
 */
function confirmAwaitingOrderPaidCashRemainder(orderId) {
  const ordersSheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  const ordersData = ordersSheet.getDataRange().getValues();
  const headers = ordersData[0];
  var colId = _ordersHeaderPick_(headers, ["Mã ĐH", "Mã đơn", "Order ID"], 0);
  var colSt = _ordersHeaderPick_(headers, ["Trạng thái", "Trạng thái đơn", "Status"], 11);
  var colPm = _ordersHeaderPick_(headers, ["Phương thức TT", "PTTT", "Thanh toán"], 9);
  var colNote = _ordersHeaderPick_(headers, ["Ghi chú", "Note"], 10);
  const oidWant = _normalizeOrderIdForMatch(orderId);
  for (let j = 1; j < ordersData.length; j++) {
    const oidCell = _normalizeOrderIdForMatch(ordersData[j][colId >= 0 ? colId : 0]);
    const st = String(ordersData[j][colSt >= 0 ? colSt : 11] || '').trim();
    if (oidCell === oidWant && _orderStatusIsAwaitingBank_(st)) {
      if (colPm > -1) ordersSheet.getRange(j + 1, colPm + 1).setValue('Chuyển khoản + Tiền mặt');
      if (colNote > -1) {
        var prev = String(ordersData[j][colNote] || '');
        var tag = '[TM bù phần thiếu ' + new Date().toLocaleString('vi-VN') + ']';
        ordersSheet.getRange(j + 1, colNote + 1).setValue(prev ? (prev + ' ' + tag) : tag);
      }
      break;
    }
  }
  return _confirmOrderInOrdersSheet(orderId);
}

/**
 * Manually confirms a bank transfer payment for a given orderId.
 * This is used when auto-check fails but payment is confirmed manually by staff.
 * @param {string} orderId The ID of the order to confirm.
 * @returns {boolean} True if order is successfully confirmed, false otherwise.
 */
function confirmManualTransferPayment(orderId) {
  if (_orderBankTransferAlreadyCompleted_(orderId)) return true;
  return _confirmOrderInOrdersSheet(orderId);
}

/**
 * Hủy đơn đang "Chờ thanh toán" (chuyển khoản) theo Mã ĐH.
 * Không xuất kho / không tích điểm.
 * @param {string} orderId
 * @returns {{ok:boolean,status?:string,message?:string}}
 */
function cancelAwaitingBankOrder(orderId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, message: 'busy' };
  try {
    const oidWant = _normalizeOrderIdForMatch(orderId);
    if (!oidWant) return { ok: false, message: 'missing_order_id' };

    const ordersSheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
    if (!ordersSheet || ordersSheet.getLastRow() < 2) return { ok: false, message: 'orders_sheet_empty' };
    const all = ordersSheet.getDataRange().getValues();
    const headers = all[0];
    const colId = _ordersHeaderPick_(headers, ["Mã ĐH", "Mã đơn", "Mã DH", "Order ID"], 0);
    const colSt = _ordersHeaderPick_(headers, ["Trạng thái", "Trạng thái đơn", "Status"], 11);
    const colNote = _ordersHeaderPick_(headers, ["Ghi chú", "Note"], 10);

    for (let r = 1; r < all.length; r++) {
      const oidCell = _normalizeOrderIdForMatch(all[r][colId >= 0 ? colId : 0]);
      if (oidCell !== oidWant) continue;
      const st = String(all[r][colSt >= 0 ? colSt : 11] || '').trim();
      if (!st) return { ok: false, message: 'missing_status' };
      if (!_orderStatusIsAwaitingBank_(st)) {
        return { ok: true, status: st, message: 'not_awaiting' };
      }

      ordersSheet.getRange(r + 1, (colSt >= 0 ? colSt : 11) + 1).setValue('Hủy');
      if (colNote > -1) {
        const prev = String(all[r][colNote] || '');
        const tag = '[Hủy CK POS ' + new Date().toLocaleString('vi-VN') + ']';
        ordersSheet.getRange(r + 1, colNote + 1).setValue(prev ? (prev + ' ' + tag) : tag);
      }
      try { CACHE.clear(['dashboard', 'cashflow_month', 'cashflow_today', 'cashflow_week', 'stock_month', 'stock_today', 'stock_week']); } catch (eC) { }
      return { ok: true, status: 'Hủy' };
    }
    return { ok: false, message: 'order_not_found' };
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : String(e) };
  } finally {
    try { lock.releaseLock(); } catch (eL) { }
  }
}

/**
 * Helper to find an order in the "Orders" sheet, update its status to "Hoàn thành",
 * and trigger completion processing.
 * @param {string} orderId The ID of the order.
 * @returns {boolean} True if order was found and processed, false otherwise.
 */
function _confirmOrderInOrdersSheet(orderId) {
  const ordersSheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  const ordersData = ordersSheet.getDataRange().getValues();
  const headers = ordersData[0];

  const colOrderId = _ordersHeaderPick_(headers, ["Mã ĐH", "Mã đơn", "Mã DH", "Order ID"], 0);
  const colOrderStatus = _ordersHeaderPick_(headers, ["Trạng thái", "Trạng thái đơn", "Status"], 11);
  const colItems = _ordersHeaderPick_(headers, ["Các món", "Chi tiết món", "Items", "Món"], 5);
  const colCustomerName = _ordersHeaderPick_(headers, ["Tên KH", "Khách hàng", "Tên khách"], 2);
  const colCustomerPhone = _ordersHeaderPick_(headers, ["SĐT", "SDT", "Điện thoại", "Phone"], 3);
  const colPointsUsed = _ordersHeaderPick_(headers, ["Điểm thành viên", "Điểm"], 4);
  const colTotalAmount = _ordersHeaderPick_(headers, ["Tổng tiền"], 6);
  const colDiscount = _ordersHeaderPick_(headers, ["Giảm giá"], 7);
  const colFinalAmount = _ordersHeaderPick_(headers, ["Thanh toán", "Thực thu", "Số tiền TT"], 8);
  const colPromoCode = _ordersHeaderPick_(headers, ["Mã KM", "Mã khuyến mãi"], 12);

  const oidWant = _normalizeOrderIdForMatch(orderId);
  for (let j = 1; j < ordersData.length; j++) {
    const idCol = colOrderId >= 0 ? colOrderId : 0;
    const stCol = colOrderStatus >= 0 ? colOrderStatus : 11;
    const oidCell = _normalizeOrderIdForMatch(ordersData[j][idCol]);
    const st = String(ordersData[j][stCol] || '').trim();
    if (oidCell === oidWant && _orderStatusIsAwaitingBank_(st)) {
      ordersSheet.getRange(j + 1, stCol + 1).setValue('Hoàn thành');

      var itemsParsed = [];
      try {
        var rawIt = ordersData[j][colItems >= 0 ? colItems : 5];
        if (typeof rawIt === 'string') itemsParsed = JSON.parse(rawIt || '[]');
        else if (Array.isArray(rawIt)) itemsParsed = rawIt;
      } catch (eJ) {
        itemsParsed = [];
      }

      const orderDataForCompletion = {
        customerName: ordersData[j][colCustomerName >= 0 ? colCustomerName : 2],
        customerPhone: ordersData[j][colCustomerPhone >= 0 ? colCustomerPhone : 3],
        items: itemsParsed,
        totalAmount: ordersData[j][colTotalAmount >= 0 ? colTotalAmount : 6],
        discount: ordersData[j][colDiscount >= 0 ? colDiscount : 7],
        finalAmount: ordersData[j][colFinalAmount >= 0 ? colFinalAmount : 8] || 0,
        promoCode: ordersData[j][colPromoCode >= 0 ? colPromoCode : 12],
        pointsUsed: ordersData[j][colPointsUsed >= 0 ? colPointsUsed : 4]
      };
      _processOrderCompletion(orderId, orderDataForCompletion);
      return true;
    }
  }
  return false;
}

function getOrders(periodType) {
  const sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  if (sheet.getLastRow() < 2) return [];
  const cmap = _ordersColumnMap_(sheet);

  const now = new Date();
  let startDate = new Date(2000, 0, 1);
  let endYesterday = null;
  var modeAll = periodType === 'all' || periodType === 'ALL';

  if (!modeAll) {
    if (periodType === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    } else if (periodType === 'yesterday') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      endYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
    } else if (periodType === 'week') {
      const day = now.getDay() || 7;
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      startDate.setDate(startDate.getDate() - (day - 1));
    } else if (periodType === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    }
  }

  const data = sheet.getDataRange().getValues().slice(1);
  var rows = data.filter(function (r) {
    if (modeAll) return true;
    var t = _parseOrderDate_(_ordersTimeRaw_(r, cmap));
    if (t.getTime() === 0) return false;
    if (periodType === 'yesterday' && endYesterday) {
      return t >= startDate && t <= endYesterday;
    }
    return t >= startDate;
  }).map(function (r) {
    return mapOrderRow(r, cmap);
  });
  rows.sort(function (a, b) {
    return new Date(b.time).getTime() - new Date(a.time).getTime();
  });
  if (modeAll && rows.length > 2000) return rows.slice(0, 2000);
  return rows;
}

function mapOrderRow(r, cmap) {
  const safeNum = (v) => isNaN(parseFloat(v)) ? 0 : parseFloat(v);
  function c(name, fb) {
    return _ordersCell_(r, cmap, name, fb);
  }
  let items = [];
  try {
    var rawItems = c('Các món', 5);
    if (Array.isArray(rawItems)) items = rawItems;
    else if (typeof rawItems === 'string' && rawItems) items = JSON.parse(rawItems);
  } catch (e) {
    items = [];
  }
  var rawTime = _ordersTimeRaw_(r, cmap);
  var parsedTime = _parseOrderDate_(rawTime);
  var timeForClient = parsedTime.getTime() !== 0 ? parsedTime.getTime() : rawTime;

  return {
    orderId: String(c('Mã ĐH', 0) || ''),
    time: timeForClient,
    customerName: String(c('Tên KH', 2) || ''),
    customerPhone: String(c('SĐT', 3) || ''),
    pointsUsed: safeNum(c('Điểm thành viên', 4)),
    items: items,
    totalAmount: safeNum(c('Tổng tiền', 6)),
    discount: safeNum(c('Giảm giá', 7)),
    finalAmount: safeNum(c('Thanh toán', 8)),
    paymentMethod: String(c('Phương thức TT', 9) || ''),
    note: String(c('Ghi chú', 10) || ''),
    status: String(c('Trạng thái', 11) || ''),
    promoCode: String(c('Mã KM', 12) || '')
  };
}

function getDashboardData() {
  var emptyDash = {
    todayRevenue: 0, yesterdayRevenue: 0, todayOrders: 0, yesterdayOrders: 0, monthRevenue: 0, monthOrders: 0,
    revenueChange: 0, topItems: [], preferences: { sweet: 0, lessSweet: 0, fullFat: 0, lessFat: 0, withIce: 0, noIce: 0, withMilk: 0, noMilk: 0 }, recentOrders: []
  };
  try {
    var cached = null;
    try {
      cached = CACHE.get('dashboard');
    } catch (eC) {
      try {
        CacheService.getScriptCache().remove('dashboard');
      } catch (eR) { }
    }
    if (cached && typeof cached === 'object' && typeof cached.todayRevenue === 'number') return cached;

    const sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
    if (sheet.getLastRow() < 2) return emptyDash;

    const cmap = _ordersColumnMap_(sheet);
    const allData = sheet.getDataRange().getValues().slice(1);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startYesterday = new Date(startToday.getTime() - 86400000);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let todayRev = 0, yestRev = 0, monthRev = 0;
    let todayOrdCount = 0, yestOrdCount = 0, monthOrdCount = 0;

    const itemCount = {};
    const prefs = { sweet: 0, lessSweet: 0, fullFat: 0, lessFat: 0, withIce: 0, noIce: 0, withMilk: 0, noMilk: 0 };
    const recentOrders = [];

    function bumpPrefsFromItem(i) {
      var opt = i && i.options ? i.options : {};
      var sw = String(opt.sweetness || i.sweetness || '');
      if (sw.indexOf('Nhiều') >= 0 || sw.indexOf('nhiều') >= 0) prefs.sweet++;
      else prefs.lessSweet++;
      var ice = String(opt.ice || i.ice || '');
      if (ice && ice.indexOf('Không') !== 0 && ice !== '') prefs.withIce++;
      else prefs.noIce++;
    }

    allData.forEach(function (r) {
      var t = _parseOrderDate_(_ordersTimeRaw_(r, cmap));
      if (!t || isNaN(t.getTime()) || t.getTime() === 0) return;
      var stRow = String(_ordersCell_(r, cmap, 'Trạng thái', 11) || '').trim();
      var completed = _ordersCompletedStatus_(stRow);
      var amt = parseFloat(_ordersCell_(r, cmap, 'Thanh toán', 8)) || 0;
      if (t >= startMonth && completed) {
        monthRev += amt;
        monthOrdCount++;
      }

      if (t >= startToday) {
        if (completed) {
          todayRev += amt;
          todayOrdCount++;
        }
        var items = [];
        try {
          var raw = _ordersCell_(r, cmap, 'Các món', 5);
          items = typeof raw === 'string' && raw ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
        } catch (e2) {
          items = [];
        }

        if (completed) {
          items.forEach(function (i) {
            if (!i) return;
            var nm = i.name || i.productName || '';
            if (nm) itemCount[nm] = (itemCount[nm] || 0) + (i.quantity || 1);
            bumpPrefsFromItem(i);
          });
        }

        var slimItems = items.map(function (it) {
          return {
            name: it.name || '',
            quantity: it.quantity || 1,
            totalPrice: parseFloat(it.totalPrice) || 0,
            costPrice: parseFloat(it.costPrice) || 0
          };
        });
        if (stRow.indexOf('Hủy') === -1) {
          var rawTr = _ordersTimeRaw_(r, cmap);
          var parsedTr = _parseOrderDate_(rawTr);
          var timeRecent = parsedTr.getTime() !== 0 ? parsedTr.getTime() : rawTr;
          recentOrders.push({
            orderId: String(_ordersCell_(r, cmap, 'Mã ĐH', 0) || ''),
            time: timeRecent,
            customerName: String(_ordersCell_(r, cmap, 'Tên KH', 2) || ''),
            finalAmount: amt,
            paymentMethod: String(_ordersCell_(r, cmap, 'Phương thức TT', 9) || ''),
            status: stRow,
            items: slimItems
          });
        }
      } else if (t >= startYesterday && t < startToday && completed) {
        yestRev += amt;
        yestOrdCount++;
      }
    });

    const topItems = Object.keys(itemCount).map(function (k) {
      return { name: k, count: itemCount[k] };
    }).sort(function (a, b) {
      return b.count - a.count;
    }).slice(0, 5);
    const change = yestRev > 0 ? ((todayRev - yestRev) / yestRev * 100).toFixed(1) : 0;

    const result = {
      todayRevenue: todayRev, yesterdayRevenue: yestRev, monthRevenue: monthRev,
      todayOrders: todayOrdCount, yesterdayOrders: yestOrdCount, monthOrders: monthOrdCount,
      revenueChange: change, topItems: topItems, preferences: prefs,
      recentOrders: recentOrders.slice(-10).reverse()
    };

    try {
      CACHE.set('dashboard', result, 15);
    } catch (ePut) { }
    return result;
  } catch (eAll) {
    Logger.log('getDashboardData: ' + (eAll.message || eAll));
    return emptyDash;
  }
}

// ============================================================
// 4. NHẬP XUẤT TỒN KHO
// ============================================================
function logStockTransaction(data) {
  const isImport = data.type === 'NHAP';
  const sheetName = isImport ? "Log_NhapKho" : "Log_XuatKho";
  const sheet = getSheet(sheetName, ["Thời gian", "Loại phiếu", "Tên nguyên liệu", "Số lượng", "Đơn giá", "Thành tiền", "Hạn sử dụng", "Ghi chú"]);

  var txTime = new Date();
  if (data && data.transDate) {
    var s = String(data.transDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var p = s.split('-');
      txTime = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0, 0);
    } else {
      var pd = _parseOrderDate_(s);
      if (pd && !isNaN(pd.getTime()) && pd.getTime() !== 0) txTime = pd;
    }
  }
  sheet.appendRow([txTime, isImport ? "Phiếu Nhập" : "Phiếu Xuất", data.name, data.qty, data.unitPrice || 0, (data.qty * (data.unitPrice || 0)), data.expiryDate || '', data.note || '']);
  CACHE.clear(['stock_month', 'stock_today', 'stock_week', 'cashflow_month', 'cashflow_today', 'cashflow_week']);
  return isImport ? "Đã nhập kho thành công!" : "Đã xuất kho thành công!";
}

function getStockReportAdvanced(periodType, skipCache) {
  const cacheKey = 'stock_' + periodType;
  if (!skipCache) {
    const cached = CACHE.get(cacheKey);
    if (cached) return cached;
  }

  const headersDef = ["Mã", "Loại", "Tên nguyên liệu", "ĐVT", "Nhà cung cấp", "Quy cách", "Giá sỉ", "Định lượng Mix", "Giá bán Mix", "Ghi chú"];
  const configSheet = getSheet("Config", headersDef);
  if (configSheet.getLastRow() < 2) return [];
  
  const now = new Date();
  let startDate = new Date(2000, 0, 1);
  let endDate = new Date(2100, 0, 1);
  
  if (periodType === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (periodType === 'week') {
    const day = now.getDay() || 7;
    startDate = new Date(now); startDate.setHours(0,0,0,0);
    startDate.setDate(startDate.getDate() - (day - 1));
    endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000 + 86399000);
  } else if (periodType === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  const lastCfgRow = configSheet.getLastRow();
  let stockDict = {};
  if (lastCfgRow >= 2) {
    const numRows = Math.max(0, lastCfgRow - 1);
    const itemsData = numRows > 0 ? configSheet.getRange(2, 3, numRows, 4).getValues() : [];
    itemsData.forEach(r => {
      if (r[0]) stockDict[r[0]] = { name: r[0], unit: r[1] || '', opening: 0, inPeriod: 0, outPeriod: 0, closing: 0, transactions: [] };
    });
  }

  const processSheet = (shName, isIn) => {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(shName);
    if (sh && sh.getLastRow() > 1) {
      const data = sh.getDataRange().getValues().slice(1);
      data.forEach(r => {
        const transDate = _parseOrderDate_(r[0]);
        if (!transDate || isNaN(transDate.getTime()) || transDate.getTime() === 0) return;
        const itemName = r[2];
        const qty = parseFloat(r[3] || 0);
        if (!itemName) return;
        if (!stockDict[itemName]) {
          stockDict[itemName] = { name: itemName, unit: '', opening: 0, inPeriod: 0, outPeriod: 0, closing: 0, transactions: [] };
        }
        if (transDate < startDate) {
          stockDict[itemName].opening += isIn ? qty : -qty;
        } else if (transDate >= startDate && transDate <= endDate) {
          if (isIn) stockDict[itemName].inPeriod += qty;
          else stockDict[itemName].outPeriod += qty;
          stockDict[itemName].transactions.push({
            time: r[0], type: isIn ? 'Nhập' : 'Xuất', qty, expiryDate: r[6] || '', note: r[7] || ''
          });
        }
      });
    }
  };

  const logHeaders = ["Thời gian", "Loại phiếu", "Tên nguyên liệu", "Số lượng", "Đơn giá", "Thành tiền", "Hạn sử dụng", "Ghi chú"];
  processSheet(getSheet("Log_NhapKho", logHeaders).getName(), true);
  processSheet(getSheet("Log_XuatKho", logHeaders).getName(), false);

  const result = Object.values(stockDict).map(item => {
    item.closing = item.opening + item.inPeriod - item.outPeriod;
    return item;
  });
  
  if (!skipCache) {
    CACHE.set(cacheKey, result, 30);
  }
  return result;
}

// ============================================================
// 4b. BÁO CÁO TỰ ĐỘNG (Email) - doanh thu / số lượng / LN / nhập kho / tồn kho
// ============================================================
var REPORT_EMAILS_PROP = 'REPORT_EMAILS'; // comma-separated list

function setReportEmails(emails) {
  var list = [];
  if (Array.isArray(emails)) list = emails;
  else list = String(emails || '').split(/[,\n;]/g);
  list = list.map(function (s) { return String(s || '').trim(); }).filter(function (s) { return s && s.indexOf('@') > 0; });
  var csv = list.join(',');
  if (!csv) return { ok: false, message: 'Danh sách email trống/không hợp lệ' };
  PropertiesService.getScriptProperties().setProperty(REPORT_EMAILS_PROP, csv);
  return { ok: true, value: csv };
}

function setReportEmailsDefault() {
  return setReportEmails('lamtin208@gmail.com,sunnutmilk@gmail.com');
}

function _fmtVnd_(n) {
  try { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n || 0); } catch (e) { return (Math.round(n || 0) + '₫'); }
}

function _periodRange_(type, now) {
  var d = now ? new Date(now) : new Date();
  if (type === 'today') {
    return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0), end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) };
  }
  if (type === 'week') {
    var day = d.getDay() || 7;
    var start = new Date(d); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (day - 1));
    var end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000 + 86399000);
    return { start: start, end: end };
  }
  if (type === 'month') {
    return { start: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0), end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) };
  }
  if (type === 'ytd') {
    return { start: new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0), end: new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999) };
  }
  return { start: new Date(2000, 0, 1, 0, 0, 0, 0), end: new Date(2100, 0, 1, 0, 0, 0, 0) };
}

function _safeJsonParse_(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

function _loadOrdersForReport_() {
  var sh = _getOrdersSheet_();
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getDataRange().getValues();
  var headers = rows[0].map(function (h) { return String(h || '').trim(); });
  var cmap = {};
  headers.forEach(function (h, i) { if (h) cmap[h] = i; });

  var colItems = (cmap['Các món'] != null ? cmap['Các món'] : 5);
  var colFinal = cmap['Thực thu'];
  if (colFinal == null) colFinal = cmap['Tổng tiền'];
  var colDisc = cmap['Giảm giá'];
  var colStatus = cmap['Trạng thái'];

  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var st = String(_ordersCell_(r, cmap, 'Trạng thái', 11) || '');
    var tRaw = _ordersTimeRaw_(r, cmap);
    var t = _parseOrderDate_(tRaw);
    var finalAmt = parseFloat(String(colFinal != null ? r[colFinal] : '').replace(/,/g, '')) || 0;
    var discAmt = parseFloat(String(colDisc != null ? r[colDisc] : '').replace(/,/g, '')) || 0;
    var itemsCell = r[colItems];
    var items = [];
    if (itemsCell) {
      if (Array.isArray(itemsCell)) items = itemsCell;
      else if (typeof itemsCell === 'string') items = _safeJsonParse_(itemsCell, []);
      else items = _safeJsonParse_(String(itemsCell), []);
    }
    out.push({ time: t, status: st, finalAmount: finalAmt, discountAmount: discAmt, items: items });
  }
  return out;
}

function _buildSalesSummary_(type, now) {
  var pr = _periodRange_(type, now);
  var start = pr.start, end = pr.end;
  var orders = _loadOrdersForReport_();
  var menu = getMenu();
  var menuByName = {};
  menu.forEach(function (m) { if (m && m.name) menuByName[String(m.name).trim().toLowerCase()] = m; });

  var revenue = 0, gross = 0, discount = 0, cups = 0, cogs = 0, opex = 0, orderCount = 0;
  var itemSold = {};

  orders.forEach(function (o) {
    if (!o || !o.time || isNaN(o.time.getTime())) return;
    if (o.time.getTime() < start.getTime() || o.time.getTime() > end.getTime()) return;
    if (!_ordersCompletedStatus_(o.status)) return;
    orderCount += 1;
    revenue += (parseFloat(o.finalAmount) || 0);
    discount += (parseFloat(o.discountAmount) || 0);
    gross += (parseFloat(o.finalAmount) || 0) + (parseFloat(o.discountAmount) || 0);
    (o.items || []).forEach(function (it) {
      var q = parseInt(it && it.quantity, 10) || 1;
      cups += q;
      var nm = String(it && it.name || '').trim();
      if (nm) itemSold[nm] = (itemSold[nm] || 0) + q;
      var key = nm.toLowerCase();
      var m = menuByName[key];
      if (m) {
        cogs += (parseFloat(m.costPrice) || 0) * q;
        opex += (parseFloat(m.opEx) || 0) * q;
      }
    });
  });

  var profit = revenue - cogs - opex;
  var marginPct = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
  var topItems = Object.keys(itemSold).map(function (k) { return { name: k, qty: itemSold[k] }; })
    .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 8);

  return {
    periodType: type,
    start: start,
    end: end,
    orderCount: orderCount,
    cups: cups,
    revenue: revenue,
    discount: discount,
    gross: gross,
    cogs: cogs,
    opex: opex,
    profit: profit,
    marginPct: marginPct,
    topItems: topItems
  };
}

function _buildImportSummary_(type, now) {
  var pr = _periodRange_(type, now);
  var start = pr.start, end = pr.end;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log_NhapKho');
  if (!sh || sh.getLastRow() < 2) return { totalQty: 0, totalAmount: 0, lines: 0 };
  var rows = sh.getDataRange().getValues().slice(1);
  var totalAmt = 0, totalQty = 0, lines = 0;
  rows.forEach(function (r) {
    var t = _parseOrderDate_(r[0]);
    if (!t || isNaN(t.getTime())) return;
    if (t.getTime() < start.getTime() || t.getTime() > end.getTime()) return;
    var qty = parseFloat(r[3] || 0) || 0;
    var amt = parseFloat(r[5] || 0) || 0;
    totalQty += qty;
    totalAmt += amt;
    lines += 1;
  });
  return { totalQty: totalQty, totalAmount: totalAmt, lines: lines };
}

function _buildReorderSuggestions_(stockAll) {
  var list = (stockAll || []).filter(function (r) { return r && r.name; });
  // Quy tắc tối thiểu: closing <= 0 coi là cần mua. (Có thể nâng cấp sau bằng ngưỡng theo từng NL)
  return list
    .filter(function (r) { return (parseFloat(r.closing) || 0) <= 0; })
    .sort(function (a, b) { return (parseFloat(a.closing) || 0) - (parseFloat(b.closing) || 0); })
    .slice(0, 30);
}

function buildAutoReportHtml(now) {
  var d = now ? new Date(now) : new Date();
  var tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  var stamp = Utilities.formatDate(d, tz, 'dd/MM/yyyy HH:mm');

  var sToday = _buildSalesSummary_('today', d);
  var sWeek = _buildSalesSummary_('week', d);
  var sMonth = _buildSalesSummary_('month', d);

  var inToday = _buildImportSummary_('today', d);
  var inWeek = _buildImportSummary_('week', d);
  var inMonth = _buildImportSummary_('month', d);

  var stockAll = getStockReportAdvanced('all', true);
  var needBuy = _buildReorderSuggestions_(stockAll);

  var topToday = (sToday.topItems || []).map(function (x) { return '<li>' + x.name + ': <b>' + x.qty + '</b></li>'; }).join('');
  if (!topToday) topToday = '<li>(chưa có)</li>';

  var needBuyHtml = needBuy.map(function (x) {
    return '<li>' + String(x.name) + ': <b>' + (parseFloat(x.closing) || 0) + '</b> ' + (x.unit ? String(x.unit) : '') + '</li>';
  }).join('');
  if (!needBuyHtml) needBuyHtml = '<li>(không có)</li>';

  var block = function (title, s) {
    return '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin:10px 0;">' +
      '<div style="font-weight:800;font-size:14px;margin-bottom:6px;">' + title + '</div>' +
      '<div style="font-size:13px;line-height:1.7;color:#111827;">' +
      'Đơn: <b>' + (s.orderCount || 0) + '</b> · SL bán: <b>' + (s.cups || 0) + '</b><br>' +
      'Doanh thu (thực thu): <b>' + _fmtVnd_(s.revenue) + '</b> · Giảm giá: <b>' + _fmtVnd_(s.discount) + '</b> · Doanh thu gộp: <b>' + _fmtVnd_(s.gross) + '</b><br>' +
      'Vốn (COGS): <b>' + _fmtVnd_(s.cogs) + '</b> · Chi phí VH: <b>' + _fmtVnd_(s.opex) + '</b><br>' +
      'Lợi nhuận ước: <b>' + _fmtVnd_(s.profit) + '</b> · Biên LN: <b>' + (s.marginPct || 0) + '%</b>' +
      '</div></div>';
  };

  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:0 auto;color:#111827;">' +
    '<div style="font-size:18px;font-weight:900;margin:6px 0 2px;">SUN Nut Milk - Báo cáo tự động</div>' +
    '<div style="font-size:12px;color:#6b7280;margin-bottom:10px;">Thời điểm gửi: ' + stamp + '</div>' +
    block('Báo cáo ngày (hôm nay)', sToday) +
    '<div style="margin:-4px 0 10px 4px;font-size:12px;color:#374151;">Top bán hôm nay:<ul style="margin:6px 0 0 18px;">' + topToday + '</ul></div>' +
    block('Báo cáo tuần (lũy kế)', sWeek) +
    block('Báo cáo tháng (lũy kế)', sMonth) +
    '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin:10px 0;">' +
    '<div style="font-weight:800;font-size:14px;margin-bottom:6px;">Nhập hàng</div>' +
    '<div style="font-size:13px;line-height:1.7;">' +
    'Hôm nay: <b>' + inToday.lines + '</b> phiếu · Tổng tiền: <b>' + _fmtVnd_(inToday.totalAmount) + '</b><br>' +
    'Tuần: <b>' + inWeek.lines + '</b> phiếu · Tổng tiền: <b>' + _fmtVnd_(inWeek.totalAmount) + '</b><br>' +
    'Tháng: <b>' + inMonth.lines + '</b> phiếu · Tổng tiền: <b>' + _fmtVnd_(inMonth.totalAmount) + '</b>' +
    '</div></div>' +
    '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin:10px 0;">' +
    '<div style="font-weight:800;font-size:14px;margin-bottom:6px;">Tồn kho cần mua</div>' +
    '<div style="font-size:13px;line-height:1.7;color:#111827;">' +
    '<ul style="margin:6px 0 0 18px;">' + needBuyHtml + '</ul>' +
    '</div></div>' +
    '<div style="font-size:11px;color:#6b7280;margin-top:10px;line-height:1.5;">' +
    'Ghi chú: LN ước = Thực thu − Vốn (Menu.Giá vốn) − Phí VH (Menu.Phí VH). Nếu chưa nhập giá vốn/phí VH cho món thì LN sẽ bị lệch.' +
    '</div>' +
    '</div>';
}

function sendAutoReportsNow() {
  var now = new Date();
  var tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  var stamp = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm');
  var html = buildAutoReportHtml(now);
  var to = String(PropertiesService.getScriptProperties().getProperty(REPORT_EMAILS_PROP) || '').trim();
  if (!to) return { ok: false, message: 'Chưa cấu hình REPORT_EMAILS (Script Properties).' };
  var subject = 'SUN Nut Milk - Báo cáo tự động (' + stamp + ')';
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html });
  return { ok: true, to: to, subject: subject };
}

function runAutoReports11h30() { return sendAutoReportsNow(); }
function runAutoReports23h() { return sendAutoReportsNow(); }

function setupAutoReportTriggers() {
  var handlers = { runAutoReports11h30: true, runAutoReports23h: true };
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    var h = all[i].getHandlerFunction && all[i].getHandlerFunction();
    if (handlers[h]) ScriptApp.deleteTrigger(all[i]);
  }
  ScriptApp.newTrigger('runAutoReports11h30').timeBased().everyDays(1).atHour(11).nearMinute(30).create();
  ScriptApp.newTrigger('runAutoReports23h').timeBased().everyDays(1).atHour(23).nearMinute(0).create();
  return { ok: true, message: 'Đã tạo trigger báo cáo 11:30 và 23:00 mỗi ngày.' };
}

function getStockTransactionLog(itemName, limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let allTx = [];
  
  const logHeaders = ["Thời gian", "Loại phiếu", "Tên nguyên liệu", "Số lượng", "Đơn giá", "Thành tiền", "Hạn sử dụng", "Ghi chú"];
  getSheet("Log_NhapKho", logHeaders);
  getSheet("Log_XuatKho", logHeaders);
  
  ['Log_NhapKho', 'Log_XuatKho'].forEach(shName => {
    const sh = ss.getSheetByName(shName);
    if (sh && sh.getLastRow() > 1) {
      const data = sh.getDataRange().getValues().slice(1);
      data.forEach(r => {
        if (!itemName || r[2] === itemName) {
          allTx.push({ time: r[0], type: r[1], name: r[2], qty: r[3], unitPrice: r[4], total: r[5], expiryDate: r[6] || '', note: r[7] || '' });
        }
      });
    }
  });
  
  allTx.sort((a,b) => new Date(b.time) - new Date(a.time));
  return limit ? allTx.slice(0, limit) : allTx;
}

/** Nhật ký nhập/xuất một nguyên liệu trong khoảng thời gian (ISO string); tổng theo ngày. */
function getStockLedgerRange(itemName, startIso, endIso) {
  var dStart = startIso ? new Date(startIso) : new Date(new Date().getTime() - 30 * 86400000);
  if (startIso) dStart.setHours(0, 0, 0, 0);
  var dEnd = endIso ? new Date(endIso) : new Date();
  if (endIso) dEnd.setHours(23, 59, 59, 999);
  var t0 = dStart.getTime();
  var t1 = dEnd.getTime();
  var all = getStockTransactionLog(itemName, null);
  var transactions = all.filter(function (tx) {
    var tm = new Date(tx.time).getTime();
    return !isNaN(tm) && tm >= t0 && tm <= t1;
  });
  var dailyMap = {};
  transactions.forEach(function (tx) {
    var dk = Utilities.formatDate(new Date(tx.time), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    if (!dailyMap[dk]) dailyMap[dk] = { date: dk, inQty: 0, outQty: 0 };
    var q = parseFloat(tx.qty) || 0;
    if (String(tx.type || '').indexOf('Nhập') >= 0) dailyMap[dk].inQty += q;
    else dailyMap[dk].outQty += q;
  });
  var daily = [];
  for (var k in dailyMap) {
    if (Object.prototype.hasOwnProperty.call(dailyMap, k)) daily.push(dailyMap[k]);
  }
  daily.sort(function (a, b) { return a.date.localeCompare(b.date); });
  return { itemName: itemName || '', transactions: transactions, daily: daily };
}

// ============================================================
// 5. KHÁCH HÀNG & LOYALTY
// ============================================================
function _getCustomersFromSheetOnly_() {
  const headersDef = ["SĐT", "Tên", "Điểm", "Tổng chi tiêu", "Số lần ghé", "Lần đầu", "Lần cuối", "Hạng", "Ghi chú"];
  const sheet = getSheet("Customers", headersDef);
  if (sheet.getLastRow() < 2) return [];
  const safeNum = (v) => isNaN(parseFloat(v)) ? 0 : parseFloat(v);
  return sheet.getDataRange().getValues().slice(1).map(r => ({
    phone: String(r[0]||'').trim(), name: String(r[1]||''), cups: safeNum(r[2]), points: safeNum(r[2]), totalSpent: safeNum(r[3]),
    visitCount: safeNum(r[4]), firstVisit: r[5], lastVisit: r[6], tier: String(r[7]||''), note: String(r[8]||'')
  })).filter(c => c.phone);
}

/** Gom khách từ sheet Orders/Order (mọi đơn không Hủy) để tab Admin luôn có dữ liệu. */
function _aggregateCustomersFromOrders_() {
  try {
    const sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
    if (sheet.getLastRow() < 2) return [];
    const data = sheet.getDataRange().getValues();
    const cmap = _ordersColumnMap_(sheet);
    const colPhone = cmap && cmap['SĐT'] !== undefined ? cmap['SĐT'] : 3;
    const colName = cmap && cmap['Tên KH'] !== undefined ? cmap['Tên KH'] : 2;
    const colStatus = cmap && cmap['Trạng thái'] !== undefined ? cmap['Trạng thái'] : 11;
    const colFinal = cmap && cmap['Thanh toán'] !== undefined ? cmap['Thanh toán'] : 8;
    const colTime = cmap && cmap['Thời gian'] !== undefined ? cmap['Thời gian'] : 1;
    var acc = {};
    for (var j = 1; j < data.length; j++) {
      var row = data[j];
      var phone = normalizeVnPhoneDigits_(row[colPhone]);
      if (!phone || phone.length < 9) continue;
      var st = String(row[colStatus] || '').trim();
      if (st.indexOf('Hủy') >= 0) continue;
      var nm = String(row[colName] || '').trim() || 'Khách lẻ';
      var t = _parseOrderDate_(row[colTime]);
      var amt = parseFloat(String(row[colFinal] || '').replace(/,/g, '')) || 0;
      if (!acc[phone]) {
        acc[phone] = { phone: phone, name: nm, visitCount: 0, totalSpent: 0, lastVisit: null, firstVisit: null, completedCount: 0, cupsBought: 0 };
      }
      acc[phone].visitCount += 1;
      if (_ordersCompletedStatus_(st)) {
        acc[phone].completedCount += 1;
        acc[phone].totalSpent += amt;
        // Đếm tổng số ly đã mua (sum quantity) để phục vụ đổi 5/10 ly
        try {
          var rawItems = (cmap && cmap['Các món'] !== undefined) ? row[cmap['Các món']] : row[5];
          var items = [];
          if (Array.isArray(rawItems)) items = rawItems;
          else if (typeof rawItems === 'string' && rawItems) items = JSON.parse(rawItems);
          if (Array.isArray(items)) {
            for (var ii = 0; ii < items.length; ii++) {
              acc[phone].cupsBought += (parseInt(items[ii] && items[ii].quantity, 10) || 1);
            }
          }
        } catch (eCup) { }
      }
      if (t && !isNaN(t.getTime())) {
        if (!acc[phone].lastVisit || t.getTime() > acc[phone].lastVisit.getTime()) acc[phone].lastVisit = t;
        if (!acc[phone].firstVisit || t.getTime() < acc[phone].firstVisit.getTime()) acc[phone].firstVisit = t;
      }
      if (nm && nm !== 'Khách lẻ') acc[phone].name = nm;
    }
    var out = [];
    for (var k in acc) {
      var c = acc[k];
      var cc = c.completedCount || 0;
      var tier = cc >= 50 ? 'Vàng' : cc >= 20 ? 'Bạc' : 'Thành viên';
      out.push({
        phone: c.phone,
        name: c.name,
        cups: c.cupsBought || 0,
        points: c.cupsBought || 0,
        totalSpent: c.totalSpent,
        visitCount: c.visitCount,
        firstVisit: c.firstVisit,
        lastVisit: c.lastVisit,
        tier: tier,
        note: c.completedCount < c.visitCount ? '(có đơn chưa hoàn tất)' : ''
      });
    }
    return out;
  } catch (eAgg) {
    Logger.log('_aggregateCustomersFromOrders_: ' + (eAgg.message || eAgg));
    return [];
  }
}

function getCustomers(skipCache) {
  if (!skipCache) {
    var cached = CACHE.get('customers_v1');
    if (cached) return cached;
  }
  var sheetList = _getCustomersFromSheetOnly_();
  var fromOrders = _aggregateCustomersFromOrders_();
  var byPhone = {};
  sheetList.forEach(function (c) {
    var p = normalizeVnPhoneDigits_(c.phone);
    if (p) byPhone[p] = Object.assign({}, c, { phone: p });
  });
  fromOrders.forEach(function (c) {
    var p = c.phone;
    if (!byPhone[p]) {
      byPhone[p] = c;
    } else {
      var a = byPhone[p];
      if ((parseFloat(a.totalSpent) || 0) < (parseFloat(c.totalSpent) || 0)) a.totalSpent = c.totalSpent;
      if ((parseInt(a.visitCount, 10) || 0) < (parseInt(c.visitCount, 10) || 0)) a.visitCount = c.visitCount;
      if (c.lastVisit && (!a.lastVisit || new Date(c.lastVisit).getTime() > new Date(a.lastVisit).getTime())) a.lastVisit = c.lastVisit;
      if ((!a.firstVisit && c.firstVisit) || (c.firstVisit && a.firstVisit && new Date(c.firstVisit).getTime() < new Date(a.firstVisit).getTime())) a.firstVisit = c.firstVisit;
      if ((a.name === 'Khách hàng' || a.name === 'Khách lẻ') && c.name && c.name !== 'Khách lẻ') a.name = c.name;
      if (c.note && !a.note) a.note = c.note;
    }
  });
  var out = Object.keys(byPhone).map(function (k) { return byPhone[k]; }).sort(function (a, b) {
    var ta = a.lastVisit ? new Date(a.lastVisit).getTime() : 0;
    var tb = b.lastVisit ? new Date(b.lastVisit).getTime() : 0;
    return tb - ta;
  });
  try { CACHE.set('customers_v1', out, 120); } catch (ePut) { }
  return out;
}

/** Chuẩn hóa SĐT VN: 84… → 0…, 9 số → thêm 0 đầu. */
function normalizeVnPhoneDigits_(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('84') === 0 && d.length >= 10) d = '0' + d.slice(2);
  if (d.length === 9 && d.charAt(0) !== '0') d = '0' + d;
  return d;
}

function getCustomerByPhone(phone) {
  var want = normalizeVnPhoneDigits_(phone);
  if (!want || want.length < 9) return null;
  const customers = getCustomers();
  for (var i = 0; i < customers.length; i++) {
    var cp = normalizeVnPhoneDigits_(customers[i].phone);
    if (cp === want) return customers[i];
  }
  return null;
}

// lookupCustomer - POS: sau khi ensureCustomerForPos; voucher không còn list toàn bộ mã, dùng getSuggestedPromosWithContext.
function lookupCustomer(phone) {
  const customer = getCustomerByPhone(String(phone).trim());
  if (customer) {
    return {
      found: true,
      name: customer.name,
      phone: customer.phone,
      points: customer.cups || customer.points || 0,
      totalSpent: customer.totalSpent || 0,
      tier: customer.tier || 'Thành viên',
      visitCount: customer.visitCount || 0,
      vouchers: []
    };
  }
  return { found: false };
}

/** Lưu SĐT vào sheet Customers ngay khi nhập đủ số (POS). */
function ensureCustomerForPos(phone, name) {
  const p = normalizeVnPhoneDigits_(phone);
  if (p.length < 9) return { ok: false, message: 'SĐT không hợp lệ' };
  const existedBefore = !!getCustomerByPhone(p);
  const nm = String(name || '').trim();
  if (!existedBefore) {
    saveCustomer({ phone: p, name: nm || 'Khách mới' });
  } else if (nm) {
    saveCustomer({ phone: p, name: nm });
  }
  return { ok: true, isNew: !existedBefore };
}

/** Cổng hội viên: đăng ký khách mới + lưu đồng ý điều khoản / dữ liệu cá nhân. */
function registerMemberPortalCustomer(obj) {
  var o = obj && typeof obj === 'object' ? obj : {};
  var phone = normalizeVnPhoneDigits_(o.phone);
  if (!phone || phone.length < 9) throw new Error('SĐT không hợp lệ');
  if (o.acceptTerms !== true && o.acceptTerms !== 'true') throw new Error('Vui lòng đồng ý điều khoản và điều kiện');
  if (o.acceptPrivacy !== true && o.acceptPrivacy !== 'true') throw new Error('Vui lòng đồng ý cho phép dùng dữ liệu cá nhân');
  var existed = !!getCustomerByPhone(phone);
  var nm = String(o.name || '').trim() || 'Khách hàng';
  saveCustomer({ phone: phone, name: nm });
  try {
    var prof = getMemberProfile(phone);
    if (prof && prof.profile) {
      var headersDef = ['SĐT', 'Tên', 'Điểm', 'Tổng chi tiêu', 'Số lần ghé', 'Lần đầu', 'Lần cuối', 'Hạng', 'Ghi chú'];
      var sheet = getSheet('Customers', headersDef);
      _ensureCustomerExtColumns_(sheet);
      var data = sheet.getDataRange().getValues();
      var headers = data[0].map(function (h) { return String(h || '').trim(); });
      var ix = headers.indexOf('Ghi chú');
      var note = '[MEM_REG] ' + new Date().toISOString();
      if (o.acceptMarketing === true || o.acceptMarketing === 'true') note += ' | KM:co';
      for (var i = 1; i < data.length; i++) {
        if (normalizeVnPhoneDigits_(data[i][headers.indexOf('SĐT')]) === phone) {
          if (ix >= 0) sheet.getRange(i + 1, ix + 1).setValue(note);
          break;
        }
      }
    }
  } catch (eN) { Logger.log('registerMemberPortalCustomer note: ' + (eN.message || eN)); }
  return { ok: true, isNew: !existed, phone: phone };
}

/** Đếm ly từ JSON món đơn hàng. */
function _cupCountFromOrderItems_(items) {
  if (!items || !items.length) return 0;
  var n = 0;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    n += parseInt(it && it.quantity, 10) || 1;
  }
  return n;
}

/**
 * POS: tổng hợp khách theo SĐT - sheet Customers + đơn Hoàn thành (ngày/tuần/tháng).
 */
function getPosCustomerInsight(phone) {
  var p = normalizeVnPhoneDigits_(phone);
  if (!p || p.length < 9) {
    return { ok: false, message: 'SĐT không hợp lệ' };
  }
  var cust = getCustomerByPhone(p);
  var now = new Date();
  var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  var day = now.getDay() || 7;
  var startWeek = new Date(now);
  startWeek.setHours(0, 0, 0, 0);
  startWeek.setDate(startWeek.getDate() - (day - 1));
  var startMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  var orders = getOrdersByPhone(p, 500);
  var revToday = 0, cupsToday = 0, revWeek = 0, cupsWeek = 0, revMonth = 0, cupsMonth = 0;
  var completedCount = 0;
  for (var j = 0; j < orders.length; j++) {
    var o = orders[j];
    if (!_ordersCompletedStatus_(o.status)) continue;
    completedCount++;
    var t = new Date(o.time);
    if (isNaN(t.getTime())) continue;
    var amt = parseFloat(o.finalAmount) || 0;
    var cups = _cupCountFromOrderItems_(o.items);
    if (t.getTime() >= startToday.getTime()) {
      revToday += amt;
      cupsToday += cups;
    }
    if (t.getTime() >= startWeek.getTime()) {
      revWeek += amt;
      cupsWeek += cups;
    }
    if (t.getTime() >= startMonth.getTime()) {
      revMonth += amt;
      cupsMonth += cups;
    }
  }
  var isReturning = completedCount > 0;
  return {
    ok: true,
    found: !!cust,
    isReturningBuyer: isReturning,
    phoneDigits: p,
    name: cust ? String(cust.name || '') : '',
    points: cust ? (parseFloat(cust.cups || cust.points) || 0) : 0,
    totalSpent: cust ? (parseFloat(cust.totalSpent) || 0) : 0,
    tier: cust ? String(cust.tier || 'Thành viên') : 'Thành viên',
    visitCount: cust ? (parseInt(cust.visitCount, 10) || 0) : 0,
    completedOrders: completedCount,
    revenueToday: revToday,
    cupsToday: cupsToday,
    revenueWeek: revWeek,
    cupsWeek: cupsWeek,
    revenueMonth: revMonth,
    cupsMonth: cupsMonth
  };
}

/**
 * POS/Pickup: lấy thông tin khách "nhẹ" (không quét đơn Hoàn thành).
 * Dùng cho UI cần load nhanh: chỉ cần tên + SĐT (+ điểm/tier nếu có).
 */
function getPosCustomerBasic(phoneOrCode) {
  try {
    var r = resolveCustomerIdentifier(phoneOrCode);
    if (!r || !r.ok) return { ok: false, message: r && r.message ? r.message : 'Không tra cứu được' };
  return {
      ok: true,
      found: true,
      phoneDigits: r.phone,
      memberCode: r.memberCode || '',
      name: String(r.name || '').trim(),
      points: (parseFloat(r.points) || 0),
      tier: String(r.tier || 'Thành viên')
    };
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : String(e) };
  }
}

function getCompletedOrderCountByPhone(phone) {
  const p = normalizeVnPhoneDigits_(phone);
  if (!p || p.length < 9) return 0;
  const sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  if (sheet.getLastRow() < 2) return 0;
  const cmap = _ordersColumnMap_(sheet);
  const data = sheet.getDataRange().getValues().slice(1);
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const st = String(_ordersCell_(r, cmap, 'Trạng thái', 11) || '');
    if (!_ordersCompletedStatus_(st)) continue;
    if (normalizeVnPhoneDigits_(_ordersCell_(r, cmap, 'SĐT', 3)) === p) n++;
  }
  return n;
}

/** Lịch sử đơn theo SĐT (POS / tra cứu), mới nhất trước. */
function getOrdersByPhone(phone, maxRows) {
  var p = normalizeVnPhoneDigits_(phone);
  var limit = parseInt(maxRows, 10) || 40;
  if (p.length < 9) return [];
  const sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  if (sheet.getLastRow() < 2) return [];
  const cmap = _ordersColumnMap_(sheet);
  const rows = sheet.getDataRange().getValues().slice(1);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var ph = normalizeVnPhoneDigits_(_ordersCell_(rows[i], cmap, 'SĐT', 3));
    if (ph !== p) continue;
    out.push(mapOrderRow(rows[i], cmap));
  }
  out.sort(function (a, b) {
    return new Date(b.time).getTime() - new Date(a.time).getTime();
  });
  return out.slice(0, limit);
}

/** Pickup: lịch sử đơn theo SĐT, chỉ lấy đơn có tag [PICKUP]. */
function getPickupOrdersByPhone(phone, maxRows) {
  var list = getOrdersByPhone(phone, maxRows || 80) || [];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].note || '').indexOf('[PICKUP') >= 0) out.push(list[i]);
  }
  return out.slice(0, parseInt(maxRows, 10) || 40);
}

/**
 * Đếm đơn Hoàn thành có dùng mã KM (theo SĐT). ruleConfig:
 * maxUsesPerCustomerLifetime, maxUsesPerCustomerPerDay, maxTotalCupsWithPromoPerCustomer
 */
function _countPromoUsesForPhone_(phoneDigits, promoCodeUpper) {
  var p = normalizeVnPhoneDigits_(phoneDigits);
  var codeU = String(promoCodeUpper || '').trim().toUpperCase();
  var out = { lifetime: 0, today: 0, cupCount: 0 };
  if (!p || p.length < 9 || !codeU) return out;
  const sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  if (sheet.getLastRow() < 2) return out;
  const cmap = _ordersColumnMap_(sheet);
  const data = sheet.getDataRange().getValues().slice(1);
  var now = new Date();
  var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (!_ordersCompletedStatus_(_ordersCell_(r, cmap, 'Trạng thái', 11))) continue;
    var ph = normalizeVnPhoneDigits_(_ordersCell_(r, cmap, 'SĐT', 3));
    if (ph !== p) continue;
    var pc = String(_ordersCell_(r, cmap, 'Mã KM', 12) || '').trim().toUpperCase();
    if (pc !== codeU) continue;
    out.lifetime++;
    var t = _parseOrderDate_(_ordersCell_(r, cmap, 'Thời gian', 1));
    if (t >= startToday) out.today++;
    try {
      var raw = _ordersCell_(r, cmap, 'Các món', 5);
      var items = typeof raw === 'string' && raw ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
      for (var j = 0; j < items.length; j++) {
        out.cupCount += (parseInt(items[j].quantity, 10) || 1);
      }
    } catch (eI) { }
  }
  return out;
}

/**
 * Gợi ý KM theo SĐT + giỏ (chỉ sau khi khách nhập SĐT).
 * cartJson: JSON [{ id, quantity, ... }]
 */
function getSuggestedPromosWithContext(phone, customerName, cartJson, subtotal, includeAutoApply) {
  const allowAuto = includeAutoApply === true || includeAutoApply === 'true';
  const p = normalizeVnPhoneDigits_(phone);
  if (p.length < 9) return { suggestions: [], autoApplyCode: '', message: 'Nhập đủ SĐT để nhận gợi ý' };

  let cart = [];
  try {
    cart = JSON.parse(String(cartJson || '[]'));
  } catch (e) {
    cart = [];
  }
  let cupCount = 0;
  cart.forEach(function (it) {
    cupCount += (parseInt(it.quantity, 10) || 1);
  });

  const cust = getCustomerByPhone(p);
  const visitCount = cust ? (parseFloat(cust.visitCount) || 0) : 0;
  const completed = getCompletedOrderCountByPhone(p);
  const points = cust ? (parseFloat(cust.points) || 0) : 0;
  const promos = getPromotions();
  const suggestions = [];
  let autoApplyCode = '';

  function parseCfg(promo) {
    if (!promo.ruleConfig) return {};
    if (typeof promo.ruleConfig === 'object') return promo.ruleConfig;
    try {
      return JSON.parse(String(promo.ruleConfig || '{}'));
    } catch (e2) {
      return {};
    }
  }

  promos.forEach(function (promo) {
    const rt = String(promo.ruleType || '').trim().toLowerCase();
    if (!rt || rt === 'manual') return;

    if (rt === 'holiday_note') {
      const cfg = parseCfg(promo);
      suggestions.push({
        code: promo.code,
        name: promo.name,
        reason: cfg.message || cfg.giftNote || promo.name,
        type: 'info'
      });
      return;
    }

    if (rt === 'new_customer') {
      if (completed === 0) {
        suggestions.push({ code: promo.code, name: promo.name, reason: 'Dành cho khách hàng mới (chưa có đơn Hoàn thành)', type: 'promo' });
        if (!autoApplyCode && (promo.type === 'percent' || promo.type === 'fixed')) autoApplyCode = promo.code;
      }
      return;
    }

    if (rt === 'repeat_2nd_cup') {
      const cfg = parseCfg(promo);
      const minCups = cfg.minCups != null ? parseInt(cfg.minCups, 10) : 2;
      if (completed >= 1 && cupCount >= minCups) {
        suggestions.push({ code: promo.code, name: promo.name, reason: 'Khách quay lại - đủ ' + minCups + ' ly trong giỏ', type: 'promo' });
      }
      return;
    }

    if (rt === 'points_redeem_hint') {
      if (points >= 10) {
        const cfg = parseCfg(promo);
        const rc = cfg.redeemCode || 'FREECUP';
        suggestions.push({
          code: rc,
          name: 'Đổi 10 điểm → 1 ly nhỏ',
          reason: 'Bạn đang có ' + Math.floor(points) + ' điểm (10 điểm = 1 ly size nhỏ)',
          type: 'promo'
        });
      }
      return;
    }

    if (rt === 'buy2get1_any' || rt === 'buy2get1') {
      if (cupCount >= 2) {
        suggestions.push({ code: promo.code, name: promo.name, reason: 'Giỏ có từ 2 ly - xem điều kiện mã', type: 'promo' });
      }
      return;
    }

    if (rt === 'buy1get1_same') {
      let hasDouble = false;
      cart.forEach(function (it) {
        if ((parseInt(it.quantity, 10) || 1) >= 2) hasDouble = true;
      });
      if (hasDouble) {
        suggestions.push({ code: promo.code, name: promo.name, reason: 'Cùng loại từ 2 ly trong một dòng', type: 'promo' });
      }
    }
  });

  if (!allowAuto) {
    autoApplyCode = '';
  }
  return { suggestions: suggestions, autoApplyCode: autoApplyCode, visitCount: visitCount, completedOrders: completed, cupCount: cupCount, points: points };
}

/**
 * POS: danh sách ưu đãi có thể tick (kèm mức giảm ước tính sau validate).
 */
function getCheckoutPromoOptions(phone, cartJson, subtotal) {
  var sub = parseFloat(subtotal) || 0;
  var cartStr = String(cartJson || '[]');
  var p = String(phone || '').replace(/\D/g, '');
  var options = [];
  var seen = {};
  var sug = getSuggestedPromosWithContext(p, '', cartStr, sub, false);
  (sug.suggestions || []).forEach(function (s) {
    if (!s || !s.code || seen[s.code]) return;
    if (s.type === 'info') {
      options.push({ code: s.code, title: s.name, subtitle: s.reason, kind: 'info', discount: 0 });
      seen[s.code] = true;
      return;
    }
    var v = validatePromo(s.code, sub, p, cartStr);
    if (!v.valid) return;
    seen[s.code] = true;
    options.push({ code: s.code, title: s.name, subtitle: s.reason || v.message, kind: 'promo', discount: v.discount });
  });
  getPromotions().forEach(function (pr) {
    var rt = String(pr.ruleType || '').trim().toLowerCase();
    if (!pr || !pr.code || seen[pr.code]) return;
    if (rt && rt !== 'manual') return;
    if (pr.type === 'info') return;
    var v = validatePromo(pr.code, sub, p, cartStr);
    if (!v.valid) return;
    seen[pr.code] = true;
    options.push({ code: pr.code, title: pr.name, subtitle: v.message, kind: 'promo', discount: v.discount });
  });
  return { options: options };
}

/**
 * Admin: tạo nhanh CTKM mẫu (30 ngày). Gồm kịch bản gợi ý + quy tắc POS (manual / giờ vàng / combo bậc / lương về / VIP…).
 * templateId: xem object presets (flash_sale_golden, combo_bulk_tier, …).
 */
function applyPromoTemplate(templateId) {
  var id = String(templateId || '').trim().toLowerCase();
  var now = new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var end = new Date(start.getTime());
  end.setDate(end.getDate() + 30);
  function ymd(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  var s = ymd(start);
  var e = ymd(end);
  var suffix = String(now.getTime()).slice(-4);
  var presets = {
    new_customer: { code: 'NEW' + suffix, name: 'Khách mới giảm 20%', type: 'percent', value: 20, minOrder: 0, startDate: s, endDate: e, ruleType: 'new_customer', ruleConfigJson: '{}' },
    repeat_cup: { code: 'BACK' + suffix, name: 'Khách quay lại - từ ly thứ 2', type: 'percent', value: 10, minOrder: 0, startDate: s, endDate: e, ruleType: 'repeat_2nd_cup', ruleConfigJson: '{"minCups":2}' },
    points_redeem: { code: 'PTS' + suffix, name: 'Gợi ý đổi điểm (10 điểm)', type: 'percent', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'points_redeem_hint', ruleConfigJson: '{"redeemCode":"FREECUP"}' },
    buy2: { code: 'B2G1' + suffix, name: 'Mua 2 ly - giảm theo CTKM', type: 'fixed', value: 15000, minOrder: 50000, startDate: s, endDate: e, ruleType: 'buy2get1_any', ruleConfigJson: '{}' },
    bogo_same: { code: 'SAME2' + suffix, name: '2 ly cùng loại (cùng dòng)', type: 'percent', value: 15, minOrder: 0, startDate: s, endDate: e, ruleType: 'buy1get1_same', ruleConfigJson: '{}' },
    happy_hour: { code: 'HAPPY' + suffix, name: 'Happy hour 10%', type: 'percent', value: 10, minOrder: 0, startDate: s, endDate: e, ruleType: 'manual', ruleConfigJson: '{}' },
    holiday_info: { code: 'LE' + suffix, name: 'Thông báo CTKM lễ', type: 'info', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'holiday_note', ruleConfigJson: '{"message":"Tặng kèm - chỉnh JSON trong sheet."}' },
    flash_sale_golden: { code: 'FSGV' + suffix, name: 'Flash Sale Giờ Vàng (-40% khung 12–14h & 20–22h)', type: 'percent', value: 40, minOrder: 0, startDate: s, endDate: e, ruleType: 'happy_hours', ruleConfigJson: '{"windows":[{"startHour":12,"endHour":14},{"startHour":20,"endHour":22}],"msg":"2H DUY NHẤT - HẾT LÀ HẾT"}' },
    combo_bulk_tier: { code: 'CBULK' + suffix, name: 'Combo: 3 ly -10% / 5 ly -20%', type: 'percent', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'combo_qty_tiers', ruleConfigJson: '{"tiers":[{"minQty":5,"percent":20},{"minQty":3,"percent":10}]}' },
    payday_salary: { code: 'PAY25' + suffix, name: 'Ngày lương về (-25% ngày 25→hết tháng & 1–5)', type: 'percent', value: 25, minOrder: 0, startDate: s, endDate: e, ruleType: 'payday_month', ruleConfigJson: '{"paydayStart":25,"paydayEnd":5,"msg":"Lương về - sống healthy liền"}' },
    voucher_new_ads: { code: 'NEWADS' + suffix, name: 'Voucher khách mới -20% (Ads→chatbot)', type: 'percent', value: 20, minOrder: 0, startDate: s, endDate: e, ruleType: 'new_customer', ruleConfigJson: '{"flow":"Ads→chatbot→mã","tip":"Yêu cầu follow page"}' },
    freeship_threshold: { code: 'SHIP' + suffix, name: 'Freeship (giảm 15k phí ship - mô phỏng)', type: 'fixed', value: 15000, minOrder: 150000, startDate: s, endDate: e, ruleType: 'manual', ruleConfigJson: '{"insight":"Khách nhạy phí ship","dieuKienDonToiThieu":150000}' },
    group_buy_three: { code: 'GB3' + suffix, name: 'Kịch bản: Mua chung 3 người -30% (vận hành thủ công)', type: 'info', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'playbook_note', ruleConfigJson: '{"scenario":"Group buying 3 người","ops":"Ghi nhận nhóm thủ công / CRM"}' },
    minigame_social: { code: 'GAME' + suffix, name: 'Mini game social (playbook)', type: 'info', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'playbook_note', ruleConfigJson: '{"scenario":"Comment thời điểm uống - tặng combo","goal":"Reach + tương tác"}' },
    sampling_offline: { code: 'SAMP' + suffix, name: 'Sampling offline + QR voucher', type: 'info', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'playbook_note', ruleConfigJson: '{"noi":"Siêu thị / gym / VP","kem":"QR nhận voucher"}' },
    checkin_fb: { code: 'CHK' + suffix, name: 'Check-in Facebook nhận quà', type: 'info', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'playbook_note', ruleConfigJson: '{"flow":"Chụp hình + đăng FB","qua":"1 chai miễn phí"}' },
    challenge_7days: { code: 'C7' + suffix, name: 'Challenge 7 ngày healthy (UGC)', type: 'info', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'playbook_note', ruleConfigJson: '{"concept":"Uống 7 ngày + check-in","ketQua":"UGC"}' },
    review_reward: { code: 'REV30' + suffix, name: 'Review có quà - voucher 30k (POS áp tay)', type: 'fixed', value: 30000, minOrder: 80000, startDate: s, endDate: e, ruleType: 'manual', ruleConfigJson: '{"flow":"Mua→ảnh→review","qua":"30k"}' },
    kol_template: { code: 'KOL' + suffix, name: 'KOL / Micro-influencer (playbook)', type: 'info', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'playbook_note', ruleConfigJson: '{"segment":"fitness / mẹ bỉm / VP","content":"Thay cà phê bằng sữa hạt"}' },
    livestream_prime: { code: 'LIVE' + suffix, name: 'Livestream - giá sốc (19–21h)', type: 'percent', value: 12, minOrder: 0, startDate: s, endDate: e, ruleType: 'happy_hours', ruleConfigJson: '{"windows":[{"startHour":19,"endHour":21}],"uuDai":"Giá tốt trên live"}' },
    loyalty_points_pack: { code: 'LOY' + suffix, name: 'Tích điểm đổi quà (Zalo/OA - playbook)', type: 'info', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'playbook_note', ruleConfigJson: '{"rule":"1 hộp=1 điểm; 10 điểm=1 lốc","tool":"Zalo OA / CRM"}' },
    subscription_pack: { code: 'SUB' + suffix, name: 'Gói subscription 7–30 ngày (playbook)', type: 'info', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'playbook_note', ruleConfigJson: '{"uuDai":"Giảm 10–15%","insight":"Lười đặt lại"}' },
    second_order_hot: { code: 'ORD2' + suffix, name: 'Mua lần 2 giảm 30%', type: 'percent', value: 30, minOrder: 0, startDate: s, endDate: e, ruleType: 'second_order', ruleConfigJson: '{"kichHoat":"SMS/Zalo sau đơn 1"}' },
    family_combo_pack: { code: 'FAM' + suffix, name: 'Combo gia đình (bậc số ly)', type: 'percent', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'combo_qty_tiers', ruleConfigJson: '{"tiers":[{"minQty":6,"percent":25},{"minQty":4,"percent":20}]}' },
    winback_7d: { code: 'WB7' + suffix, name: 'Chăm sóc sau 7 ngày (playbook)', type: 'info', value: 0, minOrder: 0, startDate: s, endDate: e, ruleType: 'playbook_note', ruleConfigJson: '{"noiDung":"Bạn đã hết sữa chưa?","kenh":"SMS/Zalo"}' },
    birthday_treat: { code: 'SN' + suffix, name: 'Sinh nhật KH - giảm 30% (POS kiểm tra tay)', type: 'percent', value: 30, minOrder: 0, startDate: s, endDate: e, ruleType: 'manual', ruleConfigJson: '{"canhBao":"Cần xác minh ngày sinh ngoài POS"}' },
    vip_high_ltv: { code: 'VIP' + suffix, name: 'Khách VIP (chi tiêu tích lũy ≥ 2.000.000đ)', type: 'percent', value: 8, minOrder: 0, startDate: s, endDate: e, ruleType: 'vip_ltv', ruleConfigJson: '{"minLifetimeSpend":2000000}' },
    group_order_5: { code: 'NHOM5', name: 'Ưu đãi đơn nhóm -5%', type: 'percent', value: 5, minOrder: 0, startDate: s, endDate: e, ruleType: 'group_order', ruleConfigJson: '{"percent":5}' },
    group_order_10: { code: 'NHOM10', name: 'Ưu đãi đơn nhóm -10%', type: 'percent', value: 10, minOrder: 0, startDate: s, endDate: e, ruleType: 'group_order', ruleConfigJson: '{"percent":10}' },
    group_order_15: { code: 'NHOM15', name: 'Ưu đãi đơn nhóm -15%', type: 'percent', value: 15, minOrder: 0, startDate: s, endDate: e, ruleType: 'group_order', ruleConfigJson: '{"percent":15}' },
    feedback_reward_5: { code: 'GOPY5', name: 'Voucher góp ý -5% (hạn 7 ngày)', type: 'percent', value: 5, minOrder: 0, startDate: s, endDate: e, ruleType: 'feedback_reward', ruleConfigJson: '{"percent":5,"validDays":7}' }
  };
  var data = presets[id];
  if (!data) return { ok: false, message: 'Không có mẫu: ' + id };
  savePromotion(data);
  return { ok: true, message: 'Đã tạo mã ' + data.code, code: data.code };
}

function saveCustomer(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheet("Customers", ["SĐT", "Tên", "Điểm", "Tổng chi tiêu", "Số lần ghé", "Lần đầu", "Lần cuối", "Hạng", "Ghi chú"]);
  const phone = normalizeVnPhoneDigits_(data.phone);
  if (phone.length < 9) {
    return { ok: false, message: 'Số điện thoại không hợp lệ (cần ít nhất 9 chữ số)' };
  }
  const existing = sheet.getDataRange().getValues();
  for (let i = 1; i < existing.length; i++) {
    if (normalizeVnPhoneDigits_(existing[i][0]) === phone) {
      existing[i][1] = data.name != null && String(data.name).trim() !== '' ? String(data.name).trim() : existing[i][1];
      existing[i][8] = data.note != null ? String(data.note) : existing[i][8];
      var row9 = existing[i].slice(0, 9);
      while (row9.length < 9) row9.push('');
      sheet.getRange(i + 1, 1, 1, 9).setValues([row9]);
      CACHE.clear('customers_v1');
      return { ok: true, message: 'Đã cập nhật khách hàng!' };
    }
  }
  sheet.appendRow([phone, (data.name && String(data.name).trim()) ? String(data.name).trim() : 'Khách hàng', 0, 0, 0, new Date(), new Date(), 'Thành viên', data.note != null ? String(data.note) : '']);
  CACHE.clear('customers_v1');
  return { ok: true, message: 'Đã thêm khách hàng mới!' };
}

function addLoyaltyPoints(phone, cups, amount) {
  const headersDef = ["SĐT", "Tên", "Điểm", "Tổng chi tiêu", "Số lần ghé", "Lần đầu", "Lần cuối", "Hạng", "Ghi chú"];
  const sheet = getSheet("Customers", headersDef);
  var want = normalizeVnPhoneDigits_(phone);
  if (!want || want.length < 9) return;
  var cupsAdd = Math.max(0, parseInt(cups, 10) || 0);
  var amtAdd = parseFloat(amount) || 0;
  if (cupsAdd <= 0 && amtAdd <= 0) return;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits_(data[i][0]) === want) {
      const newCups = (parseInt(data[i][2]) || 0) + cupsAdd;
      const newSpent = (parseFloat(data[i][3]) || 0) + amtAdd;
      const newVisits = (parseInt(data[i][4], 10) || 0) + 1;
      const tier = newCups >= 50 ? 'Vàng' : newCups >= 20 ? 'Bạc' : 'Thành viên';
      var firstVisit = data[i][5];
      if (!firstVisit || firstVisit === '') firstVisit = new Date();
      sheet.getRange(i + 1, 3, 1, 5).setValues([[newCups, newSpent, newVisits, firstVisit, new Date()]]);
      sheet.getRange(i + 1, 8).setValue(tier);
      CACHE.clear('customers_v1');
      return;
    }
  }
  var nm = 'Khách hàng';
  var tier0 = cupsAdd >= 50 ? 'Vàng' : cupsAdd >= 20 ? 'Bạc' : 'Thành viên';
  sheet.appendRow([want, nm, cupsAdd, amtAdd, 1, new Date(), new Date(), tier0, '']);
  CACHE.clear('customers_v1');
}

function redeemPoints(phone, cupsToRedeem) {
  const headersDef = ["SĐT", "Tên", "Điểm", "Tổng chi tiêu", "Số lần ghé", "Lần đầu", "Lần cuối", "Hạng", "Ghi chú"];
  const sheet = getSheet("Customers", headersDef);
  var want = normalizeVnPhoneDigits_(phone);
  if (!want || want.length < 9) return { success: false, message: 'SĐT không hợp lệ' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits_(data[i][0]) === want) {
      if (data[i][2] < cupsToRedeem) return { success: false, message: 'Không đủ ly tích luỹ!' };
      sheet.getRange(i + 1, 3).setValue(Math.max(0, data[i][2] - cupsToRedeem));
      return { success: true, message: `Đã đổi ${cupsToRedeem} ly = 1 ly miễn phí` };
    }
  }
  return { success: false, message: 'Không tìm thấy khách hàng' };
}

// ============================================================
// 6. KHUYẾN MÃI
// ============================================================
function getPromotions() {
  const cached = CACHE.get('promotions_v2');
  if (cached) return cached;

  const headersDef = ["Mã KM", "Tên", "Loại", "Giá trị", "Đơn tối thiểu", "Bắt đầu", "Kết thúc", "Kích hoạt"];
  const sheet = getSheet("Promotions", headersDef);
  ensurePromotionsExtraColumns(sheet);
  if (sheet.getLastRow() < 2) return [];

  const all = sheet.getDataRange().getValues();
  const headers = all[0];
  const ix = (name) => headers.indexOf(name);
  const colCode = ix('Mã KM');
  const colRule = ix('Quy tắc');
  const colCfg = ix('Cấu hình JSON');
  const safeNum = (v) => isNaN(parseFloat(v)) ? 0 : parseFloat(v);
  const safeDate = (v) => (v instanceof Date && !isNaN(v.getTime())) ? v.toISOString() : String(v || '');

  const result = all.slice(1).filter(function (r) {
    return r[colCode] && String(r[colCode]).trim() !== '';
  }).map(function (r) {
    let ruleConfig = {};
    if (colCfg > -1 && r[colCfg]) {
      try {
        ruleConfig = JSON.parse(String(r[colCfg]));
      } catch (e) {
        ruleConfig = {};
      }
    }
    const activeCol = ix('Kích hoạt');
    const active = activeCol > -1 ? (r[activeCol] !== false && String(r[activeCol]).trim().toUpperCase() !== 'FALSE') : true;
    return {
      code: String(r[ix('Mã KM')] || ''),
      name: String(r[ix('Tên')] || ''),
      type: String(r[ix('Loại')] || ''),
      value: safeNum(r[ix('Giá trị')]),
      minOrder: safeNum(r[ix('Đơn tối thiểu')]),
      startDate: safeDate(r[ix('Bắt đầu')]),
      endDate: safeDate(r[ix('Kết thúc')]),
      active: active,
      ruleType: colRule > -1 ? String(r[colRule] || '').trim() : '',
      ruleConfig: ruleConfig
    };
  }).filter(function (p) {
    return p.active;
  });

  CACHE.set('promotions_v2', result, 1800);
  return result;
}

/** Admin: mọi dòng CTKM (kể cả tắt) - không dùng cache POS. */
function getPromotionsAdmin() {
  const headersDef = ['Mã KM', 'Tên', 'Loại', 'Giá trị', 'Đơn tối thiểu', 'Bắt đầu', 'Kết thúc', 'Kích hoạt'];
  const sheet = getSheet('Promotions', headersDef);
  ensurePromotionsExtraColumns(sheet);
  if (sheet.getLastRow() < 2) return [];
  const all = sheet.getDataRange().getValues();
  const headers = all[0];
  const ix = function (name) { return headers.indexOf(name); };
  const colCode = ix('Mã KM');
  const colRule = ix('Quy tắc');
  const colCfg = ix('Cấu hình JSON');
  const safeNum = function (v) { return isNaN(parseFloat(v)) ? 0 : parseFloat(v); };
  const safeDate = function (v) { return (v instanceof Date && !isNaN(v.getTime())) ? v.toISOString() : String(v || ''); };
  return all.slice(1).filter(function (r) {
    return r[colCode] && String(r[colCode]).trim() !== '';
  }).map(function (r) {
    let ruleConfig = {};
    if (colCfg > -1 && r[colCfg]) {
      try {
        ruleConfig = JSON.parse(String(r[colCfg]));
      } catch (e) {
        ruleConfig = {};
      }
    }
    const activeCol = ix('Kích hoạt');
    const active = activeCol > -1 ? (r[activeCol] !== false && String(r[activeCol]).trim().toUpperCase() !== 'FALSE') : true;
    return {
      code: String(r[ix('Mã KM')] || ''),
      name: String(r[ix('Tên')] || ''),
      type: String(r[ix('Loại')] || ''),
      value: safeNum(r[ix('Giá trị')]),
      minOrder: safeNum(r[ix('Đơn tối thiểu')]),
      startDate: safeDate(r[ix('Bắt đầu')]),
      endDate: safeDate(r[ix('Kết thúc')]),
      active: active,
      ruleType: colRule > -1 ? String(r[colRule] || '').trim() : '',
      ruleConfig: ruleConfig
    };
  });
}

/** Ước tính hiệu quả KM: tổng giảm giá & doanh thu theo mã (theo kỳ getOrders). */
function getPromoImpactSummary(periodType) {
  var orders = getOrders(periodType || 'month');
  var map = {};
  var totalDisc = 0;
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var c = String(o.promoCode || '').trim().toUpperCase();
    if (!c) continue;
    var d = parseFloat(o.discount) || 0;
    totalDisc += d;
    if (!map[c]) map[c] = { code: c, orders: 0, promoDiscount: 0, revenue: 0 };
    map[c].orders += 1;
    map[c].promoDiscount += d;
    map[c].revenue += parseFloat(o.finalAmount) || 0;
  }
  var lines = [];
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) lines.push(map[k]);
  }
  lines.sort(function (a, b) { return b.promoDiscount - a.promoDiscount; });
  return {
    period: periodType || 'month',
    totalPromoDiscount: totalDisc,
    lines: lines,
    note: 'Chi phí KM ≈ tổng giảm giá ghi trên đơn; LN thực tế = doanh thu − vốn (xem tab Giá / báo cáo).'
  };
}

function validatePromo(code, orderAmount, customerPhone, cartJson) {
  const promos = getPromotions();
  const now = new Date();
  const promo = promos.find(function (p) {
    return p.code.toUpperCase() === String(code || '').trim().toUpperCase() && p.active;
  });

  if (!promo) {
    // Không phải mã trong Promotions -> thử voucher góp ý (GYxxxx, hạn 7 ngày, dùng 1 lần)
    var fbv = _validateFeedbackVoucher_(code, orderAmount);
    if (fbv) return fbv;
    return { valid: false, message: 'Mã không hợp lệ!' };
  }
  var rtEarly = String(promo.ruleType || '').trim().toLowerCase();
  if (promo.type === 'info' || rtEarly === 'holiday_note' || rtEarly === 'playbook_note') {
    return { valid: false, message: 'Mã này chỉ để tham khảo CTKM - không giảm giá tự động.' };
  }
  if (rtEarly === 'group_order' || rtEarly === 'feedback_reward') {
    return { valid: false, message: 'Đây là mã cấu hình hệ thống (đơn nhóm / voucher góp ý) - hệ thống tự áp dụng, không nhập trực tiếp.' };
  }
  if (promo.startDate && new Date(promo.startDate) > now) return { valid: false, message: 'Chưa đến ngày áp dụng!' };
  if (promo.endDate && new Date(promo.endDate) < now) return { valid: false, message: 'Mã đã hết hạn!' };
  if (promo.minOrder && orderAmount < promo.minOrder) return { valid: false, message: 'Đơn tối thiểu ' + promo.minOrder.toLocaleString('vi-VN') + 'đ!' };

  const phone = normalizeVnPhoneDigits_(customerPhone);
  const rt = String(promo.ruleType || '').trim().toLowerCase();

  var rcLim = promo.ruleConfig || {};
  var maxLifeU = parseInt(rcLim.maxUsesPerCustomerLifetime, 10);
  var maxDayU = parseInt(rcLim.maxUsesPerCustomerPerDay, 10);
  var maxCupsU = parseInt(rcLim.maxTotalCupsWithPromoPerCustomer, 10);
  var needPhoneLimit = (!isNaN(maxLifeU) && maxLifeU > 0) || (!isNaN(maxDayU) && maxDayU > 0) || (!isNaN(maxCupsU) && maxCupsU > 0);
  if (needPhoneLimit && phone.length < 9) {
    return { valid: false, message: 'Nhập SĐT để kiểm tra giới hạn lượt dùng mã này!' };
  }
  if (phone.length >= 9 && promo.code) {
    var usage = _countPromoUsesForPhone_(phone, promo.code);
    if (!isNaN(maxLifeU) && maxLifeU > 0 && usage.lifetime >= maxLifeU) {
      return { valid: false, message: 'Bạn đã dùng hết lượt mã này (tối đa ' + maxLifeU + ' đơn).' };
    }
    if (!isNaN(maxDayU) && maxDayU > 0 && usage.today >= maxDayU) {
      return { valid: false, message: 'Đã dùng đủ lượt mã trong hôm nay (tối đa ' + maxDayU + ').' };
    }
    if (!isNaN(maxCupsU) && maxCupsU > 0) {
      var cartNow = [];
      try {
        cartNow = JSON.parse(String(cartJson || '[]'));
      } catch (eC) {
        cartNow = [];
      }
      var cupsNow = 0;
      cartNow.forEach(function (it) {
        cupsNow += (parseInt(it.quantity, 10) || 1);
      });
      if (usage.cupCount + cupsNow > maxCupsU) {
        return { valid: false, message: 'Vượt giới hạn tổng số ly áp mã này (tối đa ' + maxCupsU + ' ly đã dùng + giỏ hiện tại).' };
      }
    }
  }

  if (rt === 'new_customer') {
    if (phone.length < 9) {
      return { valid: false, message: 'Nhập SĐT để áp mã khách hàng mới!' };
    }
    if (getCompletedOrderCountByPhone(phone) > 0) {
      return { valid: false, message: 'Mã chỉ dành cho khách hàng mới!' };
    }
  }

  if (rt === 'repeat_2nd_cup') {
    if (phone.length < 9) {
      return { valid: false, message: 'Nhập SĐT để áp mã này!' };
    }
    const minCups = (promo.ruleConfig && promo.ruleConfig.minCups != null) ? parseInt(promo.ruleConfig.minCups, 10) : 2;
    let cart = [];
    try {
      cart = JSON.parse(String(cartJson || '[]'));
    } catch (e) {
      cart = [];
    }
    let cups = 0;
    cart.forEach(function (it) {
      cups += (parseInt(it.quantity, 10) || 1);
    });
    if (getCompletedOrderCountByPhone(phone) < 1 || cups < minCups) {
      return { valid: false, message: 'Cần là khách quay lại và có ít nhất ' + minCups + ' ly trong giỏ!' };
    }
  }

  if (rt === 'buy2get1_any' || rt === 'buy2get1') {
    let cart = [];
    try {
      cart = JSON.parse(String(cartJson || '[]'));
    } catch (e2) {
      cart = [];
    }
    let cups = 0;
    cart.forEach(function (it) {
      cups += (parseInt(it.quantity, 10) || 1);
    });
    if (cups < 2) return { valid: false, message: 'Cần ít nhất 2 ly trong giỏ để dùng mã này!' };
  }

  if (rt === 'buy1get1_same') {
    let ok = false;
    let cart = [];
    try {
      cart = JSON.parse(String(cartJson || '[]'));
    } catch (e3) {
      cart = [];
    }
    cart.forEach(function (it) {
      if ((parseInt(it.quantity, 10) || 1) >= 2) ok = true;
    });
    if (!ok) return { valid: false, message: 'Cần ít nhất 2 ly cùng loại (cùng dòng) trong giỏ!' };
  }

  if (rt === 'happy_hours') {
    var wins = promo.ruleConfig && promo.ruleConfig.windows;
    if (wins && wins.length) {
      var h = now.getHours();
      var okh = false;
      for (var wi = 0; wi < wins.length; wi++) {
        var w = wins[wi];
        var sh = parseInt(w.startHour, 10);
        var eh = parseInt(w.endHour, 10);
        if (isNaN(sh) || isNaN(eh)) continue;
        if (sh <= eh) {
          if (h >= sh && h < eh) okh = true;
        } else {
          if (h >= sh || h < eh) okh = true;
        }
      }
      if (!okh) return { valid: false, message: 'Chỉ áp dụng trong khung giờ CTKM (giờ vàng)!' };
    }
  }

  if (rt === 'payday_month') {
    var d0 = now.getDate();
    var ps = (promo.ruleConfig && promo.ruleConfig.paydayStart != null) ? parseInt(promo.ruleConfig.paydayStart, 10) : 25;
    var pe = (promo.ruleConfig && promo.ruleConfig.paydayEnd != null) ? parseInt(promo.ruleConfig.paydayEnd, 10) : 5;
    if (!(d0 >= ps || d0 <= pe)) {
      return { valid: false, message: 'Mã chỉ dùng đợt lương về (từ ngày ' + ps + ' đến hết tháng & đầu tháng đến ngày ' + pe + ')!' };
    }
  }

  if (rt === 'second_order') {
    if (phone.length < 9) return { valid: false, message: 'Nhập SĐT để áp mã mua lần 2!' };
    if (getCompletedOrderCountByPhone(phone) < 1) {
      return { valid: false, message: 'Mã dành cho khách đã có ít nhất 1 đơn hoàn thành trước đó!' };
    }
  }

  if (rt === 'vip_ltv') {
    var minL = (promo.ruleConfig && promo.ruleConfig.minLifetimeSpend != null) ? parseFloat(promo.ruleConfig.minLifetimeSpend) : 0;
    if (phone.length < 9) return { valid: false, message: 'Nhập SĐT để xác nhận VIP!' };
    var custV = getCustomerByPhone(phone);
    if (!custV || (custV.totalSpent || 0) < minL) {
      return { valid: false, message: 'Mã chỉ dành cho khách tích lũy chi tiêu từ ' + minL.toLocaleString('vi-VN') + 'đ!' };
    }
  }

  if (rt === 'combo_qty_tiers') {
    var cartT = [];
    try {
      cartT = JSON.parse(String(cartJson || '[]'));
    } catch (eT) {
      cartT = [];
    }
    var cupsT = 0;
    cartT.forEach(function (it) {
      cupsT += (parseInt(it.quantity, 10) || 1);
    });
    var tiers = (promo.ruleConfig && promo.ruleConfig.tiers) ? promo.ruleConfig.tiers : [];
    var sorted = tiers.slice().sort(function (a, b) {
      return (parseInt(b.minQty, 10) || 0) - (parseInt(a.minQty, 10) || 0);
    });
    var bestP = 0;
    for (var ti = 0; ti < sorted.length; ti++) {
      var mq = parseInt(sorted[ti].minQty, 10) || 0;
      var pc = parseFloat(sorted[ti].percent) || 0;
      if (mq > 0 && cupsT >= mq && pc > 0) {
        bestP = pc;
        break;
      }
    }
    if (!bestP) return { valid: false, message: 'Chưa đủ số ly / lốc theo bậc combo!' };
    var discountTier = Math.round(orderAmount * bestP / 100);
    return { valid: true, discount: discountTier, message: 'Combo - giảm ' + bestP + '% (ước ' + discountTier.toLocaleString('vi-VN') + 'đ)' };
  }

  let discount = 0;
  if (promo.type === 'percent') discount = Math.round(orderAmount * promo.value / 100);
  else if (promo.type === 'fixed') discount = promo.value;

  return { valid: true, discount: discount, message: 'Áp dụng "' + promo.name + '" - Giảm ' + discount.toLocaleString('vi-VN') + 'đ' };
}

/** POS: áp mã - truyền SĐT + cart JSON để kiểm tra quy tắc. */
function applyPromoCode(code, orderAmount, customerPhone, cartJson) {
  const v = validatePromo(String(code || '').trim(), parseFloat(orderAmount) || 0, customerPhone, cartJson);
  if (!v.valid) return { ok: false, discount: 0, message: v.message };
  return { ok: true, discount: v.discount || 0, message: v.message };
}

function savePromotion(data) {
  const sheet = getSheet("Promotions", ["Mã KM", "Tên", "Loại", "Giá trị", "Đơn tối thiểu", "Bắt đầu", "Kết thúc", "Kích hoạt"]);
  ensurePromotionsExtraColumns(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const ruleType = String(data.ruleType || '').trim();
  let ruleJson = String(data.ruleConfigJson || '').trim();
  if (!ruleJson) ruleJson = '{}';
  try {
    JSON.parse(ruleJson);
  } catch (e) {
    ruleJson = '{}';
  }
  var activeCell = !(data.active === false || String(data.active).toUpperCase() === 'FALSE' || data.active === 0);
  const rowObj = {
    'Mã KM': data.code,
    'Tên': data.name,
    'Loại': data.type,
    'Giá trị': data.value,
    'Đơn tối thiểu': data.minOrder || 0,
    'Bắt đầu': data.startDate || '',
    'Kết thúc': data.endDate || '',
    'Kích hoạt': activeCell,
    'Quy tắc': ruleType,
    'Cấu hình JSON': ruleJson
  };
  const row = headers.map(function (h) {
    return rowObj[h] !== undefined ? rowObj[h] : '';
  });
  var colCodeIx = headers.indexOf('Mã KM');
  if (colCodeIx < 0) colCodeIx = 0;
  var codeNorm = String(data.code || '').trim().toUpperCase();
  var lastR = sheet.getLastRow();
  var updated = false;
  for (var rr = 2; rr <= lastR; rr++) {
    var cv = String(sheet.getRange(rr, colCodeIx + 1).getValue() || '').trim().toUpperCase();
    if (cv === codeNorm) {
      sheet.getRange(rr, 1, 1, headers.length).setValues([row]);
      updated = true;
      break;
    }
  }
  if (!updated) sheet.appendRow(row);
  CACHE.clear(['promotions', 'promotions_v2']);
  return updated ? 'Đã cập nhật khuyến mãi!' : 'Đã thêm khuyến mãi!';
}

// ============================================================
// 7. CÔNG THỨC SẢN PHẨM
// ============================================================
function saveRecipe(data) {
  const sheet = getSheet("LichSu_GiaVon", ["Ngày", "Tên SP", "Giá Vốn", "Phí VH", "Giá Bán", "Lợi Nhuận", "Biên LN", "Chi Tiết"]);
  const sizeExtra = data.sizeRecipeDetails || [];
  var cogsStd = data.cogsStandard != null && data.cogsStandard !== '' ? parseFloat(data.cogsStandard) : parseFloat(data.cogs);
  var cogsLg = data.cogsLarge != null && data.cogsLarge !== '' ? parseFloat(data.cogsLarge) : cogsStd;
  if (isNaN(cogsStd)) cogsStd = 0;
  if (isNaN(cogsLg)) cogsLg = cogsStd;
  var sellStd = parseFloat(data.sellingPrice) || 0;
  var sellLg = data.sellingPriceLarge != null && data.sellingPriceLarge !== '' ? parseFloat(data.sellingPriceLarge) : NaN;
  var profitStd = sellStd - cogsStd;
  var marginStd = sellStd > 0 ? ((profitStd / sellStd) * 100).toFixed(1) : '0';
  const chiTiet = JSON.stringify({
    base: data.recipeDetails,
    sizeLarge: sizeExtra,
    cogsStandard: cogsStd,
    cogsLarge: cogsLg,
    sellingPriceLarge: !isNaN(sellLg) && sellLg > 0 ? sellLg : null
  });
  sheet.appendRow([new Date(), data.productName, cogsStd, data.opEx, sellStd, profitStd, marginStd + '%', chiTiet]);

  // Tự động cập nhật vào Menu
  const menuSheet = getSheet("Menu", MENU_HEADERS_BASE);
  ensureMenuExtraColumns(menuSheet);
  const menuData = menuSheet.getDataRange().getValues();
  const menuHeaders = menuData[0];
  const ixSz = menuHeaders.indexOf('Định mức size (JSON)');
  const ixLarge = menuHeaders.indexOf('Phụ thu ly lớn');
  let found = false;
  for (let i = 1; i < menuData.length; i++) {
    if (String(menuData[i][1]).trim().toLowerCase() === String(data.productName).trim().toLowerCase()) {
      menuSheet.getRange(i + 1, 4).setValue(sellStd);
      menuSheet.getRange(i + 1, 7).setValue(JSON.stringify(data.recipeDetails));
      menuSheet.getRange(i + 1, 11).setValue(cogsStd);
      menuSheet.getRange(i + 1, 12).setValue(data.opEx);
      if (!isNaN(sellLg) && sellLg > 0 && sellLg >= sellStd && ixLarge > -1) {
        menuSheet.getRange(i + 1, ixLarge + 1).setValue(Math.round(sellLg - sellStd));
      }
      if (ixSz > -1) {
        menuSheet.getRange(i + 1, ixSz + 1).setValue(JSON.stringify(sizeExtra));
      }
      found = true;
      break;
    }
  }
  // Nếu chưa có món trong Menu: tự tạo món mới để POS map công thức & trừ kho được ngay
  if (!found) {
    try {
      const base = String(data.productName || '').trim();
      const idNew = 'MENU_' + new Date().getTime();
      const largeExtra = (!isNaN(sellLg) && sellLg > 0 && sellLg >= sellStd) ? Math.round(sellLg - sellStd) : 8000;
      const sizeRecipeJson = JSON.stringify(sizeExtra || []);
      const ingredientsJson = JSON.stringify(data.recipeDetails || []);
      const valMap = {
        'ID': idNew,
        'Tên': base,
        'Danh mục': 'Sữa đơn',
        'Giá cơ bản': sellStd,
        'Mô tả': '',
        'Hình ảnh': '',
        'Thành phần': ingredientsJson,
        'Còn hàng': true,
        'Phổ biến': false,
        'Ghi chú': '[auto từ Tab Giá]',
        'Giá vốn': cogsStd,
        'Phí VH': data.opEx || 0,
        'Giảm ly nhỏ': 0,
        'Phụ thu ly lớn': largeExtra,
        'Bật cỡ nhỏ': false,
        'Bật cỡ thường': true,
        'Bật cỡ lớn': true,
        'Phụ thu chai nhựa': 0,
        'Định mức size (JSON)': sizeRecipeJson,
        'Phụ thu gia đình 500ml': 0,
        'Phụ thu gia đình 1L': 0,
        'Giá bán chai 500ml': data.familySell500 != null ? parseFloat(data.familySell500) || 0 : 0,
        'Giá bán chai 1 lít': data.familySell1L != null ? parseFloat(data.familySell1L) || 0 : 0,
        'Calo ước (kcal)': 0,
        'Protein ước (g)': 0,
        'Chất béo ước (g)': 0,
        'Công dụng': ''
      };
      const row = menuHeaders.map(function (h) { return valMap[h] !== undefined ? valMap[h] : ''; });
      menuSheet.appendRow(row);
      found = true;
    } catch (eNew) { }
  }
  CACHE.clear('menu');
  return found ? 'Đã lưu công thức và cập nhật vào Menu!' : 'Đã lưu (nhưng không tìm thấy món trong Menu để cập nhật tự động)';
}

function getCostHistory() {
  const headersDef = ["Ngày", "Tên SP", "Giá Vốn", "Phí VH", "Giá Bán", "Lợi Nhuận", "Biên LN", "Chi Tiết"];
  const sheet = getSheet("LichSu_GiaVon", headersDef);
  if (sheet.getLastRow() < 2) return [];
  const safeNum = (v) => isNaN(parseFloat(v)) ? 0 : parseFloat(v);
  return sheet.getDataRange().getValues().slice(1).map(r => ({
    date: r[0], productName: String(r[1]||''), cogs: safeNum(r[2]), opEx: safeNum(r[3]),
    sellingPrice: safeNum(r[4]), profit: safeNum(r[5]), margin: safeNum(r[6]), details: String(r[7]||'')
  })).filter(c => c.productName);
}

// ============================================================
// 8. AI GEMINI - tư vấn sữa hạt (ưu tiên model Flash nhanh)
// ============================================================
function getAISuggestion(userGoal, availableNuts) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return {
      suggestion: '',
      error: 'Chưa cấu hình GEMINI_API_KEY. Trong Google Apps Script: Dự án → Cài đặt → Thuộc tính tập lệnh → thêm khóa GEMINI_API_KEY (API Google AI Studio).'
    };
  }

  const nutsClient = Array.isArray(availableNuts) ? availableNuts : [];
  let invLines = [];
  try {
    getInventory().forEach(function (i) {
      if (!i || !i.name) return;
      const isNut = i.type === 'Hạt' || /hạt|điều|nhân|macca|óc chó|hạt/i.test(i.name);
      if (!isNut) return;
      invLines.push(i.name + (i.note ? ' - ' + i.note : '') + (i.mixQty ? ' (định lượng mix: ' + i.mixQty + ')' : ''));
    });
  } catch (e) { invLines = []; }

  const menuLines = [];
  try {
    getMenu().filter(function (m) { return m.available !== false; }).slice(0, 80).forEach(function (m) {
      menuLines.push('- ' + m.name + (m.category ? ' [' + m.category + ']' : '') + (m.description ? ': ' + m.description : ''));
    });
  } catch (e) { }

  const nutPool = nutsClient.length ? nutsClient : invLines.map(function (l) { return l.split(' -')[0]; });
  const contextBlock =
    '=== NGỮ CẢNH CỬA HÀNG SUN NUT MILK ===\n' +
    'Ưu tiên dùng **đúng** các món trong menu dưới đây khi gợi ý (tên + mô tả + category). Có thể gợi nhiều món phù hợp với từng nhóm khách:\n' +
    (menuLines.length ? menuLines.join('\n') : '(chưa có menu)') + '\n\n' +
    'Tồn kho nguyên liệu / hạt hiện có (chỉ gợi mix & công thức từ những thứ còn trong danh sách; nếu thiếu hãy nói rõ):\n' +
    (invLines.length ? invLines.join('\n') : (nutPool.join(', ') || '(chưa có dữ liệu kho)')) + '\n';

  const systemPreamble =
    'Bạn là chuyên gia dinh dưỡng thực phẩm và pha chế sữa hạt tươi tại Việt Nam. Luôn trả lời bằng tiếng Việt, giọng tư vấn thân thiện, không chẩn đoán bệnh, không thay thế bác sĩ; dùng từ "có thể hỗ trợ", "phù hợp để bổ sung".\n' +
    'Nếu khách có bệnh nền hoặc dị ứng, nhắc thận trọng và nên hỏi ý kiến chuyên gia y tế.\n';

  const prompt =
    systemPreamble + '\n' + contextBlock + '\n' +
    'YÊU CẦU / MÔ TẢ KHÁCH: "' + String(userGoal || '').trim() + '"\n\n' +
    'Hãy trả lời theo Markdown (tiêu đề rõ). **Không giới hạn độ dài** miễn hữu ích; có thể dài nếu cần nhiều công thức & lựa chọn.\n' +
    '## 1. Gợi ý từ menu cửa hàng\n' +
    '- Liệt kê **2–6 món** từ danh sách menu phù hợp nhất với nhu cầu (giải thích ngắn vì sao chọn).\n' +
    '## 2. Công thức pha chế (theo tồn kho)\n' +
    '- Với **mỗi** hướng uống (VD sáng / tối / tập / giảm đường…): công thức 1 ly ≈300–350ml - **gram hạt khô**, nước, tỷ lệ, các bước ngâm → xay → lọc.\n' +
    '- Chỉ dùng hạt/nguyên liệu **còn trong kho** ở trên; nếu không đủ, nêu phương án thay thế gần nhất.\n' +
    '## 3. Công dụng & cơ chế\n' +
    '- Dưỡng chất nổi bật, đối tượng phù hợp, lưu ý calo / đường / dị ứng.\n' +
    '## 4. So sánh & gợi ý thêm\n' +
    '- So sánh 2–3 phối hợp hạt; gợi ý topping / độ ngọt / uống nóng-lạnh phù hợp.\n' +
    '## 5. Bảng ước lượng dinh dưỡng (Markdown)\n' +
    '| Thành phần / mix | Gợi ý / ly | Ghi chú |\n' +
    '## 6. Lịch uống trong ngày\n' +
    '## 7. An toàn & disclaimer y tế\n';

  // Không dùng gemini-1.5-flash-8b (v1beta thường báo not found). Thử 2.5 / 2.0 / 1.5 và cả endpoint v1 lẫn v1beta.
  const models = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-001',
    'gemini-1.5-pro'
  ];
  const apiBases = [
    'https://generativelanguage.googleapis.com/v1beta/models/',
    'https://generativelanguage.googleapis.com/v1/models/'
  ];
  let lastErr = '';

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    for (let bi = 0; bi < apiBases.length; bi++) {
      const url = apiBases[bi] + model + ':generateContent?key=' + encodeURIComponent(apiKey);
      try {
        const response = UrlFetchApp.fetch(url, {
          method: 'POST',
          contentType: 'application/json',
          muteHttpExceptions: true,
          payload: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.65, maxOutputTokens: 8192 }
          })
        });
        const code = response.getResponseCode();
        const raw = response.getContentText();
        const result = JSON.parse(raw);
        if (result.error) {
          lastErr = result.error.message || JSON.stringify(result.error);
          continue;
        }
        if (code !== 200) {
          lastErr = 'HTTP ' + code + ' ' + raw.substring(0, 200);
          continue;
        }
        const cand = result.candidates && result.candidates[0];
        const parts = cand && cand.content && cand.content.parts;
        if (!parts || !parts[0] || !parts[0].text) {
          lastErr = 'Model không trả nội dung (có thể bị chặn bởi safety).';
          continue;
        }
        return { suggestion: parts[0].text, model: model };
      } catch (e) {
        lastErr = String(e.message || e);
        if (lastErr.indexOf('external_request') !== -1 || lastErr.indexOf('script.external_request') !== -1 ||
            lastErr.indexOf('Permission') !== -1 || lastErr.indexOf('UrlFetchApp') !== -1) {
          return {
            suggestion: '',
            error: 'Thiếu quyền gọi mạng (script.external_request). Làm lần lượt: (1) Lưu appsscript.json có scope này (2) Triển khai → Phiên bản mới Web app (3) Trong Editor chạy hàm authorizeSunNutMilkNetworkAndDrive() hoặc getAISuggestion và chấp nhận quyền. Xem: https://developers.google.com/apps-script/guides/support/troubleshooting#authorization-is'
          };
        }
      }
    }
  }

  return {
    suggestion: '',
    error: lastErr || 'Không gọi được Gemini. Kiểm tra GEMINI_API_KEY và bật Generative Language API.'
  };
}

// ---------- Cổng hội viên: lịch uống gợi ý theo menu (không công thức nấu) ----------
function _memberPortalMenuCompactForAi_(menuArr) {
  var out = [];
  var list = Array.isArray(menuArr) ? menuArr : [];
  for (var i = 0; i < list.length && out.length < 48; i++) {
    var m = list[i];
    if (!m || m.available === false) continue;
    var ing = [];
    if (m.ingredientNames && m.ingredientNames.length) {
      ing = m.ingredientNames.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    } else if (m.ingredients && m.ingredients.length) {
      for (var j = 0; j < m.ingredients.length; j++) {
        var it = m.ingredients[j];
        var nm = typeof it === 'string' ? String(it).trim() : (it && it.name ? String(it.name).trim() : '');
        if (nm) ing.push(nm);
      }
    }
    out.push({
      name: String(m.name || '').trim(),
      category: String(m.category || '').trim(),
      ingredients: ing.join(', '),
      benefits: String(m.benefits || '').trim().slice(0, 2200),
      kcal: Math.round(Number(m.nutritionKcal) || 0),
      protein: Math.round((Number(m.nutritionProteinG) || 0) * 10) / 10,
      fat: Math.round((Number(m.nutritionFatG) || 0) * 10) / 10
    });
  }
  return out;
}

function _memberPortalFindMenuByName_(wantName, menuArr) {
  var w = String(wantName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!w) return null;
  var list = Array.isArray(menuArr) ? menuArr : [];
  var i;
  for (i = 0; i < list.length; i++) {
    var m = list[i];
    if (!m || m.available === false) continue;
    var n = String(m.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (n === w) return m;
  }
  for (i = 0; i < list.length; i++) {
    var m2 = list[i];
    if (!m2 || m2.available === false) continue;
    var n2 = String(m2.name || '').trim().toLowerCase();
    if (n2.indexOf(w) >= 0 || w.indexOf(n2) >= 0) return m2;
  }
  return null;
}

function _memberPortalIngredientsFromMenu_(m) {
  if (!m) return '';
  if (m.ingredientNames && m.ingredientNames.length) return m.ingredientNames.join(', ');
  var parts = [];
  if (m.ingredients && m.ingredients.length) {
    for (var k = 0; k < m.ingredients.length; k++) {
      var it = m.ingredients[k];
      var nm = typeof it === 'string' ? String(it).trim() : (it && it.name ? String(it.name).trim() : '');
      if (nm) parts.push(nm);
    }
  }
  return parts.join(', ');
}

function _memberPortalScheduleLabels_(numDays) {
  var n = Math.max(7, Math.min(31, parseInt(numDays, 10) || 7));
  var week = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
  var out = [];
  for (var i = 0; i < n; i++) {
    if (i < 7) out.push(week[i]);
    else out.push('Ngày ' + (i + 1));
  }
  return out;
}

function _memberPortalSanitizeScheduleDays_(days, menuArr, numDays) {
  var labels = _memberPortalScheduleLabels_(numDays);
  var out = [];
  var raw = Array.isArray(days) ? days : [];
  for (var d = 0; d < labels.length; d++) {
    var label = labels[d];
    var src = raw[d] || {};
    var drinkName = String((src.drinkName != null ? src.drinkName : src.menuDrinkName) || '').trim();
    var m = _memberPortalFindMenuByName_(drinkName, menuArr);
    if (!m && menuArr && menuArr.length) {
      m = menuArr[d % menuArr.length];
      drinkName = String(m.name || '').trim();
    }
    var ingLine = String(src.ingredientsSummary || src.ingredients || '').trim();
    var benLine = String(src.benefitNote || src.benefits || '').trim();
    var note = String(src.note || src.tip || '').trim();
    if (benLine.length > 2200) benLine = benLine.slice(0, 2197) + '…';
    if (m) {
      drinkName = String(m.name || '').trim();
      ingLine = _memberPortalIngredientsFromMenu_(m) || ingLine;
      if (String(m.benefits || '').trim()) benLine = String(m.benefits || '').trim().slice(0, 2200);
    }
    if (!ingLine) ingLine = '(Thành phần hạt - xem thêm tại tab Thực đơn)';
    if (!benLine) benLine = 'Có thể hỗ trợ bổ sung dinh dưỡng từ hạt; không thay thế tư vấn y tế.';
    out.push({
      day: String(src.day || label).trim() || label,
      drinkName: drinkName || 'Theo menu cửa hàng',
      ingredientsLine: ingLine,
      benefitLine: benLine,
      note: note
    });
  }
  return out;
}

function _memberPortalGoalBlob_(m) {
  return String((m.name || '') + ' ' + (m.category || '') + ' ' + (m.benefits || '') + ' ' + (m.description || '') + ' ' + (m.note || '')).toLowerCase();
}

function buildMemberPortalScheduleFallback_(userGoal, menuArr, packages, durationDays) {
  var numDays = durationDays === 30 ? 30 : 7;
  var g = String(userGoal || '').toLowerCase();
  var picks = (menuArr || []).filter(function (m) { return m && m.available !== false; });
  var blob = _memberPortalGoalBlob_;
  if (g.indexOf('da') >= 0 || g.indexOf('đẹp') >= 0 || g.indexOf('dep') >= 0 || g.indexOf('da ') >= 0) {
    picks = picks.filter(function (m) { return blob(m).indexOf('da') >= 0 || blob(m).indexOf('collagen') >= 0 || blob(m).indexOf('toc') >= 0 || blob(m).indexOf('tóc') >= 0; });
  } else if (g.indexOf('giảm') >= 0 || g.indexOf('giam') >= 0 || g.indexOf('cân') >= 0 || g.indexOf('can') >= 0) {
    picks = picks.filter(function (m) { return blob(m).indexOf('giảm') >= 0 || blob(m).indexOf('giam') >= 0 || blob(m).indexOf('cal') >= 0 || blob(m).indexOf('ít') >= 0; });
  } else if (g.indexOf('tim') >= 0 || g.indexOf('mạch') >= 0 || g.indexOf('mach') >= 0) {
    picks = picks.filter(function (m) { return blob(m).indexOf('tim') >= 0 || blob(m).indexOf('mạch') >= 0 || blob(m).indexOf('omega') >= 0; });
  } else if (g.indexOf('ngủ') >= 0 || g.indexOf('ngu') >= 0 || g.indexOf('stress') >= 0) {
    picks = picks.filter(function (m) { return blob(m).indexOf('ngủ') >= 0 || blob(m).indexOf('ngu') >= 0 || blob(m).indexOf('thư') >= 0 || blob(m).indexOf('sen') >= 0; });
  }
  if (!picks.length) picks = (menuArr || []).filter(function (m) { return m && m.available !== false; }).slice(0, 12);
  if (!picks.length) {
    return { ok: false, error: 'Chưa có món khả dụng để gợi ý.', source: 'fallback' };
  }
  var labels = _memberPortalScheduleLabels_(numDays);
  var days = [];
  for (var d = 0; d < labels.length; d++) {
    var m = picks[d % picks.length];
    days.push({
      day: labels[d],
      drinkName: String(m.name || '').trim(),
      ingredientsLine: _memberPortalIngredientsFromMenu_(m) || '(Xem thực đơn)',
      benefitLine: String(m.benefits || '').trim().slice(0, 2200) || 'Có thể hỗ trợ bổ sung dinh dưỡng từ hạt theo mục tiêu bạn mô tả.',
      note: 'Gợi ý uống buổi sáng hoặc thay bữa phụ - linh hoạt theo lịch giao gói.'
    });
  }
  var week = null;
  var month = null;
  for (var pi = 0; pi < (packages || []).length; pi++) {
    var p = packages[pi];
    if (!p) continue;
    if (String(p.type || '').indexOf('Tuần') >= 0 && !week) week = p;
    if (String(p.type || '').indexOf('Tháng') >= 0 && !month) month = p;
  }
  var rec = (numDays >= 28 && month) ? month : (week || month || (packages && packages[0]) || null);
  if (!rec && numDays >= 28) rec = month;
  return {
    ok: true,
    source: 'fallback',
    durationDays: numDays,
    intro: 'Gợi ý nhanh từ thực đơn SUN (không dùng AI) trong ' + numDays + ' ngày. Bạn có thể đăng ký gói bên phải để cửa hàng giao theo lịch.',
    recommendedPackageId: rec ? String(rec.id || '') : '',
    recommendedPackageReason: rec ? ('Phù hợp gói ' + String(rec.type || '') + ' - ' + String(rec.name || '') + '.') : '',
    days: _memberPortalSanitizeScheduleDays_(days, menuArr, numDays),
    disclaimer: 'Thông tin mang tính tham khảo, không chẩn đoán hay điều trị bệnh. Có bệnh nền/dị ứng hãy hỏi bác sĩ/dinh dưỡng.'
  };
}

/**
 * Cổng đăng ký hội viên: lịch uống theo menu - mỗi ngày 1 món + thành phần hạt + công dụng; gợi gói.
 * userGoal: string hoặc { goal, durationDays: 7|30 }.
 */
function getMemberPortalScheduleAdvice(userGoal, durationOrOpts) {
  var goal = '';
  var durationDays = 7;
  if (userGoal && typeof userGoal === 'object' && !Array.isArray(userGoal)) {
    goal = String(userGoal.goal || userGoal.userGoal || '').trim();
    var dd = parseInt(userGoal.durationDays, 10);
    if (dd === 30 || dd === 7) durationDays = dd;
  } else {
    goal = String(userGoal || '').trim();
    var d2 = parseInt(durationOrOpts, 10);
    if (d2 === 30 || d2 === 7) durationDays = d2;
  }
  var numDays = durationDays === 30 ? 30 : 7;
  if (!goal) return { ok: false, error: 'Vui lòng nhập mục tiêu (ví dụ: đẹp da, giảm cân nhẹ, tăng năng lượng…).' };
  var menuFull = [];
  try {
    menuFull = getMenu() || [];
  } catch (eM) {
    menuFull = [];
  }
  var menuAvail = menuFull.filter(function (m) { return m && m.available !== false; });
  if (!menuAvail.length) return { ok: false, error: 'Chưa có dữ liệu thực đơn.' };
  var packages = [];
  try {
    packages = getMembershipPackages() || [];
  } catch (eP) {
    packages = [];
  }
  var compact = _memberPortalMenuCompactForAi_(menuAvail);
  var pkgCompact = packages.map(function (p) {
    return {
      id: String(p.id || ''),
      type: String(p.type || ''),
      name: String(p.name || ''),
      sessions: p.sessions || 0,
      price: p.price || 0
    };
  });

  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return buildMemberPortalScheduleFallback_(goal, menuAvail, packages, numDays);

  var schema =
    '{"intro":"string","recommendedPackageId":"string hoặc rỗng","recommendedPackageReason":"string","days":[' +
    '{"day":"Thứ 2","drinkName":"string","ingredientsSummary":"string","benefitNote":"string","note":"string"}' +
    ' x đúng ' + numDays + ' phần tử],' +
    '"disclaimer":"string"}';
  var prompt =
    'Bạn là cố vấn dinh dưỡng ứng dụng SUN Nut Milk (Việt Nam). Chỉ trả về MỘT JSON hợp lệ, UTF-8, không markdown, không text ngoài JSON.\n' +
    'Khách chọn gói khoảng ' + numDays + ' ngày (' + (numDays >= 28 ? '1 tháng ~30 ngày' : '1 tuần 7 ngày') + ').\n' +
    'Mục tiêu / nhu cầu khách: ' + JSON.stringify(goal) + '\n' +
    'MENU (drinkName PHẢI trùng chính xác field name của một món; không bịa món mới): ' + JSON.stringify(compact) + '\n' +
    'GÓI (recommendedPackageId phải trùng id hoặc để ""): ' + JSON.stringify(pkgCompact) + '\n' +
    'Quy tắc bắt buộc:\n' +
    '1) days: đúng ' + numDays + ' phần tử; 7 ngày đầu dùng nhãn Thứ 2…Chủ nhật, các ngày sau dùng "Ngày 8", "Ngày 9"…\n' +
    '2) ingredientsSummary: chỉ mô tả các loại hạt/thành phần có trong món (theo menu), KHÔNG ghi công thức nấu - cấm gram, cấm tỷ lệ, cấm ngâm, cấm xay/lọc, cấm số bước chế biến.\n' +
    '3) benefitNote: 1–2 câu tiếng Việt, giọng thận trọng "có thể hỗ trợ"/"phù hợp", không chẩn đoán bệnh.\n' +
    '4) note: gợi ý thời điểm uống (sáng/trưa/chiều) hoặc thay bữa phụ - ngắn.\n' +
    '5) intro: 2–4 câu tóm tắt lịch trình theo mục tiêu.\n' +
    '6) disclaimer: 1 câu y tế.\n' +
    'Schema: ' + schema;

  var models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-001', 'gemini-1.5-flash'];
  var apiBases = ['https://generativelanguage.googleapis.com/v1beta/models/', 'https://generativelanguage.googleapis.com/v1/models/'];
  var lastErr = '';
  for (var mi = 0; mi < models.length; mi++) {
    for (var bi = 0; bi < apiBases.length; bi++) {
      var url = apiBases[bi] + models[mi] + ':generateContent?key=' + encodeURIComponent(apiKey);
      try {
        var response = UrlFetchApp.fetch(url, {
          method: 'POST',
          contentType: 'application/json',
          muteHttpExceptions: true,
          payload: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.42, maxOutputTokens: 3072 }
          })
        });
        var code = response.getResponseCode();
        var raw = response.getContentText();
        var result = JSON.parse(raw);
        if (result.error) {
          lastErr = result.error.message || JSON.stringify(result.error);
          continue;
        }
        if (code !== 200) {
          lastErr = 'HTTP ' + code;
          continue;
        }
        var cand = result.candidates && result.candidates[0];
        var parts = cand && cand.content && cand.content.parts;
        if (!parts || !parts[0] || !parts[0].text) {
          lastErr = 'empty';
          continue;
        }
        var txt = String(parts[0].text || '').trim();
        txt = txt.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        var obj = null;
        try {
          obj = JSON.parse(txt);
        } catch (eJ) {
          obj = null;
        }
        if (!obj || typeof obj !== 'object') {
          lastErr = 'json';
          continue;
        }
        var daysRaw = obj.days;
        var days = _memberPortalSanitizeScheduleDays_(daysRaw, menuAvail, numDays);
        var recId = String(obj.recommendedPackageId != null ? obj.recommendedPackageId : '').trim();
        if (recId && !packages.some(function (p) { return String(p.id) === recId; })) recId = '';
        if (!recId && numDays >= 28) {
          var mo = packages.filter(function (p) { return String(p.type || '').indexOf('Tháng') >= 0; })[0];
          if (mo) recId = String(mo.id || '');
        }
        return {
          ok: true,
          source: 'gemini',
          model: models[mi],
          durationDays: numDays,
          intro: String(obj.intro || '').trim(),
          recommendedPackageId: recId,
          recommendedPackageReason: String(obj.recommendedPackageReason || '').trim(),
          days: days,
          disclaimer: String(obj.disclaimer || '').trim() ||
            'Thông tin tham khảo; không thay thế bác sĩ/dinh dưỡng lâm sàng.'
        };
      } catch (e) {
        lastErr = String(e.message || e);
        if (lastErr.indexOf('external_request') !== -1 || lastErr.indexOf('script.external_request') !== -1) {
          return buildMemberPortalScheduleFallback_(goal, menuAvail, packages, numDays);
        }
      }
    }
  }
  return buildMemberPortalScheduleFallback_(goal, menuAvail, packages, numDays);
}

/** Gợi ý mô tả ngắn cho món (Admin - tab Menu). Có GEMINI_API_KEY thì gọi Gemini; không thì trả mẫu tĩnh. */
function suggestMenuDescriptionShort(name, category, ingredientsHint) {
  var n = String(name || '').trim();
  if (!n) return { ok: false, text: '', benefits: '', error: 'Thiếu tên món' };
  var cat = String(category || '').trim();
  var ing = String(ingredientsHint || '').trim().slice(0, 500);
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    var fb = n + ' - sữa hạt tươi xay tại chỗ, vị thanh ngọt tự nhiên, uống nóng hoặc lạnh đều hợp. Phù hợp bữa sáng / chiều nhẹ.';
    var bf = 'Có thể hỗ trợ bổ sung năng lượng nhẹ và dưỡng chất từ hạt (đạm thực vật, chất xơ); góp phần thói quen uống lành mạnh - nhiều người cũng quan tâm góc làn da & vóc dáng ở dinh dưỡng chung (tùy cơ địch, không thay tư vấn y tế).';
    return { ok: true, text: fb, benefits: bf, fallback: true };
  }
  var prompt =
    'Bạn là copywriter cho khách hàng (B2C) của thương hiệu sữa hạt. Viết ngắn gọn, dễ hiểu, tập trung cảm giác ngon & lợi ích nhẹ nhàng cho người uống. ' +
    'Trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích) theo schema:\n' +
    '{"desc":"...","benefits":"..."}\n' +
    '- desc: 1–2 câu tiếng Việt, tối đa 220 ký tự, không emoji, không gạch đầu dòng. Viết như mô tả trên menu để khách đọc.\n' +
    '- benefits: 2–3 câu tiếng Việt, tối đa 320 ký tự. Gắn với thành phần hạt (nếu có): gợi ý nhẹ "có thể hỗ trợ" cho năng lượng, tiêu hóa, làn da (góc dinh dưỡng/chống oxy hóa), vóc dáng (vai trò bữa phụ/no lâu) - không cam kết giảm cân/trắng da/chữa mụn; không chẩn đoán bệnh.\n' +
    'Giọng điệu: ấm áp, premium, healthy; không dùng từ nội bộ như "upsell/giá vốn/admin/POS".\n' +
    'Dữ liệu: Tên món="' + n + '"; Danh mục="' + cat + '"; Thành phần gợi ý="' + (ing || 'không khai báo') + '".';
  var models = ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];
  var bases = ['https://generativelanguage.googleapis.com/v1beta/models/', 'https://generativelanguage.googleapis.com/v1/models/'];
  for (var mi = 0; mi < models.length; mi++) {
    for (var bi = 0; bi < bases.length; bi++) {
      try {
        var url = bases[bi] + models[mi] + ':generateContent?key=' + encodeURIComponent(apiKey);
        var response = UrlFetchApp.fetch(url, {
          method: 'POST',
          contentType: 'application/json',
          muteHttpExceptions: true,
          payload: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.55, maxOutputTokens: 256 }
          })
        });
        var result = JSON.parse(response.getContentText());
        if (result.error) continue;
        var parts = result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts;
        if (parts && parts[0] && parts[0].text) {
          var raw = String(parts[0].text || '').trim();
          raw = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
          var obj = null;
          try { obj = JSON.parse(raw); } catch (eJ) { obj = null; }
          var txt = '';
          var ben = '';
          if (obj && typeof obj === 'object') {
            txt = String(obj.desc || '').replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '').slice(0, 280);
            ben = String(obj.benefits || '').replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '').slice(0, 400);
          } else {
            txt = raw.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '').slice(0, 280);
          }
          if (!txt) continue;
          if (!ben) ben = 'Có thể hỗ trợ bổ sung năng lượng nhẹ nhàng, giàu dưỡng chất từ hạt. Phù hợp người muốn uống lành mạnh (ít đường).';
          return { ok: true, text: txt, benefits: ben, model: models[mi] };
        }
      } catch (eTry) { }
    }
  }
  var fb2 = n + ' - món uống từ sữa hạt tươi, ít đường, thơm tự nhiên - phù hợp uống sáng hoặc giải khát trong ngày.';
  return {
    ok: true,
    text: fb2,
    benefits: 'Có thể hỗ trợ bổ sung năng lượng nhẹ và dưỡng chất từ hạt; góp phần thói quen uống lành mạnh - góc làn da & vóc dáng theo dinh dưỡng đại chúng, tùy cơ địch.',
    fallback: true
  };
}

/**
 * Viết "Công dụng" chuẩn (hiển thị khách + bản mở rộng cho admin).
 * Trả về text thuần để dán vào ô Công dụng.
 */
function suggestMenuBenefitsPro(name, category, ingredientsHint) {
  var n = String(name || '').trim();
  if (!n) return { ok: false, text: '', error: 'Thiếu tên món' };
  var cat = String(category || '').trim();
  var ing = String(ingredientsHint || '').trim().slice(0, 1200);
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    var fb =
      'Vị thơm béo tự nhiên, dễ uống. Có thể hỗ trợ bổ sung năng lượng nhẹ nhàng và giúp bạn no lâu hơn. Phù hợp dùng buổi sáng hoặc xế chiều.\n' +
      'Lưu ý: nếu bạn dị ứng các loại hạt, hãy cân nhắc trước khi dùng.';
    return { ok: true, text: fb, fallback: true };
  }

  var prompt =
    'Bạn là copywriter (B2C) cho thương hiệu sữa hạt cao cấp. ' +
    'Viết "Công dụng" để KHÁCH HÀNG đọc trên menu, ngắn gọn, dễ hiểu, gợi cảm giác healthy & ngon miệng. ' +
    'Không phóng đại, không cam kết chữa bệnh, không dùng ngôn ngữ nội bộ của người bán.\n\n' +
    'Thông tin sản phẩm:\n' +
    '- Tên món: ' + n + '\n' +
    '- Danh mục: ' + (cat || 'không rõ') + '\n' +
    '- Thành phần gợi ý (nếu có): ' + (ing || 'không khai báo') + '\n\n' +
    'Yêu cầu đầu ra:\n' +
    '1) Viết 3 đến 5 câu, tối đa 480 ký tự.\n' +
    '2) BẮT BUỘC có ít nhất 1–2 câu gắn với thành phần hạt đã cho: nêu dưỡng chất tiêu biểu (đạm thực vật, chất béo lành, chất xơ, vitamin E/kẽm/chất chống oxy hóa… tùy loại hạt thật sự có) và "có thể hỗ trợ" gì cho sức khỏe chung, tiêu hóa, làn da (góc dinh dưỡng), vóc dáng (bữa phụ/no lâu) - không hứa giảm cân nhanh/trắng da/chữa bệnh.\n' +
    '3) Thêm câu hướng tới khách: "phù hợp cho...", "gợi ý dùng..." kèm 1 gợi ý thời điểm uống.\n' +
    '4) Nếu có lưu ý dị ứng hạt thì thêm 1 câu cuối "Lưu ý: ...".\n' +
    '5) Mỗi câu một dòng; có thể bắt đầu dòng bằng MỘT emoji Unicode (khuyến nghị) rồi khoảng trắng rồi nội dung. Không bullet ASCII/Markdown. Không nhắc admin/POS/giá vốn.\n';

  var models = ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];
  var bases = ['https://generativelanguage.googleapis.com/v1beta/models/', 'https://generativelanguage.googleapis.com/v1/models/'];
  for (var mi = 0; mi < models.length; mi++) {
    for (var bi = 0; bi < bases.length; bi++) {
      try {
        var url = bases[bi] + models[mi] + ':generateContent?key=' + encodeURIComponent(apiKey);
        var response = UrlFetchApp.fetch(url, {
          method: 'POST',
          contentType: 'application/json',
          muteHttpExceptions: true,
          payload: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.58, maxOutputTokens: 640 }
          })
        });
        var result = JSON.parse(response.getContentText());
        if (result.error) continue;
        var parts = result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts;
        if (parts && parts[0] && parts[0].text) {
          var raw = String(parts[0].text || '').trim();
          raw = raw.replace(/```/g, '').trim();
          raw = raw.replace(/\u2014/g, '-'); // phòng trường hợp model tự sinh dấu -
          if (!raw) continue;
          return { ok: true, text: raw, model: models[mi] };
        }
      } catch (eTry) { }
    }
  }
  return { ok: false, text: '', error: 'Không tạo được công dụng. Kiểm tra GEMINI_API_KEY và quyền gọi mạng.' };
}

/**
 * Gói AI cho Admin: công dụng (khách, có emoji từng dòng) + mở rộng admin + calo/protein/béo ước (~350ml).
 * Ghép cột "Công dụng": phần khách (ngắn, emoji) + "\n\nMở rộng cho admin tham khảo\n" + phần tư vấn chuyên sâu (hiển thị «Tham khảo thêm»).
 */
function suggestMenuNutritionAndBenefitsBundle(name, category, ingredientsHint) {
  var n = String(name || '').trim();
  if (!n) return { ok: false, error: 'Thiếu tên món' };
  var cat = String(category || '').trim();
  var ing = String(ingredientsHint || '').trim().slice(0, 1200);
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

  function buildCombined_(cust, adm) {
    var c = String(cust || '').trim();
    var a = String(adm || '').trim();
    if (!c && !a) return '';
    if (!a) return c;
    if (!c) return 'Mở rộng cho admin tham khảo\n' + a;
    return c + '\n\nMở rộng cho admin tham khảo\n' + a;
  }

  function fallback_() {
    var cust =
      '✨ Gợi ý uống ấm hoặc lạnh tùy khẩu vị - vị thanh, ít ngọt.\n' +
      '💛 Từ hạt trong món: có thể góp phần đạm thực vật và các hợp chất chống oxy hóa nền tảng mà nhiều người quan tâm cho làn da & sức khỏe chung (tùy cơ địch).\n' +
      '🌿 Có thể hỗ trợ cảm giác no nhẹ khi dùng làm bữa phụ; phù hợp người muốn thói quen uống lành mạnh từ hạt.\n' +
      '💧 Gợi ý buổi sáng hoặc xế chiều - không thay bữa chính.';
    var adm =
      'Món này thường được xem như thức uống bổ sung nước và một phần năng lượng nhẹ từ hạt; không thay thế bữa chính hay thuốc.\n' +
      'Nếu khách uống đều vài tuần kèm ăn uống cân bằng, nhiều người thấy dễ duy trì thói quen - hiệu quả cụ thể phụ thuộc cơ địch, không có mốc thời gian cố định.\n' +
      'Dài hạn: nên xen ngày, tránh cộng dồn đường/topping; người dị ứng hạt hoặc có bệnh nền cần hỏi bác sĩ trước khi coi đây là phần chính của chế độ dinh dưỡng.\n' +
      'Không phù hợp hoặc nên hạn chế (cần tùy chỉnh theo công thức thật tại quán): dị ứng hạt/đậu nành nếu có trong món; cần kiểm soát đường huyết nếu thêm đường/siro/topping ngọt; một số bệnh thận giai đoạn cần kiểm soát kali/phốt pho có thể phải hạn chế khẩu phần hạt dày; trào ngược/đầy hơi nếu uống lạnh nhiều hoặc béo cao; đang điều trị hoặc mang thai/cho con bú nên hỏi bác sĩ trước khi dùng làm thói quen hàng ngày.\n' +
      'Vận hành quán: luôn hỏi dị ứng, gợi ít ngọt khi khách quan tâm đường huyết.';
    var h = (n + '|' + cat).replace(/\s/g, '').length;
    var kcal = 130 + (h % 90);
    var pr = 4.5 + (h % 40) / 20;
    var ft = 5 + (h % 35) / 20;
    return {
      ok: true,
      combinedBenefits: buildCombined_(cust, adm),
      nutritionKcal: Math.round(kcal),
      nutritionProteinG: Math.round(pr * 10) / 10,
      nutritionFatG: Math.round(ft * 10) / 10,
      fallback: true
    };
  }

  if (!apiKey) return fallback_();

  var prompt =
    'Bạn là chuyên gia tư vấn dinh dưỡng lâm sàng (RD) hoặc điều dưỡng viên có kinh nghiệm thực hành tại Việt Nam, đồng thời am hiểu thực đơn sữa hạt quán cà phê. ' +
    'Ước lượng dinh dưỡng cho 1 khẩu phần khoảng 350ml (ly thường) - chỉ ước lượng thực hành, không thay thế phân tích phòng lab.\n' +
    'Trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích ngoài JSON) theo schema:\n' +
    '{"benefitsCustomer":"...","benefitsAdmin":"...","kcal":0,"proteinG":0,"fatG":0}\n' +
    'Quy tắc benefitsCustomer (phần «Công dụng» khách đọc trên app/POS, dễ quét mắt):\n' +
    '- 3 đến 5 dòng (ưu tiên đủ 4 dòng nếu còn chỗ), mỗi dòng BẮT ĐẦU bằng đúng MỘT emoji Unicode (vd 💛🌿💧✨) rồi một khoảng trắng rồi nội dung tiếng Việt.\n' +
    '- Tổng benefitsCustomer tối đa 520 ký tự. Giọng ấm, giàu thông tin nhưng gọn; dùng "có thể", "góp phần", "phù hợp", "gợi ý"; không chẩn đoán bệnh, không cam kết chữa bệnh.\n' +
    '- BẮT BUỘC gắn với thành phần hạt đã cho (suy từ tên món nếu không có danh sách): ít nhất MỘT dòng nêu dưỡng chất/đặc điểm tiêu biểu của đúng loại hạt trong món và "có thể hỗ trợ" phần nào của sức khỏe; thêm ít nhất MỘT dòng chạm nhẹ tới làn da (góc dinh dưỡng nền, chống oxy hóa chung) hoặc vóc dáng (bữa phụ, no lâu, thói quen) - chỉ khi phù hợp với hạt, không phóng đại thẩm mỹ (không hứa trắng da/giảm cân nhanh/trị mụn).\n' +
    '- Nếu sau các dòng trên vẫn còn dư ký tự trong 520, có thể thêm tối đa một dòng (emoji đầu dòng) nhắc nhẹ nhóm nên hỏi nhân viên/bác sĩ trước khi uống thường xuyên - không liệt kê bệnh dài.\n' +
    'Quy tắc benefitsAdmin (BẢN CHÍNH - sau này hiển thị ở mục «Tham khảo thêm» cho khách và nhân viên; viết như người có chuyên môn soạn tay, không phải bài mẫu máy):\n' +
    '- Độ dài khoảng 800–1700 ký tự. Chia 4–7 đoạn ngắn (xuống dòng \\n giữa đoạn), mạch logic rõ.\n' +
    '- Bám sát ĐÚNG tên món, danh mục và thành phần đã cho; không bịa thành phần không có. Nếu thiếu chi tiết công thức thì nói rõ đang suy luận theo mô tả chung của món cùng loại.\n' +
    '- Nội dung bắt buộc gồm các ý (có thể gộp câu cho tự nhiên): (1) Món này «là gì» với cơ thể: khai triển theo đúng thành phần hạt đã cho - nêu dưỡng chất tiêu biểu (đạm thực vật, chất béo lành, chất xơ, nước, vitamin E, kẽm, chất chống oxy hóa… chỉ những gì phù hợp loại hạt có thật); liên hệ nhẹ với lợi ích thường nói trong dinh dưỡng đại chúng: sức khỏe chung và năng lượng, tiêu hóa, làn da (góc dinh dưỡng nền, không hứa trắng da/trị mụn), vóc dáng (bữa phụ, no lâu, thói quen uống) - chỉ nhắn các góc phù hợp, không bịa hạt không có; (2) Góc nhìn dùng đều/lâu dài: thói quen uống hợp lý (tần suất gợi ý, xen ngày nếu cần), điều người ta thường cảm nhận theo tuần so với theo tháng - luôn nhấn mạnh cá thể hóa, không hứa mốc cố định; (3) Khi nào cần hỏi bác sĩ hoặc điều dưỡng (dị ứng, bệnh nền, dùng thuốc, mang thai/cho con bú nếu món có thành phần cần thận trọng); (4) Gợi ý vận hành quán: độ ngọt, topping, thời điểm uống - không nhắc giá vốn/POS; (5) BẮT BUỘC một đoạn rõ ràng «Không phù hợp hoặc nên hạn chế»: nêu nhóm người, bệnh lý hoặc triệu chứng có thể cần tránh hoặc giảm tần suất/chỉnh cách uống, bám sát thành phần và dạng món đã cho (ví dụ dị ứng hạt/đậu nành nếu công thức có; kiểm soát đường huyết khi thêm đường/siro/topping ngọt; bệnh thận giai đoạn cần kiểm soát kali/phốt pho khi khẩu phần hạt dày; trào ngược/đầy hơi/ợ nóng nếu béo cao hoặc uống lạnh nhiều; bất dung nạp lactose chỉ khi mô tả có sữa bò/sữa động vật). Phân biệt «không nên» với «vẫn uống được nhưng nên ít hơn/đổi cách pha». Không liệt kê bệnh không liên quan tới thành phần; không gây hoang mang.\n' +
    '- Giọng chuẩn chuyên gia nhưng đời thường, câu văn Việt tự nhiên; tránh cấu trúc lặp "Không chỉ… mà còn…", tránh liệt kê sáo rỗng.\n' +
    '- TUYỆT ĐỐI không chẩn đoán bệnh, không khẳng định chữa/trị, không số liệu y học giả định ngoài phạm vi thức uống. Dùng từ thận trọng: "có thể", "thường được nhắc trong dinh dưỡng đại chúng", "tùy cơ địch", "không thay cho tư vấn y khoa cá nhân".\n' +
    '- Emoji: không bắt buộc; nếu dùng thì tối đa 2–3 emoji cả bài benefitsAdmin, đặt chỗ thật sự cần nhấn mạnh (không mỗi dòng một emoji).\n' +
    '- KHÔNG được tự giới thiệu là AI/bot/mô hình ngôn ngữ; không dùng mở đầu kiểu "Dưới đây là", "Theo yêu cầu", "Tóm lại", "Bài phân tích"; không lộ dấu hiệu máy sinh.\n' +
    '- KHÔNG nhập tiêu đề "Mở rộng..." vào benefitsAdmin (hệ thống tự ghép).\n' +
    'kcal, proteinG, fatG: số hợp lý với mô tả món (kcal số nguyên; proteinG và fatG một chữ số thập phân).\n' +
    'Dữ liệu món: Tên="' + n + '"; Danh mục="' + (cat || 'không rõ') + '"; Thành phần JSON hoặc gợi ý="' +
    (ing || 'không khai báo') + '".';

  var models = ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];
  var bases = ['https://generativelanguage.googleapis.com/v1beta/models/', 'https://generativelanguage.googleapis.com/v1/models/'];
  for (var mi = 0; mi < models.length; mi++) {
    for (var bi = 0; bi < bases.length; bi++) {
      try {
        var url = bases[bi] + models[mi] + ':generateContent?key=' + encodeURIComponent(apiKey);
        var response = UrlFetchApp.fetch(url, {
          method: 'POST',
          contentType: 'application/json',
          muteHttpExceptions: true,
          payload: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.42, maxOutputTokens: 2048 }
          })
        });
        var result = JSON.parse(response.getContentText());
        if (result.error) continue;
        var parts = result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts;
        if (!parts || !parts[0] || !parts[0].text) continue;
        var raw = String(parts[0].text || '').trim();
        raw = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        var obj = null;
        try {
          obj = JSON.parse(raw);
        } catch (eJ) {
          obj = null;
        }
        if (!obj || typeof obj !== 'object') continue;
        var bc = String(obj.benefitsCustomer || '').trim().replace(/\r\n/g, '\n');
        if (bc.length > 560) bc = bc.slice(0, 557) + '…';
        var ba = String(obj.benefitsAdmin || '').trim().replace(/\r\n/g, '\n');
        if (ba.length > 4500) ba = ba.slice(0, 4497) + '…';
        var kcal = Math.round(parseFloat(obj.kcal) || 0);
        var pr = Math.round((parseFloat(obj.proteinG) || 0) * 10) / 10;
        var ft = Math.round((parseFloat(obj.fatG) || 0) * 10) / 10;
        if (kcal < 30 || kcal > 900) kcal = Math.max(80, Math.min(450, kcal));
        if (pr < 0 || pr > 40) pr = 6;
        if (ft < 0 || ft > 50) ft = 7;
        if (!bc) continue;
        return {
          ok: true,
          combinedBenefits: buildCombined_(bc, ba),
          nutritionKcal: kcal,
          nutritionProteinG: pr,
          nutritionFatG: ft,
          model: models[mi]
        };
      } catch (eTry) { }
    }
  }
  return fallback_();
}

/**
 * Parse phản hồi HTTP từ api.imgbb.com - JSON thành công hoặc lỗi có nghĩa.
 * Nhiều trường hợp Google Apps Script bị CDN trả HTML «forbidden» (không phải do sai key).
 */
function _sunImgbbParseJsonResponse_(resp) {
  var raw = '';
  try {
    raw = resp.getContentText() || '';
  } catch (e0) {
    raw = '';
  }
  var code = 0;
  try {
    code = resp.getResponseCode();
  } catch (e1) {
    code = 0;
  }
  if (!raw) {
    return { ok: false, error: 'EMPTY_' + code };
  }
  var low = raw.toLowerCase();
  if (low.indexOf('you have been forbidden') !== -1 || low.indexOf('forbidden to use this website') !== -1) {
    return { ok: false, error: 'FORBIDDEN_HTML' };
  }
  if (raw.indexOf('<!DOCTYPE') === 0 || raw.indexOf('<html') === 0) {
    return { ok: false, error: 'HTML_' + code };
  }
  try {
    var body = JSON.parse(raw);
    if (body.success && body.data && body.data.url) {
      return { ok: true, body: body };
    }
    var em = body.error && body.error.message ? body.error.message : JSON.stringify(body).substring(0, 220);
    return { ok: false, error: 'API_' + em };
  } catch (eJ) {
    return { ok: false, error: 'JSON_' + code + '_' + raw.substring(0, 120) };
  }
}

/** Dựng object trả về upload ảnh từ JSON imgbb (data.url / display_url). */
function _sunImgbbBuildReturnFromBody_(body) {
  var d = body.data;
  var u1 = String(d.url || '');
  var u2 = String(d.display_url || d.url_viewer || '');
  var ext = (d.image && d.image.extension) ? String(d.image.extension).toLowerCase() : '';
  var pick = u1;
  if (/\.png(\?|#|$)/i.test(u1)) pick = u1;
  else if (/\.png(\?|#|$)/i.test(u2)) pick = u2;
  else if (ext === 'png' && u1) pick = u1;
  else pick = u1 || u2;
  return {
    ok: true,
    url: pick,
    displayUrl: u2 || u1,
    imgbbRawUrl: u1,
    imgbbExtension: ext || '',
    publicHost: 'imgbb'
  };
}

function _sunImgbbFormatUserError_(attemptLog) {
  var s = String(attemptLog || '');
  if (s.indexOf('FORBIDDEN_HTML') !== -1 || s.indexOf('HTML_') !== -1 || /forbidden/i.test(s)) {
    return 'imgbb / CDN từ chối kết nối từ IP máy chủ Google (Apps Script). Key có thể vẫn đúng. Nếu bạn chỉ dùng Google (Sheet / Web App): hãy dùng link Drive và chia sẻ file công khai - không bắt buộc imgbb. (Tuỳ chọn nâng cao: IMGBB_PROXY_URL = endpoint HTTPS ngoài Google nhận JSON {key,image,name} và forward tới api.imgbb.com.)';
  }
  return s.length > 600 ? s.substring(0, 600) + '…' : s;
}

/**
 * Gọi api.imgbb.com/1/upload với key - thử multipart (như ví dụ curl trên api.imgbb.com), form mặc định GAS, rồi IMGBB_PROXY_URL nếu có.
 */
function sunImgbbUploadWithKey_(key, cleanBase64, fileName) {
  var nameStr = String(fileName || 'sun-product').replace(/\W+/g, '-').substring(0, 80);
  var urlBase = 'https://api.imgbb.com/1/upload';
  var crlf = '\r\n';
  var attempts = [];

  function oneTry(resp, label) {
    var pr = _sunImgbbParseJsonResponse_(resp);
    if (pr.ok) {
      var out = _sunImgbbBuildReturnFromBody_(pr.body);
      out.imgbbAttempt = label;
      return out;
    }
    attempts.push(label + ':' + pr.error);
    return null;
  }

  // 1) multipart/form-data - giống hướng dẫn curl --form trên https://api.imgbb.com/
  var b1 = '----SunNutImgbb' + Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  var mp1 =
    '--' +
    b1 +
    crlf +
    'Content-Disposition: form-data; name="key"' +
    crlf +
    crlf +
    key +
    crlf +
    '--' +
    b1 +
    crlf +
    'Content-Disposition: form-data; name="image"' +
    crlf +
    crlf +
    cleanBase64 +
    crlf +
    '--' +
    b1 +
    crlf +
    'Content-Disposition: form-data; name="name"' +
    crlf +
    crlf +
    nameStr +
    crlf +
    '--' +
    b1 +
    '--' +
    crlf;
  try {
    var r1 = UrlFetchApp.fetch(urlBase, {
      method: 'post',
      contentType: 'multipart/form-data; boundary=' + b1,
      muteHttpExceptions: true,
      followRedirects: true,
      payload: mp1
    });
    var o1 = oneTry(r1, 'multipart');
    if (o1) return o1;
  } catch (e1) {
    attempts.push('multipart:EXC:' + String(e1.message || e1));
  }

  // 2) key trên query + multipart (chỉ image + name)
  var b2 = '----SunNutQ' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
  var mp2 =
    '--' +
    b2 +
    crlf +
    'Content-Disposition: form-data; name="image"' +
    crlf +
    crlf +
    cleanBase64 +
    crlf +
    '--' +
    b2 +
    crlf +
    'Content-Disposition: form-data; name="name"' +
    crlf +
    crlf +
    nameStr +
    crlf +
    '--' +
    b2 +
    '--' +
    crlf;
  try {
    var r2 = UrlFetchApp.fetch(urlBase + '?key=' + encodeURIComponent(key), {
      method: 'post',
      contentType: 'multipart/form-data; boundary=' + b2,
      muteHttpExceptions: true,
      followRedirects: true,
      payload: mp2
    });
    var o2 = oneTry(r2, 'multipartQueryKey');
    if (o2) return o2;
  } catch (e2) {
    attempts.push('multipartQueryKey:EXC:' + String(e2.message || e2));
  }

  // 3) application/x-www-form-urlencoded (payload object - Apps Script tự mã hóa)
  try {
    var r3 = UrlFetchApp.fetch(urlBase, {
      method: 'post',
      muteHttpExceptions: true,
      followRedirects: true,
      payload: {
        key: key,
        image: cleanBase64,
        name: nameStr
      }
    });
    var o3 = oneTry(r3, 'formUrlEncoded');
    if (o3) return o3;
  } catch (e3) {
    attempts.push('formUrlEncoded:EXC:' + String(e3.message || e3));
  }

  // 4) Proxy (Cloudflare Worker…): POST JSON, Worker forward sang imgbb
  var proxy = String(PropertiesService.getScriptProperties().getProperty('IMGBB_PROXY_URL') || '').trim();
  if (proxy) {
    try {
      var r4 = UrlFetchApp.fetch(proxy, {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        followRedirects: true,
        payload: JSON.stringify({ key: key, image: cleanBase64, name: nameStr })
      });
      var o4 = oneTry(r4, 'proxyJson');
      if (o4) {
        o4.viaProxy = true;
        return o4;
      }
    } catch (e4) {
      attempts.push('proxyJson:EXC:' + String(e4.message || e4));
    }
  }

  return { ok: false, error: _sunImgbbFormatUserError_(attempts.join('\n')) };
}

/**
 * Upload ảnh lên imgbb (IMGBB_API_KEY). Từ IP Google thường bị chặn - khi đó trả lỗi; chỉ Sheet thì dùng Drive.
 */
function uploadProductImageToImgbb(base64Data, fileName) {
  var key = PropertiesService.getScriptProperties().getProperty('IMGBB_API_KEY');
  if (!key) {
    return { ok: false, error: 'Thiếu IMGBB_API_KEY trong Thuộc tính tập lệnh. Tạo key tại https://api.imgbb.com/ (miễn phí) rồi dán vào Script Properties hoặc tab Admin API & Drive.' };
  }
  var clean = String(base64Data || '').replace(/^data:image\/\w+;base64,/, '');
  if (!clean || clean.length < 50) return { ok: false, error: 'Dữ liệu ảnh không hợp lệ.' };
  return sunImgbbUploadWithKey_(key, clean, fileName);
}

/**
 * Upload ảnh sản phẩm lên Google Drive (folder SUN_DRIVE_PRODUCT_FOLDER_ID), link xem cho anyone with link.
 * Nếu không có quyền ghi folder đã cấu hình: tự động lưu vào thư mục gốc Drive của tài khoản chạy script (fallback), vẫn link view công khai.
 */
function uploadProductImageToDrive(base64Data, fileName) {
  try {
    const clean = String(base64Data || '').replace(/^data:image\/\w+;base64,/, '');
    if (!clean || clean.length < 50) return { ok: false, error: 'Dữ liệu ảnh không hợp lệ.' };
    const bytes = Utilities.base64Decode(clean);
    let mime = 'image/jpeg';
    if (String(base64Data).indexOf('image/png') !== -1) mime = 'image/png';
    if (String(base64Data).indexOf('image/webp') !== -1) mime = 'image/webp';
    if (String(base64Data).indexOf('image/gif') !== -1) mime = 'image/gif';
    const ext = mime.indexOf('png') !== -1 ? '.png' : (mime.indexOf('webp') !== -1 ? '.webp' : (mime.indexOf('gif') !== -1 ? '.gif' : '.jpg'));
    const safeName = String(fileName || 'sun-product').replace(/\W+/g, '-').substring(0, 72) + ext;
    const blob = Utilities.newBlob(bytes, mime, safeName);
    var folderId = PropertiesService.getScriptProperties().getProperty('SUN_DRIVE_PRODUCT_FOLDER_ID') || SUN_DRIVE_PRODUCT_FOLDER_ID;
    var folder = null;
    var usedRoot = false;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (eFolder) {
      folder = null;
    }
    if (!folder) {
      try {
        folder = DriveApp.getRootFolder();
        usedRoot = true;
      } catch (eRoot) {
        return { ok: false, error: String(eRoot && eRoot.message ? eRoot.message : eRoot) + ' - Chia sẻ folder Drive (ID trong Script Properties) cho đúng tài khoản deploy script (Quyền Biên tập), hoặc chạy authorizeSunNutMilkNetworkAndDrive() trong Editor rồi Deploy lại web app.' };
      }
    }
    var file = null;
    try {
      file = folder.createFile(blob);
    } catch (eCreate) {
      if (!usedRoot && folderId) {
        try {
          file = DriveApp.getRootFolder().createFile(blob);
          usedRoot = true;
        } catch (e2) {
          return { ok: false, error: String(eCreate && eCreate.message ? eCreate.message : eCreate) + ' - Không ghi được vào folder sản phẩm; thử thư mục gốc Drive cũng lỗi. Kiểm tra quyền Biên tập trên folder.' };
        }
      } else {
        return { ok: false, error: String(eCreate && eCreate.message ? eCreate.message : eCreate) + ' - Không tạo được file trên Drive.' };
      }
    }
    var id = file.getId();
    var viewUrl = 'https://drive.google.com/uc?export=view&id=' + id;
    var sharingLimited = false;
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eShare) {
      sharingLimited = true;
    }
    var out = { ok: true, url: viewUrl, displayUrl: viewUrl, fileId: id };
    if (usedRoot) {
      out.storedInDriveRoot = true;
      out.hint = 'Ảnh đã lưu vào thư mục gốc Drive (fallback) vì không mở được folder sản phẩm. Nên sửa SUN_DRIVE_PRODUCT_FOLDER_ID + chia sẻ folder cho tài khoản deploy.';
    }
    if (sharingLimited) {
      out.sharingLimited = true;
      out.hint = (out.hint ? out.hint + ' ' : '') + 'File đã tạo nhưng chưa bật được chia sẻ «Anyone with link» (thường do chính sách Google Workspace). Link vẫn dùng được cho tài khoản có quyền xem file; POS khách vãng lai có thể cần chỉnh chính sách hoặc dùng link ảnh công khai khác.';
    }
    return out;
  } catch (e) {
    var msg = String(e.message || e);
    var hint = ' - Chia sẻ folder Drive cho tài khoản chủ script (Quyền Biên tập), Deploy lại + chạy upload một lần trong Editor để cấp quyền Drive.';
    if (msg.indexOf('Access denied') !== -1 || msg.indexOf('Truy cập bị từ chối') !== -1 || msg.indexOf('permission') !== -1) {
      hint += ' Hoặc bật fallback: script sẽ thử thư mục gốc nếu folder ID sai/quyền folder.';
    }
    return { ok: false, error: msg + hint };
  }
}

/**
 * Tương thích tên hàm cũ: chỉ upload imgbb từ máy chủ (IP Google thường bị chặn).
 * Trang Admin đã chuyển sang upload imgbb từ trình duyệt - không còn lưu Drive trong luồng này.
 */
function uploadProductImageToDriveOrImgbb(base64Data, fileName) {
  return uploadProductImageToImgbb(base64Data, fileName);
}

/**
 * Server-side: tải ảnh từ URL và lưu vào Drive folder sản phẩm.
 * Dùng cho AI gallery chọn ảnh (không dính CORS trình duyệt).
 */
function saveAiImageUrlToDrive(imageUrl, fileName) {
  try {
    var url = String(imageUrl || '').trim();
    if (!url) return { ok: false, error: 'Thiếu URL ảnh' };
    var safe = String(fileName || 'sun-ai').replace(/\W+/g, '-').substring(0, 72);
    // fetch image
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        // some hosts require UA
        'User-Agent': 'Mozilla/5.0 (AppsScript) SUN-NUT-MILK'
      }
    });
    var code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      return { ok: false, error: 'Fetch ảnh lỗi HTTP ' + code + ': ' + String(resp.getContentText() || '').slice(0, 180) };
    }
    var blob = resp.getBlob();
    var ctype = String(blob.getContentType() || '').toLowerCase();
    var ext = '.jpg';
    if (ctype.indexOf('png') >= 0) ext = '.png';
    else if (ctype.indexOf('webp') >= 0) ext = '.webp';
    else if (ctype.indexOf('gif') >= 0) ext = '.gif';
    blob.setName(safe + ext);

    var folderId = PropertiesService.getScriptProperties().getProperty('SUN_DRIVE_PRODUCT_FOLDER_ID') || SUN_DRIVE_PRODUCT_FOLDER_ID;
    var folder = null;
    var usedRoot = false;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (eF) {
      folder = null;
    }
    if (!folder) {
      folder = DriveApp.getRootFolder();
      usedRoot = true;
    }
    var file = null;
    try {
      file = folder.createFile(blob);
    } catch (eCr) {
      if (!usedRoot) {
        file = DriveApp.getRootFolder().createFile(blob);
        usedRoot = true;
      } else {
        return { ok: false, error: String(eCr && eCr.message ? eCr.message : eCr) };
      }
    }
    var id = file.getId();
    var viewUrl = 'https://drive.google.com/uc?export=view&id=' + id;
    var sharingLimited = false;
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eSh) {
      sharingLimited = true;
    }
    var out = { ok: true, url: viewUrl, displayUrl: viewUrl, fileId: id };
    if (usedRoot) out.storedInDriveRoot = true;
    if (sharingLimited) {
      out.sharingLimited = true;
      out.hint = 'File đã tạo trên Drive nhưng chưa bật được chia sẻ công khai (Workspace).';
    }
    return out;
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/** Chạy một lần trong Editor sau khi thêm scope Drive + external_request - cấp quyền khi được hỏi. */
function authorizeSunNutMilkNetworkAndDrive() {
  // GET (mặc định) - Apps Script không chấp nhận method: 'head' tại một số runtime.
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  DriveApp.getRootFolder();
  return 'OK - đã kích hoạt quyền UrlFetch + Drive. Triển khai lại Web app nếu POS vẫn báo thiếu quyền.';
}

/**
 * TTS tiếng Việt cho thông báo thanh toán.
 * Thứ tự: (1) Google Cloud Text-to-Speech nếu có GOOGLE_CLOUD_TTS_API_KEY trong Script Properties
 * (2) API dự phòng Diễm My.
 * Bật API "Cloud Text-to-Speech" + tạo key: https://cloud.google.com/text-to-speech/docs/basics
 */
function getVietTtsPaymentAudioBase64(text) {
  const t = String(text || '').trim().substring(0, 450);
  if (!t) return { ok: false, error: 'Không có nội dung đọc.' };

  const gKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLOUD_TTS_API_KEY');
  if (gKey) {
    const ttsUrl = 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(gKey);
    const voiceNames = ['vi-VN-Neural2-A', 'vi-VN-Neural2-D', 'vi-VN-Wavenet-A', 'vi-VN-Standard-A'];
    for (var vi = 0; vi < voiceNames.length; vi++) {
      try {
        const payload = {
          input: { text: t },
          voice: { languageCode: 'vi-VN', name: voiceNames[vi] },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0.0 }
        };
        const resp = UrlFetchApp.fetch(ttsUrl, {
          method: 'post',
          contentType: 'application/json',
          muteHttpExceptions: true,
          payload: JSON.stringify(payload)
        });
        if (resp.getResponseCode() !== 200) continue;
        const json = JSON.parse(resp.getContentText());
        if (json.audioContent) {
          return { ok: true, mimeType: 'audio/mpeg', base64: json.audioContent, engine: 'google-cloud' };
        }
      } catch (eG) { }
    }
  }

  const voice = 'hcm-diemmy';
  const speed = '0.95';
  const url = 'https://xs679698.xsrv.jp/zalo?input=' + encodeURIComponent(t) + '&voice=' + encodeURIComponent(voice) + '&speed=' + speed;
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) {
      return { ok: false, error: 'TTS HTTP ' + resp.getResponseCode() };
    }
    const blob = resp.getBlob();
    if (!blob || blob.getBytes().length < 80) {
      return { ok: false, error: 'Phản hồi TTS không hợp lệ (quá ngắn).' };
    }
    const mt = blob.getContentType() || 'audio/mpeg';
    return { ok: true, mimeType: mt, base64: Utilities.base64Encode(blob.getBytes()), engine: 'fallback' };
  } catch (e2) {
    return { ok: false, error: String(e2.message || e2) };
  }
}

/**
 * Hướng dẫn cấu hình key - KHÔNG ghi API key thật vào mã nguồn (dễ lộ khi chia sẻ repo).
 * Vào Apps Script → Project Settings → Script Properties, thêm tay:
 * - GEMINI_API_KEY (tuỳ chọn, cho AI)
 * - IMGBB_PROXY_URL (tuỳ chọn, nâng cao: chỉ khi có HTTPS ngoài Google; triển khai chỉ Sheet thì không cần)
 * - SUN_DRIVE_PRODUCT_FOLDER_ID (ID folder ảnh sản phẩm, chia sẻ quyền Biên tập cho tài khoản deploy web app)
 */
function setupSunExternalKeys() {
  return 'Không còn ghi key mặc định trong mã. Script Properties: GEMINI_API_KEY, IMGBB_API_KEY (tuỳ chọn - thường không hoạt động từ IP Google), IMGBB_PROXY_URL (tuỳ chọn nâng cao, không cần nếu chỉ Google), SUN_DRIVE_PRODUCT_FOLDER_ID. Tab Admin «API & Drive» có thể lưu. Chạy authorizeSunNutMilkNetworkAndDrive() trong Editor và Deploy lại web app.';
}

/** Ẩn bớt secret khi trả về Admin (không gửi full key xuống client). */
function _sunMaskSecret_(s) {
  s = String(s || '');
  if (!s) return '';
  if (s.length <= 10) return '••••••••';
  return s.substring(0, 4) + '…' + s.substring(s.length - 4);
}

/** Trích ID folder từ URL Drive hoặc chuỗi ID thuần. */
function normalizeSunDriveFolderId_(input) {
  var s = String(input || '').trim();
  if (!s) return '';
  var m1 = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  var m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]+$/.test(s)) return s;
  return s.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Admin: đọc trạng thái cấu hình API / Drive (masked, không trả full key).
 */
function getSunAdminApiConfig() {
  var p = PropertiesService.getScriptProperties();
  var g = String(p.getProperty('GEMINI_API_KEY') || '').trim();
  var i = String(p.getProperty('IMGBB_API_KEY') || '').trim();
  var fidProp = String(p.getProperty('SUN_DRIVE_PRODUCT_FOLDER_ID') || '').trim();
  var defId = (typeof SUN_DRIVE_PRODUCT_FOLDER_ID !== 'undefined' && SUN_DRIVE_PRODUCT_FOLDER_ID)
    ? String(SUN_DRIVE_PRODUCT_FOLDER_ID).trim() : '';
  var fid = fidProp || defId;
  var pxy = String(p.getProperty('IMGBB_PROXY_URL') || '').trim();
  return {
    ok: true,
    hasGemini: !!g,
    hasImgbb: !!i,
    hasImgbbProxy: !!pxy,
    imgbbProxyUrl: pxy,
    /** Gợi ý UI: upload ảnh menu/mix từ trình duyệt → imgbb */
    imgbbClientUpload: true,
    driveFolderId: fid,
    driveFolderFromProperty: !!fidProp,
    driveFolderUrl: fid ? ('https://drive.google.com/drive/folders/' + fid) : '',
    geminiMasked: _sunMaskSecret_(g),
    imgbbMasked: _sunMaskSecret_(i)
  };
}

/**
 * Admin: lưu GEMINI_API_KEY / IMGBB_API_KEY / IMGBB_PROXY_URL (https, tuỳ chọn) / SUN_DRIVE_PRODUCT_FOLDER_ID vào Script Properties.
 * Chỉ cập nhật trường có giá trị (trim khác rỗng). Để giữ key cũ: để trống ô tương ứng.
 */
function saveSunAdminApiConfig(payload) {
  payload = payload || {};
  var p = PropertiesService.getScriptProperties();
  var updates = {};
  var g = String(payload.geminiKey != null ? payload.geminiKey : '').trim();
  var im = String(payload.imgbbKey != null ? payload.imgbbKey : '').trim();
  var fdRaw = String(payload.driveFolderId != null ? payload.driveFolderId : '').trim();
  var fd = normalizeSunDriveFolderId_(fdRaw);
  var px = String(payload.imgbbProxyUrl != null ? payload.imgbbProxyUrl : '').trim();
  if (px) {
    if (!/^https:\/\//i.test(px)) {
      return { ok: false, error: 'IMGBB_PROXY_URL phải là https://… (chỉ dùng khi có máy chủ proxy ngoài Google).' };
    }
    updates.IMGBB_PROXY_URL = px;
  }
  if (g) updates.GEMINI_API_KEY = g;
  if (im) updates.IMGBB_API_KEY = im;
  if (fd) updates.SUN_DRIVE_PRODUCT_FOLDER_ID = fd;
  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'Không có dữ liệu mới: nhập ít nhất một key hoặc ID folder (hoặc dán link folder Drive) rồi bấm Lưu.' };
  }
  p.setProperties(updates, false);
  return { ok: true, savedKeys: Object.keys(updates) };
}

/**
 * Trả IMGBB_API_KEY cho trang Admin - upload imgbb trực tiếp từ trình duyệt (tránh IP Google bị chặn).
 */
function getSunImgbbClientUploadKey() {
  var k = String(PropertiesService.getScriptProperties().getProperty('IMGBB_API_KEY') || '').trim();
  if (!k) {
    return { ok: false, error: 'Chưa lưu IMGBB_API_KEY. Tab Admin → API & Drive → dán key → Lưu.' };
  }
  return { ok: true, key: k };
}

/** Admin: test Gemini - dùng key tạm nếu truyền; không thì dùng Script Properties. Thử vài model Flash phổ biến. */
function testSunAdminGemini(apiKeyOptional) {
  var k = String(apiKeyOptional != null ? apiKeyOptional : '').trim();
  if (!k) k = String(PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '').trim();
  if (!k) return { ok: false, error: 'Chưa có GEMINI_API_KEY (nhập key rồi Test, hoặc Lưu trước).' };
  var models = ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];
  var lastErr = '';
  var payload = JSON.stringify({
    contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
    generationConfig: { maxOutputTokens: 16, temperature: 0 }
  });
  for (var mi = 0; mi < models.length; mi++) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + models[mi] + ':generateContent?key=' + encodeURIComponent(k);
    try {
      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: payload
      });
      var code = response.getResponseCode();
      var raw = response.getContentText() || '';
      var result;
      try {
        result = JSON.parse(raw);
      } catch (eParse) {
        lastErr = 'HTTP ' + code + ' (không parse JSON): ' + raw.substring(0, 200);
        continue;
      }
      if (result.error) {
        lastErr = result.error.message || JSON.stringify(result.error);
        continue;
      }
      if (code !== 200) {
        lastErr = 'HTTP ' + code + ': ' + raw.substring(0, 220);
        continue;
      }
      var cand = result.candidates && result.candidates[0];
      var parts = cand && cand.content && cand.content.parts;
      if (!parts || !parts[0] || !parts[0].text) {
        lastErr = 'Model không trả nội dung (có thể safety).';
        continue;
      }
      return { ok: true, message: 'Gemini phản hồi OK (model: ' + models[mi] + ').' };
    } catch (e) {
      var msg = String(e.message || e);
      if (msg.indexOf('external_request') !== -1 || msg.indexOf('script.external_request') !== -1) {
        return { ok: false, error: 'Thiếu quyền gọi mạng. Trong Editor chạy authorizeSunNutMilkNetworkAndDrive() rồi Deploy lại web app (Execute as: bạn).' };
      }
      lastErr = msg;
    }
  }
  return { ok: false, error: lastErr || 'Không gọi được Gemini với các model đã thử.' };
}

/** Admin: test imgbb - dùng cùng luồng upload thật (multipart + proxy nếu có). */
function testSunAdminImgbb(apiKeyOptional) {
  var k = String(apiKeyOptional != null ? apiKeyOptional : '').trim();
  if (!k) k = String(PropertiesService.getScriptProperties().getProperty('IMGBB_API_KEY') || '').trim();
  if (!k) return { ok: false, error: 'Chưa có IMGBB_API_KEY (nhập key rồi Test, hoặc Lưu trước).' };
  var clean = 'R0lGODlhAQABAIAAAAUEwAAAACwAAAAAAQABAAACAkQBADs=';
  var r = sunImgbbUploadWithKey_(k, clean, 'sun-admin-test');
  if (r && r.ok) {
    return {
      ok: true,
      message: 'imgbb nhận ảnh test thành công' + (r.viaProxy ? ' (qua IMGBB_PROXY_URL).' : '.'),
      sampleUrl: r.url || '',
      attempt: r.imgbbAttempt || ''
    };
  }
  return { ok: false, error: r && r.error ? r.error : 'Test imgbb thất bại.' };
}

/** Admin: test quyền mở folder Drive - folderId tùy chọn (ô form), không thì Property + fallback mã nguồn. */
function testSunAdminDriveFolder(folderIdOptional) {
  var raw = String(folderIdOptional != null ? folderIdOptional : '').trim();
  var id = normalizeSunDriveFolderId_(raw);
  if (!id) {
    id = String(PropertiesService.getScriptProperties().getProperty('SUN_DRIVE_PRODUCT_FOLDER_ID') || '').trim();
  }
  if (!id && typeof SUN_DRIVE_PRODUCT_FOLDER_ID !== 'undefined' && SUN_DRIVE_PRODUCT_FOLDER_ID) {
    id = String(SUN_DRIVE_PRODUCT_FOLDER_ID).trim();
  }
  if (!id) return { ok: false, error: 'Chưa có ID folder (nhập ID hoặc dán link folder rồi Test / Lưu).' };
  try {
    var f = DriveApp.getFolderById(id);
    var n = f.getName();
    return {
      ok: true,
      message: 'Mở được folder: «' + n + '».',
      folderId: id,
      folderUrl: 'https://drive.google.com/drive/folders/' + id
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e.message || e) + ' - Kiểm tra ID đúng chưa; folder phải được chia sẻ quyền Biên tập cho tài khoản chạy web app (Execute as).'
    };
  }
}

/**
 * Khuyến mãi trong ngày: chương trình đang hiệu lực + thống kê đơn hôm nay có giảm giá.
 */
function getTodayPromoDigest() {
  const now = new Date();
  const promos = getPromotions();
  const activeLines = [];
  promos.forEach(function (p) {
    if (String(p.type || '').toLowerCase() === 'info') return;
    const s = p.startDate ? new Date(p.startDate) : null;
    const e = p.endDate ? new Date(p.endDate) : null;
    if (s && s > now) return;
    if (e && e < now) return;
    const off = p.type === 'percent' ? p.value + '%' : (p.value || 0).toLocaleString('vi-VN') + '₫';
    var dateR = '';
    try {
      var ds = p.startDate ? new Date(p.startDate) : null;
      var de = p.endDate ? new Date(p.endDate) : null;
      if (ds && !isNaN(ds.getTime())) dateR += 'Từ ' + ds.toLocaleDateString('vi-VN');
      if (de && !isNaN(de.getTime())) dateR += (dateR ? ' đến ' : '') + de.toLocaleDateString('vi-VN');
    } catch (eD) {
      dateR = '';
    }
    activeLines.push({
      code: p.code,
      name: p.name,
      type: p.type,
      value: p.value,
      minOrder: p.minOrder || 0,
      ruleType: p.ruleType || '',
      discountLabel: off,
      dateRange: dateR || 'Theo cấu hình sheet',
      summary: p.name + ' - Mã ' + p.code + ': giảm ' + off + (p.minOrder ? ' (đơn từ ' + p.minOrder.toLocaleString('vi-VN') + '₫)' : '')
    });
  });

  const orders = getOrders('today');
  let ordersWithDiscount = 0;
  let totalDiscount = 0;
  const codeCount = {};
  var hourlyDisc = [];
  for (var hi = 0; hi < 24; hi++) hourlyDisc[hi] = 0;
  orders.forEach(function (o) {
    const st = String(o.status || '');
    if (st.indexOf('Hủy') !== -1) return;
    if (st !== 'Hoàn thành') return;
    const d = parseFloat(o.discount) || 0;
    if (d <= 0) return;
    ordersWithDiscount++;
    totalDiscount += d;
    const c = String(o.promoCode || '').trim();
    if (c) codeCount[c] = (codeCount[c] || 0) + 1;
    var th = _parseOrderDate_(o.time).getHours();
    if (!isNaN(th) && th >= 0 && th < 24) hourlyDisc[th] += d;
  });

  return {
    dateLabel: now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }),
    activePromos: activeLines,
    ordersWithPromoToday: ordersWithDiscount,
    totalPromoCostToday: totalDiscount,
    promoCodeUsageToday: codeCount,
    promoDiscountHourlyToday: hourlyDisc
  };
}

// ============================================================
// 9. BÁO CÁO DÒNG TIỀN
// ============================================================
function getCashFlowReport(periodType) {
  const cacheKey = 'cashflow_' + periodType;
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;

  const now = new Date();
  let startDate = new Date(2000, 0, 1);
  if (periodType === 'today') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (periodType === 'week') { const d = now.getDay()||7; startDate = new Date(now); startDate.setHours(0,0,0,0); startDate.setDate(startDate.getDate()-(d-1)); }
  else if (periodType === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);

  const stockTx = getStockTransactionLog(null, null).filter(tx => {
    return tx.type === 'Phiếu Nhập' && new Date(tx.time) >= startDate;
  });
  const orders = getOrders(periodType);
  const ordersDone = orders.filter(function (o) { return _ordersCompletedStatus_(o.status); });
  const revenue = ordersDone.reduce((s, o) => s + (o.finalAmount || 0), 0);
  const stockCost = stockTx.reduce((s, tx) => s + (tx.total || 0), 0);
  
  // Group by day
  const dailyMap = {};
  ordersDone.forEach(o => {
    const day = new Date(o.time).toLocaleDateString('vi-VN');
    if (!dailyMap[day]) dailyMap[day] = { revenue: 0, orders: 0, cost: 0 };
    dailyMap[day].revenue += o.finalAmount || 0;
    dailyMap[day].orders++;
  });
  
  const result = {
    revenue, stockCost,
    grossProfit: revenue - stockCost,
    orderCount: ordersDone.length,
    avgOrder: ordersDone.length > 0 ? Math.round(revenue / ordersDone.length) : 0,
    dailyData: Object.entries(dailyMap).map(([date, d]) => ({ date, ...d }))
  };

  CACHE.set(cacheKey, result, 15); // Lưu cache 15s cho Polling
  return result;
}

// ============================================================
// 10. GIAO CA & NHÀ CUNG CẤP
// ============================================================
function getShiftData() {
  const props = PropertiesService.getScriptProperties();
  const todayOrders = getOrders('today').filter(function (o) { return _ordersCompletedStatus_(o.status); });
  let cashSales = 0, bankSales = 0;
  todayOrders.forEach(o => {
    if (o.paymentMethod === 'Tiền mặt') cashSales += o.finalAmount;
    else bankSales += o.finalAmount;
  });
  return {
    openCash: parseFloat(props.getProperty('SHIFT_CASH')) || 0,
    openBank: parseFloat(props.getProperty('SHIFT_BANK')) || 0,
    cashSales: cashSales,
    bankSales: bankSales,
    cashExpenses: parseFloat(props.getProperty('SHIFT_EXPENSE')) || 0
  };
}

var SUPPLIERS_HEADERS_EXTRA = ['Zalo'];

function ensureSuppliersExtraColumns(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  SUPPLIERS_HEADERS_EXTRA.forEach(function (title) {
    if (headers.indexOf(title) === -1) {
      sheet.getRange(1, lastCol + 1).setValue(title);
      lastCol++;
      headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    }
  });
}

function getSuppliers() {
  const headersDef = ["Tên NCC", "SĐT", "Sản phẩm", "Đánh giá", "Ghi chú"];
  const sheet = getSheet("Suppliers", headersDef);
  ensureSuppliersExtraColumns(sheet);
  if (sheet.getLastRow() < 2) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var ix = function (n) { return headers.indexOf(n); };
  return sheet.getDataRange().getValues().slice(1).map(function (r) {
    return {
      name: String((ix('Tên NCC') > -1 ? r[ix('Tên NCC')] : r[0]) || ''),
      phone: String((ix('SĐT') > -1 ? r[ix('SĐT')] : r[1]) || ''),
      zalo: String((ix('Zalo') > -1 ? r[ix('Zalo')] : '') || ''),
      products: String((ix('Sản phẩm') > -1 ? r[ix('Sản phẩm')] : r[2]) || ''),
      rating: String((ix('Đánh giá') > -1 ? r[ix('Đánh giá')] : r[3]) || ''),
      note: String((ix('Ghi chú') > -1 ? r[ix('Ghi chú')] : r[4]) || '')
    };
  }).filter(function (s) { return s.name; });
}

function saveSupplier(data) {
  const sheet = getSheet("Suppliers", ["Tên NCC", "SĐT", "Sản phẩm", "Đánh giá", "Ghi chú"]);
  ensureSuppliersExtraColumns(sheet);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) {
    if (h === 'Tên NCC') return data.name || '';
    if (h === 'SĐT') return data.phone || '';
    if (h === 'Zalo') return data.zalo || '';
    if (h === 'Sản phẩm') return data.products || '';
    if (h === 'Đánh giá') return data.rating != null && data.rating !== '' ? data.rating : 5;
    if (h === 'Ghi chú') return data.note || '';
    return '';
  });
  sheet.appendRow(row);
  return "Đã thêm nhà cung cấp!";
}

/** Cập nhật NCC theo tên ban đầu (originalName) hoặc tên hiện tại. */
function updateSupplier(data) {
  const sheet = getSheet("Suppliers", ["Tên NCC", "SĐT", "Sản phẩm", "Đánh giá", "Ghi chú"]);
  ensureSuppliersExtraColumns(sheet);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var ix = function (n) { return headers.indexOf(n); };
  var colName = ix('Tên NCC');
  if (colName < 0) colName = 0;
  var want = String(data.originalName || data.name || '').trim();
  if (!want) return { ok: false, message: 'Thiếu tên NCC' };
  var last = sheet.getLastRow();
  for (var r = 2; r <= last; r++) {
    var nm = String(sheet.getRange(r, colName + 1).getValue() || '').trim();
    if (nm === want) {
      var existing = sheet.getRange(r, 1, 1, headers.length).getValues()[0];
      var row = headers.map(function (h, idx) {
        if (h === 'Tên NCC') return data.name != null && String(data.name).trim() !== '' ? data.name : existing[idx];
        if (h === 'SĐT') return data.phone != null ? data.phone : existing[idx];
        if (h === 'Zalo') return data.zalo != null ? data.zalo : existing[idx];
        if (h === 'Sản phẩm') return data.products != null ? data.products : existing[idx];
        if (h === 'Đánh giá') return data.rating != null && data.rating !== '' ? data.rating : existing[idx];
        if (h === 'Ghi chú') return data.note != null ? data.note : existing[idx];
        return existing[idx];
      });
      sheet.getRange(r, 1, 1, headers.length).setValues([row]);
      return { ok: true, message: 'Đã cập nhật NCC' };
    }
  }
  return { ok: false, message: 'Không tìm thấy NCC' };
}

// ============================================================
// 11. VỐN ĐỐI TÁC / CHI PHÍ / TÀI SẢN / HỖ TRỢ KÊ KHAI THUẾ
// (XML/PDF: hỗ trợ nội bộ - không thay thế hồ sơ điện tử đã ký số trên etax.dientu.gdt.gov.vn)
// ============================================================

function _capitalPartnersHeaders_() {
  return ['Tên đối tác', 'Vốn góp', 'Tỷ lệ LN %', 'Ngày góp', 'Liên hệ', 'Ghi chú', 'Kích hoạt'];
}

function _operatingCostHeaders_() {
  return ['Ngày', 'Loại', 'Nội dung', 'Số tiền', 'Ghi chú'];
}

function _fixedAssetHeaders_() {
  return ['Tên tài sản', 'Ngày mua', 'Giá mua', 'Nhà cung cấp', 'SĐT/LH', 'Bảo hành đến', 'Ghi chú', 'Link chứng từ'];
}

function _monthBounds_(year, month1to12) {
  var y = parseInt(year, 10) || new Date().getFullYear();
  var m = parseInt(month1to12, 10);
  if (isNaN(m) || m < 1 || m > 12) m = new Date().getMonth() + 1;
  var start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  var end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start: start, end: end, year: y, month: m };
}

function _quarterBounds_(year, quarter1to4) {
  var y = parseInt(year, 10) || new Date().getFullYear();
  var q = parseInt(quarter1to4, 10);
  if (isNaN(q) || q < 1 || q > 4) q = Math.floor((new Date().getMonth()) / 3) + 1;
  var m0 = (q - 1) * 3;
  var start = new Date(y, m0, 1, 0, 0, 0, 0);
  var end = new Date(y, m0 + 3, 0, 23, 59, 59, 999);
  return { start: start, end: end, year: y, quarter: q };
}

function _getOrdersBetweenDates_(startDate, endDate) {
  var sheet = _getOrdersSheet_(ORDERS_HEADERS_STD);
  if (sheet.getLastRow() < 2) return [];
  var cmap = _ordersColumnMap_(sheet);
  var data = sheet.getDataRange().getValues().slice(1);
  var s = startDate.getTime();
  var e = endDate.getTime();
  return data.filter(function (r) {
    var t = _parseOrderDate_(_ordersCell_(r, cmap, 'Thời gian', 1)).getTime();
    return t >= s && t <= e;
  }).map(function (r) {
    return mapOrderRow(r, cmap);
  });
}

function _sumStockImportCostBetween_(startDate, endDate) {
  var s0 = startDate.getTime();
  var e0 = endDate.getTime();
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log_NhapKho');
  if (!sh || sh.getLastRow() < 2) return 0;
  var data = sh.getDataRange().getValues().slice(1);
  var sum = 0;
  for (var i = 0; i < data.length; i++) {
    var t = new Date(data[i][0]).getTime();
    if (isNaN(t) || t < s0 || t > e0) continue;
    sum += parseFloat(data[i][5]) || 0;
  }
  return sum;
}

function _sumOperatingCostsBetween_(startDate, endDate) {
  var sheet = getSheet('ChiPhiVanHanh', _operatingCostHeaders_());
  if (sheet.getLastRow() < 2) return 0;
  var s0 = startDate.getTime();
  var e0 = endDate.getTime();
  var rows = sheet.getDataRange().getValues().slice(1);
  var sum = 0;
  for (var i = 0; i < rows.length; i++) {
    var t = new Date(rows[i][0]).getTime();
    if (isNaN(t) || t < s0 || t > e0) continue;
    sum += parseFloat(rows[i][3]) || 0;
  }
  return sum;
}

function _sumOrderCogsCompletedBetween_(startDate, endDate) {
  var orders = _getOrdersBetweenDates_(startDate, endDate);
  var sum = 0;
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    if (!_ordersCompletedStatus_(o.status)) continue;
    var items = o.items || [];
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      var q = parseInt(it.quantity, 10) || 1;
      var c = parseFloat(it.costPrice) || 0;
      sum += c * q;
    }
  }
  return sum;
}

function _sumFixedAssetPurchasesBetween_(startDate, endDate) {
  var sheet = getSheet('TaiSanCoDinh', _fixedAssetHeaders_());
  if (sheet.getLastRow() < 2) return 0;
  var s0 = startDate.getTime();
  var e0 = endDate.getTime();
  var rows = sheet.getDataRange().getValues().slice(1);
  var sum = 0;
  for (var i = 0; i < rows.length; i++) {
    var t = new Date(rows[i][1]).getTime();
    if (isNaN(t) || t < s0 || t > e0) continue;
    sum += parseFloat(rows[i][2]) || 0;
  }
  return sum;
}

function getPartners() {
  var sheet = getSheet('Partners', _capitalPartnersHeaders_());
  if (sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues().slice(1).map(function (r, idx) {
    return {
      name: String(r[0] || '').trim(),
      capital: parseFloat(r[1]) || 0,
      profitSharePct: r[2] === '' || r[2] == null ? null : parseFloat(r[2]),
      joinDate: r[3],
      contact: String(r[4] || ''),
      note: String(r[5] || ''),
      active: r[6] !== false && String(r[6]).toUpperCase() !== 'FALSE',
      sheetRow: idx + 2
    };
  }).filter(function (p) {
    return p.name;
  });
}

function savePartner(data) {
  var sheet = getSheet('Partners', _capitalPartnersHeaders_());
  var name = String(data.name || '').trim();
  if (!name) return { ok: false, message: 'Thiếu tên' };
  var capital = parseFloat(data.capital) || 0;
  var psp = data.profitSharePct === '' || data.profitSharePct == null ? '' : parseFloat(data.profitSharePct);
  var row = [name, capital, isNaN(psp) ? '' : psp, data.joinDate || new Date(), data.contact || '', data.note || '', data.active !== false];
  var last = sheet.getLastRow();
  for (var r = 2; r <= last; r++) {
    if (String(sheet.getRange(r, 1).getValue() || '').trim() === name) {
      sheet.getRange(r, 1, 1, 7).setValues([row]);
      return { ok: true, message: 'Đã cập nhật đối tác' };
    }
  }
  sheet.appendRow(row);
  return { ok: true, message: 'Đã thêm đối tác' };
}

function deletePartnerByRow(rowIndex) {
  var ri = parseInt(rowIndex, 10);
  if (isNaN(ri) || ri < 2) return { ok: false, message: 'Dòng không hợp lệ' };
  var sheet = getSheet('Partners', _capitalPartnersHeaders_());
  if (ri > sheet.getLastRow()) return { ok: false, message: 'Không có dòng' };
  sheet.deleteRow(ri);
  return { ok: true, message: 'Đã xóa' };
}

function getOperatingCostsList(year, month) {
  var b = _monthBounds_(year, month);
  var sheet = getSheet('ChiPhiVanHanh', _operatingCostHeaders_());
  if (sheet.getLastRow() < 2) return [];
  var s0 = b.start.getTime();
  var e0 = b.end.getTime();
  return sheet.getDataRange().getValues().slice(1).filter(function (r) {
    var t = new Date(r[0]).getTime();
    return !isNaN(t) && t >= s0 && t <= e0;
  }).map(function (r) {
    return { date: r[0], type: String(r[1] || ''), desc: String(r[2] || ''), amount: parseFloat(r[3]) || 0, note: String(r[4] || '') };
  });
}

function saveOperatingCost(data) {
  var sheet = getSheet('ChiPhiVanHanh', _operatingCostHeaders_());
  sheet.appendRow([data.date ? new Date(data.date) : new Date(), data.type || 'KHAC', data.desc || '', parseFloat(data.amount) || 0, data.note || '']);
  return { ok: true, message: 'Đã lưu chi phí' };
}

function getFixedAssets() {
  var sheet = getSheet('TaiSanCoDinh', _fixedAssetHeaders_());
  if (sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues().slice(1).map(function (r, idx) {
    return {
      name: String(r[0] || '').trim(),
      purchaseDate: r[1],
      price: parseFloat(r[2]) || 0,
      supplier: String(r[3] || ''),
      supplierPhone: String(r[4] || ''),
      warrantyUntil: r[5],
      note: String(r[6] || ''),
      proofUrl: String(r[7] || ''),
      sheetRow: idx + 2
    };
  }).filter(function (a) {
    return a.name;
  });
}

function saveFixedAsset(data) {
  var sheet = getSheet('TaiSanCoDinh', _fixedAssetHeaders_());
  sheet.appendRow([
    data.name || '',
    data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
    parseFloat(data.price) || 0,
    data.supplier || '',
    data.supplierPhone || '',
    data.warrantyUntil ? new Date(data.warrantyUntil) : '',
    data.note || '',
    data.proofUrl || ''
  ]);
  return { ok: true, message: 'Đã lưu tài sản' };
}

function updateFixedAsset(data) {
  var sheet = getSheet('TaiSanCoDinh', _fixedAssetHeaders_());
  var want = String(data.originalName || data.name || '').trim();
  if (!want) return { ok: false, message: 'Thiếu tên' };
  var last = sheet.getLastRow();
  for (var r = 2; r <= last; r++) {
    if (String(sheet.getRange(r, 1).getValue() || '').trim() === want) {
      var row = [
        data.name != null ? data.name : sheet.getRange(r, 1).getValue(),
        data.purchaseDate != null ? new Date(data.purchaseDate) : sheet.getRange(r, 2).getValue(),
        data.price != null ? parseFloat(data.price) : sheet.getRange(r, 3).getValue(),
        data.supplier != null ? data.supplier : sheet.getRange(r, 4).getValue(),
        data.supplierPhone != null ? data.supplierPhone : sheet.getRange(r, 5).getValue(),
        data.warrantyUntil != null ? new Date(data.warrantyUntil) : sheet.getRange(r, 6).getValue(),
        data.note != null ? data.note : sheet.getRange(r, 7).getValue(),
        data.proofUrl != null ? data.proofUrl : sheet.getRange(r, 8).getValue()
      ];
      sheet.getRange(r, 1, 1, 8).setValues([row]);
      return { ok: true, message: 'Đã cập nhật' };
    }
  }
  return { ok: false, message: 'Không tìm thấy' };
}

function deleteFixedAssetByRow(rowIndex) {
  var ri = parseInt(rowIndex, 10);
  if (isNaN(ri) || ri < 2) return { ok: false, message: 'Dòng không hợp lệ' };
  var sheet = getSheet('TaiSanCoDinh', _fixedAssetHeaders_());
  if (ri > sheet.getLastRow()) return { ok: false, message: 'Không có dòng' };
  sheet.deleteRow(ri);
  return { ok: true, message: 'Đã xóa' };
}

/** Báo cáo vốn & chia lợi nhuận ước (tháng). */
function getCapitalReport(year, month) {
  var props = PropertiesService.getScriptProperties();
  var settleDay = parseInt(props.getProperty('PARTNER_SETTLEMENT_DAY'), 10);
  if (isNaN(settleDay) || settleDay < 1 || settleDay > 28) settleDay = 10;
  var b = _monthBounds_(year, month);
  var orders = _getOrdersBetweenDates_(b.start, b.end);
  var revenue = 0;
  for (var i = 0; i < orders.length; i++) {
    if (_ordersCompletedStatus_(orders[i].status)) revenue += parseFloat(orders[i].finalAmount) || 0;
  }
  var cogsOrders = _sumOrderCogsCompletedBetween_(b.start, b.end);
  var stockBuy = _sumStockImportCostBetween_(b.start, b.end);
  var opex = _sumOperatingCostsBetween_(b.start, b.end);
  var capex = _sumFixedAssetPurchasesBetween_(b.start, b.end);
  var gross = revenue - cogsOrders;
  var netRough = gross - stockBuy - opex - capex;

  var partners = getPartners().filter(function (p) {
    return p.active !== false;
  });
  var totalCap = 0;
  partners.forEach(function (p) {
    totalCap += p.capital;
  });
  var allExplicit = partners.length > 0 && partners.every(function (p) {
    return p.profitSharePct != null && !isNaN(p.profitSharePct);
  });
  var explicitSum = 0;
  if (allExplicit) {
    partners.forEach(function (p) {
      explicitSum += p.profitSharePct;
    });
  }
  var useExplicit = allExplicit && explicitSum >= 99 && explicitSum <= 101;
  var alloc = partners.map(function (p) {
    var w = 0;
    if (useExplicit) {
      w = p.profitSharePct / explicitSum;
    } else if (totalCap > 0) {
      w = p.capital / totalCap;
    } else {
      w = partners.length ? 1 / partners.length : 0;
    }
    var share = Math.round(Math.max(0, netRough) * w);
    return {
      name: p.name,
      capital: p.capital,
      profitSharePct: p.profitSharePct,
      weight: Math.round(w * 10000) / 10000,
      allocatedProfitVnd: share,
      contact: p.contact
    };
  });

  var nextPay = new Date(b.year, b.month - 1, settleDay, 12, 0, 0);
  while (nextPay.getTime() <= b.end.getTime()) {
    nextPay = new Date(nextPay.getFullYear(), nextPay.getMonth() + 1, settleDay, 12, 0, 0);
  }

  return {
    periodLabel: 'Tháng ' + b.month + '/' + b.year,
    settlementDay: settleDay,
    suggestedTransferNote: 'Chốt LN dự kiến ngày ' + settleDay + ' hàng tháng (cấu hình PARTNER_SETTLEMENT_DAY trong Script Properties).',
    nextSettlementDate: nextPay,
    revenueCompleted: revenue,
    cogsFromCompletedOrders: cogsOrders,
    stockImportCost: stockBuy,
    operatingCostsManual: opex,
    fixedAssetPurchases: capex,
    grossAfterCogs: gross,
    netProfitRough: netRough,
    partners: alloc,
    cashUses: [
      { key: 'Nhập nguyên liệu (Log_NhapKho)', amount: stockBuy },
      { key: 'Chi phí vận hành (sheet ChiPhiVanHanh)', amount: opex },
      { key: 'Mua tài sản cố định (tháng)', amount: capex }
    ],
    allocationMode: useExplicit ? 'Tỷ lệ LN % (mỗi người khai báo, tổng ~100%)' : 'Tự động theo tỷ lệ vốn góp'
  };
}

function _xmlEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Hỗ trợ kê khai: đối soát đơn Hoàn thành + chi phí. Tỷ lệ thuế mặc định trong Script Properties:
 * HKD_TAX_VAT_RATE_PCT, HKD_TAX_PIT_RATE_PCT (ví dụ 1 và 0.5 - PHẢI chỉnh theo ngành hàng & văn bản hiện hành).
 */
function getTaxDeclarationSupport(year, quarter) {
  var props = PropertiesService.getScriptProperties();
  var vatRate = parseFloat(props.getProperty('HKD_TAX_VAT_RATE_PCT'));
  var pitRate = parseFloat(props.getProperty('HKD_TAX_PIT_RATE_PCT'));
  if (isNaN(vatRate)) vatRate = 1;
  if (isNaN(pitRate)) pitRate = 0.5;
  var b = _quarterBounds_(year, quarter);
  var orders = _getOrdersBetweenDates_(b.start, b.end);
  var revenue = 0;
  var disc = 0;
  for (var i = 0; i < orders.length; i++) {
    if (!_ordersCompletedStatus_(orders[i].status)) continue;
    revenue += parseFloat(orders[i].finalAmount) || 0;
    disc += parseFloat(orders[i].discount) || 0;
  }
  var cogs = _sumOrderCogsCompletedBetween_(b.start, b.end);
  var stockBuy = _sumStockImportCostBetween_(b.start, b.end);
  var opex = _sumOperatingCostsBetween_(b.start, b.end);
  var capex = _sumFixedAssetPurchasesBetween_(b.start, b.end);
  var profitRough = revenue - cogs - stockBuy - opex - capex;
  var vatEst = Math.max(0, revenue * vatRate / 100);
  var pitEst = Math.max(0, revenue * pitRate / 100);

  var legalNotes = [
    'Từ 2026, hộ kinh doanh chuyển kê khai theo hướng dẫn mới (tham khảo: Nghị định 68/2026/NĐ-CP; Thông tư 152/2025; cổng thông tin Chính phủ / Cục Thuế).',
    'Ngưỡng miễn / phương pháp tính thuế phụ thuộc ngành hàng, doanh thu và lựa chọn kê khai - luôn đối chiếu kế toán / chi cục thuế trước khi nộp.',
    'File XML sinh ra từ SUN NUT MILK là **HkdTaxSupportExport** (hỗ trợ nội bộ), không phải file điện tử đã ký số của Hệ thống iHTKK/eTax. Nộp chính thức trên https://etax.dientu.gdt.gov.vn theo biểu mẫu đang áp dụng.'
  ];

  var steps = [
    '1) Đăng nhập eTax (HKD / cá nhân kinh doanh) tại etax.dientu.gdt.gov.vn.',
    '2) Chọn kỳ khai ' + b.year + ' - Q' + b.quarter + '.',
    '3) Đối chiếu Doanh thu (bảng dưới) với sổ bán hàng / POS.',
    '4) Nhập chi phí hợp lệ theo hướng dẫn (giữ chứng từ nhập hàng, ChiPhiVanHanh, tài sản cố định).',
    '5) Kiểm tra tỷ lệ % ngành hàng trên Thông tư hiện hành - chỉnh HKD_TAX_VAT_RATE_PCT / HKD_TAX_PIT_RATE_PCT trong Script Properties nếu khác mặc định.',
    '6) Nộp và lưu biên nhận từ cổng thuế.'
  ];

  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<!-- HkdTaxSupportExport: hỗ trợ nội bộ, không thay thế hồ sơ GDT đã ký -->\n';
  xml += '<HkdTaxSupportExport version="1.0" generated="' + _xmlEsc_(new Date().toISOString()) + '">\n';
  xml += '  <Period year="' + b.year + '" quarter="' + b.quarter + '"/>\n';
  xml += '  <RevenueCompletedVnd>' + Math.round(revenue) + '</RevenueCompletedVnd>\n';
  xml += '  <DiscountsVnd>' + Math.round(disc) + '</DiscountsVnd>\n';
  xml += '  <CogsFromOrdersVnd>' + Math.round(cogs) + '</CogsFromOrdersVnd>\n';
  xml += '  <StockPurchasesVnd>' + Math.round(stockBuy) + '</StockPurchasesVnd>\n';
  xml += '  <OperatingCostsManualVnd>' + Math.round(opex) + '</OperatingCostsManualVnd>\n';
  xml += '  <FixedAssetPurchasesVnd>' + Math.round(capex) + '</FixedAssetPurchasesVnd>\n';
  xml += '  <RoughProfitBeforeTaxVnd>' + Math.round(profitRough) + '</RoughProfitBeforeTaxVnd>\n';
  xml += '  <EstimatedVatVnd ratePct="' + vatRate + '">' + Math.round(vatEst) + '</EstimatedVatVnd>\n';
  xml += '  <EstimatedPitVnd ratePct="' + pitRate + '">' + Math.round(pitEst) + '</EstimatedPitVnd>\n';
  xml += '  <Disclaimer>' + _xmlEsc_(legalNotes.join(' ')) + '</Disclaimer>\n';
  xml += '</HkdTaxSupportExport>\n';

  var printHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Kê khai hỗ trợ Q' + b.quarter + '/' + b.year + '</title>';
  printHtml += '<style>body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px}table{border-collapse:collapse;width:100%;margin-top:12px}td,th{border:1px solid #ccc;padding:6px 8px;font-size:12px}.muted{color:#555;font-size:11px}</style></head><body>';
  printHtml += '<h1>Báo cáo đối soát thuế (hỗ trợ) - Q' + b.quarter + '/' + b.year + '</h1>';
  printHtml += '<p class="muted">' + legalNotes.join(' ') + '</p>';
  printHtml += '<table><tr><th>Chỉ tiêu</th><th>Số tiền (₫)</th></tr>';
  printHtml += '<tr><td>Doanh thu (đơn Hoàn thành)</td><td>' + Math.round(revenue).toLocaleString('vi-VN') + '</td></tr>';
  printHtml += '<tr><td>Giảm giá (ghi nhận)</td><td>' + Math.round(disc).toLocaleString('vi-VN') + '</td></tr>';
  printHtml += '<tr><td>Giá vốn từ đơn (costPrice×SL)</td><td>' + Math.round(cogs).toLocaleString('vi-VN') + '</td></tr>';
  printHtml += '<tr><td>Nhập kho (Log_NhapKho)</td><td>' + Math.round(stockBuy).toLocaleString('vi-VN') + '</td></tr>';
  printHtml += '<tr><td>Chi phí VH (sheet ChiPhiVanHanh)</td><td>' + Math.round(opex).toLocaleString('vi-VN') + '</td></tr>';
  printHtml += '<tr><td>Mua TSCĐ trong kỳ</td><td>' + Math.round(capex).toLocaleString('vi-VN') + '</td></tr>';
  printHtml += '<tr><td>Lợi nhuận gộp ước</td><td>' + Math.round(profitRough).toLocaleString('vi-VN') + '</td></tr>';
  printHtml += '<tr><td>Thuế GTGT ước (' + vatRate + '% trên DT)</td><td>' + Math.round(vatEst).toLocaleString('vi-VN') + '</td></tr>';
  printHtml += '<tr><td>Thuế TNCN ước (' + pitRate + '% trên DT)</td><td>' + Math.round(pitEst).toLocaleString('vi-VN') + '</td></tr>';
  printHtml += '</table><p class="muted">In trang này ra PDF (Ctrl+P) để lưu kèm hồ sơ nội bộ.</p></body></html>';

  return {
    year: b.year,
    quarter: b.quarter,
    periodStart: b.start,
    periodEnd: b.end,
    revenueCompleted: revenue,
    discounts: disc,
    cogsFromOrders: cogs,
    stockPurchases: stockBuy,
    operatingCosts: opex,
    fixedAssetPurchases: capex,
    roughProfit: profitRough,
    vatRatePct: vatRate,
    pitRatePct: pitRate,
    vatEstimated: vatEst,
    pitEstimated: pitEst,
    legalNotes: legalNotes,
    etaxSteps: steps,
    officialLinks: [
      { label: 'Cổng thông tin điện tử Tổng cục Thuế', url: 'https://gdt.gov.vn/' },
      { label: 'eTax (khai nộp)', url: 'https://etax.dientu.gdt.gov.vn/' },
      { label: 'Chính phủ - chính sách / hướng dẫn', url: 'https://www.chinhphu.vn/' }
    ],
    xmlSupport: xml,
    printHtml: printHtml
  };
}

// ============================================================
// 11a. CỔNG HỘI VIÊN - nội dung / banner (Script Properties JSON)
// ============================================================
var MEMBER_PORTAL_PROP_KEY = 'MEMBER_PORTAL_JSON_V1';
var MEMBER_PORTAL_CMS_KEY = 'MEMBER_PORTAL_CMS_V1';
var MEMBER_PORTAL_CMS_MAX_BYTES = 9000;
var MEMBER_CMS_ZONES_ = {
  carousel: 'Banner trượt (đầu trang)',
  hero_login: 'Ảnh lớn cột phải / đăng nhập',
  hero_register: 'Ảnh hero khu đăng ký gói',
  menu_hero_bg: 'Nền ảnh vùng thực đơn'
};

function _memberCmsParseDate_(v) {
  if (!v) return null;
  var s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00';
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00';
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeMemberCmsItem_(raw, idx) {
  var o = raw && typeof raw === 'object' ? raw : {};
  var zone = String(o.zone || 'carousel').trim();
  if (!MEMBER_CMS_ZONES_[zone]) zone = 'carousel';
  return {
    id: String(o.id || ('cms_' + (idx != null ? idx : Date.now()))).trim(),
    zone: zone,
    enabled: o.enabled !== false,
    perpetual: !!o.perpetual,
    startAt: String(o.startAt || '').trim(),
    endAt: String(o.endAt || '').trim(),
    sortOrder: parseInt(o.sortOrder, 10) || 0,
    image: String(o.image || '').trim(),
    badge: String(o.badge || '').trim(),
    title: String(o.title || '').trim(),
    subtitle: String(o.subtitle || '').trim(),
    linkUrl: String(o.linkUrl || o.link || '').trim()
  };
}

function migrateLegacyBannersToCmsItems_(banners) {
  if (!Array.isArray(banners) || !banners.length) return [];
  return banners.map(function (b, i) {
    return normalizeMemberCmsItem_({
      id: 'legacy_car_' + i,
      zone: 'carousel',
      enabled: true,
      perpetual: true,
      sortOrder: i,
      image: b && b.image,
      badge: b && b.badge,
      title: b && b.title,
      subtitle: b && b.subtitle
    }, i);
  });
}

function getMemberPortalCmsItemsRaw_(skipCache) {
  if (!skipCache) {
    var cc = CACHE.get('member_portal_cms_items');
    if (cc) return cc;
  }
  var items = [];
  var raw = PropertiesService.getScriptProperties().getProperty(MEMBER_PORTAL_CMS_KEY);
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
      else if (parsed && Array.isArray(parsed.items)) items = parsed.items;
    } catch (eC) { /* ignore */ }
  }
  items = items.map(function (it, i) { return normalizeMemberCmsItem_(it, i); });
  if (!items.length) {
    var rawMain = PropertiesService.getScriptProperties().getProperty(MEMBER_PORTAL_PROP_KEY);
    if (rawMain) {
      try {
        var mainObj = JSON.parse(rawMain);
        if (mainObj && Array.isArray(mainObj.banners) && mainObj.banners.length) {
          items = migrateLegacyBannersToCmsItems_(mainObj.banners);
        }
      } catch (eLeg) { /* ignore */ }
    }
  }
  CACHE.set('member_portal_cms_items', items, 300);
  return items;
}

function isMemberCmsItemActive_(item, now) {
  if (!item || item.enabled === false) return false;
  if (item.perpetual) return true;
  var t = (now && now.getTime) ? now.getTime() : Date.now();
  var start = _memberCmsParseDate_(item.startAt);
  var end = _memberCmsParseDate_(item.endAt);
  if (start && t < start.getTime()) return false;
  if (end && t > end.getTime()) return false;
  if (!start && !end) return true;
  return true;
}

function filterActiveMemberCmsItems_(items, now) {
  var n = now || new Date();
  return (items || []).filter(function (it) {
    return isMemberCmsItemActive_(it, n) && String(it.image || '').trim();
  }).sort(function (a, b) {
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });
}

function cmsItemsToBannerSlides_(items) {
  return (items || []).map(function (it) {
    return {
      image: it.image,
      badge: it.badge,
      title: it.title,
      subtitle: it.subtitle,
      linkUrl: it.linkUrl
    };
  });
}

function applyMemberPortalCmsToSettings_(settings, cmsAll, forAdmin) {
  var merged = settings || {};
  var all = Array.isArray(cmsAll) ? cmsAll : [];
  if (forAdmin) {
    merged.cmsItems = all;
    return merged;
  }
  var active = filterActiveMemberCmsItems_(all);
  var byZone = {};
  active.forEach(function (it) {
    if (!byZone[it.zone]) byZone[it.zone] = [];
    byZone[it.zone].push(it);
  });
  var carousel = byZone.carousel || [];
  if (carousel.length) merged.banners = cmsItemsToBannerSlides_(carousel);
  else if (!Array.isArray(merged.banners) || !merged.banners.length) {
    merged.banners = cmsItemsToBannerSlides_(migrateLegacyBannersToCmsItems_(merged.banners || []));
  }
  var heroLogin = (byZone.hero_login || [])[0];
  if (heroLogin && heroLogin.image) merged.heroImageUrl = heroLogin.image;
  var heroReg = (byZone.hero_register || [])[0];
  if (heroReg && heroReg.image) merged.heroRegisterImageUrl = heroReg.image;
  var menuBg = (byZone.menu_hero_bg || [])[0];
  if (menuBg && menuBg.image) merged.menuHeroBgUrl = menuBg.image;
  return merged;
}

function saveMemberPortalCmsItems(items) {
  var list = (Array.isArray(items) ? items : []).map(function (it, i) {
    return normalizeMemberCmsItem_(it, i);
  }).filter(function (it) {
    return String(it.image || '').trim() || String(it.title || '').trim() || String(it.badge || '').trim();
  });
  var str = JSON.stringify(list);
  if (str.length > MEMBER_PORTAL_CMS_MAX_BYTES) {
    throw new Error('Danh sách banner CMS quá dài (~' + Math.round(str.length / 1024) + 'KB, tối đa ~9KB). Giảm số mục hoặc rút gọn chữ.');
  }
  PropertiesService.getScriptProperties().setProperty(MEMBER_PORTAL_CMS_KEY, str);
  CACHE.clear('member_portal_cms_items');
  CACHE.clear('member_portal_settings');
  return { ok: true, count: list.length };
}

/** Cache danh sách gói (sheet đọc mỗi lần khá tốn kém); xóa khi admin lưu gói. */
var MEMBERSHIP_PACKAGES_CACHE_KEY = 'membership_packages_v1';

/** Payload JSON cho ?api=memberPortalBootstrap */
function memberPortalBootstrapPayload_() {
  try {
    return {
      ok: true,
      settings: getMemberPortalSettings(false),
      menu: getMenu(),
      packages: getMembershipPackages()
    };
  } catch (eB) {
    Logger.log('memberPortalBootstrapPayload_: ' + (eB.message || eB));
    return {
      ok: false,
      message: String(eB && eB.message ? eB.message : eB || 'Lỗi máy chủ'),
      settings: null,
      menu: [],
      packages: []
    };
  }
}

function getMemberPortalSettings(skipCache, forAdmin) {
  if (!skipCache && !forAdmin) {
    var c = CACHE.get('member_portal_settings');
    if (c) return c;
  }
  var defaults = {
    brandTitle: 'SUN Nut Milk',
    brandTagline: 'Tinh hoa từ hạt, trọn vẹn yêu thương.',
    loginCardTitle: 'Cổng vào Hội viên',
    loginCardSubtitle: 'Đăng nhập bằng số điện thoại để xem gói, lịch uống và ưu đãi.',
    heroImageUrl: 'https://images.unsplash.com/photo-1564890369479-c89fc36fb687?w=900&q=80',
    heroFeature1Title: 'Thực đơn cá nhân hóa',
    heroFeature1Text: 'Lộ trình sữa hạt phù hợp thể trạng và mục tiêu sức khỏe của bạn.',
    heroFeature2Title: 'Ưu đãi thành viên',
    heroFeature2Text: 'Tích điểm đổi quà, ưu đãi theo từng giai đoạn hội viên.',
    heroFeature3Title: 'Gợi ý lịch uống theo menu',
    heroFeature3Text: 'Lịch 7 ngày với món có trên thực đơn, thành phần hạt và gợi ý lợi ích (không công thức nấu).',
    aiBotName: 'NutriBot AI',
    aiWelcome: 'Chào bạn! Hãy cho biết mục tiêu (đẹp da, giảm cân nhẹ, tim khỏe…). Mình sẽ gợi ý lịch uống 7 ngày từ menu SUN - mỗi ngày một món, kèm thành phần hạt và lợi ích tham khảo.',
    aiPlaceholder: 'Mục tiêu của bạn (vd: đẹp da, tim khỏe…)',
    scheduleLockHint: 'Khóa thay đổi món lúc 22:00 hàng ngày',
    menuHeroTitle: 'Tinh hoa từ hạt',
    menuHeroSubtitle: 'Khám phá thực đơn sữa hạt nguyên chất, thiết kế cho từng mục tiêu sức khỏe.',
    footerCopy: '© 2024 SUN Nut Milk. Tinh hoa từ hạt, trọn vẹn yêu thương.',
    supportPhone: '0900000000',
    supportZalo: 'https://zalo.me/',
    termsHtml: 'Điều khoản sử dụng cổng hội viên SUN Nut Milk. Thanh toán tại cửa hàng hoặc chuyển khoản. Gói giao hàng chỉ áp dụng khu vực được chỉ định.',
    menuLabelCatalog: defaultMenuLabelCatalog_(),
    menuTagCatalog: defaultMenuTagCatalog_(),
    banners: [
      {
        image: 'https://images.unsplash.com/photo-1550583724-b2692b85bf19?w=1200&q=80',
        badge: '100% Tự nhiên',
        title: 'Dinh dưỡng tinh khiết mỗi ngày',
        subtitle: 'Sữa hạt tươi giao sáng - Dương Minh Châu'
      }
    ]
  };
  var merged = defaults;
  var raw = PropertiesService.getScriptProperties().getProperty(MEMBER_PORTAL_PROP_KEY);
  if (raw) {
    try {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') merged = Object.assign({}, defaults, o);
      if (!Array.isArray(merged.banners) || !merged.banners.length) merged.banners = defaults.banners;
    } catch (eJ) {
      // giữ defaults
    }
  }
  var cmsAll = getMemberPortalCmsItemsRaw_(skipCache || forAdmin);
  merged = applyMemberPortalCmsToSettings_(merged, cmsAll, !!forAdmin);
  merged.menuLabelCatalog = normalizeMenuLabelCatalog_(merged.menuLabelCatalog);
  merged.menuTagCatalog = normalizeMenuTagCatalog_(merged.menuTagCatalog);
  if (!forAdmin) {
    CACHE.set('member_portal_settings', merged, 300);
  }
  return merged;
}

function saveMemberPortalSettings(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Thiếu dữ liệu cấu hình');
  if (obj.menuLabelCatalog) obj.menuLabelCatalog = normalizeMenuLabelCatalog_(obj.menuLabelCatalog);
  if (obj.menuTagCatalog) obj.menuTagCatalog = normalizeMenuTagCatalog_(obj.menuTagCatalog);
  var cmsItems = obj.cmsItems;
  var toSave = Object.assign({}, obj);
  delete toSave.cmsItems;
  var str = JSON.stringify(toSave);
  if (str.length > 9500) throw new Error('Dữ liệu chữ quá dài (tối đa ~9KB). Rút gọn mô tả.');
  PropertiesService.getScriptProperties().setProperty(MEMBER_PORTAL_PROP_KEY, str);
  if (Array.isArray(cmsItems)) saveMemberPortalCmsItems(cmsItems);
  CACHE.clear('member_portal_settings');
  CACHE.clear('member_portal_cms_items');
  return { ok: true };
}

// ============================================================
// 11a2. MEMBER APP V2 - hồ sơ, địa chỉ, ưu đãi, khu giao
// ============================================================
var MEMBER_CUSTOMER_EXT_HEADERS = ['Email', 'Ngày sinh', 'Giới tính', 'Địa chỉ JSON', 'Khóa hồ sơ', 'Mã HV'];
var ONLINE_ORDER_NOTIFY_EMAILS = 'lamtin208@gmail.com,sunnutmilk@gmail.com';
var MEMBER_DELIVERY_ZONES_KEY = 'MEMBER_DELIVERY_ZONES_V1';

function _ensureCustomerExtColumns_(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
  MEMBER_CUSTOMER_EXT_HEADERS.forEach(function (title) {
    if (headers.indexOf(title) === -1) {
      sheet.getRange(1, lastCol + 1).setValue(title);
      lastCol++;
      headers.push(title);
    }
  });
}

function _parseProfileLock_(raw) {
  try {
    var o = JSON.parse(String(raw || '{}'));
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}

function _customerRowToProfile_(row, headers) {
  var ix = function (n) { return headers.indexOf(n); };
  var phone = normalizeVnPhoneDigits_(row[ix('SĐT')]);
  var lock = _parseProfileLock_(row[ix('Khóa hồ sơ')] != null ? row[ix('Khóa hồ sơ')] : '');
  var dob = row[ix('Ngày sinh')];
  var dobStr = '';
  if (dob instanceof Date && !isNaN(dob.getTime())) {
    dobStr = Utilities.formatDate(dob, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  } else if (dob) dobStr = String(dob).slice(0, 10);
  var addrJson = [];
  try {
    var aj = JSON.parse(String(row[ix('Địa chỉ JSON')] || '[]'));
    if (Array.isArray(aj)) addrJson = aj;
  } catch (eA) { /* */ }
  return {
    phone: phone,
    name: String(row[ix('Tên')] || '').trim(),
    email: String(row[ix('Email')] || '').trim(),
    dob: dobStr,
    gender: String(row[ix('Giới tính')] || '').trim(),
    points: parseInt(row[ix('Điểm')], 10) || 0,
    tier: String(row[ix('Hạng')] || '').trim() || 'Thành viên',
    totalSpent: parseFloat(row[ix('Tổng chi tiêu')]) || 0,
    visitCount: parseInt(row[ix('Số lần ghé')], 10) || 0,
    addresses: addrJson,
    locked: {
      email: !!lock.email,
      dob: !!lock.dob,
      phone: !!lock.phone || true
    },
    memberCode: _readMemberCodeFromRow_(row, headers, phone)
  };
}

function _readMemberCodeFromRow_(row, headers, phone) {
  var ix = headers.indexOf('Mã HV');
  var code = ix >= 0 ? String(row[ix] || '').trim().toUpperCase() : '';
  if (code && code.indexOf('DEL_') !== 0) return code;
  return ensureMemberCodeForPhone_(phone);
}

function generateMemberCode_() {
  var chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var out = 'SUN';
  for (var i = 0; i < 10; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function _memberCodeExists_(code, sheet, headers) {
  var ix = headers.indexOf('Mã HV');
  if (ix < 0) return false;
  var cu = String(code || '').trim().toUpperCase();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ix] || '').trim().toUpperCase() === cu) return true;
  }
  return false;
}

function ensureMemberCodeForPhone_(phoneRaw) {
  var phone = normalizeVnPhoneDigits_(phoneRaw);
  if (!phone || phone.length < 9) return '';
  var headersDef = ['SĐT', 'Tên', 'Điểm', 'Tổng chi tiêu', 'Số lần ghé', 'Lần đầu', 'Lần cuối', 'Hạng', 'Ghi chú'];
  var sheet = getSheet('Customers', headersDef);
  _ensureCustomerExtColumns_(sheet);
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h || '').trim(); });
  var ixPhone = headers.indexOf('SĐT');
  var ixCode = headers.indexOf('Mã HV');
  for (var i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits_(data[i][ixPhone]) === phone) {
      var existing = ixCode >= 0 ? String(data[i][ixCode] || '').trim().toUpperCase() : '';
      if (existing && existing.indexOf('DEL_') !== 0) return existing;
      var code = '';
      for (var t = 0; t < 12; t++) {
        code = generateMemberCode_();
        if (!_memberCodeExists_(code, sheet, headers)) break;
      }
      if (ixCode >= 0) sheet.getRange(i + 1, ixCode + 1).setValue(code);
      CACHE.clear('customers_v1');
      return code;
    }
  }
  return generateMemberCode_();
}

function getCustomerByMemberCode(codeRaw) {
  var code = String(codeRaw || '').trim().toUpperCase().replace(/\s/g, '');
  if (!code || code.length < 6) return null;
  var headersDef = ['SĐT', 'Tên', 'Điểm', 'Tổng chi tiêu', 'Số lần ghé', 'Lần đầu', 'Lần cuối', 'Hạng', 'Ghi chú'];
  var sheet = getSheet('Customers', headersDef);
  _ensureCustomerExtColumns_(sheet);
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h || '').trim(); });
  var ixCode = headers.indexOf('Mã HV');
  var ixPhone = headers.indexOf('SĐT');
  if (ixCode < 0) return null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ixCode] || '').trim().toUpperCase() === code) {
      var phone = normalizeVnPhoneDigits_(data[i][ixPhone]);
      return {
        phone: phone,
        name: String(data[i][headers.indexOf('Tên')] || '').trim(),
        memberCode: code,
        tier: String(data[i][headers.indexOf('Hạng')] || '').trim() || 'Thành viên',
        points: parseInt(data[i][headers.indexOf('Điểm')], 10) || 0
      };
    }
  }
  return null;
}

/** POS / Pickup: nhập SĐT hoặc quét mã HV → cùng một khách. */
function resolveCustomerIdentifier(inputRaw) {
  var s = String(inputRaw || '').trim();
  if (!s) return { ok: false, message: 'Chưa nhập mã hoặc SĐT' };
  var digits = normalizeVnPhoneDigits_(s);
  if (digits.length >= 9) {
    var code = ensureMemberCodeForPhone_(digits);
    var prof = getMemberProfile(digits);
    var p = prof.profile || {};
    return {
      ok: true,
      phone: digits,
      memberCode: p.memberCode || code,
      name: p.name || '',
      points: p.points || 0,
      tier: p.tier || 'Thành viên'
    };
  }
  var byCode = getCustomerByMemberCode(s);
  if (byCode) {
    return {
      ok: true,
      phone: byCode.phone,
      memberCode: byCode.memberCode,
      name: byCode.name,
      points: byCode.points,
      tier: byCode.tier
    };
  }
  return { ok: false, message: 'Không tìm thấy khách - kiểm tra SĐT hoặc mã vạch' };
}

function getMemberProfile(phoneRaw) {
  var phone = normalizeVnPhoneDigits_(phoneRaw);
  if (!phone || phone.length < 9) throw new Error('SĐT không hợp lệ');
  var headersDef = ['SĐT', 'Tên', 'Điểm', 'Tổng chi tiêu', 'Số lần ghé', 'Lần đầu', 'Lần cuối', 'Hạng', 'Ghi chú'];
  var sheet = getSheet('Customers', headersDef);
  _ensureCustomerExtColumns_(sheet);
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h || '').trim(); });
  for (var i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits_(data[i][headers.indexOf('SĐT')]) === phone) {
      return { ok: true, profile: _customerRowToProfile_(data[i], headers) };
    }
  }
  return {
    ok: true,
    profile: {
      phone: phone,
      name: '',
      email: '',
      dob: '',
      gender: '',
      points: 0,
      tier: 'Thành viên',
      totalSpent: 0,
      visitCount: 0,
      addresses: [],
      locked: { email: false, dob: false, phone: true },
      memberCode: ensureMemberCodeForPhone_(phone)
    }
  };
}

function saveMemberProfile(phoneRaw, patch) {
  var phone = normalizeVnPhoneDigits_(phoneRaw);
  if (!phone || phone.length < 9) throw new Error('SĐT không hợp lệ');
  var p = patch && typeof patch === 'object' ? patch : {};
  var headersDef = ['SĐT', 'Tên', 'Điểm', 'Tổng chi tiêu', 'Số lần ghé', 'Lần đầu', 'Lần cuối', 'Hạng', 'Ghi chú'];
  var sheet = getSheet('Customers', headersDef);
  _ensureCustomerExtColumns_(sheet);
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h || '').trim(); });
  var ix = function (n) { return headers.indexOf(n); };
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits_(data[i][ix('SĐT')]) === phone) {
      rowIdx = i + 1;
      break;
    }
  }
  if (rowIdx < 0) {
    saveCustomer({ phone: phone, name: String(p.name || '').trim() || 'Khách hàng' });
    return getMemberProfile(phone);
  }
  var row = sheet.getRange(rowIdx, 1, rowIdx, headers.length).getValues()[0];
  var lock = _parseProfileLock_(row[ix('Khóa hồ sơ')]);
  var name = String(p.name != null ? p.name : row[ix('Tên')] || '').trim();
  if (name) sheet.getRange(rowIdx, ix('Tên') + 1).setValue(name);
  var emailIn = String(p.email != null ? p.email : '').trim();
  if (emailIn && !lock.email) {
    sheet.getRange(rowIdx, ix('Email') + 1).setValue(emailIn);
    lock.email = true;
  }
  var dobIn = String(p.dob != null ? p.dob : '').trim();
  if (dobIn && !lock.dob) {
    var dParts = dobIn.split('-');
    if (dParts.length >= 3) {
      sheet.getRange(rowIdx, ix('Ngày sinh') + 1).setValue(new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10)));
    }
    lock.dob = true;
  }
  if (p.gender != null) sheet.getRange(rowIdx, ix('Giới tính') + 1).setValue(String(p.gender).trim());
  if (Array.isArray(p.addresses)) {
    sheet.getRange(rowIdx, ix('Địa chỉ JSON') + 1).setValue(JSON.stringify(p.addresses));
  }
  lock.phone = true;
  sheet.getRange(rowIdx, ix('Khóa hồ sơ') + 1).setValue(JSON.stringify(lock));
  CACHE.clear('customers_v1');
  return getMemberProfile(phone);
}

function deleteMemberAccount(phoneRaw) {
  var phone = normalizeVnPhoneDigits_(phoneRaw);
  if (!phone || phone.length < 9) throw new Error('SĐT không hợp lệ');
  var headersDef = ['SĐT', 'Tên', 'Điểm', 'Tổng chi tiêu', 'Số lần ghé', 'Lần đầu', 'Lần cuối', 'Hạng', 'Ghi chú'];
  var sheet = getSheet('Customers', headersDef);
  _ensureCustomerExtColumns_(sheet);
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h || '').trim(); });
  var ixPhone = headers.indexOf('SĐT');
  var ixNote = headers.indexOf('Ghi chú');
  for (var i = 1; i < data.length; i++) {
    if (normalizeVnPhoneDigits_(data[i][ixPhone]) === phone) {
      sheet.getRange(i + 1, ixPhone + 1).setValue('DEL_' + phone + '_' + Date.now());
      if (ixNote >= 0) sheet.getRange(i + 1, ixNote + 1).setValue('Đã yêu cầu xóa tài khoản');
      CACHE.clear('customers_v1');
      return { ok: true, message: 'Đã ghi nhận yêu cầu xóa tài khoản.' };
    }
  }
  return { ok: true, message: 'Không có hồ sơ - đã xóa phiên đăng nhập.' };
}

function getMemberDeliveryZones() {
  var raw = PropertiesService.getScriptProperties().getProperty(MEMBER_DELIVERY_ZONES_KEY);
  if (!raw) {
    return { ok: true, zones: [{ province: 'Tây Ninh', wards: ['Xã Dương Minh Châu', 'Xã Cà Mau', 'Xã Phú Nghĩa'] }] };
  }
  try {
    var z = JSON.parse(raw);
    return { ok: true, zones: Array.isArray(z) ? z : (z.zones || []) };
  } catch (e) {
    return { ok: true, zones: [] };
  }
}

function saveMemberDeliveryZones(zones) {
  var list = Array.isArray(zones) ? zones : [];
  PropertiesService.getScriptProperties().setProperty(MEMBER_DELIVERY_ZONES_KEY, JSON.stringify(list));
  return { ok: true };
}

function isWardInDeliveryZones_(province, ward) {
  var r = getMemberDeliveryZones();
  var zones = r.zones || [];
  var p = String(province || '').trim().toLowerCase();
  var w = String(ward || '').trim().toLowerCase();
  if (!w) return false;
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i] || {};
    if (p && String(z.province || '').trim().toLowerCase() !== p) continue;
    var wards = Array.isArray(z.wards) ? z.wards : [];
    for (var j = 0; j < wards.length; j++) {
      if (String(wards[j] || '').trim().toLowerCase() === w) return true;
    }
  }
  return false;
}

/** Tiến độ hạng theo số ly tích lũy (điểm = ly). */
function computeMemberTierProgress_(cupsRaw) {
  var tiers = [
    { id: 'member', name: 'Thành viên', min: 0 },
    { id: 'silver', name: 'Bạc', min: 20 },
    { id: 'gold', name: 'Vàng', min: 50 },
    { id: 'diamond', name: 'Kim cương', min: 100 }
  ];
  var c = Math.max(0, parseInt(cupsRaw, 10) || 0);
  var current = tiers[0];
  var next = tiers[1] || null;
  for (var i = tiers.length - 1; i >= 0; i--) {
    if (c >= tiers[i].min) {
      current = tiers[i];
      next = tiers[i + 1] || null;
      break;
    }
  }
  var progressPct = 100;
  var cupsToNext = 0;
  if (next) {
    var span = next.min - current.min;
    progressPct = span > 0 ? Math.min(100, Math.round(((c - current.min) / span) * 100)) : 0;
    cupsToNext = Math.max(0, next.min - c);
  }
  return {
    cups: c,
    currentTier: current.name,
    currentTierMin: current.min,
    nextTier: next ? next.name : '',
    nextTierMin: next ? next.min : null,
    progressPct: progressPct,
    cupsToNext: cupsToNext,
    tierHint: next
      ? ('Còn ' + cupsToNext + ' ly nữa để lên hạng ' + next.name)
      : 'Bạn đang ở hạng cao nhất - cảm ơn đã đồng hành!'
  };
}

function getMemberOffersPayload(phoneRaw) {
  var phone = normalizeVnPhoneDigits_(phoneRaw);
  var prof = getMemberProfile(phone);
  var profile = prof.profile || {};
  var tierProgress = computeMemberTierProgress_(profile.points);
  var now = Date.now();
  var promos = [];
  getPromotions().forEach(function (pr) {
    var cfg = pr.ruleConfig || {};
    if (cfg.memberVisible === false) return;
    var start = pr.startDate ? new Date(pr.startDate).getTime() : 0;
    var end = pr.endDate ? new Date(pr.endDate).getTime() : 0;
    if (start && now < start) return;
    if (end && now > end + 86400000) return;
    promos.push({
      code: pr.code,
      name: pr.name,
      type: pr.type,
      value: pr.value,
      minOrder: pr.minOrder,
      description: String(cfg.memberDescription || pr.name || ''),
      conditions: String(cfg.memberConditions || cfg.conditions || ''),
      endDate: pr.endDate
    });
  });
  return {
    ok: true,
    memberCode: profile.memberCode,
    tier: tierProgress.currentTier || profile.tier,
    cups: profile.points,
    points: profile.points,
    tierProgress: tierProgress,
    promos: promos,
    supportPhone: getMemberPortalSettings(false).supportPhone || '',
    supportZalo: getMemberPortalSettings(false).supportZalo || '',
    termsHtml: getMemberPortalSettings(false).termsHtml || ''
  };
}

function getMemberOrderHistory(phoneRaw, limit) {
  var phone = normalizeVnPhoneDigits_(phoneRaw);
  var lim = Math.min(50, Math.max(5, parseInt(limit, 10) || 20));
  var orders = getOrders('month') || [];
  var out = [];
  for (var i = orders.length - 1; i >= 0 && out.length < lim; i--) {
    var o = orders[i];
    if (!o) continue;
    var p = normalizeVnPhoneDigits_(o.phone || o.customerPhone || '');
    if (p === phone) {
      out.push({
        id: o.id || o.orderId || '',
        time: o.time,
        total: o.finalAmount || o.total || 0,
        status: o.status || '',
        paymentMethod: o.paymentMethod || '',
        items: o.itemsSummary || o.items || ''
      });
    }
  }
  return { ok: true, orders: out };
}

// ============================================================
// 11b. GÓI THÀNH VIÊN (giao sữa định kỳ - tuần / tháng)
// ============================================================
var MEMBERSHIP_PKG_HEADERS = ['Mã gói', 'Loại', 'Tên gói', 'Giá', 'Số buổi', 'Món chính', 'Cost ước tính', 'Mô tả', 'Hiển thị', 'Kiểu gói', 'Khuyến mãi'];

function _ensureMembershipPkgColumns_(sh) {
  if (!sh) return;
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return;
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
  MEMBERSHIP_PKG_HEADERS.forEach(function (title) {
    if (headers.indexOf(title) === -1) {
      sh.getRange(1, lastCol + 1).setValue(title);
      lastCol++;
      headers.push(title);
    }
  });
}

/** Parse ô Khuyến mãi: JSON hoặc rule ngắn (discount_pct:10|bonus_days:7|label:...). */
function _membershipParsePromoCell_(raw) {
  var out = { active: true, label: '', discountPct: 0, discountAmount: 0, bonusDays: 0, scenarios: [] };
  var s = String(raw != null ? raw : '').trim();
  if (!s || s === '{}' || /^không$/i.test(s)) {
    out.active = false;
    return out;
  }
  try {
    var j = JSON.parse(s);
    if (j && typeof j === 'object') {
      out.active = j.active !== false;
      out.label = String(j.label || j.title || '').trim();
      out.discountPct = Math.max(0, parseFloat(j.discountPct != null ? j.discountPct : j.percent) || 0);
      out.discountAmount = Math.max(0, parseFloat(j.discountAmount != null ? j.discountAmount : j.amount) || 0);
      out.bonusDays = Math.max(0, parseInt(j.bonusDays, 10) || 0);
      if (Array.isArray(j.scenarios)) out.scenarios = j.scenarios.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
      return out;
    }
  } catch (eJ) { /* text rules */ }
  s.split(/[|;,\n]+/).forEach(function (part) {
    var p = String(part || '').trim();
    if (!p) return;
    var m = p.match(/^([a-z_]+)\s*:\s*(.+)$/i);
    if (!m) return;
    var k = m[1].toLowerCase();
    var v = m[2].trim();
    if (k === 'label' || k === 'title') out.label = v;
    else if (k === 'discount_pct' || k === 'percent') out.discountPct = Math.max(0, parseFloat(v) || 0);
    else if (k === 'discount_amount' || k === 'amount') out.discountAmount = Math.max(0, parseFloat(v) || 0);
    else if (k === 'bonus_days' || k === 'bonus') out.bonusDays = Math.max(0, parseInt(v, 10) || 0);
    else if (k === 'scenario' || k === 'rule') out.scenarios.push(v);
  });
  if (!out.label && out.scenarios.length) {
    if (out.scenarios.indexOf('month_bonus_week') >= 0) out.label = 'Mua 1 tháng tặng thêm 1 tuần';
    else if (out.scenarios.indexOf('week_bonus_2days') >= 0) out.label = 'Mua 1 tuần tặng thêm 2 ngày';
  }
  return out;
}

function _membershipPkgKindNorm_(v) {
  var t = String(v != null ? v : '').trim().toLowerCase();
  if (t.indexOf('custom') >= 0 || t.indexOf('tuỳ') >= 0 || t.indexOf('tùy') >= 0) return 'custom';
  return 'system';
}

/** Tính giá sau KM + ngày tặng thêm theo loại gói. */
function _membershipApplyPromoQuote_(pkg, opts) {
  opts = opts || {};
  var base = Math.round(parseFloat(pkg && pkg.price) || 0);
  var promo = (pkg && pkg.promo) ? pkg.promo : _membershipParsePromoCell_('');
  if (!promo.active) promo = { active: false, label: '', discountPct: 0, discountAmount: 0, bonusDays: 0, scenarios: [] };
  var loai = String((pkg && pkg.type) || '').trim();
  var isMonth = loai.indexOf('Tháng') >= 0;
  var isWeek = loai.indexOf('Tuần') >= 0;
  var bonusDays = promo.bonusDays || 0;
  var scenarios = promo.scenarios || [];
  if (scenarios.indexOf('month_bonus_week') >= 0 && isMonth) bonusDays = Math.max(bonusDays, 7);
  if (scenarios.indexOf('week_bonus_2days') >= 0 && isWeek) bonusDays = Math.max(bonusDays, 2);
  var discountPct = promo.discountPct || 0;
  var discountAmount = promo.discountAmount || 0;
  if (scenarios.indexOf('discount_10') >= 0 && !discountPct) discountPct = 10;
  var discount = Math.round(base * discountPct / 100) + Math.round(discountAmount);
  if (discount > base) discount = base;
  var finalPrice = Math.max(0, base - discount);
  var label = String(promo.label || '').trim();
  if (!label && bonusDays > 0) label = 'Tặng thêm ' + bonusDays + ' ngày giao';
  if (!label && discount > 0) label = 'Giảm ' + discount.toLocaleString('vi-VN') + 'đ';
  return {
    basePrice: base,
    discount: discount,
    finalPrice: finalPrice,
    bonusDays: bonusDays,
    promoLabel: label,
    promoActive: !!(label || discount > 0 || bonusDays > 0)
  };
}

/** API: báo giá gói (có KM) - dùng trên cổng hội viên / POS. */
function membershipQuotePackage(pkgId, customDrinkNames) {
  var id = String(pkgId || '').trim();
  if (!id) return { ok: false, error: 'Thiếu mã gói' };
  var pkgs = getMembershipPackages();
  var pkg = null;
  for (var i = 0; i < pkgs.length; i++) {
    if (String(pkgs[i].id) === id) { pkg = pkgs[i]; break; }
  }
  if (!pkg) return { ok: false, error: 'Không tìm thấy gói' };
  var quote = _membershipApplyPromoQuote_(pkg, {});
  if (_membershipPkgKindNorm_(pkg.pkgKind) === 'custom' && Array.isArray(customDrinkNames) && customDrinkNames.length) {
    var menu = [];
    try { menu = getMenu() || []; } catch (eM) { menu = []; }
    var sum = 0;
    var n = 0;
    customDrinkNames.forEach(function (nm) {
      var w = String(nm || '').trim().toLowerCase();
      if (!w) return;
      for (var mi = 0; mi < menu.length; mi++) {
        var m = menu[mi];
        if (!m || m.available === false) continue;
        if (String(m.name || '').trim().toLowerCase() === w) {
          sum += parseFloat(m.basePrice) || 0;
          n++;
          break;
        }
      }
    });
    if (n > 0) {
      var sessions = parseInt(pkg.sessions, 10) || (String(pkg.type || '').indexOf('Tháng') >= 0 ? 22 : 7);
      var avg = Math.round(sum / n);
      quote.basePrice = Math.round(avg * sessions);
      quote = Object.assign(quote, _membershipApplyPromoQuote_(Object.assign({}, pkg, { price: quote.basePrice }), {}));
    }
  }
  return Object.assign({ ok: true, packageId: id, packageName: pkg.name, packageType: pkg.type, pkgKind: pkg.pkgKind || 'system' }, quote);
}
var MEMBERSHIP_SUB_HEADERS = ['Mã ĐK', 'SĐT', 'Tên KH', 'Mã gói', 'Loại', 'Bắt đầu', 'Kết thúc', 'Địa chỉ', 'Link Maps', 'Hạng', 'Trạng thái', 'Buổi đã giao', 'Ghi chú'];
var MEMBERSHIP_SUB_HEADERS_EXTRA = ['Tỉnh/TP', 'Xã/Phường', 'Địa chỉ chi tiết', 'Điểm nhận', 'Món yêu thích', 'Lịch giao KH'];

function _membershipPkgSheet_() {
  var sh = getSheet('GoiThanhVien', MEMBERSHIP_PKG_HEADERS);
  _ensureMembershipPkgColumns_(sh);
  return sh;
}

function _ensureMembershipSubHeaders_(sh) {
  if (!sh || sh.getLastRow() < 1) return;
  var lc = sh.getLastColumn();
  var hdr = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (x) { return String(x || '').trim(); });
  for (var i = 0; i < MEMBERSHIP_SUB_HEADERS_EXTRA.length; i++) {
    var t = MEMBERSHIP_SUB_HEADERS_EXTRA[i];
    if (hdr.indexOf(t) === -1) {
      sh.getRange(1, lc + 1).setValue(t);
      lc++;
      hdr.push(t);
    }
  }
}

function _membershipSubSheet_() {
  var sh = getSheet('DangKyGoi', MEMBERSHIP_SUB_HEADERS);
  _ensureMembershipSubHeaders_(sh);
  return sh;
}

/** So khớp SĐT sheet (số / chuỗi / thiếu số 0 đầu). */
function _phoneMatchMembership_(cell, wantNorm) {
  if (!wantNorm || wantNorm.length < 9) return false;
  var p = normalizeVnPhoneDigits_(cell);
  if (p === wantNorm) return true;
  if (p.length >= 9 && wantNorm.length >= 9 && p.slice(-9) === wantNorm.slice(-9)) return true;
  var raw = String(cell != null ? cell : '').replace(/\D/g, '');
  var w = String(wantNorm).replace(/\D/g, '');
  if (raw.length >= 9 && w.length >= 9 && raw.slice(-9) === w.slice(-9)) return true;
  if (raw.length >= 8 && w.length >= 8 && raw.slice(-8) === w.slice(-8)) return true;
  return false;
}

function _membershipBuildSubRow_(sh, map) {
  _ensureMembershipSubHeaders_(sh);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i] || '').trim();
    row.push(map.hasOwnProperty(key) ? map[key] : '');
  }
  return row;
}

function _membershipSeedPackages_(sh) {
  if (sh.getLastRow() > 1) return;
  _ensureMembershipPkgColumns_(sh);
  sh.appendRow(['PKG_WEEK', 'Tuần', 'Gói tuần - giao sáng (DMC)', 189000, 5, 'Theo menu / ly chọn', 85000, '5 buổi giao trong 7 ngày làm việc (mặc định T2–T6).', 'Có', 'Hệ thống', 'week_bonus_2days|label:Mua 1 tuần tặng thêm 2 ngày']);
  sh.appendRow(['PKG_MONTH', 'Tháng', 'Gói tháng - giao sáng tiết kiệm', 720000, 22, 'Theo menu / ly chọn', 385000, '22 buổi trong tháng - ổn định dòng tiền & dự báo nguyên liệu.', 'Có', 'Hệ thống', 'month_bonus_week|discount_pct:5|label:Mua 1 tháng tặng 1 tuần + giảm 5%']);
  sh.appendRow(['PKG_CUSTOM', 'Custom', 'Gói Custom - chọn món theo sở thích', 0, 7, 'Tự chọn từ menu', 0, 'Chọn nhiều loại sữa bạn thích; giá tính theo món × số buổi.', 'Có', 'Custom', '']);
}

function _membershipRowToPkg_(r) {
  var vis = String(r[8] != null ? r[8] : '').trim();
  var promoRaw = r.length > 10 ? r[10] : (r[9] && String(r[9]).indexOf('{') >= 0 ? r[9] : '');
  var pkgKindRaw = r.length > 9 ? r[9] : '';
  if (String(pkgKindRaw || '').trim().indexOf('{') === 0) {
    promoRaw = pkgKindRaw;
    pkgKindRaw = 'Hệ thống';
  }
  var promo = _membershipParsePromoCell_(promoRaw);
  var pkgKind = _membershipPkgKindNorm_(pkgKindRaw || 'Hệ thống');
  return {
    id: String(r[0] || ''),
    type: String(r[1] || ''),
    name: String(r[2] || ''),
    price: parseFloat(r[3]) || 0,
    sessions: parseInt(r[4], 10) || 0,
    milkProduct: String(r[5] || ''),
    costEstimate: parseFloat(r[6]) || 0,
    description: String(r[7] || ''),
    visible: vis || 'Có',
    pkgKind: pkgKind,
    promo: promo,
    promoLabel: promo.label || ''
  };
}

/** POS / web: chỉ gói đang Hiển thị */
function getMembershipPackages() {
  var cached = CACHE.get(MEMBERSHIP_PACKAGES_CACHE_KEY);
  if (cached) return cached;
  var sh = _membershipPkgSheet_();
  _membershipSeedPackages_(sh);
  if (sh.getLastRow() < 2) return [];
  var rows = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var o = _membershipRowToPkg_(rows[i]);
    if (!o.id) continue;
    if (o.visible && String(o.visible).indexOf('Không') === 0) continue;
    out.push(o);
  }
  try {
    CACHE.set(MEMBERSHIP_PACKAGES_CACHE_KEY, out, 300);
  } catch (eC) { /* bỏ qua nếu payload quá lớn cache */ }
  return out;
}

/** Admin: toàn bộ dòng cấu hình gói */
function adminListMembershipPackages() {
  var sh = _membershipPkgSheet_();
  _membershipSeedPackages_(sh);
  if (sh.getLastRow() < 2) return [];
  var rows = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim()) out.push(_membershipRowToPkg_(rows[i]));
  }
  return out;
}

/** Lưu / cập nhật 1 dòng gói (theo Mã gói) */
function adminSaveMembershipPackage(obj) {
  if (!obj || !String(obj.id || '').trim()) throw new Error('Thiếu Mã gói');
  var sh = _membershipPkgSheet_();
  _membershipSeedPackages_(sh);
  var id = String(obj.id).trim();
  _ensureMembershipPkgColumns_(sh);
  var promoCell = '';
  if (obj.promo != null && typeof obj.promo === 'object') {
    try { promoCell = JSON.stringify(obj.promo); } catch (eJ) { promoCell = String(obj.promoRules || ''); }
  } else {
    promoCell = String(obj.promoRules != null ? obj.promoRules : (obj.promo || ''));
  }
  var pkgKind = String(obj.pkgKind || obj.kind || 'Hệ thống').trim();
  if (pkgKind.toLowerCase() === 'custom') pkgKind = 'Custom';
  else if (pkgKind.toLowerCase().indexOf('hệ') >= 0 || pkgKind.toLowerCase() === 'system') pkgKind = 'Hệ thống';
  var vals = [
    id,
    String(obj.type || 'Tuần'),
    String(obj.name || ''),
    parseFloat(obj.price) || 0,
    parseInt(obj.sessions, 10) || 0,
    String(obj.milkProduct || ''),
    parseFloat(obj.costEstimate) || 0,
    String(obj.description || ''),
    String(obj.visible != null ? obj.visible : 'Có'),
    pkgKind,
    promoCell
  ];
  var data = sh.getDataRange().getValues();
  var ncol = Math.max(MEMBERSHIP_PKG_HEADERS.length, sh.getLastColumn());
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0] || '').trim() === id) {
      sh.getRange(r + 1, 1, r + 1, ncol).setValues([vals]);
      try {
        CACHE.clear(MEMBERSHIP_PACKAGES_CACHE_KEY);
      } catch (eClr) { }
      return { ok: true, mode: 'update' };
    }
  }
  sh.appendRow(vals);
  try {
    CACHE.clear(MEMBERSHIP_PACKAGES_CACHE_KEY);
  } catch (eClr) { }
  return { ok: true, mode: 'insert' };
}

function _membershipFindPackageRow_(sh, pkgId) {
  if (sh.getLastRow() < 2) return -1;
  var data = sh.getDataRange().getValues();
  var want = String(pkgId || '').trim();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === want) return i + 1;
  }
  return -1;
}

function _membershipSubRowToObj_(r, headerRow) {
  function buildMap(hrow) {
    var m = {};
    if (!hrow || !hrow.length) return m;
    for (var hi = 0; hi < hrow.length; hi++) {
      var kk = String(hrow[hi] || '').trim();
      if (kk) m[kk] = hi;
    }
    return m;
  }
  function colIdx(hm, titles, legacyIdx) {
    if (hm && titles && titles.length) {
      for (var t = 0; t < titles.length; t++) {
        if (hm[titles[t]] !== undefined) return hm[titles[t]];
      }
    }
    return legacyIdx;
  }
  function cellAt(hm, titles, legacyIdx) {
    var c = colIdx(hm, titles, legacyIdx);
    return r[c] !== undefined && r[c] !== null ? r[c] : '';
  }

  var hm = headerRow && headerRow.length ? buildMap(headerRow) : null;
  var sd = _parseOrderDate_(cellAt(hm, ['Bắt đầu'], 5));
  var ed = _parseOrderDate_(cellAt(hm, ['Kết thúc'], 6));
  var now = new Date();
  now.setHours(0, 0, 0, 0);
  var endOk = ed.getTime() !== 0 ? ed : null;
  var daysLeft = endOk ? Math.ceil((endOk.getTime() - now.getTime()) / 86400000) : null;
  var province = String(cellAt(hm, ['Tỉnh/TP'], 13));
  var ward = String(cellAt(hm, ['Xã/Phường'], 14));
  var addrDetail = String(cellAt(hm, ['Địa chỉ chi tiết'], 15));
  var landmark = String(cellAt(hm, ['Điểm nhận'], 16));
  var favDrink = String(cellAt(hm, ['Món yêu thích'], 17));
  var scheduleJson = String(cellAt(hm, ['Lịch giao KH'], 18));
  var st = String(cellAt(hm, ['Trạng thái'], 10));
  var pendingPay = st.indexOf('Chờ thanh toán') >= 0;
  var cancelled = st.indexOf('Hủy') >= 0;
  var active = !cancelled && !pendingPay && (!endOk || endOk.getTime() >= now.getTime());
  return {
    subId: String(cellAt(hm, ['Mã ĐK'], 0)),
    phone: String(cellAt(hm, ['SĐT', 'SDT', 'Phone', 'Điện thoại'], 1)),
    customerName: String(cellAt(hm, ['Tên KH'], 2)),
    packageId: String(cellAt(hm, ['Mã gói'], 3)),
    type: String(cellAt(hm, ['Loại'], 4)),
    start: cellAt(hm, ['Bắt đầu'], 5),
    end: cellAt(hm, ['Kết thúc'], 6),
    address: String(cellAt(hm, ['Địa chỉ'], 7)),
    mapLink: String(cellAt(hm, ['Link Maps'], 8)),
    tier: String(cellAt(hm, ['Hạng'], 9)),
    status: st,
    sessionsDelivered: parseInt(cellAt(hm, ['Buổi đã giao'], 11), 10) || 0,
    note: String(cellAt(hm, ['Ghi chú'], 12)),
    province: province,
    ward: ward,
    addressDetail: addrDetail,
    landmark: landmark,
    favoriteDrink: favDrink,
    scheduleJson: scheduleJson,
    daysLeft: daysLeft,
    pendingPayment: pendingPay,
    active: active
  };
}

/** Chuẩn hoá object gói hội viên để google.script.run luôn serialize được (tránh Date / kiểu lạ làm success trả undefined). */
function _membershipRowClientSafe_(rowObj) {
  if (!rowObj || typeof rowObj !== 'object') return {};
  function iso(v) {
    if (v == null || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      try {
        return isNaN(v.getTime()) ? '' : v.toISOString();
      } catch (e) {
        return '';
      }
    }
    var d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toISOString();
  }
  var dl = rowObj.daysLeft;
  return {
    subId: String(rowObj.subId || ''),
    phone: String(rowObj.phone || ''),
    customerName: String(rowObj.customerName || ''),
    packageId: String(rowObj.packageId || ''),
    type: String(rowObj.type || ''),
    start: iso(rowObj.start),
    end: iso(rowObj.end),
    address: String(rowObj.address || ''),
    mapLink: String(rowObj.mapLink || ''),
    tier: String(rowObj.tier || ''),
    status: String(rowObj.status || ''),
    sessionsDelivered: parseInt(rowObj.sessionsDelivered, 10) || 0,
    note: String(rowObj.note || ''),
    province: String(rowObj.province || ''),
    ward: String(rowObj.ward || ''),
    addressDetail: String(rowObj.addressDetail || ''),
    landmark: String(rowObj.landmark || ''),
    favoriteDrink: String(rowObj.favoriteDrink || ''),
    scheduleJson: String(rowObj.scheduleJson || ''),
    daysLeft: dl != null && isFinite(dl) ? dl : null,
    pendingPayment: rowObj.pendingPayment === true,
    active: rowObj.active === true
  };
}

function _membershipComputeDates_(loai, optNow, bonusDays) {
  var now = optNow ? new Date(optNow.getTime()) : new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  /** Đặt sau 12:00 (theo múi giờ dự án Apps Script) → đợt giao / kỳ tính từ ngày mai. */
  if (now.getHours() >= 12) start.setDate(start.getDate() + 1);
  var end = new Date(start.getTime());
  if (String(loai).indexOf('Tuần') >= 0) end.setDate(end.getDate() + 7);
  else if (String(loai).indexOf('Custom') >= 0) end.setDate(end.getDate() + 7);
  else end.setDate(end.getDate() + 30);
  var bonus = Math.max(0, parseInt(bonusDays, 10) || 0);
  if (bonus > 0) end.setDate(end.getDate() + bonus);
  return { start: start, end: end };
}

/** Map nhãn ngày (Thứ 2 … Chủ nhật) → khóa lịch portal T2…CN. */
function _membershipDayLabelToPortalKey_(lab) {
  var raw = String(lab || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'cn' || raw.indexOf('chủ nhật') >= 0 || raw.indexOf('chu nhat') >= 0) return 'CN';
  if (raw.indexOf('thứ 2') >= 0 || raw.indexOf('thu 2') >= 0 || raw === 't2') return 'T2';
  if (raw.indexOf('thứ 3') >= 0 || raw.indexOf('thu 3') >= 0 || raw === 't3') return 'T3';
  if (raw.indexOf('thứ 4') >= 0 || raw.indexOf('thu 4') >= 0 || raw === 't4') return 'T4';
  if (raw.indexOf('thứ 5') >= 0 || raw.indexOf('thu 5') >= 0 || raw === 't5') return 'T5';
  if (raw.indexOf('thứ 6') >= 0 || raw.indexOf('thu 6') >= 0 || raw === 't6') return 'T6';
  if (raw.indexOf('thứ 7') >= 0 || raw.indexOf('thu 7') >= 0 || raw === 't7') return 'T7';
  return '';
}

/** JSON cột Lịch giao KH từ mảng AI (day + drinkName). */
function _buildScheduleJsonFromAiDays_(daysArr, favDrink) {
  var order = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  var dailyDrinks = { T2: '', T3: '', T4: '', T5: '', T6: '', T7: '', CN: '' };
  var list = Array.isArray(daysArr) ? daysArr : [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    if (!it || typeof it !== 'object') continue;
    var k = _membershipDayLabelToPortalKey_(it.day);
    var dn = String(it.drinkName != null ? it.drinkName : '').trim();
    if (k && dn) dailyDrinks[k] = dn;
  }
  var def = String(favDrink || '').trim();
  if (!def) {
    for (var j = 0; j < order.length; j++) {
      if (String(dailyDrinks[order[j]] || '').trim()) {
        def = String(dailyDrinks[order[j]]).trim();
        break;
      }
    }
  }
  return {
    timeWindow: 'Buổi sáng (theo lịch giao cửa hàng)',
    defaultDrink: def,
    dailyDrinks: dailyDrinks,
    offerNote: '',
    note: 'Lịch món/tuần gợi ý khi đăng ký (AI / gợi ý nhanh).',
    updatedAt: new Date().toISOString()
  };
}

function _activateMembershipSubscription_(subId) {
  var sh = _membershipSubSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return false;
  var headers = data[0].map(function (h) { return String(h || '').trim(); });
  function colIx(title) {
    var i = headers.indexOf(title);
    return i >= 0 ? i : -1;
  }
  var cId = colIx('Mã ĐK');
  var cSt = colIx('Trạng thái');
  var cLoai = colIx('Loại');
  var cStart = colIx('Bắt đầu');
  var cEnd = colIx('Kết thúc');
  if (cId < 0 || cSt < 0 || cStart < 0 || cEnd < 0) return false;
  var want = String(subId || '').trim();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][cId] || '').trim() !== want) continue;
    var st = String(data[i][cSt] || '');
    if (st.indexOf('Chờ thanh toán') < 0) return true;
    var loai = cLoai >= 0 ? String(data[i][cLoai] || '') : '';
    var se = _membershipComputeDates_(loai);
    sh.getRange(i + 1, cStart + 1).setValue(se.start);
    sh.getRange(i + 1, cEnd + 1).setValue(se.end);
    sh.getRange(i + 1, cSt + 1).setValue('Đang chạy');
    return true;
  }
  return false;
}

/**
 * Quét sheet Bank transfer để kích hoạt gói hội viên (nội dung CK chứa Mã ĐK dạng SUB…).
 */
function checkMembershipBankPayment(subId, expectedAmount) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { status: 'pending', message: 'busy' };
  }
  try {
    var subNorm = _normalizeOrderIdForMatch(subId);
    var exp = Math.round(parseFloat(String(expectedAmount).replace(/,/g, '')) || 0);
    if (!subNorm || exp <= 0) return { status: 'pending' };

    const bankSheet = getSheet("Bank transfer", ["Ngân hàng", "Ngày giao dịch", "Số tài khoản", "Tài khoản phụ", "Code TT", "Nội dung thanh toán", "Loại", "Số tiền", "Mã tham chiếu", "Lũy kế", "Trạng thái xử lý"]);
    if (bankSheet.getLastRow() < 2) return { status: 'pending' };

    const allData = bankSheet.getDataRange().getValues();
    const headers = allData[0];
    const data = allData.slice(1);
    const colContent = _ordersHeaderPick_(headers, ["Nội dung thanh toán", "Nội dung CK", "Mô tả giao dịch"], -1);
    const colAmount = _ordersHeaderPick_(headers, ["Số tiền", "Số tiền GD"], -1);
    const colProcessingStatus = _ordersHeaderPick_(headers, ["Trạng thái xử lý", "Trạng thái"], -1);
    const colCodeTT = _ordersHeaderPick_(headers, ["Code TT", "Mã TT"], -1);
    const colOrderRef = _bankSheetColOrderRef_(headers);
    if (colContent === -1 || colAmount === -1 || colProcessingStatus === -1) {
      return { status: 'error', message: 'Sheet Bank transfer thiếu cột' };
    }

    var unprocessedRows = [];
    var allMatchRows = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const partMemo = String(row[colContent] || '').trim();
      const partCode = colCodeTT > -1 ? String(row[colCodeTT] || '').trim() : '';
      const transactionContent = (partMemo + ' ' + partCode).trim().toUpperCase().replace(/\s+/g, ' ');
      const memoNorm = transactionContent.replace(/\s+/g, '');
      const transactionAmount = Math.round(parseFloat(String(row[colAmount] || '').toString().replace(/,/g, '')) || 0);
      const currentProcessingStatus = String(row[colProcessingStatus] || '').trim();
      var memoOk = _bankMemoMatchesOrder(memoNorm, subNorm);
      var kNorm = colOrderRef > -1 ? String(row[colOrderRef] || '').trim().toUpperCase().replace(/\s+/g, '') : '';
      var kOk = kNorm && _bankMemoMatchesOrder(kNorm, subNorm);
      if ((memoOk || kOk) && transactionAmount > 0) {
        var proc = _bankTransferRowProcessed_(currentProcessingStatus);
        allMatchRows.push({ sheetRow: i + 2, amount: transactionAmount, processed: proc });
        if (!proc) unprocessedRows.push({ sheetRow: i + 2, amount: transactionAmount });
      }
    }
    if (allMatchRows.length === 0) return { status: 'pending' };
    var unpaidTotal = 0;
    for (var u = 0; u < unprocessedRows.length; u++) unpaidTotal += unprocessedRows[u].amount;
    var allTotal = 0;
    for (var a = 0; a < allMatchRows.length; a++) allTotal += allMatchRows[a].amount;

    if (unprocessedRows.length && unpaidTotal >= exp - 5) {
      for (var k = 0; k < unprocessedRows.length; k++) {
        bankSheet.getRange(unprocessedRows[k].sheetRow, colProcessingStatus + 1).setValue('Đã xử lý');
      }
      var ok = _activateMembershipSubscription_(subId);
      return ok ? { status: 'paid', amountPaid: unpaidTotal, expectedAmount: exp } : { status: 'error', message: 'Không kích hoạt được gói' };
    }
    if (allTotal >= exp - 5) {
      var okRec = _activateMembershipSubscription_(subId);
      if (okRec) return { status: 'paid', amountPaid: allTotal, expectedAmount: exp, recovered: true };
    }
    if (unprocessedRows.length) {
      return { status: 'partial', amountPaid: unpaidTotal, expectedAmount: exp };
    }
    return { status: 'pending' };
  } finally {
    try {
      lock.releaseLock();
    } catch (eL) { }
  }
}

/** Đăng ký gói từ POS / trang Hội viên - Tiền mặt kích hoạt ngay; Chuyển khoản tạo dòng Chờ thanh toán (quét Bank transfer). */
function registerMembershipSubscription(obj) {
  if (!obj) throw new Error('Thiếu dữ liệu');
  var phone = normalizeVnPhoneDigits_(obj.phone);
  if (!phone || phone.length < 9) throw new Error('Số điện thoại không hợp lệ');
  var name = String(obj.customerName || '').trim() || 'Khách hàng';
  var pkgId = String(obj.packageId || '').trim();
  if (!pkgId) throw new Error('Chọn gói');
  var payRaw = String(obj.paymentMethod != null ? obj.paymentMethod : 'Tiền mặt').trim();
  var isTransfer = payRaw.indexOf('Chuyển') === 0 || payRaw.toLowerCase().indexOf('transfer') >= 0;
  var province = String(obj.province != null && obj.province !== '' ? obj.province : 'Tây Ninh').trim();
  var ward = String(obj.ward != null && obj.ward !== '' ? obj.ward : 'Xã Dương Minh Châu').trim();
  var fulfillment = String(obj.fulfillment || 'delivery').trim().toLowerCase();
  var isPickup = fulfillment === 'pickup' || fulfillment.indexOf('cửa hàng') >= 0 || fulfillment.indexOf('tai cua hang') >= 0;
  var detail = String(obj.addressDetail != null ? obj.addressDetail : (obj.address || '')).trim();
  if (isPickup) {
    detail = detail || 'Nhận tại cửa hàng SUN Nut Milk';
    ward = ward || 'Xã Dương Minh Châu';
    province = province || 'Tây Ninh';
  } else {
    if (!detail) throw new Error('Nhập địa chỉ nhà (số nhà, đường, hẻm…)');
    if (!isWardInDeliveryZones_(province, ward)) {
      throw new Error('Khu vực giao chưa hỗ trợ. Chọn Nhận tại cửa hàng hoặc địa chỉ trong vùng giao được chỉ định.');
    }
  }
  var landmark = String(obj.landmark || '').trim();
  var favDrink = String(obj.favoriteDrink || '').trim();
  var mapLink = String(obj.mapLink || '').trim();
  var composedAddr = detail + ', ' + ward + ', ' + province;
  var customDrinks = Array.isArray(obj.customDrinks) ? obj.customDrinks : [];

  var pkgSh = _membershipPkgSheet_();
  _membershipSeedPackages_(pkgSh);
  var pr = _membershipFindPackageRow_(pkgSh, pkgId);
  if (pr < 0) throw new Error('Không tìm thấy mã gói');
  var prow = pkgSh.getRange(pr, 1, pr, Math.max(MEMBERSHIP_PKG_HEADERS.length, pkgSh.getLastColumn())).getValues()[0];
  var pkgObj = _membershipRowToPkg_(prow);
  var loai = String(pkgObj.type || '');
  var sessions = parseInt(pkgObj.sessions, 10) || 0;
  var quote = membershipQuotePackage(pkgId, customDrinks.length ? customDrinks : null);
  var price = (quote && quote.ok) ? quote.finalPrice : (parseFloat(pkgObj.price) || 0);
  var promoNote = (quote && quote.promoLabel) ? ('KM: ' + quote.promoLabel) : '';
  if (quote && quote.bonusDays > 0) promoNote = (promoNote ? promoNote + ' · ' : '') + 'Tặng ' + quote.bonusDays + ' ngày';
  var noteExtra = String(obj.note || '').trim();
  if (landmark) noteExtra = (noteExtra ? noteExtra + ' · ' : '') + 'Điểm nhận: ' + landmark;
  if (promoNote) noteExtra = (noteExtra ? noteExtra + ' · ' : '') + promoNote;
  if (isTransfer) noteExtra = (noteExtra ? noteExtra + ' · ' : '') + 'TT: Chờ CK';
  if (customDrinks.length) noteExtra = (noteExtra ? noteExtra + ' · ' : '') + 'Custom: ' + customDrinks.join(', ');
  var se = _membershipComputeDates_(loai, null, quote && quote.bonusDays ? quote.bonusDays : 0);
  var start = se.start;
  var end = se.end;
  var subSh = _membershipSubSheet_();
  var subId = 'SUB' + String(Date.now()).slice(-10);
  var tier = String(obj.tier || 'Đồng').trim() || 'Đồng';

  var rowMap = {
    'Mã ĐK': subId,
    'SĐT': phone,
    'Tên KH': name,
    'Mã gói': pkgId,
    'Loại': loai,
    'Bắt đầu': isTransfer ? '' : start,
    'Kết thúc': isTransfer ? '' : end,
    'Địa chỉ': composedAddr,
    'Link Maps': mapLink,
    'Hạng': tier,
    'Trạng thái': isTransfer ? 'Chờ thanh toán' : 'Đang chạy',
    'Buổi đã giao': 0,
    'Ghi chú': noteExtra,
    'Tỉnh/TP': province,
    'Xã/Phường': ward,
    'Địa chỉ chi tiết': detail,
    'Điểm nhận': landmark,
    'Món yêu thích': favDrink
  };
  try {
    var rawDays = obj.aiScheduleDays;
    var arr = [];
    if (Array.isArray(rawDays)) arr = rawDays;
    else if (rawDays != null && typeof rawDays === 'string' && String(rawDays).trim()) {
      try {
        arr = JSON.parse(String(rawDays));
      } catch (eJ) {
        arr = [];
      }
    }
    if (arr.length) {
      var schedObj = _buildScheduleJsonFromAiDays_(arr, favDrink);
      rowMap['Lịch giao KH'] = JSON.stringify(schedObj);
    }
  } catch (eSch) {
    Logger.log('registerMembershipSubscription schedule: ' + (eSch.message || eSch));
  }
  subSh.appendRow(_membershipBuildSubRow_(subSh, rowMap));
  try {
    saveCustomer({ phone: phone, name: name });
  } catch (eSc) { }
  return {
    ok: true,
    subId: subId,
    sessions: sessions,
    amount: Math.round(price),
    payByTransfer: isTransfer,
    start: isTransfer ? null : start.getTime(),
    end: isTransfer ? null : end.getTime()
  };
}

/** Tra cứu theo SĐT (các gói còn hạn hoặc gần đây) */
function lookupMembershipByPhone(phoneRaw) {
  try {
    var phone = normalizeVnPhoneDigits_(phoneRaw);
    if (!phone || phone.length < 9) return { ok: false, message: 'SĐT không hợp lệ (cần ít nhất 9 số)', list: [] };
    var sh = _membershipSubSheet_();
    if (sh.getLastRow() < 2) return { ok: true, list: [] };
    var rows = sh.getDataRange().getValues();
    var headerRow = rows[0];
    var headers = headerRow.map(function (h) { return String(h || '').trim(); });
    var cSub = headers.indexOf('Mã ĐK');
    var cPhone = headers.indexOf('SĐT');
    if (cPhone < 0) cPhone = headers.indexOf('SDT');
    if (cPhone < 0) {
      for (var hi = 0; hi < headers.length; hi++) {
        var hn = headers[hi].toLowerCase();
        if (hn === 'sđt' || hn === 'phone' || hn.indexOf('điện thoại') >= 0) {
          cPhone = hi;
          break;
        }
      }
    }
    if (cSub < 0) cSub = 0;
    if (cPhone < 0) cPhone = 1;
    var list = [];
    for (var i = 1; i < rows.length; i++) {
      if (!String(rows[i][cSub] || '').trim()) continue;
      if (_phoneMatchMembership_(rows[i][cPhone], phone)) {
        try {
          list.push(_membershipRowClientSafe_(_membershipSubRowToObj_(rows[i], headerRow)));
        } catch (eRow) {
          Logger.log('membership row ' + i + ': ' + (eRow.message || eRow));
        }
      }
    }
    list.sort(function (a, b) {
      var ta = _parseOrderDate_(a.end).getTime() || 0;
      var tb = _parseOrderDate_(b.end).getTime() || 0;
      if (isNaN(ta)) ta = 0;
      if (isNaN(tb)) tb = 0;
      return tb - ta;
    });
    return { ok: true, list: list };
  } catch (eAll) {
    Logger.log('lookupMembershipByPhone: ' + (eAll.message || eAll));
    return { ok: false, message: String(eAll.message || eAll || 'Lỗi máy chủ'), list: [] };
  }
}

/** Trang Hội viên: tra cứu + cờ vào portal (gói đang hiệu lực). */
function memberPortalLookup(phoneRaw) {
  try {
    var r = lookupMembershipByPhone(phoneRaw);
    if (!r) return { ok: false, message: 'Không có phản hồi từ máy chủ', list: [], activeSubscriptions: [], hasPortalAccess: false, hasAnySubscription: false };
    if (r.ok === false) {
      return { ok: false, message: r.message || 'Không tra cứu được.', list: [], activeSubscriptions: [], hasPortalAccess: false, hasAnySubscription: false };
    }
    var list = r.list || [];
    var activeSubscriptions = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].active) activeSubscriptions.push(list[i]);
    }
    var profile = null;
    var offers = null;
    try {
      profile = getMemberProfile(phoneRaw).profile;
      offers = getMemberOffersPayload(phoneRaw);
    } catch (eP) { /* ignore */ }
    return {
      ok: true,
      list: list,
      activeSubscriptions: activeSubscriptions,
      hasPortalAccess: activeSubscriptions.length > 0,
      hasAnySubscription: list.length > 0,
      profile: profile,
      offers: offers
    };
  } catch (e) {
    Logger.log('memberPortalLookup: ' + (e.message || e));
    return { ok: false, message: String(e.message || e || 'Lỗi máy chủ'), list: [], activeSubscriptions: [], hasPortalAccess: false, hasAnySubscription: false };
  }
}

/** Lưu lịch / khung giờ giao do hội viên chọn (JSON trong cột Lịch giao KH). */
function memberSaveDeliveryPrefs(obj) {
  if (!obj || !String(obj.subId || '').trim()) throw new Error('Thiếu Mã ĐK');
  var phone = normalizeVnPhoneDigits_(obj.phone);
  if (!phone || phone.length < 9) throw new Error('SĐT không hợp lệ');
  var subId = String(obj.subId).trim();
  var schedObj = obj.schedule != null ? obj.schedule : {};
  var jsonStr = typeof schedObj === 'string' ? schedObj : JSON.stringify(schedObj);
  var sh = _membershipSubSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error('Chưa có đăng ký');
  var headers = data[0].map(function (h) { return String(h || '').trim(); });
  var cSub = headers.indexOf('Mã ĐK');
  var cPhone = headers.indexOf('SĐT');
  var cSched = headers.indexOf('Lịch giao KH');
  if (cSched < 0) {
    _ensureMembershipSubHeaders_(sh);
    headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h || '').trim(); });
    cSched = headers.indexOf('Lịch giao KH');
  }
  if (cSub < 0 || cPhone < 0 || cSched < 0) throw new Error('Cấu trúc sheet đăng ký không hợp lệ');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][cSub] || '').trim() === subId && _phoneMatchMembership_(data[i][cPhone], phone)) {
      sh.getRange(i + 1, cSched + 1).setValue(jsonStr);
      return { ok: true };
    }
  }
  throw new Error('Không tìm thấy gói hoặc SĐT không khớp');
}

/** Admin: danh sách đăng ký */
function adminListMembershipSubscriptions() {
  var sh = _membershipSubSheet_();
  if (sh.getLastRow() < 2) return [];
  var rows = sh.getDataRange().getValues();
  var headerRow = rows[0];
  var hdr = headerRow.map(function (h) { return String(h || '').trim(); });
  var cSub = hdr.indexOf('Mã ĐK');
  if (cSub < 0) cSub = 0;
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][cSub] || '').trim()) out.push(_membershipRowClientSafe_(_membershipSubRowToObj_(rows[i], headerRow)));
  }
  out.sort(function (a, b) {
    return String(b.subId).localeCompare(String(a.subId));
  });
  return out;
}

/** Cập nhật địa chỉ / Maps / hạng / trạng thái / ghi chú */
function adminUpdateMembershipSubscription(obj) {
  if (!obj || !String(obj.subId || '').trim()) throw new Error('Thiếu Mã ĐK');
  var sh = _membershipSubSheet_();
  if (sh.getLastRow() < 2) throw new Error('Chưa có dữ liệu');
  var want = String(obj.subId).trim();
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === want) {
      var row = i + 1;
      if (obj.address != null) sh.getRange(row, 8).setValue(String(obj.address));
      if (obj.mapLink != null) sh.getRange(row, 9).setValue(String(obj.mapLink));
      if (obj.tier != null) sh.getRange(row, 10).setValue(String(obj.tier));
      if (obj.status != null) sh.getRange(row, 11).setValue(String(obj.status));
      if (obj.note != null) sh.getRange(row, 13).setValue(String(obj.note));
      return { ok: true };
    }
  }
  throw new Error('Không tìm thấy Mã ĐK');
}

/** +1 buổi đã giao (xác nhận giao trong ngày) */
function markMembershipDeliverySession(subId) {
  var sh = _membershipSubSheet_();
  if (sh.getLastRow() < 2) return { ok: false };
  var want = String(subId || '').trim();
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === want) {
      var cur = parseInt(data[i][11], 10) || 0;
      sh.getRange(i + 1, 12).setValue(cur + 1);
      return { ok: true, sessionsDelivered: cur + 1 };
    }
  }
  return { ok: false };
}

/** Gợi ý giao trong ngày: gói đang chạy, trong khoảng ngày */

function getMembershipDeliveriesForDate_(dayOffset) {
  var off = parseInt(dayOffset, 10) || 0;
  var shP = _membershipPkgSheet_();
  _membershipSeedPackages_(shP);
  var sh = _membershipSubSheet_();
  var now = new Date();
  var target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off, 12, 0, 0);
  var dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, 0, 0);
  var dayEnd = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59);
  var deliveries = [];
  if (sh.getLastRow() < 2) {
    return {
      dateLabel: Utilities.formatDate(target, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'EEEE dd/MM/yyyy'),
      deliveries: [], estimatedMeals: 0, drinkTotals: {}
    };
  }
  var pkgMap = {};
  var pr = shP.getDataRange().getValues();
  for (var pi = 1; pi < pr.length; pi++) {
    pkgMap[String(pr[pi][0] || '').trim()] = { name: String(pr[pi][2] || ''), milk: String(pr[pi][5] || '') };
  }
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var st = String(r[10] || '');
    if (st.indexOf('Hủy') >= 0 || st.indexOf('hủy') >= 0) continue;
    if (st.indexOf('Hoàn') >= 0) continue;
    var sd = _parseOrderDate_(r[5]);
    var ed = _parseOrderDate_(r[6]);
    if (sd.getTime() === 0 || ed.getTime() === 0) continue;
    if (dayEnd.getTime() < sd.getTime() || dayStart.getTime() > ed.getTime()) continue;
    var pk = pkgMap[String(r[3] || '').trim()] || { name: '', milk: '' };
    var milk = String(pk.milk || 'Sữa hạt').trim();
    deliveries.push({
      subId: String(r[0] || ''),
      phone: String(r[1] || ''),
      customerName: String(r[2] || ''),
      packageId: String(r[3] || ''),
      packageName: pk.name,
      milkProduct: milk,
      address: String(r[7] || ''),
      mapLink: String(r[8] || ''),
      tier: String(r[9] || ''),
      sessionsDelivered: parseInt(r[11], 10) || 0,
      sessionsTotal: parseInt(r[4], 10) || 0
    });
  }
  var drinkTotals = {};
  deliveries.forEach(function (d) {
    var k = d.milkProduct || 'Khác';
    drinkTotals[k] = (drinkTotals[k] || 0) + 1;
  });
  return {
    dateLabel: Utilities.formatDate(target, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'EEEE dd/MM/yyyy'),
    deliveries: deliveries,
    estimatedMeals: deliveries.length,
    drinkTotals: drinkTotals
  };
}

function _aggregateIngredientsForMilkProducts_(drinkTotals) {
  var menu = [];
  try { menu = getMenu() || []; } catch (eM) { menu = []; }
  var byName = {};
  menu.forEach(function (m) { if (m && m.name) byName[String(m.name).trim().toLowerCase()] = m; });
  var cfg = [];
  try {
    var sh = getSheet('Config', ['Mã', 'Loại', 'Tên nguyên liệu', 'ĐVT', 'Nhà cung cấp', 'Quy cách', 'Giá sỉ', 'Định lượng Mix', 'Giá bán Mix', 'Ghi chú']);
    cfg = sh.getDataRange().getValues().slice(1);
  } catch (eC) { cfg = []; }
  var agg = {};
  Object.keys(drinkTotals || {}).forEach(function (drink) {
    var cups = drinkTotals[drink] || 0;
    if (!cups) return;
    var prod = byName[String(drink).trim().toLowerCase()];
  var ings = (prod && prod.ingredients) ? prod.ingredients : [];
    if (!ings.length && prod && prod.ingredientNames) {
      (prod.ingredientNames || []).forEach(function (nm) {
        ings.push({ name: nm, amount: 1, unit: 'phần' });
      });
    }
    if (!ings.length) {
      agg['Mix hạt (ước tính)'] = (agg['Mix hạt (ước tính)'] || 0) + cups * 35;
      return;
    }
    ings.forEach(function (ing) {
      var nm = String(ing.name || ing.ingredient || '').trim();
      if (!nm) return;
      var amt = (parseFloat(ing.amount) || parseFloat(ing.qty) || 1) * cups;
      var unit = String(ing.unit || 'g').trim();
      agg[nm] = agg[nm] || { amount: 0, unit: unit };
      agg[nm].amount += amt;
    });
  });
  return agg;
}

function sendMemberPrepTomorrowEmail() {
  var prep = getMembershipDeliveriesForDate_(1);
  var to = ONLINE_ORDER_NOTIFY_EMAILS;
  var tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
  var rows = (prep.deliveries || []).map(function (d) {
    var rem = Math.max(0, (d.sessionsTotal || 0) - (d.sessionsDelivered || 0));
    return '<tr><td style="padding:8px;border-bottom:1px solid #eee;">' + escHtml_(d.customerName) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;">' + escHtml_(d.phone) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;">' + escHtml_(d.milkProduct) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;font-size:12px;">' + escHtml_(d.address) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">' + rem + '</td></tr>';
  }).join('');
  var drinkRows = Object.keys(prep.drinkTotals || {}).map(function (k) {
    return '<tr><td style="padding:6px;">' + escHtml_(k) + '</td><td style="padding:6px;text-align:center;font-weight:900;">' + prep.drinkTotals[k] + ' ly</td></tr>';
  }).join('');
  var ingAgg = _aggregateIngredientsForMilkProducts_(prep.drinkTotals);
  var ingRows = Object.keys(ingAgg).map(function (k) {
    var v = ingAgg[k];
    if (typeof v === 'number') {
      return '<tr><td style="padding:6px;">' + escHtml_(k) + '</td><td style="padding:6px;text-align:right;font-weight:700;">' + Math.round(v) + ' g</td></tr>';
    }
    return '<tr><td style="padding:6px;">' + escHtml_(k) + '</td><td style="padding:6px;text-align:right;font-weight:700;">' + Math.round(v.amount * 10) / 10 + ' ' + escHtml_(v.unit) + '</td></tr>';
  }).join('');
  var html = '<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;background:#faf7f2;padding:20px;">' +
    '<div style="background:linear-gradient(135deg,#1e3a5f,#0d9488);color:#fff;padding:20px;border-radius:14px 14px 0 0;">' +
    '<div style="font-size:22px;font-weight:900;">Chuẩn bị giao Member - ngày mai</div>' +
    '<div style="font-size:13px;opacity:.92;margin-top:6px;">' + escHtml_(prep.dateLabel) + ' · ' + (prep.estimatedMeals || 0) + ' ly dự kiến</div></div>' +
    '<div style="background:#fff;padding:18px;border:1px solid #e8dfd4;">' +
    '<h3 style="margin:0 0 10px;color:#7c2d12;">Tổng ly theo loại sữa</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;"><tbody>' + (drinkRows || '<tr><td>Chưa có gói active</td></tr>') + '</tbody></table>' +
    '<h3 style="margin:16px 0 10px;color:#7c2d12;">Nguyên liệu ước tính</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;"><tbody>' + (ingRows || '<tr><td>Theo menu - cập nhật thành phần món</td></tr>') + '</tbody></table>' +
    '<h3 style="margin:16px 0 10px;color:#7c2d12;">Danh sách khách</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f5efe6;"><th style="padding:8px;text-align:left;">Tên</th><th style="padding:8px;">SĐT</th><th style="padding:8px;">Món</th><th style="padding:8px;">Địa chỉ</th><th style="padding:8px;">Còn lại</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5">Không có giao ngày mai</td></tr>') + '</tbody></table></div></div>';
  MailApp.sendEmail({
    to: to,
    subject: 'SUN Nut Milk - Chuẩn bị giao Member ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy'),
    htmlBody: html.replace(/<\/?motion\b[^>]*>/g, function (m) { return m.indexOf('/') >= 0 ? '</div>' : '<div'; })
  });
  return { ok: true, estimatedMeals: prep.estimatedMeals, dateLabel: prep.dateLabel };
}

function escHtml_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function installMemberPrepEmailTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (tr) {
    if (tr.getHandlerFunction && tr.getHandlerFunction() === 'sendMemberPrepTomorrowEmail') {
      ScriptApp.deleteTrigger(tr);
    }
  });
  ScriptApp.newTrigger('sendMemberPrepTomorrowEmail')
    .timeBased()
    .atHour(20)
    .everyDays(1)
    .create();
  return { ok: true, message: 'Đã cài trigger 20:00 hàng ngày - gửi mail chuẩn bị ngày mai' };
}

function getMembershipDeliveriesToday() {
  var shP = _membershipPkgSheet_();
  _membershipSeedPackages_(shP);
  var sh = _membershipSubSheet_();
  var now = new Date();
  var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  var dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  var deliveries = [];
  if (sh.getLastRow() < 2) {
    return { dateLabel: Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy'), deliveries: [], estimatedMeals: 0 };
  }
  var pkgMap = {};
  var pr = shP.getDataRange().getValues();
  for (var pi = 1; pi < pr.length; pi++) {
    pkgMap[String(pr[pi][0] || '').trim()] = { name: String(pr[pi][2] || ''), milk: String(pr[pi][5] || '') };
  }
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var st = String(r[10] || '');
    if (st.indexOf('Hủy') >= 0 || st.indexOf('hủy') >= 0) continue;
    if (st.indexOf('Hoàn') >= 0) continue;
    var sd = _parseOrderDate_(r[5]);
    var ed = _parseOrderDate_(r[6]);
    if (sd.getTime() === 0 || ed.getTime() === 0) continue;
    if (dayEnd.getTime() < sd.getTime() || dayStart.getTime() > ed.getTime()) continue;
    var pk = pkgMap[String(r[3] || '').trim()] || { name: '', milk: '' };
    deliveries.push({
      subId: String(r[0] || ''),
      phone: String(r[1] || ''),
      customerName: String(r[2] || ''),
      packageId: String(r[3] || ''),
      packageName: pk.name,
      milkProduct: pk.milk,
      address: String(r[7] || ''),
      mapLink: String(r[8] || ''),
      tier: String(r[9] || ''),
      sessionsDelivered: parseInt(r[11], 10) || 0
    });
  }
  return {
    dateLabel: Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'EEEE dd/MM/yyyy'),
    deliveries: deliveries,
    estimatedMeals: deliveries.length
  };
}

/** Máy tính nhanh: doanh thu gói − tổng cost, % lãi */
function adminMembershipCostCalc(sessions, price, costTotal) {
  var s = Math.max(0, parseFloat(sessions) || 0);
  var p = Math.max(0, parseFloat(price) || 0);
  var c = Math.max(0, parseFloat(costTotal) || 0);
  var profit = p - c;
  var pct = p > 0 ? Math.round((profit / p) * 1000) / 10 : 0;
  return {
    revenue: p,
    cost: c,
    profit: profit,
    marginPct: pct,
    perSessionRevenue: s > 0 ? Math.round(p / s) : 0,
    perSessionCost: s > 0 ? Math.round(c / s) : 0
  };
}

// ============================================================
// Hóa đơn in (POS) - cấu hình lưu Script Properties
// ============================================================
var INVOICE_PRINT_SETTINGS_KEY = 'invoice_print_settings_v1';

function getInvoicePrintSettings() {
  var def = {
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

    // Tem nhãn (tuỳ chọn - dùng cho in tem ly/chai nếu POS bật)
    labelEnabled: false,
    labelCopies: 1,
    labelSize: '40x30',
    labelNote: 'Gợi ý: tem 40x30 hoặc 50x30 tuỳ máy in tem.'
  };
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(INVOICE_PRINT_SETTINGS_KEY);
    if (!raw) return def;
    var o = JSON.parse(raw);
    return Object.assign({}, def, o || {});
  } catch (e) {
    return def;
  }
}

function saveInvoicePrintSettings(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Thiếu dữ liệu cấu hình');
  PropertiesService.getScriptProperties().setProperty(INVOICE_PRINT_SETTINGS_KEY, JSON.stringify(obj));
  return { ok: true };
}

// ============================================================
// 12. HỆ THỐNG / CẤU HÌNH (Properties)
// ============================================================
function setScriptProperties(props) {
  PropertiesService.getScriptProperties().setProperties(props);
  return true;
}

function clearScriptProperties() {
  PropertiesService.getScriptProperties().deleteProperty('SHIFT_CASH');
  PropertiesService.getScriptProperties().deleteProperty('SHIFT_BANK');
  return true;
}

// ============================================================
// 13. ONE-CLICK SETUP / INSTALL (Spreadsheet menu)
// ============================================================
function onOpen(e) {
  try {
    SpreadsheetApp.getUi()
      .createMenu('SUN • Setup')
      .addItem('🚀 Setup & Install (1-click)', 'setupAndInstallAll')
      .addSeparator()
      .addItem('📧 Set report emails (default)', 'setReportEmailsDefault')
      .addItem('⏰ Setup report triggers', 'setupAutoReportTriggers')
      .addItem('✉️ Test send report now', 'sendAutoReportsNow')
      .addToUi();
  } catch (err) {
    // ignore (UI not available in some contexts)
  }
}

function setupAndInstallAll() {
  var res = [];
  var ok = true;
  var push = function (name, fn) {
    try {
      var r = fn();
      res.push({ step: name, ok: true, result: r });
    } catch (e) {
      ok = false;
      res.push({ step: name, ok: false, error: String(e && e.message ? e.message : e) });
    }
  };

  push('Ensure sheets (Config/Menu/Customers/Promotions/Log_NhapKho/Log_XuatKho)', function () {
    getSheet('Config', ["Mã", "Loại", "Tên nguyên liệu", "ĐVT", "Nhà cung cấp", "Quy cách", "Giá sỉ", "Định lượng Mix", "Giá bán Mix", "Ghi chú"]);
    var menuSheet = getSheet('Menu', MENU_HEADERS_BASE);
    ensureMenuExtraColumns(menuSheet);
    getSheet('Customers', ["SĐT", "Tên", "Điểm", "Tổng chi tiêu", "Số lần ghé", "Lần đầu", "Lần cuối", "Hạng", "Ghi chú"]);
    var promoSheet = getSheet('Promotions', ["Mã KM", "Tên", "Loại", "Giá trị", "Đơn tối thiểu", "Bắt đầu", "Kết thúc", "Kích hoạt"]);
    ensurePromotionsExtraColumns(promoSheet);
    getSheet('Log_NhapKho', ["Thời gian", "Loại phiếu", "Tên nguyên liệu", "Số lượng", "Đơn giá", "Thành tiền", "Hạn sử dụng", "Ghi chú"]);
    getSheet('Log_XuatKho', ["Thời gian", "Loại phiếu", "Tên nguyên liệu", "Số lượng", "Đơn giá", "Thành tiền", "Hạn sử dụng", "Ghi chú"]);
    return { ok: true };
  });

  push('Set report emails (default)', function () { return setReportEmailsDefault(); });
  push('Setup report triggers (11:30 & 23:00)', function () { return setupAutoReportTriggers(); });

  return { ok: ok, steps: res };
}

// Pickup / Display / Kiosk đã được gỡ bỏ theo yêu cầu.

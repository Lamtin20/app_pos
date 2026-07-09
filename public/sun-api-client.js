/**
 * Drop-in replacement for google.script.run — routes all GAS RPC calls to /api/rpc.
 * Load this script BEFORE any legacy page scripts.
 */
(function (global) {
  var RPC_URL = '/api/rpc';

  function getSunConfig() {
    try {
      return {
        sheetId: localStorage.getItem('sun_sheet_id') || '',
        driveFolderId: localStorage.getItem('sun_drive_folder_id') || '',
        sheetUrl: localStorage.getItem('sun_sheet_url') || '',
        driveUrl: localStorage.getItem('sun_drive_url') || '',
      };
    } catch (e) {
      return { sheetId: '', driveFolderId: '', sheetUrl: '', driveUrl: '' };
    }
  }

  function saveSunConfig(sheetUrl, driveUrl, sheetId, driveFolderId) {
    try {
      if (sheetUrl) localStorage.setItem('sun_sheet_url', sheetUrl);
      if (driveUrl) localStorage.setItem('sun_drive_url', driveUrl);
      if (sheetId) localStorage.setItem('sun_sheet_id', sheetId);
      else localStorage.removeItem('sun_sheet_id');
      if (driveFolderId) localStorage.setItem('sun_drive_folder_id', driveFolderId);
      else localStorage.removeItem('sun_drive_folder_id');
    } catch (e) { /* ignore */ }
  }

  function rpcCall(method, args, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl
      ? setTimeout(function () {
          ctrl.abort();
        }, timeoutMs || 55000)
      : null;

    var cfg = getSunConfig();
    var config = {};
    if (cfg.sheetId) config.sheetId = cfg.sheetId;
    if (cfg.driveFolderId) config.driveFolderId = cfg.driveFolderId;

    return fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({ method: method, args: args || [], config: config }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) {
            throw new Error((data && data.error) || 'HTTP ' + res.status);
          }
          return data.result;
        });
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function makeGasRun() {
    var onSuccess = function () {};
    var onFailure = function () {};
    var handler = {
      withSuccessHandler: function (fn) {
        onSuccess = fn || onSuccess;
        return handler;
      },
      withFailureHandler: function (fn) {
        onFailure = fn || onFailure;
        return handler;
      },
    };
    return new Proxy(handler, {
      get: function (target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'string' && prop !== 'then' && prop !== 'catch') {
          return function () {
            var args = Array.prototype.slice.call(arguments);
            rpcCall(prop, args, 120000)
              .then(onSuccess)
              .catch(function (e) {
                onFailure(e instanceof Error ? e : new Error(String(e)));
              });
          };
        }
      },
    });
  }

  global.google = global.google || {};
  global.google.script = {
    get run() {
      return makeGasRun();
    },
  };

  /** Unified api() used by Member portal / POS client */
  function api(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    return rpcCall(method, args, 42000);
  }

  function apiLong(method, ms) {
    var args = Array.prototype.slice.call(arguments, 2);
    return rpcCall(method, args, ms || 55000);
  }

  global.SUN_API = { call: rpcCall, api: api, apiLong: apiLong, getConfig: getSunConfig, saveConfig: saveSunConfig };

  /** Override Admin-style api.call if loaded after sun-api-client */
  global.__SUN_INSTALL_API__ = function () {
    global.api = {
      call: function (method) {
        var args = Array.prototype.slice.call(arguments, 1);
        return rpcCall(method, args, 15000);
      },
      callLong: function (method, ms) {
        var args = Array.prototype.slice.call(arguments, 2);
        return rpcCall(method, args, ms || 60000);
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);

import { AsyncLocalStorage } from 'async_hooks';

/** Per-request overrides from client Setup (Sheet ID, Drive folder). */
export const runtimeStore = new AsyncLocalStorage();

/**
 * @param {{ sheetId?: string|null, driveFolderId?: string|null }} config
 * @param {() => Promise<T>} fn
 */
export async function runWithRuntimeConfig(config, fn) {
  const store = {
    sheetId: config?.sheetId ? String(config.sheetId).trim() : '',
    driveFolderId: config?.driveFolderId ? String(config.driveFolderId).trim() : '',
  };
  return runtimeStore.run(store, fn);
}

export function getRuntimeSheetId() {
  return runtimeStore.getStore()?.sheetId || '';
}

export function getRuntimeDriveFolderId() {
  return runtimeStore.getStore()?.driveFolderId || '';
}

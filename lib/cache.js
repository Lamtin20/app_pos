/**
 * In-memory cache mimicking GAS CACHE object (CacheService.getScriptCache).
 */
const store = new Map();

export const CACHE = {
  get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value;
  },

  set(key, val, expireSec = 300) {
    const str = JSON.stringify(val);
    if (str.length >= 90000) return;
    store.set(key, {
      value: val,
      expiresAt: expireSec > 0 ? Date.now() + expireSec * 1000 : null,
    });
  },

  clear(keys) {
    if (!Array.isArray(keys)) keys = [keys];
    keys.forEach((k) => store.delete(k));
  },
};

export default CACHE;

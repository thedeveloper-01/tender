const cache = new Map();
const MAX_CACHE_SIZE = 100;

export function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function set(key, value, ttlMs = 3600000) { // 1 hour default
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, {
    value,
    expiry: Date.now() + ttlMs,
  });
}

export function clear() {
  cache.clear();
  console.log('[cache] Express cache invalidated.');
}

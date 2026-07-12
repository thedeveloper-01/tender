import { env } from 'cloudflare:workers';

export function getApiBaseUrl() {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.BACKEND_URL) {
      return process.env.BACKEND_URL;
    }
  } catch (e) { }
  try {
    const backendUrl = env?.BACKEND_URL;
    if (backendUrl) return backendUrl;
  } catch (e) { }
  return 'https://tender-ntuf.onrender.com';
}

export const API_BASE_URL = getApiBaseUrl();

async function getJson(path, { timeout = 30000 } = {}) {
  const url = `${getApiBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`API error ${resp.status} for ${path}`);
    }
    return resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/tenders with query params */
export async function fetchTenders(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === 'all') continue;
    search.set(key, value);
  }
  const qs = search.toString();
  return getJson(`/api/tenders${qs ? `?${qs}` : ''}`);
}

/** GET /api/tenders/:source/:bidNumber */
export async function fetchTenderDetail(source, bidNumber) {
  return getJson(`/api/tenders/${source}/${encodeURIComponent(bidNumber)}`);
}

/** GET /api/cities */
export async function fetchCities() {
  return getJson('/api/cities');
}

/** GET /api/stats */
export async function fetchStats() {
  return getJson('/api/stats');
}

/** Build the document/PDF URL for a tender */
export function documentUrl(source, bidNumber) {
  return `${getApiBaseUrl()}/api/tenders/${source}/${encodeURIComponent(bidNumber)}/document`;
}

/** Helper to fetch with Cloudflare KV cache.
 * In Astro v6 the old Astro.locals.runtime.env API was removed.
 * We rely solely on `import { env } from 'cloudflare:workers'` instead.
 */
async function getCachedJson(key, fetchFn, _runtime, ttlSeconds = 3600) {
  let SESSION = null;
  try {
    SESSION = env?.SESSION ?? null;
  } catch (e) {
    // Not in a Cloudflare Worker context (e.g. local dev without wrangler)
  }

  if (SESSION) {
    try {
      const cached = await SESSION.get(key);
      if (cached) {
        console.log(`[KV Cache] Hit for ${key}`);
        return JSON.parse(cached);
      }
      console.log(`[KV Cache] Miss for ${key}. Fetching...`);
    } catch (e) {
      console.error(`[KV Cache] Error reading key ${key}:`, e);
    }
  }

  const data = await fetchFn();

  if (SESSION && data) {
    try {
      await SESSION.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
    } catch (e) {
      console.error(`[KV Cache] Error writing key ${key}:`, e);
    }
  }

  return data;
}


export async function fetchStatsCached(runtime) {
  return getCachedJson('api:stats', () => fetchStats(), runtime, 3600); // 1 hour
}

export async function fetchCitiesCached(runtime) {
  return getCachedJson('api:cities', () => fetchCities(), runtime, 43200); // 12 hours
}

export async function fetchTendersCached(params = {}, runtime) {
  // Sort params key to ensure stable cache key regardless of param ordering
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  return getCachedJson(`api:tenders:${JSON.stringify(sortedParams)}`, () => fetchTenders(params), runtime, 3600); // 1 hour
}

export async function fetchTenderDetailCached(source, bidNumber, runtime) {
  return getCachedJson(`api:tender:${source}:${bidNumber}`, () => fetchTenderDetail(source, bidNumber), runtime, 43200); // 12 hours
}

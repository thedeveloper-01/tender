// Shared API client for the CGTenders backend (Express + Prisma on Railway).
// Used by both server-rendered Astro pages and the client-side React island.

export const API_BASE_URL =
  import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:4000';

async function getJson(path, { timeout = 5000 } = {}) {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
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
  return `${API_BASE_URL}/api/tenders/${source}/${encodeURIComponent(bidNumber)}/document`;
}

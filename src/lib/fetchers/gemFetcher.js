/**
 * Frontend GeM fetcher — thin wrapper for client-side use.
 * Actual GeM scraping is done by backend/src/fetchers/gem.js.
 * This file is used only by the frontend Astro pages that import it directly.
 */

export async function fetchGemTenders() {
  console.warn('[gemFetcher] Direct frontend fetch not supported — use backend API instead.');
  return [];
}

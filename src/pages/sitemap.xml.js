import { fetchTenders, fetchCities } from '../lib/api.js';
import { tenderDetailPath } from '../lib/cities.js';

const siteUrl = 'https://cgtenders.com';

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

const today = new Date().toISOString().slice(0, 10);

function urlEntry(path, { priority = '0.7', freq = 'daily', lastmod = today } = {}) {
  return `  <url>
    <loc>${escapeXml(siteUrl + path)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

/**
 * Build a sitemap index that points to child sitemaps.
 * Used when total URL count exceeds 10,000.
 */
function buildSitemapIndex(childSitemaps) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${childSitemaps.map(({ loc, lastmod }) => `  <sitemap>
    <loc>${escapeXml(siteUrl + loc)}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>`;
}

function buildUrlset(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;
}

export async function GET(context) {
  // Check if this is a child sitemap request
  const url = new URL(context.request.url);
  const childType = url.searchParams.get('child'); // 'static' | 'tenders'

  let tenders = [];
  let cities = [];
  try {
    if (childType === 'static') {
      // Only need cities for the static child sitemap
      const cd = await fetchCities();
      cities = cd.cities || [];
    } else {
      const [td, cd] = await Promise.all([
        fetchTenders({ status: 'open', limit: 10000 }),
        fetchCities(),
      ]);
      tenders = td.tenders || [];
      cities = cd.cities || [];
    }
  } catch (e) {
    console.error('[sitemap] API error:', e.message);
  }

  // ── Static pages ──────────────────────────────────────────────────────────
  const staticPages = [
    urlEntry('/', { priority: '1.0', freq: 'daily' }),
    urlEntry('/gem', { priority: '0.85', freq: 'daily' }),
    urlEntry('/cspgcl', { priority: '0.85', freq: 'daily' }),
    urlEntry('/districts', { priority: '0.8', freq: 'daily' }),
    urlEntry('/about', { priority: '0.5', freq: 'monthly' }),
    urlEntry('/contact', { priority: '0.4', freq: 'monthly' }),
    urlEntry('/privacy', { priority: '0.3', freq: 'yearly' }),
    urlEntry('/terms', { priority: '0.3', freq: 'yearly' }),
  ];

  // ── District pages ────────────────────────────────────────────────────────
  // Include all cities that have open tenders
  const cityPages = cities
    .filter(c => c.openCount > 0)
    .map(c => urlEntry(`/tenders/${c.slug}`, { priority: '0.8', freq: 'daily' }));

  // ── Tender detail pages ────────────────────────────────────────────────────
  const tenderPages = tenders.map(t => {
    // Use fetchedAt as lastmod; fall back to today
    const rawDate = t.fetchedAt || t.updatedAt || null;
    const lastmod = rawDate
      ? new Date(rawDate).toISOString().slice(0, 10)
      : today;
    const isOpen = t.status === 'open';
    return urlEntry(tenderDetailPath(t), {
      priority: '0.7',
      freq: isOpen ? 'daily' : 'never',
      lastmod,
    });
  });

  const allStaticAndCity = [...staticPages, ...cityPages];
  const totalCount = allStaticAndCity.length + tenderPages.length;

  // ── Decide: single sitemap or sitemap index ────────────────────────────────
  if (totalCount <= 10000) {
    // Single combined sitemap — current default (≈1,400 URLs)
    const body = buildUrlset([...allStaticAndCity, ...tenderPages]);
    return new Response(body, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }

  // Sitemap index mode (>10,000 URLs)
  if (childType === 'static') {
    const body = buildUrlset(allStaticAndCity);
    return new Response(body, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }

  if (childType === 'tenders') {
    const body = buildUrlset(tenderPages);
    return new Response(body, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }

  // Index response
  const body = buildSitemapIndex([
    { loc: '/sitemap.xml?child=static', lastmod: today },
    { loc: '/sitemap.xml?child=tenders', lastmod: today },
  ]);
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

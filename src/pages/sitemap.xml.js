import { fetchTenders, fetchCities } from '../lib/api.js';
import { tenderDetailPath, citySlug } from '../lib/cities.js';

const siteUrl = import.meta.env.SITE_URL || 'https://cgtenders.com';

function url(path, priority = '0.7', freq = 'daily') {
  return `  <url>
    <loc>${siteUrl}${path}</loc>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function GET() {
  let tenders = [];
  let cities = [];
  try {
    const [td, cd] = await Promise.all([
      fetchTenders({ status: 'open', limit: 1000 }),
      fetchCities(),
    ]);
    tenders = td.tenders || [];
    cities = cd.cities || [];
  } catch (e) {
    console.error('[sitemap] API error:', e.message);
  }

  const staticPages = [
    url('/', '1.0', 'daily'),
    url('/tenders', '0.9', 'hourly'),
    url('/districts', '0.8', 'daily'),
    url('/about', '0.5', 'monthly'),
    url('/contact', '0.4', 'monthly'),
    url('/privacy', '0.3', 'yearly'),
    url('/terms', '0.3', 'yearly'),
  ];

  const cityPages = cities
    .filter(c => c.openCount > 0)
    .map(c => url(`/tenders/${c.slug}`, '0.8', 'daily'));

  const tenderPages = tenders.map(t => url(tenderDetailPath(t), '0.7', 'weekly'));

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticPages, ...cityPages, ...tenderPages].join('\n')}
</urlset>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml' },
  });
}

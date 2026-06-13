import { CITIES, cityToSlug } from '../lib/cities.js';

const API_URL = process.env.API_URL || 'http://localhost:4000';
const SITE_URL = 'https://cgtenders.com';

function getTenderSlug(tender) {
  const safeBid = encodeURIComponent(tender.bidNumber);
  const safeTitle = tender.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
  return `${tender.source.toLowerCase()}--${safeBid}--${safeTitle}`;
}

export async function GET() {
  let tenders = [];
  try {
    const res = await fetch(`${API_URL}/api/tenders?status=open&limit=1000`);
    if (res.ok) {
      const data = await res.json();
      tenders = data.tenders || [];
    }
  } catch (e) {
    console.error('[sitemap] Failed to fetch active tenders:', e.message);
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/tenders</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  ${CITIES.map(city => `
  <url>
    <loc>${SITE_URL}/tenders/${cityToSlug(city)}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('')}
  ${tenders.map(t => `
  <url>
    <loc>${SITE_URL}/tenders/${getTenderSlug(t)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`).join('')}
</urlset>`;

  return new Response(sitemap.trim(), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

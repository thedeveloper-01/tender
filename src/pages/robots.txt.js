const siteUrl = import.meta.env.SITE_URL || 'https://cgtenders.com';
export async function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}

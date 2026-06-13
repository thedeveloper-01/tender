const SITE_URL = 'https://cgtenders.com';

export async function GET() {
  const robots = `
User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`.trim();

  return new Response(robots, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

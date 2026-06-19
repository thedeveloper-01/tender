import { fetchCities } from '../../lib/api.js';
import { env } from 'cloudflare:workers';

export async function GET() {
  try {
    let data;
    const SESSION = env?.SESSION;
    if (SESSION) {
      const cached = await SESSION.get('api:cities');
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      data = await fetchCities();
      await SESSION.put('api:cities', JSON.stringify(data), { expirationTtl: 43200 }); // 12 hours
    } else {
      data = await fetchCities();
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[proxy-cities] Error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.FOOTBALL_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const upstream = await fetch(
      'https://api.football-data.org/v4/competitions/WC/matches?season=2026',
      {
        headers: {
          'X-Auth-Token': API_KEY,
          // Ask for goals unfolded so we can detect score changes
          'X-Unfold-Goals': 'true',
        },
      }
    );

    // Forward throttle headers to the client so it can back off intelligently
    const requestsAvailable = upstream.headers.get('X-RequestsAvailable');
    const resetIn           = upstream.headers.get('X-RequestCounter-Reset');

    if (!upstream.ok) {
      const err = await upstream.text();
      return res.status(upstream.status).json({ error: err });
    }

    const data = await upstream.json();

 
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');

    // Forward throttle info as custom headers so the browser JS can read them
    if (requestsAvailable) res.setHeader('X-Requests-Available', requestsAvailable);
    if (resetIn)           res.setHeader('X-Reset-In', resetIn);

    return res.status(200).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Upstream fetch failed' });
  }
}

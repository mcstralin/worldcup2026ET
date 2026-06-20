// api/matches.js — Vercel Serverless Function
// Proxies football-data.org. Key stays server-side only.

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const API_KEY = process.env.FOOTBALL_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    const upstream = await fetch(
      'https://api.football-data.org/v4/competitions/WC/matches?season=2026',
      { headers: { 'X-Auth-Token': API_KEY } }
    );

    const requestsAvailable = upstream.headers.get('X-RequestsAvailable');
    const resetIn           = upstream.headers.get('X-RequestCounter-Reset');

    if (!upstream.ok) {
      const txt = await upstream.text();
      console.error('football-data.org error', upstream.status, txt);
      return res.status(upstream.status).json({
        error: txt,
        hint: upstream.status === 403
          ? 'Your football-data.org plan does not include this competition (WC). The free tier only covers 12 leagues — World Cup matches require a paid plan.'
          : upstream.status === 429
          ? 'Rate limited by football-data.org. Back off and retry later.'
          : undefined,
      });
    }

    const data = await upstream.json();
    if (!Array.isArray(data.matches)) {
      console.error('Unexpected upstream shape (no matches array):', JSON.stringify(data).slice(0, 500));
    }

    const slim = (data.matches || []).map(m => ({
      id:       m.id,
      status:   m.status,
      utcDate:  m.utcDate,
      home:     m.homeTeam?.name,
      away:     m.awayTeam?.name,
      scoreHome: m.score?.fullTime?.home,
      scoreAway: m.score?.fullTime?.away,
    }));

    // Only cache successful, non-empty responses — an empty/error result
    // getting cached for 30s+ is exactly how "it works but doesn't update" happens.
    if (slim.length > 0) {
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    if (requestsAvailable) res.setHeader('X-Requests-Available', requestsAvailable);
    if (resetIn)           res.setHeader('X-Reset-In', resetIn);

    const debug = req.query.debug === '1';
    return res.status(200).json(
      debug
        ? { rawMatchCount: (data.matches || []).length, slimMatchCount: slim.length, sampleRaw: (data.matches || [])[0] || null, matches: slim }
        : { matches: slim }
    );

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Upstream fetch failed' });
  }
}

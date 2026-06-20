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
      return res.status(upstream.status).json({ error: txt });
    }

    const data = await upstream.json();

    // Pull out only what the browser needs: id, status, utcDate, teams, fullTime score
    const slim = (data.matches || []).map(m => ({
      id:       m.id,
      status:   m.status,
      utcDate:  m.utcDate,
      home:     m.homeTeam?.name,
      away:     m.awayTeam?.name,
      scoreHome: m.score?.fullTime?.home,
      scoreAway: m.score?.fullTime?.away,
    }));

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');
    if (requestsAvailable) res.setHeader('X-Requests-Available', requestsAvailable);
    if (resetIn)           res.setHeader('X-Reset-In', resetIn);

    // Also expose raw match list for debugging — remove ?debug after confirming
    const debug = req.query.debug === '1';
    return res.status(200).json(debug ? data : { matches: slim });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Upstream fetch failed' });
  }
}

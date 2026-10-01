let cache: { coins: unknown[]; fetchedAt: string } | null = null;
let cachedAt = 0;
let pending: Promise<Response> | null = null;
export async function GET() {
  if (cache && Date.now() - cachedAt < 55000) return Response.json(cache);
  if (pending) return (await pending).clone();
  pending = (async () => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=1h,24h,7d',
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'CoinObserver/2.0',
          },
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!response.ok) throw new Error('upstream ' + response.status);
      const coins = await response.json();
      if (
        !Array.isArray(coins) ||
        !coins.length ||
        !coins.every(
          (c) => typeof c.id === 'string' && typeof c.symbol === 'string',
        )
      )
        throw new Error('data');
      cache = { coins, fetchedAt: new Date().toISOString() };
      cachedAt = Date.now();
      return Response.json(cache);
    } catch {
      return cache
        ? Response.json({ ...cache, stale: true })
        : Response.json({ error: '行情暂不可用' }, { status: 503 });
    }
  })();
  try {
    return (await pending).clone();
  } finally {
    pending = null;
  }
}

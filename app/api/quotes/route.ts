import { PAIRS, type Coin } from '@/lib/market';
let cache: { coins: Coin[]; fetchedAt: string } | null = null;
let at = 0;
export async function GET() {
  if (cache && Date.now() - at < 30000) return Response.json(cache);
  try {
    const response = await fetch(
      'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
      { signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) throw new Error();
    const data = (await response.json()) as {
      code: string;
      data: { instId: string; last: string; ts: string }[];
    };
    if (data.code !== '0' || !Array.isArray(data.data)) throw new Error();
    const coins: Coin[] = [];
    for (const [id, pair] of Object.entries(PAIRS)) {
      const quote = data.data.find(
        (q: { instId: string }) => q.instId === pair,
      );
      if (
        !quote ||
        !Number.isFinite(Number(quote.last)) ||
        Number(quote.last) <= 0 ||
        !Number.isFinite(Number(quote.ts))
      )
        continue;
      coins.push({
        id,
        symbol: pair.split('-')[0],
        name: id,
        current_price: Number(quote.last),
        total_volume: null,
        last_updated: new Date(Number(quote.ts)).toISOString(),
        price_change_percentage_1h_in_currency: null,
        price_change_percentage_24h_in_currency: null,
      });
    }
    cache = { coins, fetchedAt: new Date().toISOString() };
    at = Date.now();
    return Response.json(cache);
  } catch {
    return Response.json({ error: 'OKX 报价暂不可用' }, { status: 503 });
  }
}

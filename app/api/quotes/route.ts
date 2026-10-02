import { PAIRS, type Coin } from '@/lib/market';
import { sharedFeed, upstream } from '@/lib/feed';
export async function GET() {
  return sharedFeed('quotes', 30000, async () => {
    const data = (await upstream(
      'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
    )) as {
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
        !Number.isFinite(Number(quote.ts)) ||
        Number(quote.ts) <= 0 ||
        Number(quote.ts) > Date.now() + 60000
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

    if (!coins.length) throw new Error('暂无有效报价');
    return { coins, fetchedAt: new Date().toISOString(), source: 'OKX' };
  });
}

import { PAIRS, parseCandles } from '@/lib/market';
import { sharedFeed, upstream } from '@/lib/feed';
export async function GET() {
  return sharedFeed('movers', 55000, async () => {
    const entries = Object.entries(PAIRS),
      coins: Record<string, unknown>[] = [];
    let cursor = 0;
    async function worker() {
      while (cursor < entries.length) {
        const [id, pair] = entries[cursor++];
        try {
          const raw = await upstream(
            `https://www.okx.com/api/v5/market/candles?instId=${pair}&bar=5m&limit=20`,
            8000,
          );
          const bars = parseCandles(raw).filter((c) => c.complete),
            last = bars.at(-1);
          if (
            !last ||
            bars.length < 15 ||
            Date.now() - (last.time + 300000) > 600000
          )
            continue;
          const window = (n: number) => {
            const recent = bars.slice(-n),
              prior = bars.slice(-n - 12, -n);
            if (
              recent.length !== n ||
              prior.length !== 12 ||
              recent.some(
                (c, i) => i > 0 && c.time - recent[i - 1].time !== 300000,
              ) ||
              last.time - prior.at(-1)!.time !== n * 300000
            )
              return { change: null, ratio: null };
            const volume = recent.reduce((sum, c) => sum + c.volume, 0),
              average = (prior.reduce((sum, c) => sum + c.volume, 0) / 12) * n;
            return {
              change: (last.close / recent[0].open - 1) * 100,
              ratio: average > 0 ? volume / average : null,
            };
          };
          const five = window(1),
            fifteen = window(3);
          coins.push({
            id,
            symbol: pair.split('-')[0],
            price: last.close,
            change5m: five.change,
            change15m: fifteen.change,
            ratio5m: five.ratio,
            ratio15m: fifteen.ratio,
            last_updated: new Date(last.time + 300000).toISOString(),
          });
        } catch {}
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    if (!coins.length) throw new Error('短时行情暂不可用');
    return {
      coins,
      fetchedAt: new Date().toISOString(),
      source: 'OKX',
      supported: entries.length,
      missing: entries.length - coins.length,
    };
  });
}

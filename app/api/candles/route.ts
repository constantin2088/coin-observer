import { PAIRS, BARS, aggregateYearly, parseCandles } from '@/lib/market';
import { sharedFeed, upstream } from '@/lib/feed';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams,
    coin = params.get('coin') || '',
    bar = params.get('bar') || '1H',
    after = params.get('after');
  if (
    after &&
    (!/^\d{10,16}$/.test(after) || !Number.isSafeInteger(Number(after)))
  )
    return Response.json({ error: '历史时间无效' }, { status: 400 });
  if (!Object.hasOwn(PAIRS, coin) || !BARS.some((b) => b === bar))
    return Response.json({ error: '暂不支持这个币种或周期' }, { status: 400 });
  const key = 'candles:' + coin + ':' + bar + ':' + (after || '');
  return sharedFeed(key, 55000, async () => {
    const upstreamBar = bar === '1Y' ? '1M' : bar;
    const limit = 300;
    const raw = (await upstream(
      `https://www.okx.com/api/v5/market/${after ? 'history-candles' : 'candles'}?instId=${PAIRS[coin]}&bar=${upstreamBar}&limit=${limit}${after ? `&after=${after}` : ''}`,
      15000,
    )) as { code: string; data: unknown[] };
    const monthlyOrCandles =
        after && raw.code === '0' && Array.isArray(raw.data) && !raw.data.length
          ? []
          : parseCandles(raw),
      candles =
        bar === '1Y' ? aggregateYearly(monthlyOrCandles) : monthlyOrCandles,
      payload = {
        pair: PAIRS[coin],
        bar,
        candles,
        fetchedAt: Date.now(),
        source: 'OKX',
        monthlyCandles: bar === '1Y' ? monthlyOrCandles : undefined,
      };
    return payload;
  });
}

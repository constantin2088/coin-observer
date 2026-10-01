import { PAIRS, BARS, aggregateYearly, parseCandles } from '@/lib/market';
const cache = new Map<string, { at: number; payload: unknown }>();
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
  const key = coin + bar + (after || ''),
    cached = cache.get(key);
  if (cached && Date.now() - cached.at < 55000)
    return Response.json(cached.payload);
  try {
    const upstreamBar = bar === '1Y' ? '1M' : bar;
    const limit = 300;
    const r = await fetch(
      `https://www.okx.com/api/v5/market/${after ? 'history-candles' : 'candles'}?instId=${PAIRS[coin]}&bar=${upstreamBar}&limit=${limit}${after ? `&after=${after}` : ''}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'CoinObserver/1.0',
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!r.ok) throw new Error();
    const raw = (await r.json()) as { code: string; data: unknown[] };
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
    if (cache.size > 150) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), payload });
    return Response.json(payload);
  } catch {
    return Response.json(
      { error: 'OKX K 线暂不可用，请稍后重试' },
      { status: 503 },
    );
  }
}

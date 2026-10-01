export type Coin = {
  id: string;
  name: string;
  symbol: string;
  current_price: number | null;
  total_volume: number | null;
  last_updated: string;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  sparkline_in_7d?: { price: number[] };
};
export type Period = '1h' | '24h' | '7d';
export const PAIRS: Record<string, string> = {
  bitcoin: 'BTC-USDT',
  ethereum: 'ETH-USDT',
  solana: 'SOL-USDT',
  ripple: 'XRP-USDT',
  dogecoin: 'DOGE-USDT',
  cardano: 'ADA-USDT',
  'avalanche-2': 'AVAX-USDT',
  chainlink: 'LINK-USDT',
  polkadot: 'DOT-USDT',
  litecoin: 'LTC-USDT',
  'bitcoin-cash': 'BCH-USDT',
  sui: 'SUI-USDT',
  aptos: 'APT-USDT',

  'shiba-inu': 'SHIB-USDT',
};
export const BARS = ['15m', '1H', '4H', '1D', '1W', '1M', '1Y'] as const;
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  complete: boolean;
};
export function parseCandles(input: unknown): Candle[] {
  if (
    !input ||
    typeof input !== 'object' ||
    !('code' in input) ||
    input.code !== '0' ||
    !('data' in input) ||
    !Array.isArray(input.data)
  )
    throw new Error('K 线数据不可用');
  const rows = input.data.map((row: unknown) => {
    if (!Array.isArray(row) || row.length < 9)
      throw new Error('K 线格式不正确');
    const [time, open, high, low, close] = row.slice(0, 5).map(Number),
      volume = Number(row[7]);
    if (
      ![time, open, high, low, close, volume].every(Number.isFinite) ||
      time <= 0 ||
      low <= 0 ||
      volume < 0 ||
      low > Math.min(open, close) ||
      high < Math.max(open, close) ||
      !['0', '1'].includes(row[8])
    )
      throw new Error('K 线数据不完整');
    return { time, open, high, low, close, volume, complete: row[8] === '1' };
  });
  if (!rows.length) throw new Error('暂时没有 K 线数据');
  return [...new Map(rows.map((c) => [c.time, c])).values()].sort(
    (a, b) => a.time - b.time,
  );
}
export function aggregateYearly(candles: Candle[]): Candle[] {
  const years = new Map<number, Candle[]>();
  for (const candle of candles) {
    const year = new Date(candle.time + 8 * 60 * 60 * 1000).getUTCFullYear();
    years.set(year, [...(years.get(year) ?? []), candle]);
  }
  return [...years.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, items]) => ({
      time: items[0].time,
      open: items[0].open,
      high: Math.max(...items.map((item) => item.high)),
      low: Math.min(...items.map((item) => item.low)),
      close: items.at(-1)!.close,
      volume: items.reduce((sum, item) => sum + item.volume, 0),
      complete:
        new Date(items[0].time + 8 * 3600000).getUTCFullYear() <
          new Date(Date.now() + 8 * 3600000).getUTCFullYear() &&
        items.length === 12 &&
        items.every((c) => c.complete),
    }));
}
export function movingAverage(
  candles: Candle[],
  period: number,
): (number | null)[] {
  if (!Number.isInteger(period) || period < 1)
    throw new Error('Invalid period');
  return candles.map((_, i) =>
    i + 1 < period
      ? null
      : candles
          .slice(i + 1 - period, i + 1)
          .reduce((sum, c) => sum + c.close, 0) / period,
  );
}
export function percent(coin: Coin, period: Period) {
  return coin[`price_change_percentage_${period}_in_currency`] ?? null;
}
export function rankCoins(coins: Coin[], mode: string, period: Period) {
  if (mode === 'volume')
    return coins
      .filter((c) => c.total_volume != null)
      .sort((a, b) => b.total_volume! - a.total_volume!);
  return coins
    .filter((c) => {
      const n = percent(c, period);
      return n != null && (mode === 'gainers' ? n > 0 : n < 0);
    })
    .sort((a, b) =>
      mode === 'gainers'
        ? percent(b, period)! - percent(a, period)!
        : percent(a, period)! - percent(b, period)!,
    );
}
export const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: n < 1 ? 8 : 2,
      }).format(n);
export const quote = (n: number) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: n < 1 ? 8 : 2,
  }).format(n);
export type PriceAlert = {
  id: string;
  coinId: string;
  symbol: string;
  direction: 'above' | 'below';
  source?: 'coingecko' | 'okx';
  target: number;
  createdAt: number;
  triggeredAt?: number;
  triggeredPrice?: number;
};
export function validAlert(value: unknown): value is PriceAlert {
  if (!value || typeof value !== 'object') return false;
  const v = value as PriceAlert;
  return (
    typeof v.id === 'string' &&
    typeof v.coinId === 'string' &&
    typeof v.symbol === 'string' &&
    (v.source === undefined || ['coingecko', 'okx'].includes(v.source)) &&
    ['above', 'below'].includes(v.direction) &&
    Number.isFinite(v.target) &&
    v.target > 0 &&
    Number.isFinite(v.createdAt) &&
    (v.triggeredAt === undefined ||
      (Number.isFinite(v.triggeredAt) && Number.isFinite(v.triggeredPrice)))
  );
}
export function evaluateAlerts(
  alerts: PriceAlert[],
  coins: Coin[],
  now: number,
): PriceAlert[] {
  return alerts.map((alert) => {
    if (alert.triggeredAt) return alert;
    const c = coins.find((c) => c.id === alert.coinId),
      time = Date.parse(c?.last_updated || '');
    if (
      !c ||
      c.current_price == null ||
      !Number.isFinite(c.current_price) ||
      !Number.isFinite(time) ||
      now - time > 300000 ||
      time > now + 60000
    )
      return alert;
    const hit =
      alert.direction === 'above'
        ? c.current_price >= alert.target
        : c.current_price <= alert.target;
    return hit
      ? { ...alert, triggeredAt: now, triggeredPrice: c.current_price }
      : alert;
  });
}

export function evaluateSourceAlerts(
  alerts: PriceAlert[],
  markets: Coin[],
  okx: Coin[],
  now: number,
  marketValid: boolean,
  okxValid: boolean,
) {
  return alerts.map((a) =>
    a.source === 'okx'
      ? okxValid
        ? evaluateAlerts([a], okx, now)[0]
        : a
      : marketValid
        ? evaluateAlerts([a], markets, now)[0]
        : a,
  );
}

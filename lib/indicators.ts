import type { Candle } from './market';
export function ema(values: number[], period: number) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  let value = values[0];
  return values.map((v, i) => {
    value = i ? alpha * v + (1 - alpha) * value : v;
    return value;
  });
}
export function macd(candles: Candle[]) {
  const values = candles.map((c) => c.close),
    fast = ema(values, 12),
    slow = ema(values, 26);
  const dif = fast.map((v, i) => v - slow[i]),
    dea = ema(dif, 9);
  return { dif, dea, histogram: dif.map((v, i) => 2 * (v - dea[i])) };
}
export function rsi(candles: Candle[], period = 14): (number | null)[] {
  const result: (number | null)[] = candles.map(() => null);
  let gain = 0,
    loss = 0;
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (i <= period) {
      gain += Math.max(diff, 0) / period;
      loss += Math.max(-diff, 0) / period;
    } else {
      gain = (gain * (period - 1) + Math.max(diff, 0)) / period;
      loss = (loss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    if (i >= period)
      result[i] =
        loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  }
  return result;
}

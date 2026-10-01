import { validAlert } from './market';

export const PREFS_KEY = 'coin-preferences-v2';
export const CHART_KEY = 'coin-chart-preferences-v2';
export const ALERTS_KEY = 'coin-price-alerts-v1';
export function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
export function storeValue(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function normalizePreferences(
  value: unknown,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return result;
  const v = value as Record<string, unknown>;
  const choices: Record<string, string[]> = {
    sort: ['default', 'asc', 'desc', 'volume', 'price'],
    view: ['watch', 'all', 'gainers', 'losers', 'volume'],
    period: ['24h', '7d'],
    chartMode: ['line', 'candle'],
    rankPeriod: ['1h', '24h', '7d'],
    density: ['comfortable', 'compact'],
  };
  for (const [key, values] of Object.entries(choices))
    if (typeof v[key] === 'string' && values.includes(v[key] as string))
      result[key] = v[key] as string;
  for (const key of [
    'autoRefresh',
    'onlyFavorites',
    'excludeStable',
    'sound',
    'desktop',
  ])
    if (typeof v[key] === 'boolean') result[key] = v[key] as boolean;
  if (typeof v.selected === 'string' && /^[a-z0-9-]{1,100}$/.test(v.selected))
    result.selected = v.selected;
  if (
    typeof v.threshold === 'number' &&
    Number.isFinite(v.threshold) &&
    v.threshold >= 0.1 &&
    v.threshold <= 100
  )
    result.threshold = v.threshold;
  if (
    typeof v.minVolume === 'number' &&
    Number.isFinite(v.minVolume) &&
    v.minVolume >= 0 &&
    v.minVolume <= 1000000
  )
    result.minVolume = v.minVolume;
  return result;
}
export function validateBackup(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('备份格式不正确');
  const v = input as Record<string, unknown>;
  if (
    v.app !== '币观' ||
    v.version !== 2 ||
    !Array.isArray(v.favorites) ||
    !v.favorites.every(
      (x) => typeof x === 'string' && /^[a-z0-9-]{1,100}$/.test(x),
    ) ||
    v.favorites.length > 500 ||
    !Array.isArray(v.alerts) ||
    v.alerts.length > 12 ||
    !v.alerts.every(validAlert)
  )
    throw new Error('文件不是有效的币观备份，原有设置未修改');
  const chart =
    v.chart && typeof v.chart === 'object'
      ? (v.chart as Record<string, unknown>)
      : {};
  return {
    favorites: [...new Set(v.favorites)],
    alerts: v.alerts,
    history: Array.isArray(v.history)
      ? v.history
          .filter(validAlert)
          .filter((a) => a.triggeredAt)
          .slice(0, 100)
      : [],
    preferences: normalizePreferences(v.preferences),
    chart: {
      bar: ['15m', '1H', '4H', '1D', '1W', '1M', '1Y'].includes(
        String(chart.bar),
      )
        ? chart.bar
        : '1H',
      ma: typeof chart.ma === 'boolean' ? chart.ma : true,
      windowSize:
        typeof chart.windowSize === 'number' &&
        chart.windowSize >= 20 &&
        chart.windowSize <= 300
          ? chart.windowSize
          : 100,
    },
  };
}

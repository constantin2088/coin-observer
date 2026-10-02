const isCache = (key: string) =>
  key.startsWith('coin-candles-') ||
  key.startsWith('coin-feed-cache-') ||
  key === 'coin-market-cache-v2';
export function clearMarketCache(except = '') {
  try {
    for (const key of Object.keys(localStorage))
      if (isCache(key) && key !== except) localStorage.removeItem(key);
  } catch {}
}
export function cacheStats() {
  try {
    const keys = Object.keys(localStorage).filter(isCache);
    return {
      count: keys.length,
      bytes: keys.reduce(
        (n, k) => n + (localStorage.getItem(k)?.length || 0) * 2,
        0,
      ),
    };
  } catch {
    return { count: 0, bytes: 0 };
  }
}
export function pruneCache(except = '') {
  try {
    const entries = Object.keys(localStorage)
      .filter(isCache)
      .map((key) => {
        const text = localStorage.getItem(key) || '';
        let time = 0;
        try {
          const v = JSON.parse(text);
          const t = v.at ?? v.fetchedAt;
          time = typeof t === 'number' ? t : Date.parse(t);
        } catch {}
        return {
          key,
          bytes: text.length * 2,
          time: Number.isFinite(time) ? time : 0,
        };
      })
      .sort((a, b) => a.time - b.time);
    let size = entries.reduce((n, e) => n + e.bytes, 0),
      count = entries.length;
    for (const e of entries)
      if (
        e.key !== except &&
        (size > 3 * 1024 * 1024 ||
          count > 48 ||
          Date.now() - e.time >
            (e.key.startsWith('coin-candles-') ? 30 : 1) * 86400000)
      ) {
        localStorage.removeItem(e.key);
        size -= e.bytes;
        count--;
      }
  } catch {}
}

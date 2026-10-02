import { readStored, storeValue } from './preferences';
const pending = new Map<string, Promise<unknown>>();
const cooldown = new Map<string, { until: number; message: string }>();
export async function fetchFeed<T>(url: string, ttl = 45000): Promise<T> {
  if (pending.has(url)) return pending.get(url) as Promise<T>;
  const key = 'coin-feed-cache-' + url;
  const work = async () => {
    const saved = readStored<{ at: number; data: T } | null>(key, null);
    if (
      saved &&
      Number.isFinite(saved.at) &&
      Date.now() - saved.at >= 0 &&
      Date.now() - saved.at < ttl
    )
      return saved.data;
    const blocked = cooldown.get(url);
    if (blocked && Date.now() < blocked.until) throw new Error(blocked.message);
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(url === '/api/movers' ? 45000 : 18000),
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('行情格式异常');
      if (!response.ok) {
        const message =
          typeof data.error === 'string' ? data.error : '行情暂不可用';
        cooldown.set(url, {
          until:
            Date.now() +
            Math.max(
              15000,
              Math.min(300000, Number(data.retryAfter || 15) * 1000),
            ),
          message,
        });
        throw new Error(message);
      }
      if (!data.stale) {
        storeValue(key, { at: Date.now(), data });
        cooldown.delete(url);
      }
      return data as unknown as T;
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === 'TimeoutError'
          ? '行情请求超时，请稍后重试'
          : error instanceof Error
            ? error.message
            : '行情请求失败',
      );
    }
  };
  const job = (
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('coin-feed:' + url, work)
      : work()
  ).finally(() => pending.delete(url));
  pending.set(url, job);
  return job;
}

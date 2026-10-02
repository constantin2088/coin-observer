type Entry = {
  value?: Record<string, unknown>;
  at: number;
  failures: number;
  retryAt: number;
  issue?: string;
  pending?: Promise<Response>;
};
const entries = new Map<string, Entry>();
export class FeedError extends Error {
  constructor(
    public kind: string,
    message: string,
  ) {
    super(message);
  }
}
export async function upstream(url: string, timeout = 12000) {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CoinObserver/1.1.0',
      },
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw new FeedError(
      error instanceof Error &&
        ['TimeoutError', 'AbortError'].includes(error.name)
        ? 'timeout'
        : 'network',
      '行情连接失败',
    );
  }
  if (!response.ok)
    throw new FeedError(
      response.status === 429 ? 'rate_limit' : 'upstream',
      '行情服务暂不可用',
    );
  try {
    return await response.json();
  } catch {
    throw new FeedError('data', '行情格式异常');
  }
}
export const issueText: Record<string, string> = {
  rate_limit: '行情请求过于频繁，已延长重试间隔',
  timeout: '行情服务响应超时',
  network: '无法连接行情服务',
  data: '行情数据异常',
  upstream: '行情服务暂不可用',
};
export async function sharedFeed(
  key: string,
  ttl: number,
  loader: () => Promise<Record<string, unknown>>,
) {
  let entry = entries.get(key);
  if (!entry) {
    entry = { at: 0, failures: 0, retryAt: 0 };
    entries.set(key, entry);
  }
  const e = entry;
  const fallback = () => {
    const retryAfter = Math.max(1, Math.ceil((e.retryAt - Date.now()) / 1000));
    const details = {
      stale: true,
      issue: e.issue || 'upstream',
      message: issueText[e.issue || 'upstream'],
      retryAfter,
    };
    return Response.json(
      e.value
        ? { ...e.value, ...details }
        : { error: details.message, ...details },
      {
        status: e.value ? 200 : e.issue === 'rate_limit' ? 429 : 503,
        headers: {
          'Retry-After': String(retryAfter),
          'Cache-Control': 'no-store',
        },
      },
    );
  };
  if (e.value && Date.now() - e.at < ttl) return Response.json(e.value);
  if (e.pending) return (await e.pending).clone();
  if (Date.now() < e.retryAt) return fallback();
  e.pending = (async () => {
    try {
      const value = await loader();
      e.value = value;
      e.at = Date.now();
      e.failures = 0;
      e.retryAt = 0;
      e.issue = undefined;
      return Response.json(value, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      e.issue = error instanceof FeedError ? error.kind : 'data';
      e.failures++;
      e.retryAt =
        Date.now() +
        Math.min(
          300000,
          (e.issue === 'rate_limit' ? 60000 : 15000) *
            2 ** Math.min(e.failures - 1, 5),
        );
      return fallback();
    }
  })();
  try {
    return (await e.pending).clone();
  } finally {
    e.pending = undefined;
    if (entries.size > 160)
      for (const [k, v] of entries) {
        if (!v.pending && k !== key) {
          entries.delete(k);
          break;
        }
      }
  }
}

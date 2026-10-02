'use client';
import { useEffect, useRef, useState } from 'react';
import { fetchFeed } from '@/lib/client-feed';
import { readStored, storeValue } from '@/lib/preferences';
import { money, PAIRS, type Coin } from '@/lib/market';
import { beijingTime } from '@/lib/local-market';
type ShortCoin = {
  id: string;
  symbol: string;
  price: number;
  change5m: number | null;
  change15m: number | null;
  ratio5m: number | null;
  ratio15m: number | null;
  last_updated: string;
};
type Event = {
  coinId: string;
  symbol: string;
  change: number;
  at: number;
  period: string;
  ratio?: number | null;
};
const stable = new Set([
  'usdt',
  'usdc',
  'dai',
  'usds',
  'usde',
  'susde',
  'susds',
  'fdusd',
  'tusd',
  'usdd',
  'pyusd',
  'usd1',
  'usdf',
  'rlusd',
  'gusd',
  'frax',
  'usdp',
  'eurc',
  'eurcv',
  'usd0',
  'ustb',
]);
export function MoversPanel({
  coins,
  valid,
  favorites,
  threshold,
  setThreshold,
  minVolume,
  setMinVolume,
  onlyFavorites,
  setOnlyFavorites,
  excludeStable,
  setExcludeStable,
  selectCoin,
}: {
  coins: Coin[];
  valid: boolean;
  favorites: string[];
  threshold: number;
  setThreshold: (n: number) => void;
  minVolume: number;
  setMinVolume: (n: number) => void;
  onlyFavorites: boolean;
  setOnlyFavorites: (v: boolean) => void;
  excludeStable: boolean;
  setExcludeStable: (v: boolean) => void;
  selectCoin: (id: string) => void;
}) {
  const [period, setPeriod] = useState('1h'),
    [ratio, setRatio] = useState(0),
    [ready, setReady] = useState(false),
    [short, setShort] = useState<ShortCoin[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [shortValid, setShortValid] = useState(false),
    [history, setHistory] = useState<Event[]>([]);
  const active = useRef(new Set<string>()),
    lastRecorded = useRef(new Map<string, number>());
  useEffect(() => {
    const prefs = readStored<{ period?: string; ratio?: number }>(
      'coin-mover-settings-v3',
      {},
    );
    if (['1h', '5m', '15m'].includes(prefs.period || ''))
      setPeriod(prefs.period!);
    if ([0, 1.5, 2, 3].includes(prefs.ratio || 0)) setRatio(prefs.ratio || 0);
    const old = readStored<Event[]>('coin-mover-history-v3', []);
    if (Array.isArray(old))
      setHistory(
        old
          .filter(
            (x) =>
              x &&
              typeof x.symbol === 'string' &&
              Number.isFinite(x.change) &&
              Number.isFinite(x.at),
          )
          .slice(0, 100),
      );
    if (Array.isArray(old))
      for (const x of old) {
        if (x && Number.isFinite(x.at) && Number.isFinite(x.change))
          lastRecorded.current.set(
            x.period + ':' + x.coinId + ':' + (x.change > 0 ? 'up' : 'down'),
            Math.max(
              x.at,
              lastRecorded.current.get(
                x.period +
                  ':' +
                  x.coinId +
                  ':' +
                  (x.change > 0 ? 'up' : 'down'),
              ) || 0,
            ),
          );
      }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) storeValue('coin-mover-settings-v3', { period, ratio });
  }, [period, ratio, ready]);
  useEffect(() => {
    if (period === '1h') return;
    let disposed = false,
      running = false;
    const load = async () => {
      if (running) return;
      running = true;
      setBusy(true);
      try {
        const d = await fetchFeed<{
          coins: ShortCoin[];
          stale?: boolean;
          missing?: number;
        }>('/api/movers');
        if (!disposed) {
          setShort(
            d.coins.filter(
              (x) =>
                x &&
                Object.hasOwn(PAIRS, x.id) &&
                Number.isFinite(x.price) &&
                Number.isFinite(Date.parse(x.last_updated)),
            ),
          );
          setShortValid(!d.stale);
          setError(
            d.stale
              ? '短时行情更新延迟，当前显示缓存'
              : d.missing
                ? `${d.missing} 个币种暂缺短时数据`
                : '',
          );
        }
      } catch (e) {
        if (!disposed) {
          setShortValid(false);
          setError(e instanceof Error ? e.message : '短时行情加载失败');
        }
      } finally {
        running = false;
        if (!disposed) setBusy(false);
      }
    };
    void load();
    const timer = setInterval(load, 60000);
    const resume = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('online', load);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('online', load);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [period]);
  const rows = coins
    .map((c) => {
      const s = short.find((x) => x.id === c.id);
      return {
        coin: c,
        change:
          period === '1h'
            ? c.price_change_percentage_1h_in_currency
            : period === '5m'
              ? s?.change5m
              : s?.change15m,
        ratio: period === '5m' ? s?.ratio5m : s?.ratio15m,
        time: s?.last_updated,
      };
    })
    .filter(
      (x) =>
        typeof x.change === 'number' &&
        Number.isFinite(x.change) &&
        Math.abs(x.change) >= threshold &&
        (x.coin.total_volume ?? 0) >= minVolume * 1e8 &&
        (!onlyFavorites || favorites.includes(x.coin.id)) &&
        (!excludeStable || !stable.has(x.coin.symbol.toLowerCase())) &&
        (period === '1h' ||
          (x.time &&
            Date.now() - Date.parse(x.time) <= 600000 &&
            (ratio === 0 || (x.ratio ?? 0) >= ratio))),
    )
    .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!));
  const signature = rows
    .map((x) => x.coin.id + ':' + (x.change! > 0 ? 'up' : 'down'))
    .sort()
    .join('|');
  useEffect(() => {
    if (!ready || !(period === '1h' ? valid : shortValid)) return;
    const keys = new Set(
        rows.map(
          (x) =>
            period + ':' + x.coin.id + ':' + (x.change! > 0 ? 'up' : 'down'),
        ),
      ),
      at = Date.now();
    const events = rows
      .filter((x) => {
        const key =
          period + ':' + x.coin.id + ':' + (x.change! > 0 ? 'up' : 'down');
        return (
          !active.current.has(key) &&
          at - (lastRecorded.current.get(key) || 0) > 600000
        );
      })
      .map((x) => {
        lastRecorded.current.set(
          period + ':' + x.coin.id + ':' + (x.change! > 0 ? 'up' : 'down'),
          at,
        );
        return {
          coinId: x.coin.id,
          symbol: x.coin.symbol.toUpperCase(),
          change: x.change!,
          at,
          period,
          ratio: x.ratio,
        };
      });
    active.current = keys;
    if (events.length)
      setHistory((prev) => {
        const next = [...events, ...prev].slice(0, 100);
        storeValue('coin-mover-history-v3', next);
        return next;
      });
  }, [signature, period, ready, valid, shortValid]);
  return (
    <aside className="panel movers">
      <div className="section-head">
        <h2>异动观察</h2>
        <span className="tag">{period === '1h' ? 'CoinGecko' : 'OKX'}</span>
      </div>
      <div className="segmented" aria-label="异动时间窗口">
        {[
          ['1h', '1 小时'],
          ['5m', '5 分钟'],
          ['15m', '15 分钟'],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={period === key}
            onClick={() => setPeriod(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="threshold">
        涨跌幅绝对值 ≥{' '}
        <input
          aria-label="异动百分比阈值"
          type="number"
          min="0.1"
          max="100"
          step="0.1"
          value={threshold}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 0.1 && n <= 100) setThreshold(n);
          }}
        />{' '}
        %
      </label>
      <details className="mover-options">
        <summary>筛选条件</summary>
        <div className="mover-filters">
          <label>
            24 小时成交额 ≥{' '}
            <input
              aria-label="异动最低成交额（亿美元）"
              type="number"
              min="0"
              step="0.1"
              value={minVolume}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0 && n <= 1000000)
                  setMinVolume(n);
              }}
            />{' '}
            亿美元
          </label>
          <label>
            <input
              type="checkbox"
              checked={onlyFavorites}
              onChange={(e) => setOnlyFavorites(e.target.checked)}
            />
            仅看自选
          </label>
          <label>
            <input
              type="checkbox"
              checked={excludeStable}
              onChange={(e) => setExcludeStable(e.target.checked)}
            />
            排除常见稳定币
          </label>
          {period !== '1h' && (
            <label>
              成交额放大{' '}
              <select
                aria-label="短时放量门槛"
                value={ratio}
                onChange={(e) => setRatio(Number(e.target.value))}
              >
                {[0, 1.5, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n ? `${n} 倍以上` : '不限'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </details>
      {error && (
        <p className="form-message" role="status">
          {error}
        </p>
      )}
      <div className="mover-list">
        {rows.slice(0, 8).map((x) => (
          <button
            key={x.coin.id}
            className="mover"
            onClick={() => selectCoin(x.coin.id)}
          >
            <span className={x.change! > 0 ? 'up' : 'down'}>
              {x.change! > 0 ? '↗' : '↘'}
            </span>
            <span>
              <b>{x.coin.symbol.toUpperCase()}</b>
              <small>
                {money(x.coin.current_price)}
                {period !== '1h' ? ' · 短时变化按 OKX 报价' : ''}
              </small>
              {period !== '1h' && (
                <small>
                  成交额 {x.ratio?.toFixed(2) ?? '—'} 倍 ·{' '}
                  {x.time ? beijingTime(x.time) : '—'}
                </small>
              )}
            </span>
            <strong className={x.change! > 0 ? 'up' : 'down'}>
              {x.change! > 0 ? '+' : ''}
              {x.change!.toFixed(2)}%
            </strong>
          </button>
        ))}
        {!rows.length && (
          <div className="empty">
            {busy ? '正在获取短时行情…' : '当前没有达到条件的币种'}
          </div>
        )}
      </div>
      <p className="muted footnote">
        {period === '1h'
          ? '前 100 币种 · 1 小时涨跌'
          : '已接入的 14 个现货币种 · 最近完整 5 分钟 K 线；成交额比较此前 12 根均值'}{' '}
        · 每分钟检查
      </p>
      <details className="alert-history">
        <summary>异动记录 · {history.length} 条</summary>
        {history.slice(0, 20).map((x, i) => (
          <button
            className="mover-history-row"
            key={x.at + '-' + x.coinId + '-' + i}
            onClick={() => selectCoin(x.coinId)}
          >
            <b>{x.symbol}</b>
            <span className={x.change > 0 ? 'up' : 'down'}>
              {x.change > 0 ? '+' : ''}
              {x.change.toFixed(2)}%
            </span>
            <small>
              {x.period} · {beijingTime(x.at)}
            </small>
          </button>
        ))}
        {!history.length && (
          <p className="muted">达到筛选条件时记录，最多保留 100 条。</p>
        )}
      </details>
    </aside>
  );
}

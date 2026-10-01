'use client';
import { useEffect, useState, useRef } from 'react';
import { CHART_KEY, readStored, storeValue } from '@/lib/preferences';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  PAIRS,
  BARS,
  aggregateYearly,
  movingAverage,
  quote,
  type Candle,
} from '@/lib/market';
type Payload = {
  pair: string;
  bar: string;
  candles: Candle[];
  fetchedAt: number;
  monthlyCandles?: Candle[];
};
function mergePayload(previous: Payload | null, incoming: Payload): Payload {
  if (
    !previous ||
    previous.pair !== incoming.pair ||
    previous.bar !== incoming.bar
  )
    return incoming;
  const merge = (a: Candle[], b: Candle[]) =>
    [...new Map([...a, ...b].map((c) => [c.time, c])).values()].sort(
      (a, b) => a.time - b.time,
    );
  if (incoming.bar === '1Y') {
    const monthlyCandles = merge(
      previous.monthlyCandles || [],
      incoming.monthlyCandles || [],
    );
    return {
      ...incoming,
      monthlyCandles,
      candles: aggregateYearly(monthlyCandles),
    };
  }
  return { ...incoming, candles: merge(previous.candles, incoming.candles) };
}
const date = (time: number) =>
  new Date(time).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
export function CandleChart({ coinId }: { coinId: string }) {
  const [bar, setBar] = useState('1H'),
    [data, setData] = useState<Payload | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [ma, setMa] = useState(true),
    [cursor, setCursor] = useState<{ index: number; y: number } | null>(null);
  const [windowSize, setWindowSize] = useState(100),
    [offset, setOffset] = useState(0),
    [prefsReady, setPrefsReady] = useState(false),
    [historyBusy, setHistoryBusy] = useState(false),
    [historyEnd, setHistoryEnd] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [cached, setCached] = useState(false);
  const stage = useRef<HTMLDivElement>(null),
    svgRef = useRef<SVGSVGElement>(null),
    historyController = useRef<AbortController | null>(null),
    drag = useRef<{
      x: number;
      offset: number;
      size: number;
      count: number;
    } | null>(null);
  useEffect(() => {
    const prefs = readStored<Record<string, unknown>>(CHART_KEY, {});
    if (BARS.includes(prefs.bar as (typeof BARS)[number]))
      setBar(String(prefs.bar));
    if (typeof prefs.ma === 'boolean') setMa(prefs.ma);
    if (
      typeof prefs.windowSize === 'number' &&
      prefs.windowSize >= 20 &&
      prefs.windowSize <= 300
    )
      setWindowSize(prefs.windowSize);
    setPrefsReady(true);
    const changed = () =>
      setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => {
    if (prefsReady) storeValue(CHART_KEY, { bar, ma, windowSize });
  }, [bar, ma, windowSize, prefsReady]);
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setCursor(null);
      setWindowSize((size) =>
        Math.max(
          20,
          Math.min(300, Math.round(size * (event.deltaY > 0 ? 1.2 : 0.8))),
        ),
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [data, bar]);
  useEffect(() => {
    if (data && data.pair === PAIRS[coinId] && data.bar === bar)
      storeValue(`coin-candles-${coinId}-${bar}`, data);
  }, [data, coinId, bar]);
  async function loadHistory() {
    if (historyController.current || !data || historyEnd) return;
    const current = data,
      oldest = (current.monthlyCandles || current.candles)[0]?.time;
    if (!oldest) return;
    const controller = new AbortController();
    historyController.current = controller;
    setHistoryBusy(true);
    try {
      const r = await fetch(
        `/api/candles?coin=${encodeURIComponent(coinId)}&bar=${bar}&after=${oldest}`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(18000),
          ]),
        },
      );
      if (!r.ok) throw new Error();
      const payload: Payload = await r.json();
      if (
        !controller.signal.aborted &&
        payload.pair === current.pair &&
        payload.bar === current.bar
      ) {
        const older = (payload.monthlyCandles || payload.candles).filter(
          (c) => c.time < oldest,
        );
        setHistoryEnd(!older.length);
        setData((prev) => mergePayload(payload, prev || current));
        setError('');
      }
    } catch {
      if (!controller.signal.aborted)
        setError('历史 K 线加载失败，已有图表仍可查看，请重试。');
    } finally {
      if (historyController.current === controller) {
        historyController.current = null;
        setHistoryBusy(false);
      }
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      setError('浏览器未能进入全屏，可使用浏览器缩放查看。');
    }
  }
  const pair = PAIRS[coinId];
  useEffect(() => {
    if (!prefsReady) return;
    historyController.current?.abort();
    historyController.current = null;
    setHistoryBusy(false);
    setHistoryEnd(false);
    setOffset(0);
    const stored = readStored<Payload | null>(
      `coin-candles-${coinId}-${bar}`,
      null,
    );
    setData(
      stored &&
        stored.pair === pair &&
        stored.bar === bar &&
        Array.isArray(stored.candles)
        ? stored
        : null,
    );
    setCached(Boolean(stored));
    setError('');
    setCursor(null);
    if (!pair) return;
    let disposed = false,
      running = false;
    const controller = new AbortController();
    async function load() {
      if (running) return;
      running = true;
      setBusy(true);
      try {
        const r = await fetch(
          `/api/candles?coin=${encodeURIComponent(coinId)}&bar=${bar}`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(18000),
            ]),
          },
        );
        if (!r.ok) throw new Error();
        const payload: Payload = await r.json();
        if (
          payload.pair !== pair ||
          payload.bar !== bar ||
          !Array.isArray(payload.candles)
        )
          throw new Error();
        if (!disposed) {
          setData((previous) => mergePayload(previous, payload));
          setCached(false);
          setError('');
        }
      } catch {
        if (!disposed) setCached(true);
        if (!disposed)
          setError('K 线更新失败。已有图表为上次数据，请稍后重试。');
      } finally {
        running = false;
        if (!disposed) setBusy(false);
      }
    }
    load();
    const timer = setInterval(load, 60000);
    window.addEventListener('online', load);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('online', load);
      historyController.current?.abort();
    };
  }, [coinId, pair, bar, retry, prefsReady]);
  if (!pair)
    return (
      <div className="empty">
        该币种暂未接入 OKX K 线，可切回「综合走势」。首批支持 BTC、ETH、SOL 等
        {Object.keys(PAIRS).length} 个币种。
      </div>
    );
  const allCandles =
      data?.pair === pair && data.bar === bar ? data.candles : [],
    safeOffset = Math.min(offset, Math.max(0, allCandles.length - 20)),
    end = allCandles.length - safeOffset,
    start = Math.max(0, end - windowSize),
    candles = allCandles.slice(start, end),
    a7 = movingAverage(allCandles, 7).slice(start, end),
    a25 = movingAverage(allCandles, 25).slice(start, end);
  const low = candles.length ? Math.min(...candles.map((c) => c.low)) : 0,
    high = candles.length ? Math.max(...candles.map((c) => c.high)) : 1,
    pad = Math.max((high - low) * 0.07, high * 0.0001),
    min = low - pad,
    max = high + pad,
    volumeMax = Math.max(1, ...candles.map((c) => c.volume));
  const W = 900,
    left = 8,
    right = 812,
    top = 20,
    bottom = 220,
    step = (right - left) / Math.max(candles.length, 1),
    x = (i: number) => left + (i + 0.5) * step,
    y = (p: number) => bottom - ((p - min) / (max - min)) * (bottom - top);
  const line = (values: (number | null)[]) =>
    values.flatMap((v, i) => (v == null ? [] : [`${x(i)},${y(v)}`])).join(' ');
  const focus = cursor === null ? null : candles[cursor.index];
  const cursorPrice = cursor
    ? max - ((cursor.y - top) / (bottom - top)) * (max - min)
    : null;
  const focusChange = focus
    ? ((focus.close - focus.open) / focus.open) * 100
    : 0;
  const focusChangeText = `${focusChange > 0 ? '+' : ''}${focusChange.toFixed(2)}%`;
  const focusColor =
    focusChange > 0 ? '#ef8596' : focusChange < 0 ? '#65caaa' : '#9bb0bc';
  return (
    <div className="candle-section" ref={stage}>
      <div className="chart-toolbar">
        <Tabs value={bar} onValueChange={(v) => setBar(String(v))}>
          <TabsList aria-label="K 线周期">
            {BARS.map((b, i) => (
              <TabsTrigger key={b} value={b}>
                {
                  [
                    '15 分钟',
                    '1 小时',
                    '4 小时',
                    '日线',
                    '周线',
                    '月线',
                    '年线',
                  ][i]
                }
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <label className="check-label">
          <Checkbox checked={ma} onCheckedChange={(v) => setMa(Boolean(v))} />
          MA7 / MA25
        </label>
        <button
          onClick={() => setRetry((v) => v + 1)}
          disabled={busy}
          className="text-button"
        >
          {busy ? '更新中…' : '刷新 K 线'}
        </button>
      </div>
      <div className="chart-navigation">
        <button
          onClick={() =>
            setWindowSize((n) => Math.max(20, Math.round(n * 0.8)))
          }
        >
          放大
        </button>
        <button
          onClick={() =>
            setWindowSize((n) => Math.min(300, Math.round(n * 1.2)))
          }
        >
          缩小
        </button>
        <button
          onClick={() => {
            setOffset(0);
            setCursor(null);
          }}
        >
          回到最新
        </button>
        <button
          onClick={() => void loadHistory()}
          disabled={historyBusy || historyEnd || !data}
        >
          {historyBusy
            ? '加载历史中…'
            : historyEnd
              ? '已到最早记录'
              : '加载更早'}
        </button>
        <button onClick={() => void toggleFullscreen()}>
          {fullscreen ? '退出全屏' : '全屏查看'}
        </button>
        <span className="muted">
          {pair} · 滚轮缩放 · 按住拖动 · {cached ? '缓存数据' : 'OKX USDT 现货'}
        </span>
      </div>
      {error && (
        <p className="notice" role="status">
          {error}
        </p>
      )}
      {candles.length ? (
        <>
          <svg
            ref={svgRef}
            className="candle-svg"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setOffset((n) =>
                  Math.min(Math.max(0, allCandles.length - 20), n + 10),
                );
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                setOffset((n) => Math.max(0, n - 10));
              }
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                x: event.clientX,
                offset: safeOffset,
                size:
                  event.currentTarget.getBoundingClientRect().width *
                  (804 / 900),
                count: candles.length,
              };
              setCursor(null);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const d = drag.current;
              setOffset(
                Math.max(
                  0,
                  Math.min(
                    Math.max(0, allCandles.length - 20),
                    d.offset +
                      Math.round(((event.clientX - d.x) / d.size) * d.count),
                  ),
                ),
              );
            }}
            onPointerUp={(event) => {
              drag.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            viewBox={`0 0 ${W} 315`}
            role="img"
            aria-label={`${pair} ${bar} K 线与成交额`}
            onMouseMove={(event) => {
              if (drag.current) return;
              const svg = event.currentTarget;
              const matrix = svg.getScreenCTM();
              if (!matrix) return;
              const point = svg.createSVGPoint();
              point.x = event.clientX;
              point.y = event.clientY;
              const local = point.matrixTransform(matrix.inverse());
              if (
                local.x < left ||
                local.x > right ||
                local.y < top ||
                local.y > 282
              ) {
                setCursor(null);
                return;
              }
              setCursor({
                index: Math.max(
                  0,
                  Math.min(
                    candles.length - 1,
                    Math.floor((local.x - left) / step),
                  ),
                ),
                y: local.y,
              });
            }}
            onMouseLeave={() => setCursor(null)}
          >
            {[0, 1, 2, 3, 4].map((i) => {
              const v = min + ((max - min) * i) / 4;
              return (
                <g key={i}>
                  <line
                    x1={left}
                    x2={right}
                    y1={y(v)}
                    y2={y(v)}
                    stroke="#2a4050"
                    strokeDasharray="3 5"
                  />
                  <text x={right + 9} y={y(v) + 4} fill="#a8bcc7" fontSize="12">
                    {quote(v)}
                  </text>
                </g>
              );
            })}
            {candles.map((c, i) => {
              const color =
                c.close > c.open
                  ? '#ef8596'
                  : c.close < c.open
                    ? '#65caaa'
                    : '#9bb0bc';
              return (
                <g key={c.time}>
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={y(c.high)}
                    y2={y(c.low)}
                    stroke={color}
                  />
                  <rect
                    x={x(i) - step * 0.31}
                    y={Math.min(y(c.open), y(c.close))}
                    width={step * 0.62}
                    height={Math.max(1, Math.abs(y(c.open) - y(c.close)))}
                    fill={color}
                    opacity={c.complete ? 1 : 0.7}
                  />
                  <rect
                    x={x(i) - step * 0.31}
                    y={282 - (c.volume / volumeMax) * 40}
                    width={step * 0.62}
                    height={(c.volume / volumeMax) * 40}
                    fill={color}
                    opacity=".5"
                  />
                </g>
              );
            })}
            {ma && (
              <>
                <polyline
                  points={line(a7)}
                  fill="none"
                  stroke="#eac878"
                  strokeWidth="1.5"
                />
                <polyline
                  points={line(a25)}
                  fill="none"
                  stroke="#96a6ff"
                  strokeWidth="1.5"
                />
              </>
            )}
            {cursor && (
              <g pointerEvents="none">
                <line
                  x1={x(cursor.index)}
                  x2={x(cursor.index)}
                  y1={top}
                  y2={282}
                  stroke="#8ea3af"
                  strokeWidth="1"
                  strokeDasharray="4 5"
                  opacity="0.8"
                />
                <line
                  x1={left}
                  x2={right}
                  y1={cursor.y}
                  y2={cursor.y}
                  stroke="#8ea3af"
                  strokeWidth="1"
                  strokeDasharray="4 5"
                  opacity="0.8"
                />
                {cursor.y <= bottom && cursorPrice !== null && (
                  <g transform={`translate(${right + 2},${cursor.y - 11})`}>
                    <rect
                      width="80"
                      height="22"
                      rx="4"
                      fill="#263d4b"
                      stroke="#608093"
                    />
                    <text
                      x="40"
                      y="15"
                      textAnchor="middle"
                      fill="#f1f7fa"
                      fontSize="12"
                      fontWeight="600"
                    >
                      {quote(cursorPrice)}
                    </text>
                  </g>
                )}
              </g>
            )}
            <text x={left} y="238" fill="#a8bcc7" fontSize="12">
              成交额 USDT
            </text>
            {[0, Math.floor(candles.length / 2), candles.length - 1].map(
              (i, j) => (
                <text
                  key={j}
                  x={j === 0 ? left : j === 2 ? right : x(i)}
                  y="307"
                  textAnchor={j === 0 ? 'start' : j === 2 ? 'end' : 'middle'}
                  fill="#a8bcc7"
                  fontSize="12"
                >
                  {date(candles[i].time)}
                </text>
              ),
            )}
            {focus && (
              <g
                pointerEvents="none"
                transform={`translate(${Math.min(right - 176, Math.max(left, x(cursor!.index) + (x(cursor!.index) > right / 2 ? -188 : 12)))},28)`}
              >
                <rect
                  width="176"
                  height="80"
                  rx="8"
                  fill="#1b2d39"
                  stroke="#608093"
                />
                <text x="12" y="21" fill="#b6cbd5" fontSize="12">
                  {date(focus.time)}
                </text>
                <text x="12" y="45" fill="#f1f7fa" fontSize="13">
                  收盘价{' '}
                  {new Intl.NumberFormat('en-US', {
                    maximumFractionDigits: 0,
                  }).format(focus.close)}
                </text>
                <text
                  x="12"
                  y="68"
                  fill={focusColor}
                  fontSize="16"
                  fontWeight="600"
                >
                  {focusChangeText}
                </text>
              </g>
            )}
          </svg>
          <div className="chart-note">
            <span>
              <i className="ma7">MA7</i> / <i className="ma25">MA25</i>：最近 7
              / 25 根收盘价的简单平均 · 显示 {candles.length} / 已加载{' '}
              {allCandles.length} 根
            </span>
            <span>获取时间 {data ? date(data.fetchedAt) : '—'}</span>
          </div>
        </>
      ) : (
        <div className="empty">
          {busy ? '正在获取真实 K 线…' : '暂无 K 线数据，请重试'}
        </div>
      )}
    </div>
  );
}

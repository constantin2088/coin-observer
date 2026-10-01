'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { AgentTools } from './agent-tools';
import { CandleChart } from './candle-chart';
import { SettingsPanel } from './settings-panel';
import {
  PREFS_KEY,
  readStored,
  storeValue,
  normalizePreferences,
} from '@/lib/preferences';
import { PriceAlerts } from './price-alerts';
import {
  coinName,
  chineseAmount,
  beijingTime,
  filterAndSort,
} from '@/lib/local-market';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  money,
  percent,
  rankCoins,
  type Coin,
  type Period,
} from '@/lib/market';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
function Change({ n }: { n: number | null | undefined }) {
  return (
    <span className={n == null || n === 0 ? 'muted' : n > 0 ? 'up' : 'down'}>
      {n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`}
    </span>
  );
}
export default function Home() {
  const [sort, setSort] = useState('default');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [coins, setCoins] = useState<Coin[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [received, setReceived] = useState('');
  const [favorites, setFavorites] = useState(['bitcoin', 'ethereum', 'solana']),
    [selected, setSelected] = useState('bitcoin'),
    [view, setView] = useState('watch'),
    [period, setPeriod] = useState('7d'),
    [threshold, setThreshold] = useState(3);
  const [chartMode, setChartMode] = useState('line'),
    [rankPeriod, setRankPeriod] = useState<Period>('24h'),
    [search, setSearch] = useState('');
  const [density, setDensity] = useState('comfortable'),
    [sound, setSound] = useState(false),
    [desktop, setDesktop] = useState(false),
    [minVolume, setMinVolume] = useState(0),
    [onlyFavorites, setOnlyFavorites] = useState(false),
    [excludeStable, setExcludeStable] = useState(true),
    [ready, setReady] = useState(false),
    [now, setNow] = useState(0),
    [offline, setOffline] = useState(false),
    [cached, setCached] = useState(false),
    [firstSeen, setFirstSeen] = useState<Record<string, string>>({});
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    if (!navigator.onLine) {
      setOffline(true);
      setError('网络已断开，正在显示本机缓存。');
      return;
    }
    refreshing.current = true;
    setBusy(true);
    try {
      const r = await fetch('/api/markets', {
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as {
        coins: Coin[];
        fetchedAt: string;
        stale?: boolean;
      };
      if (
        !Array.isArray(d.coins) ||
        !d.coins.length ||
        !d.coins.every(
          (c: Coin) => typeof c.id === 'string' && typeof c.symbol === 'string',
        ) ||
        !Number.isFinite(Date.parse(d.fetchedAt))
      )
        throw new Error();
      setCoins(d.coins);
      setReceived(d.fetchedAt);
      setCached(Boolean(d.stale));
      setOffline(false);
      setError(d.stale ? '上游行情更新延迟，正在显示最近一次成功数据。' : '');
      storeValue('coin-market-cache-v2', {
        coins: d.coins,
        fetchedAt: d.fetchedAt,
      });
    } catch {
      setCached(true);
      setOffline(!navigator.onLine);
      setError('行情暂时无法更新，保留最近数据；联网后会自动重试。');
    } finally {
      refreshing.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('coin-watch') || 'null');
      if (Array.isArray(v) && v.every((x) => typeof x === 'string'))
        setFavorites(v);
    } catch {}
    const saved = readStored<{ coins: Coin[]; fetchedAt: string } | null>(
      'coin-market-cache-v2',
      null,
    );
    if (
      saved &&
      Array.isArray(saved.coins) &&
      saved.coins.every(
        (c) => typeof c.id === 'string' && typeof c.symbol === 'string',
      ) &&
      Number.isFinite(Date.parse(saved.fetchedAt))
    ) {
      setCoins(saved.coins);
      setReceived(saved.fetchedAt);
      setCached(true);
    }
    const v = normalizePreferences(readStored(PREFS_KEY, {}));
    if (v.sort) setSort(String(v.sort));
    if (v.selected) setSelected(String(v.selected));
    if (v.view) setView(String(v.view));
    if (v.period) setPeriod(String(v.period));
    if (v.chartMode) setChartMode(String(v.chartMode));
    if (v.rankPeriod) setRankPeriod(v.rankPeriod as Period);
    if (v.density) setDensity(String(v.density));
    if (typeof v.threshold === 'number') setThreshold(v.threshold);
    if (typeof v.minVolume === 'number') setMinVolume(v.minVolume);
    if (typeof v.autoRefresh === 'boolean') setAutoRefresh(v.autoRefresh);
    if (typeof v.onlyFavorites === 'boolean') setOnlyFavorites(v.onlyFavorites);
    if (typeof v.excludeStable === 'boolean') setExcludeStable(v.excludeStable);
    if (typeof v.sound === 'boolean') setSound(v.sound);
    if (typeof v.desktop === 'boolean') setDesktop(v.desktop);
    setFirstSeen(readStored('coin-mover-seen-v2', {}));
    setNow(Date.now());
    setOffline(!navigator.onLine);
    setReady(true);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (ready)
      storeValue(PREFS_KEY, {
        sort,
        selected,
        view,
        period,
        chartMode,
        rankPeriod,
        density,
        threshold,
        minVolume,
        autoRefresh,
        onlyFavorites,
        excludeStable,
        sound,
        desktop,
      });
  }, [
    ready,
    sort,
    selected,
    view,
    period,
    chartMode,
    rankPeriod,
    density,
    threshold,
    minVolume,
    autoRefresh,
    onlyFavorites,
    excludeStable,
    sound,
    desktop,
  ]);
  useEffect(() => {
    if (ready) storeValue('coin-watch', favorites);
  }, [favorites, ready]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 10000);
    const online = () => {
      setOffline(false);
      void refresh();
    };
    const disconnected = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', disconnected);
    return () => {
      clearInterval(tick);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', disconnected);
    };
  }, [refresh]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [refresh, autoRefresh]);
  function toggle(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      try {
        localStorage.setItem('coin-watch', JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const active = coins.find((c) => c.id === selected);
  const candidates =
    view === 'watch'
      ? coins.filter((c) => favorites.includes(c.id))
      : view === 'all'
        ? coins
        : rankCoins(coins, view, rankPeriod);
  const rows = filterAndSort(candidates, search, sort, rankPeriod);
  const distribution = [
    { label: '跌超 5%', color: '#14765f', test: (n: number) => n < -5 },
    {
      label: '跌 0～5%',
      color: '#46a48c',
      test: (n: number) => n < 0 && n >= -5,
    },
    { label: '持平', color: '#8799a2', test: (n: number) => n === 0 },
    {
      label: '涨 0～5%',
      color: '#ec8694',
      test: (n: number) => n > 0 && n <= 5,
    },
    { label: '涨超 5%', color: '#d84f68', test: (n: number) => n > 5 },
  ].map((bucket) => ({
    ...bucket,
    count: coins.filter((c) => {
      const n = percent(c, '24h');
      return n != null && bucket.test(n);
    }).length,
  }));
  const stableSymbols = new Set([
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
  const movers = coins
    .filter(
      (c) =>
        c.price_change_percentage_1h_in_currency != null &&
        Math.abs(c.price_change_percentage_1h_in_currency) >= threshold &&
        (c.total_volume ?? 0) >= minVolume * 1e8 &&
        (!onlyFavorites || favorites.includes(c.id)) &&
        (!excludeStable || !stableSymbols.has(c.symbol.toLowerCase())),
    )
    .sort(
      (a, b) =>
        Math.abs(b.price_change_percentage_1h_in_currency!) -
        Math.abs(a.price_change_percentage_1h_in_currency!),
    );
  const moverSignature = movers
    .map((c) => c.id)
    .sort()
    .join('|');
  useEffect(() => {
    if (!ready || !received || cached || error || offline) return;
    setFirstSeen((previous) => {
      const next: Record<string, string> = {};
      for (const id of moverSignature.split('|').filter(Boolean))
        next[id] = previous[id] || new Date().toISOString();
      storeValue('coin-mover-seen-v2', next);
      return next;
    });
  }, [moverSignature, received, ready, cached, error, offline]);
  const delayed = !!received && now - Date.parse(received) > 120000;
  const prices = active?.sparkline_in_7d?.price || [],
    chartData = (period === '24h' ? prices.slice(-24) : prices).map(
      (price, i) => ({ hour: i, price }),
    );
  const chartChange =
      chartData.length > 1
        ? chartData[chartData.length - 1].price - chartData[0].price
        : 0,
    chartColor =
      chartChange > 0 ? '#ef8596' : chartChange < 0 ? '#65caaa' : '#9bb0bc';
  const rising = coins.filter(
      (c) => (c.price_change_percentage_24h_in_currency ?? 0) > 0,
    ).length,
    falling = coins.filter(
      (c) => (c.price_change_percentage_24h_in_currency ?? 0) < 0,
    ).length;
  const selectCoin = useCallback(
    (id: string) => {
      if (!coins.some((c) => c.id === id)) return false;
      setSelected(id);
      return true;
    },
    [coins],
  );
  return (
    <main data-density={density}>
      <AgentTools selectCoin={selectCoin} />
      <header>
        <div className="brand">
          <div className="brand-icon">∿</div>
          <strong>币观</strong>
          <span className="muted">/ 行情观察</span>
        </div>
        <div className="header-right">
          <button
            className="refresh"
            aria-pressed={autoRefresh}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            {autoRefresh ? '自动刷新：开' : '自动刷新：关'}
          </button>
          <span className="status">
            {offline
              ? '离线缓存'
              : cached || delayed || error
                ? '更新延迟'
                : coins.length
                  ? '行情已连接'
                  : '正在连接行情'}
          </span>
          <button className="refresh" onClick={refresh} disabled={busy}>
            {busy ? '更新中…' : '↻ 刷新'}
          </button>
        </div>
      </header>
      <div className="heading">
        <div>
          <p className="eyebrow">行情总览 / 自选观察 / 价格提醒</p>
          <h1>市场观察台</h1>
        </div>
        <p className="muted">
          北京时间 · 美元报价 · {autoRefresh ? '每 60 秒刷新' : '手动刷新'}
          <br />
          <small>
            {received
              ? `最近获取 ${beijingTime(received)}`
              : '等待公开行情数据'}
          </small>
        </p>
      </div>
      {error && (
        <div role="alert" className="notice">
          {error}
        </div>
      )}
      <SettingsPanel
        density={density}
        setDensity={setDensity}
        sound={sound}
        setSound={setSound}
        desktop={desktop}
        setDesktop={setDesktop}
      />
      <section className="metrics">
        <div>
          <span>观察范围</span>
          <strong>
            {coins.length || '—'} <small>个币种</small>
          </strong>
          <p>按市值排名前 100</p>
        </div>
        <div>
          <span>24 小时上涨 / 下跌</span>
          <strong>
            <em className="market-rise">{coins.length ? rising : '—'}</em>
            <small> / </small>
            <em className="market-fall">{coins.length ? falling : '—'}</em>
          </strong>
          <p>范围内币种数量</p>
        </div>
        <div>
          <span>1 小时异动</span>
          <strong>
            {coins.length ? movers.length : '—'} <small>个币种</small>
          </strong>
          <p>涨跌幅绝对值 ≥ {threshold}%</p>
        </div>
      </section>
      <section className="breadth-panel" aria-label="24小时涨跌分布">
        <div>
          <h2>市场温度</h2>
          <p>前 100 币种 · 24 小时涨跌分布</p>
        </div>
        <div className="breadth-buckets">
          {distribution.map((b) => (
            <div key={b.label}>
              <strong style={{ color: b.color }}>
                {coins.length ? b.count : '—'}
              </strong>
              <span>{b.label}</span>
              <i
                style={{
                  background: b.color,
                  width: `${Math.max(3, b.count)}%`,
                }}
              />
            </div>
          ))}
        </div>
        <small>
          缺失数据 {coins.filter((c) => percent(c, '24h') == null).length} 个
        </small>
      </section>
      <div className="quick-coins" aria-label="快捷查看自选币种">
        {coins
          .filter((c) => favorites.includes(c.id))
          .slice(0, 8)
          .map((c) => (
            <button
              key={c.id}
              aria-pressed={selected === c.id}
              onClick={() => setSelected(c.id)}
            >
              <b>{coinName(c)}</b>
              <span>{c.symbol.toUpperCase()}</span>
              <Change n={percent(c, '24h')} />
            </button>
          ))}
      </div>
      <div className="workspace">
        <section className="panel chart-panel">
          <div className="section-head">
            <div>
              <p className="muted">价格走势</p>
              <h2>
                {active
                  ? `${coinName(active)} · ${active.symbol.toUpperCase()}`
                  : '选择币种查看'}
              </h2>
            </div>
            <Tabs
              value={chartMode}
              onValueChange={(v) => setChartMode(String(v))}
            >
              <TabsList aria-label="图表类型">
                <TabsTrigger value="line">综合走势</TabsTrigger>
                <TabsTrigger value="candle">K 线分析</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="price-line">
            <strong>{money(active?.current_price)}</strong>
            <span>
              <Change n={active?.price_change_percentage_24h_in_currency} />{' '}
              <small className="muted">24h</small>
            </span>
          </div>
          <p className="source-note">
            CoinGecko · 美元综合报价（看板及默认提醒）
          </p>
          <div className="coin-facts">
            <span>
              1 小时 <Change n={active && percent(active, '1h')} />
            </span>
            <span>
              7 日 <Change n={active && percent(active, '7d')} />
            </span>
            <span>
              24 小时成交额 <b>{chineseAmount(active?.total_volume)} 美元</b>
            </span>
          </div>
          {chartMode === 'candle' ? (
            <CandleChart coinId={selected} />
          ) : (
            <>
              <div className="chart-toolbar">
                <Tabs
                  value={period}
                  onValueChange={(v) => setPeriod(String(v))}
                >
                  <TabsList aria-label="走势时间范围">
                    <TabsTrigger value="24h">24 小时</TabsTrigger>
                    <TabsTrigger value="7d">7 天</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="chart">
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 12, right: 8, left: 8, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor={chartColor}
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="100%"
                            stopColor={chartColor}
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="hour"
                        tickFormatter={(i) => (i === 0 ? '起点' : `${i}h`)}
                        minTickGap={65}
                        axisLine={false}
                        tickLine={false}
                        stroke="#8b9ba9"
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        orientation="right"
                        width={85}
                        tickFormatter={(v) => money(v)}
                        axisLine={false}
                        tickLine={false}
                        stroke="#8b9ba9"
                      />
                      <Tooltip
                        formatter={(v) => [money(Number(v)), '价格']}
                        labelFormatter={(v) => `第 ${v} 小时`}
                        contentStyle={{
                          background: '#1b2d39',
                          color: '#e7f0f5',
                          border: '1px solid #456070',
                          borderRadius: 10,
                          boxShadow: '0 10px 28px rgba(0, 0, 0, 0.25)',
                        }}
                      />
                      <Area
                        dataKey="price"
                        stroke={chartColor}
                        strokeWidth={2}
                        fill="url(#area)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty">
                    {busy ? '正在获取走势图…' : '暂无可用走势数据'}
                  </div>
                )}
              </div>
              <div className="chart-note">
                <span>约每小时采样 · 曲线更新可能晚于当前价格</span>
                <span>
                  {active?.last_updated
                    ? `北京时间 ${beijingTime(active.last_updated)}`
                    : ''}
                </span>
              </div>
            </>
          )}
        </section>
        <aside className="panel movers">
          <div className="section-head">
            <h2>↗ 异动观察</h2>
            <span className="tag">1h</span>
          </div>
          <label className="threshold">
            涨跌幅绝对值 ≥{' '}
            <input
              aria-label="异动百分比阈值"
              type="number"
              min="0.1"
              max="100"
              step="0.5"
              value={threshold}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 0.1 && n <= 100) setThreshold(n);
              }}
            />{' '}
            %
          </label>
          <div className="mover-filters">
            <label>
              24 小时成交额 ≥{' '}
              <input
                aria-label="异动最低成交额（亿美元）"
                type="number"
                min="0"
                max="1000000"
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
              />{' '}
              仅看自选
            </label>
            <label>
              <input
                type="checkbox"
                checked={excludeStable}
                onChange={(e) => setExcludeStable(e.target.checked)}
              />{' '}
              排除常见稳定币
            </label>
          </div>
          <div className="mover-list">
            {movers.slice(0, 8).map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className="mover"
              >
                <span
                  className={
                    (c.price_change_percentage_1h_in_currency ?? 0) > 0
                      ? 'up'
                      : 'down'
                  }
                >
                  {(c.price_change_percentage_1h_in_currency ?? 0) > 0
                    ? '↗'
                    : '↘'}
                </span>
                <span>
                  <b>{c.symbol.toUpperCase()}</b>
                  <small>{money(c.current_price)}</small>
                  <small>
                    首次发现{' '}
                    {firstSeen[c.id] ? beijingTime(firstSeen[c.id]) : '—'}
                  </small>
                </span>
                <Change n={c.price_change_percentage_1h_in_currency} />
              </button>
            ))}
            {!movers.length && (
              <div className="empty">
                {coins.length ? '当前没有达到阈值的币种' : '等待行情连接'}
              </div>
            )}
          </div>
          <p className="muted footnote">
            观察前 100 币种，最多显示 8
            个。首次发现记录当前连续满足筛选条件的起点。
          </p>
        </aside>
      </div>
      <section className="panel table-panel">
        <div className="section-head">
          <Tabs
            value={view}
            onValueChange={(v) => {
              setView(String(v));
              setSort('default');
            }}
          >
            <TabsList variant="line" aria-label="币种列表">
              <TabsTrigger value="watch">
                我的自选 · {favorites.length}
              </TabsTrigger>
              <TabsTrigger value="all">市场前 100</TabsTrigger>
              <TabsTrigger value="gainers">涨幅榜</TabsTrigger>
              <TabsTrigger value="losers">跌幅榜</TabsTrigger>
              <TabsTrigger value="volume">成交额榜</TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="muted">点击币种查看走势 · ☆ 加入关注</span>
        </div>
        <div className="market-filters">
          <input
            type="search"
            aria-label="搜索币种名称或代码"
            placeholder="中文 / 英文 / 代码，如 比特币、BTC"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <NativeSelect
            aria-label="行情排序"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <NativeSelectOption value="default">默认排序</NativeSelectOption>
            <NativeSelectOption value="desc">涨跌幅从高到低</NativeSelectOption>
            <NativeSelectOption value="asc">涨跌幅从低到高</NativeSelectOption>
            <NativeSelectOption value="volume">
              成交额从高到低
            </NativeSelectOption>
            <NativeSelectOption value="price">价格从高到低</NativeSelectOption>
          </NativeSelect>
          {(view === 'gainers' ||
            view === 'losers' ||
            sort === 'asc' ||
            sort === 'desc') && (
            <NativeSelect
              aria-label="排行涨跌周期"
              value={rankPeriod}
              onChange={(e) => setRankPeriod(e.target.value as Period)}
            >
              <NativeSelectOption value="1h">最近 1 小时</NativeSelectOption>
              <NativeSelectOption value="24h">最近 24 小时</NativeSelectOption>
              <NativeSelectOption value="7d">最近 7 天</NativeSelectOption>
            </NativeSelect>
          )}
          <span className="muted">
            {rows.length} 个结果 ·{' '}
            {sort !== 'default'
              ? '按所选方式排序'
              : view === 'volume'
                ? '24h 成交额从高到低'
                : view === 'gainers'
                  ? '按所选周期涨幅排序'
                  : view === 'losers'
                    ? '按所选周期跌幅排序'
                    : '按市值排序'}{' '}
            · 范围：市值前 100
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>关注</TableHead>
              <TableHead>币种</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>1 小时涨跌</TableHead>
              <TableHead>24 小时涨跌</TableHead>
              <TableHead>7 日涨跌</TableHead>
              <TableHead>24 小时成交额（美元）</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow
                key={c.id}
                data-state={c.id === selected ? 'selected' : undefined}
              >
                <TableCell>
                  <button
                    className="star"
                    aria-label={`${favorites.includes(c.id) ? '取消' : '添加'}关注 ${c.name}`}
                    aria-pressed={favorites.includes(c.id)}
                    onClick={() => toggle(c.id)}
                  >
                    {favorites.includes(c.id) ? '★' : '☆'}
                  </button>
                </TableCell>
                <TableCell>
                  <button className="coin" onClick={() => setSelected(c.id)}>
                    <span className="coin-mark">
                      {c.symbol.slice(0, 1).toUpperCase()}
                    </span>
                    <b>{c.symbol.toUpperCase()}</b>
                    <span className="muted">{coinName(c)}</span>
                  </button>
                </TableCell>
                <TableCell>{money(c.current_price)}</TableCell>
                <TableCell>
                  <Change n={c.price_change_percentage_1h_in_currency} />
                </TableCell>
                <TableCell>
                  <Change n={c.price_change_percentage_24h_in_currency} />
                </TableCell>
                <TableCell>
                  <Change n={percent(c, '7d')} />
                </TableCell>
                <TableCell>{chineseAmount(c.total_volume)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && (
          <div className="empty">
            {busy
              ? '正在获取行情…'
              : search
                ? '当前列表没有匹配币种，可切换「市场前 100」并搜索中文、英文或代码。'
                : !coins.length
                  ? '行情暂不可用，请点击刷新。'
                  : view === 'watch'
                    ? '还没有可显示的关注币种。去「市场前 100」点击星标添加。'
                    : '当前周期没有符合条件的币种。'}
          </div>
        )}
      </section>
      <PriceAlerts
        coins={coins}
        active={active}
        received={received}
        fetchFailed={Boolean(error) || cached || offline || delayed}
        sound={sound}
        desktop={desktop}
      />
      <footer>
        <span>币观 · 轻量观察工具</span>
        <span>
          数据来自{' '}
          <a
            href="https://www.coingecko.com/en/api"
            target="_blank"
            rel="noreferrer"
          >
            CoinGecko
          </a>{' '}
          /{' '}
          <a
            href="https://www.okx.com/trade-spot/btc-usdt"
            target="_blank"
            rel="noreferrer"
          >
            OKX
          </a>{' '}
          · 全部行情与 K 线：红涨绿跌 · 关注列表保存在本机浏览器
        </span>
      </footer>
    </main>
  );
}

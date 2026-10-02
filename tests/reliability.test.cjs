const fs = require('node:fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict');
require.extensions['.ts'] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
const {
  normalizeCoins,
  evaluateAlerts,
  validAlert,
} = require('../lib/market.ts');
const { sharedFeed, FeedError } = require('../lib/feed.ts');
const { rsi, macd } = require('../lib/indicators.ts');
const { clearMarketCache, pruneCache } = require('../lib/cache.ts');
(async () => {
  const now = Date.now(),
    coin = {
      id: 'bitcoin',
      symbol: 'btc',
      current_price: 100,
      last_updated: new Date(now).toISOString(),
    };
  const normalized = normalizeCoins([
    null,
    { id: '../../x', symbol: 'x' },
    {
      ...coin,
      current_price: '100',
      price_change_percentage_24h_in_currency: 'bad',
      sparkline_in_7d: { price: [1, NaN] },
    },
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].current_price, null);
  assert.equal(normalized[0].price_change_percentage_24h_in_currency, null);
  assert.equal(normalized[0].sparkline_in_7d, undefined);
  const alert = {
    id: 'a',
    coinId: 'bitcoin',
    symbol: 'BTC',
    direction: 'above',
    target: 110,
    createdAt: now,
    kind: 'percent',
    basePrice: 100,
    percentTarget: 10,
  };
  assert(validAlert(alert));
  assert(!validAlert({ ...alert, basePrice: 0 }));
  assert(!validAlert({ ...alert, percentTarget: Infinity }));
  assert.equal(
    evaluateAlerts(
      [{ ...alert, paused: true }],
      [{ ...coin, current_price: 120 }],
      now,
    )[0].triggeredAt,
    undefined,
  );
  assert.equal(
    evaluateAlerts([alert], [{ ...coin, current_price: 120 }], now)[0]
      .triggeredPrice,
    120,
  );
  const bars = Array.from({ length: 35 }, (_, i) => ({
    time: now + i,
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 1,
    complete: true,
  }));
  assert.equal(rsi(bars)[14], 100);
  assert.equal(rsi(bars.map((c) => ({ ...c, close: 100 })))[14], 50);
  assert(macd(bars).dif.at(-1) > 0);
  assert(
    macd(bars.map((c) => ({ ...c, close: 100 }))).histogram.every(
      (v) => v === 0,
    ),
  );
  const originalNow = Date.now;
  let clock = now,
    calls = 0;
  Date.now = () => clock;
  try {
    const loader = async () => {
      calls++;
      return { price: 1 };
    };
    const [a, b] = await Promise.all([
      sharedFeed('test-shared', 10, loader),
      sharedFeed('test-shared', 10, loader),
    ]);
    assert.equal(calls, 1);
    assert.equal((await a.json()).price, 1);
    assert.equal((await b.json()).price, 1);
    clock += 20;
    const fail = async () => {
      calls++;
      throw new FeedError('rate_limit', 'limited');
    };
    const stale = await (await sharedFeed('test-shared', 10, fail)).json();
    assert.equal(stale.stale, true);
    assert.equal(stale.issue, 'rate_limit');
    assert.equal(stale.retryAfter, 60);
    await sharedFeed('test-shared', 10, fail);
    assert.equal(calls, 2);
    clock += 60001;
    const recovered = await (
      await sharedFeed('test-shared', 10, loader)
    ).json();
    assert.equal(recovered.stale, undefined);
    assert.equal(calls, 3);
  } finally {
    Date.now = originalNow;
  }
  global.localStorage = {
    getItem(k) {
      return this[k] ?? null;
    },
    setItem(k, v) {
      this[k] = v;
    },
    removeItem(k) {
      delete this[k];
    },
  };
  localStorage.setItem('coin-watch', '["bitcoin"]');
  localStorage.setItem('coin-price-alerts-v1', '[]');
  for (let i = 0; i < 65; i++)
    localStorage.setItem(
      'coin-candles-' + i,
      JSON.stringify({ fetchedAt: now, candles: [] }),
    );
  pruneCache();
  assert(
    Object.keys(localStorage).filter((k) => k.startsWith('coin-candles-'))
      .length <= 48,
  );
  clearMarketCache();
  assert.equal(localStorage.getItem('coin-watch'), '["bitcoin"]');
  assert.equal(localStorage.getItem('coin-price-alerts-v1'), '[]');
  console.log(
    'PASS: malformed data, percentage/paused alerts, indicators, concurrent feeds, rate-limit cooldown/recovery, cache preservation.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

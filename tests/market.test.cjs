const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = ts.transpileModule(fs.readFileSync('lib/market.ts', 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const mod = new Module('market-test', module);
mod._compile(source, 'market-test.cjs');
const {
  parseCandles,
  aggregateYearly,
  movingAverage,
  evaluateAlerts,
  rankCoins,
  validAlert,
} = mod.exports;
const candle = (t, close, volume = '500', complete = '1') => [
  String(t),
  '10',
  String(Math.max(close, 12)),
  '8',
  String(close),
  '999',
  '444',
  volume,
  complete,
];
const bars = parseCandles({
  code: '0',
  data: [candle(3000, 14, '900', '0'), candle(1000, 10), candle(2000, 12)],
});
assert.deepEqual(
  bars.map((c) => c.time),
  [1000, 2000, 3000],
);
assert.equal(bars[2].volume, 900);
assert.equal(bars[2].complete, false);
assert.deepEqual(movingAverage(bars, 2), [null, 11, 13]);
assert.deepEqual(movingAverage(bars, 7), [null, null, null]);
assert.throws(() =>
  parseCandles({ code: '0', data: [candle(1000, 9, 'NaN')] }),
);
assert.throws(() => parseCandles({ code: '0', data: [] }));
assert.throws(() => parseCandles({ code: '50011', data: [] }));
const month = (
  year,
  month,
  open,
  high,
  low,
  close,
  volume,
  complete = true,
) => ({
  time: Date.UTC(year, month, 1) - 8 * 60 * 60 * 1000,
  open,
  high,
  low,
  close,
  volume,
  complete,
});
const yearly = aggregateYearly([
  month(2024, 0, 10, 13, 9, 12, 100),
  month(2024, 1, 12, 16, 11, 15, 200),
  month(2025, 0, 15, 18, 14, 17, 300, false),
]);
assert.equal(yearly.length, 2);
assert.deepEqual(yearly[0], {
  time: month(2024, 0, 10, 13, 9, 12, 100).time,
  open: 10,
  high: 16,
  low: 9,
  close: 15,
  volume: 300,
  complete: false,
});
assert.equal(yearly[1].complete, false);
const now = Date.now(),
  coin = (id, change, volume) => ({
    id,
    name: id,
    symbol: id,
    current_price: 100,
    last_updated: new Date(now).toISOString(),
    total_volume: volume,
    price_change_percentage_1h_in_currency: change,
    price_change_percentage_24h_in_currency: change,
    price_change_percentage_7d_in_currency: change,
  });
const coins = [
  coin('a', 3, 2),
  coin('b', -5, 9),
  coin('c', null, null),
  coin('d', 6, 5),
  coin('e', -2, 3),
  coin('z', 0, 0),
];
assert.deepEqual(
  rankCoins(coins, 'gainers', '24h').map((c) => c.id),
  ['d', 'a'],
);
assert.deepEqual(
  rankCoins(coins, 'losers', '1h').map((c) => c.id),
  ['b', 'e'],
);
assert.deepEqual(
  rankCoins(coins, 'volume', '7d').map((c) => c.id),
  ['b', 'd', 'e', 'a', 'z'],
);
assert.equal(coins[0].id, 'a');
const alert = {
  id: '1',
  coinId: 'a',
  symbol: 'A',
  direction: 'above',
  target: 100,
  createdAt: now,
};
assert(validAlert(alert));
assert(!validAlert({ ...alert, target: -1 }));
assert(!validAlert({ ...alert, direction: 'buy' }));
const hit = evaluateAlerts([alert], coins, now)[0];
assert.equal(hit.triggeredPrice, 100);
assert.equal(hit.triggeredAt, now);
assert.equal(evaluateAlerts([hit], coins, now + 60000)[0], hit);
assert.equal(
  evaluateAlerts([{ ...alert, target: 101 }], coins, now)[0].triggeredAt,
  undefined,
);
assert.equal(
  evaluateAlerts([{ ...alert, direction: 'below' }], coins, now)[0].triggeredAt,
  now,
);
assert.equal(
  evaluateAlerts(
    [alert],
    [{ ...coins[0], last_updated: new Date(now - 300001).toISOString() }],
    now,
  )[0],
  alert,
);
assert.equal(
  evaluateAlerts([alert], [{ ...coins[0], last_updated: 'bad' }], now)[0],
  alert,
);
assert.equal(
  evaluateAlerts([alert], [{ ...coins[0], current_price: null }], now)[0],
  alert,
);
assert.equal(evaluateAlerts([alert], [], now)[0], alert);
assert.equal(alert.triggeredAt, undefined);
console.log(
  'PASS: candle ordering and quote volume, yearly aggregation, moving averages, malformed data, ranking and missing values, alert boundaries, stale data, one-shot behavior.',
);

const fs = require('node:fs'),
  ts = require('typescript'),
  assert = require('node:assert/strict'),
  path = require('node:path');
require.extensions['.ts'] = (mod, file) =>
  mod._compile(
    ts.transpileModule(
      fs
        .readFileSync(file, 'utf8')
        .replace(/@\/lib\/([a-z-]+)/g, (_, name) =>
          path.resolve('lib/' + name + '.ts').replaceAll('\\', '/'),
        ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    file,
  );
(async () => {
  const originalFetch = global.fetch,
    originalNow = Date.now;
  try {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return Response.json([{ id: 'bitcoin', symbol: 'btc' }]);
    };
    const markets = require('../app/api/markets/route.ts');
    const [a, b] = await Promise.all([markets.GET(), markets.GET()]);
    assert.equal(calls, 1);
    assert.equal((await a.json()).coins.length, 1);
    assert.equal((await b.json()).coins.length, 1);
    const now = originalNow();
    Date.now = () => now + 60000;
    global.fetch = async () => {
      throw new Error('offline');
    };
    const offline = await (await markets.GET()).json();
    assert.equal(offline.stale, true);
    assert.equal(offline.coins[0].id, 'bitcoin');
    const candles = require('../app/api/candles/route.ts');
    assert.equal(
      (
        await candles.GET(
          new Request('http://local/api/candles?coin=bitcoin&bar=1H&after=bad'),
        )
      ).status,
      400,
    );
    let seenUrl = '';
    global.fetch = async (url) => {
      seenUrl = url;
      return Response.json({ code: '0', data: [] });
    };
    const empty = await candles.GET(
      new Request(
        'http://local/api/candles?coin=bitcoin&bar=1H&after=1600000000000',
      ),
    );
    assert.equal(empty.status, 200);
    assert.deepEqual((await empty.json()).candles, []);
    assert(seenUrl.includes('history-candles'));
    global.fetch = async () =>
      Response.json({
        code: '0',
        data: [
          { instId: 'BTC-USDT', last: '100', ts: String(now) },
          { instId: 'ETH-USDT', last: 'NaN', ts: String(now) },
        ],
      });
    const quotes = await (
      await require('../app/api/quotes/route.ts').GET()
    ).json();
    assert.equal(quotes.coins.length, 1);
    assert.equal(quotes.coins[0].current_price, 100);
    let active = 0,
      maxActive = 0,
      moverCalls = 0;
    const moveNow = Date.now();
    global.fetch = async () => {
      moverCalls++;
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return Response.json({
        code: '0',
        data: Array.from({ length: 19 }, (_, i) => [
          String(moveNow - (18 - i) * 300000),
          '100',
          '112',
          '98',
          i === 17 ? '110' : '100',
          '1',
          '1',
          i === 17 ? '300' : '100',
          i === 18 ? '0' : '1',
        ]),
      });
    };
    const movers = await (
      await require('../app/api/movers/route.ts').GET()
    ).json();
    assert.equal(movers.coins.length, 14);
    assert.equal(moverCalls, 14);
    assert(maxActive <= 3);
    assert(Math.abs(movers.coins[0].change5m - 10) < 1e-9);
    assert.equal(movers.coins[0].ratio5m, 3);
    assert(Math.abs(movers.coins[0].ratio15m - 5 / 3) < 1e-9);
    console.log(
      'PASS: shared requests, stale market fallback, invalid history input, end-of-history handling, OKX quote validation, completed short-window candles and bounded upstream concurrency.',
    );
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

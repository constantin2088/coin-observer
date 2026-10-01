const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),path=require('node:path');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('@/lib/market',path.resolve('lib/market.ts').replaceAll('\\','/')),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
(async()=>{
  const originalFetch=global.fetch,originalNow=Date.now;
  try {
    let calls=0;global.fetch=async()=>{calls++;return Response.json([{id:'bitcoin',symbol:'btc'}]);};
    const markets=require('../app/api/markets/route.ts');
    const [a,b]=await Promise.all([markets.GET(),markets.GET()]);assert.equal(calls,1);assert.equal((await a.json()).coins.length,1);assert.equal((await b.json()).coins.length,1);
    const now=originalNow();Date.now=()=>now+60000;global.fetch=async()=>{throw new Error('offline')};
    const offline=await (await markets.GET()).json();assert.equal(offline.stale,true);assert.equal(offline.coins[0].id,'bitcoin');
    const candles=require('../app/api/candles/route.ts');
    assert.equal((await candles.GET(new Request('http://local/api/candles?coin=bitcoin&bar=1H&after=bad'))).status,400);
    let seenUrl='';global.fetch=async url=>{seenUrl=url;return Response.json({code:'0',data:[]})};
    const empty=await candles.GET(new Request('http://local/api/candles?coin=bitcoin&bar=1H&after=1600000000000'));
    assert.equal(empty.status,200);assert.deepEqual((await empty.json()).candles,[]);assert(seenUrl.includes('history-candles'));
    global.fetch=async()=>Response.json({code:'0',data:[{instId:'BTC-USDT',last:'100',ts:String(now)},{instId:'ETH-USDT',last:'NaN',ts:String(now)}]});
    const quotes=await (await require('../app/api/quotes/route.ts').GET()).json();assert.equal(quotes.coins.length,1);assert.equal(quotes.coins[0].current_price,100);
    console.log('PASS: shared requests, stale market fallback, invalid history input, end-of-history handling, OKX quote validation.');
  }finally{global.fetch=originalFetch;Date.now=originalNow;}
})().catch(error=>{console.error(error);process.exitCode=1});

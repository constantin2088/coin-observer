const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
function compile(path, dependencies = {}) {
  const mod = new Module(path, module);
  mod.require = name => dependencies[name] || require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, path);
  return mod.exports;
}
const market = compile('lib/market.ts');
const {filterAndSort, chineseAmount, beijingTime} = compile('lib/local-market.ts', {'./market':market});
const coins = [
 {id:'bitcoin',name:'Bitcoin',symbol:'btc',current_price:100,total_volume:10000,price_change_percentage_24h_in_currency:2},
 {id:'ethereum',name:'Ethereum',symbol:'eth',current_price:20,total_volume:20000,price_change_percentage_24h_in_currency:-3},
 {id:'missing',name:'Missing',symbol:'x',current_price:null,total_volume:null,price_change_percentage_24h_in_currency:null},
];
assert.equal(filterAndSort(coins,'比特币','default','24h')[0].id,'bitcoin');
assert.equal(filterAndSort(coins,' ETH ','default','24h')[0].id,'ethereum');
assert.deepEqual(filterAndSort(coins,'','asc','24h').map(c=>c.id),['ethereum','bitcoin','missing']);
assert.deepEqual(filterAndSort(coins,'','volume','24h').map(c=>c.id),['ethereum','bitcoin','missing']);
assert.equal(coins[0].id,'bitcoin');
assert.equal(chineseAmount(123456789),'1.23亿');
assert.equal(chineseAmount(1000000000000),'1万亿');
assert.equal(chineseAmount(null),'—');
assert.match(beijingTime('2026-09-18T16:00:00Z'),/2026\/9\/19.*00:00:00/);
console.log('PASS: Chinese search, sorting, missing values, amount units and Beijing timezone');

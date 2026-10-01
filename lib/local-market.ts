import { type Coin, percent, type Period } from './market';

const names: Record<string, string> = {
  bitcoin: '比特币', ethereum: '以太坊', ripple: '瑞波币', dogecoin: '狗狗币',
  solana: '索拉纳', cardano: '艾达币', polkadot: '波卡', litecoin: '莱特币',
  'bitcoin-cash': '比特币现金', chainlink: '预言机', 'avalanche-2': '雪崩',
  'shiba-inu': '柴犬币', binancecoin: '币安币', tron: '波场', tether: '泰达币',
};
export const coinName = (coin: Coin) => names[coin.id] || coin.name;
export const beijingTime = (value: string | number) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
export function chineseAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  const unit = Math.abs(value) >= 1e12 ? 1e12 : Math.abs(value) >= 1e8 ? 1e8 : Math.abs(value) >= 1e4 ? 1e4 : 1;
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value / unit)}${unit === 1e12 ? '万亿' : unit === 1e8 ? '亿' : unit === 1e4 ? '万' : ''}`;
}
export function filterAndSort(coins: Coin[], search: string, sort: string, period: Period) {
  const query = search.trim().toLowerCase();
  const rows = coins.filter(c => `${coinName(c)} ${c.name} ${c.symbol}`.toLowerCase().includes(query));
  if (sort === 'default') return rows;
  return rows.sort((a, b) => {
    const av = sort === 'volume' ? a.total_volume : sort === 'price' ? a.current_price : percent(a, period);
    const bv = sort === 'volume' ? b.total_volume : sort === 'price' ? b.current_price : percent(b, period);
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    return sort === 'asc' ? av - bv : bv - av;
  });
}

import { normalizeCoins } from '@/lib/market';
import { sharedFeed, upstream } from '@/lib/feed';
export async function GET() {
  return sharedFeed('markets', 55000, async () => ({
    coins: normalizeCoins(
      await upstream(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=1h,24h,7d',
      ),
    ),
    fetchedAt: new Date().toISOString(),
    source: 'CoinGecko',
  }));
}

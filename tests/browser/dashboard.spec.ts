import { test, expect } from '@playwright/test';
const now = Date.now();
const coins = [
  ['bitcoin', 'btc', 'Bitcoin'],
  ['ethereum', 'eth', 'Ethereum'],
  ['solana', 'sol', 'Solana'],
].map(([id, symbol, name], i) => ({
  id,
  symbol,
  name,
  current_price: 100 + i,
  total_volume: 2e9,
  last_updated: new Date(now).toISOString(),
  price_change_percentage_1h_in_currency: i ? -4 : 4,
  price_change_percentage_24h_in_currency: i ? -2 : 2,
  price_change_percentage_7d_in_currency: 3,
  sparkline_in_7d: {
    price: Array.from({ length: 168 }, (_, j) => 98 + j / 84),
  },
}));
const candles = Array.from({ length: 120 }, (_, i) => ({
  time: now - (120 - i) * 3600000,
  open: 100 + i / 10,
  high: 103 + i / 10,
  low: 98 + i / 10,
  close: 101 + i / 10,
  volume: 1000 + i * 20,
  complete: i < 119,
}));
test.beforeEach(async ({ page }) => {
  await page.route('**/api/markets', (r) =>
    r.fulfill({
      json: {
        coins: coins.map((c) => ({
          ...c,
          last_updated: new Date().toISOString(),
        })),
        fetchedAt: new Date().toISOString(),
      },
    }),
  );
  await page.route('**/api/quotes', (r) =>
    r.fulfill({
      json: {
        coins: coins.map((c) => ({ ...c, current_price: 90 })),
        fetchedAt: new Date().toISOString(),
      },
    }),
  );
  await page.route('**/api/candles?**', (r) => {
    const u = new URL(r.request().url());
    return r.fulfill({
      json: {
        pair:
          u.searchParams.get('coin') === 'ethereum' ? 'ETH-USDT' : 'BTC-USDT',
        bar: u.searchParams.get('bar'),
        candles,
        fetchedAt: now,
      },
    });
  });
  await page.route('**/api/movers', (r) =>
    r.fulfill({
      json: {
        coins: coins.map((c) => ({
          id: c.id,
          symbol: c.symbol,
          price: 100,
          change5m: 4,
          change15m: -5,
          ratio5m: 2.5,
          ratio15m: 3,
          last_updated: new Date(now).toISOString(),
        })),
        fetchedAt: new Date().toISOString(),
        missing: 0,
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByText('行情已连接', { exact: true })).toBeVisible();
});
test('chart controls, hover crosshair, indicators and precision', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'K 线分析', exact: true }).click();
  const svg = page.locator('svg.candle-svg');
  await expect(svg).toBeVisible();
  await page.getByLabel('副图指标').selectOption('macd');
  await expect(
    page.getByRole('img', { name: 'MACD 12 26 9 指标' }),
  ).toBeVisible();
  await page.getByLabel('副图指标').selectOption('rsi');
  await expect(
    page.getByRole('img', { name: 'RSI 14 相对强弱指标' }),
  ).toBeVisible();
  await page.getByLabel('快速均线周期').fill('10');
  await page.getByLabel('收盘价显示精度').selectOption('auto');
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox();
  await svg.hover({ position: { x: box!.width * 0.5, y: box!.height * 0.3 } });
  await expect(svg.locator('line[stroke-dasharray="4 5"]')).toHaveCount(2);
  await expect(page.locator('.candle-readout')).toContainText('收盘价');
  await page
    .locator('.chart-panel')
    .screenshot({ path: 'test-results/v1.1.0-chart.png' });
  await page.getByRole('button', { name: '回到最新', exact: true }).click();
  await page.getByRole('tab', { name: '周线', exact: true }).click();
  await expect(svg).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('快速均线周期')).toHaveValue('10');
  await expect(page.getByLabel('收盘价显示精度')).toHaveValue('auto');
});
test('price alert edit, pause, percentage, persistence and re-enable', async ({
  page,
}) => {
  await page.getByLabel('提醒目标数值').fill('120');
  await page.getByRole('button', { name: '添加提醒', exact: true }).click();
  let item = page.locator('.alert-item').first();
  await expect(item).toContainText('正在监测');
  await item.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('提醒目标数值').fill('130');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(item).toContainText('130');
  await item.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(item).toContainText('已暂停');
  await item.getByRole('button', { name: '继续监测', exact: true }).click();
  await expect(item).toContainText('正在监测');
  await page.getByLabel('提醒类型').selectOption('percent');
  await page.getByLabel('提醒目标数值').fill('10');
  await page.getByRole('button', { name: '添加提醒', exact: true }).click();
  await expect(page.locator('.alert-item')).toHaveCount(2);
  await expect(page.locator('.alert-item').last()).toContainText('+10%');
  await page.reload();
  await expect(page.locator('.alert-item')).toHaveCount(2);
  await page.getByLabel('提醒类型').selectOption('price');
  await page.getByLabel('提醒目标数值').fill('90');
  await page.getByRole('button', { name: '添加提醒', exact: true }).click();
  item = page.locator('.alert-item').last();
  await expect(item).toContainText('已触发');
  await expect(
    item.getByRole('button', { name: '重新启用', exact: true }),
  ).toBeVisible();
  await item.getByRole('button', { name: '重新启用', exact: true }).click();
  await expect(item).toContainText('已触发');
});
test('short movers, backup and cache preservation', async ({ page }) => {
  await page.getByRole('button', { name: '5 分钟', exact: true }).click();
  await expect(page.locator('.mover-list')).toContainText('+4.00%');
  await page.getByText('筛选条件', { exact: true }).click();
  await page.getByLabel('短时放量门槛').selectOption('3');
  await expect(page.locator('.mover-list')).toContainText('当前没有达到条件');
  await page.getByLabel('短时放量门槛').selectOption('2');
  await expect(page.locator('.mover-list')).toContainText('+4.00%');
  await page.getByText('看板设置与备份', { exact: false }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  const download = await downloadPromise;
  const file = await download.path();
  await page.locator('input[type=file]').setInputFiles(file!);
  await expect(page.getByLabel('短时放量门槛')).toHaveValue('2');
  await page.getByText('看板设置与备份', { exact: false }).click();
  await page.getByRole('button', { name: '清理行情缓存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '我的自选 · 3' })).toBeVisible();
});
test('responsive dark layout remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await expect(page.getByRole('heading', { name: '市场观察台' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.workspace')).toBeVisible();
  await page.screenshot({
    path: 'test-results/v1.1.0-dashboard.png',
    fullPage: true,
  });
});

test('offline data cannot trigger and quote sources remain separate', async ({
  page,
}) => {
  await page.getByLabel('提醒报价来源').selectOption('okx');
  await page.getByLabel('提醒类型').selectOption('percent');
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Boolean(localStorage.getItem('coin-feed-cache-/api/quotes')),
      ),
    )
    .toBeTruthy();
  await page.getByLabel('提醒目标数值').fill('10');
  await page.getByRole('button', { name: '添加提醒', exact: true }).click();
  await expect(page.locator('.alert-item').first()).toContainText('基准 $90');
  await expect(page.locator('.alert-item').first()).toContainText('正在监测');
  await page.context().setOffline(true);
  await page.getByLabel('提醒报价来源').selectOption('coingecko');
  await page.getByLabel('提醒类型').selectOption('price');
  await page.getByLabel('提醒目标数值').fill('90');
  await page.getByRole('button', { name: '添加提醒', exact: true }).click();
  await expect(page.locator('.alert-item').last()).toContainText('数据延迟');
  await expect(page.locator('.alert-item').last()).not.toContainText('已触发');
  await page.context().setOffline(false);
  await expect(page.locator('.alert-item').last()).toContainText('已触发');
});
test('corrupt local cache recovers and two tabs preserve reminder state', async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'coin-market-cache-v2',
      JSON.stringify({
        coins: [null, { id: 'bitcoin', symbol: 'btc', current_price: 'bad' }],
        fetchedAt: new Date().toISOString(),
      }),
    );
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await expect(page.getByText('行情已连接', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  const second = await page.context().newPage();
  await second.goto('/');
  await expect(second.getByText('行情已连接', { exact: true })).toBeVisible();
  await page.getByLabel('提醒目标数值').fill('90');
  await page.getByRole('button', { name: '添加提醒', exact: true }).click();
  await expect(page.locator('.alert-item').first()).toContainText('已触发');
  await expect(second.locator('.alert-item').first()).toContainText('已触发');
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('coin-alert-history-v2') || '[]')
            .length,
      ),
    )
    .toBe(1);
  await second.close();
});

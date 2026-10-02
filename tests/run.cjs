const { spawnSync } = require('node:child_process');
for (const file of [
  'market.test.cjs',
  'local-market.test.cjs',
  'upgrade.test.cjs',
  'api.test.cjs',
  'reliability.test.cjs',
]) {
  const r = spawnSync(process.execPath, ['tests/' + file], {
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

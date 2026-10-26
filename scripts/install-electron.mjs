import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD === '1') process.exit(0);
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('electron/install.js')], {
  stdio: 'inherit',
  env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

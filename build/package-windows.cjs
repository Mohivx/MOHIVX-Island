// Nsis7z bundled with electron-builder 26.15.3 cannot decode ARM64 PE filters.
// Our otherwise x64 payload includes the original ARM64 VB-CABLE driver too;
// omitting that vendor file makes bundle verification fail on a clean install.
// Use a supported filter for every executable without altering vendor bytes.
// Upstream fix: https://github.com/electron-userland/electron-builder/pull/9989
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const result = spawnSync(process.execPath, [
  require.resolve('electron-builder/cli.js'),
  ...process.argv.slice(2),
], {
  cwd: path.resolve(__dirname, '..'),
  windowsHide: true,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_BUILDER_7Z_FILTER: 'BCJ' },
});

if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;

const path = require('node:path');

function getStartupConfig({ packaged, executable, portableExecutable, enabled }) {
  if (!packaged) return null;
  const target = portableExecutable || executable;
  if (!path.win32.isAbsolute(target || '') || !/\.exe$/i.test(target)) throw new Error('Startup needs the full application path.');
  return { name: 'MOHIVX Island', path: target, args: ['--startup'], openAtLogin: Boolean(enabled) };
}
module.exports = { getStartupConfig };

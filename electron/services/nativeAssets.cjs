const fs = require('node:fs');
const path = require('node:path');

const nativeAssets = [
  'get_context.ps1', 'fullscreen_watch.ps1', 'set_wallpaper.ps1', 'audio_controller.ps1', 'get_telemetry.ps1',
  'get_media.ps1', 'paste_dictation.ps1', 'companion_shortcuts.ps1',
  'reveal.html', 'ghost_cursor.html', 'get_clipboard_history.ps1',
  'mohivx-hook.exe','mohivx-audio-meter.exe','mohivx-wallpaper.exe',
  'mohivx-phone.exe','MohivxCamera64.dll',
  'ask-island.cjs','island-mcp.cjs',
];
const optionalNativeAssets = ['mohivx-window-style.exe'];

function stageNativeAssets(sourceDir, destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const name of nativeAssets) {
    const source = [path.join(sourceDir, name), path.join(sourceDir, '..', 'bin', name),path.join(sourceDir,'..','scripts',name)]
      .find(candidate => fs.existsSync(candidate));
    if (!source) throw new Error(`Missing bundled Windows helper: ${name}`);
    fs.copyFileSync(source, path.join(destinationDir, name));
  }
  for (const name of optionalNativeAssets) {
    const source = [path.join(sourceDir, name), path.join(sourceDir, '..', 'bin', name), path.join(sourceDir, '..', 'scripts', name)]
      .find(candidate => fs.existsSync(candidate));
    if (source) fs.copyFileSync(source, path.join(destinationDir, name));
  }
  return Object.fromEntries([...nativeAssets, ...optionalNativeAssets].filter(name => fs.existsSync(path.join(destinationDir, name))).map(name => [name, path.join(destinationDir, name)]));
}

module.exports = { stageNativeAssets };

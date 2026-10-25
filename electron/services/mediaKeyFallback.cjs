const MEDIA_VIRTUAL_KEYS = Object.freeze({
  'play-pause': 0xB3,
  next: 0xB0,
  prev: 0xB1,
});

function mediaKeyFallbackCommand(action) {
  const key = MEDIA_VIRTUAL_KEYS[action];
  if (!key) throw new TypeError('Unsupported media action');
  return [
    "$source = 'using System; using System.Runtime.InteropServices; public static class MohivxMediaKey { [DllImport(\"user32.dll\")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra); }'",
    'Add-Type -TypeDefinition $source',
    '[MohivxMediaKey]::keybd_event(' + key + ', 0, 0, [UIntPtr]::Zero)',
    '[MohivxMediaKey]::keybd_event(' + key + ', 0, 2, [UIntPtr]::Zero)',
  ].join('; ');
}

module.exports = { MEDIA_VIRTUAL_KEYS, mediaKeyFallbackCommand };

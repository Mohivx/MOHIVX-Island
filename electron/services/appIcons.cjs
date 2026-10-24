const path = require('node:path');

function createAppIconResolver({ app, shell, nativeImage, exists, timeoutMs = 4000 }) {
  async function fromFile(file) {
    if (!file || !exists(file)) return null;
    if (/\.ico$/i.test(file)) {
      const image = nativeImage.createFromPath(file);
      if (!image.isEmpty()) return image.toDataURL();
    }
    let timer;
    try {
      const icon = await Promise.race([
        app.getFileIcon(file, { size: 'large' }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Icon timeout')), timeoutMs); }),
      ]);
      return icon && !icon.isEmpty() ? icon.toDataURL() : null;
    } catch { return null; }
    finally { clearTimeout(timer); }
  }
  return async function getApplicationIcon(file) {
    if (typeof file !== 'string' || !file.trim()) return null;
    const candidates = [];
    if (/\.lnk$/i.test(file)) {
      try {
        const link = shell.readShortcutLink(file);
        // A shortcut can have a generic shell icon even when its executable has a real one.
        if (link.icon && /\.(ico|exe)$/i.test(link.icon)) candidates.push(link.icon);
        if (link.target) candidates.push(link.target);
      } catch {}
    }
    candidates.push(file);
    const seen = new Set();
    for (const candidate of candidates) {
      const key = path.normalize(candidate).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const image = await fromFile(candidate);
      if (image) return image;
    }
    return null;
  };
}
module.exports = { createAppIconResolver };

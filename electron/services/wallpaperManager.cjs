'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const WallpaperCatalog = require('./wallpaperCatalog.cjs');

const IMAGE = /\.(png|jpe?g|webp|bmp)$/i;
const ALIAS = /^wp\d+\./i;
const MAX_BYTES = 30 * 1024 * 1024;
// Old bundled wallpaper bytes (SHA-256) and the bundled filename that replaces them.
const DEFAULT_LEGACY_HASHES = Object.freeze({
  de862f9e1e42a61754b10fa1b44b446170ebaafa58c0774adbce5230fe5ba3ee: 'cosmic_nebula.jpg',
  a5e616f9532ee8aa7dee9d325f7bcc52ded480ca69c73f8d42df0a0cdafe3e3e: 'gothic_castle.jpg'
});

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const contentId = (hash) => 'wp-' + hash.slice(0, 24);
const realpath = (p) => (fs.realpathSync.native || fs.realpathSync)(p);
const samePath = (a, b) => {
  a = path.resolve(a); b = path.resolve(b);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
};
const validName = (n) => typeof n === 'string' && n.length <= 255 && !/[\\/]/.test(n) && IMAGE.test(n);
const bundleName = (n) => validName(n) && !ALIAS.test(n);

/** Accepts 'wp-'+24hex, 24hex or a full 64hex SHA-256; returns 'wp-'+24hex or null. */
function normalizeWallpaperId(value) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const m = /^wp-([0-9a-f]{24})$/.exec(s) || /^([0-9a-f]{24})(?:[0-9a-f]{40})?$/.exec(s);
  return m ? 'wp-' + m[1] : null;
}
function requireId(value) {
  const id = normalizeWallpaperId(value);
  if (!id) throw new TypeError('Invalid wallpaper id');
  return id;
}
function lstat(p) {
  try { return fs.lstatSync(p); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), '.' + path.basename(file) + '.' + crypto.randomBytes(6).toString('hex') + '.tmp');
  try {
    fs.writeFileSync(temporary, data, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
}

class WallpaperCatalogManager extends WallpaperCatalog {
  constructor(nativeImage, { preparedDir, manifestPath, ownedDir, legacyHashes = DEFAULT_LEGACY_HASHES } = {}) {
    super(nativeImage, { preparedDir });
    for (const [key, value] of Object.entries({ manifestPath, ownedDir })) {
      if (typeof value !== 'string' || !path.isAbsolute(value)) throw new TypeError(key + ' must be an absolute path');
    }
    this.manifestPath = path.resolve(manifestPath);
    this.ownedDir = path.resolve(ownedDir);
    this.legacyHashes = new Map();
    for (const [hash, name] of Object.entries(legacyHashes || {})) {
      if (/^[0-9a-f]{64}$/i.test(hash) && bundleName(name)) this.legacyHashes.set(hash.toLowerCase(), name);
    }
    this.loadManifest();
  }

  get hiddenCount() { return this.hidden.size; }
  isHidden(value) { const id = normalizeWallpaperId(value); return !!id && this.hidden.has(id); }

  loadManifest() {
    this.hidden = new Set();
    this.seeded = {};
    this.manifestError = null;
    let raw;
    try { raw = fs.readFileSync(this.manifestPath, 'utf8'); } catch (error) {
      if (error.code !== 'ENOENT') this.manifestError = error;
      return;
    }
    try {
      const data = JSON.parse(raw);
      const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
      if (!isObject(data) || (data.version !== undefined && data.version !== 1) ||
        (data.hidden !== undefined && !Array.isArray(data.hidden)) ||
        (data.seeded !== undefined && !isObject(data.seeded))) throw new Error('Unsupported wallpaper manifest format');
      for (const entry of data.hidden || []) { const id = normalizeWallpaperId(entry); if (id) this.hidden.add(id); }
      for (const [name, hash] of Object.entries(data.seeded || {})) {
        if (bundleName(name) && typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)) this.seeded[name] = hash;
      }
    } catch (error) {
      this.hidden = new Set();
      this.seeded = {};
      this.manifestError = error;
    }
  }

  assertWritable() {
    if (this.manifestError) throw new Error('Refusing to overwrite unreadable wallpaper manifest: ' + this.manifestError.message);
  }

  saveManifest() {
    this.assertWritable();
    const seeded = {};
    for (const name of Object.keys(this.seeded).sort()) seeded[name] = this.seeded[name];
    writeAtomic(this.manifestPath, JSON.stringify({ version: 1, hidden: [...this.hidden].sort(), seeded }, null, 2));
  }

  /** Applies an in-memory change and persists it; restores the previous state if persisting fails. */
  commit(mutate) {
    this.assertWritable();
    const hidden = new Set(this.hidden), seeded = { ...this.seeded };
    try { const result = mutate(); this.saveManifest(); return result; } catch (error) {
      this.hidden = hidden;
      this.seeded = seeded;
      throw error;
    }
  }

  hide(value) { const id = requireId(value); this.commit(() => this.hidden.add(id)); return id; }
  unhide(value) { const id = requireId(value); this.commit(() => this.hidden.delete(id)); return id; }

  /** Real path of ownedDir, or null when missing, not a directory, or itself a symlink/junction. */
  ownedRoot() {
    try {
      const stat = fs.lstatSync(this.ownedDir);
      return stat.isDirectory() && !stat.isSymbolicLink() ? realpath(this.ownedDir) : null;
    } catch { return null; }
  }

  /** True only for a regular (non-symlink) file physically located directly inside the real ownedDir. */
  isOwnedFile(file, root = this.ownedRoot()) {
    if (!root || typeof file !== 'string') return false;
    try {
      if (!fs.lstatSync(file).isFile()) return false;
      return samePath(path.dirname(realpath(file)), root);
    } catch { return false; }
  }

  forget(name, root) {
    for (const dir of [root, this.ownedDir]) if (dir) this.cache.delete(path.resolve(dir, name));
  }

  async list(directories, { includeHidden = false } = {}) {
    const items = await super.list(Array.isArray(directories) ? directories : []);
    const root = this.ownedRoot(), result = [];
    for (const item of items) {
      const hidden = this.hidden.has(item.id);
      if (hidden && !includeHidden) continue;
      const entry = { ...item, owned: this.isOwnedFile(item.sourcePath, root) };
      if (includeHidden) entry.hidden = hidden;
      result.push(entry);
    }
    return result;
  }

  readBundle(sourceDirectories, root) {
    for (const dir of Array.isArray(sourceDirectories) ? sourceDirectories : []) {
      if (typeof dir !== 'string' || !dir) continue;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); if (samePath(realpath(dir), root)) continue; } catch { continue; }
      const files = new Map();
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isFile() || !bundleName(entry.name)) continue;
        try {
          const file = path.join(dir, entry.name), stat = fs.statSync(file);
          if (!stat.size || stat.size > MAX_BYTES) continue;
          const bytes = fs.readFileSync(file);
          files.set(entry.name, { bytes, hash: sha256(bytes) });
        } catch {}
      }
      if (files.size) return { dir, files };
    }
    return { dir: null, files: new Map() };
  }

  syncBundled(sourceDirectories, { force = false } = {}) {
    return this.sync(sourceDirectories, { force: !!force, clearHidden: false });
  }

  restoreDefaults(sourceDirectories) {
    return this.sync(sourceDirectories, { force: true, clearHidden: true });
  }

  sync(sourceDirectories, { force, clearHidden }) {
    this.assertWritable();
    fs.mkdirSync(this.ownedDir, { recursive: true });
    const root = this.ownedRoot();
    if (!root) throw new Error('Owned wallpaper directory must be a real directory');
    const bundle = this.readBundle(sourceDirectories, root);
    const result = { source: bundle.dir, copied: 0, updated: 0, migrated: 0, preserved: 0 };
    const hidden = clearHidden ? new Set() : new Set(this.hidden), seeded = { ...this.seeded };
    const replace = (name, entry, fromHash) => {
      writeAtomic(path.join(root, name), entry.bytes);
      if (fromHash && hidden.has(contentId(fromHash))) hidden.add(contentId(entry.hash));
      this.forget(name, root);
    };

    if (bundle.files.size) {
      // Existing owned copies: migrate known legacy bytes and untouched previous seeds; keep everything else.
      for (const name of fs.readdirSync(root).filter((n) => IMAGE.test(n)).sort()) {
        const file = path.join(root, name), stat = lstat(file);
        if (!stat || !stat.isFile() || stat.size > MAX_BYTES) continue;
        const current = sha256(fs.readFileSync(file));
        const legacy = bundle.files.get(this.legacyHashes.get(current)), own = bundle.files.get(name);
        if (legacy && legacy.hash !== current) { replace(name, legacy, current); result.migrated++; }
        else if (own && own.hash !== current && seeded[name] === current) { replace(name, own, current); result.updated++; }
        else if (own && own.hash !== current) result.preserved++;
      }
      // Bundled names: record present ones, copy names never seeded (or all missing ones when forced).
      for (const [name, entry] of bundle.files) {
        const stat = lstat(path.join(root, name));
        if (stat) { if (stat.isFile()) seeded[name] = entry.hash; continue; }
        if (seeded[name] !== undefined && !force) continue;
        replace(name, entry, null);
        seeded[name] = entry.hash;
        result.copied++;
      }
    }

    this.commit(() => { this.hidden = hidden; this.seeded = seeded; });
    return result;
  }

  /** Re-checks location and content immediately before recycling. Returns the path or null. */
  verifiedCopy(file, id) {
    if (!this.isOwnedFile(file)) return null;
    try {
      if (fs.statSync(file).size > MAX_BYTES) return null;
      return contentId(sha256(fs.readFileSync(file))) === id ? file : null;
    } catch { return null; }
  }

  async remove(id, { directories, trashOwned = false, trashItem } = {}) {
    const key = requireId(id);
    if (trashOwned && typeof trashItem !== 'function') throw new TypeError('trashItem callback is required');
    const lookup = Array.isArray(directories) && directories.length ? directories : [this.ownedDir];
    const items = await this.list(lookup, { includeHidden: true });
    if (!items.some((item) => item.id === key)) throw new Error('Unknown wallpaper id');
    this.hide(key);
    let trashed = 0, warnings = 0;
    if (trashOwned) {
      const root = this.ownedRoot();
      let names = [];
      if (root) {
        try { names = fs.readdirSync(root).filter((n) => IMAGE.test(n)).sort(); } catch { warnings++; }
      } else if (lstat(this.ownedDir)) warnings++;
      for (const name of names) {
        const file = this.verifiedCopy(path.join(root, name), key);
        if (!file) continue;
        try { await trashItem(file); trashed++; } catch { warnings++; }
        this.forget(name, root);
      }
    }
    return { success: true, trashed, warnings };
  }
}

WallpaperCatalogManager.normalizeWallpaperId = normalizeWallpaperId;
WallpaperCatalogManager.DEFAULT_LEGACY_HASHES = DEFAULT_LEGACY_HASHES;
module.exports = WallpaperCatalogManager;
module.exports.WallpaperCatalogManager = WallpaperCatalogManager;

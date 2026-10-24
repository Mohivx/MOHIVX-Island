// Pure navigation helpers for the island (tab order, section cycling, app selection).

/**
 * Preserve saved valid unique IDs in their saved order, then append any
 * default IDs that are missing. Unknown and non-string entries are dropped.
 * @param {unknown} order
 * @param {readonly string[]} defaults
 * @returns {string[]}
 */
export function normalizeTabOrder(order, defaults) {
  const known = Array.isArray(defaults) ? defaults.filter((id) => typeof id === 'string') : [];
  const knownSet = new Set(known);
  const result = [];
  const seen = new Set();
  if (Array.isArray(order)) {
    for (const id of order) {
      if (typeof id !== 'string' || !knownSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of known) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Next visible tab for a physical ArrowLeft/ArrowRight press. In RTL layouts
 * ArrowRight moves to the previous logical ID. Wraps around.
 * @param {readonly string[]} ids
 * @param {string | null | undefined} active
 * @param {string} key
 * @param {boolean} [rtl]
 * @returns {string | null}
 */
export function nextVisibleTab(ids, active, key, rtl = false) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  if (ids.length === 1) return ids[0];
  const index = typeof active === 'string' ? ids.indexOf(active) : -1;
  if (index < 0) return ids[0];
  const forward = key === 'ArrowRight' ? !rtl : rtl;
  const step = forward ? 1 : -1;
  return ids[(index + step + ids.length) % ids.length];
}

/**
 * Swap `id` one step earlier (delta -1) or later (delta +1).
 * Out-of-bounds moves and unknown IDs return an unchanged copy.
 * @param {readonly string[]} order
 * @param {string} id
 * @param {number} delta
 * @returns {string[]}
 */
export function moveTab(order, id, delta) {
  const next = Array.isArray(order) ? order.slice() : [];
  const index = next.indexOf(id);
  const step = Math.sign(Number(delta) || 0);
  if (index < 0 || step === 0) return next;
  const target = index + step;
  if (target < 0 || target >= next.length) return next;
  const tmp = next[target];
  next[target] = next[index];
  next[index] = tmp;
  return next;
}

/**
 * Next selected app index for ArrowDown/ArrowUp with wrapping.
 * current -1 means nothing selected: Down selects 0, Up selects the last.
 * count 0 returns -1. Invalid current values are clamped.
 * @param {number} count
 * @param {number} current
 * @param {string} key
 * @returns {number}
 */
export function nextAppSelection(count, current, key) {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (total === 0) return -1;
  let index = Number.isFinite(current) ? Math.trunc(current) : -1;
  if (index < -1) index = -1;
  if (index >= total) index = total - 1;
  if (key === 'ArrowDown') return index < 0 ? 0 : (index + 1) % total;
  if (key === 'ArrowUp') return index < 0 ? total - 1 : (index - 1 + total) % total;
  return index;
}

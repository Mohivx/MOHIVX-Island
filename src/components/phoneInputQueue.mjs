const CODE_SHORTCUTS = {
  KeyA: 'selectAll',
  KeyC: 'copy',
  KeyX: 'cut',
  KeyV: 'paste',
};

const KEY_SHORTCUTS = {
  a: 'selectAll',
  c: 'copy',
  x: 'cut',
  v: 'paste',
  'ش': 'selectAll',
  'ؤ': 'copy',
  'ء': 'cut',
  'ر': 'paste',
};

const SPECIAL_KEYS = {
  Enter: 'enter',
  Backspace: 'backspace',
  Delete: 'delete',
};

export function isComposingKeyEvent(event, composingRef = false) {
  if (!event) return false;
  const native = event.nativeEvent || event;
  return Boolean(
    composingRef ||
    event.isComposing ||
    native.isComposing ||
    event.key === 'Process' ||
    event.keyCode === 229 ||
    native.keyCode === 229
  );
}

export function resolvePhoneKeyShortcut(event, composingRef = false) {
  if (!event || isComposingKeyEvent(event, composingRef)) return null;
  if (event.key === 'Escape') return { type: 'escape' };

  const hasCmdOrCtrl = Boolean(event.ctrlKey || event.metaKey);
  if (hasCmdOrCtrl && !event.altKey) {
    const byCode = event.code && CODE_SHORTCUTS[event.code];
    const rawKey = typeof event.key === 'string' ? event.key : '';
    const byKey = KEY_SHORTCUTS[rawKey] || KEY_SHORTCUTS[rawKey.toLowerCase()];
    const shortcut = byCode || byKey;
    if (shortcut) return { type: 'key', key: shortcut };
    return null;
  }

  if (!hasCmdOrCtrl && !event.altKey) {
    const mapped = SPECIAL_KEYS[event.key];
    if (mapped) return { type: 'key', key: mapped };
  }

  return null;
}

export function extractDirectPrintableKey(event, composingRef = false) {
  if (!event || isComposingKeyEvent(event, composingRef)) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const rawKey = typeof event.key === 'string' ? event.key : '';
  if (!rawKey || SPECIAL_KEYS[rawKey] || rawKey === 'Escape' || rawKey === 'Tab') return null;
  if (Array.from(rawKey).length === 1 && rawKey >= ' ') return rawKey;
  return null;
}

export function createPhoneInputQueue(sendFn, options = {}) {
  const maxSize = Number.isInteger(options.maxSize) && options.maxSize > 0 ? options.maxSize : 32;
  const canAccept = typeof options.canAccept === 'function' ? options.canAccept : () => true;
  const onError = typeof options.onError === 'function' ? options.onError : null;
  const onClear = typeof options.onClear === 'function' ? options.onClear : null;

  const queue = [];
  let epoch = 0;
  let activeItem = null;
  let draining = false;

  function settlePendingAsFalse() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item && !item.settled) {
        item.settled = true;
        item.resolve(false);
      }
    }
  }

  function clear(reason = 'cleared') {
    epoch += 1;
    draining = false;
    if (activeItem && !activeItem.settled) {
      activeItem.settled = true;
      activeItem.resolve(false);
      activeItem = null;
    }
    settlePendingAsFalse();
    if (onClear) onClear(reason);
  }

  async function drain() {
    if (draining) return;
    draining = true;
    const runEpoch = epoch;
    try {
      while (queue.length > 0 && runEpoch === epoch) {
        if (!canAccept()) {
          clear('unavailable');
          return;
        }
        const item = queue.shift();
        if (!item || item.settled) continue;
        if (item.epoch !== epoch) {
          item.settled = true;
          item.resolve(false);
          continue;
        }
        activeItem = item;
        const itemEpoch = item.epoch;
        try {
          const result = await sendFn(item.action);
          if (itemEpoch !== epoch || item.settled) {
            if (!item.settled) {
              item.settled = true;
              item.resolve(false);
            }
            return;
          }
          if (!result || result.success === false) {
            throw new Error(result?.error || 'Phone input unavailable');
          }
          item.settled = true;
          activeItem = null;
          item.resolve(true);
        } catch (err) {
          const wasCurrentEpoch = itemEpoch === epoch && !item.settled;
          if (!item.settled) {
            item.settled = true;
            item.resolve(false);
          }
          if (activeItem === item) activeItem = null;
          if (wasCurrentEpoch) {
            epoch += 1;
            draining = false;
            settlePendingAsFalse();
            if (onError) onError(err, item.action);
          }
          return;
        }
      }
    } finally {
      if (runEpoch === epoch) {
        draining = false;
      }
    }
  }

  function enqueue(action) {
    if (!action || typeof action !== 'object' || !canAccept()) {
      return Promise.resolve(false);
    }
    const pendingCount = queue.length + (activeItem ? 1 : 0);
    if (pendingCount >= maxSize) {
      if (onError) onError(new Error('Phone input queue is full'), action);
      return Promise.resolve(false);
    }
    const itemEpoch = epoch;
    return new Promise((resolve) => {
      queue.push({ action, resolve, epoch: itemEpoch, settled: false });
      void drain();
    });
  }

  return {
    enqueue,
    clear,
    size: () => queue.length + (activeItem ? 1 : 0),
    pending: () => queue.length,
    isBusy: () => Boolean(activeItem || draining),
  };
}

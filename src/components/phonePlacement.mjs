const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rectsOverlap(a, b, gap = 8) {
  return (
    a.left < b.left + b.width + gap &&
    a.left + a.width + gap > b.left &&
    a.top < b.top + b.height + gap &&
    a.top + a.height + gap > b.top
  );
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > 1;
}

export function isSharedMonitorBoundary(targetDisplay, edge, displays = [], tolerancePx = 24) {
  if (!targetDisplay?.bounds || !Array.isArray(displays) || displays.length < 2) return false;
  const b = targetDisplay.bounds;
  for (const other of displays) {
    if (!other?.bounds || String(other.id) === String(targetDisplay.id)) continue;
    const ob = other.bounds;
    if (edge === 'left') {
      if (Math.abs(b.x - (ob.x + ob.width)) <= tolerancePx && rangesOverlap(b.y, b.y + b.height, ob.y, ob.y + ob.height)) {
        return true;
      }
    } else if (edge === 'right') {
      if (Math.abs(b.x + b.width - ob.x) <= tolerancePx && rangesOverlap(b.y, b.y + b.height, ob.y, ob.y + ob.height)) {
        return true;
      }
    } else if (edge === 'top') {
      if (Math.abs(b.y - (ob.y + ob.height)) <= tolerancePx && rangesOverlap(b.x, b.x + b.width, ob.x, ob.x + ob.width)) {
        return true;
      }
    } else if (edge === 'bottom') {
      if (Math.abs(b.y + b.height - ob.y) <= tolerancePx && rangesOverlap(b.x, b.x + b.width, ob.x, ob.x + ob.width)) {
        return true;
      }
    }
  }
  return false;
}

export function computeDisplayBoard(displays = [], rawBoardWidth = 640) {
  const width = Math.max(320, Number(rawBoardWidth) || 640);
  const screenList = Array.isArray(displays)
    ? displays.filter((d) => d?.bounds?.width > 0 && d?.bounds?.height > 0)
    : [];
  const hasScreens = screenList.length > 0;
  const minX = hasScreens ? Math.min(...screenList.map((d) => d.bounds.x)) : 0;
  const minY = hasScreens ? Math.min(...screenList.map((d) => d.bounds.y)) : 0;
  const maxX = hasScreens ? Math.max(...screenList.map((d) => d.bounds.x + d.bounds.width)) : 1920;
  const maxY = hasScreens ? Math.max(...screenList.map((d) => d.bounds.y + d.bounds.height)) : 1080;
  const worldWidth = Math.max(1, maxX - minX);
  const worldHeight = Math.max(1, maxY - minY);
  const screenScale = hasScreens
    ? Math.max(0.035, Math.min(0.24, (width - 260) / worldWidth, 190 / worldHeight))
    : 0;
  const displayWidth = worldWidth * screenScale;
  const displayHeight = worldHeight * screenScale;
  const displayLeft = Math.max(8, width - displayWidth - 12);
  const displayTop = 48;
  const cardWidth = 140;
  const cardHeight = 208;
  const height = Math.max(300, Math.ceil(displayTop + displayHeight + (hasScreens ? cardHeight + 24 : 30)));

  const monitorRects = screenList.map((display) => ({
    display: { ...display, id: String(display.id), primary: Boolean(display.primary) },
    left: displayLeft + (display.bounds.x - minX) * screenScale,
    top: displayTop + (display.bounds.y - minY) * screenScale,
    width: Math.max(48, display.bounds.width * screenScale),
    height: Math.max(38, display.bounds.height * screenScale),
  }));
  const primaryRect = monitorRects.find((r) => r.display.primary) || monitorRects[0] || null;

  return {
    width,
    height,
    cardWidth,
    cardHeight,
    monitorRects,
    primaryRect,
    primaryDisplayId: primaryRect?.display?.id || null,
  };
}

export function classifyNearestMonitorEdge(cardRect, monitorRects = [], displays = []) {
  if (!monitorRects.length) {
    return { monitorId: null, edge: 'left', distance: 0, sharedBoundary: false, startRatio: 0, endRatio: 1 };
  }
  const allDisplays = displays.length ? displays : monitorRects.map((m) => m.display);
  const cx = cardRect.left + cardRect.width / 2;
  const cy = cardRect.top + cardRect.height / 2;
  const candidates = [];

  for (const m of monitorRects) {
    const mx = m.left + m.width / 2;
    const my = m.top + m.height / 2;
    const dx = cx - mx;
    const dy = cy - my;
    const clampedX = clamp(cx, m.left, m.left + m.width);
    const clampedY = clamp(cy, m.top, m.top + m.height);
    const strictlyLeft = cardRect.left + cardRect.width <= m.left + 12;
    const strictlyRight = cardRect.left >= m.left + m.width - 12;
    const strictlyTop = cardRect.top + cardRect.height <= m.top + 12;
    const strictlyBottom = cardRect.top >= m.top + m.height - 12;
    const edgeDistances = [
      { edge: 'left', dist: Math.hypot(cardRect.left + cardRect.width - m.left, cy - clampedY), bias: strictlyLeft ? -60 : dx < 0 ? 0 : 160 },
      { edge: 'right', dist: Math.hypot(cardRect.left - (m.left + m.width), cy - clampedY), bias: strictlyRight ? -60 : dx > 0 ? 0 : 160 },
      { edge: 'top', dist: Math.hypot(cx - clampedX, cardRect.top + cardRect.height - m.top), bias: strictlyTop ? -60 : dy < 0 ? 0 : 160 },
      { edge: 'bottom', dist: Math.hypot(cx - clampedX, cardRect.top - (m.top + m.height)), bias: strictlyBottom ? -60 : dy > 0 ? 0 : 160 },
    ];
    for (const item of edgeDistances) {
      const shared = isSharedMonitorBoundary(m.display, item.edge, allDisplays);
      const centerRatio =
        item.edge === 'left' || item.edge === 'right'
          ? clamp((cy - m.top) / Math.max(1, m.height), 0.2, 0.8)
          : clamp((cx - m.left) / Math.max(1, m.width), 0.2, 0.8);
      const halfSpan = 0.45;
      candidates.push({
        monitorId: String(m.display.id),
        edge: item.edge,
        distance: item.dist + item.bias + (shared ? 10000 : 0),
        rawDistance: item.dist,
        sharedBoundary: shared,
        startRatio: clamp(centerRatio - halfSpan, 0, 1),
        endRatio: clamp(centerRatio + halfSpan, 0, 1),
      });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0];
}

export function resolvePhonePlacement(desired, board, occupiedRects = [], index = 0, displays = []) {
  const { width, height, cardWidth, cardHeight, monitorRects = [], primaryRect } = board;
  const spanX = Math.max(1, width - cardWidth);
  const spanY = Math.max(1, height - cardHeight);

  const defaultCandidate = () => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const baseLeft = primaryRect
      ? primaryRect.left - (col + 1) * (cardWidth + 12)
      : 8 + col * (cardWidth + 12);
    const centerY = primaryRect ? primaryRect.top + primaryRect.height / 2 : height / 2;
    const baseTop = clamp(
      centerY - cardHeight / 2 + row * (cardHeight + 12) - (index > 1 ? 40 : 0),
      8,
      Math.max(8, height - cardHeight - 8)
    );
    return {
      left: clamp(baseLeft, 4, spanX),
      top: clamp(baseTop, 4, spanY),
    };
  };

  const target =
    desired && Number.isFinite(desired.x) && Number.isFinite(desired.y)
      ? {
          left: clamp(desired.x, 0, 1) * spanX,
          top: clamp(desired.y, 0, 1) * spanY,
        }
      : defaultCandidate();

  const isFree = (left, top, monitorGap = 6, cardGap = 8) => {
    const rect = { left, top, width: cardWidth, height: cardHeight };
    for (const m of monitorRects) {
      if (rectsOverlap(rect, m, monitorGap)) return false;
    }
    for (const occ of occupiedRects) {
      if (rectsOverlap(rect, occ, cardGap)) return false;
    }
    return true;
  };

  let chosen = null;
  if (isFree(target.left, target.top)) {
    chosen = target;
  } else {
    const candidates = [];
    for (let y = 4; y <= spanY; y += 16) {
      for (let x = 4; x <= spanX; x += 16) {
        candidates.push({ left: x, top: y, dist: Math.hypot(x - target.left, y - target.top) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const c of candidates) {
      if (isFree(c.left, c.top)) {
        chosen = { left: c.left, top: c.top };
        break;
      }
    }
    if (!chosen) {
      for (const c of candidates) {
        if (isFree(c.left, c.top, 0, 2)) {
          chosen = { left: c.left, top: c.top };
          break;
        }
      }
    }
    if (!chosen) chosen = target;
  }

  const x = clamp(chosen.left / spanX, 0, 1);
  const y = clamp(chosen.top / spanY, 0, 1);
  const finalRect = { left: x * spanX, top: y * spanY, width: cardWidth, height: cardHeight };
  const docking = classifyNearestMonitorEdge(finalRect, monitorRects, displays);
  return {
    x,
    y,
    left: finalRect.left,
    top: finalRect.top,
    width: cardWidth,
    height: cardHeight,
    edge: docking.edge,
    monitorId: docking.monitorId,
    sharedBoundary: docking.sharedBoundary,
    startRatio: docking.startRatio,
    endRatio: docking.endRatio,
  };
}

export function resolveAllPhonePlacements(devices = [], savedPositions = {}, board, displays = []) {
  const occupied = [];
  const placements = {};
  devices.forEach((device, index) => {
    if (!device?.id) return;
    const desired = savedPositions?.[device.id] || null;
    const resolved = resolvePhonePlacement(desired, board, occupied, index, displays);
    occupied.push({
      id: device.id,
      left: resolved.left,
      top: resolved.top,
      width: resolved.width,
      height: resolved.height,
    });
    placements[device.id] = resolved;
  });
  return placements;
}

export function computeViewerDockBounds(workArea, edge = 'left', entryRatio = 0.5, windowSize = { width: 460, height: 820 }) {
  const area = workArea || { x: 0, y: 0, width: 1920, height: 1080 };
  const width = Math.min(Math.max(320, Number(windowSize?.width) || 460), Math.max(320, area.width - 24));
  const height = Math.min(Math.max(300, Number(windowSize?.height) || 820), Math.max(300, area.height - 24));
  const ratio = clamp(Number.isFinite(entryRatio) ? entryRatio : 0.5, 0, 1);
  const margin = 8;

  let x = area.x + Math.round((area.width - width) / 2);
  let y = area.y + Math.round((area.height - height) / 2);

  if (edge === 'left') {
    x = area.x + margin;
    y = clamp(
      Math.round(area.y + area.height * ratio - height / 2),
      area.y + margin,
      area.y + Math.max(margin, area.height - height - margin)
    );
  } else if (edge === 'right') {
    x = area.x + Math.max(margin, area.width - width - margin);
    y = clamp(
      Math.round(area.y + area.height * ratio - height / 2),
      area.y + margin,
      area.y + Math.max(margin, area.height - height - margin)
    );
  } else if (edge === 'top') {
    x = clamp(
      Math.round(area.x + area.width * ratio - width / 2),
      area.x + margin,
      area.x + Math.max(margin, area.width - width - margin)
    );
    y = area.y + margin;
  } else if (edge === 'bottom') {
    x = clamp(
      Math.round(area.x + area.width * ratio - width / 2),
      area.x + margin,
      area.x + Math.max(margin, area.width - width - margin)
    );
    y = area.y + Math.max(margin, area.height - height - margin);
  }

  return { x, y, width, height };
}

export function createEdgeHandoffController(options = {}) {
  const dwellMs = Number.isFinite(options.dwellMs) && options.dwellMs >= 0 ? options.dwellMs : 220;
  const edgeThresholdPx = Number.isFinite(options.edgeThresholdPx) && options.edgeThresholdPx > 0 ? options.edgeThresholdPx : 6;
  const hysteresisPx =
    Number.isFinite(options.hysteresisPx) && options.hysteresisPx > edgeThresholdPx ? options.hysteresisPx : 32;
  const maxSpeedPxPerMs =
    Number.isFinite(options.maxSpeedPxPerMs) && options.maxSpeedPxPerMs > 0 ? options.maxSpeedPxPerMs : 1.6;
  const cooldownMs = Number.isFinite(options.cooldownMs) && options.cooldownMs >= 0 ? options.cooldownMs : 600;

  let activeDeviceId = null;
  let candidateDeviceId = null;
  let dwellStartedAt = null;
  let lastPoint = null;
  let rearmRequired = false;
  let cooldownUntil = 0;

  function resetCandidate() {
    candidateDeviceId = null;
    dwellStartedAt = null;
  }

  function release(reason = 'escape', at = Date.now()) {
    const previous = activeDeviceId || candidateDeviceId;
    activeDeviceId = null;
    resetCandidate();
    rearmRequired = true;
    cooldownUntil = Number(at) + cooldownMs;
    return { released: Boolean(previous), deviceId: previous, reason };
  }

  function evaluatePointAgainstPlacement(point, display, placement, displays) {
    if (!point || !display?.bounds || !placement) return null;
    if (placement.sharedBoundary || isSharedMonitorBoundary(display, placement.edge, displays)) {
      return null;
    }
    const b = display.bounds;
    const pad = edgeThresholdPx + 2;
    if (point.x < b.x - pad || point.x > b.x + b.width + pad || point.y < b.y - pad || point.y > b.y + b.height + pad) {
      return null;
    }

    let edgeDistance = Infinity;
    let entryRatio = 0.5;
    if (placement.edge === 'left') {
      edgeDistance = Math.abs(point.x - b.x);
      entryRatio = clamp((point.y - b.y) / Math.max(1, b.height), 0, 1);
    } else if (placement.edge === 'right') {
      edgeDistance = Math.abs(b.x + b.width - point.x);
      entryRatio = clamp((point.y - b.y) / Math.max(1, b.height), 0, 1);
    } else if (placement.edge === 'top') {
      edgeDistance = Math.abs(point.y - b.y);
      entryRatio = clamp((point.x - b.x) / Math.max(1, b.width), 0, 1);
    } else if (placement.edge === 'bottom') {
      edgeDistance = Math.abs(b.y + b.height - point.y);
      entryRatio = clamp((point.x - b.x) / Math.max(1, b.width), 0, 1);
    }

    const startRatio = Number.isFinite(placement.startRatio) ? placement.startRatio : 0;
    const endRatio = Number.isFinite(placement.endRatio) ? placement.endRatio : 1;
    const inSpan = entryRatio >= startRatio && entryRatio <= endRatio;
    return {
      edgeDistance,
      entryRatio,
      inSpan,
      edge: placement.edge,
      monitorId: String(display.id),
      display,
    };
  }

  function sample({
    point,
    at = Date.now(),
    enabled = true,
    displays = [],
    devices = [],
    layout = {},
    boardWidth = 640,
    isEligible = () => true,
  } = {}) {
    const board = computeDisplayBoard(displays, boardWidth);
    const primaryDisplayId = board.primaryDisplayId;

    if (!enabled) {
      if (activeDeviceId) {
        const prev = activeDeviceId;
        release('disabled', at);
        return { action: 'release', deviceId: prev, reason: 'disabled', activeDeviceId: null, primaryDisplayId };
      }
      resetCandidate();
      rearmRequired = false;
      return { action: 'none', activeDeviceId: null, primaryDisplayId };
    }

    if (activeDeviceId && !isEligible(activeDeviceId)) {
      const prev = activeDeviceId;
      release('ineligible', at);
      return { action: 'release', deviceId: prev, reason: 'ineligible', activeDeviceId: null, primaryDisplayId };
    }

    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !displays.length || !devices.length) {
      resetCandidate();
      return { action: 'none', activeDeviceId, primaryDisplayId };
    }

    let speed = 0;
    if (lastPoint && at > lastPoint.at) {
      speed = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) / (at - lastPoint.at);
    }
    lastPoint = { x: point.x, y: point.y, at };

    const placements = resolveAllPhonePlacements(devices, layout, board, displays);
    const displayMap = new Map(displays.map((d) => [String(d.id), d]));
    const primaryDisplay = displays.find((d) => d.primary) || displays[0];

    let nearestAnyEdgeDistance = Infinity;
    let bestMatch = null;

    for (const device of devices) {
      if (!device?.id || !isEligible(device.id)) continue;
      const placement = placements[device.id];
      if (!placement) continue;
      const display = displayMap.get(String(placement.monitorId)) || primaryDisplay;
      const evaluated = evaluatePointAgainstPlacement(point, display, placement, displays);
      if (!evaluated) continue;
      if (evaluated.edgeDistance < nearestAnyEdgeDistance) {
        nearestAnyEdgeDistance = evaluated.edgeDistance;
      }
      if (evaluated.inSpan && (!bestMatch || evaluated.edgeDistance < bestMatch.edgeDistance)) {
        bestMatch = { deviceId: device.id, ...evaluated };
      }
    }

    if (rearmRequired) {
      if (nearestAnyEdgeDistance >= hysteresisPx && at >= cooldownUntil) {
        rearmRequired = false;
      } else {
        resetCandidate();
        return {
          action: 'none',
          reason: nearestAnyEdgeDistance < hysteresisPx ? 'hysteresis' : 'cooldown',
          activeDeviceId,
          primaryDisplayId,
        };
      }
    }

    if (at < cooldownUntil) {
      resetCandidate();
      return { action: 'none', reason: 'cooldown', activeDeviceId, primaryDisplayId };
    }

    if (!bestMatch || bestMatch.edgeDistance > edgeThresholdPx) {
      resetCandidate();
      return { action: 'none', activeDeviceId, primaryDisplayId };
    }

    if (bestMatch.deviceId === activeDeviceId) {
      resetCandidate();
      return { action: 'none', activeDeviceId, primaryDisplayId };
    }

    if (speed > maxSpeedPxPerMs) {
      candidateDeviceId = bestMatch.deviceId;
      dwellStartedAt = at;
      return {
        action: 'none',
        reason: 'fast-cursor',
        pendingDeviceId: candidateDeviceId,
        activeDeviceId,
        primaryDisplayId,
      };
    }

    if (candidateDeviceId !== bestMatch.deviceId || dwellStartedAt === null) {
      candidateDeviceId = bestMatch.deviceId;
      dwellStartedAt = at;
      if (dwellMs > 0) {
        return {
          action: 'dwell',
          pendingDeviceId: candidateDeviceId,
          activeDeviceId,
          edge: bestMatch.edge,
          monitorId: bestMatch.monitorId,
          primaryDisplayId,
        };
      }
    }

    if (at - dwellStartedAt >= dwellMs) {
      activeDeviceId = bestMatch.deviceId;
      resetCandidate();
      rearmRequired = true;
      const workArea = bestMatch.display.workArea || bestMatch.display.bounds;
      const dockBounds = computeViewerDockBounds(workArea, bestMatch.edge, bestMatch.entryRatio);
      return {
        action: 'enter',
        deviceId: activeDeviceId,
        activeDeviceId,
        edge: bestMatch.edge,
        monitorId: bestMatch.monitorId,
        entryRatio: bestMatch.entryRatio,
        workArea,
        dockBounds,
        primaryDisplayId,
      };
    }

    return {
      action: 'dwell',
      pendingDeviceId: candidateDeviceId,
      activeDeviceId,
      edge: bestMatch.edge,
      monitorId: bestMatch.monitorId,
      primaryDisplayId,
    };
  }

  return {
    sample,
    release,
    getActiveDevice: () => activeDeviceId,
    isRearmRequired: () => rearmRequired,
  };
}

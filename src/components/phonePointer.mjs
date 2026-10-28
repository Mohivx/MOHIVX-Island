const roundCoord = n => Math.round(n * 1e6) / 1e6;

export function rotatePoint(p, rotation = 0) {
  if (!p) return null;
  const rot = Number(rotation) || 0;
  const normalizedRot = rot === 1 ? 90 : rot === 2 ? 180 : rot === 3 ? 270 : ((rot % 360) + 360) % 360;
  const { x, y } = p;
  if (normalizedRot === 90) {
    return { x: roundCoord(y), y: roundCoord(1 - x) };
  }
  if (normalizedRot === 180) {
    return { x: roundCoord(1 - x), y: roundCoord(1 - y) };
  }
  if (normalizedRot === 270) {
    return { x: roundCoord(1 - y), y: roundCoord(x) };
  }
  return { x: roundCoord(x), y: roundCoord(y) };
}

export function phonePoint(clientX, clientY, rect, width, height, options = false) {
  if (!rect || rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) return null;
  const fill = typeof options === 'boolean' ? options : Boolean(options?.fill);
  const rotation = typeof options === 'object' && options !== null ? options.rotation : 0;
  const scale = (fill ? Math.max : Math.min)(rect.width / width, rect.height / height);
  const x = (clientX - rect.left - (rect.width - width * scale) / 2) / (width * scale);
  const y = (clientY - rect.top - (rect.height - height * scale) / 2) / (height * scale);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  const point = { x: roundCoord(x), y: roundCoord(y) };
  if (rotation) {
    return rotatePoint(point, rotation);
  }
  return point;
}

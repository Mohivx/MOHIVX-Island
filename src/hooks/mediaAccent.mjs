function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function accentFromPixels(pixels, width = 1, height = 1) {
  if (!pixels || pixels.length < 4 || width < 1 || height < 1) return '';
  const step = Math.max(4, Math.floor(Math.max(width, height) / 24) * 4);
  let red = 0, green = 0, blue = 0, weight = 0;
  for (let index = 0; index + 3 < pixels.length; index += step) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.35) continue;
    const r = pixels[index] / 255, g = pixels[index + 1] / 255, b = pixels[index + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const saturation = max ? (max - min) / max : 0;
    const brightness = (max + min) / 2;
    // Very dark and nearly grey album art produces muddy accents; let the
    // saved character/theme colour remain visible in those cases.
    if (brightness < 0.12 || saturation < 0.12) continue;
    const pixelWeight = alpha * (0.35 + saturation) * (0.45 + brightness);
    red += r * pixelWeight; green += g * pixelWeight; blue += b * pixelWeight; weight += pixelWeight;
  }
  if (!weight) return '';
  const toHex = value => Math.round(clamp(value / weight, 0, 1) * 255).toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

export function extractMediaAccent(source, { ImageCtor = globalThis.Image, documentRef = globalThis.document } = {}) {
  if (typeof source !== 'string' || !source.startsWith('data:image/') || typeof ImageCtor !== 'function' || !documentRef?.createElement) return Promise.resolve('');
  return new Promise(resolve => {
    const image = new ImageCtor();
    image.onload = () => {
      try {
        const size = 24, canvas = documentRef.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return resolve('');
        context.drawImage(image, 0, 0, size, size);
        resolve(accentFromPixels(context.getImageData(0, 0, size, size).data, size, size));
      } catch { resolve(''); }
    };
    image.onerror = () => resolve('');
    image.src = source;
  });
}

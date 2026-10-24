async function measureConnection(fetcher = fetch, now = () => performance.now()) {
  const get = async bytes => {
    const start = now(); const response = await fetcher(`https://speed.cloudflare.com/__down?bytes=${bytes}&r=${Date.now()}`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Speed test failed: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer(); return { bytes: buffer.byteLength, ms: Math.max(1, now() - start) };
  };
  try {
    const latency = await get(100); const down = await get(5 * 1024 * 1024);
    const body = Buffer.alloc(1024 * 1024); const start = now();
    const response = await fetcher('https://speed.cloudflare.com/__up', { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Upload test failed: HTTP ${response.status}`);
    await response.arrayBuffer(); const elapsed = Math.max(1, now() - start);
    return { success: true, ping: Math.round(latency.ms), down: Number((down.bytes * 8 / down.ms / 1000).toFixed(1)), up: Number((body.length * 8 / elapsed / 1000).toFixed(1)), provider: 'Cloudflare', measuredAt: Date.now() };
  } catch (error) { return { success: false, error: error.message }; }
}

async function getWeather(city, fetcher = fetch) {
  if (!String(city || '').trim()) return { success: false, error: 'Choose a weather city in Settings.' };
  try {
    const geo = await fetcher(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=en&format=json`, { signal: AbortSignal.timeout(10000) });
    if (!geo.ok) throw new Error('Could not find this city.');
    const match = (await geo.json()).results?.[0]; if (!match) throw new Error('City not found.');
    const response = await fetcher(`https://api.open-meteo.com/v1/forecast?latitude=${match.latitude}&longitude=${match.longitude}&current=temperature_2m,weather_code&timezone=auto`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Weather service unavailable.');
    const value = await response.json();
    return { success: true, city: match.name, temperature: value.current.temperature_2m, code: value.current.weather_code, provider: 'Open-Meteo' };
  } catch (error) { return { success: false, error: error.message }; }
}
module.exports = { measureConnection, getWeather };

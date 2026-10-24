export function notificationPreferences(value = {}) {
  const seconds = value?.notificationDurationSeconds;
  const width = value?.notificationWidth;
  return {
    notificationStyle: value?.notificationStyle === 'compact' ? 'compact' : 'detailed',
    notificationMotion: ['smooth', 'fade', 'instant'].includes(value?.notificationMotion) ? value.notificationMotion : 'smooth',
    notificationDurationSeconds: typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(3, Math.min(30, Math.round(seconds))) : 8,
    notificationWidth: typeof width === 'number' && Number.isFinite(width) ? Math.max(320, Math.min(720, Math.round(width))) : 420,
  };
}

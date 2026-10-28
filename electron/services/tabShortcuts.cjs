const TAB_SHORTCUTS = Object.freeze({
  'open-apps': ['apps'],
  'open-clipboard': ['clipboard'],
  'ask-clipboard': ['clipboard'],
  'open-today': ['today'],
  'trigger-scheduled': ['today'],
  'open-controls': ['controls'],
  'open-wallpaper': ['wallpaper'],
  'open-power': ['power'],
});

function isTabShortcutEnabled(action, visibleTabs = {}) {
  const tabs = TAB_SHORTCUTS[action];
  if (!tabs) return true;
  return tabs.every(tab => visibleTabs[tab] !== false);
}

module.exports = { TAB_SHORTCUTS, isTabShortcutEnabled };

// Deterministic touch-gamepad mapping. Coordinates are normalized to the live
// phone frame so the layout works across portrait and landscape devices.
export const DEFAULT_GAMEPAD_LAYOUT = Object.freeze({
  up: { x: 0.18, y: 0.72 }, down: { x: 0.18, y: 0.90 },
  left: { x: 0.09, y: 0.81 }, right: { x: 0.27, y: 0.81 },
  a: { x: 0.82, y: 0.81 }, b: { x: 0.91, y: 0.72 },
  x: { x: 0.73, y: 0.72 }, y: { x: 0.82, y: 0.63 },
});
export const GAMEPAD_KEYS = Object.freeze({ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',z:'a',x:'b',a:'x',s:'y'});
export function gamepadPoint(layout,action){const point=layout?.[action]||DEFAULT_GAMEPAD_LAYOUT[action];if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error('Unknown gamepad action.');return{x:Math.max(0,Math.min(1,point.x)),y:Math.max(0,Math.min(1,point.y))};}
export function gamepadInput(layout,action){return{type:'tap',...gamepadPoint(layout,action)};}
export function gamepadActionForKey(event){if(!event||event.altKey||event.ctrlKey||event.metaKey)return'';return GAMEPAD_KEYS[event.key]||GAMEPAD_KEYS[String(event.key||'').toLowerCase()]||'';}

export const COLLAPSED_SHAPES = {
  classic: { width: 140, height: 14, inset: 0 },
  'dynamic-island': { width: 88, height: 26, inset: 6 },
  'orb-circle': { width: 28, height: 28, inset: 8 },
  'liquid-glass': { width: 140, height: 14, inset: 4 },
  'mohivx-modern': { width: 140, height: 14, inset: 4 },
};

export function animationDuration(speed, reduced = false) {
  return reduced || speed === 'instant' ? 0 : speed === 'fast' ? 160 : speed === 'cinematic' ? 450 : 300;
}

export function islandEdge(position) {
  return ['left','right','bottom'].includes(position) ? position : 'top';
}

export function collapsedSize(shape, position = 'top', playing = false, presentation = 'compact') {
  const base = COLLAPSED_SHAPES[shape] || COLLAPSED_SHAPES.classic;
  const musicSize=presentation==='disc'?{width:66,height:30}:presentation==='waveform'?{width:112,height:28}:shape==='dynamic-island'?{width:104,height:30}:{width:180,height:32};
  const size = !playing || ['off','fixed','satellite'].includes(presentation) || shape==='orb-circle'&&presentation!=='expanded' ? base : {...base,...(presentation==='expanded'&&shape==='orb-circle'?{width:180,height:36}:musicSize)};
  return ['left','right'].includes(islandEdge(position)) ? {...size,width:size.height,height:size.width} : size;
}

export function surfaceViewport(width, height, shape, scale = 1, position = 'top', audio = false, scaleY = scale) {
  const inset = COLLAPSED_SHAPES[shape]?.inset || 0;
  const side = ['left','right'].includes(islandEdge(position));
  const bars=audio===true||audio?.bars, satellite=audio?.satellite;
  const earGutter = shape==='classic'&&!side ? Math.max(12,Math.ceil(12*scale)) : 12;
  return {width:Math.ceil((satellite&&side?Math.max(width,28):width)*scale+(side?inset+(bars?24:6):satellite?Math.max(88,earGutter*2):bars?Math.max(60,earGutter*2):earGutter*2)),height:Math.ceil((satellite&&!side?Math.max(height,28):height)*scaleY+(side?satellite?88:bars?60:24:inset+(bars?24:6)))};
}

export function musicLayout(settings) {
  const theme=settings.musicTheme||({off:'off',disc:'split',waveform:'edge-bars'}[settings.musicPresentation]||'player');
  const fixed=settings.musicSizing==='fixed';
  return {theme,enabled:theme!=='off',fixed,presentation:fixed?'fixed':'expanded',bars:theme==='edge-bars'||theme==='classic',satellite:theme==='split'};
}

// Audible output can exist without a Windows media session (for example a
// browser tab). It must not borrow a paused player's stale title or cover.
export function musicActivity(media, audible, enabled = true) {
  const hasSession=Boolean(typeof media?.title==='string'&&media.title.trim()&&media.isPlaying===true);
  return {visible:Boolean(enabled&&(hasSession||audible)),hasSession,outputOnly:Boolean(audible&&!hasSession)};
}

export function fitSurfaceHeight(preferred, shape, scale = 1, availableHeight = 1080, position = 'top') {
  const gutter = ['left','right'].includes(islandEdge(position)) ? 24 : (COLLAPSED_SHAPES[shape]?.inset || 0)+6;
  return Math.max(1, Math.min(preferred, Math.floor((availableHeight - gutter) / scale)));
}

// Long launchers and conversations scroll inside a compact drawer. Reserve
// space below the island even on small displays and at the largest UI scale.
export function sectionHeightLimit(tab, shape, scale = 1, availableHeight = 1080, position = 'top') {
  const preferred = tab === 'apps' ? 560 : tab === 'ai' ? 620 : tab === 'phone' || tab === 'agents' ? 580 : availableHeight;
  const workArea = tab === 'apps' || tab === 'ai' ? Math.floor(availableHeight * .78) : availableHeight;
  return fitSurfaceHeight(preferred, shape, scale, workArea, position);
}

export function containsSurfacePoint(rect, x, y, radius = 0) {
  if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
  const radii = typeof radius === 'number' ? [radius, radius, radius, radius] : [radius.topLeft, radius.topRight, radius.bottomRight, radius.bottomLeft];
  const [tl,tr,br,bl] = radii.map(r => Math.max(0, Number(r) || 0));
  // CSS scales overlapping corner radii together, including asymmetric notches.
  const factor = Math.min(1, rect.width/(tl+tr||1), rect.width/(bl+br||1), rect.height/(tl+bl||1), rect.height/(tr+br||1));
  for (let i=0; i<4; i++) {
    const r = [tl,tr,br,bl][i] * factor, left = i===0 || i===3, top = i<2;
    const cx = left ? rect.left+r : rect.right-r, cy = top ? rect.top+r : rect.bottom-r;
    if (r && (left ? x<cx : x>cx) && (top ? y<cy : y>cy) && (x-cx)**2+(y-cy)**2>r*r) return false;
  }
  return true;
}

export class AutoCollapse {
  constructor(collapse, { delay = 400, schedule = (fn, ms) => setTimeout(fn, ms), cancel = timer => clearTimeout(timer) } = {}) {
    this.collapse = collapse; this.delay = delay; this.schedule = schedule; this.clear = cancel;
    this.stage = 'collapsed'; this.blocked = false; this.inside = false; this.timer = null;
  }
  cancel() { if (this.timer !== null) this.clear(this.timer); this.timer = null; }
  update(stage, blocked) {
    const resumed = this.blocked && !blocked;
    this.stage = stage; this.blocked = blocked;
    if (blocked || stage === 'collapsed') this.cancel();
    else if (resumed && !this.inside) this.leave();
  }
  enter() { this.inside = true; this.cancel(); }
  leave() {
    this.inside = false; this.cancel();
    if (this.blocked || this.stage === 'collapsed') return;
    this.timer = this.schedule(() => {
      this.timer = null;
      if (!this.inside && !this.blocked && this.stage !== 'collapsed') this.collapse();
    }, this.delay);
  }
  dispose() { this.cancel(); }
}

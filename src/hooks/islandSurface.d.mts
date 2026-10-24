export const COLLAPSED_SHAPES: Record<string, { width: number; height: number; inset: number }>;
export function animationDuration(speed: string, reduced?: boolean): number;
export function islandEdge(position?: string): 'top'|'left'|'right'|'bottom';
export function collapsedSize(shape: string, position?: string, playing?: boolean, presentation?: string): { width: number; height: number; inset: number };
export function surfaceViewport(width: number, height: number, shape: string, scale?: number, position?: string, audio?: boolean | {bars?:boolean;satellite?:boolean}): { width: number; height: number };
export function musicLayout(settings: {musicTheme?:string;musicSizing?:string;musicPresentation?:string}): {theme:string;enabled:boolean;fixed:boolean;presentation:string;bars:boolean;satellite:boolean};
export function musicActivity(media:{title?:string;isPlaying?:boolean},audible:boolean,enabled?:boolean): {visible:boolean;hasSession:boolean;outputOnly:boolean};
export function fitSurfaceHeight(preferred: number, shape: string, scale?: number, availableHeight?: number, position?: string): number;
export function sectionHeightLimit(tab: string, shape: string, scale?: number, availableHeight?: number, position?: string): number;
export function containsSurfacePoint(rect: DOMRect | null, x: number, y: number, radius?: number | {topLeft:number;topRight:number;bottomLeft:number;bottomRight:number}): boolean;
export class AutoCollapse {
  inside: boolean;
  constructor(collapse: () => void, options?: { delay?: number });
  update(stage: string, blocked: boolean): void;
  enter(): void;
  leave(): void;
  cancel(): void;
  dispose(): void;
}

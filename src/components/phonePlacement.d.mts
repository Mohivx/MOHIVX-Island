export type DisplayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DisplayDescriptor = {
  id: string;
  name?: string;
  primary?: boolean;
  bounds: DisplayBounds;
  workArea?: DisplayBounds;
  scaleFactor?: number;
};

export type MonitorRect = {
  display: DisplayDescriptor;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DisplayBoard = {
  width: number;
  height: number;
  cardWidth: number;
  cardHeight: number;
  monitorRects: MonitorRect[];
  primaryRect: MonitorRect | null;
  primaryDisplayId: string | null;
};

export type PhoneEdge = 'left' | 'right' | 'top' | 'bottom';

export type PhonePlacement = {
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
  edge: PhoneEdge;
  monitorId: string | null;
  sharedBoundary: boolean;
  startRatio: number;
  endRatio: number;
};

export type OccupiedRect = {
  id?: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function isSharedMonitorBoundary(
  targetDisplay: DisplayDescriptor,
  edge: PhoneEdge,
  displays?: DisplayDescriptor[],
  tolerancePx?: number
): boolean;

export function computeDisplayBoard(
  displays?: DisplayDescriptor[],
  rawBoardWidth?: number
): DisplayBoard;

export function classifyNearestMonitorEdge(
  cardRect: OccupiedRect,
  monitorRects?: MonitorRect[],
  displays?: DisplayDescriptor[]
): {
  monitorId: string | null;
  edge: PhoneEdge;
  distance: number;
  rawDistance?: number;
  sharedBoundary: boolean;
  startRatio: number;
  endRatio: number;
};

export function resolvePhonePlacement(
  desired: { x: number; y: number } | null | undefined,
  board: DisplayBoard,
  occupiedRects?: OccupiedRect[],
  index?: number,
  displays?: DisplayDescriptor[]
): PhonePlacement;

export function resolveAllPhonePlacements(
  devices?: { id: string; name?: string }[],
  savedPositions?: Record<string, { x: number; y: number }>,
  board?: DisplayBoard,
  displays?: DisplayDescriptor[]
): Record<string, PhonePlacement>;

export function computeViewerDockBounds(
  workArea: DisplayBounds,
  edge?: PhoneEdge,
  entryRatio?: number,
  windowSize?: { width: number; height: number }
): DisplayBounds;

export function createEdgeHandoffController(options?: {
  dwellMs?: number;
  edgeThresholdPx?: number;
  hysteresisPx?: number;
  maxSpeedPxPerMs?: number;
  cooldownMs?: number;
}): {
  sample(input: {
    point?: { x: number; y: number } | null;
    at?: number;
    enabled?: boolean;
    displays?: DisplayDescriptor[];
    devices?: { id: string; name?: string; capabilities?: string[] }[];
    layout?: Record<string, { x: number; y: number }>;
    boardWidth?: number;
    isEligible?: (deviceId: string) => boolean;
  }): {
    action: 'none' | 'dwell' | 'enter' | 'release';
    deviceId?: string;
    activeDeviceId: string | null;
    pendingDeviceId?: string;
    edge?: PhoneEdge;
    monitorId?: string;
    entryRatio?: number;
    workArea?: DisplayBounds;
    dockBounds?: DisplayBounds;
    reason?: string;
    primaryDisplayId: string | null;
  };
  release(reason?: string, at?: number): { released: boolean; deviceId: string | null; reason: string };
  getActiveDevice(): string | null;
  isRearmRequired(): boolean;
};

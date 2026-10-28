export type PhonePointOptions = boolean | {
  fill?: boolean;
  rotation?: number;
  displayWidth?: number;
  displayHeight?: number;
};

export function rotatePoint(p: { x: number; y: number } | null | undefined, rotation?: number): { x: number; y: number } | null;

export function phonePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number } | null | undefined,
  width: number,
  height: number,
  options?: PhonePointOptions
): { x: number; y: number } | null;

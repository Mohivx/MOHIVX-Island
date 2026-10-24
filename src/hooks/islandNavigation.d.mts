export function normalizeTabOrder(order: unknown, defaults: readonly string[]): string[];
export function nextVisibleTab(
  ids: readonly string[],
  active: string | null | undefined,
  key: string,
  rtl?: boolean,
): string | null;
export function moveTab(order: readonly string[], id: string, delta: number): string[];
export function nextAppSelection(count: number, current: number, key: string): number;

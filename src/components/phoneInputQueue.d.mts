export type PhoneInputQueue = {
  enqueue(action: unknown): Promise<boolean>;
  flush(): void;
  clear(reason?: string): void;
  size(): number;
  pending(): number;
  isBusy(): boolean;
};

export type PhoneInputQueueOptions = {
  maxSize?: number;
  minMoveInterval?: number;
  canAccept?: () => boolean;
  onError?: (error: unknown, action: unknown) => void;
  onClear?: (reason: string) => void;
};

export type PhoneKeyResolution =
  | { type: 'escape' }
  | { type: 'key'; key: string }
  | null;

export function isComposingKeyEvent(event: unknown, composingRef?: boolean): boolean;
export function resolvePhoneKeyShortcut(event: unknown, composingRef?: boolean): PhoneKeyResolution;
export function extractDirectPrintableKey(event: unknown, composingRef?: boolean): string | null;
export function createPhoneInputQueue(
  sendFn: (action: unknown) => Promise<{ success?: boolean; error?: string } | null | undefined>,
  options?: PhoneInputQueueOptions
): PhoneInputQueue;

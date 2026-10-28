export function decodePhoneAudioFrame(frame: { rate: number; channels: number; data: string }): { left: Float32Array; right: Float32Array; rate: number };
export class PhoneAudioPlayer {
  constructor(options?: { contextFactory?: () => AudioContext; maxBufferedSeconds?: number });
  context: AudioContext;
  resume(): Promise<void>;
  push(frame: { rate: number; channels: number; data: string }): boolean;
  flush(): void;
  stop(): void;
}

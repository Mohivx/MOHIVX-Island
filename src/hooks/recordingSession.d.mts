interface RecordingDependencies {
  getMedia: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
  encode: (blob: Blob) => Promise<string>;
  onState: (state: { recording: boolean; error: string }) => void;
  onComplete: (data: string) => void;
  maxBytes?: number;
}
export class RecordingSession {
  constructor(dependencies: RecordingDependencies);
  start(): Promise<void>;
  stop(): void;
  cancel(): void;
}

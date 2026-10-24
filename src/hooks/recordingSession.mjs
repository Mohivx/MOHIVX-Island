// A recording owns microphone acquisition and encoding until it is cancelled.
export class RecordingSession {
  constructor({ getMedia, createRecorder, encode, onState, onComplete, maxBytes = 12 * 1024 * 1024 }) {
    Object.assign(this, { getMedia, createRecorder, encode, onState, onComplete, maxBytes });
    this.generation = 0;
    this.stream = null;
    this.recorder = null;
    this.stopRequested = false;
  }
  release(stream) { stream?.getTracks().forEach(track => track.stop()); }
  cancel() {
    this.generation++;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder?.state === 'recording') recorder.stop();
    this.release(this.stream);
    this.stream = null;
    this.onState({ recording: false, error: '' });
  }
  stop() {
    this.stopRequested = true;
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }
  async start() {
    this.cancel();
    this.stopRequested = false;
    const run = this.generation;
    let media;
    try {
      media = await this.getMedia();
      if (run !== this.generation) { this.release(media); return; }
      this.stream = media;
      const recorder = this.createRecorder(media);
      this.recorder = recorder;
      const chunks = [];
      let bytes = 0;
      recorder.ondataavailable = event => {
        if (run !== this.generation || !event.data.size) return;
        chunks.push(event.data);
        bytes += event.data.size;
        if (bytes > this.maxBytes && recorder.state === 'recording') recorder.stop();
      };
      recorder.onerror = () => {
        if (run !== this.generation) return;
        this.cancel();
        this.onState({ recording: false, error: 'Could not record microphone audio.' });
      };
      recorder.onstop = async () => {
        this.release(media);
        if (run !== this.generation) return;
        this.recorder = null;
        this.stream = null;
        this.onState({ recording: false, error: '' });
        try {
          if (!bytes) throw new Error('No audio was recorded. Try again.');
          const data = await this.encode(new Blob(chunks, { type: recorder.mimeType }));
          if (run === this.generation) this.onComplete(data);
        } catch (error) {
          if (run === this.generation) this.onState({ recording: false, error: error.message || 'Could not read the recording.' });
        }
      };
      recorder.start(250);
      this.onState({ recording: true, error: '' });
      if (this.stopRequested) setTimeout(() => {
        if (run === this.generation && recorder.state === 'recording') recorder.stop();
      }, 100);
    } catch (error) {
      this.release(media);
      if (run !== this.generation) return;
      this.stream = null;
      this.recorder = null;
      this.onState({ recording: false, error: error.message || 'Microphone unavailable.' });
    }
  }
}

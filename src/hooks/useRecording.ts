import { useEffect, useRef, useState } from 'react';
import { ipc, useSettings } from './useSettings';
import { RecordingSession } from './recordingSession.mjs';

/**
 * Hook to manage microphone recording sessions.
 *
 * @param onComplete  Called with a base64 data-URL when recording finishes.
 * @param preferredMicId  A BROWSER microphone deviceId from enumerateDevices(),
 *   NOT a Windows CoreAudio output endpoint GUID.  Pass undefined or 'default'
 *   to use the system default microphone.
 */
export function useRecording(onComplete: (dataUrl: string) => void, preferredMicId?: string) {
  const {settings}=useSettings();
  const callback = useRef(onComplete); callback.current = onComplete;

  // Mutable ref so getMedia always reads the CURRENT value even after re-renders
  // or late preference loads — the RecordingSession itself is only created once.
  const micIdRef = useRef(preferredMicId || settings.preferredMicId);
  micIdRef.current = preferredMicId || settings.preferredMicId;

  const [state, setState] = useState({ recording: false, error: '' });
  const session = useRef<RecordingSession | null>(null);
  if (!session.current) session.current = new RecordingSession({
    getMedia: () => {
      // Read the ref at call-time so device changes since first render are honoured
      const devId = micIdRef.current;
      const constraints: MediaStreamConstraints = devId && devId !== 'default'
        ? { audio: { deviceId: { exact: devId } } }
        : { audio: true };
      return navigator.mediaDevices.getUserMedia(constraints);
    },
    createRecorder: media => {
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      return new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    },
    encode: blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read the recording. Try again.'));
      reader.readAsDataURL(blob);
    }),
    onState: setState,
    onComplete: data => callback.current(data),
  });
  const controller = session.current;
  useEffect(() => {
    const cancel = () => controller.cancel();
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    document.addEventListener('visibilitychange', visibility);
    ipc?.on('companion-window-hidden', cancel);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      ipc?.removeListener('companion-window-hidden', cancel);
      cancel();
    };
  }, [controller]);
  return { start: () => controller.start(), stop: () => controller.stop(), cancel: () => controller.cancel(), ...state, error:state.error && settings.appLang==='ar'?'تعذر تسجيل الصوت. تحقق من الميكروفون وصلاحية الوصول إليه.':state.error };
}

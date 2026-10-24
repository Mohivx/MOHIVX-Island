import { useEffect, useRef, useState } from 'react';
import { Mic, X, Check, Copy, Loader2, Square } from 'lucide-react';
import { ipc, useSettings } from '../hooks/useSettings';
import { useRecording } from '../hooks/useRecording';
import './companion.css';

export function DictationModal({ isActive, onClose, accentColor = '#d8b368', onInsertText, onDictationFeedback }: {
  isActive: boolean; onClose: () => void; accentColor?: string; onInsertText?: (text: string) => void; onDictationFeedback?: (text: string) => void;
}) {
  const {settings}=useSettings(); const ar=settings.appLang==='ar'; const t=(en:string,a:string)=>ar?a:en;
  const [phase, setPhase] = useState<'recording' | 'processing' | 'done' | 'error'>('recording');
  const [text, setText] = useState(''); const [error, setError] = useState('');
  const generation = useRef(0);
  const complete = async (audio: string) => {
    const run = generation.current; setPhase('processing');
    try {
      if (!ipc) throw new Error(t("Dictation requires the Windows app.","يتطلب الإملاء تطبيق ويندوز."));
      const result = await ipc.invoke('ask-mohivx-ai', { audio, mode: 'dictation', prompt: 'Transcribe only the spoken words. Resolve self-corrections and false starts. Remove filler words, add punctuation. Keep the original language. Return only the finished text. If there is no speech, return an empty string.' });
      if (run !== generation.current) return;
      if (!result.success) throw new Error(result.error || t("Transcription failed.","تعذر تفريغ الصوت."));
      if (!result.text?.trim()) throw new Error(t("No speech was detected. Try again.","لم يُكتشف كلام. حاول مجددًا."));
      setText(result.text); const inserted = await ipc.invoke('insert-dictated-text', result.text);
      if (run !== generation.current) return;
      setPhase('done'); onInsertText?.(result.text);
      setError(inserted?.inserted ? '' : t("Copied to clipboard. Press Ctrl+V in your target app.","نُسخ النص. اضغط Ctrl+V في التطبيق المطلوب."));
      onDictationFeedback?.(inserted?.inserted ? t("Dictation inserted.","أُدرج نص الإملاء.") : t("Dictation copied. Press Ctrl+V to paste.","نُسخ الإملاء. اضغط Ctrl+V للصق."));
    } catch (e) { if (run === generation.current) { setError(e instanceof Error && !ar ? e.message : t("Dictation failed.","فشل الإملاء.")); setPhase('error'); } }
  };
  const recording = useRecording(complete);
  useEffect(() => {
    if (!isActive) return;
    generation.current++; setPhase('recording'); setText(''); setError('');
    ipc?.send('set-ignore-mouse-events', false); ipc?.send('set-window-mode', 'dictation');
    void recording.start();
    const stop = () => recording.stop();
    ipc?.on('stop-dictation', stop);
    window.addEventListener('finish-dictation', stop);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { generation.current++; recording.cancel(); ipc?.removeListener('stop-dictation', stop); window.removeEventListener('finish-dictation', stop); window.removeEventListener('keydown', key); };
  }, [isActive]);
  useEffect(()=>{if(phase==='done'&&isActive&&settings.autoCloseDictation&&!error){const timer=setTimeout(onClose,1800);return()=>clearTimeout(timer);}},[phase,isActive,settings.autoCloseDictation,error]);
  if (!isActive) return null;
  return <div dir={ar?'rtl':'ltr'} className="dictation-pill" style={{ '--record-accent': accentColor } as React.CSSProperties}>
    <span className={`dictation-icon ${recording.recording ? 'recording' : ''}`}>{phase === 'processing' ? <Loader2 className="animate-spin" size={18} /> : phase === 'done' ? <Check size={18} /> : <Mic size={18} />}</span>
    <div><b>{phase === 'processing' ? t("Cleaning your words\u2026","جارٍ تنقيح كلامك…") : phase === 'done' ? t("Ready to send.","جاهز للإرسال.") : phase === 'error' ? t("Could not transcribe","تعذر تفريغ الصوت") : t("Talk badly. Send it clean.","تحدث بطبيعتك، واستلم نصًا مرتبًا.")}</b><p dir="auto">{text || error || recording.error || (recording.recording ? t("Listening \u00b7 release Ctrl + Win or choose Finish","جارٍ الاستماع · اترك Ctrl + Win أو اختر إنهاء") : t("Starting microphone\u2026","جارٍ تشغيل الميكروفون…"))}</p>{text && error && <small>{error}</small>}</div>
    {recording.recording && <button onClick={recording.stop} aria-label={t("Finish dictation","إنهاء الإملاء")}><Square size={13} />{t("Finish","إنهاء")}</button>}
    {phase === 'done' && <button aria-label={t("Copy dictation","نسخ الإملاء")} onClick={() => ipc?.send('write-clipboard', text)}><Copy size={15} /></button>}
    {(phase === 'error' || recording.error) && <button onClick={() => { setError(''); setPhase('recording'); void recording.start(); }}>{t("Retry","إعادة المحاولة")}</button>}
    <button aria-label={t("Close dictation","إغلاق الإملاء")} onClick={onClose}><X size={16} /></button>
  </div>;
}

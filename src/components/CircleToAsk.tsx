import { useEffect, useRef, useState } from 'react';
import { X, Send, Mic, Square, Copy, Loader2 } from 'lucide-react';
import { ipc, useSettings } from '../hooks/useSettings';
import { useRecording } from '../hooks/useRecording';
import './companion.css';

export function CircleToAsk({ isActive, onClose, accentColor = '#d8b368', onVisualSearchFeedback }: {
  isActive: boolean; onClose: () => void; accentColor?: string; onVisualSearchFeedback?: (message: string) => void;
}) {
  const {settings}=useSettings(); const ar=settings.appLang==='ar'; const t=(en:string,a:string)=>ar?a:en;
  const canvas = useRef<HTMLCanvasElement>(null); const points = useRef<{ x: number; y: number }[]>([]);
  const [snapshot, setSnapshot] = useState(''); const [crop, setCrop] = useState(''); const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  async function ask(audio?: string) {
    if (!crop || busy) return; setBusy(true); setError(''); const run = generation.current;
    try {
      if (!ipc) throw new Error(t("Screen questions require the Windows app.","تتطلب أسئلة الشاشة تطبيق ويندوز."));
      const result = await ipc.invoke('ask-mohivx-ai', { prompt: prompt.trim() || (audio ? 'Answer the question in this recording about the selected image.' : 'Describe the selected image and any readable text.'), image: crop, audio });
      if (run !== generation.current) return;
      if (!result.success) throw new Error(result.error || t("Could not analyze this selection.","تعذر تحليل هذا التحديد."));
      setReply(result.text); onVisualSearchFeedback?.(t("Your screen answer is ready.","إجابة سؤالك عن الشاشة جاهزة."));
    } catch (e) { if (run === generation.current) setError(e instanceof Error && !ar ? e.message : t("Analysis failed.","فشل التحليل.")); }
    finally { if (run === generation.current) setBusy(false); }
  }
  const recording = useRecording(audio => void ask(audio));
  useEffect(() => {
    if (!isActive) return;
    generation.current++; setSnapshot(''); setCrop(''); setReply(''); setPrompt(''); setError(''); setBusy(false);
    let mounted = true;
    ipc?.invoke('prepare-screen-capture').then((result: any) => {
      if (!mounted) return;
      if (result.success) { setSnapshot(result.dataUrl); ipc.send('set-window-mode', 'fullscreen'); ipc.send('set-ignore-mouse-events', false); }
      else setError(result.error || t("Could not capture the screen.","تعذر التقاط الشاشة."));
    }).catch((e: Error) => setError(e.message));
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { mounted = false; generation.current++; recording.cancel(); window.removeEventListener('keydown', key); };
  }, [isActive]);
  if (!isActive) return null;
  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!points.current.length || !event.buttons) return;
    points.current.push({ x: event.clientX, y: event.clientY });
    const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); ctx.beginPath();
    points.current.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = accentColor; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  }
  async function finish() {
    const all = points.current; points.current = []; if (all.length < 3) return;
    const minX = Math.max(0, Math.min(...all.map(p => p.x))); const minY = Math.max(0, Math.min(...all.map(p => p.y)));
    const width = Math.min(window.innerWidth - minX, Math.max(...all.map(p => p.x)) - minX); const height = Math.min(window.innerHeight - minY, Math.max(...all.map(p => p.y)) - minY);
    if (width < 12 || height < 12) { setError(t("Circle a larger area.","حدد منطقة أكبر.")); return; }
    const result = await ipc?.invoke('capture-screen-region', { x: minX, y: minY, width, height });
    if (result?.success) { setCrop(result.dataUrl); setError(''); } else setError(result?.error || t("Capture unavailable.","الالتقاط غير متاح."));
  }
  return <div className="circle-screen" dir={ar?'rtl':'ltr'}>
    {snapshot && <img className="circle-background" src={snapshot} alt={t("Frozen desktop for selection","صورة سطح المكتب للتحديد")} />}
    <div className="circle-dim" />
    {!crop && <canvas ref={canvas} width={window.innerWidth} height={window.innerHeight} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); points.current = [{ x: event.clientX, y: event.clientY }]; }} onPointerMove={draw} onPointerUp={() => void finish()} />}
    <div className="circle-guide"><span>{crop ? t("Circle to Ask","تحديد الشاشة والسؤال") : t("Circle anything. Ask about it.","حدد أي شيء واسأل عنه.")}</span><kbd>Esc</kbd><button aria-label={t("Close screen selection","إغلاق تحديد الشاشة")} onClick={onClose}><X size={15} /></button></div>
    {crop && <div className="circle-answer"><div className="circle-preview"><img src={crop} alt={t("Selected region","المنطقة المحددة")} /><button onClick={() => { setCrop(''); setReply(''); }} aria-label={t("Select another region","تحديد منطقة أخرى")}>{t("Select again","تحديد مجددًا")}</button></div>
      <form onSubmit={e => { e.preventDefault(); void ask(); }}><input autoFocus aria-label={t("Question about selection","سؤال عن التحديد")} placeholder={t("Ask about this…","اسأل عن هذا…")} value={prompt} onChange={e => setPrompt(e.target.value)} /><button type="button" aria-label={recording.recording ? t("Finish spoken question","إنهاء السؤال الصوتي") : t("Ask by voice","السؤال صوتيًا")} onClick={() => recording.recording ? recording.stop() : void recording.start()}>{recording.recording ? <Square size={14} /> : <Mic size={15} />}</button><button type="submit" aria-label={t("Ask about selection","السؤال عن التحديد")} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}</button></form>
      {reply && <div className="circle-reply" dir="auto">{reply}<button aria-label={t("Copy answer","نسخ الإجابة")} onClick={() => ipc?.send('write-clipboard', reply)}><Copy size={13} /></button></div>}
      {(error || recording.error) && <p className="circle-error" role="alert">{error || recording.error}</p>}
      <small>{recording.recording ? t("Listening\u2026","جارٍ الاستماع…") : t("The selected region and your question are sent to Gemini.","يُرسل الجزء المحدد وسؤالك إلى Gemini.")}</small>
    </div>}
    {!crop && error && <p className="circle-capture-error" role="alert">{error}</p>}
  </div>;
}

import { themeAccent } from '../themes';
import React, { useState, useEffect } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  CheckCircle2,
  X
} from 'lucide-react';

import { useSettings } from '../hooks/useSettings';

export interface ScheduledItem {
  id: string;
  title: string;
  actionType: 'url' | 'app' | 'command' | 'routine';
  target: string;
  targetTime: number;
  createdAt: number;
  completed: boolean;
  status?: string; error?: string; repeat?: string;
}

interface ScheduledActionsProps {
  isOpen: boolean;
  onClose: () => void;
  accentColor?: string;
  onScheduledFeedback?: (message: string) => void;
}

const electron = typeof window !== 'undefined' && (window as any).require ? (window as any).require('electron') : null;

export const ScheduledActions: React.FC<ScheduledActionsProps> = ({
  isOpen,
  onClose,
  accentColor: _accentColor,
  onScheduledFeedback
}) => {
  const { settings } = useSettings();
  const ar = settings.appLang === 'ar';
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [actionType, setActionType] = useState<'url' | 'app' | 'command' | 'routine'>('url');
  const [presetDelay, setPresetDelay] = useState<number>(300000); // 5 mins default
  const [customTime, setCustomTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [repeat, setRepeat] = useState('once');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    loadScheduledItems();

    if (electron && electron.ipcRenderer) {
      const handleTriggered = (_: any, item: ScheduledItem) => {
        loadScheduledItems();
        if (onScheduledFeedback) {
          const statusText = item.status === 'failed'
            ? (ar ? 'فشل الإجراء' : 'Action failed')
            : (ar ? 'اكتمل الإجراء' : 'Action completed');
          onScheduledFeedback(`${statusText}: ${item.title}`);
        }
      };
      electron.ipcRenderer.on('scheduled-action-triggered', handleTriggered);
      return () => {
        electron.ipcRenderer.removeListener('scheduled-action-triggered', handleTriggered);
      };
    }
  }, [isOpen, ar]);

  const loadScheduledItems = async () => {
    if (electron && electron.ipcRenderer) {
      try {
        const list = await electron.ipcRenderer.invoke('get-scheduled-actions');
        if (Array.isArray(list)) setItems(list);
      } catch (e) {
        console.error('Failed to load scheduled actions:', e);
      }
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !target.trim()) return;

    setError('');
    if (customTime && new Date(customTime).getTime() <= Date.now()) {
      setError(ar ? 'اختر تاريخًا ووقتًا في المستقبل.' : 'Choose a future date and time.');
      return;
    }
    setLoading(true);
    try {
      let targetTimestamp = Date.now() + presetDelay;
      if (customTime) {
        const parsed = new Date(customTime).getTime();
        if (!isNaN(parsed) && parsed > Date.now()) {
          targetTimestamp = parsed;
        }
      }

      const payload = {
        title: title.trim(),
        actionType,
        target: target.trim(),
        targetTime: targetTimestamp,
        repeat,
        steps: actionType==='routine' ? target.split('\n').filter(line=>line.trim()).map(line=>{const split=line.indexOf(':');return {actionType:line.slice(0,split).trim(),target:line.slice(split+1).trim()};}) : undefined
      };

      if (electron && electron.ipcRenderer) {
        const res = await electron.ipcRenderer.invoke('schedule-action', payload);
        if (res?.success) {
          setTitle('');
          setTarget('');
          setCustomTime('');
          loadScheduledItems();
          const timeFormatted = new Date(targetTimestamp).toLocaleTimeString(ar ? 'ar-EG' : [], { hour: '2-digit', minute: '2-digit' });
          if (onScheduledFeedback) {
            onScheduledFeedback(
              ar
                ? `مجدول: سيتم تشغيل ${payload.title} في ${timeFormatted}`
                : `HITODAMA Scheduled: I will open ${payload.title} at ${timeFormatted}`
            );
          }
        } else {
          setError(res?.error || (ar ? 'تعذرت جدولة هذا الإجراء.' : 'Could not schedule this action.'));
        }
      } else {
        setError(ar ? 'تتطلب الجدولة تطبيق ويندوز.' : 'Scheduling requires the Windows app.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'خطأ في الجدولة' : 'Scheduling error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (electron && electron.ipcRenderer) {
      try {
        await electron.ipcRenderer.invoke('cancel-scheduled-action', id);
        loadScheduledItems();
      } catch (err) {
        console.error('Failed to cancel action:', err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{'--app-accent':themeAccent(settings)} as React.CSSProperties} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" dir={ar ? 'rtl' : 'ltr'}>
      <div className="bg-[#0E0F13] border border-white/10 rounded-2xl w-full max-w-xl p-5 shadow-2xl flex flex-col gap-4 text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>{ar ? 'الإجراءات المجدولة والروتين' : 'Scheduled Actions & Routines'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--app-accent)]/20 text-[color:var(--app-accent)] font-mono">
                  {ar ? 'تلقائي' : 'Autonomous'}
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                {ar
                  ? 'قلها مرة واحدة ودع الرفيق يتولى الأمر. يتذكر الموعد وينفذ الإجراء تلقائيًا.'
                  : 'Say it once. Then forget it. MOHIVX Island remembers the date, time, and executes automatically.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={ar ? 'إغلاق الإجراءات المجدولة' : 'Close scheduled actions'}
            className="p-1.5 rounded-lg bg-[#18191E] hover:bg-rose-950/60 hover:text-rose-400 text-zinc-400 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Schedule Form */}
        <form onSubmit={handleAddSchedule} className="bg-[#141519] border border-[#23242A] rounded-xl p-3.5 space-y-3">
          <div className="flex gap-2 pb-1">
            {(['url', 'app', 'routine'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActionType(t)}
                className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase transition-colors cursor-pointer ${
                  actionType === t ? 'bg-[color:var(--app-accent)] text-black font-bold' : 'bg-[#1C1D24] text-zinc-400 hover:text-white'
                }`}
              >
                {t === 'routine' ? (ar ? 'روتين' : 'Routine') : t === 'url' ? (ar ? 'رابط URL' : 'URL') : (ar ? 'برنامج APP' : 'APP')}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold text-zinc-300 block mb-1">
                {ar ? 'اسم الإجراء' : 'Action Name'}
              </label>
              <input
                type="text"
                placeholder={ar ? 'مثال: فتح أمازون للعروض' : 'e.g. Open Amazon for Deals'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#1A1B20] border border-[#2B2C34] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[color:var(--app-accent)]"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-zinc-300 block mb-1">
                {ar ? 'الرابط أو مسار التطبيق' : 'Target URL or Program'}
              </label>
              {actionType==='routine' ? <textarea aria-label={ar?'خطوات الروتين':'Routine steps'} value={target} onChange={e=>setTarget(e.target.value)} placeholder={'app:Calculator\nurl:https://youtube.com'} className="instructions-input" required/> : <input
                type="text"
                placeholder={ar?'رابط موقع أو اسم تطبيق مثبت':'Website URL or installed app name'}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full bg-[#1A1B20] border border-[#2B2C34] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[color:var(--app-accent)] font-mono"
                required
              />}
              {actionType==='routine'&&<small>{ar?'خطوة في كل سطر: app:اسم التطبيق أو url:رابط الموقع. تُنفذ بالترتيب وتتوقف عند الفشل.':'One step per line: app:App name or url:Website. Runs in order and stops on failure.'}</small>}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-zinc-400">{ar ? 'الموعد:' : 'When:'}</span>
            {[
              { label: ar ? 'خلال 5 دقائق' : 'In 5 mins', value: 300000 },
              { label: ar ? 'خلال 15 دقيقة' : 'In 15 mins', value: 900000 },
              { label: ar ? 'خلال ساعة' : 'In 1 hour', value: 3600000 },
              { label: ar ? 'غداً 9 صباحاً' : 'Tomorrow 9 AM', value: (() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(9, 0, 0, 0);
                return tomorrow.getTime() - Date.now();
              })() }
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => {
                  setPresetDelay(p.value);
                  setCustomTime('');
                }}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  presetDelay === p.value && !customTime
                    ? 'bg-[color:var(--app-accent)] text-black font-bold'
                    : 'bg-[#1C1D24] text-zinc-400 hover:text-white border border-[#2B2C34]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <input
              type="datetime-local"
              value={customTime}
              aria-label={ar ? 'تاريخ ووقت مخصص' : 'Custom date and time'}
              onChange={(e) => setCustomTime(e.target.value)}
              className="bg-[#1A1B20] border border-[#2B2C34] rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-[color:var(--app-accent)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-[color:var(--app-accent)] hover:bg-[#c9a356] text-black font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-md disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{loading ? (ar ? 'جارٍ الحفظ…' : 'Scheduling…') : (ar ? 'جدولة الإجراء' : 'Schedule Action')}</span>
            </button>
          </div>
        </form>

        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        <label className="flex items-center gap-3 text-xs text-zinc-400">
          <span>{ar ? 'التكرار' : 'Repeat'}</span>
          <select aria-label={ar ? 'تكرار الجدولة' : 'Repeat schedule'} className="bg-[#1a1b20] rounded px-2 py-1 text-zinc-200" value={repeat} onChange={e => setRepeat(e.target.value)}>
            <option value="once">{ar ? 'مرة واحدة' : 'Once'}</option>
            <option value="daily">{ar ? 'يومياً' : 'Every day'}</option>
            <option value="weekdays">{ar ? 'أيام العمل' : 'Weekdays'}</option>
          </select>
        </label>
        {/* Scheduled Items List */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>{ar ? `الإجراءات القادمة (${items.filter(i => !i.completed).length})` : `Upcoming Actions (${items.filter(i => !i.completed).length})`}</span>
            <button
              type="button"
              onClick={loadScheduledItems}
              className="text-[10px] text-zinc-400 hover:text-white cursor-pointer"
            >
              {ar ? 'تحديث' : 'Refresh'}
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-2 custom-scrollbar">
            {items.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#141519] border border-[#23242A] text-center text-xs text-zinc-500">
                {ar ? 'لا توجد إجراءات مجدولة حالياً. أضف إجراءً في الأعلى أو اطلب من رفيقك.' : 'No scheduled actions yet. Set one above or ask your companion.'}
              </div>
            ) : (
              items.map((item) => {
                const timeLeft = Math.max(0, Math.round((item.targetTime - Date.now()) / 60000));
                return (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                      item.completed
                        ? 'bg-[#101114] border-[#1D1E22] opacity-60'
                        : 'bg-[#15161B] border-[#25262E]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate mr-2">
                      <div className={`p-1.5 rounded-lg ${item.completed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {item.status === 'failed' ? <X className="w-4 h-4 text-rose-300" /> : item.completed ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-white truncate">{item.title}</div>
                        <div className="text-[10px] text-zinc-400 font-mono truncate">{item.target}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        item.completed ? 'bg-zinc-800 text-zinc-400' : 'bg-[color:var(--app-accent)]/20 text-[color:var(--app-accent)]'
                      }`}>
                        {item.status === 'failed' ? (ar ? `فشل: ${item.error}` : `Failed: ${item.error}`) : item.completed ? (ar ? 'مكتمل' : 'Completed') : (ar ? `خلال ${timeLeft} د` : `In ${timeLeft} min`)}
                      </span>
                      {!item.completed && (
                        <button
                          type="button"
                          onClick={() => handleCancel(item.id)}
                          className="p-1 rounded hover:bg-rose-950/60 hover:text-rose-400 text-zinc-500 transition-colors cursor-pointer"
                          title={ar ? 'إلغاء' : 'Cancel'}
                          aria-label={ar ? 'إلغاء الإجراء المجدول' : 'Cancel scheduled action'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

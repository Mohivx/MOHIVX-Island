const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function mergeSettings(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeSettings(base?.[key] || {}, value) : value;
  }
  return result;
}
function isSensitiveClipboard(text) {
  return /-----BEGIN (?:\w+ )?PRIVATE KEY-----|\b(?:AIza[A-Za-z0-9_-]{25,}|sk-[A-Za-z0-9_-]{20,}|tvly-[A-Za-z0-9_-]{15,})|(?:password|passwd|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+/i.test(text || '');
}
function resolveAudioDevice(devices, requested) {
  const normalize = value => String(value || '').replace(/^SWD\\MMDEVAPI\\/i, '').toLowerCase();
  const device = requested === 'default' ? devices.find(item => item.isDefault) : devices.find(item => normalize(item.id) === normalize(requested) || item.name === requested);
  return device ? String(device.id).replace(/^SWD\\MMDEVAPI\\/i, '') : null;
}
function mediaPart(dataUrl, allowed) {
  if (!dataUrl) return null;
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match || !allowed.test(match[1])) throw new Error('Unsupported media format.');
  if (match[2].length > 18 * 1024 * 1024) throw new Error('Recording or image is too large.');
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

class CompanionAI {
  constructor(agent, getSettings) { this.agent = agent; this.getSettings = getSettings; }
  async ask({ prompt, image, audio, mode } = {}) {
    const settings = this.getSettings();
    try {
      if (settings.localOnlyMode) throw new Error('Local-only mode is enabled. Cloud AI requests are disabled.');
      if (settings.aiEnabled === false) throw new Error('AI is disabled.');
      if (!settings.geminiKey) throw new Error('Add your Gemini API key in Settings → API keys.');
      if (audio && settings.voiceInputEnabled === false) throw new Error('Voice input is disabled in Settings → Behavior.');
      const parts = [{ text: String(prompt || 'Describe this selection.').slice(0, 30000) }];
      if (image) parts.push(mediaPart(image, /^image\/(png|jpeg|webp)$/));
      if (audio) parts.push(mediaPart(audio, /^audio\/(webm|ogg|wav|mp3|mpeg|mp4)$/));
      const response = await this.agent.callGeminiApi(settings.geminiKey, {
        contents: [{ role: 'user', parts }], generationConfig: { temperature: mode === 'dictation' ? 0 : 0.4, maxOutputTokens: 1800 },
      });
      const text = (response.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
      if (!text && mode !== 'dictation') throw new Error('The model returned no answer.');
      return { success: true, text };
    } catch (error) { return { success: false, error: error.message }; }
  }
  async voice(voice = 'Charon', text = 'Hello. I am your desktop companion.') {
    const settings = this.getSettings();
    try {
      if (settings.localOnlyMode || settings.aiEnabled === false) throw new Error('Cloud AI is disabled.');
      if (!settings.geminiKey) throw new Error('Add your Gemini API key to preview this voice.');
      if (!require('../data/voices.json').includes(voice)) throw new Error('Voice unavailable.');
      const result = await this.agent._makeRequest(settings.geminiKey, {
        contents: [{ parts: [{ text: String(text).slice(0, 4000) }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }, settings.ttsModel || 'gemini-3.8-flash-lite-tts');
      const output = result.candidates?.[0]?.content?.parts?.find(part => part.inlineData)?.inlineData;
      if (!output?.data) throw new Error('The voice service returned no audio.');
      return { success: true, audio: output.data, mimeType: output.mimeType };
    } catch (error) { return { success: false, error: error.message }; }
  }
  async research(query, fetcher = fetch) {
    const settings = this.getSettings();
    if (settings.localOnlyMode) return { success: false, error: 'Cloud research is disabled in local-only mode.' };
    if (!settings.tavilyKey) return { success: false, error: 'Add a Tavily key in Settings → API keys to research the web.' };
    try {
      const response = await fetcher('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.tavilyKey}` }, body: JSON.stringify({ query: String(query || '').slice(0, 1000), max_results: 5 }), signal: AbortSignal.timeout(15000) });
      const body = await response.json(); if (!response.ok) throw new Error(body.detail?.error || body.detail || `Research failed: HTTP ${response.status}`);
      return { success: true, results: (body.results || []).map(item => ({ title: item.title, url: item.url, content: item.content })) };
    } catch (error) { return { success: false, error: error.message }; }
  }
}

class ScheduledActionsStore {
  constructor(file, execute, notify = () => {}, now = Date.now) {
    this.file = file; this.execute = execute; this.notify = notify; this.now = now; this.items = [];
    try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); if (Array.isArray(value)) this.items = value.map(item => item.status === 'running' ? { ...item, status: 'failed', completed: true, error: 'The app closed while this action was running. It was not repeated.' } : item); } catch { /* first launch */ }
  }
  persist() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); const temp = `${this.file}.tmp`; fs.writeFileSync(temp, JSON.stringify(this.items, null, 2)); fs.renameSync(temp, this.file); }
  add(action) {
    if (!action || !['url', 'app', 'command', 'routine'].includes(action.actionType)) throw new Error('Choose a supported action type.');
    if (action.actionType !== 'routine' && !String(action.target || '').trim()) throw new Error('Choose an action target.');
    if (!Number.isFinite(Number(action.targetTime)) || Number(action.targetTime) <= this.now()) throw new Error('Choose a future date and time.');
    if (action.actionType === 'url' && !/^https?:\/\//i.test(action.target)) throw new Error('Website actions require an http or https URL.');
    let steps;
    if(action.actionType==='routine') {
      if(!Array.isArray(action.steps)||!action.steps.length||action.steps.length>20)throw new Error('A routine needs 1–20 steps.');
      steps=action.steps.map(step=>{if(!['url','app'].includes(step.actionType)||!String(step.target||'').trim()||(step.actionType==='url'&&!/^https?:\/\//i.test(step.target)))throw new Error('Invalid routine step.');return {actionType:step.actionType,target:String(step.target).trim().slice(0,4000)};});
    }
    const item = { steps, id: crypto.randomUUID(), title: String(action.title || action.target).slice(0, 200), actionType: action.actionType, target: String(action.target || '').trim(), targetTime: Number(action.targetTime), repeat: ['daily', 'weekdays'].includes(action.repeat) ? action.repeat : 'once', createdAt: this.now(), completed: false, status: 'scheduled' };
    this.items.unshift(item); this.persist(); return item;
  }
  cancel(id) { this.items = this.items.filter(item => item.id !== id); this.persist(); }
  tick() {
    if (this.activeTick) return this.activeTick;
    this.activeTick = this.runDue().finally(() => { this.activeTick = null; });
    return this.activeTick;
  }
  async runDue() {
    const due = this.items.filter(item => !item.completed && item.status !== 'running' && item.targetTime <= this.now());
    for (const item of due) {
      if (!this.items.includes(item) || item.completed || item.status === 'running') continue;
      item.status = 'running'; this.persist();
      try {
        if(item.actionType==='routine') {
          item.results=[];
          for(const [index,step] of item.steps.entries()) {
            if(!this.items.includes(item))break;
            try{await this.execute({...step,parentId:item.id});item.results.push({index,status:'completed',at:this.now()});this.persist();}
            catch(error){item.results.push({index,status:'failed',error:error.message,at:this.now()});throw error;}
          }
          if(!this.items.includes(item))continue;
        } else await this.execute(item); item.status = 'completed'; item.completed = true; item.completedAt = this.now(); delete item.error;
        if (item.repeat === 'daily' || item.repeat === 'weekdays') {
          const next = new Date(item.targetTime);
          do { next.setDate(next.getDate() + 1); } while (next.getTime() <= this.now() || (item.repeat === 'weekdays' && [0, 6].includes(next.getDay())));
          item.targetTime = next.getTime(); item.completed = false; item.status = 'scheduled';
        }
      } catch (error) { item.status = 'failed'; item.completed = true; item.error = error.message; }
      this.persist(); this.notify({ ...item });
    }
  }
}
module.exports = { mergeSettings, isSensitiveClipboard, resolveAudioDevice, mediaPart, CompanionAI, ScheduledActionsStore };

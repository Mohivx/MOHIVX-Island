const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {validDate}=require('./companionWorkspace.cjs');
const shop=require('../data/shop.json');
const day = stamp => { const d = new Date(stamp); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
class ActivityStore {
  constructor(file, now = Date.now) {
    this.file = file; this.now = now;
    this.data = { tasks: [], events: [], xp: 0, embers: 0, claimed: [], rewards: [], questClaims:[], ownedSkins:['hitodama'],ownedAbilities:[],freezes:0,frozenDays:[],purchases:[],focus: null };
    try { this.data = { ...this.data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {}
  }
  persist() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file+'.tmp', JSON.stringify(this.data)); fs.renameSync(this.file+'.tmp', this.file); }
  migrateCosmetics(settings){if(this.data.cosmeticsMigrated)return;const active=settings.activeSkin;if(shop.some(item=>item.kind==='skin'&&item.value===active)&&!this.data.ownedSkins.includes(active))this.data.ownedSkins.push(active);const legacy={Collapse:'collapse','طي المساحة':'collapse',Sidearm:'sidearm'}[settings.activeAbility]||settings.activeAbility;if(shop.some(item=>item.kind==='ability'&&item.value===legacy)&&!this.data.ownedAbilities.includes(legacy))this.data.ownedAbilities.push(legacy);if(active==='void'&&!this.data.ownedAbilities.includes('collapse'))this.data.ownedAbilities.push('collapse');this.data.cosmeticsMigrated=true;this.persist();}
  buy(id,purchaseId){const item=shop.find(item=>item.id===id);if(!item)throw Error('Item unavailable.');if(typeof purchaseId!=='string'||purchaseId.length<8||purchaseId.length>100)throw Error('Invalid purchase.');if(this.data.purchases.includes(purchaseId))return this.snapshot();const owned=item.kind==='skin'?this.data.ownedSkins:item.kind==='ability'?this.data.ownedAbilities:null;if(owned?.includes(item.value))return this.snapshot();if(item.kind==='freeze'&&this.data.freezes>=2)throw Error('You already have two freezes.');if(this.data.embers<item.price)throw Error('Not enough embers.');this.data.embers-=item.price;if(owned)owned.push(item.value);else this.data.freezes++;if(item.value==='void'&&!this.data.ownedAbilities.includes('collapse'))this.data.ownedAbilities.push('collapse');this.data.purchases.push(purchaseId);this.data.purchases=this.data.purchases.slice(-200);this.persist();return this.snapshot();}
  protectStreak(){if(!this.data.freezes||!this.data.events.length)return;const latest=Math.max(...this.data.events.map(e=>e.at)),cursor=new Date(latest),yesterday=new Date(this.now());cursor.setHours(12,0,0,0);cursor.setDate(cursor.getDate()+1);yesterday.setHours(12,0,0,0);yesterday.setDate(yesterday.getDate()-1);const missing=[];while(cursor<=yesterday&&missing.length<=this.data.freezes){const value=day(cursor);if(!this.data.frozenDays.includes(value))missing.push(value);cursor.setDate(cursor.getDate()+1);}if(cursor>yesterday&&missing.length&&missing.length<=this.data.freezes){this.data.freezes-=missing.length;this.data.frozenDays.push(...missing);this.persist();}}
  record(type, detail = '') {
    this.protectStreak();
    if (!['conversation', 'task', 'focus', 'routine', 'wallpaper', 'dictation', 'screen','calendar','snippet'].includes(type)) return;
    const key = `${day(this.now())}:${type}`;
    this.data.events.unshift({ id: randomUUID(), type, detail: String(detail).slice(0,120), words:type==='dictation'?String(detail).trim().split(/\s+/u).filter(Boolean).length:0, at: this.now() });
    this.data.events = this.data.events.slice(0, 1000);
    if (!this.data.rewards.includes(key)) { this.data.xp += type === 'focus' ? 30 : 20; this.data.embers += 5; this.data.rewards.push(key); }
    this.persist();
  }
  task(input) {
    if (input.remove) this.data.tasks = this.data.tasks.filter(t => t.id !== input.id);
    else if (input.id) {
      const task = this.data.tasks.find(t => t.id === input.id); if (!task) throw new Error('Task not found.');
      const previous = task.done;if(typeof input.title==='string'){const title=input.title.trim().slice(0,200);if(!title)throw Error('Enter a task.');task.title=title;}if(input.date!==undefined){if(input.date)validDate(input.date);task.date=input.date;}if(input.list!==undefined)task.list=String(input.list).trim().slice(0,60);if(input.done!==undefined)task.done = Boolean(input.done);
      if (!previous && task.done) this.record('task', task.title);
    } else {
      const title = String(input.title || '').trim().slice(0, 200); if (!title) throw new Error('Enter a task.');
      if(input.date)validDate(input.date);
      this.data.tasks.unshift({ id: randomUUID(), title, done: false, date:input.date||'',list:String(input.list||'').trim().slice(0,60),createdAt: this.now() });
    }
    this.persist(); return this.snapshot();
  }
  focus(minutes) {
    if (minutes === 'pause') { if(this.data.focus&&!this.data.focus.paused){this.data.focus.remaining=Math.max(0,this.data.focus.endsAt-this.now());this.data.focus.paused=true;} }
    else if(minutes === 'resume') { if(this.data.focus?.paused){this.data.focus.endsAt=this.now()+this.data.focus.remaining;this.data.focus.paused=false;delete this.data.focus.remaining;} }
    else if (minutes === 0) this.data.focus = null;
    else { if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) throw new Error('Choose 1–180 minutes.'); this.data.focus = { startedAt: this.now(), endsAt: this.now()+minutes*60000 }; }
    this.persist(); return this.snapshot();
  }
  snapshot() {
    if (this.data.focus && !this.data.focus.paused && this.now() >= this.data.focus.endsAt) { this.data.focus = null; this.record('focus'); }
    this.protectStreak();
    const dates = new Set([...this.data.events.map(e => day(e.at)),...this.data.frozenDays]);
    let streak = 0, cursor = new Date(this.now());
    if (!dates.has(day(cursor))) cursor.setDate(cursor.getDate()-1);
    while (dates.has(day(cursor))) { streak++; cursor.setDate(cursor.getDate()-1); }
    const level = 1 + Math.floor(this.data.xp / 100);
    const today=this.data.events.filter(e=>day(e.at)===day(this.now())),words=today.reduce((n,e)=>n+(e.words||0),0);
    const quests=[{id:'conversation',target:1,value:today.filter(e=>e.type==='conversation').length,reward:3},{id:'calendar',target:1,value:today.filter(e=>e.type==='calendar').length,reward:3},{id:'dictation',target:300,value:words,reward:4}].map(q=>({...q,claimed:this.data.questClaims.includes(day(this.now())+':'+q.id)}));
    const ordered=[...dates].map(value=>new Date(...value.split('-').map((v,i)=>Number(v)-(i===1?1:0)),12).getTime()).sort((a,b)=>a-b);let bestStreak=0,run=0,previous=null;for(const value of ordered){const next=new Date(previous||0);next.setDate(next.getDate()+1);run=previous!==null&&day(next)===day(value)?run+1:1;bestStreak=Math.max(bestStreak,run);previous=value;}
    return { ...this.data, level, progress: this.data.xp % 100, streak,bestStreak,shop, today,quests,wordsToday:words,totalWords:this.data.events.reduce((n,e)=>n+(e.words||0),0),dictations:this.data.events.filter(e=>e.type==='dictation').length,sessions:this.data.events.filter(e=>e.type==='conversation').length };
  }
  claimQuest(id){const quest=this.snapshot().quests.find(q=>q.id===id);if(!quest||quest.claimed||quest.value<quest.target)throw Error('Quest is not available.');this.data.questClaims.push(day(this.now())+':'+id);this.data.questClaims=this.data.questClaims.slice(-1000);this.data.embers+=quest.reward;this.data.xp+=10;this.persist();return this.snapshot();}
  claim(level) {
    if (!Number.isInteger(level) || level < 3 || level % 3 || level > this.snapshot().level || this.data.claimed.includes(level)) throw new Error('Chest is not available.');
    this.data.claimed.push(level); this.data.embers += 25; this.persist(); return this.snapshot();
  }
}
module.exports = { ActivityStore };

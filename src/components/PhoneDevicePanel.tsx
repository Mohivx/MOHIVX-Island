import {useEffect,useRef,useState} from 'react';
import {Smartphone,Mic,Camera,Monitor,Bell,MessageSquare,Phone,Image,Folder,RefreshCw,Battery,BatteryCharging,Wifi,ChevronRight,AppWindow,Search,Upload,Music2,Play,Pause,SkipBack,SkipForward} from 'lucide-react';
import {ipc,useSettings} from '../hooks/useSettings';
import './phone.css';
import './phone-media.css';

function normalizeClientPhone(raw:string){
 return String(raw||'').replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x0660)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x06f0)).replace(/[\s().\-\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
}
function formatCallDuration(seconds:number,ar:boolean){
 if(!seconds||seconds<=0)return ar?'٠ ث':'0s';
 const mins=Math.floor(seconds/60),secs=seconds%60;
 return mins>0?(ar?`${mins} د ${secs} ث`:`${mins}m ${secs}s`):(ar?`${secs} ث`:`${secs}s`);
}
function formatMediaTime(ms:number){const seconds=Math.max(0,Math.floor((Number(ms)||0)/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}

function friendlyPhoneError(error:unknown,ar:boolean){
 const raw=error instanceof Error?error.message:String(error??'');
 const message=raw.replace(/^Error invoking remote method '[^']+':\s*/i,'').replace(/^Error:\s*/i,'').trim();
 const known:[RegExp,string,string][]=[
  [/^Choose a shared folder in the phone app first\.?$/i,'Choose a shared folder in Phone on Android first.','اختر مجلدًا مشتركًا من تطبيق الهاتف على أندرويد أولًا.'],
  [/^Open the shared folder again\.?$/i,'Choose the shared folder again in Phone on Android.','اختر المجلد المشترك مرة أخرى من تطبيق الهاتف على أندرويد.'],
  [/^Open the phone app and enable background sync first\.?$/i,'Open Phone on Android and enable background sync.','افتح قسم الهاتف في أندرويد وفعّل المزامنة بالخلفية.'],
  [/^Enable background sync on the phone first\.?$/i,'Open Phone on Android and enable background sync.','افتح قسم الهاتف في أندرويد وفعّل المزامنة بالخلفية.'],
  [/^Enable this phone permission on the PC\.?$/i,'Enable this phone permission in MOHIVX Island settings.','فعّل صلاحية الهاتف المطلوبة من إعدادات MOHIVX Island.'],
  [/^Enable phone control on Android and keep screen sharing active\.?$/i,'Enable Phone control on Android and keep screen sharing active.','فعّل التحكم بالهاتف على أندرويد وأبقِ مشاركة الشاشة قيد التشغيل.'],
  [/^Choose an installed phone app\.?$/i,'Choose an installed app from the phone list.','اختر تطبيقًا مثبتًا من قائمة تطبيقات الهاتف.'],
  [/^Choose another phone app\.?$/i,'Choose a different app.','اختر تطبيقًا آخر.'],
  [/^Grant SMS read access on Android first\.?$/i,'Allow SMS access in Phone on Android first. Android may block restricted SMS permissions for a manually installed APK.','اسمح بصلاحية SMS من قسم الهاتف في أندرويد أولًا. قد يمنع أندرويد صلاحيات SMS المقيّدة في APK مثبّت يدويًا.'],
  [/^Grant SMS send access on Android first\.?$/i,'Allow SMS send access in Phone on Android first. Android may block restricted SMS permissions for a manually installed APK.','اسمح بصلاحية إرسال SMS من قسم الهاتف في أندرويد أولًا. قد يمنع أندرويد صلاحيات SMS المقيّدة في APK مثبّت يدويًا.'],
  [/^Choose a valid SMS conversation\.?$/i,'Choose a valid SMS conversation.','اختر محادثة SMS صالحة.'],
  [/^Invalid message page\.?$/i,'Refresh the SMS list and try again.','حدّث قائمة رسائل SMS وحاول مرة أخرى.'],
  [/^Enter a valid phone number(\.| and a message of 1–1600 characters\.?)?$/i,'Enter a valid phone number and an SMS message of 1–1600 characters.','أدخل رقم هاتف صالحًا ورسالة SMS بين ١ و١٦٠٠ حرف.'],
  [/^Enter a message of 1–1600 characters\.?$/i,'Enter an SMS message of 1–1600 characters.','أدخل رسالة SMS بين ١ و١٦٠٠ حرف.'],
  [/^Android could not submit this SMS\. Check the SIM and default subscription\.?$/i,'Android could not send this SMS. Check the SIM card and mobile network on your phone.','تعذر على أندرويد إرسال رسالة SMS. تحقق من الشريحة وشبكة الجوال على هاتفك.'],
  [/^Grant contacts access on Android first\.?$/i,'Allow contact names in Phone on Android first.','اسمح بصلاحية أسماء جهات الاتصال من قسم الهاتف في أندرويد أولًا.'],
  [/^Provide 1–60 valid phone numbers to resolve\.?$/i,'Provide valid phone numbers to look up contact names.','أدخل أرقام هواتف صالحة للبحث عن أسماء جهات الاتصال.'],
  [/^Grant call history access on Android first\.?$/i,'Allow call history in Phone on Android first. Android may block READ_CALL_LOG for a manually installed APK.','اسمح بصلاحية سجل المكالمات من قسم الهاتف في أندرويد أولًا. قد يمنع أندرويد صلاحية READ_CALL_LOG المقيّدة في APK مثبّت يدويًا.'],
  [/^Invalid call history page\.?$/i,'Refresh the call history list and try again.','حدّث قائمة سجل المكالمات وحاول مرة أخرى.'],
  [/^Enter a valid phone number to dial\.?$/i,'Enter a valid phone number to open in the phone dialer.','أدخل رقم هاتف صالحًا لفتحه في لوحة اتصال الهاتف.'],
  [/^No dialer app is available on this Android device\.?$/i,'No phone dialer app is available on this Android device.','لا يتوفر تطبيق اتصال على جهاز أندرويد هذا.'],
  [/^This phone notification no longer supports replies\.?$/i,'This phone notification is no longer available for quick reply.','لم يعد هذا الإشعار متاحًا للرد السريع.'],
  [/^This phone notification is no longer available\.?$/i,'This phone notification is no longer available for quick reply.','لم يعد هذا الإشعار متاحًا للرد السريع.'],
  [/^(Permission revoked|Phone permission revoked or request expired)\.?$/i,'This phone permission was turned off or the request expired.','تم إيقاف صلاحية الهاتف أو انتهت مهلة الطلب.'],
  [/^Wait for the current phone request\.?$/i,'The phone is handling another request. Try again shortly.','الهاتف ينفذ طلبًا آخر. حاول مجددًا بعد قليل.'],
  [/^Phone request timed out\.?$/i,'The phone didn’t respond. Check the connection and try again.','لم يستجب الهاتف. تحقق من الاتصال وحاول مرة أخرى.'],
  [/^Phone input timed out\.?$/i,'The phone didn’t respond to the control input. Try again.','لم يستجب الهاتف لأمر التحكم. حاول مرة أخرى.'],
  [/^Choose a smaller image\.?$/i,'Choose a smaller image and try again.','اختر صورة أصغر وحاول مرة أخرى.'],
  [/^Enable Send files to phone in connection permissions\.?$/i,'Enable Send files to phone in connection permissions.','فعّل «إرسال ملفات إلى الهاتف» من صلاحيات الاتصال.'],
  [/^Choose a writable shared folder in the Android Phone app first\.?$/i,'Choose the shared folder again in the Android Phone app and allow write access.','اختر المجلد المشترك مرة أخرى من تطبيق الهاتف واسمح بالكتابة.'],
  [/^Choose up to 20 files at a time\.?$/i,'Choose up to 20 files at a time.','اختر ٢٠ ملفًا كحد أقصى في المرة الواحدة.'],
  [/^Choose files up to 2 GB\.?$/i,'Choose files up to 2 GB.','اختر ملفات لا يتجاوز حجمها ٢ جيجابايت.'],
  [/^The phone did not confirm the file chunk\.?$/i,'The phone did not confirm a file chunk. Check the connection and try again.','لم يؤكد الهاتف استلام جزء من الملف. تحقق من الاتصال وحاول مجددًا.'],
  [/^Source file changed while sending\.?$/i,'The selected file changed while it was being sent. Choose it again and retry.','تغيّر الملف المحدد أثناء إرساله. اختره مرة أخرى وأعد المحاولة.'],
 ];
 const match=known.find(([pattern])=>pattern.test(message));
 return match?(ar?match[2]:match[1]):(ar?'تعذر تنفيذ طلب الهاتف. تحقق من الاتصال والصلاحيات وحاول مرة أخرى.':message||'Phone request failed. Check the connection and permissions, then try again.');
}

export function PhoneDashboard(){
 const {settings,update}=useSettings(),ar=settings.appLang==='ar',t=(en:string,a:string)=>ar?a:en;
 const [devices,setDevices]=useState<any[]>([]),[snapshot,setSnapshot]=useState<any>({}),[tab,setTab]=useState('notifications'),[uploadProgress,setUploadProgress]=useState<any>(null),[mediaSeek,setMediaSeek]=useState<number|null>(null);
 const [items,setItems]=useState<any[]>([]),[parent,setParent]=useState(''),[trail,setTrail]=useState<{id:string;name:string}[]>([]),[next,setNext]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[appQuery,setAppQuery]=useState(''),[replyDrafts,setReplyDrafts]=useState<Record<string,string>>({});
 const [threads,setThreads]=useState<any[]>([]),[threadsNext,setThreadsNext]=useState(0),[activeThread,setActiveThread]=useState<{threadId:string;address:string}|null>(null),[threadMessages,setThreadMessages]=useState<any[]>([]),[messagesNext,setMessagesNext]=useState(0),[smsAddress,setSmsAddress]=useState(''),[smsText,setSmsText]=useState('');
 const [calls,setCalls]=useState<any[]>([]),[callsNext,setCallsNext]=useState(0),[dialNumber,setDialNumber]=useState(''),[contactNames,setContactNames]=useState<Record<string,string>>({});
 const generation=useRef(0),threadsLoaded=useRef(false),callsLoaded=useRef(false),resolvedNumbersRef=useRef<Set<string>>(new Set());
 const device=devices.some(d=>d.id===settings.phoneSelectedDevice)?settings.phoneSelectedDevice:devices[0]?.id||'';
 const invoke=async(channel:string,value?:unknown)=>{if(!ipc)throw Error(t('Open MOHIVX Island on Windows.','افتح MOHIVX Island على ويندوز.'));const r=await ipc.invoke(channel,value);if(r?.success===false)throw Error(r.error||'Request failed');return r;};
 useEffect(()=>{let alive=true;const read=async()=>{try{const g=await invoke('android-status');if(alive)setDevices(g.devices||[]);}catch{}};void read();const timer=setInterval(read,3000);return()=>{alive=false;clearInterval(timer);};},[]);
 useEffect(()=>{const receive=(_:unknown,value:any)=>{if(value?.device===device)setUploadProgress(value);};ipc?.on('phone-file-upload-progress',receive);return()=>{ipc?.removeListener('phone-file-upload-progress',receive);setUploadProgress(null);};},[device]);
 useEffect(()=>{let alive=true;generation.current++;threadsLoaded.current=false;callsLoaded.current=false;resolvedNumbersRef.current.clear();setSnapshot({});setItems([]);setParent('');setTrail([]);setNext(0);setThreads([]);setThreadsNext(0);setActiveThread(null);setThreadMessages([]);setMessagesNext(0);setSmsAddress('');setSmsText('');setCalls([]);setCallsNext(0);setDialNumber('');setContactNames({});setMediaSeek(null);setMessage('');setBusy(false);const read=async()=>{try{const s=await invoke('phone-sync-status',device);if(alive)setSnapshot(s||{});}catch{}};if(device)void read();const timer=setInterval(read,1500);return()=>{alive=false;clearInterval(timer);};},[device]);
 const action=async(fn:()=>Promise<unknown>)=>{const version=generation.current;setBusy(true);setMessage('');try{await fn();}catch(e){if(version===generation.current)setMessage(friendlyPhoneError(e,ar));}finally{if(version===generation.current)setBusy(false);}};
 const command=(value:unknown)=>invoke('phone-command',{device,command:value});
 const load=async(kind:string,p='',offset=0,append=false)=>{const version=generation.current;const request=kind==='apps'?{type:'apps.list'}:{type:kind==='photos'?'photos.list':'files.list',parent:p,offset};const r=await command(request);if(version!==generation.current)return;setItems(old=>append?[...old,...(r.items||[])]:r.items||[]);setNext(r.next||0);setParent(p);};
 const loadThreads=async(offset=0,append=false)=>{const version=generation.current;const r=await command({type:'messages.threads',offset});if(version!==generation.current)return;threadsLoaded.current=true;setThreads(old=>append?[...old,...(r.items||[])]:r.items||[]);setThreadsNext(r.next||0);};
 const loadMessages=async(thread:{threadId:string;address:string},offset=0,append=false)=>{const version=generation.current;const r=await command({type:'messages.list',threadId:thread.threadId,offset});if(version!==generation.current)return;setActiveThread(thread);if(!append&&thread.address)setSmsAddress(thread.address);setThreadMessages(old=>append?[...(r.items||[]),...old]:r.items||[]);setMessagesNext(r.next||0);};
 const loadCalls=async(offset=0,append=false)=>{const version=generation.current;const r=await command({type:'calls.list',offset});if(version!==generation.current)return;callsLoaded.current=true;setCalls(old=>append?[...old,...(r.items||[])]:r.items||[]);setCallsNext(r.next||0);};
 const selected=devices.find(d=>d.id===device),status=snapshot.status||{},connected=Boolean(device&&Date.now()-(snapshot.at||0)<15000);
 const can=(cap:string)=>Boolean(selected?.capabilities?.includes(cap)),active=(kind:string)=>status.capture?.includes(kind);
 const canMessages=can('phoneMessages'),canReadSms=Boolean(connected&&canMessages&&status.messagesRead),canSendSms=Boolean(connected&&canMessages&&status.messagesSend);
 const canContacts=can('phoneContacts'),canResolveContacts=Boolean(connected&&canContacts&&status.contactsRead);
 const canCalls=can('phoneCalls'),canReadCalls=Boolean(connected&&canCalls&&status.callsRead),canDial=Boolean(connected&&canCalls);
 const media=status.media||{available:false},canMedia=can('phoneMedia'),mediaAvailable=Boolean(connected&&canMedia&&media.available);
 useEffect(()=>{
  if(!canReadSms){threadsLoaded.current=false;setThreads([]);setThreadsNext(0);setActiveThread(null);setThreadMessages([]);setMessagesNext(0);return;}
  if(tab!=='sms'){threadsLoaded.current=false;return;}
  if(!threadsLoaded.current){threadsLoaded.current=true;void action(()=>loadThreads(0,false));}
 },[tab,device,canReadSms]);
 useEffect(()=>{
  if(!canReadCalls){callsLoaded.current=false;setCalls([]);setCallsNext(0);return;}
  if(tab!=='calls'){callsLoaded.current=false;return;}
  if(!callsLoaded.current){callsLoaded.current=true;void action(()=>loadCalls(0,false));}
 },[tab,device,canReadCalls]);
 useEffect(()=>{
  if(!canResolveContacts){resolvedNumbersRef.current.clear();setContactNames({});return;}
  if(tab!=='calls'||!calls.length)return;
  const missing=[...new Set(calls.map((c:any)=>normalizeClientPhone(c.number)).filter(n=>/^\+?[0-9]{3,20}$/.test(n)&&!resolvedNumbersRef.current.has(n)))].slice(0,60);
  if(!missing.length)return;
  const version=generation.current;
  missing.forEach(n=>resolvedNumbersRef.current.add(n));
  void command({type:'contacts.resolve',numbers:missing}).then(r=>{
   if(version===generation.current&&r?.contacts&&typeof r.contacts==='object')setContactNames(old=>({...old,...r.contacts}));
  }).catch(()=>{missing.forEach(n=>resolvedNumbersRef.current.delete(n));});
 },[tab,device,canResolveContacts,calls]);
 const notices=snapshot.notifications||[];
 const BatteryIcon=status.charging?BatteryCharging:Battery;
 const connection=({wifi:'Wi-Fi',usb:'USB',bluetooth:'Bluetooth',cellular:t('Mobile data','بيانات الجوال'),ethernet:'Ethernet',offline:t('Offline','غير متصل')} as Record<string,string>)[status.connection]||t('Direct network','شبكة مباشرة');
 const phoneApps=items.filter((item:any)=>`${item.name||''} ${item.packageName||''}`.toLocaleLowerCase().includes(appQuery.trim().toLocaleLowerCase()));
 return <section className="phone-dashboard" dir={ar?'rtl':'ltr'}>
 <header><b><Smartphone size={18}/>{t('Phone','الهاتف')}</b><small>{devices.length>1?t(`${devices.length} paired phones`,`${devices.length} هواتف مقترنة`):t('Connected devices','الأجهزة المقترنة')}</small></header>
 {!selected?<div className="phone-pair-empty"><Smartphone size={36}/><h3>{t('Bring your phone closer','اربط هاتفك بالجزيرة')}</h3><p>{t('Open connection and permissions below to pair your phone.','افتح الاتصال والصلاحيات أدناه لربط الهاتف.')}</p></div>:<>
 {!status.wallpaper&&<p className="phone-notification-hint">{status.wallpaperSource==='permission-required'?t('Allow wallpaper access in the Android Phone page to show its current background here.','اسمح بقراءة الخلفية من قسم الهاتف في أندرويد لتظهر خلفيته الحالية هنا.'):status.wallpaperSource==='live'?t('This phone uses a live wallpaper. Choose a card picture in the Android Phone page.','الهاتف يستخدم خلفية متحركة. اختر صورة للبطاقة من قسم الهاتف في أندرويد.'):t('Current phone wallpaper sync is available in the updated Android app, under Phone.','مزامنة خلفية الهاتف الحالية متاحة في تطبيق أندرويد المحدّث، من قسم الهاتف.')}</p>}
 <div className="phone-device-hero">
  <div className="phone-device-poster" style={status.wallpaper?{backgroundImage:`url(${status.wallpaper})`}:undefined}><div className="phone-poster-island"/><Smartphone size={34}/></div>
  <div className="phone-device-info"><span className="phone-device-state" data-active={connected}><i/>{connected?t('Connected','متصل'):t('Disconnected','غير متصل')}</span><h2>{selected.name}</h2><p>{status.model||t('Android phone','هاتف أندرويد')}</p><div className="phone-device-facts"><span><BatteryIcon size={17}/>{Number.isInteger(status.battery)?`${status.battery}%`:'—'}{status.charging?' · '+t('Charging','يشحن'):''}</span><span><Wifi size={15}/>{connection}</span></div>{status.version&&<small>MOHIVX Island {status.version}</small>}</div>
 </div>
 <div className="phone-quick-actions">{([['mic',Mic,t('Microphone','المايك'),'phoneMic'],['camera',Camera,t('Camera','الكاميرا'),'phoneCamera'],['screen',Monitor,t('Phone screen','شاشة الهاتف'),'phoneScreen']] as const).map(([kind,Icon,label,cap])=><div key={kind}><button disabled={busy||!connected||!can(cap)} onClick={()=>void action(async()=>{const starting=!active(kind);const r=await command({type:starting?'capture.start':'capture.stop',kind});if(starting&&kind==='screen')await invoke('phone-viewer-open',{device,kind});if(r.needsTap)setMessage(t('Review the sharing request on your phone.','راجع طلب المشاركة على هاتفك.'));})}><Icon size={17}/>{active(kind)?t('Stop ','إيقاف '):t('Start ','تشغيل ')}{label}</button>{kind!=='mic'&&<button aria-label={label+' · '+t('Open window','فتح نافذة')} disabled={!can(cap)} onClick={()=>void action(()=>invoke('phone-viewer-open',{device,kind}))}><ChevronRight size={16}/></button>}</div>)}</div>
 <nav aria-label={t('Phone content','محتوى الهاتف')}>{([['notifications',Bell,t('Notifications','الإشعارات')],['media',Music2,t('Media','الوسائط')],['sms',MessageSquare,t('SMS','رسائل SMS')],['calls',Phone,t('Calls','المكالمات')],['apps',AppWindow,t('Apps','التطبيقات')],['photos',Image,t('Photos','الصور')],['files',Folder,t('Files','الملفات')]] as const).map(([id,Icon,label])=><button key={id} aria-pressed={tab===id} disabled={busy} onClick={()=>{generation.current++;setTab(id);setMessage('');setItems([]);setTrail([]);setParent('');setNext(0);if(id==='apps'||id==='photos'||id==='files')void action(()=>load(id));}}><Icon size={15}/>{label}</button>)}</nav>
 {tab!=='sms'&&tab!=='calls'&&tab!=='media'&&!can('phoneData')&&<p>{t('Enable Phone content in the connection permissions on your PC.','فعّل «محتوى الهاتف» في صلاحيات الاتصال على الكمبيوتر.')}</p>}
 {tab==='sms'&&!canMessages&&<p>{t('Enable SMS history and sending in the connection permissions on your PC.','فعّل «سجل رسائل SMS وإرسالها» في صلاحيات الاتصال على الكمبيوتر.')}</p>}
 {tab==='calls'&&!canCalls&&<p>{t('Enable Call history and dialer in the connection permissions on your PC.','فعّل «سجل المكالمات وفتح الاتصال» في صلاحيات الاتصال على الكمبيوتر.')}</p>}
 {!connected&&<p>{t('Open Phone on Android and enable background sync.','افتح قسم الهاتف في أندرويد وفعّل المزامنة بالخلفية.')}</p>}
 {tab==='media'?<>
 {!canMedia?<p className="phone-notification-hint">{t('Enable Phone media controls in this device’s connection permissions.','فعّل «التحكم بوسائط الهاتف» من صلاحيات اتصال هذا الجهاز.')}</p>:!status.notifications?<p className="phone-notification-hint">{t('Allow Notification Access for MOHIVX Island on Android so it can find active media sessions.','اسمح لتطبيق MOHIVX Island بالوصول إلى الإشعارات في أندرويد ليتمكن من اكتشاف مشغلات الوسائط.')}</p>:!mediaAvailable?<div className="phone-media-empty"><Music2 size={28}/><p>{t('Nothing is playing on the phone right now. Start audio or video, then this panel will show its controls.','لا يوجد صوت أو فيديو يعمل على الهاتف الآن. شغّل مقطعًا وسيظهر هنا مع أزرار التحكم.')}</p></div>:<div className="phone-media-card">
  <div className="phone-media-art"><Music2 size={24}/></div><div className="phone-media-meta"><small>{media.app||t('Phone media','وسائط الهاتف')}</small><b>{media.title||t('Unknown title','عنوان غير معروف')}</b><span>{[media.artist,media.album].filter(Boolean).join(' · ')||t('Now playing on your phone','يعمل الآن على هاتفك')}</span></div>
  <div className="phone-media-controls"><button aria-label={t('Previous','السابق')} disabled={busy||!connected||!media.canPrevious} onClick={()=>void action(()=>command({type:'media.control',action:'previous',packageName:media.packageName}))}><SkipBack size={18}/></button><button className="phone-media-toggle" aria-label={media.state==='playing'?t('Pause','إيقاف مؤقت'):t('Play','تشغيل')} disabled={busy||!connected||!(media.state==='playing'?media.canPause:media.canPlay)} onClick={()=>void action(()=>command({type:'media.control',action:media.state==='playing'?'pause':'play',packageName:media.packageName}))}>{media.state==='playing'?<Pause size={18}/>:<Play size={18}/>}</button><button aria-label={t('Next','التالي')} disabled={busy||!connected||!media.canNext} onClick={()=>void action(()=>command({type:'media.control',action:'next',packageName:media.packageName}))}><SkipForward size={18}/></button></div>
  <div className="phone-media-seek"><span>{formatMediaTime(mediaSeek??media.position)}</span><input aria-label={t('Playback position','موضع التشغيل')} type="range" min="0" max={Math.max(1,Number(media.duration)||1)} step="1000" value={Math.min(Number(mediaSeek??media.position)||0,Number(media.duration)||0)} disabled={busy||!connected||!media.canSeek||!media.duration} onChange={event=>setMediaSeek(Number(event.target.value))}/><span>{formatMediaTime(media.duration)}</span><button disabled={busy||!connected||!media.canSeek||mediaSeek===null} onClick={()=>void action(async()=>{await command({type:'media.control',action:'seek',packageName:media.packageName,position:Math.round(mediaSeek||0)});setMediaSeek(null);})}>{t('Seek','انتقال')}</button></div>
 </div>}
 </>:tab==='notifications'?<>
 <p className="phone-notification-hint">{status.notifications?t('New phone notifications also appear in the island with PC notifications.','تظهر إشعارات الجوال الجديدة في الجزيرة مع إشعارات الكمبيوتر.'):t('Allow notification access from Phone in the Android app.','اسمح بالوصول للإشعارات من قسم الهاتف في تطبيق أندرويد.')}{settings.islandNotificationsEnabled===false&&<button onClick={()=>void update({islandNotificationsEnabled:true})}>{t('Enable island notifications','تفعيل إشعارات الجزيرة')}</button>}</p>
 <div className="phone-notifications">{notices.map((n:any)=><article key={n.id}><small>{n.app} · {new Date(n.at).toLocaleTimeString(ar?'ar':'en',{hour:'2-digit',minute:'2-digit'})}</small><b>{n.title}</b><p>{n.text}</p>{n.replyAvailable&&<form className="phone-notification-reply" onSubmit={event=>{event.preventDefault();void action(async()=>{const text=(replyDrafts[n.id]||'').trim();if(!text)return;await command({type:'notifications.reply',notificationId:n.id,text});setReplyDrafts(old=>({...old,[n.id]:''}));setMessage(t('Reply handed to the phone app.','أُرسل الرد إلى تطبيق الهاتف.'));});}}><input aria-label={t('Quick reply','رد سريع')} value={replyDrafts[n.id]||''} onChange={event=>setReplyDrafts(old=>({...old,[n.id]:event.target.value}))} placeholder={t('Quick reply…','رد سريع…')} maxLength={1000} disabled={busy||!connected||!can('phoneData')}/><button type="submit" disabled={busy||!connected||!can('phoneData')||!(replyDrafts[n.id]||'').trim()}>{t('Send','إرسال')}</button></form>}</article>)}{!notices.length&&<p>{t('No shared notifications yet.','لا توجد إشعارات مشتركة حاليًا.')}</p>}</div>
 </>:tab==='sms'?<>
 <div className="phone-file-toolbar">
  <button disabled={busy||!canReadSms} onClick={()=>void action(()=>activeThread?loadMessages(activeThread,0,false):loadThreads(0,false))}><RefreshCw size={14}/>{t('Refresh','تحديث')}</button>
  {activeThread&&<button disabled={busy} onClick={()=>{setActiveThread(null);setThreadMessages([]);setMessagesNext(0);}}>{t('All conversations','كل المحادثات')}</button>}
  <span dir={activeThread?'ltr':undefined}>{activeThread?(activeThread.address||t('Unknown number','رقم غير معروف')):t('SMS conversations','محادثات SMS')}</span>
 </div>
 {(!status.messagesRead||!status.messagesSend)?<p className="phone-notification-hint">{!status.messagesRead&&!status.messagesSend?t('Allow SMS access in Phone on Android to read conversation history and send texts. Android marks READ_SMS and SEND_SMS as restricted permissions and may block them for a manually installed APK; notification quick replies in Notifications remain available.','اسمح بصلاحية SMS من قسم الهاتف في أندرويد لقراءة سجل المحادثات وإرسال الرسائل النصية. يصنّف أندرويد صلاحيتي READ_SMS وSEND_SMS كصلاحيات مقيّدة وقد يمنعهما في APK مثبّت يدويًا؛ ويظل الرد السريع متاحًا في قسم الإشعارات.'):status.messagesRead?t('SMS read access is active, but Android has not granted SEND_SMS. Conversation history works, while sending from the PC is unavailable until SMS send access is allowed on Android.','صلاحية قراءة SMS مفعلة، لكن أندرويد لم يمنح صلاحية الإرسال SEND_SMS. يعمل سجل المحادثات، بينما يتعذر الإرسال من الكمبيوتر حتى السماح بصلاحية الإرسال على أندرويد.'):t('SMS send access is active, but Android has not granted READ_SMS. Conversation history is unavailable until SMS read access is allowed on Android.','صلاحية إرسال SMS مفعلة، لكن أندرويد لم يمنح صلاحية القراءة READ_SMS. سجل المحادثات غير متاح حتى السماح بصلاحية القراءة على أندرويد.')}</p>:<p className="phone-notification-hint">{t('Text SMS only (no MMS or calls). Messages are sent through your phone SIM without changing your default SMS app.','رسائل SMS النصية فقط (دون MMS أو المكالمات). تُرسل الرسائل عبر شريحة هاتفك دون تغيير تطبيق الرسائل الافتراضي.')}</p>}
 {canReadSms&&(activeThread?<>
  {messagesNext>0&&<button disabled={busy} onClick={()=>void action(()=>loadMessages(activeThread,messagesNext,true))}>{t('Load older messages','عرض الرسائل الأقدم')}</button>}
  <div className="phone-sms-messages">{threadMessages.map((m:any)=><article key={m.id} className="phone-sms-bubble" data-direction={m.direction}><small>{m.direction==='outgoing'?t('Sent','مُرسلة'):(m.address||activeThread.address)} · {new Date(m.date).toLocaleTimeString(ar?'ar':'en',{hour:'2-digit',minute:'2-digit'})}</small><p>{m.text}</p></article>)}{!busy&&!threadMessages.length&&<p>{t('No SMS messages in this conversation.','لا توجد رسائل SMS في هذه المحادثة.')}</p>}</div>
 </>:<>
  <div className="phone-sms-threads">{threads.map((thread:any)=><button key={thread.threadId} className="phone-sms-thread" data-unread={thread.unread} disabled={busy} onClick={()=>void action(()=>loadMessages({threadId:thread.threadId,address:thread.address}))}><div><b dir="ltr">{thread.address||t('Unknown number','رقم غير معروف')}</b><small>{thread.unread?t('Unread · ','غير مقروءة · '):''}{new Date(thread.date).toLocaleTimeString(ar?'ar':'en',{hour:'2-digit',minute:'2-digit'})}</small></div><p>{thread.preview}</p></button>)}{!busy&&!threads.length&&<p>{t('No SMS conversations found on the phone.','لا توجد محادثات SMS على الهاتف.')}</p>}</div>
  {threadsNext>0&&<button disabled={busy} onClick={()=>void action(()=>loadThreads(threadsNext,true))}>{t('Load more','عرض المزيد')}</button>}
 </>)}
 <form className="phone-sms-compose" onSubmit={event=>{event.preventDefault();void action(async()=>{const address=smsAddress.trim(),text=smsText.trim();if(!address||!text)return;await command({type:'messages.send',address,text});setSmsText('');setMessage(t('SMS handed to your phone for sending.','أُرسلت رسالة SMS إلى هاتفك لإرسالها.'));if(canReadSms){try{if(activeThread)await loadMessages(activeThread,0,false);else await loadThreads(0,false);}catch{}}});}}>
  <input aria-label={t('Recipient phone number','رقم المستلم')} dir="ltr" value={smsAddress} onChange={event=>setSmsAddress(event.target.value)} placeholder={t('Phone number (+15550100)','رقم الهاتف (+9665...)')} maxLength={32} disabled={busy||!canSendSms}/>
  <input aria-label={t('SMS message','رسالة SMS')} value={smsText} onChange={event=>setSmsText(event.target.value)} placeholder={t('Write an SMS message…','اكتب رسالة SMS…')} maxLength={1600} disabled={busy||!canSendSms}/>
  <button type="submit" disabled={busy||!canSendSms||!smsAddress.trim()||!smsText.trim()}>{t('Send SMS','إرسال SMS')}</button>
 </form>
 </>:tab==='calls'?<>
 <div className="phone-file-toolbar">
  <button disabled={busy||!canReadCalls} onClick={()=>{resolvedNumbersRef.current.clear();void action(()=>loadCalls(0,false));}}><RefreshCw size={14}/>{t('Refresh','تحديث')}</button>
  <span>{t('Call history','سجل المكالمات')}</span>
 </div>
 {!status.callsRead?<p className="phone-notification-hint">{t('Allow call history in Phone on Android to view recent calls. Android marks READ_CALL_LOG as a restricted permission and may block it for a manually installed APK; opening numbers in the phone dialer below remains available.','اسمح بصلاحية سجل المكالمات من قسم الهاتف في أندرويد لعرض المكالمات الأخيرة. يصنّف أندرويد صلاحية READ_CALL_LOG كصلاحية مقيّدة وقد يمنعها في APK مثبّت يدويًا؛ ويظل فتح الأرقام في لوحة اتصال الهاتف متاحًا أدناه.')}</p>:<p className="phone-notification-hint">{t('Dialing uses Android ACTION_DIAL to open the number in your phone dialer so you confirm the call on Android. MOHIVX does not become your default dialer and does not answer or reject calls.','يفتح الاتصال الرقم في لوحة اتصال أندرويد عبر ACTION_DIAL لتأكيد المكالمة من هاتفك. لا يصبح MOHIVX تطبيق الهاتف الافتراضي ولا يرد على المكالمات أو يرفضها.')}</p>}
 <p className="phone-notification-hint">{!canContacts?t('Contact name resolution is off on the PC. Enable Contact names in connection permissions to show saved names for call numbers.','إظهار أسماء جهات الاتصال متوقف على الكمبيوتر. فعّل «أسماء جهات الاتصال» في صلاحيات الاتصال لعرض الأسماء المحفوظة لأرقام المكالمات.'):!status.contactsRead?t('Allow contact names in Phone on Android to resolve call numbers to saved contact names.','اسمح بصلاحية أسماء جهات الاتصال من قسم الهاتف في أندرويد لإظهار الأسماء المحفوظة لأرقام المكالمات.'):t('Contact name resolution is active for call numbers.','إظهار أسماء جهات الاتصال مفعل لأرقام المكالمات.')}</p>
 {canReadCalls&&<>
  <div className="phone-call-list">{calls.map((call:any)=>{
   const norm=normalizeClientPhone(call.number);
   const contactName=canResolveContacts?(contactNames[norm]||contactNames[call.number]||''):'';
   const typeLabel=call.type==='outgoing'?t('Outgoing','صادرة'):call.type==='missed'?t('Missed','فائتة'):call.type==='rejected'?t('Declined','مرفوضة'):t('Incoming','واردة');
   return <article key={call.id} className="phone-call-item" data-call-type={call.type}>
    <div>
     {contactName&&<b>{contactName}</b>}
     <span dir="ltr">{call.number||t('Unknown number','رقم غير معروف')}</span>
     <small>{typeLabel} · {formatCallDuration(call.duration,ar)} · {new Date(call.date).toLocaleTimeString(ar?'ar':'en',{hour:'2-digit',minute:'2-digit'})}</small>
    </div>
    {call.number&&<button type="button" disabled={busy||!canDial} onClick={()=>{setDialNumber(call.number);void action(async()=>{const r=await command({type:'calls.dial',number:call.number});setMessage(r.needsTap?t('Dial request sent to your phone. Tap the notification on Android to open the dialer and confirm the call.','أُرسل طلب الاتصال إلى هاتفك. اضغط الإشعار على أندرويد لفتح لوحة الاتصال وتأكيد المكالمة.'):t('Number opened in your phone dialer. Confirm the call on Android.','فُتح الرقم في لوحة اتصال الهاتف. أكّد المكالمة من أندرويد.'));});}}>{t('Open in dialer','فتح في الهاتف')}</button>}
   </article>;
  })}{!busy&&!calls.length&&<p>{t('No call history found on the phone.','لا يوجد سجل مكالمات على الهاتف.')}</p>}</div>
  {callsNext>0&&<button disabled={busy} onClick={()=>void action(()=>loadCalls(callsNext,true))}>{t('Load more','عرض المزيد')}</button>}
 </>}
 <form className="phone-call-dial" onSubmit={event=>{event.preventDefault();void action(async()=>{const number=dialNumber.trim();if(!number)return;const r=await command({type:'calls.dial',number});setMessage(r.needsTap?t('Dial request sent to your phone. Tap the notification on Android to open the dialer and confirm the call.','أُرسل طلب الاتصال إلى هاتفك. اضغط الإشعار على أندرويد لفتح لوحة الاتصال وتأكيد المكالمة.'):t('Number opened in your phone dialer. Confirm the call on Android.','فُتح الرقم في لوحة اتصال الهاتف. أكّد المكالمة من أندرويد.'));});}}>
  <input aria-label={t('Phone number to dial','رقم الهاتف للاتصال')} dir="ltr" value={dialNumber} onChange={event=>setDialNumber(event.target.value)} placeholder={t('Phone number (+15550100)','رقم الهاتف (+9665...)')} maxLength={32} disabled={busy||!canDial}/>
  <button type="submit" disabled={busy||!canDial||!dialNumber.trim()}>{t('Open in phone dialer','فتح في لوحة اتصال الهاتف')}</button>
 </form>
 </>:tab==='apps'?<><div className="phone-app-toolbar"><label><Search size={15}/><input type="search" value={appQuery} onChange={e=>setAppQuery(e.target.value)} placeholder={t('Search phone apps','ابحث في تطبيقات الهاتف')}/></label><button disabled={busy||!connected||!can('phoneData')} onClick={()=>void action(()=>load('apps'))}><RefreshCw size={14}/>{t('Refresh','تحديث')}</button></div><p className="phone-notification-hint">{t('Opening an app requires Phone control. If MOHIVX is closed on the phone, tap its open request there.','يتطلب فتح التطبيق صلاحية التحكم بالهاتف. إذا كان MOHIVX مغلقًا على الهاتف، اضغط طلب الفتح الذي يصلك عليه.')}{!can('phoneControl')&&<span> {t('Enable Phone control in connection permissions.','فعّل «التحكم بالهاتف» في صلاحيات الاتصال.')}</span>}</p><div className="phone-app-grid">{phoneApps.map((item:any)=><button key={item.packageName} disabled={busy||!connected||!can('phoneControl')} onClick={()=>void action(async()=>{const r=await command({type:'apps.launch',packageName:item.packageName});setMessage(r.needsTap?t('Open request sent to your phone. Tap it to continue.','أُرسل طلب الفتح إلى هاتفك. اضغط عليه للمتابعة.'):t('App opened on your phone.','فُتح التطبيق على هاتفك.'));})}><AppWindow size={19}/><span>{item.name}</span><small>{item.packageName}</small></button>)}{!busy&&!phoneApps.length&&<p>{items.length?t('No apps match this search.','لا توجد تطبيقات تطابق البحث.'):t('No launchable apps found.','لم يتم العثور على تطبيقات قابلة للفتح.')}</p>}</div></>:<><div className="phone-file-toolbar"><button disabled={busy||!connected||!can('phoneData')} onClick={()=>void action(()=>load(tab,parent))}><RefreshCw size={14}/>{t('Refresh','تحديث')}</button>{tab==='files'&&<button disabled={busy||!connected||!can('phoneFilesWrite')||!status.folderWritable} onClick={()=>void action(async()=>{try{const result=await invoke('phone-file-upload',{device,parent});if(result?.canceled)return;setMessage(t('Files sent to the phone.','تم إرسال الملفات إلى الهاتف.'));}finally{setUploadProgress(null);}})}><Upload size={14}/>{t('Send files to phone','إرسال ملفات إلى الهاتف')}</button>}{trail.length>0&&<button disabled={busy} onClick={()=>{const copy=trail.slice(0,-1);setTrail(copy);void action(()=>load(tab,copy.at(-1)?.id||''));}}>{t('Back','رجوع')}</button>}<span>{trail.at(-1)?.name||t(tab==='photos'?'Photos':'Shared folder',tab==='photos'?'الصور':'المجلد المشترك')}</span></div>
 {tab==='files'&&can('phoneFilesWrite')&&!status.folderWritable&&<p className="phone-notification-hint">{t('Choose the shared folder again in the Android Phone app and grant write access to send files.','اختر المجلد المشترك مرة أخرى من تطبيق الهاتف واسمح بالكتابة حتى تتمكن من إرسال الملفات.')}</p>}
 {tab==='files'&&!can('phoneFilesWrite')&&<p className="phone-notification-hint">{t('Enable Send files to phone in connection permissions to upload files.','فعّل «إرسال ملفات إلى الهاتف» من صلاحيات الاتصال لإرسال الملفات.')}</p>}
 <div className={tab==='photos'?'phone-photo-grid':'phone-files'}>{items.map(item=><button key={item.id} disabled={busy} onClick={()=>void action(async()=>{if(item.directory){setTrail(old=>[...old,{id:item.id,name:item.name}]);await load(tab,item.id);}else await invoke('phone-file-save',{device,id:item.id,name:item.name,size:item.size});})}>{item.thumbnail?<img src={item.thumbnail} alt=""/>:<Folder size={22}/>}<span>{item.name}</span>{!item.directory&&<small>{Math.ceil((item.size||0)/1024)} KB</small>}</button>)}</div>{next>0&&<button disabled={busy} onClick={()=>void action(()=>load(tab,parent,next,true))}>{t('Load more','عرض المزيد')}</button>}</>}
 </>}{uploadProgress&&<p role="status">{t('Sending','جارٍ الإرسال')}: {uploadProgress.file} · {uploadProgress.total?Math.round(uploadProgress.sent/uploadProgress.total*100):100}%</p>}{busy&&!uploadProgress&&<p role="status">{t('Waiting for phone…','بانتظار الهاتف…')}</p>}{message&&<p role="status" className="phone-sync-message">{message}</p>}
 </section>;
}

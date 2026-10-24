import {useSettings} from '../hooks/useSettings';
import {AgentPanel} from './AgentPanel';
export function AgentPage(){
 const {settings:s,update}=useSettings(),ar=s.appLang==='ar',t=(en:string,a:string)=>ar?a:en;
 const controls=[['agentBridgeEnabled','Follow agent sessions','متابعة جلسات الوكلاء'],['agentShowRequests','Show permission requests on the island','إظهار طلبات الموافقة في الجزيرة'],['agentNotifyOnComplete','Notify when work completes','إشعار عند اكتمال المهمة'],['agentNotifyOnError','Notify when an agent needs attention','إشعار عند تعثر الوكيل'],['agentSyncToAndroid','Share agent activity with paired phones','مشاركة حالة الوكلاء مع الهواتف المرتبطة']] as const;
 return <><h1>{t('Agents','الوكلاء')}</h1><p className="page-caption">{t('Follow the work, review requests, and manage connections.','تابع العمل وراجع الطلبات وأدر الاتصالات.')}</p>
  <details className="agent-preferences"><summary>{t('Agent settings and controls','إعدادات الوكلاء والتحكم')}</summary>{controls.map(([key,en,a])=><label className="setting-row" key={key}><span>{t(en,a)}</span><input type="checkbox" checked={s[key]!==false} onChange={e=>void update({[key]:e.target.checked})}/></label>)}</details>
  {s.agentBridgeEnabled===false&&<p className="page-caption">{t('Monitoring is paused. Requests remain in your original agent.','المتابعة متوقفة. تُراجع الطلبات في الوكيل الأصلي.')}</p>}
  <AgentPanel ar={ar} configure/>
 </>;
}

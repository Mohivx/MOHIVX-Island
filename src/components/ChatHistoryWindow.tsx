import {ChatPage,useCompanionData} from './CompanionPages';
import {WindowControls} from './WindowControls';
import {themeAccent} from '../themes';
import {ipc,useSettings} from '../hooks/useSettings';
export function ChatHistoryWindow(){const {settings:s}=useSettings(),ar=s.appLang==='ar',data=useCompanionData();return <div className="history-window" style={{'--app-accent':themeAccent(s)} as React.CSSProperties} dir={ar?'rtl':'ltr'}><header className="phone-viewer-titlebar" onDoubleClick={()=>void ipc?.invoke('desktop-window-action','maximize')}><b>{ar?'سجل المحادثة':'Chat history'}</b><WindowControls ar={ar}/></header><main className="reference-page"><h1>{ar?'محادثاتك':'Your conversations'}</h1>{data.workspace?<ChatPage workspace={data.workspace} ar={ar} call={data.call}/>:<p>{ar?'جارٍ التحميل…':'Loading…'}</p>}{data.error&&<p role="alert">{data.error}</p>}</main></div>;}

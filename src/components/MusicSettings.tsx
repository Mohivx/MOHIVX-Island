import type {MohivxSettings} from '../types/settings';
import './music.css';
const themes=[
  {id:'player',en:'Player',ar:'مشغّل',detailEn:'Cover and track details',detailAr:'الغلاف واسم المقطع'},
  {id:'edge-bars',en:'Lines from the edge',ar:'خطوط من الحافة',detailEn:'Sound rises out of the island',detailAr:'خطوط الصوت تطلع من الجزيرة'},
  {id:'classic',en:'Previous look',ar:'الشكل السابق',detailEn:'Mini player with outward lines',detailAr:'المشغّل السابق مع الخطوط الخارجية'},
  {id:'split',en:'Separate bubble',ar:'فقاعة منفصلة',detailEn:'Cover beside the island',detailAr:'الغلاف في فقاعة بجانب الجزيرة'},
  {id:'off',en:'Off',ar:'إيقاف',detailEn:'Keep the normal island',detailAr:'تبقى الجزيرة بشكلها العادي'},
] as const;
export function MusicSettings({settings:s,save,ar}:{settings:MohivxSettings;save:(value:Partial<MohivxSettings>)=>unknown;ar:boolean}){
 return <section className="music-settings settings-card" aria-label={ar?'الموسيقى في الجزيرة':'Music in the island'}>
  <h3>{ar?'الموسيقى في الجزيرة':'Music in the island'}</h3>
  <div className="music-sizing"><div><strong>{ar?'حجم الجزيرة مع الموسيقى':'Island size during music'}</strong><p>{ar?'اختر الحجم وشكل التأثير كل واحد لحاله.':'Choose the size and appearance independently.'}</p></div><div className="music-size-options" role="group" aria-label={ar?'حجم الجزيرة مع الموسيقى':'Island size during music'}>{(['expand','fixed'] as const).map(id=><button type="button" key={id} aria-pressed={s.musicSizing===id} onClick={()=>save({musicSizing:id})}>{id==='expand'?(ar?'تكبر مع التشغيل':'Expand when playing'):(ar?'تبقى بحجمها':'Keep its size')}</button>)}</div></div>
  <div className="music-theme-grid" role="group" aria-label={ar?'شكل الموسيقى':'Music appearance'}>{themes.map(theme=><button type="button" key={theme.id} className="music-theme-option" aria-pressed={s.musicTheme===theme.id} onClick={()=>save({musicTheme:theme.id})}><span className="music-theme-preview" data-preview-theme={theme.id} data-preview-size={s.musicSizing} aria-hidden="true"><i className="preview-island"><i/><i/></i><i className="preview-music-lines">{Array.from({length:13},(_,i)=><i key={i} style={{height:4+(6-Math.abs(i-6))*2}}/>)}</i><i className="preview-bubble">♪</i></span><strong>{ar?theme.ar:theme.en}</strong><small>{ar?theme.detailAr:theme.detailEn}</small></button>)}</div>
 </section>;
}

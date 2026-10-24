export interface IslandNotice{id:string;source:string;app:string;title:string;body:string;time:number|string;received?:number;_elapsedVisible?:number;_remainingBudget?:number;}
export interface IslandNoticeQueueOptions{now?:()=>number;setTimer?:typeof setTimeout;clearTimer?:typeof clearTimeout;durationMs?:number;}
export class IslandNoticeQueue{
  constructor(onChange?:(notice:IslandNotice|null)=>void,options?:IslandNoticeQueueOptions);
  current:IslandNotice|null;
  durationMs:number;
  setDuration(durationMs:number):void;
  enqueue(notice:IslandNotice):void;
  dismiss():void;
  pause(value:boolean):void;
  setBlocked(value:boolean):void;
  clear():void;
}

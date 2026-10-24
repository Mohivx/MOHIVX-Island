export class WallpaperQueue {
  constructor(apply:(item:any)=>Promise<any>,feedback:{busy:(value:boolean)=>void;success:(item:any,result:any)=>void;error:(error:Error)=>void});
  feedback:{busy:(value:boolean)=>void;success:(item:any,result:any)=>void;error:(error:Error)=>void};
  disposed:boolean;
  request(item:any):Promise<void>;
  dispose():void;
}

// Keep navigation responsive while Windows finishes a previous wallpaper change.
// Intermediate targets are coalesced; the most recently selected image always wins.
export class WallpaperQueue {
  constructor(apply,feedback){this.apply=apply;this.feedback=feedback;this.pending=null;this.running=false;this.disposed=false;}
  request(item){this.pending=item;return this.flush();}
  async flush(){
    if(this.running||this.disposed)return;
    this.running=true;this.feedback.busy(true);
    try{while(this.pending&&!this.disposed){const item=this.pending;this.pending=null;
      try{const result=await this.apply(item);if(!result?.success)throw new Error(result?.error||'Wallpaper change failed.');if(!this.disposed)this.feedback.success(item,result);}
      catch(error){if(!this.disposed)this.feedback.error(error);}
    }}finally{this.running=false;if(!this.disposed)this.feedback.busy(false);}
  }
  dispose(){this.pending=null;this.disposed=true;}
}

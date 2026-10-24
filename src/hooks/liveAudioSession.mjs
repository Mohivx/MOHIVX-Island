export class LiveAudioSession {
 constructor({getMedia,connect,sendAudio,stopRemote,createInput,playAudio,onState=()=>{}}){Object.assign(this,{getMedia,connect,sendAudio,stopRemote,createInput,playAudio,onState});this.generation=0;this.media=null;this.input=null;this.active=false;this.starting=false;}
 async start(){if(this.active||this.starting)return;const run=++this.generation;this.starting=true;this.onState('connecting');let media;
  try{media=await this.getMedia();if(run!==this.generation){media.getTracks().forEach(t=>t.stop());return;}this.media=media;await this.connect();if(run!==this.generation){await this.stopRemote();return;}const input=await this.createInput(media,chunk=>{if(this.active&&run===this.generation)this.sendAudio(chunk);});if(run!==this.generation){input.close();return;}this.input=input;this.active=true;this.starting=false;this.onState('listening');}
  catch(error){media?.getTracks().forEach(t=>t.stop());if(run===this.generation){await this.stop();throw error;}}
 }
 async stop(){const run=++this.generation;this.active=false;this.starting=false;this.input?.close();this.input=null;this.media?.getTracks().forEach(t=>t.stop());this.media=null;await this.stopRemote();if(run===this.generation)this.onState('stopped');}
}

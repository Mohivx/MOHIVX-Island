const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
class WallpaperCatalog{
  constructor(nativeImage,options={}){this.image=nativeImage;this.cache=new Map();this.preparedDir=options.preparedDir;}
  async item(file){
    try{
      const stat=await fs.promises.stat(file);if(!stat.isFile()||!stat.size||stat.size>30*1024*1024)return null;
      const key=path.resolve(file),stamp=stat.size+':'+stat.mtimeMs,cached=this.cache.get(key);if(cached?.stamp===stamp)return cached.value;
      const bytes=await fs.promises.readFile(file),hash=crypto.createHash('sha256').update(bytes).digest('hex');
      const image=this.image.createFromBuffer(bytes);if(image.isEmpty())return null;
      const size=image.getSize(),ratio=Math.min(1,480/size.width,300/size.height);
      const thumb=image.resize({width:Math.max(1,Math.round(size.width*ratio)),height:Math.max(1,Math.round(size.height*ratio)),quality:'good'});
      let filePath=file;
      const webp=bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
      if(webp&&this.preparedDir){const dir=typeof this.preparedDir==='function'?this.preparedDir():this.preparedDir;await fs.promises.mkdir(dir,{recursive:true});filePath=path.join(dir,hash+'.png');if(!fs.existsSync(filePath)){const temporary=filePath+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';try{await fs.promises.writeFile(temporary,image.toPNG());await fs.promises.rename(temporary,filePath);}finally{await fs.promises.unlink(temporary).catch(()=>{});}}}
      const value={id:'wp-'+hash.slice(0,24),name:path.parse(file).name.replace(/_/g,' '),filePath,sourcePath:file,url:'data:image/jpeg;base64,'+thumb.toJPEG(80).toString('base64'),hash};
      if(this.cache.size>=512)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,{stamp,value});return value;
    }catch{return null;}
  }
  async list(directories){
    const result=[],seen=new Set();
    for(const dir of directories.filter(Boolean)){
      let names;try{names=await fs.promises.readdir(dir);}catch{continue;}
      names.sort((a,b)=>Number(/^wp\d+\./i.test(a))-Number(/^wp\d+\./i.test(b))||a.localeCompare(b));
      for(const name of names){if(!/\.(png|jpe?g|webp|bmp)$/i.test(name))continue;const item=await this.item(path.join(dir,name));if(item&&!seen.has(item.hash)){seen.add(item.hash);const {hash,...publicItem}=item;result.push(publicItem);}if(result.length>=500)return result;}
    }return result;
  }
}
module.exports=WallpaperCatalog;

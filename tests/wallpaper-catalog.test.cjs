const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Catalog=require('../electron/services/wallpaperCatalog.cjs');
test('wallpaper previews use actual bytes, survive special paths, remove aliases and skip unreadable images',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-images-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let decodes=0;
 const image={createFromBuffer:bytes=>{decodes++;return {isEmpty:()=>bytes[0]===0,getSize:()=>({width:1920,height:1080}),resize:()=>({toJPEG:()=>bytes})};}};
 fs.writeFileSync(path.join(dir,'السماء # &.jpg'),'valid image');fs.writeFileSync(path.join(dir,'wp1.jpg'),'valid image');fs.writeFileSync(path.join(dir,'broken.png'),Buffer.from([0]));fs.mkdirSync(path.join(dir,'folder.jpg'));
 const catalog=new Catalog(image),items=await catalog.list([dir]);assert.equal(items.length,1);assert.ok(items[0].name.includes('# &'));assert.equal(items[0].url,'data:image/jpeg;base64,'+Buffer.from('valid image').toString('base64'));assert.ok(items[0].id.startsWith('wp-'));
 const before=decodes;await catalog.list([dir]);assert.equal(decodes,before+1,'only the invalid image is re-read');
 fs.writeFileSync(items[0].filePath,'different image');const changed=await catalog.list([dir]);assert.equal(changed.length,2);assert.notEqual(changed[0].url,items[0].url);
});
test('WebP previews keep the original source and prepare an actual PNG for Windows wallpaper APIs',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-webp-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const source=path.join(dir,'wallpaper.jpg'),prepared=path.join(dir,'prepared'),png=Buffer.from('prepared PNG bytes');fs.writeFileSync(source,Buffer.from('RIFF0000WEBPpayload'));
 const image={createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:1280,height:720}),toPNG:()=>png,resize:()=>({toJPEG:()=>Buffer.from('preview')})})};const catalog=new Catalog(image,{preparedDir:prepared}),item=await catalog.item(source);
 assert.equal(item.sourcePath,source);assert.equal(path.extname(item.filePath),'.png');assert.deepEqual(fs.readFileSync(item.filePath),png);assert.equal((await catalog.item(source)).filePath,item.filePath);assert.equal(fs.readdirSync(prepared).length,1);
});

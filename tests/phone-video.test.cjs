const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process'),{EventEmitter}=require('node:events');
const {createPhoneViewer}=require('../electron/services/phoneViewer.cjs');
test('actual Android plane and orientation utility handles padded rows, rotations and front-camera mirroring',t=>{
 const jdk=process.env.JAVA_HOME||'C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot',dir=fs.mkdtempSync(path.join(os.tmpdir(),'mohivx-pixels-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 execFileSync(path.join(jdk,'bin','javac'),['-encoding','UTF-8','-d',dir,path.join(__dirname,'../android/app/src/main/java/com/mohivx/island/companion/FramePixels.java'),path.join(__dirname,'fixtures/FramePixelsHarness.java')],{windowsHide:true,timeout:20000});
 const result=execFileSync(path.join(jdk,'bin','java'),['-cp',dir,'FramePixelsHarness'],{windowsHide:true,timeout:10000,encoding:'utf8'});assert.match(result,/accepted/);
});
test('phone viewer opens a resizable independent window, reuses it and stays within an offset small display',()=>{
 const created=[];
 class Window extends EventEmitter{constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{};created.push(this);}setTitle(){}loadFile(file,options){this.load={file,options};}isDestroyed(){return false;}isMinimized(){return true;}restore(){this.restored=true;}show(){this.shown=true;}focus(){this.focused=true;}destroy(){this.emit('closed');}}
 const service=createPhoneViewer({BrowserWindow:Window,screen:{getCursorScreenPoint:()=>({x:0,y:0}),getDisplayNearestPoint:()=>({workArea:{x:-800,y:20,width:800,height:500}})},root:__dirname});
 const screen=service.open('phone','screen');assert.equal(screen.options.transparent,false);assert.equal(screen.options.resizable,true);assert.equal(screen.options.maximizable,true);assert.equal(screen.options.minimizable,true);assert.ok(screen.options.y>=20&&screen.options.y+screen.options.height<=520);assert.ok(screen.options.x>=-800&&screen.options.x+screen.options.width<=0);assert.equal(screen.load.options.query.view,'phone-viewer');
 assert.equal(service.open('phone','screen'),screen);assert.equal(created.length,1);assert.equal(screen.restored,true);assert.equal(screen.focused,true);assert.equal(service.managed(screen),true);assert.throws(()=>service.open('phone','arbitrary-file'));
 service.open('phone','camera');assert.equal(created.length,2);service.stop();assert.equal(service.windows.size,0);
});

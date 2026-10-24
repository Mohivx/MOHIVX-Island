const path = require('node:path');
const normalize = value => path.win32.normalize(String(value || '')).toLowerCase();
function createWallpaperService({ resolvePath, script, execFile, native, animate=()=>true, onChanged = () => {} }) {
  let queue = Promise.resolve();
  function apply(input) {
    const run = queue.then(async () => {
      const file = await resolvePath(input);
      if (!file) return { success: false, error: 'Wallpaper file not found' };
      if(native){
        try{const result=await native.request('apply',{path:file,animate:animate()});if(result.success!==true||normalize(result.path)!==normalize(file))return {success:false,error:result.error||'Windows wallpaper verification failed.'};onChanged(result.path);return {success:true,path:result.path,animated:result.animated===true};}
        catch{return {success:false,error:'Native wallpaper service unavailable. Please restart MOHIVX.'};}
      }
      return new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ImagePath', file], { windowsHide: true, encoding: 'utf8', timeout: 30000 }, (error, stdout) => {
        if (error) return resolve({ success: false, error: 'Windows could not apply the wallpaper.' });
        try {
          const result = JSON.parse(stdout.trim());
          if (result.success !== true || normalize(result.path) !== normalize(file)) return resolve({ success: false, error: result.error || 'Windows wallpaper verification failed.' });
          onChanged(result.path); resolve({ success: true, path: result.path });
        } catch { resolve({ success: false, error: 'Invalid wallpaper verification response.' }); }
      }));
    });
    queue = run.catch(() => {}); return run;
  }
  return { apply };
}
module.exports = { createWallpaperService };

const fs=require('node:fs'),path=require('node:path');
const files=['settings.json','config.json','workspace.json','activity.json','clipboard_history.json','scheduled_actions.json','paired-devices.json','companion-tls.json','debug.log'];
function erasePersonalData(root){const absolute=path.resolve(root);if(!path.isAbsolute(root)||absolute===path.parse(absolute).root)throw Error('Invalid app data directory.');for(const name of files){const target=path.join(absolute,name);if(fs.existsSync(target)&&!fs.lstatSync(target).isFile())throw Error('Unexpected app data entry.');}for(const name of files)fs.rmSync(path.join(absolute,name),{force:true});return {success:true,removed:files.length};}
module.exports={erasePersonalData};

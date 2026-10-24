const CIRCLE_SHORTCUT='Alt+Shift+S';
function normalized(shortcut){return String(shortcut).toLowerCase().split('+').map(k=>({ctrl:'control',esc:'escape',option:'alt',commandorcontrol:'control',cmdorctrl:'control'})[k.trim()]||k.trim()).sort().join('+');}
function reserved(shortcut){return ['control+escape+shift','alt+control+delete'].includes(normalized(shortcut));}
function migrate(shortcuts){const result={...shortcuts};if(normalized(result['trigger-lasso'])==='alt+s'||reserved(result['trigger-lasso']))result['trigger-lasso']=CIRCLE_SHORTCUT;for(const key of Object.keys(result))if(reserved(result[key]))delete result[key];return result;}
function validate(shortcut){if(typeof shortcut!=='string'||shortcut.length>100)throw Error('Invalid shortcut.');const keys=shortcut.split('+');if(keys.length<2||keys.every(k=>/^(ctrl|control|alt|option|shift|super|meta|commandorcontrol|cmdorctrl)$/i.test(k)))throw Error('Choose a modifier and a key.');if(reserved(shortcut))throw Error('This shortcut belongs to Windows. Choose another key.');}
module.exports={CIRCLE_SHORTCUT,reserved,migrate,validate};

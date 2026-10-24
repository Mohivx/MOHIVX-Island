function islandBounds(display, mode, input={}, settings={}) {
  const area=display.workArea || display.bounds;
  if(['fullscreen','lasso','loadout'].includes(mode))return {...display.bounds};
  // Keep the transparent host stationary while the painted island morphs.
  // Moving/resizing its HWND mid-animation briefly paints the old frame off-centre.
  if(input.stableViewport===true&&mode!=='dictation')return {x:area.x,y:area.y,width:area.width,height:area.height};
  let width=Math.min(area.width,Math.max(16,Math.round(Number(input.width)||(mode==='drawer'?764:mode==='compact-media'?420:164))));
  let height=Math.min(area.height,Math.max(16,Math.round(Number(input.height)||(mode==='drawer'?470:mode==='compact-media'?56:16))));
  let x=area.x+Math.round((area.width-width)/2),y=area.y;
  const position=settings.position || 'top-center';
  if(position==='left'||position==='top-left')x=area.x;
  if(position==='right'||position==='top-right')x=area.x+area.width-width;
  if(position==='left'||position==='right')y=area.y+Math.round((area.height-height)/2);
  if(position==='bottom')y=area.y+area.height-height;
  if(mode==='dictation'){width=Math.min(680,area.width);height=Math.min(160,area.height);x=area.x+Math.round((area.width-width)/2);y=area.y+Math.max(0,area.height-height-40);}
  return {x,y,width,height};
}
module.exports={islandBounds};

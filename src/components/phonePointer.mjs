export function phonePoint(clientX,clientY,rect,width,height,fill=false){
 if(!rect||rect.width<=0||rect.height<=0||width<=0||height<=0)return null;
 const scale=(fill?Math.max:Math.min)(rect.width/width,rect.height/height);
 const x=(clientX-rect.left-(rect.width-width*scale)/2)/(width*scale);
 const y=(clientY-rect.top-(rect.height-height*scale)/2)/(height*scale);
 return Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;
}

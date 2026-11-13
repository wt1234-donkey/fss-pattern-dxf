/* Annotation cleanup in original-image coordinates. Browser and Node share this logic. */
(function(root){
'use strict';
const modes={exclude:1,protect:2,metal:3,restore:0};
function rasterize(actions,w,h,viewport={x:0,y:0,w:1,h:1}){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>4194304)throw Error('清理画布尺寸无效。');
 const out=new Uint8Array(w*h),v=viewport;
 if(![v.x,v.y,v.w,v.h].every(Number.isFinite)||v.w<=0||v.h<=0)throw Error('清理坐标范围无效。');
 function rect(box,paint,test){
  const x0=Math.max(0,Math.ceil((box[0]-v.x)/v.w*w-.5)),x1=Math.min(w,Math.ceil((box[2]-v.x)/v.w*w-.5));
  const y0=Math.max(0,Math.ceil((box[1]-v.y)/v.h*h-.5)),y1=Math.min(h,Math.ceil((box[3]-v.y)/v.h*h-.5));
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   if(test&&!test(v.x+(x+.5)*v.w/w,v.y+(y+.5)*v.h/h))continue;
   const i=y*w+x;
   if(paint===0||paint===2||out[i]!==2)out[i]=paint;
  }
 }
 for(const a of actions){
  if(!(a.mode in modes))throw Error('未知的清理工具。');
  const code=modes[a.mode];
  if(a.kind==='rect')rect(a.box,code);
  else if(a.kind==='runs')for(const box of a.boxes)rect(box,code);
  else if(a.kind==='stroke'){
   const [rx,ry]=a.radius;
   if(!(rx>0&&ry>0))throw Error('画笔尺寸无效。');
   for(let j=0;j<a.points.length;j++){
    const p=a.points[j],q=a.points[Math.max(0,j-1)];
    rect([Math.min(p[0],q[0])-rx,Math.min(p[1],q[1])-ry,Math.max(p[0],q[0])+rx,Math.max(p[1],q[1])+ry],code,(x,y)=>{
     const ax=(x-p[0])/rx,ay=(y-p[1])/ry,dx=(q[0]-p[0])/rx,dy=(q[1]-p[1])/ry;
     const len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,(ax*dx+ay*dy)/len)):0;
     return (ax-t*dx)**2+(ay-t*dy)**2<=1;
    });
   }
  }else throw Error('未知的清理形状。');
 }
 return out;
}
function suggestions(mask,w,h){
 const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length),components=[];
 for(let k=0;k<mask.length;k++){
  if(!mask[k]||seen[k])continue;
  let head=0,tail=1,box=[w,h,0,0];queue[0]=k;seen[k]=1;
  while(head<tail){
   const i=queue[head++],x=i%w,y=(i-x)/w;
   box=[Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x+1),Math.max(box[3],y+1)];
   for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&mask[j]&&!seen[j]){seen[j]=1;queue[tail++]=j;}
  }
  components.push({area:tail,box,seed:k});
 }
 components.sort((a,b)=>b.area-a.area);
 const largest=components[0]?.area||0,edge=Math.max(w,h),limit=Math.min(w*h*.018,largest*.2);
 const candidates=components.slice(1).filter(c=>{
  const dx=c.box[2]-c.box[0],dy=c.box[3]-c.box[1],long=Math.max(dx,dy),short=Math.min(dx,dy);
  return c.area<=limit&&(long<=edge*.16||short<=Math.max(3,edge*.007));
 }).slice(0,80).map((c,id)=>({...c,id,reason:Math.min(c.box[2]-c.box[0],c.box[3]-c.box[1])<=Math.max(3,edge*.007)?'细线 / 虚线片段候选':'文字碎片 / 小金属岛候选'}));
 return {candidates,total:components.length,limited:components.length>81};
}
function componentAction(mask,w,h,seed,viewport={x:0,y:0,w:1,h:1},mode='exclude'){
 if(!mask[seed])throw Error('候选已失效，请重新检测。');
 const seen=new Uint8Array(mask.length),q=[seed];seen[seed]=1;
 for(let k=0;k<q.length;k++){
  const i=q[k],x=i%w,y=(i-x)/w;
  for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&mask[j]&&!seen[j]){seen[j]=1;q.push(j);}
 }
 q.sort((a,b)=>a-b);const boxes=[],v=viewport;
 for(let k=0;k<q.length;k++){
  const first=q[k],y=Math.floor(first/w);let end=first+1;
  while(k+1<q.length&&q[k+1]===end&&Math.floor(q[k+1]/w)===y){k++;end++;}
  boxes.push([v.x+(first%w)/w*v.w,v.y+y/h*v.h,v.x+((end-1)%w+1)/w*v.w,v.y+(y+1)/h*v.h]);
 }
 return {kind:'runs',mode,boxes};
}
const api={rasterize,suggestions,componentAction};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FSSCleanup=api;
})(typeof self!=='undefined'?self:globalThis);

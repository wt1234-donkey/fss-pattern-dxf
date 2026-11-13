/* Interpret thin closed drawing strokes as single boundaries, not as metal ribbons.
   Explicit opt-in: real conductor width remains meaningful in region mode. */
(function(root){
'use strict';
const C=root.FSSCore||(typeof require==='function'?require('./core.js'):null);
function box(points){return points.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);}
function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function reconstruct(raw,opt,A){
 const cap=Number(opt.drawingStrokeWidth??3);
 if(!Number.isFinite(cap)||cap<.25||cap>40)throw Error('绘图描边最大宽度需为 0.25～40 个处理像素。');
 const loops=raw.loops,bboxes=loops.map(l=>box(l.points)),areas=loops.map(l=>Math.abs(C.area(l.points))),parents=loops.map(()=>-1);
 for(let i=0;i<loops.length;i++){
  let best=Infinity;const p=loops[i].points[0],b=bboxes[i];
  for(let j=0;j<loops.length;j++){
   const q=bboxes[j];
   if(i===j||areas[j]<=areas[i]||areas[j]>=best||q[0]>b[0]||q[1]>b[1]||q[2]<b[2]||q[3]<b[3])continue;
   if(inside(p,loops[j].points)){parents[i]=j;best=areas[j];}
  }
 }
 const children=loops.map(()=>[]);parents.forEach((p,i)=>{if(p>=0)children[p].push(i);});
 const replaced=new Map(),removed=new Set(),stats={mode:'stroke-center',maxStrokeWidthPx:cap,collapsed:0,widePreserved:0,unresolved:0,protectedPreserved:0,inputLoops:loops.length};
 let work=0;
 for(let k=0;k<loops.length;k++){
  if(loops[k].hole)continue;
  const holes=children[k].filter(i=>loops[i].hole);
  if(holes.length!==1){stats.unresolved++;continue;}
  const hole=holes[0],b=bboxes[k],x0=Math.floor(b[0])-2,y0=Math.floor(b[1])-2,w=Math.ceil(b[2])-x0+2,h=Math.ceil(b[3])-y0+2;
  // Bound per-pair work and reject obviously wide regions before allocating distance maps.
  const perimeter=points=>points.reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[(i+1)%points.length][0],p[1]-points[(i+1)%points.length][1]),0);
  const meanWidth=2*(areas[k]-areas[hole])/(perimeter(loops[k].points)+perimeter(loops[hole].points));
  if(meanWidth>cap+.4){stats.widePreserved++;continue;}
  if(w*h>4500000||work+w*h>16000000||stats.collapsed>=128){stats.unresolved++;continue;}
  work+=w*h;
  const local=i=>[{points:loops[i].points.map(p=>[p[0]-x0,p[1]-y0])}],outer=A.rasterize(local(k),w,h),inner=A.rasterize(local(hole),w,h);
  if(!outer||!inner){stats.unresolved++;continue;}
  let protectedHit=false;
  if(raw.pixelOverrides)for(let y=0;y<h&&!protectedHit;y++)for(let x=0;x<w;x++){
   const xx=x+x0,yy=y+y0;
   if(outer[y*w+x]&&!inner[y*w+x]&&xx>=0&&yy>=0&&xx<raw.w&&yy<raw.h&&raw.pixelOverrides[yy*raw.w+xx]===2){protectedHit=true;break;}
  }
  if(protectedHit){stats.protectedPreserved++;continue;}
  const toOutside=A.distanceChamfer(outer,w,h,0),toInside=A.distanceChamfer(inner,w,h,1),field=new Float32Array(w*h);
  let maxWidth=0;
  for(let i=0;i<field.length;i++){
   if(!outer[i])field[i]=-Math.max(1,toInside[i]);
   else if(inner[i])field[i]=Math.max(1,toOutside[i]);
   else{field[i]=toOutside[i]-toInside[i];maxWidth=Math.max(maxWidth,toOutside[i]+toInside[i]-1);}
  }
  if(maxWidth>cap*Math.SQRT2+.6){stats.widePreserved++;continue;}
  const centers=A.contoursIso(field,w,h);
  if(centers.length!==1){stats.unresolved++;continue;}
  const center={points:centers[0].points.map(p=>[p[0]+x0,p[1]+y0])};
  // Both sides of the zero-width boundary must stay in the original stroke envelope.
  const region=A.rasterize([center],raw.w,raw.h);
  if(!region){stats.unresolved++;continue;}
  let valid=true;
  for(let y=Math.max(0,y0);y<Math.min(raw.h,y0+h)&&valid;y++)for(let x=Math.max(0,x0);x<Math.min(raw.w,x0+w);x++){
   const t=(y-y0)*w+x-x0,p=y*raw.w+x;
   if((region[p]&&!outer[t])||(!region[p]&&inner[t])){valid=false;break;}
  }
  if(!valid){stats.unresolved++;continue;}
  replaced.set(k,center);removed.add(hole);stats.collapsed++;
 }
 const reconstructed=A.classify(loops.flatMap((l,k)=>removed.has(k)?[]:[replaced.get(k)||{points:l.points.map(p=>p.slice())}]));
 const mask=A.rasterize(reconstructed,raw.w,raw.h);if(!mask)throw Error('描边中心重建失败，请改用填色区域或检查断线。');
 // Cleanup still constrains the reconstructed region; protected pixels retain the source classification.
 if(raw.pixelOverrides)for(let i=0;i<mask.length;i++){
  const code=raw.pixelOverrides[i];if(code===1)mask[i]=0;else if(code===2)mask[i]=raw.mask[i];else if(code===3)mask[i]=1;
 }
 stats.outputLoops=C.contours(mask,raw.w,raw.h).loops.length;
 return {mask,stats};
}
function suggestColorTolerance(color,background){
 const separation=Math.hypot(...color.map((v,i)=>v-background[i]));
 return {tolerance:Math.max(3,Math.min(80,Math.floor(separation*.45))),separation};
}
const api={reconstruct,suggestColorTolerance};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FSSStrokeBoundary=api;
})(typeof self!=='undefined'?self:globalThis);

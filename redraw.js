/* Reference-guided FSS redraw: editable closed lines/arcs with explicit geometry validation. */
(function(root){
'use strict';
const C=root.FSSCore||(typeof require==='function'?require('./core.js'):null);
const A=root.FSSAdvanced||(typeof require==='function'?require('./advanced.js'):null);
if(!C||!A)throw Error('FSSCore and FSSAdvanced must load before FSSRedraw');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cp=p=>[p[0],p[1]],cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function clone(model){return {loops:model.loops.map(l=>({hole:!!l.hole,points:l.points.map(cp),bulges:l.bulges.slice()}))};}
function fromResult(result){
 if(!result?.loops?.length)throw Error('请先识别有效的闭合轮廓');
 const loops=result.loops.map(l=>{
  if(l.open)throw Error('请先闭合原图中的全部轮廓');
  const validCurves=l.curves?.length>=3&&l.curves.every((s,i,q)=>s.start&&s.end&&dist(s.end,q[(i+1)%q.length].start)<1e-5);
  const points=validCurves?l.curves.map(s=>cp(s.start)):l.points.map(cp);
  const bulges=validCurves?l.curves.map(s=>s.kind==='arc'?Math.tan(s.sweep/4):0):points.map(()=>0);
  if(points.length<3)throw Error('轮廓顶点不足');
  return {hole:!!l.hole,points,bulges};
 });
 return {loops};
}
function arc(a,b,bulge){
 if(!Number.isFinite(bulge)||Math.abs(bulge)<1e-7||Math.abs(bulge)>1)throw Error('圆弧参数需为 -1 到 1，且不可为无穷');
 const d=dist(a,b);if(d<1e-5)throw Error('圆弧端点不能重合');
 const m=[(a[0]+b[0])/2,(a[1]+b[1])/2],h=d*(1-bulge*bulge)/(4*bulge);
 const center=[m[0]-(b[1]-a[1])/d*h,m[1]+(b[0]-a[0])/d*h];
 return {kind:'arc',start:cp(a),end:cp(b),center,sweep:4*Math.atan(bulge)};
}
function sampleArc(seg,maxChordError=.18){
 const [cx,cy]=seg.center,a=Math.atan2(seg.start[1]-cy,seg.start[0]-cx),radius=dist(seg.start,seg.center);
 const radStep=2*Math.acos(clamp(1-maxChordError/radius,-1,1));
 const pieces=clamp(Math.ceil(Math.abs(seg.sweep)/Math.min(.14,radStep||.14)),2,256);
 const out=[];
 for(let k=1;k<pieces;k++){const t=a+seg.sweep*k/pieces;out.push([cx+radius*Math.cos(t),cy+radius*Math.sin(t)]);}
 return out;
}
function toLoops(model){
 return model.loops.map(loop=>{
  if(!loop||loop.points.length!==loop.bulges.length||loop.points.length<3||loop.points.length>12000)
   throw Error('重绘轮廓不存在或点数不正确');
  const curves=[],samples=[],n=loop.points.length;
  for(let i=0;i<n;i++){
   const a=loop.points[i],b=loop.points[(i+1)%n],bulge=loop.bulges[i];
   if(!a.every(Number.isFinite)||dist(a,b)<1e-5||!Number.isFinite(bulge))throw Error('存在重合或无效的顶点');
   const s=Math.abs(bulge)>1e-7?arc(a,b,bulge):{kind:'line',start:cp(a),end:cp(b)};
   curves.push(s);samples.push(cp(a));
   if(s.kind==='arc')samples.push(...sampleArc(s));
  }
  return {hole:loop.hole,open:false,points:samples,curves};
 });
}
function bounds(loops){
 let b=[Infinity,Infinity,-Infinity,-Infinity];
 for(const l of loops)for(const p of l.points){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}
 if(!b.every(Number.isFinite)||b[2]-b[0]<1e-5||b[3]-b[1]<1e-5)throw Error('重绘尺寸退化');
 return b;
}
function properIntersect(a,b,c,d){
 const cross0=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 if(Math.max(a[0],b[0])+1e-7<Math.min(c[0],d[0])||Math.max(c[0],d[0])+1e-7<Math.min(a[0],b[0])||
    Math.max(a[1],b[1])+1e-7<Math.min(c[1],d[1])||Math.max(c[1],d[1])+1e-7<Math.min(a[1],b[1]))return false;
 const eps=1e-7,u=cross0(a,b,c),v=cross0(a,b,d),w=cross0(c,d,a),z=cross0(c,d,b);
 const between=(p,a,b)=>Math.min(a[0],b[0])-eps<=p[0]&&p[0]<=Math.max(a[0],b[0])+eps&&Math.min(a[1],b[1])-eps<=p[1]&&p[1]<=Math.max(a[1],b[1])+eps;
 if(Math.abs(u)<eps&&between(c,a,b)||Math.abs(v)<eps&&between(d,a,b)||Math.abs(w)<eps&&between(a,c,d)||Math.abs(z)<eps&&between(b,c,d))return true;
 return (u*v<0&&w*z<0);
}
function crossing(loops){
 const grid=new Map(),cell=8,segments=[];
 for(let k=0;k<loops.length;k++){
  const pts=loops[k].points,n=pts.length;
  if(n>10000)return '轮廓采样点过多，需要先简化';
  if(Math.sign(C.area(pts))!== (loops[k].hole?1:-1))return '轮廓环绕方向不符合外轮廓/孔洞关系';
  for(let i=0;i<n;i++){
   const a=pts[i],b=pts[(i+1)%n];if(dist(a,b)<1e-6)return '存在零长度边';
   const entry={a,b,loop:k,index:i,n},key=segments.length,checked=new Set();
   const x0=Math.floor(Math.min(a[0],b[0])/cell),x1=Math.floor(Math.max(a[0],b[0])/cell);
   const y0=Math.floor(Math.min(a[1],b[1])/cell),y1=Math.floor(Math.max(a[1],b[1])/cell);
   if((x1-x0+1)*(y1-y0+1)>40000)return '边线过长，无法可靠检查拓扑';
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const coord=x+','+y,items=grid.get(coord)||[];
    for(const idx of items){
     if(checked.has(idx))continue;checked.add(idx);
     const prev=segments[idx];
     if(prev.loop===k&&(prev.index===i-1||(i===n-1&&prev.index===0)))continue;
     if(properIntersect(a,b,prev.a,prev.b))return '存在自交或相互接触的轮廓';
    }
    items.push(key);grid.set(coord,items);
   }
   segments.push(entry);
  }
 }
 return null;
}
function evaluate(model,reference,{enforcePixel=false,skipMask=false}={}){
 let loops;
 try{loops=toLoops(model);}catch(e){return {ok:false,reason:e.message};}
 const conflict=crossing(loops);if(conflict)return {ok:false,reason:conflict};
 const referenceOuters=reference.loops.filter(l=>!l.hole).length,referenceHoles=reference.loops.length-referenceOuters;
 const outers=loops.filter(l=>!l.hole).length,holes=loops.length-outers;
 if(outers!==referenceOuters||holes!==referenceHoles)return {ok:false,reason:'金属岛或孔洞数已改变'};
 const met={ok:true,loops,outers,holes,primitives:model.loops.reduce((s,l)=>s+l.points.length,0),
 arcs:model.loops.reduce((s,l)=>s+l.bulges.filter(b=>Math.abs(b)>1e-7).length,0),changedPixels:null,changePercent:null};
 try{met.bounds=bounds(loops);}catch(e){return {ok:false,reason:e.message};}
 if(skipMask||!reference.mask)return met;
 if(reference.w*reference.h>4200000)return {ok:false,reason:'源像素尺寸过大'};
 const image=A.rasterize(loops,reference.w,reference.h);
 if(!image)return {ok:false,reason:'重绘边界不闭合或无法栅格化'};
 const before=A.maskTopology(reference.mask,reference.w,reference.h),after=A.maskTopology(image,reference.w,reference.h);
 met.before=before;met.after=after;
 if(before[0]!==after[0]||before[1]!==after[1])return {ok:false,reason:'重绘造成金属连接关系或孔洞改变',before,after};
 let changed=0;
 for(let i=0;i<image.length;i++)if(image[i]!==reference.mask[i])changed++;
 met.changedPixels=changed;
 met.changePercent=100*changed/image.length;
 if(enforcePixel&&changed>Math.max(16,Math.min(reference.mask.length*.028,(reference.pixels||0)*.10+16)))
  return {...met,ok:false,reason:'自动规则化改动较大，已保留原轮廓；可手动修正并明确确认偏差'};
 return met;
}
function segment(model,loop,i){
 const l=model.loops[loop];if(!l||i<0||i>=l.points.length)throw Error('请选择有效轮廓边');
 const a=l.points[i],b=l.points[(i+1)%l.points.length],bulge=l.bulges[i];
 return Math.abs(bulge)>1e-7?arc(a,b,bulge):{kind:'line',start:cp(a),end:cp(b)};
}
function setBulge(model,loop,i,value){
 const next=clone(model);if(!next.loops[loop]||i<0||i>=next.loops[loop].bulges.length)throw Error('请选择一条有效边');
 next.loops[loop].bulges[i]=Math.abs(value)<.015?0:clamp(Number(value),-1,1);
 return next;
}
function moveVertex(model,loop,i,p){
 const next=clone(model),l=next.loops[loop];
 if(!l||i<0||i>=l.points.length||!p.every(Number.isFinite))throw Error('顶点坐标无效');
 l.points[i]=cp(p);return next;
}
function insertVertex(model,loop,i){
 const next=clone(model),l=next.loops[loop];if(!l||i<0||i>=l.points.length)throw Error('请选择边');
 const n=l.points.length,a=l.points[i],b=l.points[(i+1)%n],t=l.bulges[i];
 let middle;
 if(Math.abs(t)>1e-7){
  const s=arc(a,b,t),r=dist(a,s.center),ang=Math.atan2(a[1]-s.center[1],a[0]-s.center[0])+s.sweep/2;
  middle=[s.center[0]+r*Math.cos(ang),s.center[1]+r*Math.sin(ang)];
  l.bulges[i]=Math.tan(s.sweep/8);
 }else{middle=[(a[0]+b[0])/2,(a[1]+b[1])/2];}
 l.points.splice(i+1,0,middle);l.bulges.splice(i+1,0,Math.abs(t)>1e-7?Math.tan(Math.atan(t)/2):0);
 return next;
}
function removeVertex(model,loop,i){
 const next=clone(model),l=next.loops[loop];if(!l||l.points.length<4)throw Error('闭合轮廓至少保留三个顶点');
 if(i<0||i>=l.points.length)throw Error('请选择一个顶点');
 const prev=(i+l.points.length-1)%l.points.length;
 l.points.splice(i,1);l.bulges.splice(i,1);
 l.bulges[(i+l.points.length-1)%l.points.length]=0;
 return next;
}
function pathDistance(l,a,b){
 let n=l.points.length,d=0;for(let i=a;i!==b;i=(i+1)%n)d+=dist(l.points[i],l.points[(i+1)%n]);
 return d;
}
function replaceSpan(model,loop,from,to,kind){
 const next=clone(model),l=next.loops[loop],n=l?.points.length;
 if(!n||n<4||from===to||from<0||to<0||from>=n||to>=n)throw Error('请选同一条轮廓上的两个不同顶点');
 const lenF=pathDistance(l,from,to),lenB=pathDistance(l,to,from);
 const start=lenF<=lenB?from:to,end=lenF<=lenB?to:from,interior=[];
 for(let i=(start+1)%n;i!==end;i=(i+1)%n)interior.push(i);
 if(!interior.length)throw Error('两端点已经相邻；请直接选择边进行规则化');
 const a=l.points[start],b=l.points[end],d=dist(a,b);if(d<1)throw Error('两端点过近');
 let bulge=0;
 if(kind==='arc'){
  const mid=l.points[interior[Math.floor(interior.length/2)]],sag=cross(a,b,mid)/d;
  bulge=clamp(-2*sag/d,-.85,.85);
  if(Math.abs(bulge)<.04)bulge=0.2*(Math.sign(sag)||1);
 }
 const drop=new Set(interior),points=[],bulges=[];
 for(let i=0;i<n;i++){if(drop.has(i))continue;points.push(cp(l.points[i]));bulges.push(i===start?bulge:l.bulges[i]);}
 l.points=points;l.bulges=bulges;return next;
}
function rdpChain(p,tol){
 const kept=new Uint8Array(p.length);kept[0]=kept[p.length-1]=1;
 const st=[[0,p.length-1]];
 while(st.length){
  const [a,b]=st.pop(),u=p[a],v=p[b],vx=v[0]-u[0],vy=v[1]-u[1],D=vx*vx+vy*vy;
  let max=tol*tol,at=-1;
  for(let i=a+1;i<b;i++){
   const t=D?clamp(((p[i][0]-u[0])*vx+(p[i][1]-u[1])*vy)/D,0,1):0;
   const e=(p[i][0]-u[0]-t*vx)**2+(p[i][1]-u[1]-t*vy)**2;
   if(e>max){max=e;at=i;}
  }
  if(at>=0){kept[at]=1;st.push([a,at],[at,b]);}
 }
 return p.filter((_,i)=>kept[i]);
}
function simplifyLoop(l,tol){
 if(l.points.length<14||l.bulges.some(x=>Math.abs(x)>1e-7))return l;
 const n=l.points.length,half=Math.floor(n/2),p=l.points;
 const reduced=rdpChain(p.slice(0,half+1),tol).slice(0,-1).concat(rdpChain(p.slice(half).concat([p[0]]),tol).slice(0,-1));
 if(reduced.length<3||reduced.length>=n)return l;
 return {...l,points:reduced,bulges:reduced.map(()=>0)};
}
function intersectLines(p,a,q,b){
 const d=a[0]*b[1]-a[1]*b[0];if(Math.abs(d)<.07)return null;
 const dx=q[0]-p[0],dy=q[1]-p[1],t=(dx*b[1]-dy*b[0])/d;
 return [p[0]+a[0]*t,p[1]+a[1]*t];
}
function snappedLoop(l,angleTolerance=7){
 const n=l.points.length,original=l.points,lines=[];
 if(n>1500)return l;
 for(let i=0;i<n;i++){
  const a=original[i],b=original[(i+1)%n],d=dist(a,b);
  if(Math.abs(l.bulges[i])>.00001||d<4){lines.push(null);continue;}
  const theta=Math.atan2(b[1]-a[1],b[0]-a[0]),target=Math.round(theta/(Math.PI/4))*Math.PI/4;
  if(Math.abs(Math.atan2(Math.sin(theta-target),Math.cos(theta-target)))>angleTolerance*Math.PI/180){lines.push(null);continue;}
  const dir=[Math.cos(target),Math.sin(target)],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  lines.push({dir,mid});
 }
 const points=original.map(cp);
 for(let i=0;i<n;i++){
  const prev=lines[(i+n-1)%n],curr=lines[i],p=original[i];
  if(prev&&curr){
   const q=intersectLines(prev.mid,prev.dir,curr.mid,curr.dir);
   if(q&&dist(q,p)<=Math.max(1.3,Math.min(3,Math.min(dist(original[(i+n-1)%n],p),dist(p,original[(i+1)%n]))*.18)))points[i]=q;
  }else if(prev||curr){
   const l0=prev||curr,dx=p[0]-l0.mid[0],dy=p[1]-l0.mid[1],dot=dx*l0.dir[0]+dy*l0.dir[1];
   const q=[l0.mid[0]+dot*l0.dir[0],l0.mid[1]+dot*l0.dir[1]];
   if(dist(q,p)<1.2)points[i]=q;
  }
 }
 return {...l,points};
}
function symmetry(model,axis,threshold=1.5){
 if(!['vertical','horizontal','rotation'].includes(axis))throw Error('请选择正确的对称关系');
 const next=clone(model),box=[Infinity,Infinity,-Infinity,-Infinity];for(const l of next.loops)for(const p of l.points){box[0]=Math.min(box[0],p[0]);box[1]=Math.min(box[1],p[1]);box[2]=Math.max(box[2],p[0]);box[3]=Math.max(box[3],p[1]);}
 const cx=(box[0]+box[2])/2,cy=(box[1]+box[3])/2,reflect=p=>axis==='vertical'?[2*cx-p[0],p[1]]:axis==='horizontal'?[p[0],2*cy-p[1]]:[2*cx-p[0],2*cy-p[1]];
 let pairs=0;
 for(const l of next.loops){
  if(l.points.length>1600)throw Error('对称约束要求先简化超过1600个顶点的轮廓');
  const matched=new Set();
  for(let i=0;i<l.points.length;i++){
   if(matched.has(i))continue;
   const p=l.points[i],target=reflect(p);
   let best=-1,error=threshold;
   for(let j=0;j<l.points.length;j++){
    if(matched.has(j)&&j!==i)continue;
    const d=dist(l.points[j],target);
    if(d<error){error=d;best=j;}
   }
   if(best<0)continue;
   if(best===i){
    const projected=[(p[0]+target[0])/2,(p[1]+target[1])/2];
    l.points[i]=projected;matched.add(i);continue;
   }
   const q=l.points[best],mid=[(p[0]+reflect(q)[0])/2,(p[1]+reflect(q)[1])/2];
   l.points[i]=mid;l.points[best]=reflect(mid);matched.add(i);matched.add(best);pairs++;
  }
 }
 return {model:next,pairs};
}

function circleRegularize(loop,tolerance=1.25){
 if(loop.points.length<12||loop.bulges.some(b=>Math.abs(b)>.00001))return loop;
 const pts=loop.points,n=pts.length;
 let lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];
 for(const p of pts){lo[0]=Math.min(lo[0],p[0]);lo[1]=Math.min(lo[1],p[1]);hi[0]=Math.max(hi[0],p[0]);hi[1]=Math.max(hi[1],p[1]);}
 const w=hi[0]-lo[0],h=hi[1]-lo[1];
 if(Math.min(w,h)<7||Math.abs(w-h)>Math.max(2.2,tolerance*1.7))return loop;
 const cx=(lo[0]+hi[0])/2,cy=(lo[1]+hi[1])/2;
 let radius=0;for(const p of pts)radius+=Math.hypot(p[0]-cx,p[1]-cy);radius/=n;
 let error=0,maxError=0;for(const p of pts){const d=Math.hypot(p[0]-cx,p[1]-cy)-radius;error+=d*d;maxError=Math.max(maxError,Math.abs(d));}
 if(Math.sqrt(error/n)>Math.max(.65,tolerance*.63)||maxError>Math.max(1.2,tolerance*1.2))return loop;
 const sign=Math.sign(C.area(pts)),start=Math.atan2(pts[0][1]-cy,pts[0][0]-cx);
 if(!sign)return loop;
 const points=Array.from({length:4},(_,i)=>{
  const angle=start+sign*Math.PI/2*i;return [cx+radius*Math.cos(angle),cy+radius*Math.sin(angle)];
 });
 return {...loop,points,bulges:points.map(()=>sign*Math.tan(Math.PI/8))};
}

function auto(model,reference,opt={}){
 let current=clone(model),repaired=0,skipped=0;
 for(let k=0;k<current.loops.length;k++){
  const initial=current.loops[k],candidate=snappedLoop(circleRegularize(simplifyLoop(initial,clamp(Number(opt.tolerance)||1.25,.3,2)),clamp(Number(opt.tolerance)||1.25,.3,2)),clamp(Number(opt.angleTolerance)||7,2,15));
  const proposal=clone(current);proposal.loops[k]=candidate;
  const check=evaluate(proposal,reference,{enforcePixel:true,skipMask:!!opt.skipMask});
  if(check.ok){if(candidate.points.length!==initial.points.length||candidate.points.some((p,i)=>dist(p,initial.points[i])>1e-6)){repaired++;current=proposal;}}
  else skipped++;
 }
 return {model:current,repaired,skipped};
}
const api={clone,fromResult,arc,sampleArc,toLoops,bounds,evaluate,segment,setBulge,moveVertex,insertVertex,removeVertex,replaceSpan,auto,symmetry};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.FSSRedraw=api;
})(typeof self!=='undefined'?self:globalThis);

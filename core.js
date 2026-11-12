/* Pure raster-to-CAD geometry. No external dependencies. */
(function(root){
'use strict';
function area(p){let a=0;for(let i=0;i<p.length;i++){let q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1];}return a/2;}
function otsu(rgba){let h=new Float64Array(256),n=rgba.length/4,sum=0;for(let i=0;i<rgba.length;i+=4){let a=rgba[i+3]/255,v=Math.round((.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2])*a+255*(1-a));h[v]++;sum+=v;}let best=-1,t=127,c=0,s=0;for(let i=0;i<255;i++){c+=h[i];s+=i*h[i];if(!c||c===n)continue;let v=c*(n-c)*(s/c-(sum-s)/(n-c))**2;if(v>best){best=v;t=i;}}return t;}
function clean(mask,w,h,min){if(min<=1)return 0;let seen=new Uint8Array(mask.length),q=new Int32Array(mask.length),removed=0;for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;let head=0,tail=1;q[0]=i;seen[i]=1;while(head<tail){let p=q[head++],x=p%w,y=Math.floor(p/w);for(let j of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(j>=0&&mask[j]&&!seen[j]){seen[j]=1;q[tail++]=j;}}if(tail<min){removed++;for(let k=0;k<tail;k++)mask[q[k]]=0;}}return removed;}
function contours(mask,w,h){const stride=w+1,out=new Map();let edgeCount=0;function edge(x,y,xx,yy,d){let a=y*stride+x,b=yy*stride+xx;let e={a,b,d,used:false};if(!out.has(a))out.set(a,[]);out.get(a).push(e);if(++edgeCount>450000)throw Error('轮廓边缘过多。请降低处理分辨率、裁掉文字标注或提高去噪阈值。');}
let pixels=0,bounds=[w,h,0,0],diagonal=0;function on(x,y){return x>=0&&y>=0&&x<w&&y<h&&mask[y*w+x];}
for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!on(x,y))continue;pixels++;bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x+1);bounds[3]=Math.max(bounds[3],y+1);if(!on(x,y-1))edge(x+1,y,x,y,2);if(!on(x-1,y))edge(x,y,x,y+1,1);if(!on(x,y+1))edge(x,y+1,x+1,y+1,0);if(!on(x+1,y))edge(x+1,y+1,x+1,y,3);if(x<w-1&&y<h-1){let a=on(x+1,y),b=on(x,y+1),c=on(x+1,y+1);if(!a&&!b&&c)diagonal++;}if(x>0&&y<h-1&&!on(x-1,y)&&!on(x,y+1)&&on(x-1,y+1))diagonal++;}
if(!pixels)throw Error('没有识别到金属区域。请检查黑白极性、阈值或裁切范围。');
let loops=[];for(let es of out.values())for(let start of es){if(start.used)continue;let e=start,pts=[],guard=0;while(true){if(e.used)throw Error('轮廓追踪异常。');e.used=true;pts.push([e.a%stride,Math.floor(e.a/stride)]);if(e.b===start.a)break;const options=(out.get(e.b)||[]).filter(q=>!q.used);if(!options.length)throw Error('存在未闭合的轮廓。');const priority={3:0,0:1,1:2,2:3};options.sort((a,b)=>priority[(a.d-e.d+4)%4]-priority[(b.d-e.d+4)%4]);e=options[0];if(++guard>edgeCount)throw Error('轮廓追踪超时。');}
// Split point-touching cycles before simplifying, so each CAD loop is simple.
let pending=[pts];while(pending.length){let poly=pending.pop(),seen=new Map(),split=false;for(let i=0;i<poly.length;i++){let key=poly[i][1]*stride+poly[i][0];if(seen.has(key)){let j=seen.get(key);pending.push(poly.slice(j,i),poly.slice(0,j).concat(poly.slice(i)));split=true;break;}seen.set(key,i);}if(split)continue;
poly=poly.filter((p,i,a)=>{let u=a[(i+a.length-1)%a.length],v=a[(i+1)%a.length];return (p[0]-u[0])*(v[1]-p[1])!==(p[1]-u[1])*(v[0]-p[0]);});if(poly.length<3)throw Error('轮廓退化。');loops.push({points:poly,hole:area(poly)>0});} }
return {loops,pixels,bounds,diagonal,edgeCount};}
function distance2(p,a,b){let dx=b[0]-a[0],dy=b[1]-a[1],t=dx*dx+dy*dy?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy))):0;return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;}
// Closed-ring RDP, anchored at all four extrema so the physical bounding box stays fixed.
function fitRing(points,tolerance){let n=points.length,anchor=new Set();for(let axis=0;axis<2;axis++)for(let sign of [-1,1]){let best=0;for(let i=1;i<n;i++)if(sign*points[i][axis]>sign*points[best][axis])best=i;anchor.add(best);}let ids=[...anchor].sort((a,b)=>a-b);if(ids.length<2)ids.push((ids[0]+Math.floor(n/2))%n);ids.sort((a,b)=>a-b);let keep=new Set(ids),limit=tolerance*tolerance;
for(let k=0;k<ids.length;k++){let start=ids[k],end=ids[(k+1)%ids.length];if(end<=start)end+=n;let stack=[[start,end]];while(stack.length){let [i,j]=stack.pop(),idx=-1,dmax=limit;for(let t=i+1;t<j;t++){let d=distance2(points[t%n],points[i%n],points[j%n]);if(d>dmax){dmax=d;idx=t;}}if(idx>=0){keep.add(idx%n);stack.push([i,idx],[idx,j]);}}}
return [...keep].sort((a,b)=>a-b).map(i=>points[i]);}
function spans(points,y){let xs=[];for(let i=0;i<points.length;i++){let a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&y<b[1])||(b[1]<=y&&y<a[1]))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);if(xs.length%2)return null;let intervals=[];for(let i=0;i<xs.length;i+=2){let first=Math.floor(xs[i]-.5+1e-9)+1,last=Math.ceil(xs[i+1]-.5-1e-9)-1;if(first<=last)intervals.push(first,last);}return intervals;}
// Equivalent pixel-centre coverage is required for every ring independently.
function rasterDifference(a,b,mask,w,h,budget,protectFine=true){let ymin=h,ymax=0;for(let p of a){ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);}for(let p of b){ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);}ymin=Math.max(0,Math.floor(ymin));ymax=Math.min(h,Math.ceil(ymax));let changed=0;
for(let y=ymin;y<ymax;y++){let aa=spans(a,y+.5),bb=spans(b,y+.5);if(!aa||!bb)return Infinity;let edges=[];for(let s of [aa,bb])for(let i=0;i<s.length;i+=2)edges.push([s[i],1],[s[i+1]+1,1]);edges.sort((p,q)=>p[0]-q[0]);let parity=0,last=0;for(let [x,t] of edges){if(parity)for(let col=Math.max(0,last);col<Math.min(w,x);col++){if(++changed>budget)return Infinity;if(protectFine){let value=mask[y*w+col],horizontal=1,vertical=1;for(let j=1;j<=2&&col-j>=0&&mask[y*w+col-j]===value;j++)horizontal++;for(let j=1;j<=2&&col+j<w&&mask[y*w+col+j]===value;j++)horizontal++;for(let j=1;j<=2&&y-j>=0&&mask[(y-j)*w+col]===value;j++)vertical++;for(let j=1;j<=2&&y+j<h&&mask[(y+j)*w+col]===value;j++)vertical++;if(Math.min(horizontal,vertical)<=2)return Infinity;}}parity^=t;last=x;}}
return changed;}
function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function segmentsMeet(a,b,c,d){const e=1e-9,ab=Math.sign(cross(a,b,c)),ac=Math.sign(cross(a,b,d)),cd=Math.sign(cross(c,d,a)),ce=Math.sign(cross(c,d,b));if(Math.max(a[0],b[0])+e<Math.min(c[0],d[0])||Math.max(c[0],d[0])+e<Math.min(a[0],b[0])||Math.max(a[1],b[1])+e<Math.min(c[1],d[1])||Math.max(c[1],d[1])+e<Math.min(a[1],b[1]))return false;return ab*ac<=0&&cd*ce<=0;}
function simpleRing(p){let grid=new Map(),cell=8,n=p.length;for(let i=0;i<n;i++){let a=p[i],b=p[(i+1)%n],x0=Math.floor(Math.min(a[0],b[0])/cell),x1=Math.floor(Math.max(a[0],b[0])/cell),y0=Math.floor(Math.min(a[1],b[1])/cell),y1=Math.floor(Math.max(a[1],b[1])/cell),checked=new Set();for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){let key=x+':'+y,old=grid.get(key)||[];for(let j of old)if(!checked.has(j)){checked.add(j);if(j!==i&&j!==(i+1)%n&&(j+1)%n!==i&&segmentsMeet(a,b,p[j],p[(j+1)%n]))return false;}old.push(i);grid.set(key,old);}}return true;}
function ringConflict(a,b){let ax0=Infinity,ax1=-Infinity,ay0=Infinity,ay1=-Infinity,bx0=Infinity,bx1=-Infinity,by0=Infinity,by1=-Infinity;for(let p of a){ax0=Math.min(ax0,p[0]);ax1=Math.max(ax1,p[0]);ay0=Math.min(ay0,p[1]);ay1=Math.max(ay1,p[1]);}for(let p of b){bx0=Math.min(bx0,p[0]);bx1=Math.max(bx1,p[0]);by0=Math.min(by0,p[1]);by1=Math.max(by1,p[1]);}if(ax1<bx0||bx1<ax0||ay1<by0||by1<ay0)return false;for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(segmentsMeet(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]))return true;return false;}
function rasterize(loops,w,h){let mask=new Uint8Array(w*h);for(let loop of loops){let p=loop.points,min=h,max=0;for(let v of p){min=Math.min(min,v[1]);max=Math.max(max,v[1]);}for(let y=Math.max(0,Math.floor(min));y<Math.min(h,Math.ceil(max));y++){let intervals=spans(p,y+.5);if(!intervals)return null;for(let i=0;i<intervals.length;i+=2)for(let x=Math.max(0,intervals[i]);x<=Math.min(w-1,intervals[i+1]);x++)mask[y*w+x]^=1;}}return mask;}
function topology(mask,w,h){let seen=new Uint8Array(mask.length),q=new Int32Array(mask.length),parts=[0,0];for(let i=0;i<mask.length;i++){if(seen[i])continue;let kind=mask[i],head=0,tail=1,touches=false;q[0]=i;seen[i]=1;while(head<tail){let k=q[head++],x=k%w,y=(k-x)/w;if(x===0||x===w-1||y===0||y===h-1)touches=true;for(let j of [x>0?k-1:-1,x<w-1?k+1:-1,y>0?k-w:-1,y<h-1?k+w:-1])if(j>=0&&!seen[j]&&mask[j]===kind){seen[j]=1;q[tail++]=j;}}if(kind)parts[0]++;else if(!touches)parts[1]++;}return parts;}
function smoothContours(result,tolerance,settings={}){if(!(tolerance>0))return {...result,symmetry:detectSymmetry(result,settings.symmetryThreshold),symmetryStraightened:0,symmetryVerticesRemoved:0,symmetrySnappedSegments:0,smoothed:0,changedPixels:0,straightenedRuns:0,staircaseVerticesRemoved:0};let loops=result.loops.map(loop=>({...loop})),diffs=loops.map(()=>0);for(let k=0;k<loops.length;k++){let original=loops[k].points;if(original.length<5)continue;let budget=Math.max(2,Math.min(350,Math.round(original.length*.16),Math.round(Math.abs(area(original))*.04)));for(let t of [tolerance,tolerance*.8,tolerance*.6,tolerance*.4]){let p=fitRing(original,t);if(p.length<3||p.length>=original.length||Math.sign(area(p))!==Math.sign(area(original))||!simpleRing(p))continue;let mismatch=rasterDifference(original,p,result.mask,result.w,result.h,budget,true);if(mismatch===Infinity)continue;if(loops.some((other,j)=>j!==k&&ringConflict(p,other.points)&&!ringConflict(original,result.loops[j].points)))continue;loops[k].points=p;diffs[k]=mismatch;break;}}
// If any one sharp corner, rounded tip, hole, or slit rejects a global fit,
// simplify other long straight spans independently rather than reverting all
// diagonals in the same closed loop to staircase edges.
for(let k=0;k<loops.length;k++){
 let original=result.loops[k].points,n=original.length;
 if(loops[k].points!==original||n<5)continue;
 let budget=Math.max(2,Math.min(350,Math.round(n*.16),Math.round(Math.abs(area(original))*.04)));
 let indices=new Map(original.map((p,i)=>[p,i]));
 let anchors=fitRing(original,tolerance).map(p=>indices.get(p)).sort((a,b)=>a-b);
 let spansToTry=[];
 for(let j=0;j<anchors.length;j++){
  let a=anchors[j],b=anchors[(j+1)%anchors.length];if(b<=a)b+=n;
  let middle=[];for(let i=a+1;i<b;i++)middle.push(i%n);
  if(middle.length>=2)spansToTry.push(middle);
 }
 spansToTry.sort((a,b)=>b.length-a.length);
 let removed=new Uint8Array(n),fitted=original,mismatch=0;
 for(let arc of spansToTry.slice(0,80)){
  for(let i of arc)removed[i]=1;
  let candidate=original.filter((p,i)=>!removed[i]);
  let valid=candidate.length>=3&&Math.sign(area(candidate))===Math.sign(area(original))&&simpleRing(candidate)
   &&!loops.some((other,j)=>j!==k&&ringConflict(candidate,other.points)&&!ringConflict(original,result.loops[j].points));
  let changed=valid?rasterDifference(original,candidate,result.mask,result.w,result.h,budget,true):Infinity;
  if(changed===Infinity){for(let i of arc)removed[i]=0;}
  else{fitted=candidate;mismatch=changed;}
 }
 if(fitted.length<original.length){loops[k].points=fitted;diffs[k]=mismatch;}
}
let changed=diffs.reduce((a,b)=>a+b,0);if(changed){let originalTopology=topology(result.mask,result.w,result.h),retries=0;while(retries++<loops.length){let drawn=rasterize(loops,result.w,result.h);if(drawn){let candidateTopology=topology(drawn,result.w,result.h);if(candidateTopology.every((n,i)=>n===originalTopology[i]))break;}let idx=0;for(let i=1;i<diffs.length;i++)if(diffs[i]>diffs[idx])idx=i;if(diffs[idx]===0)break;loops[idx]=result.loops[idx];diffs[idx]=0;}}
let symmetry=detectSymmetry(result,settings.symmetryThreshold);let symmetryFix=settings.symmetryMode==='observe'||settings.symmetryMode==='off'?{count:0,removed:0}:symmetryAssistedStraightening(result,loops,diffs,symmetry);let repair=rectifyDiagonalStaircases(result,loops,diffs,tolerance);return {...result,symmetry,symmetryStraightened:symmetryFix.count,symmetryVerticesRemoved:symmetryFix.removed,symmetrySnappedSegments:symmetryFix.snapped||0,loops,smoothed:diffs.filter((_,i)=>loops[i].points!==result.loops[i].points).length,changedPixels:diffs.reduce((a,b)=>a+b,0),straightenedRuns:repair.corrected,staircaseVerticesRemoved:repair.verticesRemoved};}

function findDiagonalStaircaseRuns(points,tolerance){
 const n=points.length;if(n<14)return [];
 let seam=points.findIndex((p,i)=>Math.hypot(p[0]-points[(i+1)%n][0],p[1]-points[(i+1)%n][1])>4.5);
 const offset=seam<0?0:(seam+1)%n,a=points.slice(offset).concat(points.slice(0,offset)),runs=[];
 const strength=Math.min(1.6,Math.max(.65,tolerance/1.25));
 for(let i=0;i<n-12;){
  let best=-1,pathLength=0;
  for(let j=i+1;j<n&&j-i<360;j++){
   const dx=a[j][0]-a[j-1][0],dy=a[j][1]-a[j-1][1];
   if(Math.max(Math.abs(dx),Math.abs(dy))>4||dx&&dy)break;
   pathLength+=Math.abs(dx)+Math.abs(dy);
   const vx=a[j][0]-a[i][0],vy=a[j][1]-a[i][1],length=Math.hypot(vx,vy);
   if(Math.abs(vx)<12||Math.abs(vy)<12)continue;
   if(length/pathLength<.57)break;
   let deviation=0,sumSq=0,outliers=0;
   for(let k=i+1;k<j;k++){
    const d=Math.abs(vx*(a[k][1]-a[i][1])-vy*(a[k][0]-a[i][0]))/length;
    deviation=Math.max(deviation,d);
    sumSq+=d*d;
    if(d>2.7*strength)outliers++;
   }
   // Robust long-straight recognition tolerates isolated 1–3 px
   // threshold bumps, but rejects sustained curvature and deep notches.
   const nearPerfect=deviation<=Math.max(1.1,tolerance*1.6);
   const robust=j-i>=32&&sumSq/(j-i-1)<2.3*strength*strength
       &&outliers/(j-i-1)<.17&&deviation<=5.4*strength;
   if(nearPerfect||robust)best=j;
   if(deviation>8*strength)break;
  }
  if(best-i>=12){
   const remove=[];for(let k=i+1;k<best;k++)remove.push((offset+k)%n);
   runs.push({remove,span:best-i});i=best;
  }else i++;
 }
 return runs.sort((a,b)=>b.remove.length-a.remove.length);
}
function narrowLinePixel(mask,w,h,index){
 const x=index%w,y=(index-x)/w,value=mask[index];
 function runs(dx,dy){
  const side=[];
  for(let direction of [-1,1]){
   let count=0;
   for(let step=1;step<7;step++){
    let xx=x+direction*dx*step,yy=y+direction*dy*step;
    if(xx<0||yy<0||xx>=w||yy>=h||mask[yy*w+xx]!==value)break;
    count++;
   }
   side.push(count);
  }
  return {length:1+side[0]+side[1],both:Math.min(side[0],side[1])};
 }
 const hx=runs(1,0),vy=runs(0,1);
 // A genuine narrow slit/trace continues on both sides of a pixel along
 // its axis; a one-sided diagonal-border raster spur does not.
 if(hx.both>=3&&vy.length<=2||vy.both>=3&&hx.length<=2)return true;
 const d1=runs(1,1),d2=runs(1,-1);
 return d1.both>=3&&d2.length<=2||d2.both>=3&&d1.length<=2;
}
function rectifyDiagonalStaircases(raw,loops,diffs,tolerance){
 let originalTopology=null,corrected=0,verticesRemoved=0;
 for(let k=0;k<loops.length;k++){
  const start=loops[k].points,runs=findDiagonalStaircaseRuns(start,tolerance);
  if(!runs.length)continue;
  const source=raw.loops[k].points;
  const extents=p=>p.reduce((v,q)=>[Math.min(v[0],q[0]),Math.min(v[1],q[1]),Math.max(v[2],q[0]),Math.max(v[3],q[1])],[Infinity,Infinity,-Infinity,-Infinity]);
  const bbox=extents(start),budget=Math.max(25,Math.min(500,Math.round(start.length*.3)));
  let removed=new Set(),accepted=start,acceptedDiff=diffs[k],previous=rasterize(loops,raw.w,raw.h);
  if(!previous)continue;
  for(let run of runs.slice(0,60)){
   const nextRemoved=new Set(removed);for(let i of run.remove)nextRemoved.add(i);
   let p=start.filter((_,i)=>!nextRemoved.has(i));
   if(p.length<3||Math.sign(area(p))!==Math.sign(area(source))||!simpleRing(p))continue;
   if(extents(p).some((v,i)=>v!==bbox[i]))continue;
   if(loops.some((q,j)=>j!==k&&ringConflict(p,q.points)&&!ringConflict(source,raw.loops[j].points)))continue;
   let diff=rasterDifference(source,p,raw.mask,raw.w,raw.h,budget,false);
   if(!Number.isFinite(diff))continue;
   const trial=loops.map((q,j)=>j===k?{...q,points:p}:q),drawn=rasterize(trial,raw.w,raw.h);
   if(!drawn)continue;
   if(originalTopology===null)originalTopology=topology(raw.mask,raw.w,raw.h);
   if(!topology(drawn,raw.w,raw.h).every((v,i)=>v===originalTopology[i]))continue;
   let unsafe=false;
   for(let i=0;i<drawn.length;i++)if(drawn[i]!==previous[i]&&narrowLinePixel(raw.mask,raw.w,raw.h,i)){unsafe=true;break;}
   if(unsafe)continue;
   verticesRemoved+=accepted.length-p.length;corrected++;
   removed=nextRemoved;accepted=p;acceptedDiff=diff;previous=drawn;
  }
  if(accepted!==start){loops[k]={...loops[k],points:accepted};diffs[k]=acceptedDiff;}
 }
 return {corrected,verticesRemoved};
}

function cloneLoops(loops){return loops.map(q=>({...q,points:q.points.map(p=>p.slice()),...(q.curves?{curves:q.curves.map(s=>({...s,start:s.start.slice(),end:s.end.slice(),...(s.center?{center:s.center.slice()}:{})}))}:{})}));}
function validateEditedLoop(loops,index,previous){
 const next=loops[index],points=next.points;
 if(points.length<(next.open?2:3))throw Error('轮廓顶点数量不足。');
 for(let i=1;i<points.length;i++)if(points[i][0]===points[i-1][0]&&points[i][1]===points[i-1][1])throw Error('不能生成零长度线段。');
 if(next.open)return loops;
 if(Math.sign(area(points))!==Math.sign(area(previous.points)))throw Error('连接导致轮廓方向反转或面积退化。');
 if(!simpleRing(points))throw Error('连接将产生自交轮廓，请重新选择端点。');
 for(let j=0;j<loops.length;j++){
  if(j===index||loops[j].open)continue;
  if(ringConflict(points,loops[j].points)&&!ringConflict(previous.points,loops[j].points))
   throw Error('新线段与其他金属岛或孔洞相交。');
 }
 return loops;
}
function editContours(source,action){
 if(!Array.isArray(source)||!source.length)throw Error('没有可编辑的轮廓。');
 const loops=cloneLoops(source),k=action.loopIndex;
 if(!Number.isInteger(k)||k<0||k>=loops.length)throw Error('请先选择轮廓。');
 const loop=loops[k],previous=source[k],n=loop.points.length,idx=action.index;
 const valid=i=>Number.isInteger(i)&&i>=0&&i<n;
 if(action.type==='removeVertex'){
  if(!valid(idx))throw Error('请选择有效的顶点。');
  if(n<=(loop.open?2:3))throw Error('轮廓无法继续删除顶点。');
  loop.points.splice(idx,1);
 }else if(action.type==='removeSegment'){
  if(loop.open)throw Error('请先连接当前缺口，才能继续删除线段。');
  if(!valid(idx))throw Error('请选择有效的线段。');
  loop.points=loop.points.slice((idx+1)%n).concat(loop.points.slice(0,(idx+1)%n));
  loop.open=true;
 }else if(action.type==='connect'){
  const a=action.from,b=action.to;
  if(!valid(a)||!valid(b)||a===b)throw Error('请选择同一轮廓上的两个不同顶点。');
  if(loop.open){
   if(a===0&&b===n-1||b===0&&a===n-1)loop.open=false;
   else{
    const start=Math.min(a,b),end=Math.max(a,b);
    if(end===start+1)throw Error('两点已通过线段连接。');
    loop.points=loop.points.filter((_,i)=>i<=start||i>=end);
   }
  }else{
   if((a+1)%n===b||(b+1)%n===a)throw Error('这两个顶点已直接连接。');
   function length(from,to){let sum=0,i=from;while(i!==to){let j=(i+1)%n;sum+=Math.hypot(loop.points[j][0]-loop.points[i][0],loop.points[j][1]-loop.points[i][1]);i=j;}return sum;}
   const forward=length(a,b)<=length(b,a),start=forward?a:b,end=forward?b:a,drop=new Set();
   for(let i=(start+1)%n;i!==end;i=(i+1)%n)drop.add(i);
   loop.points=loop.points.filter((_,i)=>!drop.has(i));
  }
 }else if(action.type==='insertVertex'){
  if(!valid(idx)||loop.open&&idx===n-1)throw Error('请先选中有效线段。');
  const a=loop.points[idx],b=loop.points[(idx+1)%n],x=Number(action.x),y=Number(action.y);
  if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('顶点坐标必须是有限数字。');
  if(Math.hypot(a[0]-x,a[1]-y)<1e-6||Math.hypot(b[0]-x,b[1]-y)<1e-6)throw Error('新顶点不能和现有端点重合。');
  loop.points.splice(idx+1,0,[x,y]);
 }else throw Error('不支持的编辑操作。');
 delete loop.curves;return validateEditedLoop(loops,k,previous);
}
function openContours(g){return g.loops.some(q=>q.open);}


function detectSymmetry(result,threshold=.94){
 const t=Number.isFinite(threshold)?Math.max(.85,Math.min(.995,threshold)):.94;
 const [x0,y0,x1,y1]=result.bounds,axes=['vertical','horizontal','rotation'],scores={vertical:0,horizontal:0,rotation:0};
 if(result.pixels<20||x1-x0<8||y1-y0<8)return {threshold:t,scores,axes:[],center:[(x0+x1)/2,(y0+y1)/2]};
 const {mask,w}=result,matched={vertical:0,horizontal:0,rotation:0};
 // Compare metal with its reflection, not the mostly empty image background.
 // The axes are fixed at the metal-region bounding box center, in pixel space.
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  if(!mask[y*w+x])continue;
  if(mask[y*w+x0+x1-1-x])matched.vertical++;
  if(mask[(y0+y1-1-y)*w+x])matched.horizontal++;
  if(mask[(y0+y1-1-y)*w+x0+x1-1-x])matched.rotation++;
 }
 for(const axis of axes)scores[axis]=matched[axis]/result.pixels;
 return {threshold:t,scores,axes:axes.filter(axis=>scores[axis]>=t),center:[(x0+x1)/2,(y0+y1)/2]};
}
function mirrorSymmetryPoint(p,axis,b){
 return [axis==='horizontal'?p[0]:b[0]+b[2]-p[0],
         axis==='vertical'?p[1]:b[1]+b[3]-p[1]];
}
function symmetryAssistedStraightening(raw,loops,diffs,info){
 let count=0,removed=0,snapped=0;
 if(!info.axes.length||!loops.length)return {count,removed,snapped};
 const originalLoops=cloneLoops(loops),bbox=raw.bounds,reference=topology(raw.mask,raw.w,raw.h);
 const bounds=p=>p.reduce((box,q)=>[Math.min(box[0],q[0]),Math.min(box[1],q[1]),Math.max(box[2],q[0]),Math.max(box[3],q[1])],[Infinity,Infinity,-Infinity,-Infinity]);
 const boxes=originalLoops.map(l=>bounds(l.points));
 let currentMask=rasterize(loops,raw.w,raw.h);
 if(!currentMask)return {count,removed,snapped};
 // Prefer using mirrored straight edges before ordinary staircase regression.
 for(const axis of info.axes){
  const partners=boxes.map((box,k)=>{
   const mirrorBox=bounds([mirrorSymmetryPoint([box[0],box[1]],axis,bbox),mirrorSymmetryPoint([box[2],box[3]],axis,bbox)]);
   let best=-1,distance=Infinity;
   for(let j=0;j<boxes.length;j++){
    if(originalLoops[k].hole!==originalLoops[j].hole||originalLoops[j].open)continue;
    const delta=Math.max(...mirrorBox.map((v,i)=>Math.abs(v-boxes[j][i])));
    const extent=Math.max(box[2]-box[0],box[3]-box[1]);
    if(delta<=Math.max(3,Math.min(6,extent*.025))&&delta<distance){distance=delta;best=j;}
   }
   return best;
  });
  for(let sourceIndex=0;sourceIndex<originalLoops.length;sourceIndex++){
   const destination=partners[sourceIndex];if(destination<0)continue;
   const src=originalLoops[sourceIndex].points;
   for(let edge=0;edge<src.length;edge++){
    const a=src[edge],b=src[(edge+1)%src.length],dx=b[0]-a[0],dy=b[1]-a[1];
    // Only borrow genuine long diagonal CAD edges, never short rounded tips.
    if(Math.abs(dx)<12||Math.abs(dy)<12||Math.hypot(dx,dy)<18)continue;
    const p=loops[destination].points,n=p.length;
    if(n<8)continue;
    const mirroredA=mirrorSymmetryPoint(a,axis,bbox),mirroredB=mirrorSymmetryPoint(b,axis,bbox);
    function nearestPoint(target){
     let best=-1,distance=3.2*3.2;
     for(let i=0;i<n;i++){
      const d=(p[i][0]-target[0])**2+(p[i][1]-target[1])**2;
      if(d<distance){distance=d;best=i;}
     }
     return best;
    }
    const ia=nearestPoint(mirroredA),ib=nearestPoint(mirroredB);
    if(ia<0||ib<0||ia===ib)continue;
    let bestArc=null;
    for(const [start,end] of [[ia,ib],[ib,ia]]){
     const u=p[start],v=p[end],chord=Math.hypot(v[0]-u[0],v[1]-u[1]);
     if(chord<16)continue;
     let indexes=[],pathLength=0,deviation=0,t=start;
     for(let guard=0;guard<n&&t!==end;guard++){
      const next=(t+1)%n;
      pathLength+=Math.hypot(p[next][0]-p[t][0],p[next][1]-p[t][1]);
      if(next!==end){
       indexes.push(next);
       deviation=Math.max(deviation,Math.abs((v[0]-u[0])*(p[next][1]-u[1])-(v[1]-u[1])*(p[next][0]-u[0]))/chord);
      }
      t=next;
     }
     if(indexes.length>=3&&deviation<=3.4&&pathLength>chord*1.055&&pathLength<chord*1.58){
      if(!bestArc||pathLength<bestArc.pathLength)bestArc={indexes,pathLength,chord};
     }
    }
    if(!bestArc)continue;
    const drop=new Set(bestArc.indexes),shortcut=p.filter((_,i)=>!drop.has(i));
    // Prefer exact reflected endpoints when they are already close, but
    // preserve the original ring bounding box and fall back to the safe
    // unsnapped straight chord if exact mirroring would damage geometry.
    const exact=p.map((pt,i)=>i===ia?mirroredA.slice():i===ib?mirroredB.slice():pt).filter((_,i)=>!drop.has(i));
    const inputBox=bounds(p);
    const allowExact=Math.hypot(p[ia][0]-mirroredA[0],p[ia][1]-mirroredA[1])<=1.75
     &&Math.hypot(p[ib][0]-mirroredB[0],p[ib][1]-mirroredB[1])<=1.75
     &&bounds(exact).every((v,i)=>Math.abs(v-inputBox[i])<1e-8);
    let accepted=false;
    for(const choice of (allowExact?[{points:exact,exact:true},{points:shortcut,exact:false}]:[{points:shortcut,exact:false}])){
     const updated=choice.points;
     if(updated.length<3||Math.sign(area(updated))!==Math.sign(area(raw.loops[destination].points))||!simpleRing(updated))continue;
     if(loops.some((l,j)=>j!==destination&&ringConflict(updated,l.points)&&!ringConflict(raw.loops[destination].points,raw.loops[j].points)))continue;
     const trial=loops.map((l,j)=>j===destination?{...l,points:updated}:l),newMask=rasterize(trial,raw.w,raw.h);
     if(!newMask||!topology(newMask,raw.w,raw.h).every((n,i)=>n===reference[i]))continue;
     let changed=0,unsafe=false;
     for(let i=0;i<newMask.length;i++)if(newMask[i]!==currentMask[i]){
      if(++changed>Math.max(8,Math.ceil(bestArc.chord*.18))||narrowLinePixel(raw.mask,raw.w,raw.h,i)){unsafe=true;break;}
     }
     if(unsafe)continue;
     const budget=Math.max(25,Math.min(850,Math.round(raw.loops[destination].points.length*.4)));
     const delta=rasterDifference(raw.loops[destination].points,updated,raw.mask,raw.w,raw.h,budget,false);
     if(!Number.isFinite(delta))continue;
     removed+=p.length-updated.length;count++;if(choice.exact)snapped++;
     loops[destination]={...loops[destination],points:updated};
     diffs[destination]=delta;currentMask=newMask;accepted=true;break;
    }
    if(!accepted)continue;
    if(count>=80)return {count,removed,snapped};
   }
  }
 }
 return {count,removed,snapped};
}


// Hybrid geometry reconstruction retains the topology-tested raster baseline, then
// promotes supported curved spans to circular CAD primitives. Uncertain spans stay lines.
function circle3(a,m,b){
 const x1=a[0],y1=a[1],x2=m[0],y2=m[1],x3=b[0],y3=b[1];
 const det=2*((x2-x1)*(y3-y1)-(y2-y1)*(x3-x1));
 if(Math.abs(det)<1e-8)return null;
 const u=x2*x2+y2*y2-x1*x1-y1*y1,v=x3*x3+y3*y3-x1*x1-y1*y1;
 const cx=(u*(y3-y1)-v*(y2-y1))/det,cy=((x2-x1)*v-(x3-x1)*u)/det;
 const radius=Math.hypot(x1-cx,y1-cy);
 return Number.isFinite(radius)?{center:[cx,cy],radius}:null;
}
function circularSpan(p,from,to,tol){
 const n=to-from+1;if(n<5)return null;
 const a=p[from],b=p[to],middle=p[from+Math.floor((n-1)/2)];
 const circle=leastSquaresCircle(p.slice(from,to+1))||circle3(a,middle,b);
 if(!circle||circle.radius<1.4||circle.radius>220)return null;
 const [cx,cy]=circle.center,alpha=q=>Math.atan2(q[1]-cy,q[0]-cx);
 const limit=Math.max(.75,Math.min(1.15,tol*.72));
 let sweep=0,sign=0,maxError=0,backtracking=0;
 for(let j=from;j<=to;j++){
  const q=p[j],error=Math.abs(Math.hypot(q[0]-cx,q[1]-cy)-circle.radius);
  maxError=Math.max(maxError,error);
  if(error>limit)return null;
  if(j===from)continue;
  const u=p[j-1],ang=Math.atan2((u[0]-cx)*(q[1]-cy)-(u[1]-cy)*(q[0]-cx),
                                  (u[0]-cx)*(q[0]-cx)+(u[1]-cy)*(q[1]-cy));
  if(Math.abs(ang)>1.35)return null; // reject large discontinuities
  if(Math.abs(ang)>.015){if(sign&&Math.sign(ang)!==sign){backtracking+=Math.abs(ang);if(backtracking>.23)return null;}else sign=Math.sign(ang);}
  sweep+=ang;
 }
 if(Math.abs(sweep)<.33||Math.abs(sweep)>2.85)return null;
 const chord=Math.hypot(a[0]-b[0],a[1]-b[1]);
 const sag=circle.radius*(1-Math.cos(Math.abs(sweep)/2));
 if(chord<2.7||sag<.7||circle.radius*Math.abs(sweep)<4.5)return null;
 return {kind:'arc',start:a.slice(),end:b.slice(),center:circle.center,sweep};
}

function leastSquaresCircle(points){
 const n=points.length;if(n<5)return null;
 let mx=0,my=0;for(const p of points){mx+=p[0];my+=p[1];}mx/=n;my/=n;
 let uu=0,vv,uv=0,vsum=0,uuu=0,uvv=0,vvv=0,vuu=0;
 for(const p of points){
  const u=p[0]-mx,v=p[1]-my,u2=u*u,v2=v*v;
  uu+=u2;vsum+=v2;uv+=u*v;uuu+=u2*u;uvv+=u*v2;vvv+=v2*v;vuu+=v*u2;
 }
 const det=uu*vsum-uv*uv;
 if(Math.abs(det)<1e-8)return null;
 const A=(uuu+uvv)/2,B=(vvv+vuu)/2;
 const center=[mx+(A*vsum-B*uv)/det,my+(B*uu-A*uv)/det];
 let radius=0;for(const p of points)radius+=Math.hypot(p[0]-center[0],p[1]-center[1]);radius/=n;
 let maxError=0,rms=0;
 for(const p of points){const e=Math.abs(Math.hypot(p[0]-center[0],p[1]-center[1])-radius);maxError=Math.max(maxError,e);rms+=e*e;}
 return {center,radius,maxError,rms:Math.sqrt(rms/n)};
}
function fullCircleCurves(points){
 if(points.length<12)return null;
 const c=leastSquaresCircle(points);
 if(!c||c.radius<3||c.maxError>Math.min(2,Math.max(1.15,.035*c.radius))||c.rms>.83)return null;
 const sign=Math.sign(area(points));if(!sign)return null;
 // Four exact quarter arcs rather than an invalid single-vertex full-circle polyline.
 const begin=Math.atan2(points[0][1]-c.center[1],points[0][0]-c.center[0]),segments=[];
 const at=i=>[c.center[0]+c.radius*Math.cos(begin+sign*i*Math.PI/2),c.center[1]+c.radius*Math.sin(begin+sign*i*Math.PI/2)];
 for(let i=0;i<4;i++)segments.push({kind:'arc',start:at(i),end:at(i+1),center:c.center.slice(),sweep:sign*Math.PI/2});
 return segments;
}

function sampleCurves(curves){
 const pts=[];
 for(const seg of curves){
  pts.push(seg.start.slice());
  if(seg.kind!=='arc')continue;
  const [cx,cy]=seg.center,a=Math.atan2(seg.start[1]-cy,seg.start[0]-cx);
  const r=Math.hypot(seg.start[0]-cx,seg.start[1]-cy);
  // Dense enough that raster validation and on-screen preview match the CAD arc.
  const count=Math.max(2,Math.ceil(Math.abs(seg.sweep)/Math.min(.13,Math.sqrt(.2/Math.max(1,r)))));
  for(let j=1;j<count;j++){let t=a+seg.sweep*j/count;pts.push([cx+r*Math.cos(t),cy+r*Math.sin(t)]);}
 }
 return pts;
}
function reconstructCurves(points,tol){
 const n=points.length,items=[];
 for(let i=0;i<n;){
  let best=null,finish=Math.min(n-1,i+26);
  for(let j=i+4;j<=finish;j++){let arc=circularSpan(points,i,j,tol);if(arc)best={arc,end:j};}
  if(best){items.push(best.arc);i=best.end;}
  else{items.push({kind:'line',start:points[i].slice(),end:points[(i+1)%n].slice()});i++;}
 }
 return items;
}
function hybridContours(raw,tolerance,settings){
 const base=smoothContours(raw,tolerance,settings),loops=cloneLoops(base.loops);
 const reference=topology(raw.mask,raw.w,raw.h);
 let arcs=0,lines=0,rejected=0,changed=0;
 for(let k=0;k<loops.length;k++){
  const original=loops[k].points;
  if(original.length<5||original.length>7000||loops[k].open){lines+=original.length;continue;}
  let primitives=fullCircleCurves(original)||reconstructCurves(original,tolerance);
  let attempts=primitives.filter(s=>s.kind==='arc').length;
  if(!attempts){lines+=original.length;continue;}
  const budget=Math.max(12,Math.min(250,Math.round(original.length*.8),Math.round(Math.abs(area(original))*.015)));
  // Drop only the candidate arc that fails validation; keep other candidates.
  let accepted=false;
  while(attempts>=0){
   const trial=sampleCurves(primitives);
   const valid=trial.length>=3&&Math.sign(area(trial))===Math.sign(area(original))&&simpleRing(trial)
     &&!loops.some((other,j)=>j!==k&&ringConflict(trial,other.points)&&!ringConflict(original,other.points));
   const mismatch=valid?rasterDifference(original,trial,raw.mask,raw.w,raw.h,budget,true):Infinity;
   if(mismatch!==Infinity){
    const all=loops.map((q,j)=>j===k?{...q,points:trial}:q);
    const bitmap=rasterize(all,raw.w,raw.h);
    if(bitmap&&topology(bitmap,raw.w,raw.h).every((v,i)=>v===reference[i])){
     loops[k]={...loops[k],points:trial,curves:primitives};
     changed+=mismatch;accepted=true;break;
    }
   }
   const at=primitives.findIndex(s=>s.kind==='arc');
   if(at<0)break;
   const arc=primitives[at],replacement=[],p=original;
   // Replace rejected candidate with its original contour edges, not a chord.
   let index=p.findIndex(q=>q[0]===arc.start[0]&&q[1]===arc.start[1]);
   const end=p.findIndex((q,i)=>i>index&&q[0]===arc.end[0]&&q[1]===arc.end[1]);
   if(index<0||end<0)break;
   for(let z=index;z<end;z++)replacement.push({kind:'line',start:p[z].slice(),end:p[z+1].slice()});
   primitives.splice(at,1,...replacement);attempts--;rejected++;
  }
  if(!accepted)lines+=original.length;
  else{arcs+=primitives.filter(s=>s.kind==='arc').length;lines+=primitives.filter(s=>s.kind==='line').length;}
 }
 return {...base,loops,hybrid:{arcs,lines,rejected,changedPixels:changed}};
}

function vectorize(rgba,w,h,opt){if(w*h>4194304)throw Error('处理像素超过上限。');let mask=new Uint8Array(w*h),colorMode=opt.materialMode==='color',target=opt.color||[255,255,0],tolerance=Number(opt.colorTolerance??80);if(colorMode&&(!Array.isArray(target)||target.length!==3||!target.every(v=>Number.isInteger(v)&&v>=0&&v<=255)||!Number.isFinite(tolerance)||tolerance<0||tolerance>255))throw Error('金属取样颜色或颜色容差无效。');let tol2=tolerance*tolerance;for(let i=0;i<mask.length;i++){let j=i*4,a=rgba[j+3]/255,r=rgba[j]*a+255*(1-a),g=rgba[j+1]*a+255*(1-a),b=rgba[j+2]*a+255*(1-a);if(colorMode){let dr=r-target[0],dg=g-target[1],db=b-target[2];mask[i]=dr*dr+dg*dg+db*db<=tol2;}else{let v=.2126*r+.7152*g+.0722*b;mask[i]=opt.light?v>opt.threshold:v<=opt.threshold;}}let removed=clean(mask,w,h,opt.minPixels||1),raw={...contours(mask,w,h),mask,w,h,removed};let tol=Math.max(.5,Math.min(2,Number(opt.tolerance)||1.25));return opt.vectorMode==='hybrid'?hybridContours(raw,tol,opt):smoothContours(raw,opt.smooth===false?0:tol,opt);}
function scale(result,opt){let b=opt.reference==='pattern'?result.bounds:[0,0,result.w,result.h];let bw=b[2]-b[0],bh=b[3]-b[1];let sx=opt.width/bw,sy=opt.height/bh;if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<=0||sy<=0)throw Error('宽高必须为正数。');let ox=opt.center?opt.width/2:0,oy=opt.center?opt.height/2:0;const xy=p=>[(p[0]-b[0])*sx-ox,(b[3]-p[1])*sy-oy];
let uniform=Math.abs(sx-sy)<1e-9*Math.max(sx,sy);
let loops=result.loops.map(q=>({hole:q.hole,open:!!q.open,points:q.points.map(xy),
 ...(uniform&&q.curves&&!q.open?{curves:q.curves.map(s=>({...s,start:xy(s.start),end:xy(s.end),...(s.center?{center:xy(s.center),sweep:-s.sweep}:{})}))}:{})}));return {loops,width:opt.width,height:opt.height,sx,sy,ox,oy};}
function measureSegments(g){let segments=[];g.loops.forEach((loop,loopIndex)=>loop.points.forEach((a,edgeIndex)=>{if(loop.open&&edgeIndex===loop.points.length-1)return;let b=loop.points[(edgeIndex+1)%loop.points.length],dx=b[0]-a[0],dy=b[1]-a[1];segments.push({loopIndex,edgeIndex,hole:loop.hole,x1:a[0],y1:a[1],x2:b[0],y2:b[1],dx,dy,length:Math.hypot(dx,dy)});}));return segments;}
function dxf(g,options={}){if(openContours(g))throw Error('存在未闭合轮廓，请先连接两个端点再导出 DXF。');let lines=[],handle=256;function add(...a){lines.push(...a.map(String));}function num(n){return Math.abs(n)<1e-10?'0':Number(n.toFixed(9)).toString();}add(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,9,'$MEASUREMENT',70,1,9,'$EXTMIN',10,num(-g.ox),20,num(-g.oy),30,0,9,'$EXTMAX',10,num(g.width-g.ox),20,num(g.height-g.oy),30,0,0,'ENDSEC',0,'SECTION',2,'TABLES',0,'TABLE',2,'LTYPE',5,(handle++).toString(16),100,'AcDbSymbolTable',70,1,0,'LTYPE',5,(handle++).toString(16),100,'AcDbSymbolTableRecord',100,'AcDbLinetypeTableRecord',2,'CONTINUOUS',70,0,3,'Solid line',72,65,73,0,40,0,0,'ENDTAB',0,'TABLE',2,'LAYER',5,(handle++).toString(16),100,'AcDbSymbolTable',70,4);
for(let [name,color] of [['0',7],['METAL_OUTER',4],['METAL_HOLE',1],['CELL_GUIDE',8]])add(0,'LAYER',5,(handle++).toString(16),100,'AcDbSymbolTableRecord',100,'AcDbLayerTableRecord',2,name,70,0,62,color,6,'CONTINUOUS');add(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
function polygon(loop,layer){
 const p=loop.points,curves=options.entity!=='LINE'&&Array.isArray(loop.curves)&&loop.curves.length?loop.curves:null;
 if(options.entity==='LINE'){
  for(let i=0;i<p.length;i++){let q=p[(i+1)%p.length];add(0,'LINE',5,(handle++).toString(16),100,'AcDbEntity',8,layer,100,'AcDbLine',10,num(p[i][0]),20,num(p[i][1]),30,0,11,num(q[0]),21,num(q[1]),31,0);}
  return;
 }
 const path=curves||p.map((v,i)=>({kind:'line',start:v,end:p[(i+1)%p.length]}));
 add(0,'LWPOLYLINE',5,(handle++).toString(16),100,'AcDbEntity',8,layer,100,'AcDbPolyline',90,path.length,70,1,38,0);
 for(let s of path){add(10,num(s.start[0]),20,num(s.start[1]));if(s.kind==='arc')add(42,num(Math.tan(s.sweep/4)));}
}
for(let loop of g.loops)polygon(loop,loop.hole?'METAL_HOLE':'METAL_OUTER');if(options.guide)polygon({points:[[-g.ox,-g.oy],[g.width-g.ox,-g.oy],[g.width-g.ox,g.height-g.oy],[-g.ox,g.height-g.oy]]},'CELL_GUIDE');add(0,'ENDSEC',0,'EOF');return lines.join('\r\n')+'\r\n';}
const api={detectSymmetry,symmetryAssistedStraightening,cloneLoops,editContours,openContours,area,otsu,contours,smoothContours,hybridContours,vectorize,scale,measureSegments,dxf};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FSSCore=api;
})(typeof self!=='undefined'?self:globalThis);

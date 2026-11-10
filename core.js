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
function smoothContours(result,tolerance){if(!(tolerance>0))return {...result,smoothed:0,changedPixels:0,straightenedRuns:0,staircaseVerticesRemoved:0};let loops=result.loops.map(loop=>({...loop})),diffs=loops.map(()=>0);for(let k=0;k<loops.length;k++){let original=loops[k].points;if(original.length<5)continue;let budget=Math.max(2,Math.min(350,Math.round(original.length*.16),Math.round(Math.abs(area(original))*.04)));for(let t of [tolerance,tolerance*.8,tolerance*.6,tolerance*.4]){let p=fitRing(original,t);if(p.length<3||p.length>=original.length||Math.sign(area(p))!==Math.sign(area(original))||!simpleRing(p))continue;let mismatch=rasterDifference(original,p,result.mask,result.w,result.h,budget,true);if(mismatch===Infinity)continue;if(loops.some((other,j)=>j!==k&&ringConflict(p,other.points)&&!ringConflict(original,result.loops[j].points)))continue;loops[k].points=p;diffs[k]=mismatch;break;}}
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
let repair=rectifyDiagonalStaircases(result,loops,diffs,tolerance);return {...result,loops,smoothed:diffs.filter((_,i)=>loops[i].points!==result.loops[i].points).length,changedPixels:diffs.reduce((a,b)=>a+b,0),straightenedRuns:repair.corrected,staircaseVerticesRemoved:repair.verticesRemoved};}

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

function cloneLoops(loops){return loops.map(q=>({...q,points:q.points.map(p=>p.slice())}));}
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
 return validateEditedLoop(loops,k,previous);
}
function openContours(g){return g.loops.some(q=>q.open);}

function vectorize(rgba,w,h,opt){if(w*h>4194304)throw Error('处理像素超过上限。');let mask=new Uint8Array(w*h),colorMode=opt.materialMode==='color',target=opt.color||[255,255,0],tolerance=Number(opt.colorTolerance??80);if(colorMode&&(!Array.isArray(target)||target.length!==3||!target.every(v=>Number.isInteger(v)&&v>=0&&v<=255)||!Number.isFinite(tolerance)||tolerance<0||tolerance>255))throw Error('金属取样颜色或颜色容差无效。');let tol2=tolerance*tolerance;for(let i=0;i<mask.length;i++){let j=i*4,a=rgba[j+3]/255,r=rgba[j]*a+255*(1-a),g=rgba[j+1]*a+255*(1-a),b=rgba[j+2]*a+255*(1-a);if(colorMode){let dr=r-target[0],dg=g-target[1],db=b-target[2];mask[i]=dr*dr+dg*dg+db*db<=tol2;}else{let v=.2126*r+.7152*g+.0722*b;mask[i]=opt.light?v>opt.threshold:v<=opt.threshold;}}let removed=clean(mask,w,h,opt.minPixels||1),raw={...contours(mask,w,h),mask,w,h,removed};return smoothContours(raw,opt.smooth===false?0:Math.max(.5,Math.min(2,Number(opt.tolerance)||1.25)));}
function scale(result,opt){let b=opt.reference==='pattern'?result.bounds:[0,0,result.w,result.h];let bw=b[2]-b[0],bh=b[3]-b[1];let sx=opt.width/bw,sy=opt.height/bh;if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<=0||sy<=0)throw Error('宽高必须为正数。');let ox=opt.center?opt.width/2:0,oy=opt.center?opt.height/2:0;let loops=result.loops.map(q=>({hole:q.hole,open:!!q.open,points:q.points.map(p=>[(p[0]-b[0])*sx-ox,(b[3]-p[1])*sy-oy])}));return {loops,width:opt.width,height:opt.height,sx,sy,ox,oy};}
function measureSegments(g){let segments=[];g.loops.forEach((loop,loopIndex)=>loop.points.forEach((a,edgeIndex)=>{if(loop.open&&edgeIndex===loop.points.length-1)return;let b=loop.points[(edgeIndex+1)%loop.points.length],dx=b[0]-a[0],dy=b[1]-a[1];segments.push({loopIndex,edgeIndex,hole:loop.hole,x1:a[0],y1:a[1],x2:b[0],y2:b[1],dx,dy,length:Math.hypot(dx,dy)});}));return segments;}
function dxf(g,options={}){if(openContours(g))throw Error('存在未闭合轮廓，请先连接两个端点再导出 DXF。');let lines=[],handle=256;function add(...a){lines.push(...a.map(String));}function num(n){return Math.abs(n)<1e-10?'0':Number(n.toFixed(9)).toString();}add(0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1015',9,'$INSUNITS',70,4,9,'$MEASUREMENT',70,1,9,'$EXTMIN',10,num(-g.ox),20,num(-g.oy),30,0,9,'$EXTMAX',10,num(g.width-g.ox),20,num(g.height-g.oy),30,0,0,'ENDSEC',0,'SECTION',2,'TABLES',0,'TABLE',2,'LTYPE',5,(handle++).toString(16),100,'AcDbSymbolTable',70,1,0,'LTYPE',5,(handle++).toString(16),100,'AcDbSymbolTableRecord',100,'AcDbLinetypeTableRecord',2,'CONTINUOUS',70,0,3,'Solid line',72,65,73,0,40,0,0,'ENDTAB',0,'TABLE',2,'LAYER',5,(handle++).toString(16),100,'AcDbSymbolTable',70,4);
for(let [name,color] of [['0',7],['METAL_OUTER',4],['METAL_HOLE',1],['CELL_GUIDE',8]])add(0,'LAYER',5,(handle++).toString(16),100,'AcDbSymbolTableRecord',100,'AcDbLayerTableRecord',2,name,70,0,62,color,6,'CONTINUOUS');add(0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES');
function polygon(p,layer){if(options.entity==='LINE'){for(let i=0;i<p.length;i++){let q=p[(i+1)%p.length];add(0,'LINE',5,(handle++).toString(16),100,'AcDbEntity',8,layer,100,'AcDbLine',10,num(p[i][0]),20,num(p[i][1]),30,0,11,num(q[0]),21,num(q[1]),31,0);}return;}
add(0,'LWPOLYLINE',5,(handle++).toString(16),100,'AcDbEntity',8,layer,100,'AcDbPolyline',90,p.length,70,1,38,0);for(let v of p)add(10,num(v[0]),20,num(v[1]));}
for(let loop of g.loops)polygon(loop.points,loop.hole?'METAL_HOLE':'METAL_OUTER');if(options.guide)polygon([[-g.ox,-g.oy],[g.width-g.ox,-g.oy],[g.width-g.ox,g.height-g.oy],[-g.ox,g.height-g.oy]],'CELL_GUIDE');add(0,'ENDSEC',0,'EOF');return lines.join('\r\n')+'\r\n';}
const api={cloneLoops,editContours,openContours,area,otsu,contours,smoothContours,vectorize,scale,measureSegments,dxf};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FSSCore=api;
})(typeof self!=='undefined'?self:globalThis);

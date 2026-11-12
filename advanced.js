/* Five geometry engines for FSS Pattern Lab. Self-contained, no network dependencies.
   Potrace-style is an independent corner/Bézier tracer, not the Potrace library. */
(function(root){
'use strict';
const C=root.FSSCore||(typeof require==='function'?require('./core.js'):null);
if(!C)throw Error('FSSCore must load before FSSAdvanced');
const EPS=1e-8;
const P=(x,y)=>[x,y];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const close=(a,b)=>dist(a,b)<1e-6;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const num=(v,f=0)=>{let n=Number(v);return Number.isFinite(n)?n:f;};
function tidy(p){
 let out=[];
 for(const q of p)if(finite(q[0])&&finite(q[1])&&(!out.length||!close(out[out.length-1],q)))out.push([q[0],q[1]]);
 if(out.length>1&&close(out[0],out[out.length-1]))out.pop();
 return out;
}
function inside(pt,poly){
 let b=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  let a=poly[i],c=poly[j],t=((a[1]>pt[1])!==(c[1]>pt[1]));
  if(t&&pt[0]<(c[0]-a[0])*(pt[1]-a[1])/(c[1]-a[1])+a[0])b=!b;
 }return b;
}
function classify(loops){
 const items=loops.filter(l=>l.points&&l.points.length>=3).map(l=>({...l,points:tidy(l.points)})).filter(l=>l.points.length>=3&&Math.abs(C.area(l.points))>1e-5);
 for(const l of items){
  const q=l.points[0];let depth=0;
  for(const other of items)if(other!==l&&inside(q,other.points))depth++;
  l.hole=(depth%2)===1;
  if((C.area(l.points)>0)!==l.hole){
   l.points.reverse();
   if(l.curves){l.curves.reverse();l.curves=l.curves.map(s=>({ ...s, start:s.end, end:s.start, ...(s.sweep!=null?{sweep:-s.sweep}:{})}));}
  }
 }
 return items;
}
function maskTopology(mask,w,h){
 const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length);let comps=0,holes=0;
 for(let k=0;k<mask.length;k++){
  if(seen[k])continue;
  const kind=mask[k],head0=0;let head=head0,tail=1,touch=false;queue[0]=k;seen[k]=1;
  while(head<tail){
   const p=queue[head++],x=p%w,y=(p-x)/w;
   if(x===0||x===w-1||y===0||y===h-1)touch=true;
   for(const j of [x? p-1:-1,x<w-1?p+1:-1,y?p-w:-1,y<h-1?p+w:-1]){
    if(j>=0&&!seen[j]&&mask[j]===kind){seen[j]=1;queue[tail++]=j;}
   }
  }
  if(kind)comps++;else if(!touch)holes++;
 }
 return [comps,holes];
}
function rasterize(loops,w,h){
 const xs=Array.from({length:h},()=>[]);
 for(const l of loops){
  const p=l.points,n=p.length;if(n<3)return null;
  for(let i=0;i<n;i++){
   const a=p[i],b=p[(i+1)%n];
   if(Math.abs(a[1]-b[1])<EPS)continue;
   let first=Math.max(0,Math.ceil(Math.min(a[1],b[1])-.5)),end=Math.min(h,Math.ceil(Math.max(a[1],b[1])-.5));
   for(let y=first;y<end;y++){
    const fy=y+.5;
    xs[y].push(a[0]+(fy-a[1])*(b[0]-a[0])/(b[1]-a[1]));
   }
  }
 }
 const mask=new Uint8Array(w*h);
 for(let y=0;y<h;y++){
  const row=xs[y].sort((a,b)=>a-b);
  if(row.length%2)return null;
  for(let i=0;i<row.length;i+=2){
   const a=Math.max(0,Math.ceil(row[i]-.5)),b=Math.min(w,Math.ceil(row[i+1]-.5));
   for(let x=a;x<b;x++)mask[y*w+x]^=1;
  }
 }
 return mask;
}
function finePixel(mask,w,h,i){
 const x=i%w,y=(i-x)/w,v=mask[i];
 const spans=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>{
  let z=0;for(let k=1;k<=3;k++){let xx=x+dx*k,yy=y+dy*k;if(xx<0||yy<0||xx>=w||yy>=h||mask[yy*w+xx]!==v)break;z++;}return z;
 });
 return 1+spans[0]+spans[1]<=2||1+spans[2]+spans[3]<=2;
}
function validCandidate(raw,loops,options={}){
 if(!loops.length||loops.length>1200||loops.some(l=>l.points.length<3||l.points.length>15000))return {ok:false,why:'invalid loop sizes'};
 const after=rasterize(loops,raw.w,raw.h);if(!after)return {ok:false,why:'invalid scanlines'};
 const initial=maskTopology(raw.mask,raw.w,raw.h),final=maskTopology(after,raw.w,raw.h);
 if(initial[0]!==final[0]||initial[1]!==final[1])return {ok:false,why:'connectivity or holes changed'};
 let difference=0,critical=0;
 const total=raw.mask.length,limit=Math.max(12,Math.min(total*.035,raw.pixels*(options.maxChange??.105)+35));
 for(let i=0;i<total;i++)if(after[i]!==raw.mask[i]){
  difference++;if(difference>limit)return {ok:false,why:'boundary error budget exceeded',difference};
  if(finePixel(raw.mask,raw.w,raw.h,i))critical++;
 }
 if(options.protectFine!==false&&critical>0)return {ok:false,why:'thin metal or slit modified',difference,critical};
 return {ok:true,difference,initial,final};
}
function rdpChain(points,tol){
 const n=points.length;if(n<=2)return points.slice();
 const keep=new Uint8Array(n);keep[0]=keep[n-1]=1;
 const stack=[[0,n-1]],tol2=tol*tol;
 while(stack.length){
  const [i,j]=stack.pop(),a=points[i],b=points[j],dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy;
  let max=tol2,index=-1;
  for(let k=i+1;k<j;k++){
   const p=points[k],t=len2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len2)):0;
   const e=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;
   if(e>max){max=e;index=k;}
  }
  if(index>=0){keep[index]=1;stack.push([i,index],[index,j]);}
 }
 return points.filter((_,i)=>keep[i]);
}
function rdpRing(points,tol){
 let start=0;for(let i=1;i<points.length;i++)if(points[i][0]+points[i][1]<points[start][0]+points[start][1])start=i;
 const p=points.slice(start).concat(points.slice(0,start)),half=Math.floor(p.length/2);
 const result=rdpChain(p.slice(0,half+1),tol).slice(0,-1).concat(rdpChain(p.slice(half).concat([p[0]]),tol).slice(0,-1));
 return tidy(result);
}
function sampleQuadratic(a,b,c,steps){
 const out=[];for(let i=1;i<=steps;i++){const t=i/steps,s=1-t;out.push([s*s*a[0]+2*s*t*b[0]+t*t*c[0],s*s*a[1]+2*s*t*b[1]+t*t*c[1]]);}return out;
}
function potraceStyle(raw,opt){
 const tolerance=Math.max(.45,Math.min(2.5,num(opt.tolerance,1.25)));
 let curves=0;
 const loops=raw.loops.map(l=>{
  const corners=rdpRing(l.points,Math.max(.4,tolerance*.7));
  if(corners.length<3)return {...l,points:l.points};
  let path=[];
  for(let i=0;i<corners.length;i++){
   const prev=corners[(i+corners.length-1)%corners.length],p=corners[i],next=corners[(i+1)%corners.length];
   const d1=dist(prev,p),d2=dist(p,next),turn=Math.atan2(cross(prev,p,next),(p[0]-prev[0])*(next[0]-p[0])+(p[1]-prev[1])*(next[1]-p[1]));
   const round=Math.abs(turn)<1.24&&Math.abs(turn)>.06&&d1>1.4&&d2>1.4;
   if(!round){path.push(p.slice());continue;}
   const len=Math.min(d1,d2)*.28;
   const a=[p[0]-(p[0]-prev[0])*len/d1,p[1]-(p[1]-prev[1])*len/d1];
   const b=[p[0]+(next[0]-p[0])*len/d2,p[1]+(next[1]-p[1])*len/d2];
   path.push(a,...sampleQuadratic(a,p,b,Math.max(3,Math.ceil(len/.4))));
   curves++;
  }
  return {...l,points:tidy(path)};
 });
 return {loops,details:{bezierTurns:curves,curveRepresentation:'sampled quadratic Bezier'}};
}
function rgbaStrength(rgba,raw,opt){
 const f=new Float32Array(raw.w*raw.h),colorMode=opt.materialMode==='color',target=opt.color||[255,255,0],threshold=num(opt.threshold,127),ctol=num(opt.colorTolerance,80);
 for(let i=0;i<f.length;i++){
  const k=4*i,a=rgba[k+3]/255;
  const R=rgba[k]*a+255*(1-a),G=rgba[k+1]*a+255*(1-a),B=rgba[k+2]*a+255*(1-a);
  let m;
  if(colorMode){m=ctol-Math.hypot(R-target[0],G-target[1],B-target[2]);}
  else{let gray=.2126*R+.7152*G+.0722*B;m=opt.light?gray-threshold:threshold-gray;}
  f[i]=(raw.mask[i]?1:-1)*(Math.max(.08,Math.min(3,Math.abs(m)/20)));
 }
 return f;
}
function contoursIso(field,w,h){
 const S=w+2,T=h+2,grid=new Float32Array(S*T);grid.fill(-2);
 for(let y=0;y<h;y++)grid.set(field.subarray(y*w,(y+1)*w),(y+1)*S+1);
 const nodes=new Map();
 function vertex(key,p){let o=nodes.get(key);if(!o){o={p,links:[]};nodes.set(key,o);}return o;}
 function connect(a,b){if(a.key===b.key)return;vertex(a.key,a.p).links.push(b.key);vertex(b.key,b.p).links.push(a.key);}
 const interp=(a,b)=>{let t=a/(a-b);return Math.max(0,Math.min(1,finite(t)?t:.5));};
 for(let y=0;y<T-1;y++)for(let x=0;x<S-1;x++){
  const a=grid[y*S+x],b=grid[y*S+x+1],c=grid[(y+1)*S+x+1],d=grid[(y+1)*S+x];
  const flags=[a>=0,b>=0,c>=0,d>=0];
  const e=[];
  if(flags[0]!==flags[1])e.push({id:0,key:'H'+y+':'+x,p:[x-.5+interp(a,b),y-.5]});
  if(flags[1]!==flags[2])e.push({id:1,key:'V'+y+':'+(x+1),p:[x+.5,y-.5+interp(b,c)]});
  if(flags[3]!==flags[2])e.push({id:2,key:'H'+(y+1)+':'+x,p:[x-.5+interp(d,c),y+.5]});
  if(flags[0]!==flags[3])e.push({id:3,key:'V'+y+':'+x,p:[x-.5,y-.5+interp(a,d)]});
  if(e.length===2){connect(e[0],e[1]);continue;}
  if(e.length===4){
   const edges=Object.fromEntries(e.map(v=>[v.id,v])),center=(a+b+c+d)/4>=0;
   const pairs=center===flags[0]?[[0,1],[2,3]]:[[0,3],[1,2]];
   for(const [i,j] of pairs)connect(edges[i],edges[j]);
  }
 }
 const loops=[],visited=new Set();
 for(const [key,node] of nodes){
  if(visited.has(key)||node.links.length!==2)continue;
  let points=[],current=key,last=null,closed=false;
  for(let i=0;i<nodes.size+1;i++){
   if(visited.has(current)){closed=current===key;break;}
   const u=nodes.get(current);if(!u||u.links.length!==2)break;
   visited.add(current);points.push(u.p);
   const next=u.links[0]===last?u.links[1]:u.links[0];last=current;current=next;
  }
  if(closed&&points.length>=3)loops.push({points:tidy(points)});
 }
 return classify(loops);
}
function marching(raw,rgba,opt){
 let f=rgbaStrength(rgba,raw,opt),loops=contoursIso(f,raw.w,raw.h);
 const tol=Math.max(.25,Math.min(1.2,num(opt.tolerance,1.25)*.5));
 loops=loops.map(l=>({...l,points:rdpRing(l.points,tol)}));
 return {loops,details:{field:'image intensity/color confidence',subpixel:true}};
}
function distanceChamfer(mask,w,h,seed){
 const n=mask.length,INF=1e5,arr=new Float32Array(n),diag=Math.SQRT2;
 for(let i=0;i<n;i++)arr[i]=mask[i]===seed?0:INF;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(x)arr[i]=Math.min(arr[i],arr[i-1]+1);
  if(y){arr[i]=Math.min(arr[i],arr[i-w]+1);if(x)arr[i]=Math.min(arr[i],arr[i-w-1]+diag);if(x<w-1)arr[i]=Math.min(arr[i],arr[i-w+1]+diag);}
 }
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
  const i=y*w+x;if(x<w-1)arr[i]=Math.min(arr[i],arr[i+1]+1);
  if(y<h-1){arr[i]=Math.min(arr[i],arr[i+w]+1);if(x)arr[i]=Math.min(arr[i],arr[i+w-1]+diag);if(x<w-1)arr[i]=Math.min(arr[i],arr[i+w+1]+diag);}
 }
 return arr;
}
function sdfContours(raw,opt){
 const metal=distanceChamfer(raw.mask,raw.w,raw.h,1),empty=distanceChamfer(raw.mask,raw.w,raw.h,0),n=raw.mask.length,f=new Float32Array(n);
 for(let i=0;i<n;i++)f[i]=raw.mask[i]?empty[i]-.5:-(metal[i]-.5);
 const weight=Math.max(0,Math.min(.7,num(opt.sdfSmoothing,.25))),smooth=new Float32Array(n);
 for(let y=0;y<raw.h;y++)for(let x=0;x<raw.w;x++){
  let sum=0,cnt=0;
  for(let yy=Math.max(0,y-1);yy<=Math.min(raw.h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(raw.w-1,x+1);xx++){
   const v=(x===xx&&y===yy)?4:(x===xx||y===yy?2:1);sum+=f[yy*raw.w+xx]*v;cnt+=v;
  }
  smooth[y*raw.w+x]=(1-weight)*f[y*raw.w+x]+weight*sum/cnt;
 }
 let loops=contoursIso(smooth,raw.w,raw.h);
 const tol=Math.max(.2,Math.min(1.1,num(opt.tolerance,1.25)*.45));
 loops=loops.map(l=>({...l,points:rdpRing(l.points,tol)}));
 return {loops,details:{field:'8-neighbour chamfer signed-distance',smoothing:weight}};
}
function consensusLine(points,i,end,threshold){
 const A=points[i],B=points[end],vx=B[0]-A[0],vy=B[1]-A[1],length=Math.hypot(vx,vy);
 if(length<3)return null;
 const maxError=Math.max(.55,threshold);
 let inliers=0,errors=0;
 for(let k=i;k<=end;k++){
  const d=Math.abs((points[k][0]-A[0])*vy-(points[k][1]-A[1])*vx)/length;
  if(d<=maxError){inliers++;errors+=d*d;}
 }
 const total=end-i+1;
 return {inliers,rate:inliers/total,rms:Math.sqrt(errors/Math.max(1,inliers))};
}
function ransacLoop(loop,tol){
 const pts=loop.points,n=pts.length;if(n<8)return {...loop,points:pts};
 const out=[],threshold=Math.max(.7,Math.min(1.45,tol));
 for(let i=0;i<n;){
  let best=i+1,score=-1;
  const end=Math.min(n-1,i+Math.min(96,n-i-1));
  // Deterministic RANSAC endpoint hypotheses: reproducible across browsers.
  for(let j=i+4;j<=end;j++){
   if(j>i+4&&j%3!==0&&j!==end)continue;
   const candidate=consensusLine(pts,i,j,threshold);
   if(!candidate||candidate.rate<.9||candidate.rms>threshold*.64)continue;
   const rank=j-i-candidate.rms*.35;
   if(rank>score){score=rank;best=j;}
  }
  out.push(pts[i].slice());
  i=best;
 }
 const line=tidy(out);
 return {...loop,points:line.length>=3?line:pts};
}
function ransacHybrid(rgba,raw,opt){
 const base=C.vectorize(rgba,raw.w,raw.h,{...opt,vectorMode:'hybrid',smooth:true});
 let fitted=0,arcs=0;
 const loops=base.loops.map((l,i)=>{
  if(l.curves?.some(s=>s.kind==='arc')){arcs+=l.curves.filter(s=>s.kind==='arc').length;return l;}
  const proposed=ransacLoop(raw.loops[i]||l,num(opt.tolerance,1.25));
  if(proposed.points.length<l.points.length)fitted++;
  return proposed;
 });
 return {loops,details:{nativeArcs:arcs,ransacFittedLoops:fitted}};
}
function circlePrimitive(points){
 if(points.length<12)return null;
 const bounds=points.reduce((v,p)=>[Math.min(v[0],p[0]),Math.min(v[1],p[1]),Math.max(v[2],p[0]),Math.max(v[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
 let cx=(bounds[0]+bounds[2])/2,cy=(bounds[1]+bounds[3])/2,r=0;
 for(const p of points)r+=Math.hypot(p[0]-cx,p[1]-cy);r/=points.length;
 if(r<3||Math.abs(bounds[2]-bounds[0]-(bounds[3]-bounds[1]))>2)return null;
 let error=0;
 for(const p of points)error+=Math.pow(Math.hypot(p[0]-cx,p[1]-cy)-r,2);
 if(Math.sqrt(error/points.length)>1.15)return null;
 const sign=Math.sign(C.area(points)),begin=Math.atan2(points[0][1]-cy,points[0][0]-cx),curves=[];
 for(let i=0;i<4;i++){
  const a=begin+sign*Math.PI/2*i,b=begin+sign*Math.PI/2*(i+1);
  curves.push({kind:'arc',start:P(cx+r*Math.cos(a),cy+r*Math.sin(a)),end:P(cx+r*Math.cos(b),cy+r*Math.sin(b)),center:P(cx,cy),sweep:sign*Math.PI/2});
 }
 return {points:curves.map(s=>s.start),curves};
}
function parametricRaster(raw,rgba,opt){
 const base=ransacHybrid(rgba,raw,opt);
 let circles=0,rectangles=0;
 const loops=base.loops.map((l,i)=>{
  const rawLoop=raw.loops[i]||l,primitive=circlePrimitive(rawLoop.points);
  if(primitive){circles++;return {...l,...primitive};}
  const p=l.points,b=p.reduce((q,v)=>[Math.min(q[0],v[0]),Math.min(q[1],v[1]),Math.max(q[2],v[0]),Math.max(q[3],v[1])],[Infinity,Infinity,-Infinity,-Infinity]);
  const boxArea=(b[2]-b[0])*(b[3]-b[1]);
  if(boxArea>0&&Math.abs(Math.abs(C.area(rawLoop.points))-boxArea)/boxArea<.06){
   const rect=[P(b[0],b[1]),P(b[2],b[1]),P(b[2],b[3]),P(b[0],b[3])];rectangles++;
   return {...l,points:(C.area(rect)>0)!==l.hole?rect.reverse():rect};
  }
  return l;
 });
 return {loops,details:{parameterizedCircles:circles,parameterizedRectangles:rectangles,otherShapes:'line/arc fallback'}};
}
function generate(rgba,w,h,opt={}){
 if(!['potrace','marching','ransac','sdf','cadsvg'].includes(opt.vectorMode))return C.vectorize(rgba,w,h,opt);
 const raw=C.vectorize(rgba,w,h,{...opt,vectorMode:'exact',smooth:false}),mode=opt.vectorMode;
 let proposal;
 try{
  if(mode==='potrace')proposal=potraceStyle(raw,opt);
  else if(mode==='marching')proposal=marching(raw,rgba,opt);
  else if(mode==='ransac')proposal=ransacHybrid(rgba,raw,opt);
  else if(mode==='sdf')proposal=sdfContours(raw,opt);
  else proposal=parametricRaster(raw,rgba,opt);
  const loops=classify(proposal.loops);
  // Preserve original region topology. Never allow a fine gap to disappear silently.
  const gate=validCandidate(raw,loops,{maxChange:mode==='sdf'?.13:.11,protectFine:true});
  if(!gate.ok){
   const fallback=C.vectorize(rgba,w,h,{...opt,vectorMode:'hybrid',smooth:true});
   return {...fallback,advanced:{engine:mode,accepted:false,reason:gate.why,mode:'topology-safe fallback',...proposal.details}};
  }
  return {...raw,loops,advanced:{engine:mode,accepted:true,changedPixels:gate.difference,mode:'fitted',...proposal.details}};
 }catch(err){
  const fallback=C.vectorize(rgba,w,h,{...opt,vectorMode:'hybrid',smooth:true});
  return {...fallback,advanced:{engine:mode,accepted:false,reason:err.message,mode:'safe fallback'}};
 }
}
function svgColor(s){
 if(!s)return null;
 s=String(s).trim().toLowerCase();
 if(s==='none')return 'none';
 const named={black:'#000000',white:'#ffffff',red:'#ff0000',yellow:'#ffff00',cyan:'#00ffff',blue:'#0000ff',transparent:'none'};
 s=named[s]||s;
 if(/^#[a-f0-9]{3}$/.test(s))s='#'+[s[1],s[2],s[3]].map(q=>q+q).join('');
 if(/^#[a-f0-9]{6}$/.test(s))return [1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
 const m=s.match(/^rgb\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*\)$/);
 return m?m.slice(1,4).map(Number):null;
}
function svgMatrix(str){
 let m=[1,0,0,1,0,0],re=/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g,found;
 const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
 while((found=re.exec(str||''))){
  const v=(found[2].match(/[-+]?(?:\d*\.?\d+|\d+\.?)(?:e[-+]?\d+)?/gi)||[]).map(Number);let n;
  if(found[1]==='matrix'&&v.length===6)n=v;
  if(found[1]==='translate')n=[1,0,0,1,v[0]||0,v[1]||0];
  if(found[1]==='scale')n=[v[0]??1,0,0,v[1]??v[0]??1,0,0];
  if(found[1]==='rotate'){
   const a=(v[0]||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cx=v[1]||0,cy=v[2]||0;
   n=[c,s,-s,c,cx-c*cx+s*cy,cy-s*cx-c*cy];
  }
  if(n)m=mul(m,n);
 }
 return m;
}
function mulMatrix(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
const transform=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
function svgPath(d){
 const tokens=(d.match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.?\d+|\d+\.?)(?:e[-+]?\d+)?/g)||[]),out=[];
 let i=0,cmd=null,xy=[0,0],start=[0,0],points=[],control=null,prevCmd=null;
 const isCmd=v=>typeof v==='string'&&/^[a-z]$/i.test(v);
 function finish(){if(points.length>=3)out.push({points:tidy(points)});points=[];}
 const get=n=>{if(tokens.length-i<n||tokens.slice(i,i+n).some(isCmd))return null;let a=tokens.slice(i,i+n).map(Number);i+=n;return a;};
 const pt=(x,y,relative)=>relative?[xy[0]+x,xy[1]+y]:[x,y];
 const cubic=(p0,p1,p2,p3)=>{
  const len=dist(p0,p1)+dist(p1,p2)+dist(p2,p3),steps=Math.max(8,Math.min(96,Math.ceil(len/.4)));
  for(let z=1;z<=steps;z++){const t=z/steps,s=1-t;points.push([s*s*s*p0[0]+3*s*s*t*p1[0]+3*s*t*t*p2[0]+t*t*t*p3[0],s*s*s*p0[1]+3*s*s*t*p1[1]+3*s*t*t*p2[1]+t*t*t*p3[1]]);}
 };
 const arc=(p0,rx,ry,phi,large,sweep,p1)=>{
  rx=Math.abs(rx);ry=Math.abs(ry);
  if(rx<1e-9||ry<1e-9){points.push(p1);return;}
  const rad=phi*Math.PI/180,cp=Math.cos(rad),sp=Math.sin(rad),dx=(p0[0]-p1[0])/2,dy=(p0[1]-p1[1])/2;
  const xx=cp*dx+sp*dy,yy=-sp*dx+cp*dy;
  let lambda=xx*xx/(rx*rx)+yy*yy/(ry*ry);if(lambda>1){const k=Math.sqrt(lambda);rx*=k;ry*=k;}
  const sign=large===sweep?-1:1,num1=Math.max(0,(rx*rx*ry*ry-rx*rx*yy*yy-ry*ry*xx*xx)/(rx*rx*yy*yy+ry*ry*xx*xx||1));
  const q=sign*Math.sqrt(num1),cxp=q*rx*yy/ry,cyp=-q*ry*xx/rx;
  const cx=cp*cxp-sp*cyp+(p0[0]+p1[0])/2,cy=sp*cxp+cp*cyp+(p0[1]+p1[1])/2;
  const ux=(xx-cxp)/rx,uy=(yy-cyp)/ry,vx=(-xx-cxp)/rx,vy=(-yy-cyp)/ry;
  let a=Math.atan2(uy,ux),delta=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);
  if(!sweep&&delta>0)delta-=2*Math.PI;if(sweep&&delta<0)delta+=2*Math.PI;
  const steps=Math.max(8,Math.min(180,Math.ceil(Math.abs(delta)*Math.max(rx,ry)/.5)));
  for(let k=1;k<=steps;k++){const t=a+delta*k/steps;points.push([cx+rx*Math.cos(t)*cp-ry*Math.sin(t)*sp,cy+rx*Math.cos(t)*sp+ry*Math.sin(t)*cp]);}
 };
 let guard=0;
 while(i<tokens.length&&guard++<200000){
  if(isCmd(tokens[i]))cmd=tokens[i++];
  if(!cmd)break;
  let up=cmd.toUpperCase(),rel=cmd!==up,values,was=xy.slice();
  if(up==='Z'){if(points.length){finish();xy=start.slice();}cmd=null;control=null;prevCmd='Z';continue;}
  const length={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7}[up];
  if(!length)throw Error('SVG path contains unsupported command: '+cmd);
  values=get(length);if(!values){if(i<tokens.length&&isCmd(tokens[i]))continue;break;}
  if(up==='M'){if(points.length)finish();xy=pt(values[0],values[1],rel);start=xy.slice();points=[xy.slice()];cmd=rel?'l':'L';}
  if(up==='L'){xy=pt(values[0],values[1],rel);points.push(xy.slice());}
  if(up==='H'){xy=[rel?xy[0]+values[0]:values[0],xy[1]];points.push(xy.slice());}
  if(up==='V'){xy=[xy[0],rel?xy[1]+values[0]:values[0]];points.push(xy.slice());}
  if(up==='C'||up==='S'){
   const reflected=control&&['C','S'].includes(prevCmd)?[2*xy[0]-control[0],2*xy[1]-control[1]]:xy.slice();
   const a=up==='C'?pt(values[0],values[1],rel):reflected;
   const b=up==='C'?pt(values[2],values[3],rel):pt(values[0],values[1],rel);
   const end=up==='C'?pt(values[4],values[5],rel):pt(values[2],values[3],rel);
   cubic(xy,a,b,end);xy=end;control=b;
  }
  if(up==='Q'||up==='T'){
   const a=up==='Q'?pt(values[0],values[1],rel):(control&&['Q','T'].includes(prevCmd)?[2*xy[0]-control[0],2*xy[1]-control[1]]:xy.slice());
   const end=up==='Q'?pt(values[2],values[3],rel):pt(values[0],values[1],rel);
   cubic(xy,[xy[0]+2*(a[0]-xy[0])/3,xy[1]+2*(a[1]-xy[1])/3],[end[0]+2*(a[0]-end[0])/3,end[1]+2*(a[1]-end[1])/3],end);
   xy=end;control=a;
  }
  if(up==='A'){const end=pt(values[5],values[6],rel);arc(xy,values[0],values[1],values[2],!!values[3],!!values[4],end);xy=end;control=null;}
  if(!['C','S','Q','T'].includes(up))control=null;
  prevCmd=up;
 }
 // Do not silently close an open SVG path: this tool models filled closed metal.
 if(points.length&&close(points[0],points[points.length-1]))finish();
 return out;
}
function importSVG(text,sourceW,sourceH,crop,outputW,outputH,opt={}){
 if(typeof DOMParser==='undefined')throw Error('SVG direct import requires a browser DOMParser');
 if(text.length>3e6)throw Error('SVG is too large for safe local parsing');
 const doc=new DOMParser().parseFromString(text,'image/svg+xml');
 if(doc.querySelector('parsererror'))throw Error('SVG XML is malformed');
 const svg=doc.documentElement;if(svg.localName!=='svg')throw Error('Not an SVG document');
 const vb=(svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
 const box=vb.length===4&&vb.every(finite)&&vb[2]>0&&vb[3]>0?vb:[0,0,sourceW,sourceH];
 const rootM=[sourceW/box[2],0,0,sourceH/box[3],-box[0]*sourceW/box[2],-box[1]*sourceH/box[3]];
 const clipM=[outputW/crop.w,0,0,outputH/crop.h,-crop.x*outputW/crop.w,-crop.y*outputH/crop.h];
 const combined=mulMatrix(clipM,rootM);
 let loops=[],seen=0,skipped=0,exactCircles=0,curveSamples=0;
 const metadata={};
 function accepted(el){
  const style=el.getAttribute('style')||'',found=style.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i);
  const fill=svgColor(el.getAttribute('fill')||found?.[1]||'black');
  if(fill==='none')return false;
  if(opt.materialMode!=='color')return true;
  if(!Array.isArray(fill))return false;
  const target=opt.color||[255,255,0];
  return Math.hypot(...fill.map((v,i)=>v-target[i]))<=num(opt.colorTolerance,80);
 }
 function walk(parent,M){
  for(const el of parent.children||[]){
   if(['defs','metadata','clipPath','mask','script','style','pattern','symbol','foreignObject','filter'].includes(el.localName)){skipped++;continue;}
   const matrix=mulMatrix(M,svgMatrix(el.getAttribute('transform')||''));
   if(['svg','g','a'].includes(el.localName)){walk(el,matrix);continue;}
   if(!accepted(el))continue;
   const A=k=>num(el.getAttribute(k),0),type=el.localName;let shapes=[];
   if(type==='rect'){
    const x=A('x'),y=A('y'),w=A('width'),h=A('height');
    if(w>0&&h>0)shapes=[{points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]}];
   }else if(type==='circle'||type==='ellipse'){
    let cx=A('cx'),cy=A('cy'),rx=type==='circle'?A('r'):A('rx'),ry=type==='circle'?A('r'):A('ry');
    if(rx>0&&ry>0){
     const points=[];for(let i=0;i<128;i++){let t=i*Math.PI/64;points.push([cx+rx*Math.cos(t),cy+ry*Math.sin(t)]);}
     const dot=matrix[0]*matrix[2]+matrix[1]*matrix[3],sx=Math.hypot(matrix[0],matrix[1]),sy=Math.hypot(matrix[2],matrix[3]);
     const isCircle=Math.abs(rx*sx-ry*sy)<1e-6*Math.max(1,rx*sx,ry*sy)&&Math.abs(dot)<1e-8;
     if(isCircle){
      const c=transform(matrix,[cx,cy]),r=rx*sx,dir=matrix[0]*matrix[3]-matrix[1]*matrix[2]>=0?1:-1,start=transform(matrix,[cx+rx,cy]);
      const begin=Math.atan2(start[1]-c[1],start[0]-c[0]),curves=[];
      for(let j=0;j<4;j++){
       const u=begin+dir*j*Math.PI/2,v=begin+dir*(j+1)*Math.PI/2;
       curves.push({kind:'arc',start:[c[0]+r*Math.cos(u),c[1]+r*Math.sin(u)],end:[c[0]+r*Math.cos(v),c[1]+r*Math.sin(v)],center:c.slice(),sweep:dir*Math.PI/2});
      }
      shapes=[{points:curves.map(s=>s.start),curves,transformed:true}];exactCircles++;
     }else{shapes=[{points}];curveSamples++;}
    }
   }else if(type==='polygon'||type==='polyline'){
    const v=(el.getAttribute('points')||'').match(/[-+]?(?:\d*\.?\d+|\d+\.?)(?:e[-+]?\d+)?/gi)||[];
    let p=[];for(let j=0;j+1<v.length;j+=2)p.push([Number(v[j]),Number(v[j+1])]);
    if(type==='polygon'||p.length>2&&close(p[0],p[p.length-1]))shapes=[{points:tidy(p)}];
   }else if(type==='path'){
    shapes=svgPath(el.getAttribute('d')||'');curveSamples++;
   }else if(type==='line'){skipped++;continue;}
   else{skipped++;continue;}
   for(const shape of shapes){
    let transformed=shape.transformed?shape.points:shape.points.map(p=>transform(matrix,p));
    const converted=tidy(transformed);
    if(converted.length<3)continue;
    // Simple primitives keep native arcs; freeform paths are sampled.
    const curves=shape.curves?.map(s=>({...s}));
    loops.push({points:converted,...(curves?{curves}:{})});seen++;
   }
  }
 }
 walk(svg,combined);
 loops=classify(loops);
 if(!loops.length)throw Error('No compatible filled SVG paths found; check fill/color selection and paths');
 return {loops,info:{source:'svg-native',parsedShapes:seen,skipped,exactCircles,sampledCurves:curveSamples,viewBox:box}};
}
const api={generate,contoursIso,distanceChamfer,potraceStyle,marching,sdfContours,ransacHybrid,parametricRaster,importSVG,svgPath,svgMatrix,validCandidate,rasterize,maskTopology,classify};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.FSSAdvanced=api;
})(typeof self!=='undefined'?self:globalThis);

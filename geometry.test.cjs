const fs=require('fs'),assert=require('assert'),C=require('./core.js');
// Every nonempty 4x4 bitmap, including holes and all point-touch configurations.
for(let bits=1;bits<65536;bits++){
 const r=C.contours(Uint8Array.from({length:16},(_,i)=>(bits>>i)&1),4,4);
 assert.equal(-r.loops.reduce((s,q)=>s+C.area(q.points),0),r.pixels);
 for(let q of r.loops)assert.equal(new Set(q.points.map(p=>p.join(','))).size,q.points.length);
}
let w=400,h=400,rgba=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 let ring=x>=60&&x<340&&y>=60&&y<340&&!(x>=105&&x<295&&y>=105&&y<295);
 let island=x>=180&&x<220&&y>=180&&y<220;
 let i=(y*w+x)*4,v=ring||island?17:255;rgba.set([v,v,v,255],i);
}
let r=C.vectorize(rgba,w,h,{threshold:127,minPixels:1});
assert.equal(r.loops.filter(q=>q.hole).length,1);assert.equal(r.loops.length,3);
let g=C.scale(r,{width:20,height:20,reference:'image',center:true});
assert.equal(g.sx,.05);assert.equal(g.sy,.05);
let measured=C.measureSegments(g);
assert.equal(measured.length,g.loops.reduce((n,q)=>n+q.points.length,0));
assert(measured.every(s=>s.length>0&&Math.abs(s.length-Math.hypot(s.x2-s.x1,s.y2-s.y1))<1e-12));
assert.equal(measured.filter(s=>s.hole).length,g.loops.filter(q=>q.hole).reduce((n,q)=>n+q.points.length,0));
let outerEdges=measured.filter(s=>s.loopIndex===0);
assert.equal(outerEdges.reduce((n,s)=>n+s.dx,0),0);
assert.equal(outerEdges.reduce((n,s)=>n+s.dy,0),0);
assert.deepEqual([Math.min(...g.loops.flatMap(q=>q.points.map(p=>p[0]))),Math.max(...g.loops.flatMap(q=>q.points.map(p=>p[0])))],[-7,7]);
for(let q of g.loops)assert.equal(C.area(q.points)>0,!q.hole);
let gp=C.scale(r,{width:20,height:10,reference:'pattern',center:false});
assert.equal(Math.max(...gp.loops.flatMap(q=>q.points.map(p=>p[0]))),20);
assert.equal(Math.max(...gp.loops.flatMap(q=>q.points.map(p=>p[1]))),10);
let t=new Uint8ClampedArray([0,0,0,0,0,0,0,255]);let tr=C.vectorize(t,2,1,{threshold:127,minPixels:1});assert.equal(tr.pixels,1);
assert.throws(()=>C.contours(new Uint8Array(4),2,2));
let thin=C.contours(Uint8Array.from([1,1,1,0,0,0,1,1,1]),3,3);assert.equal(thin.loops.length,2);
let noise=C.vectorize(Uint8ClampedArray.from([0,0,0,255,255,255,255,255,0,0,0,255,0,0,0,255]),4,1,{threshold:127,minPixels:2});assert.equal(noise.removed,1);assert.equal(noise.pixels,2);
let inverted=C.vectorize(rgba,w,h,{threshold:127,minPixels:1,light:true});assert.equal(inverted.pixels+r.pixels,w*h);
// A long 45-degree boundary becomes six CAD vertices without changing its raster topology.
let dw=192,dh=192,diagonal=new Uint8ClampedArray(dw*dh*4);
for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
 const metal=x>=20&&x<170&&y>=20&&y<170&&x+y>=90&&x+y<240;
 let v=metal?20:255;diagonal.set([v,v,v,255],4*(y*dw+x));
}
let steps=C.vectorize(diagonal,dw,dh,{threshold:127,smooth:false});
let fitted=C.vectorize(diagonal,dw,dh,{threshold:127,tolerance:1.25});
assert.equal(steps.loops.length,1);assert.equal(fitted.loops.length,1);
assert(steps.loops[0].points.length>200);assert(fitted.loops[0].points.length<=8);
assert.equal(fitted.changedPixels,0);assert.equal(fitted.smoothed,1);
assert.deepEqual(fitted.bounds,steps.bounds);
// A one-pixel open slit must survive both output modes.
let slit=new Uint8ClampedArray(128*128*4);
for(let y=0;y<128;y++)for(let x=0;x<128;x++){
 const metal=x>=20&&x<108&&y>=20&&y<108&&!(x===64&&y>=20&&y<100);
 let v=metal?0:255;slit.set([v,v,v,255],4*(y*128+x));
}
let exactSlit=C.vectorize(slit,128,128,{threshold:127,smooth:false});
let smoothSlit=C.vectorize(slit,128,128,{threshold:127,tolerance:1.25});
assert.equal(smoothSlit.changedPixels,0);assert.deepEqual(smoothSlit.loops,exactSlit.loops);
// Colored FSS cell: yellow conductor, cyan dielectric, four dielectric apertures.
let cw=80,ch=80,colors=new Uint8ClampedArray(cw*ch*4),yellow=0;
for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
 const border=x>=4&&x<76&&y>=4&&y<76&&(x<9||x>=71||y<9||y>=71);
 const cross=x>=4&&x<76&&y>=4&&y<76&&(x>=38&&x<42||y>=38&&y<42);
 let metal=border||cross,rgba=metal?[254,254,0,255]:[0,177,242,255];
 colors.set(rgba,4*(y*cw+x));yellow+=metal;
}
let colored=C.vectorize(colors,cw,ch,{materialMode:'color',color:[255,255,0],colorTolerance:80,smooth:true,tolerance:1.25});
assert.equal(colored.pixels,yellow);assert.equal(colored.loops.filter(q=>!q.hole).length,1);
assert.equal(colored.loops.filter(q=>q.hole).length,4);
assert.equal(colored.bounds[0],4);assert.equal(colored.bounds[2],76);
assert.throws(()=>C.vectorize(colors,cw,ch,{materialMode:'color',color:[300,255,0]}));
let blue=C.vectorize(colors,cw,ch,{materialMode:'color',color:[0,177,242],colorTolerance:40,smooth:false});
assert.equal(blue.pixels,cw*ch-yellow);
// Angled metal with a rectangular aperture remains topologically stable,
// and the 8 mm DXF contains straight line entities without arc bulges.
let rw=256,rh=256,slanted=new Uint8ClampedArray(rw*rh*4);
for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
 let metal=x>=18&&x<238&&y>=18&&y<238&&x+y>105&&x+y<365&&!(x>=105&&x<148&&y>=105&&y<148);
 let v=metal?15:255,i=4*(y*rw+x);slanted.set([v,v,v,255],i);
}
let jagged=C.vectorize(slanted,rw,rh,{threshold:127,smooth:false});
let fittedSlanted=C.vectorize(slanted,rw,rh,{threshold:127,tolerance:1.25});
assert.equal(fittedSlanted.loops.filter(q=>q.hole).length,1);
assert.equal(fittedSlanted.changedPixels,0);
assert(fittedSlanted.loops.reduce((n,q)=>n+q.points.length,0)<jagged.loops.reduce((n,q)=>n+q.points.length,0)/4);
for(let loop of fittedSlanted.loops){
 assert(loop.points.length>=3);
 assert.equal(C.area(loop.points)>0,loop.hole);
}
let physical=C.scale(fittedSlanted,{width:8,height:8,reference:'image',center:true});
let measuredSlanted=C.measureSegments(physical);
assert.equal(measuredSlanted.length,fittedSlanted.loops.reduce((n,q)=>n+q.points.length,0));
assert(measuredSlanted.every(s=>Number.isFinite(s.length)&&s.length>0));
let polyDxf=C.dxf(physical,{entity:'LWPOLYLINE'});
assert.equal(polyDxf.split('LWPOLYLINE').length-1,physical.loops.length);
assert(!polyDxf.includes(String.fromCharCode(13,10)+'42'+String.fromCharCode(13,10)));
let lineDxf=C.dxf(physical,{entity:'LINE'});
assert.equal(lineDxf.split('AcDbLine'+String.fromCharCode(13,10)).length-1,measuredSlanted.length);
assert.deepEqual(smoothSlit.loops,exactSlit.loops);
// A pixel-staircase with a repeated 3 px raster-threshold spur used to
// force whole-ring fallback. Long diagonal runs must be straightened locally.
let noisyN=320,noisyImage=new Uint8ClampedArray(noisyN*noisyN*4);
for(let y=0;y<noisyN;y++)for(let x=0;x<noisyN;x++){
 const metal=x>12&&x<307&&y>12&&y<307&&x+y>125+(x%19===0?3:0)&&x+y<420
       &&!(x>115&&x<206&&y>115&&y<206);
 const v=metal?0:255,i=(y*noisyN+x)*4;
 noisyImage.set([v,v,v,255],i);
}
let noisyExact=C.vectorize(noisyImage,noisyN,noisyN,{threshold:127,smooth:false});
let noisyFixed=C.vectorize(noisyImage,noisyN,noisyN,{threshold:127,tolerance:1.25});
let vertices=x=>x.loops.reduce((s,q)=>s+q.points.length,0);
assert(vertices(noisyExact)>500);
assert(vertices(noisyFixed)<130, 'threshold spikes should not create hundreds of DXF segments');
assert.equal(noisyFixed.loops.length,noisyExact.loops.length);
assert.equal(noisyFixed.loops.filter(q=>q.hole).length,1);
assert(noisyFixed.straightenedRuns>0);
assert(noisyFixed.staircaseVerticesRemoved>300);
for(let loop of noisyFixed.loops){
 assert(loop.points.length>=3);
 assert.equal(C.area(loop.points)>0,loop.hole);
}
let noisyGeometry=C.scale(noisyFixed,{width:8,height:8,reference:'image',center:true});
let noisySegments=C.measureSegments(noisyGeometry);
assert.equal(noisySegments.length,vertices(noisyFixed));
assert(noisySegments.every(s=>s.length>0&&Number.isFinite(s.length)));
assert.equal(C.dxf(noisyGeometry).split('LWPOLYLINE').length-1,noisyFixed.loops.length);
assert.equal(C.dxf(noisyGeometry,{entity:'LINE'}).split('AcDbLine'+String.fromCharCode(13,10)).length-1,noisySegments.length);
assert(!C.dxf(noisyGeometry).includes(String.fromCharCode(13,10)+'42'+String.fromCharCode(13,10)));
// The user-facing pixel-exact mode and one-pixel open slit must remain intact.
assert.deepEqual(smoothSlit.loops,exactSlit.loops);

// Manual editor: a deleted segment creates a visible temporary open contour,
// which is measurable but must never be exported as a silently closed DXF.
let manualSquare=[{hole:false,points:[[0,0],[12,0],[12,12],[0,12]]}];
let draft=C.editContours(manualSquare,{type:'removeSegment',loopIndex:0,index:1});
assert(draft[0].open);
assert.equal(draft[0].points.length,4);
assert.equal(C.measureSegments({loops:draft}).length,3);
assert.equal(manualSquare[0].points.length,4); // immutable snapshots
let draftMm=C.scale({loops:draft,w:12,h:12,bounds:[0,0,12,12]},
 {width:12,height:12,reference:'image',center:false});
assert.throws(()=>C.dxf(draftMm));
assert(C.openContours(draftMm));
let rejoined=C.editContours(draft,{type:'connect',loopIndex:0,from:0,to:3});
assert(!rejoined[0].open);
assert.equal(C.measureSegments({loops:rejoined}).length,4);
assert(C.dxf(C.scale({loops:rejoined,w:12,h:12,bounds:[0,0,12,12]},
 {width:12,height:12,reference:'image',center:false})).includes('LWPOLYLINE'));
// Delete a vertex and automatically connect its two neighbors.
let removedPoint=C.editContours(manualSquare,{type:'removeVertex',loopIndex:0,index:1});
assert.equal(removedPoint[0].points.length,3);
assert.equal(C.area(removedPoint[0].points),72);
// Connect two nonadjacent points on one closed contour: replace the shorter
// part of the old boundary (the user's jagged diagonal) with one straight line.
let staircase=[{hole:false,points:[[0,0],[3,0],[3,1],[6,1],[6,3],[10,3],[10,12],[0,12]]}];
let shortcut=C.editContours(staircase,{type:'connect',loopIndex:0,from:0,to:5});
assert(shortcut[0].points.length<staircase[0].points.length);
assert.equal(shortcut[0].open,undefined);
assert.equal(Math.sign(C.area(shortcut[0].points)),Math.sign(C.area(staircase[0].points)));
// Insert a vertex without changing the closed metal outline.
let inserted=C.editContours(manualSquare,{type:'insertVertex',loopIndex:0,index:0,x:6,y:0});
assert.equal(inserted[0].points.length,5);
assert.equal(C.area(inserted[0].points),C.area(manualSquare[0].points));
// Reject impossible edits, accidental connections, and degenerate output.
assert.throws(()=>C.editContours(manualSquare,{type:'removeVertex',loopIndex:0,index:99}));
assert.throws(()=>C.editContours(manualSquare,{type:'connect',loopIndex:0,from:0,to:1}));
assert.throws(()=>C.editContours(draft,{type:'removeSegment',loopIndex:0,index:0}));
assert.throws(()=>C.editContours(manualSquare,{type:'insertVertex',loopIndex:0,index:0,x:0,y:0}));
assert.equal(C.cloneLoops(manualSquare)[0].points[0][0],0);

// Symmetry assisted straight lines: detect vertical/horizontal/180-degree
// symmetry from foreground pixels, and do not infer symmetry for arbitrary art.
function symmetryImage(n,which){
 const rgba=new Uint8ClampedArray(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const diamond=Math.abs(x-89.5)+Math.abs(y-89.5)<58;
  const hole=x>=80&&x<100&&y>=82&&y<98;
  const ramp=y>=20&&y<145&&x>=40+Math.floor((y-20)/6)&&x<140-Math.floor((y-20)/6);
  const asymmetric=x>15&&x<100&&y>15&&y<130&&x+y>100&&!(x>70&&x<90&&y<40);
  const metal=which==='diamond'?diamond:which==='diamond-hole'?diamond&&!hole:which==='vertical'?ramp:asymmetric;
  const v=metal?0:255,i=4*(y*n+x);
  rgba.set([v,v,v,255],i);
 }
 return rgba;
}
const diamondImage=symmetryImage(180,'diamond');
const diamondRaw=C.vectorize(diamondImage,180,180,{threshold:127,smooth:false});
for(const axis of ['vertical','horizontal','rotation'])assert.equal(diamondRaw.symmetry.scores[axis],1);
assert.deepEqual(diamondRaw.symmetry.axes,['vertical','horizontal','rotation']);
const diamondWithHole=C.vectorize(symmetryImage(180,'diamond-hole'),180,180,{threshold:127,smooth:false});
assert.equal(diamondWithHole.loops.filter(q=>q.hole).length,1);
assert.equal(diamondWithHole.symmetry.axes.length,3);
const verticalOnly=C.vectorize(symmetryImage(180,'vertical'),180,180,{threshold:127,smooth:false});
assert.deepEqual(verticalOnly.symmetry.axes,['vertical']);
const asymmetric=C.vectorize(symmetryImage(180,'asymmetric'),180,180,{threshold:127,smooth:false});
assert.deepEqual(asymmetric.symmetry.axes,[]);
assert.equal(asymmetric.symmetryStraightened,0);
// Retain three clean mirrored diamond edges but leave one raster staircase:
// symmetry-matched lines must replace it rather than leaving pixel segments.
const diamondPoints=diamondRaw.loops[0].points,extremeIds=[0,1].flatMap(axis=>[-1,1].map(sign=>
 diamondPoints.reduce((best,p,i)=>sign*p[axis]>sign*diamondPoints[best][axis]?i:best,0))).sort((a,b)=>a-b);
const selected=new Set(extremeIds);
for(let i=extremeIds[1]+1;i<extremeIds[2];i++)selected.add(i);
const hybrid=diamondPoints.filter((_,i)=>selected.has(i));
const symmetryLoops=[{hole:diamondRaw.loops[0].hole,points:hybrid.map(p=>p.slice())}];
const diff=[0],symFix=C.symmetryAssistedStraightening(diamondRaw,symmetryLoops,diff,diamondRaw.symmetry);
assert(symFix.count>0);
assert(symFix.removed>=30);
assert(symmetryLoops[0].points.length<hybrid.length/2);
assert.equal(Math.sign(C.area(symmetryLoops[0].points)),Math.sign(C.area(diamondPoints)));
const symmetricGeometry=C.scale({...diamondRaw,loops:symmetryLoops},
 {width:8,height:8,reference:'image',center:true});
assert(C.dxf(symmetricGeometry).includes('LWPOLYLINE'));
assert.equal(C.measureSegments(symmetricGeometry).length,symmetryLoops[0].points.length);
// Exact pixel mode continues to give unchanged pixel boundaries even when
// the pattern is perfectly symmetric; user manual edits remain separate.
assert.equal(diamondRaw.symmetryStraightened,0);
assert.equal(diamondRaw.loops[0].points.length,diamondPoints.length);
const observe=C.vectorize(diamondImage,180,180,{threshold:127,symmetryMode:'observe'});
const disabled=C.vectorize(diamondImage,180,180,{threshold:127,symmetryMode:'off'});
assert.deepEqual(observe.loops,disabled.loops);
assert.equal(observe.symmetryStraightened,0);
assert.equal(disabled.symmetryStraightened,0);

// Changing the symmetry confidence threshold changes whether a near-symmetric
// mask qualifies; the detector must not silently force symmetry at 99%.
let thresholdImage=new Uint8ClampedArray(140*140*4);
for(let y=0;y<140;y++)for(let x=0;x<140;x++){
 let metal=x>=20&&x<120&&y>=20&&y<120&&!(x>=20&&x<30&&y>=20&&y<50);
 let v=metal?0:255,i=4*(y*140+x);thresholdImage.set([v,v,v,255],i);
}
let looseSymmetry=C.vectorize(thresholdImage,140,140,{threshold:127,smooth:false,symmetryThreshold:.95});
let strictSymmetry=C.vectorize(thresholdImage,140,140,{threshold:127,smooth:false,symmetryThreshold:.99});
assert(looseSymmetry.symmetry.axes.includes('vertical'));
assert(!strictSymmetry.symmetry.axes.includes('vertical'));
assert.equal(looseSymmetry.symmetryStraightened,0);
let repairedHole=C.vectorize(symmetryImage(180,'diamond-hole'),180,180,{threshold:127,symmetryMode:'auto'});
assert.equal(repairedHole.loops.filter(l=>l.hole).length,1);
assert.equal(typeof repairedHole.symmetrySnappedSegments,'number');
assert.equal(C.openContours(C.scale(repairedHole,{width:8,height:8,reference:'image',center:true})),false);
const dir=process.argv[2];if(dir){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/fss_demo_20x20mm.dxf',C.dxf(g));fs.writeFileSync(dir+'/fss_demo_lines.dxf',C.dxf(g,{entity:'LINE',guide:true}));fs.writeFileSync(dir+'/fss_demo_parameters.json',JSON.stringify({unit:'mm',cell_mm:[20,20],metal_bounds_mm:[-7,-7,7,7],loops:g.loops},null,2));}
console.log('PASS: exhaustive 65,535 bitmaps; yellow metal/cyan dielectric and four holes; color validation; 45-degree fitting; 1px slit; scaling; winding; alpha; polarity; denoising');


// Hybrid mode: a binary disc with a central hole keeps topology and exports native arcs
{
 const n=150,pix=new Uint8ClampedArray(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const d=Math.hypot(x-75.25,y-75.25),metal=d<=38&&d>=13,v=metal?0:255,k=4*(y*n+x);
  pix.set([v,v,v,255],k);
 }
 const legacy=C.vectorize(pix,n,n,{threshold:127,tolerance:1.25});
 const hybrid=C.vectorize(pix,n,n,{threshold:127,tolerance:1.25,vectorMode:'hybrid'});
 assert.equal(hybrid.loops.length,legacy.loops.length);
 assert.equal(hybrid.loops.filter(l=>l.hole).length,legacy.loops.filter(l=>l.hole).length);
 assert(hybrid.hybrid&&hybrid.hybrid.arcs>0,'混合模式必须至少将圆环识别为一段原生圆弧');
 const shape=C.scale(hybrid,{width:30,height:30,reference:'image',center:true});
 const cad=C.dxf(shape);
 assert(cad.includes('LWPOLYLINE'));
 assert(cad.includes('\r\n42\r\n'));
 const lines=C.dxf(shape,{entity:'LINE'});
 assert(!lines.includes('\r\n42\r\n'));
 const distortion=C.scale(hybrid,{width:40,height:30,reference:'image',center:true});
 assert(!C.dxf(distortion).includes('\r\n42\r\n'));
 const edited=C.editContours(hybrid.loops,{type:'insertVertex',loopIndex:0,index:0,
  x:(hybrid.loops[0].points[0][0]+hybrid.loops[0].points[1][0])/2,
  y:(hybrid.loops[0].points[0][1]+hybrid.loops[0].points[1][1])/2});
 assert(!edited[0].curves);
}

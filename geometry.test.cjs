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
const dir=process.argv[2];if(dir){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/fss_demo_20x20mm.dxf',C.dxf(g));fs.writeFileSync(dir+'/fss_demo_lines.dxf',C.dxf(g,{entity:'LINE',guide:true}));fs.writeFileSync(dir+'/fss_demo_parameters.json',JSON.stringify({unit:'mm',cell_mm:[20,20],metal_bounds_mm:[-7,-7,7,7],loops:g.loops},null,2));}
console.log('PASS: exhaustive 65,535 bitmaps; yellow metal/cyan dielectric and four holes; color validation; 45-degree fitting; 1px slit; scaling; winding; alpha; polarity; denoising');

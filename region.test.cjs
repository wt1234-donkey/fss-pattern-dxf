'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('./core.js'),A=require('./advanced.js'),R=require('./redraw.js'),G=require('./codegen.js');
const n=128,fill=[212,214,212],ink=[175,175,175],white=[255,255,255],opt={materialMode:'color',color:fill,colorTolerance:33,minPixels:1,vectorMode:'exact',smooth:false,drawingStrokeWidth:3};
function bitmap(fn){const d=new Uint8ClampedArray(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++)d.set([...fn(x,y),255],4*(y*n+x));return d;}
const inBox=(x,y,a,b)=>x>=a&&x<b&&y>=a&&y<b;
// Gray fill and dark printed border, with a sampled-gray anti-alias halo OUTSIDE the border.
const source=bitmap((x,y)=>!inBox(x,y,20,108)?white:!inBox(x,y,21,107)?fill:!inBox(x,y,24,104)?ink:fill);
const raw=A.generate(source,n,n,opt);assert.equal(raw.loops.length,3,'old color window splits fill, dark edge and halo');
for(const mode of ['exact','fit','hybrid','potrace','marching','sdf','ransac','cadsvg']){
 const r=A.generate(source,n,n,{...opt,boundaryMode:'unified-region',vectorMode:mode});
 assert.equal(r.loops.length,1,mode+' exports one boundary for one filled region');assert(r.regionInterpretation.addedStrokePixels>0);assert(r.regionInterpretation.removedFringePixels>0);
 assert.equal(r.mask[64*n+23],1,'printed edge belongs to the same shape as fill');assert.equal(r.mask[64*n+64],1);
 const g=C.scale(r,{width:12.8,height:12.8,reference:'image',center:true}),dxf=C.dxf(g);
 assert.equal((dxf.match(/\r\nLWPOLYLINE\r\n/g)||[]).length,1,'one DXF entity, not a fill entity plus a border entity');
 const graph=new Set();for(const l of r.loops)for(let i=0;i<l.points.length;i++){
  const a=l.points[i].join(','),b=l.points[(i+1)%l.points.length].join(','),key=[a,b].sort().join('|');assert(!graph.has(key),'each boundary edge appears once');graph.add(key);
 }
 assert(R.evaluate(R.fromResult(r),r).ok);assert(G.generatedPython(g,{kind:'dxf'}).includes('LOOPS_MM'));
}
// Real white holes, 1-pixel slits and neighboring cyan regions are NOT material-colored printed strokes.
for(const holeColor of [white,[214,255,255]]){
 const d=bitmap((x,y)=>inBox(x,y,15,113)?inBox(x,y,50,78)?holeColor:fill:white);
 const r=A.generate(d,n,n,{...opt,boundaryMode:'unified-region'});assert.equal(r.mask[64*n+64],0);assert.equal(r.loops.filter(l=>l.hole).length,1);
}
const slit=bitmap((x,y)=>x>=20&&x<108&&y>=20&&y<108&&x!==64?fill:white);
const sr=A.generate(slit,n,n,{...opt,boundaryMode:'unified-region'});for(let y=20;y<108;y++)assert.equal(sr.mask[y*n+64],0);assert.equal(sr.loops.filter(l=>!l.hole).length,2);
// The seed color may be non-gray; a neutral dark printed border is still attached to that material.
const yellow=bitmap((x,y)=>!inBox(x,y,20,108)?white:!inBox(x,y,24,104)?ink:[255,230,20]);
const yr=A.generate(yellow,n,n,{...opt,color:[255,230,20],colorTolerance:40,boundaryMode:'unified-region'});assert.equal(yr.loops.length,1);assert(yr.regionInterpretation.addedStrokePixels>0);
// User-protected tiny islands, excluded pixels and intentionally repaired pixels survive region interpretation.
const d=bitmap((x,y)=>inBox(x,y,30,100)||x===10&&y===10?fill:white),codes=new Uint8Array(n*n);codes[10*n+10]=2;codes[64*n+64]=1;codes[15*n+15]=3;
const pr=A.generate(d,n,n,{...opt,pixelOverrides:codes,boundaryMode:'unified-region'});assert.equal(pr.mask[10*n+10],1);assert.equal(pr.mask[64*n+64],0);assert.equal(pr.mask[15*n+15],1);assert(C.checkPixelOverrides(pr.loops,pr));
// Pure fine-line images lack a filled interior: retain their original pixels rather than erase them.
const fine=bitmap((x,y)=>y===64&&x>=15&&x<113?fill:white),fr=A.generate(fine,n,n,{...opt,boundaryMode:'unified-region'});assert(fr.regionInterpretation.fallback);assert.deepEqual(fr.mask,A.generate(fine,n,n,opt).mask);
// Explicit compatibility mode remains reversible and does not apply filled-region interpretation.
assert.deepEqual(A.generate(source,n,n,{...opt,boundaryMode:'region'}).mask,raw.mask);
// Worker and downloadable single-file source are exactly the same implementation.
const html=fs.readFileSync('index.html','utf8'),inline=id=>html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))[1];
assert.equal(inline('region-code'),fs.readFileSync('region.js','utf8'));assert(html.includes("$('region-code').textContent"));assert(html.includes('&&!d.result.regionInterpretation'));
let response;const ctx={self:{postMessage:r=>response=r}};vm.createContext(ctx);vm.runInContext(inline('core-code')+'\n'+inline('advanced-code')+'\n'+inline('region-code')+'\nself.onmessage=e=>{const d=e.data;self.postMessage(self.FSSAdvanced.generate(d.rgba,d.w,d.h,d.opt));};',ctx);
ctx.self.onmessage({data:structuredClone({rgba:source,w:n,h:n,opt:{...opt,boundaryMode:'unified-region'}})});assert.equal(response.loops.length,1);assert(response.regionInterpretation.addedStrokePixels>0);
console.log('PASS: fill+stroke+halo become one region/one DXF boundary; no duplicate edges; holes, 1px slits, cyan areas, protected islands, repair, thin-line fallback, redraw/Python and Worker/offline parity');

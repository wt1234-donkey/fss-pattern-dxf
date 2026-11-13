'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('./core.js'),A=require('./advanced.js'),R=require('./redraw.js'),G=require('./codegen.js');
function bitmap(n,on){const d=new Uint8ClampedArray(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=on(x+.5,y+.5)?0:255;d.set([v,v,v,255],4*(y*n+x));}return d;}
const region=(x,y,a,b)=>x>=a&&x<b&&y>=a&&y<b;
const n=160,stroke=(x,y,a,b,width)=>region(x,y,a-width/2,b+width/2)&&!region(x,y,a+width/2,b-width/2),base={threshold:127,minPixels:1,vectorMode:'exact',smooth:false};
// Two drawing strokes are the outer and inner boundaries of ONE real metal band.
for(const width of [2,4,6]){
 const d=bitmap(n,(x,y)=>stroke(x,y,20,140,width)||stroke(x,y,50,110,width));
 const filled=A.generate(d,n,n,base);assert.equal(filled.loops.length,4,'original stroke envelopes have doubled boundaries');
 for(const mode of ['exact','fit','hybrid','potrace','marching','sdf','ransac','cadsvg']){
  const r=A.generate(d,n,n,{...base,vectorMode:mode,boundaryMode:'stroke-center',drawingStrokeWidth:width});
  assert.equal(r.drawingStroke.collapsed,2,mode+' recognizes both thin closed drawing strokes');
  assert.equal(r.loops.length,2,mode+' outputs ONE outer and ONE inner boundary');
  assert.deepEqual(A.maskTopology(r.mask,n,n),[1,1],mode+' reconstructs a real band, preserving its hole');
  assert.equal(r.mask[30*n+80],1);assert.equal(r.mask[80*n+80],0);assert.equal(r.mask[10*n+80],0);
  assert.deepEqual(r.bounds,[20,20,140,140],'design boundary is independent of drawing stroke width');
  const areas=r.loops.map(l=>Math.abs(C.area(l.points))).sort((a,b)=>a-b);assert(Math.abs(areas[0]-3600)<130,'inner boundary stays at the drawn design line');
 }
}
// Genuine conductor width is retained by default and by the thin-stroke size guard.
const real=bitmap(n,(x,y)=>region(x,y,20,140)&&!region(x,y,50,110));
const unchanged=A.generate(real,n,n,{...base,boundaryMode:'stroke-center',drawingStrokeWidth:3});
assert.equal(unchanged.drawingStroke.collapsed,0);assert.equal(unchanged.drawingStroke.widePreserved,1);
assert.deepEqual(unchanged.mask,A.generate(real,n,n,base).mask);
// Circular and diagonal drawing strokes also produce one centered contour, not a narrow ribbon.
const circle=bitmap(n,(x,y)=>Math.abs(Math.hypot(x-80,y-80)-50)<2);
const c=A.generate(circle,n,n,{...base,boundaryMode:'stroke-center',drawingStrokeWidth:4});assert.equal(c.drawingStroke.collapsed,1);assert.equal(c.loops.length,1);assert.equal(c.mask[80*n+80],1);assert(Math.abs(c.pixels-Math.PI*2500)<200);
const diamond=bitmap(n,(x,y)=>Math.abs(Math.abs(x-80)+Math.abs(y-80)-50)<2);
const dg=A.generate(diamond,n,n,{...base,boundaryMode:'stroke-center',drawingStrokeWidth:4});assert.equal(dg.drawingStroke.collapsed,1);assert.equal(dg.loops.length,1);assert.equal(dg.mask[80*n+80],1);
// An open stroke or a graph with multiple faces must not be invented into a closed boundary.
const open=bitmap(n,(x,y)=>x>=20&&x<100&&y>=30&&y<34),o=A.generate(open,n,n,{...base,boundaryMode:'stroke-center',drawingStrokeWidth:4});assert.equal(o.drawingStroke.collapsed,0);assert(o.drawingStroke.unresolved>0);
const branch=bitmap(n,(x,y)=>stroke(x,y,20,140,4)||x>=78&&x<82&&y>=20&&y<140),br=A.generate(branch,n,n,{...base,boundaryMode:'stroke-center',drawingStrokeWidth:4});assert.equal(br.drawingStroke.collapsed,0);assert(br.drawingStroke.unresolved>0);
// Exclusion, metal repair and protected source strokes remain hard constraints after interpretation.
const source=bitmap(n,(x,y)=>stroke(x,y,20,140,4)||stroke(x,y,50,110,4)),codes=new Uint8Array(n*n);codes[30*n+80]=1;codes[80*n+80]=3;
const cleaned=A.generate(source,n,n,{...base,boundaryMode:'stroke-center',drawingStrokeWidth:4,pixelOverrides:codes});assert.equal(cleaned.mask[30*n+80],0);assert.equal(cleaned.mask[80*n+80],1);assert(C.checkPixelOverrides(cleaned.loops,cleaned));assert(R.evaluate(R.fromResult(cleaned),cleaned).ok);
const protectedCodes=new Uint8Array(n*n);protectedCodes[19*n+80]=2;
const p=A.generate(source,n,n,{...base,boundaryMode:'stroke-center',drawingStrokeWidth:4,pixelOverrides:protectedCodes});assert.equal(p.drawingStroke.protectedPreserved,1);assert.equal(p.mask[19*n+80],1);
// Direct DXF, code and redraw all consume the reconstructed area boundaries.
const out=A.generate(source,n,n,{...base,boundaryMode:'stroke-center',drawingStrokeWidth:4});const g=C.scale(out,{width:16,height:16,reference:'image',center:true});
assert.equal((C.dxf(g).match(/\r\nLWPOLYLINE\r\n/g)||[]).length,2);assert(G.generatedPython(g,{kind:'pypssfss'}).includes('METAL')||G.generatedPython(g,{kind:'pypssfss'}).includes('LOOPS_MM'));
const B=require('./stroke-boundary.js');assert(B.suggestColorTolerance([218,240,235],[255,255,255]).tolerance<30);assert(B.suggestColorTolerance([209,210,209],[255,255,255]).tolerance<40);assert(B.suggestColorTolerance([0,0,0],[255,255,255]).tolerance===80);
// Worker and downloadable single-file parity, including the new semantic step.
const html=fs.readFileSync('index.html','utf8'),inline=id=>html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))[1];
assert.equal(inline('stroke-boundary-code'),fs.readFileSync('stroke-boundary.js','utf8'));assert(html.includes("$('stroke-boundary-code').textContent"));assert(html.includes('&&!d.result.drawingStroke'));
let received;const ctx={self:{postMessage:r=>received=r}};vm.createContext(ctx);vm.runInContext(inline('core-code')+'\n'+inline('advanced-code')+'\n'+inline('stroke-boundary-code')+'\nself.onmessage=e=>{const d=e.data;self.postMessage(self.FSSAdvanced.generate(d.rgba,d.w,d.h,d.opt));};',ctx);
ctx.self.onmessage({data:structuredClone({rgba:source,w:n,h:n,opt:{...base,boundaryMode:'stroke-center',drawingStrokeWidth:4}})});assert.equal(received.loops.length,2);assert.equal(received.drawingStroke.collapsed,2);
console.log('PASS: drawing widths 2/4/6 collapse once, real conductor width, holes, circles/diagonals, open/branched strokes, cleanup, redraw, DXF/Python and Worker/offline parity');

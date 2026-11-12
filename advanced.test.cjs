'use strict';
const assert=require('assert'),fs=require('fs'),C=require('./core.js'),A=require('./advanced.js');
function mask(w,h,fn){let v=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let c=fn(x+.5,y+.5)?0:255,k=4*(y*w+x);v.set([c,c,c,255],k);}return v;}
const W=120,H=120,ring=mask(W,H,(x,y)=>{let d=Math.hypot(x-60,y-60);return d>=18&&d<43;}),diagonal=mask(W,H,(x,y)=>x>15&&x<105&&y>15&&y<105&&Math.abs(x-y)<7),slit=mask(W,H,(x,y)=>x>=12&&x<108&&y>=12&&y<108&&!(x>=59&&x<61&&y<100));
for(const method of ['potrace','marching','ransac','sdf','cadsvg']){
 const opt={vectorMode:method,threshold:127,tolerance:1.25,sdfSmoothing:.25};
 const r=A.generate(ring,W,H,opt);
 assert.equal(r.advanced.engine,method);assert.equal(r.advanced.accepted,true,method+' ring');
 assert.equal(r.loops.length,2);assert.equal(r.loops.filter(l=>l.hole).length,1);
 const dxf=C.dxf(C.scale(r,{width:20,height:20,reference:'image',center:true}));
 assert(dxf.includes('LWPOLYLINE')&&dxf.includes('METAL_HOLE'));
 if(method==='ransac'||method==='cadsvg')assert(dxf.includes('\r\n42\r\n'),'native arc '+method);
 const d=A.generate(diagonal,W,H,opt);assert.equal(d.loops.length,1,'diagonal '+method);
 const s=A.generate(slit,W,H,opt),scanned=A.rasterize(s.loops,W,H);
 assert(scanned,'raster continuity '+method);
 assert.deepEqual(A.maskTopology(scanned,W,H),A.maskTopology(C.vectorize(slit,W,H,{threshold:127,smooth:false}).mask,W,H),'slit '+method);
}
assert.equal(A.generate(ring,W,H,{vectorMode:'exact',threshold:127}).advanced,undefined);
assert(A.svgPath('M10 20 Q30 0 50 20 C70 40 80 40 90 20 L90 80 L10 80 Z')[0].points.length>30);
assert(A.svgPath('M5 10 A20 20 0 0 1 45 10 L45 45 L5 45 Z')[0].points.length>10);
assert.equal(A.svgPath('M0 0 L10 0 L10 10').length,0,'never silently close open SVG');
function el(localName,attrs={},children=[]){return {localName,children,getAttribute(k){return attrs[k]??null;}};}
const root=el('svg',{viewBox:'0 0 100 100'},[el('rect',{x:'3',y:'5',width:'24',height:'40'}),el('circle',{cx:'65',cy:'50',r:'15'}),el('path',{d:'M30 80 L50 80 L50 90 L30 90 Z'}),el('rect',{x:'70',y:'80',width:'20',height:'15',rx:'4',ry:'4'})]);
const saved=global.DOMParser;
global.DOMParser=class{parseFromString(){return {documentElement:root,querySelector(){return null;}};}};
const svg=A.importSVG('<svg/>',100,100,{x:0,y:0,w:100,h:100},100,100,{materialMode:'gray'});
assert.equal(svg.info.parsedShapes,4);assert.equal(svg.info.exactCircles,1);assert(svg.loops.some(l=>l.points.length>50&&!l.curves),'rounded rectangle should keep curved corners');
const arcs=svg.loops.filter(l=>l.curves?.some(s=>s.kind==='arc'));assert.equal(arcs.length,1);
assert(C.dxf(C.scale({loops:arcs,bounds:[0,0,100,100],w:100,h:100},{width:20,height:20,reference:'image',center:true})).includes('\r\n42\r\n'));
assert.throws(()=>A.importSVG('<svg/>',100,100,{x:0,y:0,w:100,h:100},100,100,{materialMode:'color',color:[255,255,0],colorTolerance:30}),/No compatible filled SVG/);
global.DOMParser=saved;
const html=fs.readFileSync('index.html','utf8');
for(const [id,file] of [['core-code','core.js'],['advanced-code','advanced.js'],['codegen-code','codegen.js']]){
 const found=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'));assert(found,id);
 const fileCode=fs.readFileSync(file,'utf8');if(id==='codegen-code')assert.equal(found[1].trim(),fileCode.trim(),'codegen logic must match');else assert.equal(found[1],fileCode,'offline mismatch '+file);new Function(found[1]);
}
const scripts=[...html.matchAll(/<script(?: id="[^"]+")?>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,4);new Function(scripts[3][1]);
console.log('All five geometry methods, DXF, SVG import, topology and offline code passed');

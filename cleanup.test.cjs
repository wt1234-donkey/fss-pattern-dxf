const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('./core.js'),A=require('./advanced.js'),M=require('./cleanup.js'),R=require('./redraw.js'),G=require('./codegen.js');
function image(w,h,on,color=[17,17,17],bg=[255,255,255]){const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)d.set([...(on(x,y)?color:bg),255],4*(y*w+x));return d;}
const opt={threshold:127,minPixels:1,smooth:false,vectorMode:'exact'},w=120,h=100;
// Main ring, a real island, a protected one-pixel slit, and a same-color connected dimension line.
const on=(x,y)=>(x>=25&&x<100&&y>=20&&y<85&&!(x>=40&&x<85&&y>=35&&y<70)&&!(x===60&&y<35))||(x>=53&&x<57&&y>=50&&y<54)||(y===25&&x>=4&&x<25)||(x>=7&&x<13&&y>=7&&y<14);
const rgba=image(w,h,on),baseline=C.vectorize(rgba,w,h,opt);
const actions=[{kind:'rect',mode:'exclude',box:[0,0,24/w,1]},{kind:'rect',mode:'protect',box:[59/w,20/h,62/w,35/h]},{kind:'rect',mode:'metal',box:[59/w,20/h,62/w,35/h]}];
const codes=M.rasterize(actions,w,h),clean=C.vectorize(rgba,w,h,{...opt,pixelOverrides:codes});
assert.equal(clean.mask[25*w+10],0,'connected dimension line excluded before topology checks');
assert.equal(clean.mask[8*w+8],0,'text fragment excluded');
assert.equal(clean.mask[51*w+54],1,'real metal island remains');
assert.equal(clean.mask[25*w+60],0,'protection preserves the original slit against fill');
assert.equal(clean.cleanup.removedMetalPixels,62);
assert(clean.cleanup.active);
assert(C.checkPixelOverrides(clean.loops,clean));
// Every method sees identical cleaned raster input, even when its fit falls back.
for(const mode of ['exact','fit','hybrid','potrace','marching','sdf','ransac','cadsvg']){
 const r=A.generate(rgba,w,h,{...opt,vectorMode:mode,pixelOverrides:codes});
 assert.deepEqual(r.mask,clean.mask,mode+' must use the cleaned baseline');
 assert(C.checkPixelOverrides(r.loops,r),mode+' must respect exclusions and protection');
 assert.deepEqual(A.maskTopology(A.rasterize(r.loops,w,h),w,h),A.maskTopology(clean.mask,w,h),mode+' cleaned topology');
}
// Protected and repaired small islands survive the global small-region noise filter.
const small=image(20,20,(x,y)=>x>=2&&x<12&&y>=2&&y<12||x===17&&y===17);
let protect=new Uint8Array(400);protect[17*20+17]=2;protect[18*20+18]=3;
let r=C.vectorize(small,20,20,{...opt,minPixels:10,pixelOverrides:protect});assert.equal(r.mask[17*20+17],1);assert.equal(r.mask[18*20+18],1);
assert.equal(C.vectorize(small,20,20,{...opt,minPixels:10}).mask[17*20+17],0);
// Light polarity and sampled colors share the same explicit exclusions / repairs.
for(const settings of [{light:true,threshold:127},{materialMode:'color',color:[20,160,120],colorTolerance:4}]){
 const color=settings.light?[255,255,255]:[20,160,120],bg=settings.light?[0,0,0]:[255,255,255];
 const d=image(20,20,(x,y)=>x>=4&&x<16&&y>=4&&y<16,color,bg),o=new Uint8Array(400);o[8*20+8]=1;o[0]=3;
 const z=C.vectorize(d,20,20,{...opt,...settings,pixelOverrides:o});assert.equal(z.mask[168],0);assert.equal(z.mask[0],1);
}
// Coordinates are retained through crop and resolution changes, not relative to a new crop origin.
const rect=[{kind:'rect',mode:'exclude',box:[.2,.3,.4,.5]}];
const full=M.rasterize(rect,200,100),crop=M.rasterize(rect,100,80,{x:.1,y:.2,w:.5,h:.8});
for(let y=0;y<80;y++)for(let x=0;x<100;x++)assert.equal(crop[y*100+x],full[(y+20)*200+x+20]);
assert.equal(M.rasterize(rect,400,200).reduce((n,v)=>n+(v===1),0),3200);
// Continuous brush interpolation does not leave gaps when pointer events are sparse.
const brush=M.rasterize([{kind:'stroke',mode:'exclude',radius:[.02,.02],points:[[.1,.1],[.9,.9]]}],100,100);
for(let i=10;i<90;i++)assert.equal(brush[i*100+i],1);
const restore=M.rasterize([...actions,{kind:'rect',mode:'restore',box:[0,0,1,1]}],w,h);assert(!restore.some(Boolean));
// Candidate confirmation removes actual component pixels, never the whole bounding box.
const mask=new Uint8Array(10000);for(let y=5;y<35;y++)for(let x=5;x<35;x++)mask[y*100+x]=1;
for(let x=60;x<69;x++)mask[60*100+x]=1;for(let y=60;y<69;y++)mask[y*100+60]=1;mask[65*100+65]=1;
const candidates=M.suggestions(mask,100,100);assert(candidates.candidates.length===2);assert(!candidates.candidates.some(c=>c.seed===505));
const action=M.componentAction(mask,100,100,6060),pixels=M.rasterize([action],100,100);assert.equal(pixels[6565],0,'nearby island inside candidate bounding box preserved');assert.equal(pixels[6065],1);
// Final manual redraw cannot reintroduce excluded annotations or fill protected gaps.
assert(!C.checkPixelOverrides(baseline.loops,clean));
const model=R.fromResult(clean);assert(R.evaluate(model,clean).ok,'cleaned geometry establishes redraw baseline');
const g=C.scale(clean,{width:24,height:20,reference:'image',center:true});assert(C.dxf(g).includes('METAL_HOLE'));assert(G.generatedPython(g,{kind:'dxf'}).includes('METAL_OUTER'));
assert.throws(()=>C.vectorize(rgba,w,h,{...opt,pixelOverrides:new Uint8Array(2)}),/尺寸/);
const bad=new Uint8Array(w*h);bad[0]=4;assert.throws(()=>C.vectorize(rgba,w,h,{...opt,pixelOverrides:bad}),/无效值/);
// Browser Worker clone preserves overrides and produces the same cleaned geometry.
const html=fs.readFileSync('index.html','utf8'),inline=id=>html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)</script>'))[1];
for(const [id,file] of [['cleanup-code','cleanup.js'],['cleanup-ui-code','cleanup-ui.js']])assert.equal(inline(id),fs.readFileSync(file,'utf8'));
let response;const context={self:{postMessage:r=>response=r}};vm.createContext(context);vm.runInContext(inline('core-code')+'\n'+inline('advanced-code')+'\nself.onmessage=e=>{const d=e.data;self.postMessage(FSSAdvanced.generate(d.rgba,d.w,d.h,d.opt));};'.replace('FSSAdvanced.generate','self.FSSAdvanced.generate'),context);
context.self.onmessage({data:structuredClone({rgba,w,h,opt:{...opt,vectorMode:'ransac',pixelOverrides:codes}})});assert.deepEqual(Array.from(response.mask),Array.from(clean.mask));
assert(html.includes('opt.pixelOverrides=cleanupCtrl?.overrides(img.width,img.height);'), 'processing must pass cleanup to the Worker and fallback');
assert(html.includes("!d.result.cleanup?.active"),'SVG direct import must not bypass cleanup');
console.log('PASS: annotation removal, protected slit/islands, repair, all 8 engines, crop/resolution, exact candidates, redraw, DXF/code and Worker clone');

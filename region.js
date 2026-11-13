/* One material region -> one set of boundary edges. A printed border is not a material. */
(function(root){
'use strict';
function unify(rgba,raw,opt,A){
 const {w,h,mask,pixelOverrides:codes}=raw,n=w*h,cap=Number(opt.drawingStrokeWidth??3);
 if(!Number.isFinite(cap)||cap<.25||cap>40)throw Error('附着描线范围需为 0.25～40 个处理像素。');
 const interior=A.distanceChamfer(mask,w,h,0),coreRadius=Math.max(1.1,Math.min(2,cap/2)),seeds=new Uint8Array(n);
 let corePixels=0;
 for(let i=0;i<n;i++)if(mask[i]&&(interior[i]>=coreRadius||codes&&(codes[i]===2||codes[i]===3))){seeds[i]=1;corePixels++;}
 const stats={mode:'unified-region',maxStrokeWidthPx:cap,coreRadiusPx:coreRadius,corePixels,addedStrokePixels:0,removedFringePixels:0,protectedPixels:0,fallback:false};
 if(!corePixels)return {mask:mask.slice(),stats:{...stats,fallback:true,reason:'no filled interior; retained exact pixels'}};
 const distance=A.distanceChamfer(seeds,w,h,1),allowed=new Uint8Array(n),colorMode=opt.materialMode==='color',target=opt.color||[255,255,0],tol=Number(opt.colorTolerance??80),norm=target.reduce((s,v)=>s+v*v,0),radius=cap+coreRadius;
 for(let i=0;i<n;i++){
  if(codes&&codes[i]===1)continue;
  if(codes&&codes[i]===2){allowed[i]=mask[i];stats.protectedPixels++;continue;}
  if(codes&&codes[i]===3){allowed[i]=1;continue;}
  if(distance[i]>radius)continue;
  if(mask[i]){allowed[i]=1;continue;}
  if(!colorMode)continue; // A monotone gray threshold already includes its darker printed edges.
  const k=i*4,a=rgba[k+3]/255,rgb=[0,1,2].map(j=>rgba[k+j]*a+255*(1-a));
  const t=norm?Math.max(0,Math.min(1,rgb.reduce((s,v,j)=>s+v*target[j],0)/norm)):0;
  // Accept only the sampled material's dark stroke, not arbitrary neighboring colors or white gaps.
  const residual=Math.hypot(...rgb.map((v,j)=>v-t*target[j]));
  const neutralDark=Math.max(...rgb)-Math.min(...rgb)<=Math.max(6,tol*.2)&&(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])<(.2126*target[0]+.7152*target[1]+.0722*target[2])*.9;
  if(residual<=tol||neutralDark)allowed[i]=1;
 }
 const out=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
 for(let i=0;i<n;i++)if(seeds[i]&&allowed[i]){out[i]=1;queue[tail++]=i;}
 while(head<tail){const i=queue[head++],x=i%w,y=(i-x)/w;
  for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&allowed[j]&&!out[j]){out[j]=1;queue[tail++]=j;}
 }
 // Explicit user intent wins, including tiny independent metal islands and empty slits.
 if(codes)for(let i=0;i<n;i++){if(codes[i]===1)out[i]=0;else if(codes[i]===2)out[i]=mask[i];else if(codes[i]===3)out[i]=1;}
 for(let i=0;i<n;i++){if(out[i]&&!mask[i])stats.addedStrokePixels++;if(mask[i]&&!out[i])stats.removedFringePixels++;}
 return {mask:out,stats};
}
const api={unify};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FSSRegion=api;
})(typeof self!=='undefined'?self:globalThis);

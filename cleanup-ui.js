/* Interactive annotation exclusion. Source pixels remain untouched. */
(function(root){
'use strict';
function init(api){
 const $=id=>document.getElementById(id),canvas=$('cleanupCanvas'),ctx=canvas.getContext('2d'),M=root.FSSCleanup;
 let actions=[],redo=[],draft=null,gesture=null,zoom=1,pan=[0,0],candidates=[],candidateMask=null,candidateViewport=null,overlay=null,raf=0;
 const active=()=>$('cleanupEnabled').checked;
 const say=(s,error=false)=>{$('cleanupStatus').textContent=s;$('cleanupStatus').className='cleanup-status'+(error?' error':'');};
 function viewport(){const b=api.getBounds(),im=api.getSource();return {x:b.x/im.width,y:b.y/im.height,w:b.w/im.width,h:b.h/im.height};}
 function projection(){const im=api.getSource(),s=Math.min((canvas.width-32)/im.width,(canvas.height-32)/im.height)*zoom;return {s,x:(canvas.width-im.width*s)/2+pan[0],y:(canvas.height-im.height*s)/2+pan[1]};}
 function point(e){const r=canvas.getBoundingClientRect(),t=projection(),im=api.getSource();return [((e.clientX-r.left)*canvas.width/r.width-t.x)/t.s/im.width,((e.clientY-r.top)*canvas.height/r.height-t.y)/t.s/im.height];}
 function clearCandidates(){candidates=[];candidateMask=null;$('cleanupCandidates').replaceChildren();$('cleanupRemoveSelected').disabled=true;$('cleanupProtectSelected').disabled=true;}
 function refresh(){
  $('cleanupUndo').disabled=!actions.length;$('cleanupRedo').disabled=!redo.length;$('cleanupClear').disabled=!actions.length;
  $('cleanupSummary').textContent=(active()?'清理已启用':'清理已暂停，当前按原始识别生成')+' · '+actions.length+' 次操作。红色：排除；蓝色：保护原始金属 / 空白；绿色：补绘金属。';
  draw();
 }
 function invalidate(){api.invalidate();clearCandidates();}
 function changed(){overlay=null;clearCandidates();api.change();refresh();}
 function append(list){if(!list.length)return;actions.push(...list);redo=[];changed();}
 function draw(){
  const im=api.getSource();if(!im.width||!im.height)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f0f5f7';ctx.fillRect(0,0,canvas.width,canvas.height);
  const t=projection(),W=im.width*t.s,H=im.height*t.s;
  ctx.drawImage(im,t.x,t.y,W,H);
  let b;try{b=api.getBounds();}catch(e){b={x:0,y:0,w:im.width,h:im.height};}const r=api.getResult();
  if($('cleanupDisplay').value==='binary'&&r){
   const a=document.createElement('canvas');a.width=r.w;a.height=r.h;const c=a.getContext('2d'),d=c.createImageData(r.w,r.h);
   for(let i=0;i<r.mask.length;i++){const v=r.mask[i]?25:255;d.data.set([v,v,v,255],i*4);}c.putImageData(d,0,0);
   ctx.imageSmoothingEnabled=false;ctx.drawImage(a,t.x+b.x*t.s,t.y+b.y*t.s,b.w*t.s,b.h*t.s);ctx.imageSmoothingEnabled=true;
  }
  if(!overlay){
   overlay=document.createElement('canvas');const scale=Math.min(1,1024/Math.max(im.width,im.height));overlay.width=Math.max(1,Math.round(im.width*scale));overlay.height=Math.max(1,Math.round(im.height*scale));
   const c=overlay.getContext('2d'),d=c.createImageData(overlay.width,overlay.height),codes=M.rasterize(draft?[...actions,draft]:actions,overlay.width,overlay.height),colors={1:[225,70,52,110],2:[36,122,221,105],3:[29,172,101,120]};
   for(let i=0;i<codes.length;i++)if(codes[i])d.data.set(colors[codes[i]],i*4);c.putImageData(d,0,0);
  }
  ctx.save();ctx.globalAlpha=active()?1:.3;ctx.imageSmoothingEnabled=false;ctx.drawImage(overlay,t.x,t.y,W,H);ctx.restore();
  ctx.setLineDash([6,4]);ctx.lineWidth=1.5;ctx.strokeStyle='#007f78';ctx.strokeRect(t.x+b.x*t.s,t.y+b.y*t.s,b.w*t.s,b.h*t.s);ctx.setLineDash([]);
  if(candidateMask){
   const v=candidateViewport;
   for(const c of candidates){const [x0,y0,x1,y1]=c.box;ctx.strokeStyle=c.selected?'#db4925':'#b18225';ctx.lineWidth=c.selected?2.5:1;ctx.strokeRect(t.x+(v.x+x0/candidateMask.w*v.w)*W,t.y+(v.y+y0/candidateMask.h*v.h)*H,(x1-x0)/candidateMask.w*v.w*W,(y1-y0)/candidateMask.h*v.h*H);ctx.font='12px system-ui';ctx.fillStyle='#a33f20';ctx.fillText(String(c.id+1),t.x+(v.x+x0/candidateMask.w*v.w)*W+2,t.y+(v.y+y0/candidateMask.h*v.h)*H-3);}
  }
 }
 function queueDraw(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw();});}
 function end(e,cancel=false){
  if(!gesture||(e&&e.pointerId!==gesture.id))return;
  const was=gesture;gesture=null;
  if(canvas.hasPointerCapture?.(was.id))canvas.releasePointerCapture(was.id);
  if(was.pan){draft=null;return;}
  const op=draft;draft=null;overlay=null;
  if(!cancel&&op){
   if(op.kind==='rect'&&(op.box[2]-op.box[0])*api.getSource().width<.5&&(op.box[3]-op.box[1])*api.getSource().height<.5){api.change();refresh();say('框选需要拖动一个区域；也可切换到画笔。');return;}
   append([op]);say(op.mode==='metal'?'已补绘金属。请核对真实间隙，随后可用直线 / 圆弧重绘边界。':'已更新清理区域，正在重新生成轮廓。');
  }else{api.change();refresh();}
 }
 canvas.addEventListener('pointerdown',e=>{
  if(gesture||(e.button!==0&&e.button!==1))return;e.preventDefault();canvas.focus();
  const p=point(e),tool=$('cleanupTool').value,panMode=e.altKey||e.button===1||tool==='pan';
  if(!panMode&&(p[0]<0||p[0]>1||p[1]<0||p[1]>1))return;
  gesture={id:e.pointerId,start:p,last:[e.clientX,e.clientY],pan:panMode};canvas.setPointerCapture(e.pointerId);
  if(panMode)return;
  if(!active()){$('cleanupEnabled').checked=true;}
  invalidate();const [mode,shape]=tool.split('-'),im=api.getSource(),radius=Math.max(.5,Math.min(150,Number($('cleanupBrush').value)||8))/2;
  draft=shape==='rect'?{kind:'rect',mode,box:[...p,...p]}:{kind:'stroke',mode,points:[p],radius:[radius/im.width,radius/im.height]};overlay=null;queueDraw();
 });
 canvas.addEventListener('pointermove',e=>{
  if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();
  if(gesture.pan){const r=canvas.getBoundingClientRect();pan[0]+=(e.clientX-gesture.last[0])*canvas.width/r.width;pan[1]+=(e.clientY-gesture.last[1])*canvas.height/r.height;gesture.last=[e.clientX,e.clientY];queueDraw();return;}
  const p=point(e),a=gesture.start;
  if(draft.kind==='rect')draft.box=[Math.min(a[0],p[0]),Math.min(a[1],p[1]),Math.max(a[0],p[0]),Math.max(a[1],p[1])];
  else draft.points.push(p);overlay=null;queueDraw();
 });
 canvas.addEventListener('pointerup',e=>end(e));canvas.addEventListener('pointercancel',e=>end(e,true));canvas.addEventListener('lostpointercapture',e=>end(e,true));
 function setZoom(value,e){
  const next=Math.max(1,Math.min(16,value));
  if(e){const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*canvas.width/r.width-canvas.width/2,y=(e.clientY-r.top)*canvas.height/r.height-canvas.height/2;pan=[x-(x-pan[0])*next/zoom,y-(y-pan[1])*next/zoom];}
  zoom=next;draw();
 }
 canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*(e.deltaY<0?1.25:.8),e);},{passive:false});
 $('cleanupZoomIn').onclick=()=>setZoom(zoom*1.5);$('cleanupZoomOut').onclick=()=>setZoom(zoom/1.5);$('cleanupFit').onclick=()=>{zoom=1;pan=[0,0];draw();};
 function undoRedo(forward){if(gesture)return;const from=forward?redo:actions,to=forward?actions:redo;if(from.length){to.push(from.pop());changed();say(forward?'已重做清理操作。':'已撤销清理操作。');}}
 $('cleanupUndo').onclick=()=>undoRedo(false);$('cleanupRedo').onclick=()=>undoRedo(true);
 canvas.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();undoRedo(e.key.toLowerCase()==='y'||e.shiftKey);}});
 $('cleanupClear').onclick=()=>{if(!actions.length)return;actions.push({kind:'rect',mode:'restore',box:[0,0,1,1]});redo=[];changed();say('清理区域已恢复；可撤销此操作。');};
 $('cleanupEnabled').onchange=()=>{if(gesture)end(null,true);changed();};$('cleanupDisplay').onchange=draw;
 $('cleanupDetect').onclick=()=>{
  try{
   clearCandidates();const r=api.analyze();candidateMask=r;candidateViewport=viewport();const found=M.suggestions(r.mask,r.w,r.h);candidates=found.candidates;
   for(const c of candidates){const label=document.createElement('label');label.className='cleanup-candidate';const check=document.createElement('input');check.type='checkbox';check.onchange=()=>{c.selected=check.checked;const any=candidates.some(c=>c.selected);$('cleanupRemoveSelected').disabled=!any;$('cleanupProtectSelected').disabled=!any;draw();};label.append(check,document.createTextNode((c.id+1)+' · '+c.reason+' · '+c.area+' px²'));$('cleanupCandidates').append(label);}
   say(candidates.length?'找到 '+candidates.length+' 个候选，默认均未选择。它们也可能是真实金属岛；勾选后排除或保护。与主体相连的引线请用画笔处理。'+(found.limited?'仅展示前 80 个候选。':''):'未找到独立的小区域候选。相连的文字或引线可用框选 / 画笔排除。');draw();
  }catch(e){say(e.message,true);}
 };
 function useSelected(mode){
  if(!candidateMask)return;const ops=candidates.filter(c=>c.selected).map(c=>M.componentAction(candidateMask.mask,candidateMask.w,candidateMask.h,c.seed,candidateViewport,mode));
  if(ops.length){if(!active())$('cleanupEnabled').checked=true;append(ops);say(mode==='protect'?'所选区域已保护，不受排除和小区域去噪影响。':'已仅排除所选连通区域的像素，未擦除其外接矩形内的其他结构。');}
 }
 $('cleanupRemoveSelected').onclick=()=>useSelected('exclude');$('cleanupProtectSelected').onclick=()=>useSelected('protect');
 return {
  reset(){actions=[];redo=[];draft=null;gesture=null;overlay=null;zoom=1;pan=[0,0];clearCandidates();$('cleanupEnabled').checked=true;say('先按主体颜色识别，再框选或涂抹尺寸文字、引线及箭头。');refresh();},
  refresh(){refresh();},
  pending(){clearCandidates();draw();},
  overrides(w,h){return active()&&actions.length?M.rasterize(actions,w,h,viewport()):null;},
  report(){return {version:1,enabled:active(),coordinate_system:'normalized original image',operations:JSON.parse(JSON.stringify(actions))};}
 };
}
root.FSSCleanupUI={init};
})(typeof self!=='undefined'?self:globalThis);

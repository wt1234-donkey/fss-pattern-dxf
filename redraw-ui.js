/* The manual reference-guided redraw canvas. Loaded after FSSRedraw. */
(function(root){
'use strict';
const R=root.FSSRedraw||(typeof require==='function'?require('./redraw.js'):null);
if(!R)throw Error('FSSRedraw must load before FSSRedrawUI');
function init(api){
 const $=id=>document.getElementById(id),canvas=$('redrawCanvas'),ctx=canvas.getContext('2d');
 let model=null,baseline=null,reference=null,undo=[],redo=[],selected=null,pending=null,drag=null,pan=[0,0],zoom=1;
 const getImage=api.getCanvas;
 const cp=o=>R.clone(o),show=(message,error=false)=>{$('redrawStatus').textContent=message;$('redrawStatus').className='redraw-status'+(error?' error':'');};
 function projection(){
  const img=getImage(),w=img?.width||1,h=img?.height||1,s=Math.min((canvas.width-50)/w,(canvas.height-50)/h)*zoom;
  return {w,h,s,x:(canvas.width-w*s)/2+pan[0],y:(canvas.height-h*s)/2+pan[1]};
 }
 function imagePoint(e){
  const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*canvas.width/rect.width,y=(e.clientY-rect.top)*canvas.height/rect.height,t=projection();
  return [(x-t.x)/t.s,(y-t.y)/t.s];
 }
 const pd=(a,b,p)=>{let dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,h=len?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)):0;return Math.hypot(p[0]-a[0]-h*dx,p[1]-a[1]-h*dy);};
 function midpoint(loop,index){
  const s=R.segment(model,loop,index);
  if(s.kind==='line')return [(s.start[0]+s.end[0])/2,(s.start[1]+s.end[1])/2];
  const r=Math.hypot(s.start[0]-s.center[0],s.start[1]-s.center[1]);
  const t=Math.atan2(s.start[1]-s.center[1],s.start[0]-s.center[0])+s.sweep/2;
  return [s.center[0]+r*Math.cos(t),s.center[1]+r*Math.sin(t)];
 }
 function closest(pt,kind){
  if(!model)return null;
  const tolerance=12/projection().s;let best=null,distance=tolerance;
  for(let k=0;k<model.loops.length;k++){
   const l=model.loops[k],n=l.points.length;
   if(kind==='vertex'){
    for(let i=0;i<n;i++){const d=Math.hypot(l.points[i][0]-pt[0],l.points[i][1]-pt[1]);if(d<distance){best={loop:k,index:i,kind:'vertex'};distance=d;}}
   }else{
    for(let i=0;i<n;i++){
     const s=R.segment(model,k,i),pts=[s.start,...(s.kind==='arc'?R.sampleArc(s,.5):[]),s.end];
     for(let j=0;j<pts.length-1;j++){const d=pd(pts[j],pts[j+1],pt);if(d<distance){best={loop:k,index:i,kind:'edge'};distance=d;}}
    }
   }
  }
  return best;
 }
 function refresh(){
  const usable=!!model;
  for(const id of ['redrawAuto','redrawUndo','redrawRedo','redrawReset','redrawApply','redrawExport','redrawSymmetryApply','redrawArcBulge','redrawTool','redrawAddVertex','redrawDeleteVertex'])$(id).disabled=!usable;
  if(usable){$('redrawUndo').disabled=!undo.length;$('redrawRedo').disabled=!redo.length;}
  const edge=usable&&selected?.kind==='edge',vertex=usable&&selected?.kind==='vertex';
  $('redrawAddVertex').disabled=!edge;$('redrawDeleteVertex').disabled=!vertex;$('redrawArcBulge').disabled=!edge;
  if(edge)$('redrawArcBulge').value=model.loops[selected.loop].bulges[selected.index].toFixed(3);
  $('redrawSelection').textContent=!usable?'开始重绘后可选择几何边与顶点。':pending?'请在同一轮廓上选择第二个顶点，以替换中间的像素台阶。':!selected?'鼠标/触摸选择轮廓点或边；拖动顶点调整位置。':selected.kind==='vertex'?'已选顶点 '+(selected.loop+1)+'-'+(selected.index+1):'已选'+(Math.abs(model.loops[selected.loop].bulges[selected.index])>.001?'圆弧':'直线')+' '+(selected.loop+1)+'-'+(selected.index+1);
  draw();
 }
 function draw(){
  canvas.width=900;canvas.height=620;
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,900,620);
  const t=projection(),img=getImage();
  if(img&&img.width&&img.height){
   ctx.save();ctx.globalAlpha=Number($('redrawOpacity').value)/100;
   ctx.drawImage(img,t.x,t.y,img.width*t.s,img.height*t.s);ctx.restore();
   ctx.strokeStyle='#a4b3bd';ctx.lineWidth=1;ctx.strokeRect(t.x,t.y,img.width*t.s,img.height*t.s);
  }
  if(!model){ctx.fillStyle='#496270';ctx.textAlign='center';ctx.font='16px system-ui';ctx.fillText('点击“从当前图案开始智能重绘”',450,300);return;}
  ctx.save();ctx.translate(t.x,t.y);ctx.scale(t.s,t.s);
  for(let k=0;k<model.loops.length;k++){
   const loop=model.loops[k],n=loop.points.length;
   ctx.beginPath();
   for(let i=0;i<n;i++){
    const seg=R.segment(model,k,i);
    if(!i)ctx.moveTo(...seg.start);
    if(seg.kind==='line')ctx.lineTo(...seg.end);
    else{
     const [cx,cy]=seg.center;
     const r=Math.hypot(seg.start[0]-cx,seg.start[1]-cy);
     const ang=Math.atan2(seg.start[1]-cy,seg.start[0]-cx);
     ctx.arc(cx,cy,r,ang,ang+seg.sweep,seg.sweep<0);
    }
   }
   ctx.closePath();ctx.strokeStyle=loop.hole?'#d56a44':'#007e78';ctx.lineWidth=2.2/t.s;ctx.stroke();
   if(n<=4000){
    const step=n>800?Math.ceil(n/800):1;
    for(let i=0;i<n;i+=step){const p=loop.points[i];ctx.beginPath();ctx.arc(...p,2.4/t.s,0,Math.PI*2);ctx.fillStyle='#167a9a';ctx.fill();}
   }
  }
  if(pending){const p=model.loops[pending.loop].points[pending.index];ctx.beginPath();ctx.arc(...p,7/t.s,0,Math.PI*2);ctx.strokeStyle='#ed8f27';ctx.lineWidth=3/t.s;ctx.stroke();}
  if(selected){
   let p=selected.kind==='vertex'?model.loops[selected.loop].points[selected.index]:midpoint(selected.loop,selected.index);
   ctx.beginPath();ctx.arc(...p,6/t.s,0,Math.PI*2);ctx.fillStyle=selected.kind==='edge'?'#f4a52a':'#db5332';ctx.fill();
   ctx.lineWidth=2/t.s;ctx.strokeStyle='#333';ctx.stroke();
  }
  ctx.restore();
 }
 function metricsMessage(m){
  return '金属外轮廓 '+m.outers+' · 孔洞 '+m.holes+' · 几何边 '+m.primitives+' · 原生圆弧 '+m.arcs+
  (m.changePercent!=null?' · 与位图差异 '+m.changePercent.toFixed(2)+'%':' · 矢量源几何');
 }
 function valid(next,action){
  const m=R.evaluate(next,reference,{skipMask:reference?.advanced?.mode==='native SVG direct import'});
  if(!m.ok){show(action+'被拒绝：'+m.reason,true);return false;}
  return m;
 }
 function mutate(change,label){
  if(!model)return;
  try{
   const next=change(model),m=valid(next,label);
   if(!m)return;
   undo.push(cp(model));if(undo.length>45)undo.shift();redo=[];model=next;pending=null;
   show(label+'已完成。'+metricsMessage(m));refresh();
  }catch(err){show(label+'失败：'+err.message,true);}
 }
 function start(){
  const data=api.getResult();
  if(!data){show('先上传图片并等待初始轮廓生成。',true);return;}
  try{
   reference=data;
   baseline=R.fromResult(reference);model=cp(baseline);
   undo=[];redo=[];selected=null;pending=null;zoom=1;pan=[0,0];
   const safe=R.auto(model,reference,{tolerance:Number($('redrawTolerance').value),skipMask:reference.advanced?.mode==='native SVG direct import'});
   model=safe.model;
   const m=R.evaluate(model,reference,{skipMask:reference.advanced?.mode==='native SVG direct import'});
   if(!m.ok)throw Error(m.reason);
   show('已生成重绘草稿：规则化 '+safe.repaired+' 条轮廓，保护性跳过 '+safe.skipped+' 条。'+metricsMessage(m));
   refresh();canvas.scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(err){model=null;baseline=null;show('无法开始重绘：'+err.message,true);refresh();}
 }
 $('redrawStart').onclick=start;
 $('redrawAuto').onclick=()=>mutate(current=>R.auto(current,reference,{tolerance:Number($('redrawTolerance').value),skipMask:reference.advanced?.mode==='native SVG direct import'}).model,'自动几何规则化');
 $('redrawTool').onchange=()=>{pending=null;selected=null;refresh();};
 $('redrawArcBulge').onchange=()=>{
  if(selected?.kind!=='edge')return;
  const value=Number($('redrawArcBulge').value);
  if(!Number.isFinite(value)||Math.abs(value)>1){show('圆弧弯曲度须介于 -1 和 1',true);return;}
  mutate(current=>R.setBulge(current,selected.loop,selected.index,value),'修改圆弧弯曲度');
 };
 $('redrawAddVertex').onclick=()=>{if(selected?.kind==='edge')mutate(c=>R.insertVertex(c,selected.loop,selected.index),'插入顶点');selected=null;refresh();};
 $('redrawDeleteVertex').onclick=()=>{if(selected?.kind==='vertex')mutate(c=>R.removeVertex(c,selected.loop,selected.index),'删除顶点');selected=null;refresh();};
 $('redrawSymmetryApply').onclick=()=>{
  if(!model)return;
  const axis=$('redrawSymmetry').value;if(axis==='none'){show('请先选择镜像或中心对称规则。',true);return;}
  try{
   const out=R.symmetry(model,axis,Number($('redrawSymmetryTolerance').value));
   if(!out.pairs){show('未找到足够接近的镜像顶点，不进行强制对称变形。',true);return;}
   mutate(()=>out.model,'对称规则化（匹配 '+out.pairs+' 对点）');
  }catch(err){show(err.message,true);}
 };
 $('redrawUndo').onclick=()=>{if(!undo.length)return;redo.push(cp(model));model=undo.pop();selected=null;pending=null;show('已撤销重绘操作');refresh();};
 $('redrawRedo').onclick=()=>{if(!redo.length)return;undo.push(cp(model));model=redo.pop();selected=null;pending=null;show('已重做重绘操作');refresh();};
 $('redrawReset').onclick=()=>{if(!baseline)return;undo.push(cp(model));model=cp(baseline);redo=[];pending=null;selected=null;show('已恢复本次重绘开始时的几何轮廓');refresh();};
 $('redrawZoom').oninput=()=>{zoom=Number($('redrawZoom').value);draw();};
 $('redrawOpacity').oninput=draw;
 $('redrawApply').onclick=()=>{
  if(!model)return;
  const m=valid(model,'应用重绘');if(!m)return;
  if(m.changePercent!=null&&m.changePercent>2.0&&!$('redrawAllowDeviation').checked){
   show('与像素参考图的变化超过 2%。若确认这是设计意图，请勾选“允许超出像素参考差异”再应用。',true);return;
  }
  try{
   api.apply(m.loops,{kind:'reference-guided-redraw',applied:true,originalImageIsReference:true,angleTolerance:7,metrics:{changedPixels:m.changedPixels,changePercent:m.changePercent,holes:m.holes,outers:m.outers,arcs:m.arcs,primitives:m.primitives}});
   reference=api.getResult();baseline=cp(model);undo=[];redo=[];
   show('重绘几何已应用到 DXF 预览及导出。'+metricsMessage(m)+'。请在 CAD/CST 核对关键毫米尺寸。');
   refresh();
  }catch(err){show('应用失败：'+err.message,true);}
 };
 $('redrawExport').onclick=()=>{
  if(!model)return;
  const m=R.evaluate(model,reference,{skipMask:reference?.advanced?.mode==='native SVG direct import'});
  const blob=new Blob([JSON.stringify({format:'FSSRedraw-v1',source:[reference.w,reference.h],model,validation:{...m,loops:undefined}},null,2)],{type:'application/json'});
  const href=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=href;anchor.download='fss_redraw_geometry.json';document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(href),6000);
  show('已请求下载重绘编辑参数 JSON，可用于保存设计记录。');
 };
 function down(e){
  if(!model||e.button===2)return;
  const pt=imagePoint(e),tool=$('redrawTool').value;
  if(e.altKey){drag={kind:'pan',start:[e.clientX,e.clientY],pan:pan.slice()};canvas.setPointerCapture(e.pointerId);return;}
  if(tool==='span-line'||tool==='span-arc'){
   const hit=closest(pt,'vertex');
   if(!hit){show('请点击蓝色顶点建立连接。',true);return;}
   if(!pending){pending=hit;selected=hit;show('已选第一端点，请选择同一轮廓的第二端点。');refresh();return;}
   if(pending.loop!==hit.loop){pending=null;show('只能在同一条闭合轮廓中连接两个顶点。',true);refresh();return;}
   const first=pending;pending=null;
   mutate(x=>R.replaceSpan(x,hit.loop,first.index,hit.index,tool==='span-arc'?'arc':'line'),tool==='span-arc'?'圆弧替换':'直线替换');
   selected=null;refresh();return;
  }
  if(tool==='move'){
   const hit=closest(pt,'vertex');
   if(hit){selected=hit;undo.push(cp(model));if(undo.length>45)undo.shift();redo=[];drag={kind:'vertex',hit,original:cp(model)};canvas.setPointerCapture(e.pointerId);refresh();return;}
   const edge=closest(pt,'edge');selected=edge;refresh();
   if(edge&&model.loops[edge.loop].bulges[edge.index]){
    if(Math.hypot(pt[0]-midpoint(edge.loop,edge.index)[0],pt[1]-midpoint(edge.loop,edge.index)[1])<14/projection().s){
     undo.push(cp(model));drag={kind:'bulge',hit:edge,original:cp(model)};canvas.setPointerCapture(e.pointerId);
    }
   }
   return;
  }
  const edge=closest(pt,'edge');if(!edge){selected=null;refresh();return;}
  selected=edge;
  if(tool==='line')mutate(x=>R.setBulge(x,edge.loop,edge.index,0),'规则直线替换');
  else if(tool==='arc'){
   const existing=model.loops[edge.loop].bulges[edge.index],value=Math.abs(existing)>.01?existing:.25;
   mutate(x=>R.setBulge(x,edge.loop,edge.index,value),'规则圆弧替换');
  }
  refresh();
 }
 function moving(e){
  if(!drag||!model)return;
  if(drag.kind==='pan'){
   const box=canvas.getBoundingClientRect(),factor=canvas.width/box.width;
   pan=[drag.pan[0]+(e.clientX-drag.start[0])*factor,drag.pan[1]+(e.clientY-drag.start[1])*factor];draw();return;
  }
  const pt=imagePoint(e),h=drag.hit;
  if(drag.kind==='vertex')model=R.moveVertex(drag.original,h.loop,h.index,pt);
  else if(drag.kind==='bulge'){
   const l=drag.original.loops[h.loop],a=l.points[h.index],b=l.points[(h.index+1)%l.points.length],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
   const sag=d?((b[0]-a[0])*(pt[1]-a[1])-(b[1]-a[1])*(pt[0]-a[0]))/d:0;
   model=R.setBulge(drag.original,h.loop,h.index,Math.max(-1,Math.min(1,-2*sag/d)));
  }
  refresh();
 }
 function up(e){
  if(!drag)return;
  const current=drag;drag=null;
  if(current.kind==='pan')return;
  const m=valid(model,'拖动重绘点');
  if(!m){
   model=current.original;undo.pop();show('拖动位置被拒绝：该位置会破坏轮廓连接或发生自交。',true);
  }else show('重绘点已更新。'+metricsMessage(m));
  refresh();
 }
 canvas.addEventListener('pointerdown',down);
 canvas.addEventListener('pointermove',moving);
 canvas.addEventListener('pointerup',up);
 canvas.addEventListener('pointercancel',up);
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('wheel',e=>{
  if(!model)return;e.preventDefault();zoom=Math.max(1,Math.min(8,zoom*(e.deltaY<0?1.25:.8)));$('redrawZoom').value=String(zoom);draw();
 },{passive:false});
 const reset=()=>{
  model=null;baseline=null;reference=null;undo=[];redo=[];selected=null;pending=null;drag=null;pan=[0,0];zoom=1;
  $('redrawZoom').value='1';$('redrawAllowDeviation').checked=false;show('当前图像改变或几何编辑更新，请重新开始辅助重绘。');refresh();
 };
 refresh();return {reset,start,draw};
}
const api={init};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.FSSRedrawUI=api;
})(typeof self!=='undefined'?self:globalThis);

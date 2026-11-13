(()=>{
  'use strict';
  const $=id=>document.getElementById(id),svg=$('paper'),ns='http://www.w3.org/2000/svg';
  let parts=[],annotations=[],name='Drawing',tool='select',draft=[],page={w:297,h:210},view={scale:1,x:0,y:0};
  const el=(tag,attrs,parent=svg)=>{const node=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));parent.appendChild(node);return node;};
  const screen=p=>({x:view.x+p.x*view.scale,y:view.y-p.y*view.scale});
  function line(a,b,color='#111111',width=.25){const x=screen(a),y=screen(b);el('line',{x1:x.x,y1:x.y,x2:y.x,y2:y.y,stroke:color,'stroke-width':width});}
  function text(value,p,size,color,rotation=0,bold=false){const q=screen(p),node=el('text',{x:q.x,y:q.y,fill:color,'font-size':size,'font-family':'monospace','font-weight':bold?'bold':'normal',transform:'rotate('+(-rotation)+' '+q.x+' '+q.y+')'});value.split('\n').forEach((row,i)=>{el('tspan',{x:q.x,dy:i?size*1.4:0},node).textContent=row;});}
  function draw(e,annotation=false){
    const color=e.color||'#111111';
    if(e.type==='text'){text(e.text,e,annotation?e.paperHeight:e.height*view.scale,color,e.rotation,e.bold);return;}
    if(e.type==='dimension'){const d=CAD.dimension(e);for(const [a,b]of d.lines)line(a,b,color);text(d.label,{x:d.text.x,y:d.text.y+2/view.scale},3.5,color);return;}
    const ps=CAD.points(e).map(screen);if(ps.length)el('polyline',{points:ps.map(p=>p.x+','+p.y).join(' '),fill:'none',stroke:color,'stroke-width':.3});
  }
  function render(){
    svg.replaceChildren();el('rect',{x:10,y:10,width:page.w-20,height:page.h-20,fill:'none',stroke:'#888','stroke-width':.2});
    const title=el('text',{x:15,y:18,'font-size':4,fill:'#222'});title.textContent=name;
    parts.forEach(e=>draw(e));annotations.forEach(e=>draw(e,true));for(const p of draft){const q=screen(p);el('circle',{cx:q.x,cy:q.y,r:1.2,fill:'#b06000'});}
    const caption=el('text',{x:15,y:page.h-13,'font-size':3,fill:'#444'});caption.textContent='Scale 1:'+Number((1/view.scale).toFixed(3))+' · Dimensions in mm';$('undo').disabled=!annotations.length;
  }
  function configure(){
    const dims=$('paper-size').value==='A3'?[420,297]:[297,210];if($('orientation').value==='portrait')dims.reverse();page={w:dims[0],h:dims[1]};svg.setAttribute('viewBox','0 0 '+page.w+' '+page.h);svg.style.width=page.w+'mm';svg.style.height=page.h+'mm';$('page-style').textContent='@page{size:'+page.w+'mm '+page.h+'mm;margin:0}';
    if(parts.length){const b=CADLayout.bounds(parts),w=Math.max(1,b.maxX-b.minX),h=Math.max(1,b.maxY-b.minY),scale=$('scale').value==='fit'?Math.min((page.w-40)/w,(page.h-60)/h):1/Number($('scale').value);view={scale,x:page.w/2-(b.minX+b.maxX)*scale/2,y:page.h/2+(b.minY+b.maxY)*scale/2};if(w*scale>page.w-40||h*scale>page.h-60)$('status').textContent='Parts exceed the printable frame at this scale. Choose Fit page or a smaller scale.';}
    draft=[];render();
  }
  function setTool(value){tool=value;draft=[];for(const item of ['select','dimension','text'])$(item+'-tool').classList.toggle('active',tool===item);$('status').textContent=tool==='dimension'?'Click the first measurement point.':tool==='text'?'Click to place the text on the page.':'Print layout ready. Choose a tool to add annotations.';render();}
  for(const value of ['select','dimension','text'])$(value+'-tool').onclick=()=>setTool(value);
  for(const id of ['paper-size','orientation','scale'])$(id).onchange=configure;
  $('print').onclick=()=>{draft=[];render();window.print();};$('undo').onclick=()=>{annotations.pop();render();};
  svg.addEventListener('click',event=>{
    if(!parts.length||tool==='select')return;const r=svg.getBoundingClientRect(),q={x:(event.clientX-r.left)*page.w/r.width,y:(event.clientY-r.top)*page.h/r.height};let p={x:(q.x-view.x)/view.scale,y:(view.y-q.y)/view.scale};
    if(tool==='text'){const value=$('label').value,size=Number($('label-size').value);if(!value.trim()||!Number.isFinite(size)||size<=0){$('status').textContent='Enter text and a positive text height.';return;}annotations.push({type:'text',text:value,...p,height:size/view.scale,paperHeight:size,rotation:0,color:$('label-color').value});render();return;}
    if(draft.length<2){let best=3/view.scale;for(const e of parts)for(const a of CAD.anchors(e)){const d=CAD.distance(a,p);if(d<best){best=d;p={x:a.x,y:a.y};}}if(!draft.length||CAD.distance(draft[0],p)>1e-8)draft.push(p);$('status').textContent=draft.length===2?'Click the dimension line position.':'Click the second measurement point.';}
    else{const [a,b]=draft,v={x:b.x-a.x,y:b.y-a.y},length=CAD.distance(a,b);annotations.push({type:'dimension',a,b,offset:((p.x-a.x)*-v.y+(p.y-a.y)*v.x)/length,color:$('label-color').value});draft=[];$('status').textContent='Dimension placed. Click another first point.';}render();
  });
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape')setTool('select');});
  window.addEventListener('message',event=>{if(event.source!==window.opener||event.data?.type!=='trendcad-print-parts')return;const incoming=event.data.entities;if(!Array.isArray(incoming)||!incoming.every(CAD.valid))return;parts=structuredClone(incoming);annotations=[];name=String(event.data.name||'Drawing');setTool('select');configure();});
  configure();if(window.opener)window.opener.postMessage({type:'trendcad-print-ready'},'*');else $('status').textContent='Open this page with Print layout after selecting parts in TrendCad.';
})();

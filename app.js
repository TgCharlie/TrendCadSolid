(()=>{
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
  let entities=[],selected=new Set(),tool='select',draft=[],cursor={x:0,y:0},rawCursor=cursor,snapPoint=null,history=[],future=[],nextId=1,dirty=false,space=false,shift=false,pan=null,importWarnings=[],width=1,height=1;
  let hiddenLayers=new Set();
  let layerColors=new Map([['0','#d0e2e7']]),activeLayer='0';
  const PARTS_LAYER='Parts',PARTS_COLOR='#f2d755',PREFERENCES_KEY='trendcad-solid-preferences';
  let objectClipboard=[],pasteDraft=null,layoutSheets=[],viewMode='drawing';
  let printPage={parts:[],annotations:[],viewports:[],paper:'A4',orientation:'landscape',scale:'fit',title:'',activeViewport:null,history:[],future:[],nextId:1,sourceKey:''};
  let printDimensionSource=null,viewportDrag=null,viewportPan=null,viewportHandleHover=null,perpendicularSnapState={origin:'',key:'',side:0,passed:false};
  let textDrag=null,textEditing=null,drawingColour=null;
  let nodeDrag=null;
  let editAllEdges=false,boundariesReady=false,editBoundaries=new Set();
  let editSource=null,lastTool='line',tracking=[],edgeDrag=null,typedAim=null,rectangleWidth=null,filletFirst=null,pointerInside=false,dimensionSource=null,marqueeDrag=null,selectedArcIndex=null,radiusSegment=null,rightDrag=null,suppressContext=false;
  let view={x:90,y:500,scale:.7};
  const clone=o=>structuredClone(o),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>Number(n.toFixed(4)),world=p=>({x:(p.x-view.x)/view.scale,y:(view.y-p.y)/view.scale}),screen=p=>({x:view.x+p.x*view.scale,y:view.y-p.y*view.scale});
  const restoreCanvasCursor=()=>{canvas.style.cursor=['select','move','offset','trim','extend','fillet','radius'].includes(tool)?'none':'crosshair';};
  const rect=(a,b)=>({type:'polyline',closed:true,vertices:[{x:a.x,y:a.y},{x:b.x,y:a.y},{x:b.x,y:b.y},{x:a.x,y:b.y}],layer:'0'});
  const arcFromPoints=(center,start,end)=>({type:'arc',x:center.x,y:center.y,r:CAD.distance(center,start),start:Math.atan2(start.y-center.y,start.x-center.x)*180/Math.PI,end:Math.atan2(end.y-center.y,end.x-center.x)*180/Math.PI,layer:'0'});
  function partsGapTolerance(){const value=Number($('parts-gap-tolerance')?.value);return Number.isFinite(value)&&value>=0?value:5;}
  function loadUserPreferences(){try{if(typeof localStorage==='undefined')return;const saved=JSON.parse(localStorage.getItem(PREFERENCES_KEY)||'{}');if(Number.isFinite(Number(saved.partsGapTolerance))&&Number(saved.partsGapTolerance)>=0)$('parts-gap-tolerance').value=Number(saved.partsGapTolerance);}catch{}}
  function saveUserPreferences(){try{if(typeof localStorage!=='undefined')localStorage.setItem(PREFERENCES_KEY,JSON.stringify({partsGapTolerance:partsGapTolerance()}));}catch{}}
  function ensurePartsLayer(){layerColors.set(PARTS_LAYER,PARTS_COLOR);hiddenLayers.delete(PARTS_LAYER);}
  function cancelTextBox(){textDrag=null;textEditing=null;$('text-editor').hidden=true;$('text-format').hidden=true;$('text-editor').value='';}
  function textBoxHeight(){return textEditing.fontHeight;}
  function positionTextEditor(){const p=screen(textEditing),input=$('text-editor');Object.assign(input.style,{left:p.x+'px',top:p.y+'px',width:textEditing.width*view.scale+'px',height:Math.min(Math.max(36,height-p.y-4),Math.max(textEditing.height,textBoxHeight()*1.4*($('text-editor').value.split('\n').length+1))*view.scale)+'px',fontSize:textBoxHeight()*view.scale+'px',fontWeight:textEditing.bold?'bold':'normal',color:textEditing.colour||'#d0e2e7',transformOrigin:'0 0',transform:'rotate('+(-(textEditing.rotation||0))+'deg)'});const bar=$('text-format');bar.hidden=false;bar.style.left=Math.max(4,Math.min(p.x,width-330))+'px';bar.style.top=Math.max(4,p.y-40)+'px';$('text-bold').ariaPressed=String(!!textEditing.bold);$('text-bold').classList.toggle('active',!!textEditing.bold);if(document.activeElement!==$('text-size'))$('text-size').value=fmt(textBoxHeight());$('text-colour').value=textEditing.colour||'#d0e2e7';}
  function commitTextBox(){
    if(!textEditing)return;const text=$('text-editor').value;if(!text.trim()){cancelTextBox();instructions();render();return;}
    if(viewMode==='print'&&!textEditing.source){const height=textBoxHeight(),e={type:'text',layer:'PRINT',x:textEditing.x,y:textEditing.y-height*.8,height,rotation:0,text};if(printAddAnnotation(styledText(e))){cancelTextBox();instructions();render();canvas.focus();notice('Print text placed. It is independent from the workbench drawing.');}return;}
    if(textEditing.source){const original=textEditing.source,updated=styledText({...original,text,height:textBoxHeight()});if(JSON.stringify(updated)!==JSON.stringify(original)){remember();entities=entities.map(e=>e.id===original.id?updated:e);commit();}cancelTextBox();instructions();render();canvas.focus();notice('Text updated. Ctrl+Z to undo.');return;}
    const height=textBoxHeight(),e={type:'text',layer:'TEXT',x:textEditing.x,y:textEditing.y-height*.8,height,rotation:0,text};
    if(add(styledText(e))){cancelTextBox();instructions();render();canvas.focus();notice('Text placed. Drag another text box, or Esc to finish.');}
  }
  $('text-editor').addEventListener('input',()=>{if(textEditing)positionTextEditor();});
  $('text-editor').addEventListener('keydown',ev=>{ev.stopPropagation();if(ev.key==='Enter'&&!ev.ctrlKey&&!ev.metaKey){const input=$('text-editor'),start=input.selectionStart??input.value.length,end=input.selectionEnd??start,lo=start===0?0:input.value.lastIndexOf('\n',start-1)+1,line=input.value.slice(lo,start);if(line.startsWith('• ')){ev.preventDefault();const empty=line==='• ',from=empty?lo:start,insert=empty?'':'\n• ';input.value=input.value.slice(0,from)+insert+input.value.slice(end);input.selectionStart=input.selectionEnd=from+insert.length;positionTextEditor();return;}}if(ev.key==='Enter'&&(ev.ctrlKey||ev.metaKey)){ev.preventDefault();commitTextBox();}else if(ev.key==='Escape'){ev.preventDefault();cancelAll();}});
  document.addEventListener('pointerdown',ev=>{if(textEditing&&ev.target!==$('text-editor')&&ev.target!==canvas&&!$('text-format').contains(ev.target))commitTextBox();});
  function styledText(e){if(textEditing.bold)e.bold=true;else delete e.bold;const color=textEditing.colour||'#d0e2e7';if(color!=='#d0e2e7'||textEditing.source?.color)e.color=color;return e;}
  for(const id of ['text-bold','text-bullets'])$(id).addEventListener('pointerdown',ev=>ev.preventDefault());
  $('text-bold').onclick=()=>{if(!textEditing)return;textEditing.bold=!textEditing.bold;positionTextEditor();$('text-editor').focus();};
  $('text-bullets').onclick=()=>{if(!textEditing)return;const input=$('text-editor'),value=input.value,start=input.selectionStart||0,end=input.selectionEnd??start,lo=start===0?0:value.lastIndexOf('\n',start-1)+1,finish=value.indexOf('\n',end>start?end-1:end),hi=finish<0?value.length:finish,lines=value.slice(lo,hi).split('\n'),remove=lines.every(line=>/^• /.test(line)),replacement=lines.map(line=>remove?line.replace(/^• /,''):'• '+line.replace(/^• /,'')).join('\n');input.value=value.slice(0,lo)+replacement+value.slice(hi);input.selectionStart=lo;input.selectionEnd=lo+replacement.length;positionTextEditor();input.focus();};
  $('text-colour').addEventListener('input',()=>{if(!textEditing)return;textEditing.colour=$('text-colour').value;positionTextEditor();});
  $('text-size').addEventListener('input',()=>{const size=Number($('text-size').value);if(textEditing&&Number.isFinite(size)&&size>0){textEditing.fontHeight=size;positionTextEditor();}});
  $('text-format').addEventListener('keydown',ev=>{ev.stopPropagation();if(ev.key==='Escape'){ev.preventDefault();cancelAll();}else if(ev.key==='Enter'){ev.preventDefault();$('text-editor').focus();}});
  function textAt(p){return [...visibleEntities()].reverse().find(e=>e.type==='text'&&(CAD.textContains(e,p)||CAD.hitDistance(e,p)<9/view.scale));}
  function openTextEditor(e){
    setTool('select');selected=new Set([e.id]);const angle=e.rotation*Math.PI/180,h=e.height;
    textEditing={source:clone(e),x:e.x-h*.8*Math.sin(angle),y:e.y+h*.8*Math.cos(angle),width:Math.max(120/view.scale,(Math.max(...e.text.split('\n').map(line=>[...line].length))+2)*h*.62),height:Math.max(50/view.scale,e.text.split('\n').length*h*1.4),fontHeight:h,rotation:e.rotation,bold:!!e.bold,colour:e.color||'#d0e2e7'};
    const input=$('text-editor');input.value=e.text;input.hidden=false;update();positionTextEditor();input.focus();$('instruction').textContent='Edit text. Enter adds a line; Ctrl+Enter or click outside saves; Esc discards changes.';
  }
  canvas.addEventListener('dblclick',ev=>{if(textEditing||!['select','text'].includes(tool))return;const hit=textAt(world(getPosition(ev)));if(hit){ev.preventDefault();openTextEditor(hit);}});
  const drawingSwatches={white:'#d0e2e7',red:'#ff5555',yellow:'#f2d755',green:'#6fe0c5',blue:'#36a9ff',purple:'#c58aff'};
  function setDrawingColour(color){
    drawingColour=color;$('drawing-colour').value=color;for(const [name,value]of Object.entries(drawingSwatches))$('colour-'+name).classList.toggle('active',color===value);
    if(tool==='select'&&selected.size){const ids=CADSelection.expand(entities,selected);if(entities.some(e=>ids.has(e.id)&&e.color!==color)){remember();entities=entities.map(e=>ids.has(e.id)?{...e,color}:e);commit();}notice('Colour applied to selected objects.');}else notice('Drawing colour set for new objects.');
  }
  for(const [name,color]of Object.entries(drawingSwatches))$('colour-'+name).onclick=()=>setDrawingColour(color);
  $('drawing-colour').addEventListener('change',()=>setDrawingColour($('drawing-colour').value));
  $('parts-gap-tolerance').addEventListener('change',()=>{const value=Number($('parts-gap-tolerance').value);if(!Number.isFinite(value)||value<0)$('parts-gap-tolerance').value=5;saveUserPreferences();});
  function copyObjects(){const ids=CADSelection.expand(entities,selected);if(!ids.size){notice('Select objects to copy.');return;}objectClipboard=clone(entities.filter(e=>ids.has(e.id)));notice('Copied '+objectClipboard.length+' objects. Ctrl+V to paste.');}
  function beginPaste(){if(!objectClipboard.length){notice('Copy drawing objects with Ctrl+C first.');return;}setTool('select');const b=CAD.bounds(objectClipboard);pasteDraft={origin:{x:b.minX,y:b.minY},point:{...rawCursor}};selected.clear();update();$('instruction').textContent='Paste: click to place the copied objects. Esc cancels.';canvas.focus();}
  function commitPaste(){const d=pasteDraft;if(!d)return;const copies=CADSelection.duplicate(objectClipboard,new Set(objectClipboard.map(e=>e.id)),d.point.x-d.origin.x,d.point.y-d.origin.y,newGroupId).map(e=>({...e,id:nextId++}));remember();entities.push(...copies);pasteDraft=null;selected=new Set(copies.map(e=>e.id));commit();instructions();notice('Pasted '+copies.length+' objects. Ctrl+Z to undo.');}
  function visibleEntities(){return entities.filter(e=>!hiddenLayers.has(e.layer||'0'));}
  $('layer-visible').onchange=()=>{if($('layer-visible').checked)hiddenLayers.delete(activeLayer);else hiddenLayers.add(activeLayer);setTool('select');selected=new Set([...selected].filter(id=>visibleEntities().some(e=>e.id===id)));update();notice('Layer '+activeLayer+($('layer-visible').checked?' shown.':' hidden. Objects are retained in the drawing and DXF export.'));};
  $('show-all-layers').onclick=()=>{hiddenLayers.clear();update();};
  function refreshLayers(){for(const e of entities)if(!layerColors.has(e.layer||'0'))layerColors.set(e.layer||'0',e.color||'#d0e2e7');$('active-layer').innerHTML=[...layerColors.keys()].map(name=>'<option value="'+escape(name)+'">'+escape(name)+'</option>').join('');$('active-layer').value=activeLayer;$('layer-visible').checked=!hiddenLayers.has(activeLayer);$('layer-colour').value=layerColors.get(activeLayer)||'#d0e2e7';}
  $('active-layer').onchange=()=>{activeLayer=$('active-layer').value;drawingColour=null;refreshLayers();};
  $('add-layer').onclick=()=>{const name=$('new-layer-name').value.trim();if(!name||/[<>/\\":;?*|=\r\n]/.test(name)){notice('Enter a valid layer name.');return;}if(!layerColors.has(name))layerColors.set(name,$('layer-colour').value);activeLayer=name;drawingColour=null;$('new-layer-name').value='';refreshLayers();notice('Active layer: '+name);};
  $('layer-colour').addEventListener('change',()=>{const color=$('layer-colour').value;layerColors.set(activeLayer,color);if(entities.some(e=>e.layer===activeLayer&&e.color!==color)){remember();entities=entities.map(e=>e.layer===activeLayer?{...e,color}:e);commit();}render();});
  $('assign-layer').onclick=()=>{if(!selected.size){notice('Select objects to move to a layer.');return;}const ids=CADSelection.expand(entities,selected);remember();entities=entities.map(e=>ids.has(e.id)?{...e,layer:activeLayer,color:layerColors.get(activeLayer)}:e);commit();};
  function ensureSheetRotateControl(){
    if($('sheet-rotate'))return;
    const panel=$('sheet-panel');if(!panel||typeof panel.appendChild!=='function')return;
    const before=$('fit-sheet');
    const colourLabel=$('sheet-colour')?.closest?.('label');
    if(colourLabel)colourLabel.classList.add('sheet-colour-field');

    // Keep the base sheet controls together: Width, Height and Quantity.
    const quantity=document.createElement('label');
    quantity.className='field-label';
    quantity.innerHTML='Base sheet quantity<input id="sheet-quantity" type="number" min="0" step="1" value="1">';
    const grid=panel.querySelector?.('.field-grid');
    if(grid)grid.appendChild(quantity);else panel.insertBefore(quantity,before);

    // Compact option row shown in the reference layout.
    const options=document.createElement('div');
    options.id='sheet-layout-options';
    const rotation=document.createElement('label');
    rotation.className='sheet-compact-toggle';
    rotation.innerHTML='<input id="sheet-rotate" type="checkbox" checked> <span>rotation</span>';
    const snap=document.createElement('label');
    snap.className='sheet-compact-toggle';
    snap.innerHTML='<input id="layout-snap" type="checkbox" checked> <span>Snap</span>';
    const autoAngle=document.createElement('select');
    autoAngle.id='layout-auto-angle';
    autoAngle.setAttribute('aria-label','Automatic rotation angle');
    autoAngle.innerHTML='<option value="90">90°</option><option value="45">45°</option><option value="15">15°</option>';
    const autoAngleWrap=document.createElement('label');
    autoAngleWrap.className='sheet-angle-control';
    autoAngleWrap.appendChild(autoAngle);
    const caption=document.createElement('span');
    caption.className='sheet-rotation-caption';
    caption.textContent='Rotation snap';
    options.append(rotation,snap,autoAngleWrap,caption);
    panel.insertBefore(options,before);
    $('sheet-rotate').addEventListener('change',()=>notice($('sheet-rotate').checked?'Automatic rotation enabled.':'Automatic rotation disabled.'));

    const addStock=document.createElement('button');
    addStock.id='add-sheet-stock';
    addStock.className='wide';
    addStock.type='button';
    addStock.textContent='Add sheet size';
    panel.insertBefore(addStock,before);
    const stockSection=document.createElement('div');
    stockSection.id='sheet-stock-controls';
    stockSection.className='sheet-stock-controls';
    const heading=document.createElement('div');
    heading.className='section-label';
    heading.textContent='ADDITIONAL STOCK / OFFCUTS';
    stockSection.appendChild(heading);
    const list=document.createElement('div');
    list.id='sheet-stock-list';
    stockSection.appendChild(list);
    panel.insertBefore(stockSection,before);

    // Rotation snap is kept as a full-width control below the stock rows,
    // matching the compact Sheet Layout reference. This is the value used by
    // right-button/wheel rotation in every view.
    const rotationField=document.createElement('label');
    rotationField.className='field-label sheet-rotation-field';
    rotationField.innerHTML='Rotation snap<select id="layout-rotation"><option value="90">90°</option><option value="45">45°</option><option value="15">15°</option></select>';
    panel.insertBefore(rotationField,before);

    addStock.onclick=()=>{
      const row=document.createElement('div');
      row.className='sheet-stock-row';
      row.innerHTML='<input type="number" min="1" placeholder="Width"><input type="number" min="1" placeholder="Height"><input type="number" min="1" step="1" value="1" placeholder="Qty"><button type="button" title="Remove">×</button>';
      row.querySelector('button').onclick=()=>row.remove();
      list.appendChild(row);
    };
  }
  function ensureArcTool(){
    const toolbar=document.querySelector?.('.top-drawing-tools');if(!toolbar||typeof toolbar.appendChild!=='function'||document.querySelector?.('[data-tool="arc"]'))return;
    const button=document.createElement('button');button.dataset.tool='arc';button.title='Arc (A)';button.innerHTML='<span>⌒</span>Arc';toolbar.insertBefore(button,$('dimension'));button.onclick=()=>setTool('arc');
  }
  function printDimensions(){
    const a=printPage.paper==='A3'?[420,297]:[297,210];
    return printPage.orientation==='portrait'?{w:a[1],h:a[0]}:{w:a[0],h:a[1]};
  }
  function printGeometry(){return printPage.parts.filter(e=>!['dimension','text'].includes(e.type));}
  function printBounds(){try{return CADLayout.bounds(printGeometry());}catch{return null;}}
  function printFitScale(vp){const b=printBounds();if(!b)return .5;return Math.max(.001,Math.min(vp.w/Math.max(1,b.maxX-b.minX),vp.h/Math.max(1,b.maxY-b.minY))*0.94);}
  function printPageFit(){const page=printDimensions(),margin=24;view.scale=Math.max(1e-8,Math.min((width-margin*2)/page.w,(height-margin*2)/page.h));view.x=(width-page.w*view.scale)/2;view.y=(height+page.h*view.scale)/2;}
  function printPushHistory(){printPage.history.push(clone(printPage.annotations));if(printPage.history.length>100)printPage.history.shift();printPage.future=[];}
  function printAddAnnotation(e){if(!e||!CAD.valid(e)){notice('Enter valid print annotation geometry.');return false;}printPushHistory();printPage.annotations.push({...clone(e),id:printPage.nextId++,layer:'PRINT'});return true;}
  function projectPrintEntity(vp,e,b){
    const map=p=>({x:vp.x+(p.x-b.minX)*vp.scale+(vp.panX||0),y:vp.y+(p.y-b.minY)*vp.scale+(vp.panY||0)});
    if(e.type==='line'||e.type==='dimension')return {...e,a:map(e.a),b:map(e.b),offset:(e.offset||0)*vp.scale};
    if(e.type==='circle')return {...e,x:vp.x+(e.x-b.minX)*vp.scale+(vp.panX||0),y:vp.y+(e.y-b.minY)*vp.scale+(vp.panY||0),r:e.r*vp.scale};
    if(e.type==='arc')return {...e,x:vp.x+(e.x-b.minX)*vp.scale+(vp.panX||0),y:vp.y+(e.y-b.minY)*vp.scale+(vp.panY||0),r:e.r*vp.scale};
    if(e.type==='polyline')return {...e,vertices:e.vertices.map(v=>({...map(v),bulge:v.bulge||0}))};
    if(e.type==='text')return {...e,x:vp.x+(e.x-b.minX)*vp.scale+(vp.panX||0),y:vp.y+(e.y-b.minY)*vp.scale+(vp.panY||0),height:e.height*vp.scale};
    return e;
  }
  function printViewportAt(p){return printPage.viewports.find(v=>p.x>=v.x&&p.x<=v.x+v.w&&p.y>=v.y&&p.y<=v.y+v.h);}
  function viewportCorner(vp,p){const threshold=10/Math.max(view.scale,1e-8),corners={nw:{x:vp.x,y:vp.y+vp.h},ne:{x:vp.x+vp.w,y:vp.y+vp.h},sw:{x:vp.x,y:vp.y},se:{x:vp.x+vp.w,y:vp.y}};for(const [name,point] of Object.entries(corners))if(CAD.distance(point,p)<=threshold)return name;return null;}
  function updateViewportHandleHover(p){if(viewMode!=='print'||tool!=='select'){viewportHandleHover=null;return;}for(const vp of [...printPage.viewports].reverse()){const corner=viewportCorner(vp,p);if(corner){viewportHandleHover={id:vp.id,corner,locked:!!vp.locked};return;}}viewportHandleHover=null;}
  function updateViewportDrag(p){const d=viewportDrag;if(!d)return;const v=d.viewport,o=d.origin;if(d.kind==='move'){v.x=o.x+p.x-d.start.x;v.y=o.y+p.y-d.start.y;}
    else if(d.corner==='se'){const top=o.y+o.h;v.x=o.x;v.w=Math.max(5,p.x-o.x);v.y=Math.min(p.y,top-5);v.h=top-v.y;}
    else if(d.corner==='sw'){const right=o.x+o.w,top=o.y+o.h;v.x=Math.min(p.x,right-5);v.w=right-v.x;v.y=Math.min(p.y,top-5);v.h=top-v.y;}
    else if(d.corner==='ne'){const bottom=o.y;v.x=o.x;v.w=Math.max(5,p.x-o.x);v.y=bottom;v.h=Math.max(5,p.y-bottom);}
    else if(d.corner==='nw'){const right=o.x+o.w,bottom=o.y;v.x=Math.min(p.x,right-5);v.w=right-v.x;v.y=bottom;v.h=Math.max(5,p.y-bottom);}
    refreshPrintPanel();render();
  }
  function finishViewportDrag(){if(!viewportDrag)return;viewportDrag=null;refreshPrintPanel();render();}
  function finishViewportPan(){if(!viewportPan)return;viewportPan=null;refreshPrintPanel();render();}
  function printPickAt(p){
    const b=printBounds();if(!b)return null;
    for(const vp of [...printPage.viewports].reverse()){
      if(p.x<vp.x||p.x>vp.x+vp.w||p.y<vp.y||p.y>vp.y+vp.h)continue;
      for(const source of [...printPage.parts].reverse()){
        const projected=projectPrintEntity(vp,source,b);if(CAD.hitDistance(projected,p)<=10/Math.max(view.scale,1e-8))return {source,projected,viewport:vp};
      }
    }
    return null;
  }
  function refreshPrintPanel(){
    const panel=$('print-panel');if(!panel)return;
    const vp=printPage.viewports.find(v=>v.id===printPage.activeViewport)||printPage.viewports[0];
    panel.querySelectorAll?.('[data-viewport-field]').forEach(input=>{const key=input.dataset.viewportField;if(vp&&document.activeElement!==input)input.value=key==='scale'?Number(vp[key]).toFixed(3):Number(vp[key]).toFixed(1);input.disabled=!vp||!!vp.locked;});
    const lockButton=$('print-lock-viewport');if(lockButton){lockButton.disabled=!vp;lockButton.textContent=vp?.locked?'Unlock viewport':'Lock viewport';}
    const label=$('print-viewport-status');if(label)label.textContent=vp?'Viewport '+(printPage.viewports.indexOf(vp)+1)+' selected':'No viewport selected';
    const undoButton=$('print-undo');if(undoButton)undoButton.disabled=!printPage.history.length;
  }
  function ensurePrintPanel(){
    if($('print-panel'))return;
    const properties=document.querySelector?.('.properties');if(!properties||typeof properties.appendChild!=='function')return;
    const panel=document.createElement('section');panel.id='print-panel';panel.hidden=true;panel.innerHTML='<div class="section-label">PRINT PAGE</div><p class="muted" id="print-viewport-status">No viewport selected</p><div class="field-grid print-page-fields"><label class="field-label">Paper<select id="print-paper"><option value="A4">A4</option><option value="A3">A3</option></select></label><label class="field-label">Orientation<select id="print-orientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><label class="field-label">Scale<select id="print-scale"><option value="fit">Fit page</option><option value="1">1:1</option><option value="2">1:2</option><option value="5">1:5</option><option value="10">1:10</option><option value="20">1:20</option><option value="50">1:50</option></select></label><label class="field-label">Dimension<select id="print-dimension-mode"><option value="aligned">Aligned</option><option value="diameter">Diameter Ø</option><option value="radius">Radius R</option></select></label></div><label class="field-label">Page title<input id="print-title" type="text" placeholder="Drawing title"></label><div class="print-actions"><button id="print-add-viewport" class="wide" type="button">Add viewport</button><button id="print-fit-viewports" class="wide" type="button">Fit viewports</button><button id="print-delete-viewport" class="wide" type="button">Delete viewport</button><button id="print-lock-viewport" class="wide" type="button">Lock viewport</button><button id="print-undo" class="wide" type="button">Undo print edit</button><button id="print-clear-annotations" class="wide" type="button">Clear print annotations</button><button id="print-output" class="wide primary" type="button">Print / Save PDF</button></div><div class="section-label print-viewport-heading">SELECTED VIEWPORT</div><div class="field-grid print-viewport-fields"><label class="field-label">X (mm)<input data-viewport-field="x" type="number" step="0.1"></label><label class="field-label">Y (mm)<input data-viewport-field="y" type="number" step="0.1"></label><label class="field-label">Width (mm)<input data-viewport-field="w" type="number" min="1" step="0.1"></label><label class="field-label">Height (mm)<input data-viewport-field="h" type="number" min="1" step="0.1"></label><label class="field-label">Viewport scale<input data-viewport-field="scale" type="number" min="0.001" step="0.001"></label></div><p class="muted">Select a viewport on the page and edit its size or scale. Dimensions, text, and new shapes placed here are print annotations only and never modify the workbench drawing.</p></section>';
    properties.appendChild(panel);
    const sync=()=>{printPage.paper=$('print-paper').value;printPage.orientation=$('print-orientation').value;printPage.scale=$('print-scale').value;printPage.title=$('print-title').value;printPage.viewports.forEach(v=>{if(!v.locked&&printPage.scale!=='fit')v.scale=1/Number(printPage.scale);});printPageFit();refreshPrintPanel();render();};
    $('print-paper').onchange=sync;$('print-orientation').onchange=()=>{sync();if(printPage.viewports.length)printPage.viewports[0].scale=printFitScale(printPage.viewports[0]);render();};$('print-scale').onchange=sync;$('print-title').oninput=()=>{printPage.title=$('print-title').value;render();};
    $('print-dimension-mode').onchange=()=>{$('dimension-mode').value=$('print-dimension-mode').value;render();};
    $('print-add-viewport').onclick=()=>{const page=printDimensions(),i=printPage.viewports.length,margin=20,size={x:margin+(i%2)*15,y:margin+(i%2)*15,w:page.w-margin*2,h:page.h-margin*2,scale:0.5,panX:0,panY:0,locked:false,id:'vp_'+printPage.nextId++};size.scale=printFitScale(size);printPage.viewports.push(size);printPage.activeViewport=size.id;refreshPrintPanel();render();};
    $('print-fit-viewports').onclick=()=>{printPage.viewports.forEach(v=>{if(!v.locked){v.scale=printFitScale(v);v.panX=0;v.panY=0;}});render();refreshPrintPanel();};
    $('print-delete-viewport').onclick=()=>{const vp=printPage.viewports.find(v=>v.id===printPage.activeViewport);if(!vp||vp.locked){if(vp?.locked)notice('Unlock the viewport before deleting it.');return;}printPage.viewports=printPage.viewports.filter(v=>v.id!==printPage.activeViewport);printPage.activeViewport=printPage.viewports[0]?.id||null;refreshPrintPanel();render();};
    $('print-lock-viewport').onclick=()=>{const vp=printPage.viewports.find(v=>v.id===printPage.activeViewport);if(!vp)return;vp.locked=!vp.locked;refreshPrintPanel();render();};
    $('print-undo').onclick=()=>{if(!printPage.history.length)return;printPage.future.push(clone(printPage.annotations));printPage.annotations=printPage.history.pop();refreshPrintPanel();render();};
    $('print-clear-annotations').onclick=()=>{if(!printPage.annotations.length)return;printPushHistory();printPage.annotations=[];refreshPrintPanel();render();};
    $('print-output').onclick=()=>{render();window.print();};
    panel.querySelectorAll('[data-viewport-field]').forEach(input=>input.onchange=()=>{const vp=printPage.viewports.find(v=>v.id===printPage.activeViewport);if(!vp)return;const key=input.dataset.viewportField,value=Number(input.value);if(Number.isFinite(value)&&value>0)vp[key]=value;render();refreshPrintPanel();});
  }
  function openPrintView(){
    ensurePrintPanel();
    const ids=CADSelection.expand(entities,selected),source=ids.size?visibleEntities().filter(e=>ids.has(e.id)):visibleEntities(),sourceKey=JSON.stringify(source);
    if(printPage.sourceKey!==sourceKey){printPage.parts=clone(source);printPage.annotations=[];printPage.history=[];printPage.future=[];printPage.viewports=[];printPage.activeViewport=null;printPage.nextId=1;printPage.sourceKey=sourceKey;}
    printPage.title=$('drawing-name').value||'Drawing';viewportHandleHover=null;
    if(!printPage.viewports.length){const page=printDimensions(),vp={id:'vp_'+printPage.nextId++,x:20,y:20,w:page.w-40,h:page.h-40,scale:.5};vp.scale=printFitScale(vp);printPage.viewports=[vp];printPage.activeViewport=vp.id;}
    setViewMode('print');
  }
  function renderPrint(){
    const dpr=window.devicePixelRatio||1;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#111a20';ctx.fillRect(0,0,width,height);
    const page=printDimensions(),top=screen({x:0,y:page.h});ctx.fillStyle='#f8faf9';ctx.fillRect(top.x,top.y,page.w*view.scale,page.h*view.scale);ctx.strokeStyle='#87949a';ctx.lineWidth=1;ctx.strokeRect(top.x,top.y,page.w*view.scale,page.h*view.scale);
    const b=printBounds();
    for(const vp of printPage.viewports){const p=screen({x:vp.x,y:vp.y+vp.h});ctx.save();ctx.beginPath();ctx.rect(p.x,p.y,vp.w*view.scale,vp.h*view.scale);ctx.clip();if(b)for(const source of printPage.parts)drawEntity(projectPrintEntity(vp,source,b),source.color||'#111a20',1.2);ctx.restore();ctx.strokeStyle=vp.id===printPage.activeViewport?'#36a9ff':'#6f8c8b';ctx.lineWidth=vp.id===printPage.activeViewport?2:1;ctx.setLineDash(vp.id===printPage.activeViewport?[6,4]:[3,3]);ctx.strokeRect(p.x,p.y,vp.w*view.scale,vp.h*view.scale);ctx.setLineDash([]);ctx.fillStyle='#31564f';ctx.font='11px Segoe UI';ctx.fillText('VIEWPORT '+(printPage.viewports.indexOf(vp)+1)+' · 1:'+Number((1/vp.scale).toFixed(3)),p.x+6,p.y+15);if(vp.id===printPage.activeViewport){const handles=[['sw',{x:p.x,y:p.y}],['se',{x:p.x+vp.w*view.scale,y:p.y}],['nw',{x:p.x,y:p.y+vp.h*view.scale}],['ne',{x:p.x+vp.w*view.scale,y:p.y+vp.h*view.scale}]];for(const [name,point] of handles){const hovered=viewportHandleHover?.id===vp.id&&viewportHandleHover.corner===name;ctx.fillStyle=hovered&&!vp.locked?'#f2d755':vp.locked?'#71808a':'#36a9ff';ctx.strokeStyle=hovered&&!vp.locked?'#10171c':'#d7f2ff';ctx.lineWidth=hovered?2:1;ctx.fillRect(point.x-4,point.y-4,8,8);ctx.strokeRect(point.x-4,point.y-4,8,8);}}}
    for(const annotation of printPage.annotations)drawEntity(annotation,annotation.color||'#111a20',1.4);
    ctx.fillStyle='#243139';ctx.font='12px Segoe UI';ctx.fillText(printPage.title||'Untitled drawing',top.x+16,top.y+22);ctx.fillText('Print page · '+page.w+' × '+page.h+' mm',top.x+16,top.y+page.h*view.scale-14);
    if(pointerInside){const q=screen(rawCursor),hoveringHandle=viewportHandleHover&&!viewportHandleHover.locked;ctx.save();ctx.strokeStyle=hoveringHandle?'#f2d755':'#10171c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(q.x-10,q.y);ctx.lineTo(q.x+10,q.y);ctx.moveTo(q.x,q.y-10);ctx.lineTo(q.x,q.y+10);ctx.stroke();ctx.strokeStyle=hoveringHandle?'#10171c':'#10171c';ctx.strokeRect(q.x-4,q.y-4,8,8);ctx.restore();}
  }
  function setViewMode(mode){
    if(mode==='print'){
      viewMode='print';ensurePrintPanel();document.querySelectorAll?.('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view==='print'));
      $('show-sheet').checked=false;setViewChrome(false);const printPanel=$('print-panel');if(printPanel)printPanel.hidden=false;
      const heading=document.querySelector?.('.properties .panel-heading');if(heading){heading.hidden=false;heading.firstChild.textContent='Print page ';}
      const props=document.querySelectorAll?.('.properties > section')||[];props.forEach(section=>{section.hidden=section.id!=='print-panel';});
      $('print-paper').value=printPage.paper;$('print-orientation').value=printPage.orientation;$('print-scale').value=printPage.scale;$('print-title').value=printPage.title;
      printPageFit();refreshPrintPanel();render();return;
    }
    viewMode=mode;viewportHandleHover=null;document.querySelectorAll?.('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===mode));
    const sheet=mode==='sheet';if(sheet&&!['select','move'].includes(tool)){tool='select';lastTool='select';draft=[];nodeDrag=null;edgeDrag=null;rightDrag=null;marqueeDrag=null;document.querySelectorAll?.('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool==='select'));} $('show-sheet').checked=sheet;setViewChrome(sheet);
    const workspaceSection=document.querySelector?.('.properties > section'),
      selectionSection=document.querySelector?.('#selection-heading')?.closest('section'),
      precisionSection=document.querySelector?.('form#precision')?.closest('section'),
      helpSection=document.querySelector?.('.properties .help');
    [workspaceSection,selectionSection,precisionSection,helpSection].forEach(section=>{if(section)section.hidden=sheet;});
    if(sheet){['text-options','dimension-options','edit-options'].forEach(id=>{const el=$(id);if(el)el.hidden=true;});}else{$('text-options').hidden=tool!=='text';$('dimension-options').hidden=tool!=='dimension';$('edit-options').hidden=!['offset','trim','extend','fillet','radius'].includes(tool);}
    const printPanel=$('print-panel');if(printPanel)printPanel.hidden=true;
    const heading=document.querySelector?.('.properties .panel-heading');if(heading){heading.hidden=sheet;heading.firstChild.textContent='Drawing properties ';}
    $('sheet-panel').hidden=!sheet;if(sheet)fitSheet();else render();
  }
  function updateSheetToolAvailability(sheet){
    const allowed=new Set(['select','move','duplicate']);
    document.querySelectorAll?.('.toolrail button').forEach(button=>{
      const id=button.dataset.tool||button.id;
      const disabled=!!sheet&&!allowed.has(id);
      button.disabled=disabled;
      if(typeof button.setAttribute==='function')button.setAttribute('aria-disabled',String(disabled));
    });
  }
  function setViewChrome(sheet){
    document.body?.classList.toggle('sheet-layout-view',sheet);
    document.body?.classList.toggle('print-layout-view',viewMode==='print');
    // Keep the tool rail in the grid as an empty first column. Hiding the
    // grid item itself makes CSS Grid auto-place <main> into that column and
    // stretches the properties panel across the drawing area. The rail is
    // visually suppressed in Sheet Layout, while the canvas and properties
    // columns retain their normal positions.
    const rail=document.querySelector?.('.toolrail');
    if(rail){rail.hidden=false;rail.setAttribute('aria-hidden','false');}
    updateSheetToolAvailability(sheet);
    const hideInSheet=['.canvas-toolbar','.commandbar','.command-entry','main>footer'];
    hideInSheet.forEach(selector=>{const node=document.querySelector?.(selector);if(node)node.hidden=sheet;});
    const layers=$('layers-panel');if(layers)layers.hidden=sheet;
    const propertiesHeading=document.querySelector?.('.properties .panel-heading');if(propertiesHeading)propertiesHeading.hidden=sheet;
    const files=document.querySelector?.('header .file-actions');if(files)files.hidden=false;
  }
  function ensureViewTabs(){
    const main=document.querySelector?.('main');if(!main||typeof main.insertBefore!=='function'||document.querySelector?.('#view-tabs'))return;
    const tabs=document.createElement('nav');tabs.id='view-tabs';tabs.className='view-tabs';tabs.setAttribute('aria-label','Workspace views');
    for(const [label,mode] of [['Drawing board','drawing'],['Sheet layout','sheet'],['Print page','print']]){const button=document.createElement('button');button.type='button';button.dataset.view=mode;button.textContent=label;button.className=mode==='drawing'?'active':'';button.onclick=()=>mode==='print'?openPrintView():setViewMode(mode);tabs.appendChild(button);}main.insertBefore(tabs,main.firstChild);
  }
  ensureSheetRotateControl();
  ensureArcTool();
  ensureViewTabs();
  ensurePrintPanel();
  setViewMode('drawing');
  function sheetSettings(){const base={width:Number($('sheet-width').value),height:Number($('sheet-height').value),margin:Number($('sheet-margin').value),gap:Number($('sheet-gap').value),sheetGap:100,rotate:$('sheet-rotate')?.checked!==false};const stocks=[];const rows=document.querySelectorAll?.('#sheet-stock-list .sheet-stock-row')||[];rows.forEach(row=>{if(typeof row.querySelectorAll!=='function')return;const fields=row.querySelectorAll('input');if(fields.length>=3&&fields[0].value!==''&&fields[1].value!=='')stocks.push({width:Number(fields[0].value),height:Number(fields[1].value),quantity:Number(fields[2].value)});});const quantityValue=$('sheet-quantity')?.value,quantity=quantityValue===''?1:Number(quantityValue);base.stocks=[{...base,quantity:Number.isFinite(quantity)&&quantity>=0?quantity:1},...stocks];return base;}
  function layoutCollisionDelta(ids,dx,dy){
    if(!$('show-sheet').checked)return {dx,dy};
    const chosen=CADSelection.expand(entities,ids),moving=entities.filter(e=>chosen.has(e.id)&&!['text','dimension'].includes(e.type));if(!moving.length)return {dx,dy};
    const others=entities.filter(e=>!chosen.has(e.id)&&!['text','dimension'].includes(e.type)),gap=Math.max(0,Number($('sheet-gap').value)||0),base=CADLayout.bounds(moving);
    const overlaps=(a,b)=>a.minX<b.maxX-1e-7&&a.maxX>b.minX+1e-7&&a.minY<b.maxY-1e-7&&a.maxY>b.minY+1e-7;
    const clear=(mx,my)=>{const moved={minX:base.minX+mx,maxX:base.maxX+mx,minY:base.minY+my,maxY:base.maxY+my};return others.every(e=>!overlaps(moved,CADLayout.bounds([e])));};
    if(clear(dx,dy))return {dx,dy};
    const candidates=[{dx,dy},{dx:0,dy:0}];
    for(const e of others){const b=CADLayout.bounds([e]);candidates.push({dx:b.minX-gap-base.maxX,dy},{dx:b.maxX+gap-base.minX,dy},{dx,dy:b.minY-gap-base.maxY},{dx,dy:b.maxY+gap-base.minY});}
    const valid=candidates.filter(c=>clear(c.dx,c.dy));if(!valid.length)return {dx:0,dy:0};
    valid.sort((a,b)=>(a.dx-dx)**2+(a.dy-dy)**2-((b.dx-dx)**2+(b.dy-dy)**2));return valid[0];
  }
  function layoutSnapDelta(ids,dx,dy){if(!$('show-sheet').checked)return {dx,dy};const s=sheetSettings(),sheets=layoutSheets.length?layoutSheets:[{index:0,x:0,y:0,width:s.width,height:s.height}],snapped=$('layout-snap')?.checked===false?{dx,dy}:CADLayout.snapTranslation(entities,ids,dx,dy,s,sheets,Math.max(s.gap*2,100));return layoutCollisionDelta(ids,snapped.dx,snapped.dy);}
  function rotateSelectedLayout(){if(!$('show-sheet').checked||!selected.size){notice('Show the sheet and select a part first.');return;}const ids=CADSelection.expand(entities,selected),chosen=entities.filter(e=>ids.has(e.id)&&!['text','dimension'].includes(e.type));if(!chosen.length)return;const b=CADLayout.bounds(chosen),pivot={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2},angle=(Number($('layout-rotation')?.value)||90)*Math.PI/180;remember();entities=entities.map(e=>ids.has(e.id)?CADLayout.rotateEntity(e,pivot,angle):e);commit();notice('Selected part rotated '+(angle*180/Math.PI)+'°. Ctrl+Z to undo.');}
  function fitSheet(){const s=sheetSettings();if(!Number.isFinite(s.width)||!Number.isFinite(s.height)||s.width<=0||s.height<=0){notice('Enter a positive sheet width and height.');return;}$('show-sheet').checked=true;const sheets=layoutSheets.length?layoutSheets:[{x:0,y:0,width:s.width,height:s.height}],maxW=Math.max(...sheets.map(sheet=>sheet.x+sheet.width)),maxY=Math.max(...sheets.map(sheet=>sheet.y+sheet.height)),totalH=Math.max(maxY,1);view.scale=Math.max(1e-8,Math.min((width-110)/Math.max(maxW,1),(height-110)/totalH));view.x=(width-maxW*view.scale)/2;view.y=(height+totalH*view.scale)/2;update();}
  $('fit-sheet').onclick=fitSheet;
  $('arrange-sheet').onclick=()=>{try{const result=CADLayout.arrangeMulti(entities,selected,sheetSettings());remember();entities=result.entities;layoutSheets=result.sheets;commit();setViewMode('sheet');notice('Selected parts arranged across '+layoutSheets.length+' sheet'+(layoutSheets.length===1?'':'s')+'. Ctrl+Z to undo.');}catch(err){notice(err.message);}};
  $('show-sheet').addEventListener('change',()=>setViewMode($('show-sheet').checked?'sheet':'drawing'));
  for(const id of ['sheet-width','sheet-height','sheet-margin','sheet-gap','sheet-colour','sheet-quantity'])$(id).addEventListener('change',()=>render());
  // The header action preserves the original export-to-print-window flow;
  // the Print page tab opens the integrated workbench print view.
  $('print-layout').onclick=()=>{const ids=CADSelection.expand(entities,selected);if(!ids.size){notice('Select the parts to send to the print layout.');return;}const snapshot=clone(visibleEntities().filter(e=>ids.has(e.id))),page=window.open('print-layout.html','_blank');if(!page){notice('Allow this app to open the print-layout window.');return;}const listener=event=>{if(event.source===page&&event.data?.type==='trendcad-print-ready'){page.postMessage({type:'trendcad-print-parts',entities:snapshot,name:$('drawing-name').value},'*');window.removeEventListener('message',listener);}};window.addEventListener('message',listener);};
  function makeDimension(a,b,p){const length=CAD.distance(a,b);return {type:'dimension',layer:'DIMENSIONS',a:{...a},b:{...b},offset:((p.x-a.x)*-(b.y-a.y)+(p.y-a.y)*(b.x-a.x))/length};}
  function notice(msg){$('notice').textContent=msg;$('notice').hidden=!msg;}
  function remember(){history.push(clone(entities));if(history.length>100)history.shift();future=[];dirty=true;}
  function commit(){selected=new Set([...selected].filter(id=>entities.some(e=>e.id===id)));update();}
  function add(e){if(viewMode==='print')return printAddAnnotation(e);if(hiddenLayers.has(activeLayer)){notice('Show the active layer before drawing on it.');return false;}if(e&&activeLayer!=='0')e.layer=activeLayer;if(e&&drawingColour&&e.type!=='text'&&!e.color)e.color=drawingColour;if(e&&!e.color&&layerColors.has(e.layer)&&e.layer!=='0')e.color=layerColors.get(e.layer);if(!CAD.valid(e)){notice('Enter valid geometry with a positive size.');return false;}remember();e.id=nextId++;entities.push(e);selected=new Set([e.id]);commit();return true;}
  function addPart(e){ensurePartsLayer();const part={...clone(e),layer:PARTS_LAYER,color:PARTS_COLOR};if(!CAD.valid(part)){notice('The island could not be converted into valid part geometry.');return false;}remember();part.id=nextId++;entities.push(part);selected=new Set([part.id]);commit();return true;}
  function partClick(point){try{const result=CADIsland.createIslandPolyline(visibleEntities().filter(e=>(e.layer||'0')!==PARTS_LAYER),point,{gapTolerance:partsGapTolerance()});if(!result){notice('No nearby island boundary was found. Click inside an enclosed drawing area.');return;}if(addPart(result.polyline)){notice('Closed part created on the Parts layer. Click another island, or press Esc to finish.');instructions();render();}}catch(err){notice('Parts tool cleanup failed: '+err.message);}}
  function update(){refreshLayers();
    $('group').disabled=selected.size<2;$('ungroup').disabled=!entities.some(e=>selected.has(e.id)&&e.groupId);$('explode').disabled=!entities.some(e=>selected.has(e.id)&&(e.groupId||e.type==='polyline'));$('dirty').textContent=dirty?'•':'';$('undo').disabled=!history.length;$('redo').disabled=!future.length;$('delete').disabled=!selected.size;$('duplicate').disabled=!selected.size;
    $('count').textContent=entities.length+' object'+(entities.length===1?'':'s')+(selected.size?' · '+selected.size+' selected':'');
    $('empty-state').hidden=entities.length>0||tool!=='select'||draft.length>0;
    $('zoom-label').textContent=Math.round(view.scale*100)+'%';$('grid-label').textContent=$('spacing').value+' mm';
    inspect();render();
  }
  function instructions(){
    $('diameter-dimension').classList.toggle('active',tool==='dimension'&&$('dimension-mode').value==='diameter');
    const text={text:'Drag a text box, release, then type. Enter adds a line; Ctrl+Enter or click outside places text; Esc cancels.',fillet:filletFirst?'Click the second straight edge. Type a radius at any time.':'Type a radius, then select the first straight edge.',radius:editSource?'Type the new radius and press Enter.':'Select a circle or arc to change its radius.',offset:editSource?'Click the side for the offset copy. Right-click commits the preview.':'Enter an offset distance, then click the source object.',trim:boundariesReady?(editAllEdges?'All edges are cutting boundaries. Click the portion to remove. Right-click finishes.':'Click the portion to trim away. Right-click finishes.'):'Select cutting edges ('+editBoundaries.size+'). Right-click to start trimming; Enter with none uses all edges.',extend:boundariesReady?(editAllEdges?'All edges are boundaries. Click near the endpoint to extend. Right-click finishes.':'Click near the endpoint to extend. Right-click finishes.'):'Select boundaries ('+editBoundaries.size+'). Right-click to start extending; Enter with none uses all edges.',dimension:draft.length===2?'Click to place the dimension line.':draft.length?'Click the second measurement point.':'Click the first measurement point.',parts:'Click inside an island to create a closed yellow polyline. Click more islands; Esc finishes.',select:'Drag square nodes to stretch connected segments. Select or drag a marquee: left → right touches; right → left encloses. Shift adds.',line:draft.length?'Click the end point, or press Enter to type the length.':'Click a start point, or enter exact coordinates.',rectangle:draft.length?'Click the opposite corner, or press Enter to type width and height.':'Click the first corner, or enter exact dimensions.',circle:draft.length?'Click to set the radius, or press Enter to type the diameter.':'Click the centre, or enter an exact diameter.',arc:draft.length===0?'Click the centre point.':draft.length===1?'Click the start point, or type a radius.':'Click the end point to create the arc.',polyline:draft.length?'Click the next vertex. Enter to finish; C or Shift + Enter to close.':'Click the first vertex. Each click adds a point.',move:selected.size?(draft.length?'Click the destination point.':'Click a base point, or enter a movement below.'):'Select objects before moving them.'};
    $('instruction').textContent=tool==='dimension'&&$('dimension-mode').value!=='aligned'?(dimensionSource?'Click to place the '+$('dimension-mode').value+' annotation.':'Select a circle or arc to dimension.'):text[tool];commandPrompt();$('cancel').hidden=!draft.length;$('finish').hidden=tool!=='polyline'||draft.length<2;$('close-polyline').hidden=tool!=='polyline'||draft.length<3;
  }
  function setTool(t){pasteDraft=null;cancelTextBox();$('text-options').hidden=t!=='text';nodeDrag=null;editAllEdges=false;boundariesReady=false;editBoundaries.clear();rightDrag=null;marqueeDrag=null;radiusSegment=null;dimensionSource=null;$('dimension-options').hidden=t!=='dimension';$('command-input').value='';$('command-suggestion').hidden=true;typedAim=null;rectangleWidth=null;filletFirst=null;edgeDrag=null;hideMenu();if(t!=='select')lastTool=t;tool=t;if(t==='parts')ensurePartsLayer();draft=[];editSource=null;tracking=[];$('edit-options').hidden=!['offset','trim','extend','fillet','radius'].includes(t);canvas.style.cursor=['select','move','offset','trim','extend','fillet','radius'].includes(t)?'none':'crosshair';$('radius-label').hidden=!['fillet','radius'].includes(t);$('apply-radius').hidden=t!=='radius';$('offset-label').hidden=t!=='offset';$('change-boundary').hidden=!['trim','extend'].includes(t);$('edit-help').textContent=t==='parts'?'Click inside an island to create a closed Parts polyline. Click more islands; Esc finishes.':t==='fillet'?'Enter a radius, then select two straight lines or adjacent polyline edges.':t==='radius'?'Select a circle or arc to change its radius, then type a new size.':t==='arc'?'Click the centre, start point, then end point. Enter a radius after the centre if preferred.':t==='offset'?'Select a source, then choose a side. Original geometry is retained.':t==='trim'?'Select cutting edges, then right-click to trim. Enter with no selection uses all edges. Editing a polyline separates its segments into lines and arcs.':'Select boundaries, then right-click to extend. Enter with no selection uses all edges. Editing a polyline separates its segments into lines and arcs.';document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));precision();instructions();update();}
  function field(label,name,value=0){return '<label class="field-label">'+label+'<input type="number" step="any" required name="'+name+'" value="'+value+'"></label>';}
  function precision(){let html='';if(tool==='rectangle')html=field('Origin X','x')+field('Origin Y','y')+field('Width (mm)','w',600)+field('Height (mm)','h',400);if(tool==='circle')html=field('Centre X','x')+field('Centre Y','y')+field('Diameter (mm)','diameter',100);if(tool==='line')html=field('Start X','x')+field('Start Y','y')+field('Length (mm)','length',600)+field('Angle (°)','angle',0);
    $('precision-fields').innerHTML='<div class="field-grid">'+html+'</div>';$('create-exact').hidden=!html;
  }
  function inspect(){
    const chosen=entities.filter(e=>selected.has(e.id));$('selection-heading').textContent=chosen.length?chosen.length===1?chosen[0].type.toUpperCase()+' SELECTED':chosen.length+' OBJECTS SELECTED':'NO SELECTION';
    if(!chosen.length){$('inspector').innerHTML='<p class="muted">Select an object to view and edit its dimensions.</p>';return;}
    let html='';if(chosen.length===1){const e=chosen[0];html='<form id="edit-form"><label class="field-label">Layer<input type="text" name="layer" value="'+escape(e.layer||'0')+'" required></label><div class="field-grid">';
      if(e.type==='text'){html+='<label class="field-label">Wording<textarea name="text" required maxlength="4000">'+escape(e.text)+'</textarea></label>'+field('Insertion X','x',e.x)+field('Insertion Y','y',e.y)+field('Height (mm)','height',e.height)+field('Rotation °','rotation',e.rotation);}
      else if(e.type==='circle'||e.type==='arc'){html+=field('Centre X','x',e.x)+field('Centre Y','y',e.y)+field('Radius (mm)','r',e.r);if(e.type==='arc')html+=field('Start angle °','start',e.start)+field('End angle °','end',e.end);}
      else if(e.type==='line'||e.type==='dimension')html+=field('Start X','ax',e.a.x)+field('Start Y','ay',e.a.y)+field('End X','bx',e.b.x)+field('End Y','by',e.b.y);
      if(e.type==='dimension')html+=field('Offset (mm)','offset',e.offset);html+='</div>';if(e.type==='dimension')html+='<p class="muted">Measured length: '+fmt(CAD.dimension(e).length)+' mm. Independent annotation; remeasure after changing the part.</p>';
      if(e.vertices){const b=CAD.bounds([e]);html+='<p class="muted">'+e.vertices.length+' vertices · '+fmt(b.maxX-b.minX)+' × '+fmt(b.maxY-b.minY)+' mm</p><label class="field-label">Vertices: X, Y, bulge (one per line)<textarea name="vertices" spellcheck="false">'+e.vertices.map(p=>[p.x,p.y,p.bulge||0].join(', ')).join('\n')+'</textarea></label><label class="field-label"><input type="checkbox" name="closed" '+(e.closed?'checked':'')+'> Closed contour</label>';}
      html+='<button class="wide" type="submit">Apply changes</button></form>';
    }
    html+='<form id="move-form"><div class="field-grid">'+field('Move ΔX (mm)','dx')+field('Move ΔY (mm)','dy')+'</div><button class="wide" type="submit">Move selection</button></form>';
    $('inspector').innerHTML=html;
    if($('edit-form'))$('edit-form').onsubmit=ev=>{ev.preventDefault();try{const f=new FormData(ev.target),e=clone(chosen[0]),n=k=>Number(f.get(k));e.layer=String(f.get('layer')).trim()||'0';if(/[<>/\\":;?*|=\r\n]/.test(e.layer))throw Error('Use a layer name without DXF reserved characters.');if(e.vertices){e.vertices=String(f.get('vertices')).trim().split(/\n/).map(row=>{const v=row.split(',').map(x=>Number(x.trim()));if(v.length<2||v.length>3||!v.every(Number.isFinite))throw Error('Each vertex needs X, Y, and an optional bulge.');return {x:v[0],y:v[1],bulge:v[2]||0};});e.closed=f.has('closed');}else if(e.type==='line'||e.type==='dimension'){if(e.type==='dimension')e.offset=n('offset');e.a={x:n('ax'),y:n('ay')};e.b={x:n('bx'),y:n('by')};}else if(e.type==='text'){e.x=n('x');e.y=n('y');e.text=String(f.get('text')||'');e.height=n('height');e.rotation=n('rotation');}else{e.x=n('x');e.y=n('y');e.r=n('r');if(e.type==='arc'){e.start=n('start');e.end=n('end');}}if(!CAD.valid(e))throw Error('Geometry must have valid coordinates and a positive size.');const original=chosen[0];let updated;if(original.type==='arc'&&e.r!==original.r&&e.x===original.x&&e.y===original.y&&e.start===original.start&&e.end===original.end){updated=CADEdit.resizeRadius(entities,e.id,e.r);updated=updated.map(old=>old.id===e.id?{...old,layer:e.layer}:old);}else updated=entities.map(old=>old.id===e.id?e:old);remember();entities=updated;commit();}catch(err){notice(err.message);}};
    $('move-form').onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.target);move(Number(f.get('dx')),Number(f.get('dy')));};
  }
  function move(dx,dy){if(!selected.size||!Number.isFinite(dx)||!Number.isFinite(dy)||(!dx&&!dy))return;const snappedLayout=layoutSnapDelta(selected,dx,dy);dx=snappedLayout.dx;dy=snappedLayout.dy;remember();entities=entities.map(e=>selected.has(e.id)?CAD.translate(e,dx,dy):e);commit();}
  function drawEntity(e,color,lineWidth=1.5,dash=[]){
    if(e.type==='text'){
      const p=screen(e);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-e.rotation*Math.PI/180);ctx.font=(e.bold?'bold ':'')+(e.height*view.scale)+'px monospace';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle=color;e.text.split('\n').forEach((line,i)=>ctx.fillText(line,0,i*e.height*view.scale*1.4));ctx.restore();return;
    }
    if(e.type==='dimension'){
      if(!CAD.valid(e))return;const dim=CAD.dimension(e);for(const [a,b] of dim.lines)drawEntity({type:'line',a,b},color,lineWidth,dash);
      const p=screen(dim.text);ctx.save();ctx.font='13px Segoe UI';ctx.textAlign='center';ctx.textBaseline='bottom';const w=ctx.measureText(dim.label).width;ctx.fillStyle='#111a20';ctx.fillRect(p.x-w/2-5,p.y-23,w+10,21);ctx.fillStyle=color;ctx.fillText(dim.label,p.x,p.y-6);ctx.restore();return;
    }const ps=CAD.points(e);if(!ps.length)return;ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.setLineDash(dash);ps.forEach((p,i)=>{const s=screen(p);if(!i)ctx.moveTo(s.x,s.y);else ctx.lineTo(s.x,s.y);});ctx.stroke();ctx.setLineDash([]);}
  function dragPivot(drag){if(drag.pivot)return drag.pivot;const geometry=drag.sources.filter(e=>!['text','dimension'].includes(e.type));if(!geometry.length)return null;const b=CADLayout.bounds(geometry);return drag.pivot={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2};}
  function transformDragEntity(e,drag){let result=e;if(drag.rotation&&dragPivot(drag))result=CADLayout.rotateEntity(result,dragPivot(drag),drag.rotation*Math.PI/180);return CAD.translate(result,drag.dx||0,drag.dy||0);}
  function outsideSheet(e,sheets){if(['text','dimension'].includes(e.type))return false;let b;try{b=CADLayout.bounds([e]);}catch{return false;}return !sheets.some(sheet=>b.minX>=sheet.x-1e-7&&b.maxX<=sheet.x+sheet.width+1e-7&&b.minY>=sheet.y-1e-7&&b.maxY<=sheet.y+sheet.height+1e-7);}
  function render(){
    if(viewMode==='print'){renderPrint();return;}
    const dpr=window.devicePixelRatio||1;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    if($('grid').checked){let step=Number($('spacing').value)||10;while(step*view.scale<16)step*=5;while(step*view.scale>160)step/=5;const px=step*view.scale;ctx.lineWidth=.5;ctx.strokeStyle='#26343c';ctx.beginPath();for(let x=((view.x%px)+px)%px;x<width;x+=px){ctx.moveTo(x,0);ctx.lineTo(x,height);}for(let y=((view.y%px)+px)%px;y<height;y+=px){ctx.moveTo(0,y);ctx.lineTo(width,y);}ctx.stroke();}
    ctx.strokeStyle='#3b5259';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(view.x,0);ctx.lineTo(view.x,height);ctx.moveTo(0,view.y);ctx.lineTo(width,view.y);ctx.stroke();
    if(textDrag){const a=screen(textDrag.start),b=screen(textDrag.end);ctx.strokeStyle='#e4c882';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(a.x-b.x),Math.abs(a.y-b.y));ctx.setLineDash([]);}if(textEditing)positionTextEditor();
    if($('show-sheet').checked){const s=sheetSettings(),sheets=layoutSheets.length?layoutSheets:[{index:0,x:0,y:0,width:s.width,height:s.height}];for(const sheet of sheets){const w=Number(sheet.width),h=Number(sheet.height);if(!(w>0&&h>0))continue;const p=screen({x:sheet.x,y:sheet.y+h});ctx.fillStyle=$('sheet-colour').value+'22';ctx.fillRect(p.x,p.y,w*view.scale,h*view.scale);drawEntity(rect({x:sheet.x,y:sheet.y},{x:sheet.x+w,y:sheet.y+h}),$('sheet-colour').value,2,[8,4]);ctx.fillStyle=$('sheet-colour').value;ctx.font='12px Segoe UI';ctx.fillText((sheet.stockName||'SHEET '+(sheet.index+1))+' '+w+' × '+h+' mm',p.x+8,p.y+18);}}
    const hoverEdit=editHoverPreview();
    const visibleSelection=marqueeDrag&&marqueeDrag.moved?marqueeSelection():selected;
    const activeSheets=$('show-sheet').checked?(layoutSheets.length?layoutSheets:[{index:0,x:0,y:0,width:Number($('sheet-width').value),height:Number($('sheet-height').value)}]):[];
    visibleEntities().filter(e=>e.id!==hoverEdit?.id&&e.id!==textEditing?.source?.id).forEach(e=>{const out=activeSheets.length&&outsideSheet(e,activeSheets);drawEntity(e,out?'#ff4040':visibleSelection.has(e.id)?'#36d9ff':e.type==='dimension'?'#e4c882':e.color||'#d0e2e7',visibleSelection.has(e.id)?2.5:out?2:1.5);});
    if(hoverEdit){for(const e of hoverEdit.solid)drawEntity(e,'#d0e2e7',1.5);for(const e of hoverEdit.dashed)drawEntity(e,'#f2d755',2,[7,5]);}
    if(viewMode!=='sheet')for(const e of visibleEntities().filter(e=>visibleSelection.has(e.id)&&e.id!==hoverEdit?.id&&e.id!==textEditing?.source?.id)){for(const p of CAD.anchors(e)){const s=screen(p);ctx.fillStyle='#18332e';ctx.strokeStyle='#36d9ff';ctx.fillRect(s.x-3,s.y-3,6,6);ctx.strokeRect(s.x-3,s.y-3,6,6);}}
    if(draft.length){let preview;if(tool==='dimension'){if(dimensionSource)preview=makeRadialDimension(dimensionSource,cursor);else if(draft.length===1)preview={type:'line',a:draft[0],b:cursor};else preview=makeDimension(draft[0],draft[1],cursor);}if(tool==='rectangle')preview=rect(draft[0],cursor);if(tool==='line')preview={type:'line',a:draft[0],b:cursor};if(tool==='circle')preview={type:'circle',...draft[0],r:CAD.distance(draft[0],cursor)};if(tool==='arc'&&draft.length===1&&CAD.distance(draft[0],cursor)>1e-8)preview={type:'circle',...draft[0],r:CAD.distance(draft[0],cursor)};if(tool==='arc'&&draft.length>=2&&CAD.distance(draft[0],cursor)>1e-8)preview=arcFromPoints(draft[0],draft[1],cursor);if(tool==='polyline')preview={type:'polyline',vertices:[...draft,cursor],closed:false};if(preview)drawEntity(preview,'#e4c882',1.5,[5,4]);if(tool==='move')entities.filter(e=>selected.has(e.id)).forEach(e=>drawEntity(CAD.translate(e,cursor.x-draft[0].x,cursor.y-draft[0].y),'#e4c882',1.5,[5,4]));
      if(preview&&tool!=='dimension'){const p=screen(cursor);ctx.font='11px Consolas';ctx.fillStyle='#e4c882';let label=tool==='circle'?'Ø '+fmt(preview.r*2):tool==='arc'?'R '+fmt(preview.r):tool==='rectangle'?fmt(Math.abs(cursor.x-draft[0].x))+' × '+fmt(Math.abs(cursor.y-draft[0].y)):fmt(CAD.distance(draft.at(-1),cursor))+' mm';ctx.fillText(label,p.x+12,p.y-12);}
    }
    if(viewMode!=='sheet'&&tool==='select'&&!marqueeDrag&&!rightDrag)for(const e of entities.filter(e=>selected.has(e.id)&&!e.groupId)){for(const h of CADEdit.edgeHandles(e)){const p=screen(h.mid),a=screen(h.a),b=screen(h.b);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x));ctx.fillStyle='#f2d755';ctx.strokeStyle='#172027';ctx.lineWidth=1;ctx.fillRect(-11,-4,22,8);ctx.strokeRect(-11,-4,22,8);ctx.restore();}}
    if(rightDrag&&rightDrag.active){
      for(const e of rightDrag.sources){const preview=transformDragEntity(e,rightDrag),out=activeSheets.length&&outsideSheet(preview,activeSheets);drawEntity(preview,out?'#ff4040':rightDrag.copy?'#f2d755':'#36d9ff',2,[5,3]);}
      const p=screen(rightDrag.pointer);ctx.font='12px Segoe UI';ctx.fillStyle=rightDrag.copy?'#f2d755':'#36d9ff';ctx.fillText((rightDrag.copy?'COPY':'MOVE')+'  ΔX '+fmt(rightDrag.dx)+'  ΔY '+fmt(rightDrag.dy)+' mm',p.x+14,p.y-14);
      if(rightDrag.rotation)ctx.fillText('ROT '+fmt(rightDrag.rotation)+'°',p.x+14,p.y+2);
    }
    if(nodeDrag&&nodeDrag.preview){for(const e of nodeDrag.preview)if(e!==entities.find(old=>old.id===e.id))drawEntity(e,'#f2d755',2,[5,3]);const p=screen(nodeDrag.destination);ctx.strokeStyle='#f2d755';ctx.strokeRect(p.x-5,p.y-5,10,10);}
    if(edgeDrag&&edgeDrag.preview){drawEntity(edgeDrag.preview,'#f2d755',2,[5,3]);const p=screen(edgeDrag.pointer);ctx.font='12px Segoe UI';ctx.fillStyle='#f2d755';ctx.fillText(fmt(edgeDrag.amount)+' mm',p.x+12,p.y-12);}
    if(['trim','extend'].includes(tool))for(const e of entities)if(editBoundaries.has(e.id))drawEntity(e,'#deaaef',2);
    if(editSource){const source=entities.find(e=>e.id===editSource);if(source){drawEntity(source,'#deaaef',2);if(tool==='offset'){try{drawEntity(CADEdit.offset(source,Number($('offset-distance').value),rawCursor),'#e4c882',1.5,[5,4]);}catch{}}}}
    for(const guide of tracking){const a=screen(guide.node),b=screen(cursor);ctx.strokeStyle='#e4c882';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);ctx.strokeRect(a.x-4,a.y-4,8,8);ctx.font='11px Segoe UI';ctx.fillStyle='#e4c882';ctx.fillText(guide.axis==='x'?'Vertical alignment':'Horizontal alignment',b.x+12,b.y+20+(guide.axis==='y'?15:0));}
    if(marqueeDrag&&marqueeDrag.moved){const a=screen(marqueeDrag.start),b=screen(marqueeDrag.current),crossing=b.x>=a.x;ctx.save();ctx.strokeStyle=crossing?'#6fe0c5':'#76acff';ctx.fillStyle=crossing?'#6fe0c51a':'#76acff1a';ctx.lineWidth=1.5;ctx.setLineDash(crossing?[6,4]:[]);const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);ctx.font='12px Segoe UI';ctx.fillStyle=crossing?'#6fe0c5':'#76acff';ctx.fillText(crossing?'Touching objects →':'← Fully enclosed objects',x+5,Math.max(16,y-8));ctx.restore();}
    if(pointerInside&&!nodeDrag&&!pan&&!edgeDrag&&!marqueeDrag&&!rightDrag&&['select','move','offset','trim','extend','fillet','radius'].includes(tool)){
      const p=screen(rawCursor),reach=130,gap=10;
      ctx.save();ctx.setLineDash([]);ctx.strokeStyle='#f2d755';ctx.lineWidth=1;ctx.beginPath();
      ctx.moveTo(p.x-reach,p.y);ctx.lineTo(p.x-gap,p.y);ctx.moveTo(p.x+gap,p.y);ctx.lineTo(p.x+reach,p.y);
      ctx.moveTo(p.x,p.y-reach);ctx.lineTo(p.x,p.y-gap);ctx.moveTo(p.x,p.y+gap);ctx.lineTo(p.x,p.y+reach);ctx.stroke();
      ctx.strokeStyle=pickAt(rawCursor,true)?'#6fe0c5':'#ecf1f2';ctx.lineWidth=1.5;ctx.strokeRect(p.x-gap,p.y-gap,gap*2,gap*2);ctx.restore();
    }
    if(pasteDraft){const dx=pasteDraft.point.x-pasteDraft.origin.x,dy=pasteDraft.point.y-pasteDraft.origin.y;for(const e of objectClipboard)drawEntity(CAD.translate(e,dx,dy),'#e4c882',2,[5,4]);}
    if(tool==='select'&&pointerInside&&!rightDrag&&!nodeDrag&&!marqueeDrag){const grip=objectMoveGrip(rawCursor);if(grip){const p=screen(grip);ctx.fillStyle='#f2d755';ctx.fillRect(p.x-5,p.y-5,10,10);ctx.strokeStyle='#111a20';ctx.strokeRect(p.x-5,p.y-5,10,10);ctx.fillStyle='#f2d755';ctx.font='11px Segoe UI';ctx.fillText('Move object',p.x+14,p.y-14);}}
    if(snapPoint&&tool!=='select'){const p=screen(snapPoint);ctx.strokeStyle='#e4c882';ctx.strokeRect(p.x-5,p.y-5,10,10);if(snapPoint.kind){ctx.font='11px Segoe UI';ctx.fillStyle='#e4c882';ctx.fillText(snapPoint.kind,p.x+12,p.y+22);}}
  }
  function fit(){if(viewMode==='print'){printPageFit();render();return;}const b=CAD.bounds(visibleEntities());if(!b){view={x:80,y:height-80,scale:.7};}else{const w=Math.max(b.maxX-b.minX,10),h=Math.max(b.maxY-b.minY,10);view.scale=Math.max(1e-8,Math.min((width-110)/w,(height-110)/h));view.x=width/2-(b.minX+b.maxX)/2*view.scale;view.y=height/2+(b.minY+b.maxY)/2*view.scale;}update();}
  function zoom(factor,at={x:width/2,y:height/2}){const p=world(at);view.scale=Math.max(1e-8,Math.min(10000,view.scale*factor));view.x=at.x-p.x*view.scale;view.y=at.y+p.y*view.scale;$('zoom-label').textContent=Math.round(view.scale*100)+'%';render();}
  function getPosition(ev){const r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
  function snapModes(){return Object.fromEntries(['endpoint','midpoint','center','quadrant','nearest','perpendicular'].map(mode=>[mode,$('snap-'+mode).checked]));}
  function findObjectSnap(p,exclude=null,origin=null){
    const originKey=origin?origin.x.toFixed(6)+','+origin.y.toFixed(6):'';if(originKey!==perpendicularSnapState.origin)perpendicularSnapState={origin:originKey,key:'',side:0,passed:false};
    const candidates=visibleEntities().flatMap(e=>CADEdit.snapCandidates(e,p,snapModes(),origin)).filter(a=>!exclude||CAD.distance(a,exclude)>1e-5);
    const priority={Endpoint:0,Midpoint:1,Center:2,Quadrant:3,Perpendicular:4};
    for(const nearest of [false,true]){const tolerance=10/view.scale;let hit=null,bestActual=Infinity,bestPriority=Infinity;for(const a of candidates){if((a.kind==='Nearest')!==nearest)continue;if(a.kind==='Perpendicular'&&Number.isFinite(a.cursorParameter)&&Number.isFinite(a.snapParameter)){const key=a.x.toFixed(6)+','+a.y.toFixed(6),side=Math.sign(a.cursorParameter-a.snapParameter);if(perpendicularSnapState.key===key&&perpendicularSnapState.passed)continue;if(perpendicularSnapState.key===key&&perpendicularSnapState.side&&side&&side!==perpendicularSnapState.side){perpendicularSnapState.passed=true;continue;}}const activation=a.snapDistance??CAD.distance(p,a);if(activation>tolerance)continue;const actual=CAD.distance(p,a),rank=priority[a.kind]??9;if(rank<bestPriority||(rank===bestPriority&&actual<bestActual-1e-7)){bestActual=actual;bestPriority=rank;hit=a;}}if(hit){if(hit.kind==='Perpendicular'&&Number.isFinite(hit.cursorParameter)&&Number.isFinite(hit.snapParameter)&&!perpendicularSnapState.key){perpendicularSnapState.key=hit.x.toFixed(6)+','+hit.y.toFixed(6);perpendicularSnapState.side=Math.sign(hit.cursorParameter-hit.snapParameter);}return hit;}}return null;
  }
  function snapped(p){snapPoint=null;tracking=[];if(['select','parts','offset','trim','extend','fillet','radius'].includes(tool))return p;let out={...p};if($('object-snap').checked){const origin=['line','polyline'].includes(tool)&&draft.length?draft.at(-1):null;snapPoint=findObjectSnap(p,null,origin);}if(snapPoint)out={...snapPoint};else if($('snap').checked){const step=Number($('spacing').value)||10;out={x:Math.round(p.x/step)*step,y:Math.round(p.y/step)*step};}
    if($('snap-extend').checked&&!snapPoint){const nodes=[...visibleEntities().flatMap(e=>CAD.anchors(e)),...draft];const aligned=CAD.trackSnap(p,out,nodes,8/view.scale);out=aligned.point;tracking=aligned.guides;}
    if(shift&&draft.length&&['line','polyline'].includes(tool)){out=CAD.angleSnap(draft.at(-1),out,Number($('angle-step').value)||10);snapPoint=null;tracking=tracking.filter(g=>Math.abs(out[g.axis]-g.node[g.axis])<1e-7);}else if($('ortho').checked&&draft.length&&['line','polyline','move'].includes(tool)){const a=draft.at(-1);if(Math.abs(out.x-a.x)>Math.abs(out.y-a.y))out.y=a.y;else out.x=a.x;snapPoint=null;tracking=tracking.filter(g=>Math.abs(out[g.axis]-g.node[g.axis])<1e-7);}return out;
  }
  function printPointerDown(ev){
    if(ev.button!==0)return;
    const p=world(getPosition(ev));rawCursor={...p};cursor={...p};snapPoint=null;tracking=[];
    if(tool==='select'){const hit=printViewportAt(p);if(hit){printPage.activeViewport=hit.id;if(!hit.locked){const corner=viewportCorner(hit,p);viewportDrag={viewport:hit,kind:corner?'resize':'move',corner,start:{...p},origin:{x:hit.x,y:hit.y,w:hit.w,h:hit.h}};canvas.setPointerCapture(ev.pointerId);}refreshPrintPanel();render();}return;}
    if(tool==='text'){textDrag={start:{...p},end:{...p}};canvas.setPointerCapture(ev.pointerId);return;}
    if(tool==='dimension'){
      if($('print-dimension-mode')?.value&&$('print-dimension-mode').value!=='aligned'){
        if(!printDimensionSource){const hit=printPickAt(p);if(!hit||!['circle','arc'].includes(hit.projected.type)){notice('Choose a circle or arc in a viewport.');return;}printDimensionSource=clone(hit.projected);draft=[{x:hit.projected.x,y:hit.projected.y}];}
        else if(printAddAnnotation(makeRadialDimension(printDimensionSource,p))){printDimensionSource=null;draft=[];}
      }else if(draft.length<2){if(!draft.length||CAD.distance(draft[0],p)>1e-8)draft.push({...p});}
      else if(printAddAnnotation(makeDimension(draft[0],draft[1],p)))draft=[];
      instructions();render();return;
    }
    if(tool==='arc'){
      if(!draft.length)draft.push({...p});else if(draft.length===1){if(CAD.distance(draft[0],p)<1e-8)return;draft.push({...p});}else{const entity=arcFromPoints(draft[0],draft[1],p);if(printAddAnnotation(entity))draft=[];}
      instructions();render();return;
    }
    if(!draft.length)draft.push({...p});
    else if(tool==='polyline'){if(CAD.distance(p,draft.at(-1))>1e-8)draft.push({...p});}
    else{let e;if(tool==='rectangle')e=rect(draft[0],p);if(tool==='circle')e={type:'circle',...draft[0],r:CAD.distance(p,draft[0]),layer:'PRINT'};if(tool==='line')e={type:'line',a:draft[0],b:{...p},layer:'PRINT'};if(e&&printAddAnnotation(e))draft=[];}
    instructions();render();
  }
  // Capture print-page input before the workbench editing handlers. This keeps
  // print annotations out of the manufacturing entities array while retaining
  // the same toolbar tools and pointer gestures.
  canvas.addEventListener('pointermove',ev=>{if(viewMode!=='print')return;if(viewportDrag){updateViewportDrag(world(getPosition(ev)));ev.stopImmediatePropagation();return;}if(viewportPan){const p=world(getPosition(ev)),d=viewportPan;d.viewport.panX=(d.panX||0)+p.x-d.start.x;d.viewport.panY=(d.panY||0)+p.y-d.start.y;render();ev.stopImmediatePropagation();return;}if(pan||rightDrag||marqueeDrag||edgeDrag||nodeDrag||pasteDraft)return;const p=world(getPosition(ev));rawCursor={...p};cursor={...p};updateViewportHandleHover(p);if(textDrag)textDrag.end={...p};render();ev.stopImmediatePropagation();},true);
  canvas.addEventListener('pointerdown',ev=>{if(viewMode==='print'&&ev.button===0&&!space){ev.preventDefault();printPointerDown(ev);ev.stopImmediatePropagation();}},true);
  canvas.addEventListener('pointerdown',ev=>{if(viewMode==='print'&&ev.button===1){const p=world(getPosition(ev)),vp=printViewportAt(p);if(vp&&!vp.locked){printPage.activeViewport=vp.id;viewportPan={viewport:vp,start:{...p},panX:vp.panX||0,panY:vp.panY||0};canvas.setPointerCapture(ev.pointerId);ev.preventDefault();ev.stopImmediatePropagation();}}},true);
  canvas.addEventListener('pointerup',ev=>{if(viewMode==='print'&&viewportDrag){finishViewportDrag();ev.stopImmediatePropagation();return;}if(viewMode==='print'&&viewportPan){finishViewportPan();ev.stopImmediatePropagation();}},true);
  canvas.addEventListener('wheel',ev=>{if(viewMode!=='print')return;const p=world(getPosition(ev)),vp=printViewportAt(p);if(!vp||vp.locked)return;const b=printBounds();if(!b)return;const oldScale=vp.scale,ratio=Math.exp(-ev.deltaY*.001),nextScale=Math.max(.001,Math.min(1000,oldScale*ratio)),worldPoint={x:b.minX+(p.x-vp.x-(vp.panX||0))/oldScale,y:b.minY+(p.y-vp.y-(vp.panY||0))/oldScale};vp.scale=nextScale;vp.panX=p.x-vp.x-(worldPoint.x-b.minX)*nextScale;vp.panY=p.y-vp.y-(worldPoint.y-b.minY)*nextScale;printPage.activeViewport=vp.id;refreshPrintPanel();render();ev.preventDefault();ev.stopImmediatePropagation();},true);
  canvas.addEventListener('pointerenter',()=>{pointerInside=true;});canvas.addEventListener('pointerleave',()=>{pointerInside=false;viewportHandleHover=null;render();});
  canvas.addEventListener('pointermove',ev=>{pointerInside=true;shift=ev.shiftKey;const p=getPosition(ev);if(pasteDraft){rawCursor=world(p);pasteDraft.point=snapped(rawCursor);render();return;}if(textDrag){textDrag.end=world(p);render();return;}if(textEditing)return;if(nodeDrag){updateNodeDrag(world(p));render();return;}if(rightDrag){updateRightDrag(p,ev.shiftKey);render();return;}if(marqueeDrag){marqueeDrag.current=world(p);marqueeDrag.moved=marqueeDrag.moved||Math.hypot(p.x-marqueeDrag.screen.x,p.y-marqueeDrag.screen.y)>4;render();return;}if(edgeDrag){updateEdgeDrag(world(p));render();return;}if(pan){view.x=pan.x+p.x-pan.start.x;view.y=pan.y+p.y-pan.start.y;render();return;}rawCursor=world(p);cursor=snapped(rawCursor);$('coordinates').textContent='X '+cursor.x.toFixed(2)+'   Y '+cursor.y.toFixed(2);render();});
  canvas.addEventListener('pointerdown',ev=>{if(pasteDraft&&ev.button===0){const p=world(getPosition(ev));pasteDraft.point=snapped(p);commitPaste();return;}if(ev.button===0&&ev.detail===2&&!textEditing&&['select','text'].includes(tool)){const hit=textAt(world(getPosition(ev)));if(hit){ev.preventDefault();openTextEditor(hit);return;}}if(rightDrag?.grip&&rightDrag.waiting&&ev.button===0){finishRightDrag(ev);return;}if(textEditing){ev.preventDefault();commitTextBox();return;}suppressContext=false;hideMenu();canvas.focus();shift=ev.shiftKey;const p=getPosition(ev);if(ev.button===1||(ev.button===0&&space)){ev.preventDefault();pan={start:p,x:view.x,y:view.y};canvas.style.cursor='grabbing';$('instruction').textContent='Pan view: drag with the middle mouse button. Release to finish.';canvas.setPointerCapture(ev.pointerId);return;}if(ev.button===2&&['select','move'].includes(tool)&&!draft.length&&!$('command-input').value.trim()){
      const hit=pickAt(world(p),true);if(hit&&selected.has(hit.id)){
        ev.preventDefault();selected=CADSelection.expand(entities,selected);rightDrag={start:world(p),screen:p,pointer:world(p),pointerId:ev.pointerId,ids:new Set(selected),sources:clone(entities.filter(e=>selected.has(e.id))),priorTool:tool,active:false,copy:ev.shiftKey,dx:0,dy:0,rotation:0,pivot:null};tracking=[];snapPoint=null;canvas.setPointerCapture(ev.pointerId);return;
      }
    }
    if(ev.button!==0)return;rawCursor=world(p);cursor=snapped(rawCursor);
    if(tool==='select'){
      const grip=objectMoveGrip(rawCursor);if(grip){selected=new Set(CADSelection.members(entities,grip.id));rightDrag={grip:true,start:world(p),screen:p,pointer:world(p),ids:new Set(selected),sources:clone(entities.filter(e=>selected.has(e.id))),priorTool:tool,active:false,copy:false,dx:0,dy:0,rotation:0,pivot:null};canvas.setPointerCapture(ev.pointerId);update();return;}
      if(viewMode!=='sheet')for(const e of entities.filter(e=>selected.has(e.id)))for(const node of CADEdit.nodeHandles(e)){if(CAD.distance(screen(node),p)<=9){nodeDrag={origin:{x:node.x,y:node.y},start:world(p),destination:{x:node.x,y:node.y},preview:entities,error:null};canvas.setPointerCapture(ev.pointerId);$('instruction').textContent='Drag node. Connected endpoints move together. Release to apply; Esc cancels.';return;}}
      if(viewMode!=='sheet')for(const e of entities.filter(e=>selected.has(e.id)&&!e.groupId)){for(const h of CADEdit.edgeHandles(e)){
        const mid=screen(h.mid),a=screen(h.a),b=screen(h.b),len=Math.hypot(b.x-a.x,b.y-a.y),dx=p.x-mid.x,dy=p.y-mid.y;
        if(Math.abs((dx*(b.x-a.x)+dy*(b.y-a.y))/len)<=14&&Math.abs((dx*-(b.y-a.y)+dy*(b.x-a.x))/len)<=8){
          edgeDrag={source:clone(e),index:h.index,start:world(p),pointer:world(p),normal:{x:-(h.b.y-h.a.y)/CAD.distance(h.a,h.b),y:(h.b.x-h.a.x)/CAD.distance(h.a,h.b)},amount:0,preview:clone(e),error:null};tracking=[];snapPoint=null;canvas.setPointerCapture(ev.pointerId);$('instruction').textContent='Drag perpendicular to the edge. Release to apply; Esc cancels.';return;
        }
      }}
      // Clicking an already-selected object starts the direct left-button move
      // gesture. Sheet placement adds margin/collision snapping; the drawing
      // board uses the same move preview without those layout constraints.
      const hit=pickAt(rawCursor,true);
      if(hit&&selected.has(hit.id)){
        selected=CADSelection.expand(entities,selected);
        rightDrag={leftLayout:true,start:world(p),screen:p,pointer:world(p),pointerId:ev.pointerId,ids:new Set(selected),sources:clone(entities.filter(e=>selected.has(e.id))),priorTool:tool,active:false,copy:ev.shiftKey,dx:0,dy:0,rotation:0,pivot:null};
        tracking=[];snapPoint=null;canvas.setPointerCapture(ev.pointerId);return;
      }
    }
    if(tool==='text'){textDrag={start:{...cursor},end:{...cursor}};canvas.setPointerCapture(ev.pointerId);return;}
    if(tool==='parts'){partClick(rawCursor);return;}if(tool==='fillet'||tool==='radius'){roundClick(rawCursor);return;}
    if(['offset','trim','extend'].includes(tool)){editClick(rawCursor);return;}
    if(tool==='arc'){
      if(!draft.length){draft.push({...cursor});}
      else if(draft.length===1){if(CAD.distance(draft[0],cursor)<1e-8){notice('The arc start point must be away from its centre.');return;}draft.push({...cursor});}
      else{const entity=arcFromPoints(draft[0],draft[1],cursor);if(CAD.distance(draft[0],cursor)<1e-8){notice('The arc end point must be away from its centre.');return;}if(Math.abs(entity.start-entity.end)<1e-9){notice('Choose a different end angle.');return;}if(add(entity))draft=[];}
      instructions();update();return;
    }
    if(tool==='select'){marqueeDrag={start:world(p),current:world(p),screen:p,moved:false,add:ev.shiftKey,previous:new Set(selected),hit:pickAt(rawCursor,true)};canvas.setPointerCapture(ev.pointerId);return;}
    if(tool==='move'){if(!selected.size){const hit=pickAt(rawCursor,true);if(hit){selected=new Set(CADSelection.members(entities,hit.id));instructions();update();}else notice('Put the object inside the selection box and click.');return;}if(!draft.length)draft.push({...cursor});else{move(cursor.x-draft[0].x,cursor.y-draft[0].y);draft=[];}instructions();render();return;}
    if(tool==='dimension'){
      if($('dimension-mode').value!=='aligned'){
        if(!dimensionSource){const hit=pickAt(rawCursor);let source=hit;if(hit?.type==='polyline')source=nearestEdge(hit,rawCursor).part;if(!source||!['circle','arc'].includes(source.type)){$('command-feedback').textContent='Choose a circle or arc edge.';return;}dimensionSource=clone(source);draft=[{x:source.x,y:source.y}];}
        else if(add(makeRadialDimension(dimensionSource,cursor))){dimensionSource=null;draft=[];}
        instructions();update();return;
      }
      if(draft.length<2){if(!draft.length||CAD.distance(draft[0],cursor)>1e-8)draft.push({...cursor});}
      else if(add(makeDimension(draft[0],draft[1],cursor)))draft=[];
      instructions();update();return;
    }
    if(!draft.length){draft.push({...cursor});for(const axis of ['x','y']){const input=$('precision').elements.namedItem(axis);if(input)input.value=cursor[axis];}}else if(tool==='polyline'){if(CAD.distance(cursor,draft.at(-1))>1e-8)draft.push({...cursor});}else{let e;if(tool==='rectangle'){if(Math.abs(cursor.x-draft[0].x)<1e-9||Math.abs(cursor.y-draft[0].y)<1e-9){notice('A rectangle needs a positive width and height.');return;}e=rect(draft[0],cursor);}if(tool==='circle')e={type:'circle',...draft[0],r:CAD.distance(cursor,draft[0]),layer:'0'};if(tool==='line')e={type:'line',a:draft[0],b:{...cursor},layer:'0'};if(add(e))draft=[];}
    instructions();update();
  });
  canvas.addEventListener('pointerup',ev=>{if(textDrag){textDrag.end=world(getPosition(ev));const a=textDrag.start,b=textDrag.end;textDrag=null;const w=Math.abs(a.x-b.x),h=Math.abs(a.y-b.y);if(w*view.scale<12||h*view.scale<12){notice('Drag a box at least 12 pixels wide and high.');render();return;}textEditing={x:Math.min(a.x,b.x),y:Math.max(a.y,b.y),width:w,height:h,fontHeight:18/view.scale,colour:drawingColour||'#d0e2e7'};$('text-editor').value='';$('text-editor').hidden=false;positionTextEditor();$('text-editor').focus();$('instruction').textContent='Type your text. Enter adds a line; Ctrl+Enter or click outside to place; Esc cancels.';render();return;}if(nodeDrag){updateNodeDrag(world(getPosition(ev)));const drag=nodeDrag;nodeDrag=null;if(drag.error)notice(drag.error);else if(CAD.distance(drag.origin,drag.destination)>1e-7){remember();entities=drag.preview;commit();notice('Node moved; adjoining segments remain connected. Ctrl+Z to undo.');}instructions();render();return;}if(rightDrag){finishRightDrag(ev);return;}pan=null;if(marqueeDrag){finishMarquee(ev);return;}if(!edgeDrag)return;updateEdgeDrag(world(getPosition(ev)));const drag=edgeDrag;edgeDrag=null;instructions();if(drag.error)notice(drag.error);else if(Math.abs(drag.amount)>1e-7&&drag.preview){remember();entities=entities.map(e=>e.id===drag.source.id?drag.preview:e);commit();notice('Edge moved '+fmt(drag.amount)+' mm. Ctrl+Z to undo.');}render();});canvas.addEventListener('pointercancel',()=>{cancelTextBox();nodeDrag=null;cancelRightDrag();pan=null;edgeDrag=null;marqueeDrag=null;render();});canvas.addEventListener('lostpointercapture',()=>{if(textDrag){textDrag=null;render();}if(nodeDrag){nodeDrag=null;instructions();render();}if(rightDrag&&!rightDrag.waiting)cancelRightDrag();if(marqueeDrag){marqueeDrag=null;render();}if(edgeDrag){edgeDrag=null;render();}});canvas.addEventListener('wheel',ev=>{ev.preventDefault();if(rightDrag){activateRightDrag(rightDrag);const step=Math.max(1,Number($('layout-rotation')?.value)||90),direction=ev.deltaY<0?1:-1;rightDrag.rotation=(rightDrag.rotation||0)+direction*step;rightDrag.rotation=((rightDrag.rotation+180)%360+360)%360-180;updateRightDrag(screen(rightDrag.pointer),rightDrag.copy);render();return;}if(pasteDraft||textDrag||textEditing||nodeDrag||marqueeDrag||edgeDrag||rightDrag)return;zoom(Math.exp(-ev.deltaY*.001),getPosition(ev));},{passive:false});
  canvas.addEventListener('pointerup',ev=>{if(ev.button===1){restoreCanvasCursor();instructions();render();}});
  function finish(closed){if(tool!=='polyline'||draft.length<(closed?3:2))return;if(add({type:'polyline',vertices:clone(draft),closed,layer:'0'})){draft=[];instructions();render();}}
  $('finish').onclick=()=>finish(false);$('close-polyline').onclick=()=>finish(true);$('cancel').onclick=()=>{draft=[];instructions();render();};
  document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  $('diameter-dimension').onclick=()=>{$('dimension-mode').value='diameter';if($('print-dimension-mode'))$('print-dimension-mode').value='diameter';setTool('dimension');canvas.focus();};
  $('precision').onsubmit=ev=>{ev.preventDefault();const f=new FormData(ev.target),n=k=>Number(f.get(k));let e;if(tool==='rectangle'){if(n('w')<=0||n('h')<=0){notice('Width and height must be greater than zero.');return;}e=rect({x:n('x'),y:n('y')},{x:n('x')+n('w'),y:n('y')+n('h')});}if(tool==='circle')e={type:'circle',x:n('x'),y:n('y'),r:n('diameter')/2,layer:'0'};if(tool==='line')e={type:'line',a:{x:n('x'),y:n('y')},b:{x:n('x')+n('length')*Math.cos(n('angle')*Math.PI/180),y:n('y')+n('length')*Math.sin(n('angle')*Math.PI/180)},layer:'0'};if(tool==='line'&&n('length')<=0){notice('Length must be greater than zero.');return;}if(e&&add(e)){draft=[];instructions();fit();}};
  $('delete').onclick=()=>{if(!selected.size)return;remember();entities=entities.filter(e=>!selected.has(e.id));selected.clear();draft=[];instructions();commit();};
  $('duplicate').onclick=()=>{if(!selected.size)return;remember();const step=Number($('spacing').value)||10,copies=CADSelection.duplicate(entities,selected,step,step,newGroupId).map(e=>({...e,id:nextId++}));entities.push(...copies);selected=new Set(copies.map(e=>e.id));commit();notice('Duplicated selection with a '+step+' mm offset in X and Y. Use Move to position it.');};
  function undo(redo=false){if(viewMode==='print'){const from=redo?printPage.future:printPage.history,to=redo?printPage.history:printPage.future;if(!from.length)return;to.push(clone(printPage.annotations));printPage.annotations=from.pop();draft=[];refreshPrintPanel();render();return;}const from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(clone(entities));entities=from.pop();layoutSheets=[];selected.clear();draft=[];dirty=true;instructions();commit();}
  $('undo').onclick=()=>undo();$('redo').onclick=()=>undo(true);$('fit').onclick=fit;$('zoom-in').onclick=()=>zoom(1.25);$('zoom-out').onclick=()=>zoom(.8);
  ['grid','snap','object-snap','snap-extend','ortho'].forEach(id=>$(id).onchange=()=>{cursor=snapped(rawCursor);$('coordinates').textContent='X '+cursor.x.toFixed(2)+'   Y '+cursor.y.toFixed(2);render();});$('spacing').onchange=()=>{if(!Number.isFinite(Number($('spacing').value))||Number($('spacing').value)<=0)$('spacing').value=10;update();};
  function closeSnapSettings(){ $('snap-settings').hidden=true;$('snap-settings-toggle').ariaExpanded='false'; }
  $('snap-settings-toggle').onclick=()=>{const menu=$('snap-settings'),button=$('snap-settings-toggle');if(!menu.hidden){closeSnapSettings();return;}const r=button.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-248))+'px';menu.style.bottom=Math.max(8,window.innerHeight-r.top+8)+'px';menu.hidden=false;button.ariaExpanded='true';};
  $('snap-settings-close').onclick=()=>{closeSnapSettings();$('snap-settings-toggle').focus();};
  document.addEventListener('pointerdown',ev=>{if(!$('snap-settings').contains(ev.target)&&!$('snap-settings-toggle').contains(ev.target))closeSnapSettings();});
  for(const mode of ['endpoint','midpoint','center','quadrant','nearest','perpendicular'])$('snap-'+mode).onchange=()=>{cursor=snapped(rawCursor);render();};
  $('angle-step').onchange=()=>{const v=Number($('angle-step').value);if(!Number.isInteger(v)||v<1||v>180)$('angle-step').value=10;cursor=snapped(rawCursor);render();};
  const mayReplace=()=>!dirty||confirm('Replace this drawing? Export a DXF first if you need to keep your changes.');
  function replace(es,name){hiddenLayers.clear();layoutSheets=[];activeLayer='0';layerColors=new Map([['0','#d0e2e7']]);entities=es.map(e=>({...e,id:nextId++}));selected.clear();history=[];future=[];draft=[];dirty=false;$('drawing-name').value=name;setTool('select');fit();}
  $('new').onclick=()=>{if(!mayReplace())return;importWarnings=[];replace([],'Untitled drawing');notice('');};
  $('drawing-name').onchange=()=>{dirty=true;update();};
  function projectSnapshot(){const sheet=typeof sheetSettings==='function'?clone(sheetSettings()):null;if(sheet){sheet.layoutSnap=$('layout-snap')?.checked!==false;sheet.autoAngle=$('layout-auto-angle')?.value||'90';sheet.rotationSnap=$('layout-rotation')?.value||'90';}return{format:'TrendCad Solid project',version:1,name:$('drawing-name').value.trim()||'Untitled drawing',entities:clone(entities),nextId,hiddenLayers:[...hiddenLayers],layerColors:[...layerColors.entries()],activeLayer,layoutSheets:clone(layoutSheets),sheet,printPage:clone(printPage),view:clone(view),viewMode:viewMode==='sheet'||viewMode==='print'?viewMode:'drawing'};}
  function downloadProject(){const stem=($('drawing-name').value.trim()||'Drawing').replace(/[<>:"/\\|?*]/g,'_');try{const blob=new Blob([JSON.stringify(projectSnapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=stem+'.trendcad';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);dirty=false;update();notice('Saved '+stem+'.trendcad.');}catch(err){notice('Save failed: '+err.message);}}
  function restoreSheetSettings(saved){if(!saved)return;for(const [id,key] of [['sheet-width','width'],['sheet-height','height'],['sheet-margin','margin'],['sheet-gap','gap']])if($(id)&&Number.isFinite(Number(saved[key])))$(id).value=saved[key];if($('sheet-quantity')&&saved.stocks?.[0])$('sheet-quantity').value=saved.stocks[0].quantity??1;if($('sheet-rotate'))$('sheet-rotate').checked=saved.rotate!==false;if($('layout-snap')&&typeof saved.layoutSnap==='boolean')$('layout-snap').checked=saved.layoutSnap;if($('layout-auto-angle')&&saved.autoAngle)$('layout-auto-angle').value=String(saved.autoAngle);if($('layout-rotation')&&saved.rotationSnap)$('layout-rotation').value=String(saved.rotationSnap);const list=$('sheet-stock-list');if(list){list.innerHTML='';for(const stock of (saved.stocks||[]).slice(1)){if(!$('add-sheet-stock'))break;$('add-sheet-stock').click();const row=list.lastElementChild,fields=row?.querySelectorAll?.('input');if(fields?.length>=3){fields[0].value=stock.width??'';fields[1].value=stock.height??'';fields[2].value=stock.quantity??1;}}}}
  async function openProjectFile(file){if(!file)return;const extension=(file.name.match(/\.([^.]+)$/)||[])[1]?.toLowerCase();if(extension==='dwg'||extension==='dxf'){await importFile(file);return;}if(file.size>30*1024*1024){notice('Please use a project file smaller than 30 MB.');return;}try{const parsed=JSON.parse(await file.text());if(parsed?.format!=='TrendCad Solid project'||!Array.isArray(parsed.entities))throw Error('This is not a TrendCad Solid project file.');if(!mayReplace())return;const loaded=parsed.entities.map((e,i)=>({...clone(e),id:e.id??i+1}));if(!loaded.every(e=>{try{return CAD.valid(e);}catch{return false;}}))throw Error('The project contains invalid geometry.');entities=loaded;nextId=Math.max(Number(parsed.nextId)||1,...entities.map(e=>Number(e.id)||0))+1;hiddenLayers=new Set(Array.isArray(parsed.hiddenLayers)?parsed.hiddenLayers:[]);layerColors=new Map(Array.isArray(parsed.layerColors)&&parsed.layerColors.length?parsed.layerColors:[['0','#d0e2e7']]);if(!layerColors.has('0'))layerColors.set('0','#d0e2e7');activeLayer=layerColors.has(parsed.activeLayer)?parsed.activeLayer:'0';layoutSheets=Array.isArray(parsed.layoutSheets)?clone(parsed.layoutSheets):[];const savedPrint=parsed.printPage&&typeof parsed.printPage==='object'?clone(parsed.printPage):{};printPage={parts:[],annotations:[],viewports:[],paper:'A4',orientation:'landscape',scale:'fit',title:'',activeViewport:null,history:[],future:[],nextId:1,sourceKey:'',...savedPrint};printPage.parts=Array.isArray(printPage.parts)?printPage.parts:[];printPage.annotations=Array.isArray(printPage.annotations)?printPage.annotations:[];printPage.viewports=Array.isArray(printPage.viewports)?printPage.viewports:[];selected.clear();history=[];future=[];draft=[];objectClipboard=[];pasteDraft=null;importWarnings=[];dirty=false;$('drawing-name').value=parsed.name||file.name.replace(/\.(trendcad|tcs|json)$/i,'');restoreSheetSettings(parsed.sheet);refreshLayers();setTool('select');const mode=parsed.viewMode==='sheet'?'sheet':parsed.viewMode==='print'?'print':'drawing';if(mode==='print')setViewMode('print');else setViewMode(mode);if(mode==='drawing'&&parsed.view){view={x:Number(parsed.view.x)||view.x,y:Number(parsed.view.y)||view.y,scale:Number(parsed.view.scale)||view.scale};render();}else if(mode==='drawing')fit();notice('Opened '+file.name+'.');}catch(err){notice('Open failed: '+err.message);}}
  $('save').onclick=downloadProject;$('open-project').onclick=()=>{$('project-file').value='';$('project-file').click();};$('project-file').onchange=()=>openProjectFile($('project-file').files[0]);
  $('import').onclick=$('empty-import').onclick=()=>{$('file').value='';$('file').click();};
  let dwgModulePromise=null;
  async function dwgToDxf(file){
    if(location.protocol==='file:')throw Error('DWG conversion needs the local server. Start TrendCad.cmd, then open http://127.0.0.1:4173.');
    if(!dwgModulePromise)dwgModulePromise=import('./node_modules/dwgdxf/dist/index.js');
    const mod=await dwgModulePromise;
    const wasmBase=new URL('./node_modules/dwgdxf/dist/wasm/',document.baseURI).href;
    await mod.init({wasmBase});
    const converted=await mod.convertDwgToDxf(new Uint8Array(await file.arrayBuffer()));
    return new TextDecoder().decode(converted);
  }
  async function importFile(file){if(!file)return;if(file.size>30*1024*1024){notice('Please use a DXF or DWG smaller than 30 MB.');return;}const isDwg=/\.dwg$/i.test(file.name);notice(isDwg?'Converting DWG locally…':'Reading DXF…');try{const text=isDwg?await dwgToDxf(file):await file.text();const result=CAD.parseDXF(text);if(!result.entities.length){notice('No supported 2D objects found. '+result.warnings.join(' '));return;}if(!mayReplace())return;if(Object.keys(result.skipped).length&&!confirm('This '+(isDwg?'DWG':'DXF')+' contains unsupported objects:\n'+result.warnings.join('\n')+'\n\nImport the supported geometry only?'))return;importWarnings=result.warnings;replace(result.entities,file.name.replace(/\.(dxf|dwg)$/i,''));notice((isDwg?'Converted and imported ':'Imported ')+result.entities.length+' objects. '+result.warnings.join(' '));}catch(err){notice((isDwg?'DWG conversion/import failed: ':'Import failed: ')+err.message);}}
  $('file').onchange=()=>importFile($('file').files[0]);$('canvas-wrap').ondragover=ev=>ev.preventDefault();$('canvas-wrap').ondrop=ev=>{ev.preventDefault();importFile(ev.dataTransfer.files[0]);};
  $('export').onclick=()=>{if(!entities.length){notice('Draw or import some geometry before exporting.');return;}if(importWarnings.some(s=>s.includes('not imported'))&&!confirm('This drawing was imported with unsupported objects omitted. Export only the geometry visible here?'))return;try{const blob=new Blob([CAD.writeDXF(entities)],{type:'application/dxf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=($('drawing-name').value.trim()||'Drawing').replace(/[<>:"/\\|?*]/g,'_')+'.dxf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);dirty=false;update();notice('DXF download requested · millimetres · '+entities.length+' objects.');}catch(err){notice(err.message);}};
  $('sample').onclick=()=>{if(!mayReplace())return;importWarnings=[];replace([rect({x:0,y:0},{x:2400,y:600}),{type:'circle',x:1750,y:300,r:180,layer:'CUTOUTS'},{type:'circle',x:1750,y:545,r:17.5,layer:'CUTOUTS'},{type:'polyline',closed:true,layer:'CUTOUTS',vertices:[{x:200,y:120},{x:750,y:120},{x:750,y:480},{x:200,y:480}]}],'Sample worktop');dirty=true;update();notice('Sample drawing · 2400 × 600 mm worktop with example cutouts.');};
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){ev.preventDefault();cancelAll();return;}if(nodeDrag){ev.preventDefault();return;}if(rightDrag){if(ev.key==='Shift'){shift=true;rightDrag.copy=true;updateRightDrag(screen(rightDrag.pointer),true);render();}ev.preventDefault();return;}if(ev.key==='Shift'){shift=true;cursor=snapped(rawCursor);render();}if(ev.key==='F9'){ev.preventDefault();if(!ev.repeat){$('snap').checked=!$('snap').checked;$('snap').onchange();}return;}if(['INPUT','TEXTAREA','SELECT'].includes(ev.target.tagName)||ev.target.isContentEditable)return;if(tool==='polyline'&&draft.length&&!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&ev.key.toLowerCase()==='c'){ev.preventDefault();if(draft.length<3)notice('Pick at least three vertices before closing the polyline.');else finish(true);return;}if(!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&/^[a-zA-Z0-9.@+\-]$/.test(ev.key)&&$('tool-menu').hidden&&!edgeDrag){ev.preventDefault();startTyping(ev.key);return;}const key=ev.key.toLowerCase();if(ev.ctrlKey||ev.metaKey){if(['z','y','a','s','g'].includes(key))ev.preventDefault();if(key==='c'){ev.preventDefault();copyObjects();return;}if(key==='v'){ev.preventDefault();beginPaste();return;}if(key==='z')undo(ev.shiftKey);if(key==='y')undo(true);if(key==='a'){selected=new Set(visibleEntities().map(e=>e.id));update();}if(key==='s')$('save').click();if(key==='g')$(ev.shiftKey?'ungroup':'group').click();return;}if(key===' '){space=true;ev.preventDefault();}if(key==='escape')cancelAll();if(key==='delete'||key==='backspace'){ev.preventDefault();$('delete').click();}if(key==='enter'){ev.preventDefault();if(tool==='polyline')finish(ev.shiftKey);else if(tool==='select')setTool(lastTool);else if(['trim','extend'].includes(tool)&&!boundariesReady)submitCommand();else $('command-input').focus();}const map={v:'select',i:'parts',l:'line',r:'rectangle',c:'circle',p:'polyline',m:'move',d:'dimension',o:'offset',t:'trim',e:'extend'};if(map[key])setTool(map[key]);});
  document.addEventListener('keyup',ev=>{if(ev.key===' ')space=false;if(ev.key==='Shift'){shift=false;if(rightDrag){rightDrag.copy=false;updateRightDrag(screen(rightDrag.pointer),false);}else cursor=snapped(rawCursor);render();}});window.addEventListener('blur',()=>{if(textDrag){textDrag=null;render();}if(nodeDrag){nodeDrag=null;instructions();render();}cancelRightDrag();space=false;shift=false;pan=null;viewportDrag=null;viewportPan=null;});window.addEventListener('beforeunload',ev=>{if(dirty){ev.preventDefault();ev.returnValue='';}});
  new ResizeObserver(()=>{const r=$('canvas-wrap').getBoundingClientRect();width=r.width;height=r.height;const dpr=window.devicePixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(viewMode==='print')printPageFit();else if(!entities.length){view.x=80;view.y=height-80;}render();}).observe($('canvas-wrap'));
  function updateNodeDrag(p){
    const drag=nodeDrag;if(CAD.distance(p,drag.start)<1e-7){drag.destination={...drag.origin};drag.preview=entities;drag.error=null;return;}let destination={x:drag.origin.x+p.x-drag.start.x,y:drag.origin.y+p.y-drag.start.y};
    if($('snap').checked){const step=Number($('spacing').value)||10;destination={x:Math.round(destination.x/step)*step,y:Math.round(destination.y/step)*step};}
    if($('object-snap').checked){const hit=findObjectSnap(destination,drag.origin);if(hit)destination={x:hit.x,y:hit.y};}
    drag.destination=destination;try{drag.preview=CADEdit.moveNode(entities,drag.origin,destination);drag.error=null;}catch(err){drag.preview=null;drag.error=err.message;}
  }
  function updateEdgeDrag(p){
    const drag=edgeDrag;if(!drag)return;let amount=(p.x-drag.start.x)*drag.normal.x+(p.y-drag.start.y)*drag.normal.y;
    if($('snap').checked){const step=Number($('spacing').value)||10;amount=Math.round(amount/step)*step;}drag.amount=amount;drag.pointer=p;
    try{drag.preview=CADEdit.dragEdge(drag.source,drag.index,amount);drag.error=null;}catch(err){drag.preview=null;drag.error=err.message;}
  }
  function pickAt(p,dimensions=false){let best=Infinity,hit=null;for(const e of visibleEntities()){if(!dimensions&&['dimension','text'].includes(e.type))continue;if(!CADEdit.inPickBox(e,p,10/view.scale))continue;const d=CAD.hitDistance(e,p);if(d<best){best=d;hit=e;}}return hit;}
  function hitAt(p){return pickAt(p);}
  function objectMoveGrip(p){let hit=null,best=9/view.scale;for(const e of visibleEntities()){if(!['text','circle'].includes(e.type))continue;const d=CAD.distance(p,e);if(d<best){best=d;hit=e;}}return hit;}
  function editHoverPreview(){
    if(!pointerInside||pan||nodeDrag||edgeDrag||marqueeDrag||rightDrag||!(['trim','extend'].includes(tool)&&boundariesReady))return null;
    const target=hitAt(rawCursor);if(!target)return null;
    const boundary=editAllEdges?visibleEntities():visibleEntities().filter(e=>editBoundaries.has(e.id));
    if(!boundary)return null;
    try{return {id:target.id,...CADEdit.edit(target,boundary,rawCursor,tool,editAllEdges,true)};}catch{return null;}
  }
  function startBoundaryEditing(){editAllEdges=editBoundaries.size===0;boundariesReady=true;selected.clear();instructions();update();$('command-feedback').textContent=(editAllEdges?'All edges selected as boundaries.':editBoundaries.size+' boundaries selected.')+(tool==='trim'?' Click the portion to trim.':' Click near the endpoint to extend.');}
  function editClick(p){
    try{
      const source=entities.find(e=>e.id===editSource);
      if(['trim','extend'].includes(tool)&&!boundariesReady){const hit=hitAt(p);if(!hit){notice('Click a boundary edge, or press Enter to use all edges.');return;}editBoundaries.add(hit.id);selected=new Set(editBoundaries);notice('');instructions();update();return;}
      if(!source&&tool==='offset'){const hit=hitAt(p);if(!hit){notice('Click an object edge.');return;}editSource=hit.id;selected=new Set([hit.id]);notice('');instructions();update();return;}
      if(tool==='offset'){const result=CADEdit.offset(source,Number($('offset-distance').value),p);if(add(result)){editSource=null;instructions();render();notice('Offset copy created. Select a source for another offset, or right-click to finish.');}}
      else{const target=hitAt(p);if(!target){notice('Click the target edge.');return;}const result=CADEdit.edit(target,editAllEdges?entities:entities.filter(e=>editBoundaries.has(e.id)),p,tool,editAllEdges);remember();entities=entities.filter(e=>e.id!==target.id);const added=result.map(e=>({...e,id:nextId++}));entities.push(...added);selected=new Set(added.map(e=>e.id));commit();notice(tool==='trim'?'Trim complete. Click another portion, or right-click to finish.':'Extend complete. Click another endpoint, or right-click to finish.');}
    }catch(err){notice(err.message);}
  }
  $('change-boundary').onclick=()=>{boundariesReady=false;editBoundaries.clear();editAllEdges=false;editSource=null;selected.clear();instructions();update();};
  $('offset-distance').oninput=render;
  function hideMenu(){$('tool-menu').hidden=true;}
  function completeCommand(){
    if(viewMode==='print'){
      if(tool==='polyline'&&draft.length){finish(false);return true;}
      if(tool==='dimension'&&draft.length>=2){if(printAddAnnotation(makeDimension(draft[0],draft[1],cursor)))draft=[];setTool('select');return true;}
      if(['line','circle','rectangle'].includes(tool)&&draft.length){const a=draft[0],p=cursor;let e;if(tool==='line')e={type:'line',a,b:{...p},layer:'PRINT'};if(tool==='circle')e={type:'circle',...a,r:CAD.distance(a,p),layer:'PRINT'};if(tool==='rectangle')e=rect(a,p);if(printAddAnnotation(e)){draft=[];setTool('select');return true;}}
    }
    if(tool==='parts'){notice('Parts tool remains active. Click another island or press Esc.');return true;}else if(tool==='dimension'&&dimensionSource){if(!add(makeRadialDimension(dimensionSource,cursor)))return false;}
    else if(tool==='polyline'&&draft.length){if(draft.length<2){notice('Pick at least two vertices before finishing, or press Esc to cancel.');return false;}finish(false);}
    else if(tool==='dimension'&&draft.length){if(draft.length<2){notice('Pick a second measurement point before placing the dimension.');return false;}if(!add(makeDimension(draft[0],draft[1],cursor)))return false;}
    else if(tool==='move'&&draft.length)move(cursor.x-draft[0].x,cursor.y-draft[0].y);
    else if(['line','circle','rectangle'].includes(tool)&&draft.length){const a=draft[0];let e;if(tool==='line')e={type:'line',a,b:{...cursor},layer:'0'};if(tool==='circle')e={type:'circle',...a,r:CAD.distance(a,cursor),layer:'0'};if(tool==='rectangle'){if(Math.abs(cursor.x-a.x)<1e-8||Math.abs(cursor.y-a.y)<1e-8){notice('Choose a non-zero width and height before finishing.');return false;}e=rect(a,cursor);}if(!add(e))return false;}
    else if(tool==='offset'&&editSource){const source=entities.find(e=>e.id===editSource);if(source){try{if(!add(CADEdit.offset(source,Number($('offset-distance').value),rawCursor)))return false;}catch(err){notice(err.message);return false;}}}
    setTool('select');return true;
  }
  const menu=$('tool-menu');
  const commands=[['Repeat last command','repeat'],['Select','select'],['Line','line'],['Rectangle','rectangle'],['Circle','circle'],['Arc','arc'],['Polyline','polyline'],['Parts','parts'],['Dimension','dimension'],['Text','text'],['Move','move'],['Offset','offset'],['Trim','trim'],['Extend','extend'],['Fillet','fillet'],['Radius','radius'],['Group','group'],['Ungroup','ungroup'],['Explode','explode'],['Duplicate','duplicate'],['Delete','delete'],['Undo','undo'],['Redo','redo'],['Fit drawing','fit']];
  function restoreDrawingMenu(){menu.innerHTML='<div class="menu-heading">DRAWING TOOLS</div>'+commands.map(([name,id])=>'<button role="menuitem" data-command="'+id+'">'+name+'</button>').join('');}
  function openViewportMenu(vp,x,y){menu.innerHTML='<div class="menu-heading">VIEWPORT TOOLS</div><button role="menuitem" data-viewport-command="select">Select viewport</button><button role="menuitem" data-viewport-command="lock">'+(vp.locked?'Unlock':'Lock')+' viewport</button><button role="menuitem" data-viewport-command="create">Create viewport</button><button role="menuitem" data-viewport-command="pan">Pan viewport</button><button role="menuitem" data-viewport-command="scale">Scale viewport</button><button role="menuitem" data-viewport-command="fit">Fit viewport</button><button role="menuitem" data-viewport-command="delete">Delete viewport</button>';menu.hidden=false;menu.style.left=Math.max(4,Math.min(x,window.innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(4,Math.min(y,window.innerHeight-menu.offsetHeight-8))+'px';menu.querySelector('button').focus();}
  restoreDrawingMenu();
  menu.addEventListener('click',ev=>{const viewportButton=ev.target.closest('[data-viewport-command]');if(viewportButton){const id=viewportButton.dataset.viewportCommand,vp=printPage.viewports.find(v=>v.id===printPage.activeViewport);hideMenu();if(id==='select'&&vp){printPage.activeViewport=vp.id;}else if(id==='lock'&&vp){vp.locked=!vp.locked;}else if(id==='create')$('print-add-viewport')?.click();else if(id==='pan')notice(vp?.locked?'Unlock the viewport before panning.':'Middle-drag inside the viewport to pan it.');else if(id==='scale')notice(vp?.locked?'Unlock the viewport before scaling.':'Scroll inside the viewport to scale it.');else if(id==='fit'&&vp&&!vp.locked){vp.scale=printFitScale(vp);vp.panX=0;vp.panY=0;}else if(id==='delete')$('print-delete-viewport')?.click();refreshPrintPanel();render();return;}const button=ev.target.closest('[data-command]');if(!button)return;const id=button.dataset.command;hideMenu();if(id==='repeat')setTool(lastTool);else if(['group','ungroup','explode','duplicate','delete','undo','redo','fit'].includes(id))$(id).click();else setTool(id);canvas.focus();});
  menu.addEventListener('keydown',ev=>{const buttons=[...menu.querySelectorAll('button')];if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancelAll();}if(['ArrowDown','ArrowUp'].includes(ev.key)){ev.preventDefault();const i=buttons.indexOf(document.activeElement);buttons[(i+(ev.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();}});
  document.addEventListener('pointerdown',ev=>{if(!menu.contains(ev.target))hideMenu();});
  document.addEventListener('keydown',ev=>{const sheetEditKey=viewMode==='sheet'&&!['INPUT','TEXTAREA','SELECT'].includes(ev.target?.tagName)&&((!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&(/^[lrcpdatofe]$/i.test(ev.key)||['Delete','Backspace'].includes(ev.key)))||((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='g'));if(sheetEditKey){ev.preventDefault();ev.stopImmediatePropagation();notice('Sheet Layout is placement-only: move, rotate or copy parts.');}},true);
  function openToolMenu(x,y){restoreDrawingMenu();menu.hidden=false;menu.style.left=Math.max(4,Math.min(x,window.innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(4,Math.min(y,window.innerHeight-menu.offsetHeight-8))+'px';menu.querySelector('button').focus();}
  canvas.addEventListener('contextmenu',ev=>{ev.preventDefault();if(viewMode==='sheet'){hideMenu();notice('Sheet Layout is placement-only: move, rotate or copy parts.');return;}if(pasteDraft){pasteDraft=null;instructions();render();return;}if(nodeDrag){nodeDrag=null;instructions();render();return;}if(rightDrag||suppressContext)return;if($('command-input').value.trim()){submitCommand();return;}if(edgeDrag){edgeDrag=null;render();return;}rawCursor=world(getPosition(ev));cursor=snapped(rawCursor);if(['trim','extend'].includes(tool)&&!boundariesReady){startBoundaryEditing();return;}if(tool!=='select'){completeCommand();return;}if(viewMode==='print'){const vp=printViewportAt(rawCursor);if(vp){printPage.activeViewport=vp.id;openViewportMenu(vp,ev.clientX,ev.clientY);refreshPrintPanel();render();return;}}openToolMenu(ev.clientX,ev.clientY);});
  function commandPrompt(){
    const name=tool.toUpperCase();let hint='Type command name';
    if(['line','polyline'].includes(tool))hint=draft.length?'Length or length<angle; Enter confirms':'Click start point';
    if(tool==='circle')hint=draft.length?'Diameter (mm)':'Click centre';
    if(tool==='arc')hint=draft.length===1?'Radius (mm), or click start point':'Click centre, then start and end points';
    if(tool==='parts')hint='Click inside an island to create a closed part';if(tool==='rectangle')hint=draft.length?(rectangleWidth===null?'Width,height (mm), or width then height':'Height (mm)'):'Click first corner';
    if(tool==='offset')hint='Offset distance (mm), Enter, then choose side';
    if(['fillet','radius'].includes(tool))hint='Radius (mm)';
    $('command-prompt').textContent=(tool==='select'?'Command':name)+':';$('command-input').placeholder=hint;
  }
  function startTyping(char){if(!$('command-input').value)typedAim={...cursor};$('command-input').focus();$('command-input').value+=char;refreshSuggestion();}
  const aliases={text:'text',dt:'text',part:'parts',parts:'parts',island:'parts',l:'line',line:'line',pl:'polyline',p:'polyline',polyline:'polyline',r:'rectangle',rec:'rectangle',rectangle:'rectangle',c:'circle',circle:'circle',a:'arc',arc:'arc',o:'offset',offset:'offset',tr:'trim',t:'trim',trim:'trim',ex:'extend',e:'extend',extend:'extend',f:'fillet',fillet:'fillet',rad:'radius',radius:'radius',m:'move',move:'move',d:'dimension',dim:'dimension',dimension:'dimension',v:'select',select:'select'};
  let suggestionIndex=0,suggestionText='';
  function commandMatches(){
    const prefix=$('command-input').value.trim().toLowerCase();
    if(!/^[a-z]+$/.test(prefix))return [];
    const extra={u:'undo',erase:'delete',g:'group',j:'join',x:'explode'};
    const names=[...new Set([...Object.values(aliases),'dimradius','dimdiameter','undo','redo','delete','fit','group','join','ungroup','explode',...(tool==='polyline'?['close','finish']:[])])];
    const preferred=tool==='polyline'&&draft.length&&prefix==='c'?'close':aliases[prefix]||extra[prefix];
    return [...new Set([...(preferred?[preferred]:[]),...names.filter(name=>name.startsWith(prefix))])];
  }
  function refreshSuggestion(step=0){
    const text=$('command-input').value, matches=commandMatches();
    if(text!==suggestionText){suggestionIndex=0;suggestionText=text;}
    suggestionIndex=matches.length?(suggestionIndex+step+matches.length)%matches.length:0;
    $('command-suggestion').hidden=!matches.length;
    $('command-suggestion').textContent=matches.length?matches[suggestionIndex].toUpperCase()+' — Enter to start'+(matches.length>1?' · ↑/↓ for alternatives ('+(suggestionIndex+1)+'/'+matches.length+')':''):'';
  }
  $('command-input').addEventListener('input',()=>refreshSuggestion());
  $('command-suggestion').onclick=()=>submitCommand();
  $('command-input').addEventListener('focus',()=>{if(!typedAim)typedAim={...cursor};});
  $('command-input').addEventListener('keydown',ev=>{if(['ArrowDown','ArrowUp'].includes(ev.key)&&commandMatches().length){ev.preventDefault();ev.stopPropagation();refreshSuggestion(ev.key==='ArrowDown'?1:-1);}if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();cancelAll();refreshSuggestion();}if(ev.key==='Enter'){ev.preventDefault();ev.stopPropagation();submitCommand();}});
  $('command-form').onsubmit=ev=>{ev.preventDefault();submitCommand();};
  function submitCommand(){
    const text=$('command-input').value.trim();if(!text){if(['trim','extend'].includes(tool)&&!boundariesReady){startBoundaryEditing();}else if(tool==='select')setTool(lastTool);else if(tool==='polyline')finish(false);canvas.focus();return;}
    try{
      const matches=commandMatches();const v=CADCommand.parse(matches.length?matches[suggestionIndex]||matches[0]:text);let message='';
      if(v.kind==='command'){
        if(viewMode==='sheet'&&!['select','move','duplicate','undo','redo','fit'].includes(v.value)){throw Error('Sheet Layout is placement-only: move, rotate or copy parts.');}
        if(['dimradius','dimdiameter'].includes(v.value)){setTool('dimension');$('dimension-mode').value=v.value==='dimradius'?'radius':'diameter';instructions();message='Select a circle or arc, then place the label.';}else if(aliases[v.value]){setTool(aliases[v.value]);message='Command: '+v.value.toUpperCase();}
        else if(['undo','u','redo','delete','erase','fit','group','g','join','ungroup','explode','x'].includes(v.value)){const id={u:'undo',erase:'delete',g:'group',join:'group',x:'explode'}[v.value]||v.value;$(id).click();message=v.value.toUpperCase();}
        else if(['close','finish'].includes(v.value)&&tool==='polyline'){finish(v.value==='close');message='Polyline '+v.value;}
        else throw Error('Unknown command. Try LINE, ARC, OFFSET, TRIM, EXTEND, FILLET or RADIUS.');
      }else if(tool==='select'&&v.kind==='number'){const chosen=entities.filter(e=>selected.has(e.id));if(chosen.length!==1)throw Error('Select a single circle or rounded corner to enter a radius.');const updated=CADEdit.resizeRadius(entities,chosen[0].id,v.value,selectedArcIndex);remember();entities=updated;commit();message='Radius set to '+v.value+' mm; tangent lines adjusted.';}else if(['offset','fillet','radius'].includes(tool)){
        if(v.kind!=='number'||v.value<=0)throw Error('Enter a positive distance in millimetres.');
        if(tool==='offset'){$('offset-distance').value=v.value;message='Offset distance: '+v.value+' mm. '+(editSource?'Click the side to offset.':'Select the source object.');}
        else{$('radius-distance').value=v.value;if(tool==='radius'){applyRadius();message='Radius set to '+v.value+' mm.';}else message='Fillet radius: '+v.value+' mm. Select '+(filletFirst?'the second':'the first')+' edge.';}render();
      }else{
        if(!draft.length)throw Error('Pick the starting point or centre first, then type the size.');
        const a=draft.at(-1),aim=typedAim||cursor;let entity;
        if(['line','polyline'].includes(tool)){
          let b;if(v.kind==='relative')b={x:a.x+v.x,y:a.y+v.y};else if(v.kind==='polar')b=CADCommand.endpoint(a,v.length,aim,v.angle);else if(v.kind==='number')b=CADCommand.endpoint(a,v.value,aim);else throw Error('Use a length, length<angle, or @dx,dy.');
          if(CAD.distance(a,b)<1e-8)throw Error('Length must be greater than zero.');
          if(tool==='polyline')draft.push(b);else entity={type:'line',a:{...a},b,layer:'0'};message='Length: '+fmt(CAD.distance(a,b))+' mm';
        }else if(tool==='circle'){if(v.kind!=='number'||v.value<=0)throw Error('Enter a positive diameter.');entity={type:'circle',...draft[0],r:v.value/2,layer:'0'};message='Diameter: '+v.value+' mm';}
        else if(tool==='arc'){if(draft.length!==1||v.kind!=='number'||v.value<=0)throw Error('After choosing the centre, enter a positive radius.');const center=draft[0],aim=typedAim||cursor,angle=Math.atan2(aim.y-center.y,aim.x-center.x);draft.push({x:center.x+v.value*Math.cos(angle),y:center.y+v.value*Math.sin(angle)});message='Radius: '+v.value+' mm. Click the end point.';}
        else if(tool==='rectangle'){
          let w,h;if(v.kind==='pair'){w=v.x;h=v.y;}else if(v.kind==='number'&&rectangleWidth===null){if(v.value<=0)throw Error('Width must be greater than zero.');rectangleWidth=v.value;message='Width: '+v.value+' mm. Type the height, then Enter.';}else if(v.kind==='number'){w=rectangleWidth;h=v.value;}else throw Error('Enter width,height, or width then height.');
          if(w!==undefined){if(w<=0||h<=0)throw Error('Width and height must be greater than zero.');const origin=draft[0];entity=rect(origin,{x:origin.x+w*(aim.x<origin.x?-1:1),y:origin.y+h*(aim.y<origin.y?-1:1)});message='Rectangle: '+w+' × '+h+' mm';}
        }else throw Error('Select a drawing tool or enter a command name.');
        if(entity){if(!add(entity))throw Error('Could not create that geometry.');draft=[];rectangleWidth=null;}instructions();update();
      }
      $('command-feedback').textContent='› '+text+' — '+message;$('command-input').value='';refreshSuggestion();typedAim=null;commandPrompt();canvas.focus();
    }catch(err){$('command-feedback').textContent=err.message;$('command-input').select();}
  }
  function nearestEdge(e,p){const parts=CADEdit.primitives(e);let i=0;parts.forEach((part,j)=>{if(CAD.hitDistance(part,p)<CAD.hitDistance(parts[i],p))i=j;});return {part:parts[i],index:i};}
  function applyRadius(){const r=Number($('radius-distance').value),updated=CADEdit.resizeRadius(entities,editSource,r,radiusSegment);remember();entities=updated;commit();}
  $('apply-radius').onclick=()=>{try{applyRadius();$('command-feedback').textContent='Radius updated.';}catch(err){$('command-feedback').textContent=err.message;}};
  function roundClick(p){try{
    const e=pickAt(p);if(!e)throw Error('Put an edge inside the selection box and click.');
    if(tool==='radius'){const part=e.type==='polyline'?nearestEdge(e,p):{part:e,index:null};if(!['circle','arc'].includes(part.part?.type))throw Error('Select a circle, arc or rounded polyline corner.');editSource=e.id;radiusSegment=part.index;selectedArcIndex=part.index;selected=new Set([e.id]);$('radius-distance').value=part.part.r;instructions();update();return;}
    const edge=nearestEdge(e,p);if(!edge.part||edge.part.type!=='line')throw Error('Select a straight edge for Fillet.');
    if(!filletFirst){filletFirst={id:e.id,index:edge.index,p:{...p}};selected=new Set([e.id]);instructions();update();return;}
    const first=entities.find(x=>x.id===filletFirst.id);if(!first){filletFirst=null;throw Error('Select the first edge again.');}
    const r=Number($('radius-distance').value);let results,removed;
    if(first.id===e.id){if(first.type!=='polyline'||edge.index===filletFirst.index)throw Error('Select a different adjacent edge.');results=[CADEdit.filletPolyline(first,filletFirst.index,edge.index,r)];removed=[first.id];}
    else{results=CADEdit.filletLines(first,e,filletFirst.p,p,r);removed=[first.id,e.id];}
    remember();entities=entities.filter(x=>!removed.includes(x.id));const added=results.map(x=>({...x,id:nextId++}));entities.push(...added);selected=new Set(added.map(x=>x.id));filletFirst=null;instructions();commit();$('command-feedback').textContent='Fillet created · radius '+r+' mm. Ctrl+Z to undo.';
  }catch(err){$('command-feedback').textContent=err.message;}}
  function makeRadialDimension(source,p){
    let angle=Math.atan2(p.y-source.y,p.x-source.x);
    if(source.type==='arc'){const start=source.start*Math.PI/180,tau=Math.PI*2,mod=x=>(x%tau+tau)%tau,sweep=mod((source.end-source.start)*Math.PI/180)||tau,relative=mod(angle-start);if(relative>sweep){const a=CAD.points(source)[0],b=CAD.points(source).at(-1);const close=CAD.distance(a,p)<CAD.distance(b,p)?a:b;angle=Math.atan2(close.y-source.y,close.x-source.x);}}
    return{type:'dimension',mode:$('dimension-mode').value,layer:'DIMENSIONS',a:{x:source.x,y:source.y},b:{x:source.x+source.r*Math.cos(angle),y:source.y+source.r*Math.sin(angle)},offset:Math.max(15, CAD.distance(source,p)-source.r)};
  }
  $('dimension-mode').onchange=()=>{dimensionSource=null;draft=[];instructions();render();};
  function cancelAll(){pasteDraft=null;cancelTextBox();closeSnapSettings();nodeDrag=null;
    suppressContext=!!rightDrag||suppressContext;rightDrag=null;edgeDrag=null;marqueeDrag=null;pan=null;viewportDrag=null;viewportPan=null;space=false;shift=false;selected.clear();selectedArcIndex=null;tracking=[];snapPoint=null;printDimensionSource=null;draft=[];
    setTool('select');$('command-feedback').textContent='Cancelled. Selection cleared.';canvas.focus();
  }
  function activateRightDrag(drag){if(!drag||drag.active)return;drag.active=true;tool='move';document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool==='move'));canvas.style.cursor='grabbing';}
  function updateRightDrag(p,copy){
    const drag=rightDrag;if(!drag)return;drag.pointer=world(p);drag.copy=copy;
    if(!drag.active&&Math.hypot(p.x-drag.screen.x,p.y-drag.screen.y)<4)return;
    activateRightDrag(drag);
    let dx=drag.pointer.x-drag.start.x,dy=drag.pointer.y-drag.start.y;
    if($('snap').checked){const step=Number($('spacing').value)||10;dx=Math.round(dx/step)*step;dy=Math.round(dy/step)*step;}
    if($('ortho').checked){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}
    const snappedLayout=layoutSnapDelta(drag.ids,dx,dy);dx=snappedLayout.dx;dy=snappedLayout.dy;drag.dx=dx;drag.dy=dy;$('instruction').textContent=(copy?'Copy':'Move')+' selection: '+(drag.grip?(drag.waiting?'click destination':'release mouse button to apply'):(drag.leftLayout?'release mouse button to apply':'release right button to apply'))+'. Mouse wheel rotates in any view; Shift copies; Esc cancels.';
    $('coordinates').textContent='ΔX '+dx.toFixed(2)+'   ΔY '+dy.toFixed(2);
  }
  function sheetTransformIsClear(drag){
    if(viewMode!=='sheet')return true;
    const chosen=CADSelection.expand(entities,drag.ids),moving=drag.sources.filter(e=>!['text','dimension'].includes(e.type)).map(e=>transformDragEntity(e,drag)),others=entities.filter(e=>!chosen.has(e.id)&&!['text','dimension'].includes(e.type)),overlap=(a,b)=>a.minX<b.maxX-1e-7&&a.maxX>b.minX+1e-7&&a.minY<b.maxY-1e-7&&a.maxY>b.minY+1e-7;
    return !moving.some(e=>others.some(o=>overlap(CADLayout.bounds([e]),CADLayout.bounds([o]))));
  }
  function finishRightDrag(ev){
    updateRightDrag(getPosition(ev),ev.shiftKey);const drag=rightDrag;if(!drag)return;rightDrag=null;suppressContext=true;if(viewMode==='sheet'&&!sheetTransformIsClear(drag)){drag.rotation=0;const safe=layoutCollisionDelta(drag.ids,drag.dx,drag.dy);drag.dx=safe.dx;drag.dy=safe.dy;if(!sheetTransformIsClear(drag)){drag.dx=0;drag.dy=0;}}
    if(!drag.active){if(drag.leftLayout){render();return;}if(drag.grip){rightDrag=drag;drag.waiting=true;drag.active=true;$('instruction').textContent='Move object: click the destination. Esc cancels.';render();return;}openToolMenu(ev.clientX,ev.clientY);return;}
    if(Math.hypot(drag.dx,drag.dy)>1e-8||Math.abs(drag.rotation||0)>1e-8){
      remember();
      if(drag.copy){const copies=CADSelection.duplicate(entities,drag.ids,0,0,newGroupId).map(e=>({...transformDragEntity(e,drag),id:nextId++}));entities.push(...copies);selected=new Set(copies.map(e=>e.id));}
      else{entities=entities.map(e=>drag.ids.has(e.id)?transformDragEntity(e,drag):e);selected=new Set(drag.ids);}
      commit();$('command-feedback').textContent=(drag.copy?'Copied':'Moved')+' '+drag.ids.size+' object(s) · ΔX '+fmt(drag.dx)+' · ΔY '+fmt(drag.dy)+' mm'+(drag.rotation?' · Rotation '+fmt(drag.rotation)+'°':'')+'. Ctrl+Z to undo.';
    }
    setTool(drag.priorTool);render();
  }
  function cancelRightDrag(){if(!rightDrag)return;const prior=rightDrag.priorTool;rightDrag=null;suppressContext=true;setTool(prior);render();}
  function newGroupId(){return 'g_'+crypto.randomUUID();}
  function marqueeSelection(){const m=marqueeDrag,result=CADSelection.marquee(visibleEntities(),m.start,m.current).selected;return m.add?new Set([...m.previous,...result]):result;}
  function finishMarquee(ev){
    const m=marqueeDrag;m.current=world(getPosition(ev));m.moved=m.moved||Math.hypot(getPosition(ev).x-m.screen.x,getPosition(ev).y-m.screen.y)>4;
    if(m.moved){selected=marqueeSelection();selectedArcIndex=null;}else{
      selected=m.add?new Set(m.previous):new Set();const hit=m.hit;
      if(hit){const ids=CADSelection.members(entities,hit.id),remove=m.add&&m.previous.has(hit.id);ids.forEach(id=>remove?selected.delete(id):selected.add(id));selectedArcIndex=hit.type==='polyline'?nearestEdge(hit,m.start).index:null;}else selectedArcIndex=null;
    }
    marqueeDrag=null;update();
  }
  function selectionAction(action){try{
    const expanded=CADSelection.expand(entities,selected);let updated,selection=expanded,message;
    if(action==='group'){updated=CADSelection.group(entities,expanded,newGroupId());message=expanded.size+' objects grouped.';}
    else if(action==='ungroup'){if(!entities.some(e=>expanded.has(e.id)&&e.groupId))throw Error('Select a group first.');updated=CADSelection.ungroup(entities,expanded);message='Group released; geometry is unchanged.';}
    else{const result=CADSelection.explode(entities,expanded);updated=result.entities;for(const e of updated)if(e.id===undefined)e.id=nextId++;selection=new Set(result.selectedObjects.map(e=>e.id));message='Exploded '+result.groups+' group(s) and '+result.polylines+' polyline(s).';}
    remember();entities=updated;selected=selection;selectedArcIndex=null;commit();$('command-feedback').textContent=message;
  }catch(err){$('command-feedback').textContent=err.message;}}
  ['group','ungroup','explode'].forEach(id=>$(id).onclick=()=>selectionAction(id));
  canvas.style.cursor='none';
  loadUserPreferences();precision();instructions();update();
})();

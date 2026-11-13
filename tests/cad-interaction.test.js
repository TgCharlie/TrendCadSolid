const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
// Run the application's actual event handlers against a small DOM test double.
// Geometry remains private; assertions inspect the rendered count, inspector and exports.
function app(){
  const elements=new Map(),docEvents={},tools=[],downloads=[],dashes=[];
  class Element{
    constructor(id){this.id=id;this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.textContent='';this.innerHTML='';this.style={};this.dataset={};this.tagName='DIV';this.events={};this.classList={toggle(){}};this.offsetWidth=280;this.offsetHeight=350;this.elements={namedItem:()=>({value:'0',focus(){},select(){}})};}
    addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
    dispatch(name,props={}){const e={target:this,button:0,shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,pointerId:1,clientX:0,clientY:0,preventDefault(){},stopPropagation(){},...props};for(const fn of this.events[name]||[])fn(e);}
    focus(){document.activeElement=this;}select(){}setPointerCapture(){}contains(e){return e===this;}closest(){return null;}
    querySelector(){return new Element('menu-button');}querySelectorAll(){return [];}
    click(){if(!this.disabled)this.onclick?.();}getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};}
  }
  const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  for(const m of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){const e=get(m[1]),tag=m[0];e.tagName=tag.match(/^<(\w+)/)[1].toUpperCase();e.checked=/\bchecked\b/.test(tag);e.hidden=/\bhidden\b/.test(tag);e.value=tag.match(/\bvalue="([^"]*)"/)?.[1]||'';}
  for(const m of html.matchAll(/data-tool="([^"]+)"/g)){const e=new Element('tool-'+m[1]);e.dataset.tool=m[1];tools.push(e);}
  const document={activeElement:null,getElementById:get,querySelectorAll:()=>tools,addEventListener(name,fn){(docEvents[name]??=[]).push(fn);},createElement:()=>new Element('download')};
  get('canvas').getContext=()=>new Proxy({measureText:t=>({width:t.length*7}),clearRect:()=>{dashes.length=0;},setLineDash:dash=>dashes.push([...dash])},{get:(o,k)=>o[k]||(()=>{})});
  get('dimension-mode').value='aligned';get('drawing-name').value='Test';
  const window={devicePixelRatio:1,innerWidth:1300,innerHeight:900,events:{},addEventListener(name,fn){this.events[name]=fn;}};
  const scope={document,window,console,structuredClone,Blob,URL:{createObjectURL(blob){downloads.push(blob);return 'blob:test';},revokeObjectURL(){}},setTimeout(){},confirm:()=>true,crypto:require('node:crypto').webcrypto,ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){this.fn();}},FormData:class{constructor(form){this.values=form.values||{};}get(key){return this.values[key]??null;}has(key){return key in this.values;}},CAD:require('../cad-core.js'),CADEdit:require('../cad-edit.js'),CADSelection:require('../cad-selection.js'),CADCommand:require('../cad-command.js'),CADLayout:require('../cad-layout.js'),CADIsland:require('../cad-island.js')};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),scope,{filename:'app.js'});
  const canvas=get('canvas'),key=(key,props={})=>{for(const fn of docEvents.keydown||[])fn({key,target:canvas,preventDefault(){},...props});};
  const pointer=(name,x,y,props={})=>canvas.dispatch(name,{clientX:x,clientY:y,...props});
  function selectAll(){key('a',{ctrlKey:true});}
  async function drawing(){get('export').click();return scope.CAD.parseDXF(await downloads.at(-1).text()).entities;}
  return {get,canvas,window,pointer,key,selectAll,drawing,tools,dashes};
}
const down=(a,x=500,y=238.75,extra={})=>a.pointer('pointerdown',x,y,{button:2,...extra});
test('JOIN suggestions group selected objects without changing geometry',async()=>{
  const a=app();a.get('sample').click();a.selectAll();const before=await a.drawing();const input=a.get('command-input');input.value='jo';input.dispatch('input');assert.match(a.get('command-suggestion').textContent,/JOIN/);input.dispatch('keydown',{key:'Enter'});const after=await a.drawing();assert.ok(after[0].groupId);assert.ok(after.every(e=>e.groupId===after[0].groupId));assert.deepEqual(after.map(({groupId,...e})=>e),before.map(({groupId,...e})=>e));a.get('undo').click();assert.deepEqual(await a.drawing(),before);
});
test('command prefixes suggest and Enter starts the displayed tool',()=>{
  const a=app(),input=a.get('command-input');a.key('t');assert.match(a.get('command-suggestion').textContent,/TRIM/);input.value='tr';input.dispatch('input');input.dispatch('keydown',{key:'Enter'});assert.equal(a.get('command-prompt').textContent,'TRIM:');assert.equal(a.get('command-suggestion').hidden,true);
});
test('Arc tool creates a centre-start-end arc and exports it as ARC',async()=>{
  const a=app(),input=a.get('command-input');input.value='arc';input.dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',500,350);a.pointer('pointerdown',550,350);a.pointer('pointerdown',500,300);const arcs=(await a.drawing()).filter(e=>e.type==='arc');assert.equal(arcs.length,1);assert.ok(arcs[0].r>0);assert.notEqual(arcs[0].start,arcs[0].end);
});
test('Parts tool creates a yellow closed polyline on the Parts layer and stays active',async()=>{
  const a=app();a.get('sample').click();const partsButton=a.tools.find(button=>button.dataset.tool==='parts');partsButton.click();assert.match(a.get('instruction').textContent,/inside an island/);a.pointer('pointerdown',500,350);const drawing=await a.drawing(),part=drawing.at(-1);assert.equal(drawing.length,5);assert.equal(part.type,'polyline');assert.equal(part.closed,true);assert.equal(part.layer,'Parts');assert.equal(part.color,'#f2d755');assert.match(a.get('instruction').textContent,/more islands/);
});
test('middle mouse drag enters pan mode without changing geometry',async()=>{
  const a=app();a.get('sample').click();const before=await a.drawing();a.pointer('pointerdown',500,350,{button:1});assert.match(a.get('instruction').textContent,/Pan view/);a.pointer('pointermove',540,380,{button:1,buttons:4});a.pointer('pointerup',540,380,{button:1});assert.deepEqual(await a.drawing(),before);
});
test('suggestions cycle, accept clicks and clear on Escape',()=>{
  const a=app(),input=a.get('command-input');input.value='ra';input.dispatch('input');assert.match(a.get('command-suggestion').textContent,/RADIUS/);a.get('command-suggestion').click();assert.equal(a.get('command-prompt').textContent,'RADIUS:');input.value='di';input.dispatch('input');input.dispatch('keydown',{key:'ArrowDown'});assert.match(a.get('command-suggestion').textContent,/DIMRADIUS/);input.dispatch('keydown',{key:'Enter'});assert.equal(a.get('dimension-mode').value,'radius');input.value='li';input.dispatch('input');a.key('Escape');assert.equal(a.get('command-suggestion').hidden,true);
});
test('numeric input and unknown commands do not get suggestions',()=>{
  const a=app(),input=a.get('command-input');input.value='off';input.dispatch('input');input.dispatch('keydown',{key:'Enter'});input.value='125';input.dispatch('input');assert.equal(a.get('command-suggestion').hidden,true);input.dispatch('keydown',{key:'Enter'});assert.equal(a.get('offset-distance').value,125);input.value='nonsense';input.dispatch('input');assert.equal(a.get('command-suggestion').hidden,true);input.dispatch('keydown',{key:'Enter'});assert.match(a.get('command-feedback').textContent,/Unknown command/);
});
const move=(a,x=537.083333333,y=201.666666667,extra={})=>a.pointer('pointermove',x,y,{buttons:2,...extra});
const up=(a,x=537.083333333,y=201.666666667,extra={})=>a.pointer('pointerup',x,y,{button:2,...extra});
test('right drag moves selected objects exactly once and undo restores them',async()=>{
  const a=app();a.get('sample').click();a.selectAll();const before=await a.drawing();down(a);move(a);assert.match(a.get('instruction').textContent,/Move selection/);up(a);const after=await a.drawing();assert.equal(after.length,4);assert.equal(after[0].vertices[0].x,100);assert.equal(after[0].vertices[0].y,100);a.get('undo').click();assert.deepEqual(await a.drawing(),before);
});
test('Shift right drag duplicates groups with independent identity and leaves originals unchanged',async()=>{
  const a=app();a.get('sample').click();a.selectAll();a.get('group').click();const before=await a.drawing();down(a);move(a,undefined,undefined,{shiftKey:true});assert.match(a.get('instruction').textContent,/Copy selection/);up(a,undefined,undefined,{shiftKey:true});const after=await a.drawing();assert.equal(after.length,8);assert.deepEqual(after.slice(0,4),before);assert.notEqual(after[4].groupId,before[0].groupId);assert.ok(after.slice(4).every(e=>e.groupId===after[4].groupId));assert.match(a.get('count').textContent,/4 selected/);a.get('undo').click();assert.deepEqual(await a.drawing(),before);
});
test('short right click opens menu without moving or duplicating',async()=>{
  const a=app();a.get('sample').click();a.selectAll();const before=await a.drawing();down(a);up(a,500,238.75);assert.equal(a.get('tool-menu').hidden,false);a.pointer('contextmenu',500,238.75);assert.equal(a.get('tool-menu').hidden,false);assert.deepEqual(await a.drawing(),before);
});
test('Escape cancels copy drag, clears every selection and suppresses release commit',async()=>{
  const a=app();a.get('sample').click();a.selectAll();const before=await a.drawing();down(a);move(a,undefined,undefined,{shiftKey:true});a.key('Escape');up(a,undefined,undefined,{shiftKey:true});a.pointer('contextmenu',537,202);assert.equal(a.get('count').textContent,'4 objects');assert.equal(a.get('tool-menu').hidden,true);assert.deepEqual(await a.drawing(),before);
});
test('Escape in command line clears selection, text and active command',()=>{const a=app();a.get('sample').click();a.selectAll();a.get('command-input').value='123';a.get('command-input').dispatch('keydown',{key:'Escape'});assert.equal(a.get('command-input').value,'');assert.equal(a.get('count').textContent,'4 objects');});
test('double Escape cancels the active command and leaves everything deselected',()=>{
  const a=app();a.get('sample').click();a.selectAll();a.get('command-input').value='offset';a.get('command-input').dispatch('keydown',{key:'Enter'});a.get('command-input').value='25';a.get('command-input').dispatch('keydown',{key:'Escape'});a.key('Escape');assert.equal(a.get('count').textContent,'4 objects');assert.equal(a.get('command-prompt').textContent,'Command:');assert.equal(a.get('command-input').value,'');assert.equal(a.get('command-suggestion').hidden,true);assert.equal(a.get('tool-menu').hidden,true);
});
test('lost pointer capture and window blur cancel drag without mutation',async()=>{
  for(const cancel of [a=>a.canvas.dispatch('lostpointercapture'),a=>a.window.events.blur()]){const a=app();a.get('sample').click();a.selectAll();const before=await a.drawing();down(a);move(a);cancel(a);up(a);assert.deepEqual(await a.drawing(),before);}
});
test('Shift state at release controls copy and zero-distance drag makes no edit',async()=>{
  const a=app();a.get('sample').click();a.selectAll();down(a);move(a,undefined,undefined,{shiftKey:true});up(a,undefined,undefined,{shiftKey:false});assert.equal((await a.drawing()).length,4);
  const b=app();b.get('sample').click();b.selectAll();const before=await b.drawing();down(b);move(b);up(b,500,238.75,{shiftKey:true});assert.deepEqual(await b.drawing(),before);assert.equal(b.get('undo').disabled,true);
});
test('left drag in sheet layout snaps selected parts to the sheet margins',async()=>{
  const a=app();a.get('sample').click();a.selectAll();a.get('show-sheet').checked=true;a.get('layout-snap').checked=true;
  const before=await a.drawing();
  a.pointer('pointerdown',400,238.75,{button:0});
  a.pointer('pointermove',437.0833333,238.75,{button:0,buttons:1});
  a.pointer('pointerup',437.0833333,238.75,{button:0});
  const after=await a.drawing();assert.equal(after.length,before.length);assert.equal(after[0].vertices[0].x,before[0].vertices[0].x+10);assert.equal(after[0].vertices[0].y,before[0].vertices[0].y+10);assert.equal(after[1].x,before[1].x+10);assert.equal(after[1].y,before[1].y+10);
  a.get('undo').click();assert.deepEqual(await a.drawing(),before);
});
test('right-button hold plus wheel rotates the selected part by the layout snap increment',async()=>{
  const a=app();a.get('sample').click();a.selectAll();a.get('show-sheet').checked=true;a.get('layout-snap').checked=false;a.get('layout-rotation').value='90';
  const before=await a.drawing();down(a);a.canvas.dispatch('wheel',{deltaY:-120,preventDefault(){}});assert.match(a.get('instruction').textContent,/Mouse wheel rotates/);up(a);
  const after=await a.drawing(),beforeBounds=require('../cad-layout.js').bounds([before[0]]),afterBounds=require('../cad-layout.js').bounds([after[0]]);
  assert.equal(afterBounds.maxX-afterBounds.minX,beforeBounds.maxY-beforeBounds.minY);assert.equal(afterBounds.maxY-afterBounds.minY,beforeBounds.maxX-beforeBounds.minX);
  a.get('undo').click();assert.deepEqual(await a.drawing(),before);
});
test('right-button wheel rotation also works on the drawing board',async()=>{
  const a=app();a.get('sample').click();a.selectAll();const before=await a.drawing();down(a);a.canvas.dispatch('wheel',{deltaY:-120,preventDefault(){}});up(a);const after=await a.drawing();const beforeBounds=require('../cad-layout.js').bounds([before[0]]),afterBounds=require('../cad-layout.js').bounds([after[0]]);assert.equal(afterBounds.maxX-afterBounds.minX,beforeBounds.maxY-beforeBounds.minY);
});

test('Trim collects multiple boundaries until right click, and Enter with none uses all edges',async()=>{
 const a=app();a.get('sample').click();const before=await a.drawing();const input=a.get('command-input');input.value='trim';input.dispatch('keydown',{key:'Enter'});
 a.pointer('pointerdown',500,238.75);assert.match(a.get('instruction').textContent,/cutting edges \(1\)/);a.pointer('pointerdown',770.9167,350);assert.match(a.get('instruction').textContent,/cutting edges \(2\)/);assert.deepEqual(await a.drawing(),before);
 a.pointer('contextmenu',500,238.75);assert.match(a.get('instruction').textContent,/portion to trim/);assert.deepEqual(await a.drawing(),before);
 a.get('change-boundary').click();a.key('Enter');assert.match(a.get('instruction').textContent,/All edges/);a.pointer('pointerdown',500,238.75);assert.equal((await a.drawing()).length,6);a.get('undo').click();assert.deepEqual(await a.drawing(),before);a.key('Escape');input.value='trim';input.dispatch('keydown',{key:'Enter'});input.dispatch('keydown',{key:'Enter'});assert.match(a.get('instruction').textContent,/All edges/);
});

test('dedicated Diameter tool places a full diameter annotation on a circle',async()=>{
 const a=app();a.get('sample').click();a.get('diameter-dimension').click();assert.equal(a.get('dimension-mode').value,'diameter');assert.match(a.get('instruction').textContent,/Select a circle or arc/);a.pointer('pointerdown',770.9167,350);a.pointer('pointerdown',840,350);const drawing=await a.drawing();const dim=drawing.find(e=>e.type==='dimension');assert.ok(dim);assert.equal(dim.mode,'diameter');assert.equal(require('../cad-core.js').dimension(dim).label,'Ø 360 mm');assert.equal(drawing.filter(e=>e.type==='circle').length,2);
});

test('dragging a selected square node changes only that corner and supports Undo',async()=>{
 const a=app();a.get('sample').click();a.selectAll();const before=await a.drawing();a.pointer('pointerdown',55,461.25);a.pointer('pointermove',92.0833333,424.1666667);a.pointer('pointerup',92.0833333,424.1666667);const after=await a.drawing();assert.deepEqual(after[0].vertices[0],{x:100,y:100,bulge:0});assert.deepEqual(after[0].vertices.slice(1),before[0].vertices.slice(1));assert.deepEqual(after.slice(1),before.slice(1));a.get('undo').click();assert.deepEqual(await a.drawing(),before);
});
test('Escape and lost capture discard node drag previews',async()=>{
 for(const cancel of [a=>a.key('Escape'),a=>a.canvas.dispatch('lostpointercapture'),a=>a.window.events.blur()]){const a=app();a.get('sample').click();a.selectAll();const before=await a.drawing();a.pointer('pointerdown',55,461.25);a.pointer('pointermove',92,424);cancel(a);a.pointer('pointerup',92,424);assert.deepEqual(await a.drawing(),before);}
});

test('Snap extend title opens mode settings without changing alignment checkbox',()=>{
 const a=app();a.get('snap-settings-toggle').click();assert.equal(a.get('snap-settings').hidden,false);assert.equal(a.get('snap-extend').checked,true);a.get('snap-midpoint').checked=true;a.get('snap-midpoint').onchange();a.get('snap-settings-close').click();assert.equal(a.get('snap-settings').hidden,true);a.get('snap-settings-toggle').click();assert.equal(a.get('snap-midpoint').checked,true);a.key('Escape');assert.equal(a.get('snap-settings').hidden,true);
});
test('drawing uses selected midpoint snap and ignores it when disabled',()=>{
 const a=app();a.get('sample').click();a.get('snap').checked=false;a.get('snap-extend').checked=false;for(const mode of ['endpoint','center','quadrant','nearest'])a.get('snap-'+mode).checked=false;const input=a.get('command-input');input.value='line';input.dispatch('keydown',{key:'Enter'});a.get('snap-midpoint').checked=true;a.pointer('pointermove',502,240);assert.match(a.get('coordinates').textContent,/X 1200.00.*Y 600.00/);a.get('snap-midpoint').checked=false;a.pointer('pointermove',502,240);assert.doesNotMatch(a.get('coordinates').textContent,/X 1200.00/);
});

test('trim dashed hover appears only after boundary selection and does not commit geometry',async()=>{
 const a=app();a.get('sample').click();const before=await a.drawing(),input=a.get('command-input');input.value='trim';input.dispatch('keydown',{key:'Enter'});a.pointer('pointermove',500,238.75);assert.ok(!a.dashes.some(d=>d.join(',')==='7,5'));a.key('Enter');a.pointer('pointermove',500,238.75);assert.ok(a.dashes.some(d=>d.join(',')==='7,5'));assert.deepEqual(await a.drawing(),before);assert.equal(a.get('undo').disabled,true);a.canvas.dispatch('pointerleave');assert.ok(!a.dashes.some(d=>d.join(',')==='7,5'));a.key('Escape');assert.ok(!a.dashes.some(d=>d.join(',')==='7,5'));
});

test('Extend accepts multiple boundaries or none, previews then commits with Undo',async()=>{
 for(const all of [false,true]){
 const a=app();a.get('sample').click();const input=a.get('command-input'),command=text=>{input.value=text;input.dispatch('keydown',{key:'Enter'});};command('line');a.pointer('pointerdown',500,350);command('@800,0');a.key('Escape');const before=await a.drawing();command('extend');
 if(all){input.dispatch('keydown',{key:'Enter'});assert.match(a.get('instruction').textContent,/All edges/);}else{a.pointer('pointerdown',500,238.75);a.pointer('pointerdown',704.1667,283.25);assert.match(a.get('instruction').textContent,/boundaries \(2\)/);assert.deepEqual(await a.drawing(),before);a.pointer('contextmenu',500,238.75);}
 a.pointer('pointermove',790,350);assert.ok(a.dashes.some(d=>d.join(',')==='7,5'));assert.deepEqual(await a.drawing(),before);a.pointer('pointerdown',790,350);const result=await a.drawing();assert.equal(result.find(e=>e.type==='line').b.x,2400);a.get('undo').click();assert.deepEqual(await a.drawing(),before);a.get('change-boundary').click();assert.match(a.get('instruction').textContent,/Select boundaries \(0\)/);a.key('Escape');assert.equal(a.get('command-prompt').textContent,'Command:');
 }
});

test('Text tool places selects edits and exports text with Undo',async()=>{
 const a=app();a.get('sample').click();const input=a.get('command-input');input.value='text';input.dispatch('keydown',{key:'Enter'});assert.equal(a.get('text-options').hidden,false);a.pointer('pointerdown',500,350);a.pointer('pointermove',650,380);a.pointer('pointerup',650,380);assert.equal(a.get('text-editor').hidden,false);a.get('text-editor').value='Panel A';a.get('text-editor').dispatch('keydown',{key:'Enter',ctrlKey:true});let entities=await a.drawing(),label=entities.find(e=>e.type==='text');assert.equal(label.text,'Panel A');assert.ok(label.height>0);assert.equal(label.layer,'TEXT');a.key('Escape');a.pointer('pointerdown',510,365);a.pointer('pointerup',510,365);assert.match(a.get('selection-heading').textContent,/TEXT SELECTED/);const form=a.get('edit-form');form.values={layer:'LABELS',text:'Panel B',x:1200,y:300,height:60,rotation:45};form.onsubmit({target:form,preventDefault(){}});label=(await a.drawing()).find(e=>e.type==='text');assert.equal(label.text,'Panel B');assert.equal(label.rotation,45);assert.equal(label.height,60);a.get('undo').click();assert.equal((await a.drawing()).find(e=>e.type==='text').text,'Panel A');a.get('undo').click();assert.equal((await a.drawing()).length,4);
});

test('text box sizes before typing, commits on outside click and cancels without geometry',async()=>{
 const a=app();a.get('sample').click();const before=await a.drawing();const input=a.get('command-input');input.value='text';input.dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',650,400);a.pointer('pointermove',500,350);a.pointer('pointerup',500,350);const editor=a.get('text-editor');assert.equal(editor.hidden,false);assert.equal(editor.value,'');assert.deepEqual(await a.drawing(),before);editor.value='Long panel label';editor.dispatch('input');assert.ok(parseFloat(editor.style.fontSize)>0);a.pointer('pointerdown',800,450);assert.equal(editor.hidden,true);assert.equal((await a.drawing()).length,5);a.get('undo').click();assert.deepEqual(await a.drawing(),before);
 a.pointer('pointerdown',500,350);a.pointer('pointermove',650,400);a.pointer('pointerup',650,400);editor.value='Cancel me';editor.dispatch('keydown',{key:'Escape'});assert.equal(editor.hidden,true);assert.deepEqual(await a.drawing(),before);
 input.value='text';input.dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',500,350);a.pointer('pointerup',500,350);assert.equal(editor.hidden,true);assert.deepEqual(await a.drawing(),before);
});

test('text Enter adds a line without committing or shrinking the default size',async()=>{
 const a=app();a.get('sample').click();const input=a.get('command-input');input.value='text';input.dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',500,350);a.pointer('pointermove',650,400);a.pointer('pointerup',650,400);const editor=a.get('text-editor');assert.equal(parseFloat(editor.style.fontSize),18);editor.value='First line';let prevented=false;editor.dispatch('keydown',{key:'Enter',preventDefault(){prevented=true;}});assert.equal(prevented,false);assert.equal(editor.hidden,false);assert.equal((await a.drawing()).length,4);editor.value='First line\nA longer second line that should not shrink';editor.dispatch('input');assert.equal(parseFloat(editor.style.fontSize),18);editor.dispatch('keydown',{key:'Enter',ctrlKey:true});const text=(await a.drawing()).find(e=>e.type==='text');assert.equal(text.text,editor.value||'First line\nA longer second line that should not shrink');assert.ok(text.height>0);assert.equal(editor.hidden,true);
});

test('text insertion grip supports click then destination and moves the entire multiline object',async()=>{
 const a=app();a.get('sample').click();const input=a.get('command-input');input.value='text';input.dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',500,350);a.pointer('pointermove',650,400);a.pointer('pointerup',650,400);a.get('text-editor').value='First\nSecond';a.get('text-editor').dispatch('keydown',{key:'Enter',ctrlKey:true});a.key('Escape');const before=await a.drawing(),label=before.find(e=>e.type==='text');const x=55+label.x*(890/2400),y=461.25-label.y*(890/2400);a.pointer('pointermove',x,y);a.pointer('pointerdown',x,y);a.pointer('pointerup',x,y);a.canvas.dispatch('lostpointercapture');assert.match(a.get('instruction').textContent,/click the destination/);a.pointer('pointermove',x+37.083333333,y-37.083333333);assert.deepEqual(await a.drawing(),before);a.pointer('pointerdown',x+37.083333333,y-37.083333333);const after=await a.drawing(),moved=after.find(e=>e.type==='text');assert.ok(Math.abs(moved.x-label.x-100)<1e-7);assert.ok(Math.abs(moved.y-label.y-100)<1e-7);assert.equal(moved.text,label.text);assert.equal(moved.height,label.height);a.get('undo').click();assert.deepEqual(await a.drawing(),before);
});
test('object center grip supports dragging and Escape cancels a click-move',async()=>{
 const a=app();a.get('sample').click();const before=await a.drawing();a.pointer('pointerdown',704.1666667,350);a.pointer('pointermove',741.25,312.9166667);a.pointer('pointerup',741.25,312.9166667);const after=await a.drawing();assert.equal(after[1].x,before[1].x+100);assert.equal(after[1].y,before[1].y+100);assert.equal(after[1].r,before[1].r);a.get('undo').click();a.pointer('pointerdown',704.1666667,350);a.pointer('pointerup',704.1666667,350);a.pointer('pointermove',741.25,312.9166667);a.key('Escape');assert.deepEqual(await a.drawing(),before);
});

test('double click reopens multiline text and saves in place with one Undo step',async()=>{
 const a=app();a.get('sample').click();const input=a.get('command-input');input.value='text';input.dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',500,350);a.pointer('pointermove',650,400);a.pointer('pointerup',650,400);const editor=a.get('text-editor');editor.value='First\nSecond';editor.dispatch('keydown',{key:'Enter',ctrlKey:true});a.key('Escape');const before=await a.drawing(),original=before.find(e=>e.type==='text');a.pointer('dblclick',510,365);assert.equal(editor.hidden,false);assert.equal(editor.value,original.text);editor.value='Edited\nSecond\nThird';editor.dispatch('keydown',{key:'Enter'});assert.equal(editor.hidden,false);assert.deepEqual(await a.drawing(),before);editor.dispatch('keydown',{key:'Enter',ctrlKey:true});const after=await a.drawing();assert.equal(after.length,before.length);assert.deepEqual(after.find(e=>e.type==='text'),{...original,text:'Edited\nSecond\nThird'});a.get('undo').click();assert.deepEqual(await a.drawing(),before);
});
test('double click on insertion grip edits instead of moving, and Escape discards changes',async()=>{
 const a=app();a.get('sample').click();const input=a.get('command-input');input.value='text';input.dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',500,350);a.pointer('pointermove',650,400);a.pointer('pointerup',650,400);const editor=a.get('text-editor');editor.value='Original';editor.dispatch('keydown',{key:'Enter',ctrlKey:true});a.key('Escape');const before=await a.drawing();a.pointer('pointerdown',500,364.4,{detail:1});a.pointer('pointerup',500,364.4);a.pointer('pointerdown',500,364.4,{detail:2});a.pointer('pointerup',500,364.4);a.pointer('dblclick',500,364.4);assert.equal(editor.hidden,false);assert.equal(editor.value,'Original');editor.value='Discard';editor.dispatch('keydown',{key:'Escape'});assert.deepEqual(await a.drawing(),before);a.pointer('dblclick',510,365);editor.value='Outside click saved';a.pointer('pointerdown',800,450);assert.equal(editor.hidden,true);assert.equal((await a.drawing()).find(e=>e.type==='text').text,'Outside click saved');
});

test('inline formatting saves and reopens bold bullets colour and text size',async()=>{
 const a=app();a.get('sample').click();const input=a.get('command-input');input.value='text';input.dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',500,350);a.pointer('pointermove',700,450);a.pointer('pointerup',700,450);const editor=a.get('text-editor');editor.value='First\nSecond';editor.selectionStart=0;editor.selectionEnd=editor.value.length;assert.equal(a.get('text-format').hidden,false);a.get('text-bold').click();a.get('text-bullets').click();assert.equal(editor.value,'• First\n• Second');a.get('text-colour').value='#ff4400';a.get('text-colour').dispatch('input');a.get('text-size').value='30';a.get('text-size').dispatch('input');assert.equal(editor.style.fontWeight,'bold');assert.equal(editor.style.color,'#ff4400');editor.dispatch('keydown',{key:'Enter',ctrlKey:true});const label=(await a.drawing()).find(e=>e.type==='text');assert.equal(label.bold,true);assert.equal(label.color,'#ff4400');assert.equal(label.height,30);assert.equal(a.get('text-format').hidden,true);a.key('Escape');a.pointer('dblclick',510,360);assert.equal(a.get('text-format').hidden,false);assert.equal(a.get('text-bold').ariaPressed,'true');assert.equal(a.get('text-colour').value,'#ff4400');assert.equal(Number(a.get('text-size').value),30);a.get('text-bold').click();editor.dispatch('keydown',{key:'Escape'});assert.equal((await a.drawing()).find(e=>e.type==='text').bold,true);
});
test('bullet list Enter continues the list and empty bullet ends it',()=>{
 const a=app();a.get('sample').click();a.get('command-input').value='text';a.get('command-input').dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',500,350);a.pointer('pointerup',700,450);const editor=a.get('text-editor');editor.value='• First';editor.selectionStart=editor.selectionEnd=editor.value.length;editor.dispatch('keydown',{key:'Enter'});assert.equal(editor.value,'• First\n• ');editor.dispatch('keydown',{key:'Enter'});assert.equal(editor.value,'• First\n');assert.equal(editor.hidden,false);
});

test('drawing palette colours selections and new geometry with Undo and DXF persistence',async()=>{
 const a=app();a.get('sample').click();const before=await a.drawing();a.selectAll();a.get('colour-red').click();assert.ok((await a.drawing()).every(e=>e.color==='#ff5555'));a.get('undo').click();assert.deepEqual(await a.drawing(),before);a.key('Escape');a.get('command-input').value='line';a.get('command-input').dispatch('keydown',{key:'Enter'});a.get('colour-blue').click();a.pointer('pointerdown',500,350);a.get('command-input').value='100<0';a.get('command-input').dispatch('keydown',{key:'Enter'});const after=await a.drawing();assert.equal(after.find(e=>e.type==='line').color,'#36a9ff');assert.deepEqual(after.slice(0,4),before);
});

test('C closes a polyline to its first point while normal C still suggests Circle',async()=>{
 const a=app();a.get('sample').click();a.get('command-input').value='polyline';a.get('command-input').dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',500,350);a.pointer('pointerdown',600,350);a.key('c');assert.match(a.get('notice').textContent,/three vertices/);a.pointer('pointerdown',600,400);a.key('c');const es=await a.drawing();assert.equal(es.length,5);assert.equal(es.at(-1).type,'polyline');assert.equal(es.at(-1).closed,true);assert.equal(es.at(-1).vertices.length,3);a.key('Escape');a.key('c');assert.match(a.get('command-suggestion').textContent,/CIRCLE/);
});
test('Ctrl+C and Ctrl+V paste independent grouped copies and Escape cancels',async()=>{
 const a=app();a.get('sample').click();a.selectAll();a.get('group').click();const before=await a.drawing();a.key('c',{ctrlKey:true});a.key('v',{ctrlKey:true});assert.match(a.get('instruction').textContent,/Paste:/);a.pointer('pointermove',600,350);assert.deepEqual(await a.drawing(),before);a.pointer('pointerdown',600,350);const after=await a.drawing();assert.equal(after.length,8);assert.deepEqual(after.slice(0,4),before);assert.notEqual(after[4].groupId,before[0].groupId);assert.ok(after.slice(4).every(e=>e.groupId===after[4].groupId));a.get('undo').click();assert.deepEqual(await a.drawing(),before);a.key('v',{ctrlKey:true});a.key('Escape');a.pointer('pointerdown',650,400);assert.deepEqual(await a.drawing(),before);
});
test('layer creation assignment colour and active-layer drawing are undoable',async()=>{
 const a=app();a.get('sample').click();const before=await a.drawing();a.get('new-layer-name').value='WORKTOP';a.get('add-layer').click();assert.equal(a.get('active-layer').value,'WORKTOP');a.selectAll();a.get('assign-layer').click();assert.ok((await a.drawing()).every(e=>e.layer==='WORKTOP'));a.get('layer-colour').value='#112233';a.get('layer-colour').dispatch('change');assert.ok((await a.drawing()).every(e=>e.color==='#112233'));a.get('undo').click();a.get('undo').click();assert.deepEqual(await a.drawing(),before);a.key('Escape');a.get('command-input').value='line';a.get('command-input').dispatch('keydown',{key:'Enter'});a.pointer('pointerdown',500,350);a.get('command-input').value='100<0';a.get('command-input').dispatch('keydown',{key:'Enter'});assert.equal((await a.drawing()).at(-1).layer,'WORKTOP');
});
test('sheet arrangement preserves grouped cutouts and Undo, sheet is not exported',async()=>{
 const a=app();a.get('sample').click();a.selectAll();a.get('group').click();const before=await a.drawing();a.get('arrange-sheet').click();const after=await a.drawing();assert.equal(after.length,4);assert.equal(after[0].vertices[0].x,10);assert.equal(after[0].vertices[0].y,790);assert.equal(after[1].x,before[1].x+10);assert.equal(after[1].y,before[1].y+790);assert.equal(a.get('show-sheet').checked,true);a.get('undo').click();assert.deepEqual(await a.drawing(),before);
});

test('hidden layers are excluded from selection picking and snapping but remain in DXF',async()=>{
 const a=app();a.get('sample').click();const before=await a.drawing();a.get('active-layer').value='CUTOUTS';a.get('active-layer').onchange();a.get('layer-visible').checked=false;a.get('layer-visible').onchange();a.selectAll();assert.match(a.get('count').textContent,/1 selected/);a.key('Escape');a.pointer('pointerdown',704.1667,283.25);a.pointer('pointerup',704.1667,283.25);assert.equal(a.get('count').textContent,'4 objects');assert.deepEqual(await a.drawing(),before);a.get('show-all-layers').click();a.selectAll();assert.match(a.get('count').textContent,/4 selected/);
});
test('Print layout sends only selected visible geometry after the new page is ready',()=>{
 const a=app();a.get('sample').click();let sent=null,opened=0;const page={postMessage(data){sent=data;}};a.window.open=()=>{opened++;return page;};a.window.removeEventListener=()=>{};a.get('print-layout').click();assert.equal(opened,0);a.selectAll();a.get('print-layout').click();assert.equal(opened,1);a.window.events.message({source:page,data:{type:'trendcad-print-ready'}});assert.equal(sent.type,'trendcad-print-parts');assert.equal(sent.entities.length,4);assert.equal(sent.name,'Sample worktop');
});

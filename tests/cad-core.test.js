const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../cad-core.js');
test('angle snapping supports 0, 90, 170 and negative angles while preserving length',()=>{
 for(const [input,expected] of [[3,0],[87,90],[172,170],[-92,-90]]){const r=input*Math.PI/180,p=C.angleSnap({x:20,y:30},{x:20+100*Math.cos(r),y:30+100*Math.sin(r)},10);assert.ok(Math.abs(C.distance({x:20,y:30},p)-100)<1e-8);assert.ok(Math.abs(Math.atan2(p.y-30,p.x-20)*180/Math.PI-expected)<1e-8);}
});
test('aligned dimensions measure diagonal lengths and export/import without becoming cutting lines',()=>{
 const e={type:'dimension',layer:'DIMENSIONS',a:{x:0,y:0},b:{x:300,y:400},offset:-50};
 assert.equal(C.dimension(e).length,500);assert.equal(C.dimension(e).label,'500 mm');const text=C.writeDXF([e]);assert.match(text,/AcDbAlignedDimension/);assert.match(text,/BLOCKS/);const r=C.parseDXF(text);assert.deepEqual(r.entities,[e]);assert.equal(r.warnings.length,0);assert.equal(C.dimension(C.translate(e,10,20)).length,500);
});
test('invalid dimension endpoints rejected and dimension hit testing follows extension lines',()=>{assert.equal(C.valid({type:'dimension',a:{x:0,y:0},b:{x:0,y:0},offset:10}),false);const e={type:'dimension',a:{x:0,y:0},b:{x:100,y:0},offset:20};assert.equal(C.hitDistance(e,{x:50,y:20}),0);assert.equal(C.hitDistance(e,{x:0,y:10}),0);});
const dxf=(body,units=4)=>`0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${units}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}\n0\nENDSEC\n0\nEOF\n`;
const line='0\nLINE\n8\nCUT\n10\n0\n20\n0\n11\n10\n21\n20';
test('DXF round-trip retains lines, circles, arcs, closed bulged contours and layers',()=>{
 const source=[{type:'line',layer:'CUT',a:{x:-1.25,y:5},b:{x:100.125,y:300}},{type:'circle',layer:'HOLES',x:20,y:30,r:8.5},{type:'arc',layer:'CUT',x:100,y:100,r:25,start:310,end:65},{type:'polyline',layer:'CUT',closed:true,vertices:[{x:0,y:0,bulge:.4142135624},{x:100,y:100,bulge:0},{x:0,y:100,bulge:0}]}];
 const result=C.parseDXF(C.writeDXF(source));assert.deepEqual(result.entities,source);assert.equal(result.units,4);assert.deepEqual(result.warnings,[]);
});
test('inch files convert all linear measurements to millimetres',()=>{const r=C.parseDXF(dxf(line+'\n0\nCIRCLE\n10\n1\n20\n2\n40\n.5',1));assert.equal(r.entities[0].b.x,254);assert.equal(r.entities[1].r,12.7);assert.equal(r.entities[1].y,50.8);});
test('unitless input is clearly identified',()=>{assert.match(C.parseDXF(dxf(line,0)).warnings[0],/unspecified/);});
test('old POLYLINE vertex sequence imports closed and curved geometry',()=>{const body='0\nPOLYLINE\n8\nOUTLINE\n70\n1\n0\nVERTEX\n10\n0\n20\n0\n42\n1\n0\nVERTEX\n10\n20\n20\n0\n42\n1\n0\nSEQEND';const r=C.parseDXF(dxf(body));assert.equal(r.entities.length,1);assert.equal(r.entities[0].closed,true);assert.equal(r.entities[0].vertices[0].bulge,1);assert.equal(r.entities[0].layer,'OUTLINE');});
test('bulge arcs retain direction and radius',()=>{const a=C.bulgeArc({x:0,y:0,bulge:1},{x:20,y:0});assert.equal(a.r,10);assert.equal(a.x,10);assert.equal(a.sweep,Math.PI);const b=C.bulgeArc({x:0,y:0,bulge:-1},{x:20,y:0});assert.equal(b.sweep,-Math.PI);});
test('unsupported objects are counted, not silently imported',()=>{const r=C.parseDXF(dxf(line+'\n0\nINSERT\n2\nBLOCK1\n0\nSPLINE'));assert.equal(r.entities.length,1);assert.deepEqual(r.skipped,{INSERT:1,SPLINE:1});});
test('reject non-planar and paper space geometry',()=>{const r=C.parseDXF(dxf(line+'\n30\n5\n'+line+'\n67\n1'));assert.equal(r.entities.length,0);assert.equal(Object.keys(r.skipped).length,2);});
test('non-planar vertex rejects the entire polyline',()=>{const r=C.parseDXF(dxf('0\nPOLYLINE\n0\nVERTEX\n10\n0\n20\n0\n0\nVERTEX\n10\n10\n20\n10\n30\n5\n0\nVERTEX\n10\n20\n20\n20\n0\nSEQEND'));assert.equal(r.entities.length,0);assert.ok(r.warnings.length);});
test('malformed and binary files fail with actionable messages',()=>{assert.throws(()=>C.parseDXF('AutoCAD Binary DXF'),/ASCII/);assert.throws(()=>C.parseDXF('0\nSECTION\n2'),/incomplete/);assert.throws(()=>C.parseDXF('0\nSECTION\n'),/EOF/);});
test('invalid radii and malformed bulges are rejected',()=>{assert.equal(C.valid({type:'circle',x:0,y:0,r:-1}),false);assert.equal(C.valid({type:'polyline',vertices:[{x:0,y:0,bulge:NaN},{x:2,y:2}]}),false);});
test('move preserves curve data and does not mutate the original',()=>{const e={type:'arc',x:5,y:10,r:20,start:20,end:90};const moved=C.translate(e,100,-10);assert.deepEqual(moved,{...e,x:105,y:0});assert.equal(e.x,5);});
test('hit testing follows outline and bounds include circles',()=>{const e={type:'circle',x:100,y:100,r:25};assert.equal(C.hitDistance(e,{x:125,y:100}),0);assert.equal(C.hitDistance(e,{x:100,y:100}),25);assert.deepEqual(C.bounds([e]),{minX:75,minY:75,maxX:125,maxY:125});});
test('sample DXF opens with expected worktop size',()=>{const r=C.parseDXF(fs.readFileSync(path.join(__dirname,'../examples/sample-worktop.dxf'),'utf8'));assert.equal(r.entities.length,4);const b=C.bounds(r.entities);assert.equal(b.maxX-b.minX,2400);assert.equal(b.maxY-b.minY,600);});

test('text round trips through DXF with height rotation layer and Unicode',()=>{
 const e={type:'text',layer:'TEXT',x:20,y:30,height:25,rotation:35,text:'Sink Ø 450 ± 2°',groupId:'labels'};assert.ok(C.valid(e));const dxf=C.writeDXF([e]);assert.match(dxf,/AcDbText/);assert.match(dxf,/TEXT/);const r=C.parseDXF(dxf);assert.deepEqual(r.entities,[e]);assert.equal(r.warnings.length,0);assert.deepEqual(C.translate(e,10,20),{...e,x:30,y:50});assert.throws(()=>C.writeDXF([{...e,height:0}]),/invalid/);assert.equal(C.valid({...e,text:' '}),false);
});
test('imports aligned text and common DXF indexed colours as editable annotations',()=>{
 const body='0\nTEXT\n8\nLABELS\n10\n10\n20\n20\n11\n30\n21\n20\n40\n5\n41\n0.45\n62\n1\n72\n2\n73\n1\n1\nCentered label';
 const r=C.parseDXF(dxf(body));assert.equal(r.entities.length,1);assert.deepEqual(r.skipped,{});assert.equal(r.entities[0].type,'text');assert.equal(r.entities[0].text,'Centered label');assert.equal(r.entities[0].color,'#ff0000');assert.match(r.warnings.join(' '),/normalized/);
});
test('rotated text bounds and hit tests include the annotation interior',()=>{
 const e={type:'text',layer:'TEXT',x:0,y:0,height:10,rotation:90,text:'ABC'};const b=C.bounds([e]);assert.ok(Math.abs(b.maxY-18.6)<1e-7);assert.ok(Math.abs(b.minX+10)<1e-7);assert.equal(C.hitDistance(e,{x:-5,y:8}),0);assert.deepEqual(C.anchors(e),[{x:0,y:0}]);
});

test('multiline text round trips through MTEXT preserving lines escapes Unicode and rotation',()=>{
 const e={type:'text',layer:'TEXT',x:20,y:30,height:25,rotation:35,text:'First Ø line\nLiteral \\P {braces}\nThird line',groupId:'labels'},dxf=C.writeDXF([e]);assert.match(dxf,/MTEXT/);const r=C.parseDXF(dxf);assert.equal(r.warnings.length,0);assert.equal(r.entities.length,1);const copy=r.entities[0];assert.equal(copy.text,e.text);assert.ok(Math.abs(copy.x-e.x)<1e-7);assert.ok(Math.abs(copy.y-e.y)<1e-7);assert.equal(copy.height,25);assert.ok(Math.abs(copy.rotation-35)<1e-7);assert.equal(copy.groupId,'labels');assert.ok(C.valid(e));
});
test('multiline text bounds include lower lines and chunked DXF keeps long text',()=>{
 const e={type:'text',layer:'TEXT',x:0,y:0,height:10,rotation:0,text:'A\nLonger line'};assert.equal(C.bounds([e]).minY,-16);assert.equal(C.hitDistance(e,{x:5,y:-14}),0);const long={...e,text:'First\n'+('Long content '.repeat(80))};assert.equal(C.parseDXF(C.writeDXF([long])).entities[0].text,long.text);
});

test('bold colour and bullets survive DXF text export/import',()=>{
 for(const text of ['Bold label','• First\n• Second']){const e={type:'text',layer:'TEXT',x:10,y:20,height:30,rotation:0,text,bold:true,color:'#ff4400'},dxf=C.writeDXF([e]);assert.match(dxf,/MTEXT/);assert.match(dxf,/420/);const result=C.parseDXF(dxf);assert.equal(result.warnings.length,0);assert.deepEqual(result.entities,[e]);}
 const e={type:'text',layer:'TEXT',x:0,y:0,height:10,rotation:0,text:'Colour only',color:'#00ff00'};assert.deepEqual(C.parseDXF(C.writeDXF([e])).entities,[e]);assert.equal(C.valid({...e,color:'red'}),false);
});

test('entity colours round trip for line circle and polyline',()=>{
 const es=[{type:'line',layer:'0',a:{x:0,y:0},b:{x:10,y:0},color:'#ff5555'},{type:'circle',layer:'0',x:20,y:20,r:10,color:'#36a9ff'},{type:'polyline',layer:'0',closed:true,vertices:[{x:0,y:0,bulge:0},{x:10,y:0,bulge:0},{x:10,y:10,bulge:0}],color:'#6fe0c5'}];assert.deepEqual(C.parseDXF(C.writeDXF(es)).entities,es);
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../cad-core.js'),E=require('../cad-edit.js');
const line=(x1,y1,x2,y2)=>({type:'line',layer:'CUT',a:{x:x1,y:y1},b:{x:x2,y:y2}});
const rect={type:'polyline',closed:true,layer:'CUT',vertices:[{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:0,y:80}]};
test('drag bar moves a horizontal line perpendicularly without changing its length',()=>{const e=line(0,0,100,0),r=E.dragEdge(e,0,20);assert.deepEqual(r,line(0,20,100,20));assert.equal(C.distance(r.a,r.b),100);assert.equal(e.a.y,0);});
test('drag bar resizes a rectangle and preserves connected corners',()=>{const r=E.dragEdge(rect,1,-30);assert.deepEqual(r.vertices,[{x:0,y:0},{x:130,y:0},{x:130,y:80},{x:0,y:80}]);assert.equal(r.closed,true);assert.throws(()=>E.dragEdge(rect,1,100),/collapse|reverse/);});
test('dragging a recess wall stretches adjoining edges and keeps contour connected',()=>{const e={type:'polyline',closed:true,vertices:[{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:140,y:100},{x:140,y:60},{x:60,y:60},{x:60,y:100},{x:0,y:100}]};const r=E.dragEdge(e,3,10);assert.deepEqual(r.vertices[3],{x:150,y:100});assert.deepEqual(r.vertices[4],{x:150,y:60});assert.deepEqual(r.vertices[5],e.vertices[5]);assert.throws(()=>E.dragEdge(e,3,70),/reverse|cross/);});
test('diagonal drag stays perpendicular and curve polylines do not show misleading bars',()=>{const e=line(0,0,100,100),r=E.dragEdge(e,0,10);assert.ok(Math.abs(r.a.x+r.a.y)<1e-8);assert.ok(Math.abs(C.distance(r.a,e.a)-10)<1e-8);assert.equal(E.edgeHandles({type:'circle',x:0,y:0,r:10}).length,0);});
test('offset line preserves original and uses clicked side',()=>{const e=line(0,0,100,0);assert.deepEqual(E.offset(e,10,{x:30,y:50}),line(0,10,100,10));assert.deepEqual(E.offset(e,10,{x:30,y:-50}),line(0,-10,100,-10));assert.equal(e.a.y,0);});
test('offset rectangle inward and outward with exact mitred corners',()=>{const inside=E.offset(rect,10,{x:50,y:5}),outside=E.offset(rect,10,{x:50,y:-5});assert.deepEqual(C.bounds([inside]),{minX:10,minY:10,maxX:90,maxY:70});for(const [key,value] of Object.entries({minX:-10,minY:-10,maxX:110,maxY:90}))assert.ok(Math.abs(C.bounds([outside])[key]-value)<1e-8);assert.throws(()=>E.offset(rect,50,{x:50,y:5}),/collapse/);});
test('circle offset rejects collapse and unsupported curved polylines explicitly',()=>{const c={type:'circle',x:0,y:0,r:20};assert.equal(E.offset(c,5,{x:0,y:0}).r,15);assert.equal(E.offset(c,5,{x:30,y:0}).r,25);assert.throws(()=>E.offset(c,20,{x:0,y:0}),/collapse/);assert.throws(()=>E.offset({...rect,vertices:rect.vertices.map((v,i)=>({...v,bulge:i===0?1:0}))},5,{x:0,y:0}),/Curved/);});
test('trim clicked end of line to selected finite boundary',()=>{const result=E.edit(line(0,0,100,0),line(40,-50,40,50),{x:10,y:0},'trim');assert.deepEqual(result,[line(40,0,100,0)]);});
test('trim middle interval creates two exact retained pieces',()=>{const result=E.edit(line(-30,0,30,0),{type:'circle',x:0,y:0,r:10},{x:0,y:0},'trim');assert.deepEqual(result,[line(-30,0,-10,0),line(10,0,30,0)]);});
test('trim circle creates an exact arc, not faceted lines',()=>{const result=E.edit({type:'circle',x:0,y:0,r:10,layer:'CUT'},line(-20,0,20,0),{x:0,y:10},'trim');assert.equal(result[0].type,'arc');assert.equal(result[0].start,180);assert.equal(result[0].end,360);assert.equal(result[0].r,10);});
test('extend chooses nearest forward intersection on boundary',()=>{const result=E.edit(line(0,0,10,0),{type:'circle',x:30,y:0,r:5},{x:9,y:0},'extend');assert.deepEqual(result,[line(0,0,25,0)]);assert.throws(()=>E.edit(line(0,0,10,0),line(30,10,30,20),{x:9,y:0},'extend'),/No boundary/);});
test('extend an arc preserves its radius and reaches boundary',()=>{const a={type:'arc',x:0,y:0,r:10,start:0,end:45,layer:'CUT'},result=E.edit(a,line(0,-20,0,20),{x:7,y:7},'extend')[0];assert.equal(result.r,10);assert.ok(Math.abs(result.end-90)<1e-7);});
test('polyline trim retains all other edges and original layer',()=>{const result=E.edit(rect,line(30,-20,30,100),{x:10,y:0},'trim');assert.equal(result.length,4);assert.deepEqual(result[0],line(30,0,100,0));assert.ok(result.every(e=>e.layer==='CUT'));assert.throws(()=>E.edit(rect,line(150,-20,150,100),{x:99,y:0},'extend'),/closed/);});
test('tracking snaps to node X below cursor and reports guide',()=>{const result=C.trackSnap({x:101,y:250},{x:100,y:250},[{x:103,y:20}],5);assert.deepEqual(result.point,{x:103,y:250});assert.equal(result.guides[0].axis,'x');assert.deepEqual(result.guides[0].node,{x:103,y:20});});
test('tracking can use separate nodes for X and Y, and ignores distant nodes',()=>{const result=C.trackSnap({x:101,y:201},{x:100,y:200},[{x:103,y:20},{x:500,y:202}],5);assert.deepEqual(result.point,{x:103,y:202});assert.equal(result.guides.length,2);assert.deepEqual(C.trackSnap({x:100,y:200},{x:100,y:200},[{x:0,y:0}],5).guides,[]);});

test('multiple trim boundaries remove only the clicked interval and retain group/layer',()=>{
 const target={...line(0,0,100,0),id:1,groupId:'g'},edges=[{...line(20,-10,20,10),id:2},{...line(70,-10,70,10),id:3}];
 const result=E.edit(target,edges,{x:40,y:0},'trim');assert.equal(result.length,2);assert.equal(result[0].b.x,20);assert.equal(result[1].a.x,70);assert.ok(result.every(e=>e.groupId==='g'&&e.layer==='CUT'));assert.throws(()=>E.edit(edges[0],edges,{x:20,y:0},'trim'),/different target/);
});
test('all-edge trim excludes itself and uses only finite crossings',()=>{
 const target={...line(0,0,100,0),id:1},edges=[target,{...line(20,-10,20,10),id:2},{...line(70,-10,70,10),id:3},{...line(40,10,40,20),id:4}];const original=structuredClone(edges);
 const result=E.edit(target,edges,{x:40,y:0},'trim',true);assert.equal(result[0].b.x,20);assert.equal(result[1].a.x,70);assert.deepEqual(edges,original);assert.throws(()=>E.edit(target,[target],{x:40,y:0},'trim',true),/No crossing/);
});
test('all-edge trim uses adjoining polyline edges and retains the others',()=>{
 const target={...rect,id:1};const result=E.edit(target,[target],{x:50,y:0},'trim',true);assert.equal(result.length,3);assert.ok(result.every(e=>e.layer==='CUT'));
});
test('all-edge trim keeps circles and arcs exact',()=>{
 const circle={type:'circle',id:1,x:0,y:0,r:10,layer:'CUT'},edge={...line(-20,0,20,0),id:2};const result=E.edit(circle,[circle,edge],{x:0,y:10},'trim',true);assert.equal(result[0].type,'arc');assert.equal(result[0].start,180);assert.equal(result[0].end,360);
 const arc={...circle,type:'arc',start:0,end:180};const trimmed=E.edit(arc,[arc,{...line(0,-20,0,20),id:3}],{x:7,y:7},'trim',true);assert.ok(Math.abs(trimmed[0].start-90)<1e-8);assert.equal(trimmed[0].end,180);
});

test('moving a shared node stretches all connected lines without moving other endpoints',()=>{
 const es=[{...line(0,10,0,0),id:1},{...line(0,0,20,0),id:2},{...line(30,0,40,0),id:3}],before=structuredClone(es);const r=E.moveNode(es,{x:0,y:0},{x:5,y:3});assert.deepEqual(r[0].b,{x:5,y:3});assert.deepEqual(r[1].a,{x:5,y:3});assert.deepEqual(r[0].a,es[0].a);assert.deepEqual(r[1].b,es[1].b);assert.equal(r[2],es[2]);assert.deepEqual(es,before);assert.throws(()=>E.moveNode(es,{x:0,y:0},{x:0,y:10}),/collapse/);
});
test('node movement retains polyline closure, bulges, layers and groups',()=>{
 const poly={...rect,id:1,groupId:'g'},r=E.moveNode([poly],poly.vertices[0],{x:10,y:10})[0];assert.equal(r.closed,true);assert.equal(r.groupId,'g');assert.equal(r.layer,'CUT');assert.deepEqual(r.vertices.slice(1),poly.vertices.slice(1));const curved={...poly,vertices:poly.vertices.map((v,i)=>({...v,bulge:i===0?.5:0}))};assert.equal(E.moveNode([curved],curved.vertices[0],{x:10,y:10})[0].vertices[0].bulge,.5);
});
test('arc endpoint stays connected to its line during node movement',()=>{
 const arc={type:'arc',id:1,x:0,y:0,r:10,start:0,end:90,layer:'CUT'},es=[arc,{...line(10,0,30,0),id:2}];const r=E.moveNode(es,{x:10,y:0},{x:15,y:2}),nodes=E.nodeHandles(r[0]);assert.ok(C.distance(nodes[0],r[1].a)<1e-7);assert.ok(C.distance(nodes[1],{x:0,y:10})<1e-7);
});

test('object snap modes independently offer endpoint midpoint center quadrant and nearest',()=>{
 const l=line(0,0,100,0);assert.deepEqual(E.snapCandidates(l,{x:35,y:4},{nearest:true}),[{x:35,y:0,kind:'Nearest'}]);assert.equal(E.snapCandidates(l,{x:0,y:0},{endpoint:true}).length,2);assert.deepEqual(E.snapCandidates(l,{x:0,y:0},{midpoint:true}),[{x:50,y:0,kind:'Midpoint'}]);assert.deepEqual(E.snapCandidates(l,{x:0,y:0},{}),[]);
 const c={type:'circle',x:20,y:30,r:10};assert.deepEqual(E.snapCandidates(c,{x:20,y:30},{center:true}),[{x:20,y:30,kind:'Center'}]);assert.equal(E.snapCandidates(c,{x:20,y:30},{quadrant:true}).length,4);assert.equal(E.snapCandidates(c,{x:20,y:30},{endpoint:true}).length,0);assert.deepEqual(E.snapCandidates(c,{x:40,y:30},{nearest:true}),[{x:30,y:30,kind:'Nearest'}]);
});
test('nearest snap clamps to finite edges and curved polyline midpoint follows the arc',()=>{
 assert.equal(E.snapCandidates(line(0,0,10,0),{x:20,y:4},{nearest:true})[0].x,10);const arc={type:'arc',x:0,y:0,r:10,start:0,end:90};const q=E.snapCandidates(arc,{x:-10,y:0},{nearest:true})[0];assert.ok(C.distance(q,{x:0,y:10})<1e-7);const poly={type:'polyline',closed:false,vertices:[{x:0,y:0,bulge:1},{x:10,y:0}]};const mid=E.snapCandidates(poly,{x:0,y:0},{midpoint:true})[0];assert.ok(C.distance(mid,{x:5,y:-5})<1e-7);
});

test('trim hover preview isolates the removed interval without changing inputs',()=>{
 const target=line(0,0,100,0),boundaries=[line(20,-10,20,10),line(70,-10,70,10)],before=structuredClone(target);const preview=E.edit(target,boundaries,{x:40,y:0},'trim',false,true);assert.deepEqual(preview.dashed,[line(20,0,70,0)]);assert.deepEqual(preview.solid,E.edit(target,boundaries,{x:40,y:0},'trim'));assert.deepEqual(target,before);
});
test('circle and whole polyline-edge trim previews preserve exact curved geometry',()=>{
 const circle={type:'circle',x:0,y:0,r:10,layer:'CUT'},preview=E.edit(circle,line(-20,0,20,0),{x:0,y:10},'trim',false,true);assert.equal(preview.dashed[0].type,'arc');assert.equal(preview.dashed[0].end-preview.dashed[0].start,180);assert.ok(C.distance(E.snapCandidates(preview.dashed[0],{x:0,y:10},{nearest:true})[0],{x:0,y:10})<1e-6);const poly={...rect,id:1},q=E.edit(poly,[poly],{x:50,y:0},'trim',true,true);assert.equal(q.solid.length,3);assert.deepEqual(q.dashed,[line(0,0,100,0)]);
});
test('extend preview shows the hovered segment and exact new portion at either endpoint',()=>{
 for(const [boundary,p,expected]of [[line(30,-10,30,10),{x:9,y:0},line(10,0,30,0)],[line(-20,-10,-20,10),{x:1,y:0},line(-20,0,0,0)]]){const e=line(0,0,10,0),preview=E.edit(e,boundary,p,'extend',false,true);assert.deepEqual(preview.dashed,[e,expected]);assert.equal(preview.solid.length,0);}
 const arc={type:'arc',x:0,y:0,r:10,start:0,end:45,layer:'CUT'},preview=E.edit(arc,line(0,-20,0,20),{x:7,y:7},'extend',false,true);assert.ok(Math.abs(preview.dashed[1].start-45)<1e-7);assert.ok(Math.abs(preview.dashed[1].end-90)<1e-7);
});

test('Extend with multiple or all boundaries stops at nearest forward finite intersection',()=>{
 const target={...line(0,0,10,0),id:1},near={...line(20,-5,20,5),id:2},far={...line(40,-5,40,5),id:3},miss={...line(15,10,15,20),id:4};
 for(const [boundaries,all]of [[[far,near,miss],false],[[target,far,near,miss],true]]){const result=E.edit(target,boundaries,{x:9,y:0},'extend',all);assert.equal(result[0].b.x,20);const preview=E.edit(target,boundaries,{x:9,y:0},'extend',all,true);assert.equal(preview.dashed[1].b.x,20);}
 assert.throws(()=>E.edit(target,[target,miss],{x:9,y:0},'extend',true),/No boundary/);
});
test('all-edge Extend handles arcs and open polylines without extending interior joins',()=>{
 const arc={type:'arc',id:1,x:0,y:0,r:10,start:0,end:45},b={...line(0,-20,0,20),id:2};assert.ok(Math.abs(E.edit(arc,[arc,b],{x:7,y:7},'extend',true)[0].end-90)<1e-7);
 const poly={type:'polyline',id:3,closed:false,vertices:[{x:0,y:0},{x:10,y:0},{x:10,y:10}]},boundary={...line(0,20,20,20),id:4};const result=E.edit(poly,[poly,boundary],{x:10,y:9},'extend',true);assert.deepEqual(result[1].b,{x:10,y:20});assert.throws(()=>E.edit(poly,[poly,boundary],{x:10,y:1},'extend',true),/outer endpoint/);
});

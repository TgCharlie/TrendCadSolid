const {test}=require('node:test'),assert=require('node:assert/strict'),L=require('../cad-layout.js');
const part=(id,w,h,x=0)=>({id,type:'polyline',layer:'CUT',closed:true,vertices:[{x,y:0},{x:x+w,y:0},{x:x+w,y:h},{x,y:h}]});
test('row packing maintains spacing and margins across rows',()=>{
 const es=[part(1,60,20),part(2,60,20)],before=structuredClone(es),result=L.arrange(es,new Set([1,2]),{width:100,height:80,margin:5,gap:10,rotate:false});assert.deepEqual(result[0].vertices[0],{x:5,y:55});assert.deepEqual(result[1].vertices[0],{x:5,y:25});assert.deepEqual(es,before);
});
test('automatic rotation tries 90 degrees to keep a part in the current row',()=>{
 const es=[part(1,60,20),part(2,60,20)],result=L.arrange(es,new Set([1,2]),{width:100,height:80,margin:5,gap:10,rotate:true});
 assert.deepEqual(result[0].vertices[0],{x:5,y:55});
 const b=L.bounds(result.slice(1));assert.equal(b.minX,75);assert.equal(b.maxX,95);assert.equal(b.minY,15);assert.equal(b.maxY,75);
});
test('oversize, overflow, invalid settings and occupied placements fail atomically',()=>{
 const es=[part(1,80,80),part(2,80,80)],before=structuredClone(es),multi=L.arrangeMulti(es,new Set([1,2]),{width:100,height:100,margin:5,gap:10});assert.equal(multi.sheets.length,2);assert.deepEqual(es,before);assert.throws(()=>L.arrange(es,new Set([1]),{width:50,height:100,margin:5,gap:10}),/larger/);assert.throws(()=>L.arrange(es,new Set([1]),{width:100,height:100,margin:-1,gap:10}),/valid sheet/);assert.throws(()=>L.arrange(es,new Set([1]),{width:100,height:100,margin:5,gap:10}),/overlap unselected/);
});
test('group outlines and cutouts stay rigid during layout',()=>{
 const es=[{...part(1,60,40,100),groupId:'g'},{type:'circle',id:2,groupId:'g',x:130,y:20,r:5,layer:'CUT'}];const r=L.arrange(es,new Set([1]),{width:100,height:100,margin:5,gap:5});assert.equal(r[0].groupId,'g');assert.equal(r[1].x,35);assert.equal(r[1].y,75);assert.equal(r[1].r,5);
});
test('arrangeMulti creates a second sheet when the first sheet is full',()=>{
 const es=[part(1,80,40),part(2,80,40),part(3,80,40)],r=L.arrangeMulti(es,new Set([1,2,3]),{width:100,height:60,margin:5,gap:5,sheetGap:20,rotate:false});
 assert.equal(r.sheets.length,3);assert.deepEqual(r.sheets.map(s=>s.y),[0,80,160]);assert.deepEqual(r.placed.map(p=>p.sheet),[0,1,2]);
 const b0=L.bounds([r.entities[0]]),b1=L.bounds([r.entities[1]]),b2=L.bounds([r.entities[2]]);assert.equal(b0.minY,15);assert.equal(b1.minY,95);assert.equal(b2.minY,175);
});
test('arrangeMulti rotates before creating a new sheet when 90 degrees makes a fit',()=>{
 const es=[part(1,50,30),part(2,70,20)],r=L.arrangeMulti(es,new Set([1,2]),{width:100,height:100,margin:5,gap:5,sheetGap:20,rotate:true});
 assert.equal(r.sheets.length,1);const b=L.bounds([r.entities[1]]);assert.equal(b.maxX-b.minX,20);assert.equal(b.maxY-b.minY,70);
});
test('layout drag snapping aligns selected bounds to sheet margins and nearby parts',()=>{
 const es=[part(1,40,20,0),part(2,30,20,100)],sheets=[{index:0,x:0,y:0,width:200,height:100}],sheet={width:200,height:100,margin:10,gap:5};
 const near=L.snapTranslation(es,new Set([1]),55,0,sheet,sheets,20);assert.equal(near.dx,55);assert.equal(near.dy,10);
 const toObject=L.snapTranslation(es,new Set([1]),65,0,sheet,sheets,20);assert.equal(toObject.dx,55);assert.equal(toObject.dy,10);
 const toMargin=L.snapTranslation(es,new Set([1]),0,0,sheet,sheets,20);assert.equal(toMargin.dx,10);
});
test('multi-stock arrangement uses each available sheet size and quantity',()=>{
 const es=[part(1,90,40),part(2,40,40)],r=L.arrangeMulti(es,new Set([1,2]),{width:100,height:60,margin:5,gap:5,rotate:false,stocks:[{width:100,height:60,margin:5,gap:5,quantity:1,name:'Main'},{width:50,height:60,margin:5,gap:5,quantity:1,name:'Offcut'}]});
 assert.equal(r.sheets.length,2);assert.deepEqual(r.sheets.map(s=>s.stockName),['Main','Offcut']);assert.deepEqual(r.placed.map(p=>p.sheet),[0,1]);
});

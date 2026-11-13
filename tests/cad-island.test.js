const {test}=require('node:test'),assert=require('node:assert/strict');
const Island=require('../cad-island.js');

const line=(a,b)=>({type:'line',a,b});
const rectangle=(x0,y0,x1,y1)=>[
  line({x:x0,y:y0},{x:x1,y:y0}),
  line({x:x1,y:y0},{x:x1,y:y1}),
  line({x:x1,y:y1},{x:x0,y:y1}),
  line({x:x0,y:y1},{x:x0,y:y0})
];

test('island tool selects the smallest nested boundary containing the click',()=>{
  const entities=[...rectangle(0,0,100,100),...rectangle(25,25,75,75)];
  const result=Island.createIslandPolyline(entities,{x:50,y:50},{gapTolerance:5});
  assert.ok(result);
  assert.equal(result.polyline.closed,true);
  assert.deepEqual(result.polyline.vertices.map(v=>[v.x,v.y]),[[25,25],[75,25],[75,75],[25,75]]);
});

test('island tool bridges a small endpoint gap and returns a closed polyline',()=>{
  const entities=[
    line({x:0,y:0},{x:100,y:0}),line({x:100,y:0},{x:100,y:50}),
    line({x:100,y:50},{x:0,y:50}),line({x:0,y:50},{x:0,y:4}),
    line({x:0,y:-1},{x:0,y:0})
  ];
  const result=Island.createIslandPolyline(entities,{x:50,y:25},{gapTolerance:5});
  assert.ok(result);
  assert.equal(result.polyline.closed,true);
  assert.ok(result.repaired);
  assert.ok(result.polyline.vertices.length>=4);
});

test('island tool best-effort closes an open boundary instead of failing',()=>{
  const entities=[line({x:0,y:0},{x:100,y:0}),line({x:100,y:0},{x:100,y:50}),line({x:100,y:50},{x:0,y:50})];
  const result=Island.createIslandPolyline(entities,{x:50,y:25},{gapTolerance:5});
  assert.ok(result);
  assert.equal(result.polyline.closed,true);
  assert.equal(result.polyline.vertices.length,4);
});

test('segmented circular edges are converted to a true-radius bulged segment',()=>{
  const points=[];for(let i=0;i<=4;i++){const a=i*Math.PI/8;points.push({x:50+50*Math.cos(a),y:50+50*Math.sin(a)});}
  const fitted=Island.fitArc(points,.01);
  assert.ok(fitted);
  assert.ok(Math.abs(fitted.r-50)<1e-6);
  assert.ok(Math.abs(Math.tan(fitted.sweep/4)-Math.tan(Math.PI/8))<1e-6);
});

test('closed circles can be converted into a closed polyline boundary',()=>{
  const result=Island.createIslandPolyline([{type:'circle',x:0,y:0,r:25}],{x:0,y:0},{gapTolerance:5});
  assert.ok(result);
  assert.equal(result.polyline.closed,true);
  assert.equal(result.polyline.vertices.length,4);
  assert.ok(result.polyline.vertices.every(v=>Math.abs(v.bulge)>0));
});

(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./cad-core.js'):root.CAD;
  const E=typeof module!=='undefined'&&module.exports?require('./cad-edit.js'):root.CADEdit;
  const EPS=1e-7,TAU=Math.PI*2,mod=v=>(v%TAU+TAU)%TAU;
  function geometry(e){if(e.type==='text'){const ps=C.textBox(e);return ps.slice(0,-1).map((a,i)=>({type:'line',a,b:ps[i+1]}));}return e.type==='dimension'?C.dimension(e).lines.map(([a,b])=>({type:'line',a,b})):E.primitives(e);}
  function extentPoints(e){
    const points=[];for(const part of geometry(e)){
      if(part.type==='line'){points.push(part.a,part.b);continue;}
      const start=part.type==='arc'?part.start*Math.PI/180:0,sweep=part.type==='arc'?(mod((part.end-part.start)*Math.PI/180)||TAU):TAU;
      const angles=[start,start+sweep,...[0,Math.PI/2,Math.PI,Math.PI*1.5].filter(a=>mod(a-start)<=sweep+EPS)];
      for(const a of angles)points.push({x:part.x+part.r*Math.cos(a),y:part.y+part.r*Math.sin(a)});
    }return points;
  }
  function matches(e,box,crossing){
    const inside=p=>p.x>=box.minX-EPS&&p.x<=box.maxX+EPS&&p.y>=box.minY-EPS&&p.y<=box.maxY+EPS;
    if(crossing&&e.type==='text'&&C.textContains(e,{x:box.minX,y:box.minY}))return true;
    const ps=extentPoints(e);if(!ps.length)return false;
    if(!crossing)return ps.every(inside);
    if(ps.some(inside))return true;
    const corners=[{x:box.minX,y:box.minY},{x:box.maxX,y:box.minY},{x:box.maxX,y:box.maxY},{x:box.minX,y:box.maxY}];
    const edges=corners.map((a,i)=>({type:'line',a,b:corners[(i+1)%4]}));
    return geometry(e).some(part=>edges.some(edge=>E.intersections(part,edge).length>0));
  }
  function members(entities,id){const e=entities.find(e=>e.id===id);return e?entities.filter(other=>other.id===id||(e.groupId&&other.groupId===e.groupId)).map(e=>e.id):[];}
  function expand(entities,ids){const result=new Set(ids);for(const id of ids)for(const member of members(entities,id))result.add(member);return result;}
  function marquee(entities,a,b){
    // User preference: left-to-right is crossing; right-to-left is enclosure.
    const crossing=b.x>=a.x,box={minX:Math.min(a.x,b.x),minY:Math.min(a.y,b.y),maxX:Math.max(a.x,b.x),maxY:Math.max(a.y,b.y)},units=new Map();
    for(const e of entities){const key=e.groupId?'group:'+e.groupId:'entity:'+e.id;if(!units.has(key))units.set(key,[]);units.get(key).push(e);}
    const selected=new Set();for(const unit of units.values())if(crossing?unit.some(e=>matches(e,box,true)):unit.every(e=>matches(e,box,false)))unit.forEach(e=>selected.add(e.id));
    return {selected,crossing,box};
  }
  function group(entities,ids,groupId){const selected=expand(entities,ids);if(selected.size<2)throw Error('Select at least two objects to group.');return entities.map(e=>selected.has(e.id)?{...e,groupId}:e);}
  function ungroup(entities,ids){const selected=expand(entities,ids);return entities.map(e=>{if(!selected.has(e.id)||!e.groupId)return e;const copy={...e};delete copy.groupId;return copy;});}
  function explode(entities,ids){
    const selected=expand(entities,ids),result=[],selectedObjects=[];let groups=new Set(),polylines=0;
    for(const e of entities){if(!selected.has(e.id)){result.push(e);continue;}
      // One level at a time: grouped contours first become independent contours.
      if(e.groupId){groups.add(e.groupId);const copy={...e};delete copy.groupId;result.push(copy);selectedObjects.push(copy);}
      else if(e.type==='polyline'){const parts=E.primitives(e);polylines++;for(const part of parts){delete part.id;result.push(part);selectedObjects.push(part);}}
      else{result.push(e);selectedObjects.push(e);}
    }
    if(!groups.size&&!polylines)throw Error('Select a group or polyline to explode. Lines, circles, arcs and dimensions remain unchanged.');
    return {entities:result,selectedObjects,groups:groups.size,polylines};
  }
  function duplicate(entities,ids,dx,dy,newGroupId){const selected=expand(entities,ids),groups=new Map();return entities.filter(e=>selected.has(e.id)).map(e=>{const copy=C.translate(e,dx,dy);delete copy.id;if(e.groupId){if(!groups.has(e.groupId))groups.set(e.groupId,newGroupId());copy.groupId=groups.get(e.groupId);}return copy;});}
  const api={matches,extentPoints,members,expand,marquee,group,ungroup,explode,duplicate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CADSelection=api;
})(globalThis);

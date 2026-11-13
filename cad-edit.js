(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./cad-core.js'):root.CAD;
  const EPS=1e-7,TAU=2*Math.PI,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}),cross=(a,b)=>a.x*b.y-a.y*b.x,dot=(a,b)=>a.x*b.x+a.y*b.y,at=(a,v,t)=>({x:a.x+v.x*t,y:a.y+v.y*t}),mod=a=>(a%TAU+TAU)%TAU;
  const start=e=>e.start*Math.PI/180,sweep=e=>mod((e.end-e.start)*Math.PI/180)||TAU;
  function primitives(e){
    if(['line','circle','arc'].includes(e.type))return [structuredClone(e)];
    if(e.type!=='polyline')return [];
    const out=[];for(let i=0;i<e.vertices.length-(e.closed?0:1);i++){
      const a=e.vertices[i],b=e.vertices[(i+1)%e.vertices.length],arc=C.bulgeArc(a,b);
      if(arc){let s=arc.start,t=s+arc.sweep;if(arc.sweep<0)[s,t]=[t,s];out.push({type:'arc',x:arc.x,y:arc.y,r:arc.r,start:s*180/Math.PI,end:t*180/Math.PI,layer:e.layer,...(e.color?{color:e.color}:{})});}
      else if(C.distance(a,b)>EPS)out.push({type:'line',a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},layer:e.layer});
    }return out;
  }
  function param(e,p){if(e.type==='line'){const v=sub(e.b,e.a);return dot(sub(p,e.a),v)/dot(v,v);}return mod(Math.atan2(p.y-e.y,p.x-e.x)-(e.type==='arc'?start(e):0));}
  function point(e,t){if(e.type==='line')return at(e.a,sub(e.b,e.a),t);const a=t+(e.type==='arc'?start(e):0);return{x:e.x+e.r*Math.cos(a),y:e.y+e.r*Math.sin(a)};}
  function contains(e,p){const t=param(e,p);return e.type==='line'?t>=-EPS&&t<=1+EPS:e.type==='circle'||t<=sweep(e)+EPS||TAU-t<EPS;}
  function intersections(a,b,unboundedA=false){
    let ps=[];
    if(a.type==='line'&&b.type==='line'){const v=sub(a.b,a.a),w=sub(b.b,b.a),den=cross(v,w);if(Math.abs(den)>EPS)ps=[at(a.a,v,cross(sub(b.a,a.a),w)/den)];}
    else if(a.type==='line'||b.type==='line'){
      const l=a.type==='line'?a:b,c=a.type==='line'?b:a,v=sub(l.b,l.a),f=sub(l.a,c),A=dot(v,v),B=2*dot(f,v),D=B*B-4*A*(dot(f,f)-c.r*c.r);
      if(D>=-EPS&&A>EPS){const q=Math.sqrt(Math.max(0,D));ps=[at(l.a,v,(-B-q)/(2*A)),at(l.a,v,(-B+q)/(2*A))];}
    }else{const d=C.distance(a,b);if(d>EPS&&d<=a.r+b.r+EPS&&d>=Math.abs(a.r-b.r)-EPS){const x=(a.r*a.r-b.r*b.r+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.r*a.r-x*x)),v={x:(b.x-a.x)/d,y:(b.y-a.y)/d},m=at(a,v,x);ps=[{x:m.x-v.y*h,y:m.y+v.x*h},{x:m.x+v.y*h,y:m.y-v.x*h}];}}
    return ps.filter(p=>(unboundedA||contains(a,p))&&contains(b,p)).filter((p,i,all)=>all.findIndex(q=>C.distance(p,q)<EPS)===i);
  }
  function cuts(e,boundary,unbounded=false){return (Array.isArray(boundary)?boundary.flatMap(primitives):primitives(boundary)).flatMap(b=>intersections(e,b,unbounded)).map(p=>param(e,p)).sort((a,b)=>a-b).filter((t,i,all)=>!i||Math.abs(t-all[i-1])>EPS);}
  function slice(e,lo,hi){if(e.type==='line')return {...e,a:point(e,lo),b:point(e,hi)};return {type:'arc',layer:e.layer,...(e.color?{color:e.color}:{}),x:e.x,y:e.y,r:e.r,start:(lo+(e.type==='arc'?start(e):0))*180/Math.PI,end:(hi+(e.type==='arc'?start(e):0))*180/Math.PI};}
  function trimPrimitive(e,boundary,p,allEdges=false){
    const ts=cuts(e,boundary),t=param(e,p);
    if(e.type==='circle'){
      if(ts.length<2)throw Error('A circle needs two distinct boundary intersections to trim.');
      let lo=ts.filter(x=>x<t-EPS).at(-1);if(lo===undefined)lo=ts.at(-1)-TAU;let hi=ts.find(x=>x>t+EPS);if(hi===undefined)hi=ts[0]+TAU;
      if(ts.some(x=>Math.abs(x-t)<EPS))throw Error('Click the portion to remove, away from the intersection.');
      return [slice(e,hi,lo+TAU)];
    }
    const end=e.type==='line'?1:sweep(e),interior=ts.filter(x=>x>EPS&&x<end-EPS);
    if(!interior.length){if(allEdges&&ts.length){if(ts.some(x=>Math.abs(x-t)<EPS))throw Error('Click away from the intersection.');return [];}throw Error('No crossing boundary found on this object.');}
    if(interior.some(x=>Math.abs(x-t)<EPS))throw Error('Click the portion to remove, away from the intersection.');
    const lo=[0,...interior].filter(x=>x<t).at(-1)??0,hi=[...interior,end].find(x=>x>t)??end,out=[];
    if(lo>EPS)out.push(slice(e,0,lo));if(hi<end-EPS)out.push(slice(e,hi,end));return out;
  }
  function extendPrimitive(e,boundary,p){
    if(e.type==='circle')throw Error('A full circle has no endpoint to extend.');
    const end=e.type==='line'?1:sweep(e),nearStart=C.distance(p,point(e,0))<C.distance(p,point(e,end)),ts=cuts(e,boundary,true);
    if(e.type==='line'){const t=nearStart?ts.filter(t=>t<-EPS).at(-1):ts.find(t=>t>1+EPS);if(t===undefined)throw Error('No boundary found beyond that endpoint.');return [slice(e,nearStart?t:0,nearStart?1:t)];}
    const candidates=ts.filter(t=>t>end+EPS&&t<TAU-EPS);const t=nearStart?candidates.at(-1):candidates[0];if(t===undefined)throw Error('No boundary found beyond that arc endpoint.');return [slice(e,nearStart?t-TAU:0,nearStart?end:t)];
  }
  function edit(target,boundary,p,operation,allEdges=false,preview=false){
    if(target.id!==undefined&&(Array.isArray(boundary)?!allEdges&&boundary.some(e=>e.id===target.id):target.id===boundary.id))throw Error('Choose a different target from the boundary.');
    const parts=primitives(target);if(!parts.length)throw Error('Choose a line, arc, circle or polyline.');
    let index=0;parts.forEach((e,i)=>{if(C.hitDistance(e,p)<C.hitDistance(parts[index],p))index=i;});
    if(operation==='extend'&&target.type==='polyline'){
      if(target.closed)throw Error('A closed polyline has no endpoint to extend.');
      if(index!==0&&index!==parts.length-1)throw Error('Choose an end segment of the open polyline.');
      // Only extend the exterior endpoint, never an internal join.
      const chosen=parts[index],outer=index===0?target.vertices[0]:target.vertices.at(-1);
      const arcEnd=chosen.type==='line'?1:sweep(chosen),nearest=C.distance(p,point(chosen,0))<C.distance(p,point(chosen,arcEnd))?point(chosen,0):point(chosen,arcEnd);
      if(C.distance(nearest,outer)>EPS)throw Error('Click near the outer endpoint of the polyline.');
    }
    if(allEdges)boundary=[...boundary.filter(e=>e!==target&&(target.id===undefined||e.id!==target.id)),...parts.filter((e,i)=>i!==index)];
    const result=(operation==='trim'?trimPrimitive:extendPrimitive)(parts[index],boundary,p,allEdges);
    if(preview){
      const chosen=parts[index],end=chosen.type==='line'?1:chosen.type==='circle'?TAU:sweep(chosen);
      let changed;
      if(operation==='trim'){
        if(chosen.type==='circle')changed={...result[0],start:result[0].end,end:result[0].start+360};
        else{
          const ts=cuts(chosen,boundary).filter(t=>t>EPS&&t<end-EPS),t=param(chosen,p);
          changed=slice(chosen,[0,...ts].filter(x=>x<t).at(-1)??0,[...ts,end].find(x=>x>t)??end);
        }
      }else{
        const extended=result[0],lo=chosen.type==='line'?param(chosen,extended.a):(extended.start-chosen.start)*Math.PI/180,hi=chosen.type==='line'?param(chosen,extended.b):(extended.end-chosen.start)*Math.PI/180;
        changed=lo<-EPS?slice(chosen,lo,0):slice(chosen,end,hi);
      }
      return {solid:parts.flatMap((e,i)=>i===index?(operation==='trim'?result:[]):[e]),dashed:operation==='trim'?[changed]:[chosen,changed]};
    }
    return parts.flatMap((e,i)=>i===index?result:[e]).map(e=>{delete e.id;if(target.groupId)e.groupId=target.groupId;return e;});
  }
  function offset(e,amount,side){
    if(!Number.isFinite(amount)||amount<=0)throw Error('Offset distance must be greater than zero.');
    const result=structuredClone(e);delete result.id;delete result.groupId;
    if(e.type==='circle'||e.type==='arc'){result.r=e.r+(C.distance(e,side)>=e.r?amount:-amount);if(result.r<=EPS)throw Error('Offset would collapse the circle or arc.');return result;}
    const parallel=(a,b,d)=>{const v=sub(b,a),len=Math.hypot(v.x,v.y);if(len<EPS)throw Error('Remove duplicate vertices before offsetting.');const n={x:-v.y/len,y:v.x/len};return{a:at(a,n,d),b:at(b,n,d)};};
    if(e.type==='line'){Object.assign(result,parallel(e.a,e.b,(cross(sub(e.b,e.a),sub(side,e.a))>=0?1:-1)*amount));return result;}
    if(e.type!=='polyline'||e.vertices.some(v=>v.bulge))throw Error('Offset supports lines, circles, arcs and straight-sided polylines. Curved polylines are not supported yet.');
    const vs=e.vertices,count=vs.length-(e.closed?0:1);let nearest=0;
    for(let i=1;i<count;i++)if(C.hitDistance({type:'line',a:vs[i],b:vs[(i+1)%vs.length]},side)<C.hitDistance({type:'line',a:vs[nearest],b:vs[(nearest+1)%vs.length]},side))nearest=i;
    const d=(cross(sub(vs[(nearest+1)%vs.length],vs[nearest]),sub(side,vs[nearest]))>=0?1:-1)*amount;
    if(e.closed){const turns=vs.map((v,i)=>cross(sub(vs[(i+1)%vs.length],v),sub(vs[(i+2)%vs.length],vs[(i+1)%vs.length]))).filter(t=>Math.abs(t)>EPS);if(turns.some(t=>Math.sign(t)!==Math.sign(turns[0])))throw Error('Offset of concave closed polylines is not supported yet.');}
    const lines=Array.from({length:count},(_,i)=>parallel(vs[i],vs[(i+1)%vs.length],d));
    result.vertices=vs.map((v,i)=>{
      if(!e.closed&&i===0)return lines[0].a;if(!e.closed&&i===vs.length-1)return lines.at(-1).b;
      const a=lines[(i-1+count)%count],b=lines[i%count],av=sub(a.b,a.a),bv=sub(b.b,b.a),den=cross(av,bv);
      if(Math.abs(den)<EPS){if(dot(av,bv)<=0)throw Error('Offset cannot resolve a reversed segment.');return b.a;}
      const p=at(a.a,av,cross(sub(b.a,a.a),bv)/den);if(C.distance(v,p)>amount*1000)throw Error('Offset creates an excessively sharp corner.');return p;
    });
    for(let i=0;i<count;i++)if(dot(sub(result.vertices[(i+1)%vs.length],result.vertices[i]),sub(vs[(i+1)%vs.length],vs[i]))<=EPS)throw Error('Offset would collapse or reverse a segment.');
    const edges=result.vertices.slice(0,count).map((v,i)=>({type:'line',a:v,b:result.vertices[(i+1)%vs.length]}));
    for(let i=0;i<edges.length;i++)for(let j=i+2;j<edges.length;j++)if(!(e.closed&&i===0&&j===edges.length-1)&&intersections(edges[i],edges[j]).length)throw Error('Offset would self-intersect. Reduce the distance.');
    return result;
  }
  function snapCandidates(e,p,modes,origin=null){
    const out=[],add=(q,kind)=>out.push({x:q.x,y:q.y,kind});
    const addPerpendicular=(q,distance,meta={})=>out.push({x:q.x,y:q.y,kind:'Perpendicular',snapDistance:distance,...meta});
    for(const part of primitives(e)){
      const end=part.type==='line'?1:part.type==='circle'?TAU:sweep(part);
      if(modes.endpoint&&part.type!=='circle'){add(point(part,0),'Endpoint');add(point(part,end),'Endpoint');}
      if(modes.midpoint&&part.type!=='circle')add(point(part,end/2),'Midpoint');
      if(part.type!=='line'){
        if(modes.center)add(part,'Center');
        if(modes.quadrant)for(let i=0;i<4;i++){const q={x:part.x+part.r*Math.cos(i*Math.PI/2),y:part.y+part.r*Math.sin(i*Math.PI/2)};if(contains(part,q))add(q,'Quadrant');}
      }
      if(modes.nearest){
        let t=param(part,p);
        if(part.type==='line')t=Math.max(0,Math.min(1,t));
        else if(part.type==='arc'&&!contains(part,p))t=C.distance(p,point(part,0))<C.distance(p,point(part,end))?0:end;
        add(point(part,t),'Nearest');
      }
      if(!modes.perpendicular)continue;
      if(part.type==='line'){
        const v=sub(part.b,part.a),len2=dot(v,v);
        if(len2<=EPS)continue;
        const t=dot(sub(p,part.a),v)/len2,foot=point(part,Math.max(0,Math.min(1,t)));
        if(origin){
          const normal={x:-v.y,y:v.x},den=cross(normal,v),w=sub(part.a,origin);
          if(Math.abs(den)>EPS){const u=cross(w,normal)/den;if(u>=-EPS&&u<=1+EPS)addPerpendicular(point(part,Math.max(0,Math.min(1,u))),C.distance(p,foot),{cursorParameter:t,snapParameter:u});}
        }else if(t>=-EPS&&t<=1+EPS)addPerpendicular(foot,C.distance(p,foot));
        continue;
      }
      const dx=p.x-part.x,dy=p.y-part.y,d=Math.hypot(dx,dy);if(d<=EPS)continue;
      let nearestT=param(part,p);
      if(part.type==='arc'&&!contains(part,p))nearestT=C.distance(p,point(part,0))<C.distance(p,point(part,end))?0:end;
      const nearest=point(part,nearestT);
      if(origin){
        const ox=origin.x-part.x,oy=origin.y-part.y,od=Math.hypot(ox,oy);if(od<=EPS)continue;
        for(const sign of [1,-1]){const q={x:part.x+sign*ox/od*part.r,y:part.y+sign*oy/od*part.r};if(part.type==='circle'||contains(part,q))addPerpendicular(q,C.distance(p,nearest));}
      }else{
        const angle=Math.atan2(dy,dx),q={x:part.x+part.r*Math.cos(angle),y:part.y+part.r*Math.sin(angle)};if(part.type==='circle'||contains(part,q))addPerpendicular(q,C.distance(p,q));
      }
    }
    return out;
  }
  function nodeHandles(e){
    if(e.type==='line')return [e.a,e.b];
    if(e.type==='polyline')return e.vertices;
    if(e.type==='arc')return [point(e,0),point(e,sweep(e))];
    if(e.type==='circle')return [{x:e.x+e.r,y:e.y},{x:e.x-e.r,y:e.y},{x:e.x,y:e.y+e.r},{x:e.x,y:e.y-e.r}];
    return [];
  }
  function moveNode(entities,origin,destination){
    if(!Number.isFinite(destination.x)||!Number.isFinite(destination.y))throw Error('Invalid node position.');
    const touches=p=>C.distance(p,origin)<1e-5;
    return entities.map(e=>{
      if(!nodeHandles(e).some(touches))return e;
      const result=structuredClone(e),moved=p=>touches(p)?{...p,x:destination.x,y:destination.y}:p;
      if(e.type==='line'){result.a=moved(result.a);result.b=moved(result.b);}
      if(e.type==='polyline')result.vertices=result.vertices.map(moved);
      if(e.type==='circle'){
        const handle=nodeHandles(e).find(touches);if(handle){const radius=C.distance({x:e.x,y:e.y},destination);if(radius<EPS)throw Error('That movement would collapse the circle.');result.r=radius;}
      }
      if(e.type==='arc'){
        const [a,b]=nodeHandles(e).map(moved),arc=C.bulgeArc({...a,bulge:Math.tan(sweep(e)/4)},b);
        if(!arc)throw Error('That movement would collapse an arc.');
        Object.assign(result,{x:arc.x,y:arc.y,r:arc.r,start:arc.start*180/Math.PI,end:(arc.start+arc.sweep)*180/Math.PI});
      }
      if(!C.valid(result)||(result.type==='line'&&C.distance(result.a,result.b)<EPS)||(result.type==='polyline'&&result.vertices.some((v,i,vs)=>(result.closed||i<vs.length-1)&&C.distance(v,vs[(i+1)%vs.length])<EPS)))throw Error('That movement would collapse a segment.');
      return result;
    });
  }
  function edgeHandles(e){
    if(e.type==='line')return [{index:0,a:e.a,b:e.b,mid:{x:(e.a.x+e.b.x)/2,y:(e.a.y+e.b.y)/2}}];
    if(e.type!=='polyline'||e.vertices.some(v=>v.bulge))return [];
    return e.vertices.slice(0,e.vertices.length-(e.closed?0:1)).map((a,i)=>{const b=e.vertices[(i+1)%e.vertices.length];return {index:i,a,b,mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};}).filter(h=>C.distance(h.a,h.b)>EPS);
  }
  function dragEdge(e,index,amount){
    if(!Number.isFinite(amount))throw Error('Invalid edge movement.');
    const h=edgeHandles(e).find(h=>h.index===index);if(!h)throw Error('Drag bars support lines and straight-sided polylines.');
    const v=sub(h.b,h.a),len=Math.hypot(v.x,v.y),normal={x:-v.y/len,y:v.x/len},a=at(h.a,normal,amount),b=at(h.b,normal,amount);
    if(e.type==='line')return {...structuredClone(e),a,b};
    const result=structuredClone(e),vs=e.vertices,n=vs.length,j=(index+1)%n;
    function join(p,q){const w=sub(q,p),den=cross(v,w);if(Math.abs(den)<EPS)throw Error('Cannot drag an edge with a parallel adjoining segment.');return at(a,v,cross(sub(p,a),w)/den);}
    result.vertices[index]=!e.closed&&index===0?a:join(vs[(index-1+n)%n],vs[index]);
    result.vertices[j]=!e.closed&&j===n-1?b:join(vs[j],vs[(j+1)%n]);
    const old=edgeHandles(e),edges=edgeHandles(result);
    for(let i=0;i<edges.length;i++)if(dot(sub(edges[i].b,edges[i].a),sub(old[i].b,old[i].a))<=EPS)throw Error('That movement would collapse or reverse an edge.');
    // A collapsed segment may have been filtered out by edgeHandles.
    if(edges.length!==old.length)throw Error('That movement would collapse an edge.');
    for(let i=0;i<edges.length;i++)for(let k=i+2;k<edges.length;k++)if(!(e.closed&&i===0&&k===edges.length-1)&&intersections({type:'line',...edges[i]},{type:'line',...edges[k]}).length)throw Error('That movement would cross another edge.');
    return result;
  }
  function inPickBox(e,p,half){
    if(e.type==='text'){if(C.textContains(e,p))return true;const ps=C.textBox(e);return ps.slice(0,-1).some((a,i)=>inPickBox({type:'line',a,b:ps[i+1]},p,half));}
    const inside=q=>Math.abs(q.x-p.x)<=half&&Math.abs(q.y-p.y)<=half;
    const corners=[{x:p.x-half,y:p.y-half},{x:p.x+half,y:p.y-half},{x:p.x+half,y:p.y+half},{x:p.x-half,y:p.y+half}];
    const borders=corners.map((a,i)=>({type:'line',a,b:corners[(i+1)%4]}));
    const parts=e.type==='dimension'?C.dimension(e).lines.map(([a,b])=>({type:'line',a,b})):primitives(e);
    return parts.some(part=>(part.type==='line'?[part.a,part.b]:part.type==='arc'?[point(part,0),point(part,sweep(part))]:[{x:part.x+part.r,y:part.y}]).some(inside)||borders.some(b=>intersections(part,b).length));
  }
  function filletGeometry(vertex,a,b,r){
    if(!Number.isFinite(r)||r<=0)throw Error('Fillet radius must be greater than zero.');
    const va=sub(a,vertex),vb=sub(b,vertex),la=Math.hypot(va.x,va.y),lb=Math.hypot(vb.x,vb.y),u={x:va.x/la,y:va.y/la},v={x:vb.x/lb,y:vb.y/lb};
    const angle=Math.acos(Math.max(-1,Math.min(1,dot(u,v))));
    if(!Number.isFinite(angle)||angle<EPS||Math.PI-angle<EPS)throw Error('Fillet needs two non-parallel edges.');
    const tangent=r/Math.tan(angle/2);if(tangent>=Math.min(la,lb)-EPS)throw Error('Radius is too large for these edges.');
    const t1=at(vertex,u,tangent),t2=at(vertex,v,tangent),bisector={x:u.x+v.x,y:u.y+v.y},bl=Math.hypot(bisector.x,bisector.y),center=at(vertex,bisector,r/Math.sin(angle/2)/bl);
    let s=Math.atan2(t1.y-center.y,t1.x-center.x),e=Math.atan2(t2.y-center.y,t2.x-center.x);if(mod(e-s)>Math.PI)[s,e]=[e,s];
    return{t1,t2,arc:{type:'arc',x:center.x,y:center.y,r,start:s*180/Math.PI,end:e*180/Math.PI},angle};
  }
  function filletLines(a,b,p1,p2,r){
    if(a.type!=='line'||b.type!=='line')throw Error('Choose two straight lines, or adjacent edges of one polyline.');
    const v=sub(a.b,a.a),w=sub(b.b,b.a),den=cross(v,w);if(Math.abs(den)<EPS)throw Error('Parallel lines cannot be filleted.');
    const vertex=at(a.a,v,cross(sub(b.a,a.a),w)/den);
    function far(e,p){const dir=dot(sub(p,vertex),sub(e.b,e.a));if(Math.abs(dir)<EPS)throw Error('Click away from the corner, on the side to retain.');return [e.a,e.b].filter(q=>dot(sub(q,vertex),sub(e.b,e.a))*Math.sign(dir)>EPS).sort((x,y)=>C.distance(y,vertex)-C.distance(x,vertex))[0];}
    const endA=far(a,p1),endB=far(b,p2);if(!endA||!endB)throw Error('Cannot determine the retained sides.');
    const f=filletGeometry(vertex,endA,endB,r);
    if(!contains(a,f.t1)||!contains(b,f.t2))throw Error('Tangency falls beyond an existing line. Extend it first or change the radius.');
    return [{type:'line',layer:a.layer,a:endA,b:f.t1},{type:'line',layer:b.layer,a:f.t2,b:endB},{...f.arc,layer:a.layer}];
  }
  function filletPolyline(e,i,j,r){
    if(e.type!=='polyline'||(e.vertices[i]?.bulge||e.vertices[j]?.bulge))throw Error('Choose two straight adjacent polyline edges.');
    const n=e.vertices.length;let corner;
    if((i+1)%n===j)corner=j;else if((j+1)%n===i)corner=i;else throw Error('Choose adjacent edges of the same polyline.');
    if(!e.closed&&(corner===0||corner===n-1))throw Error('Choose an interior corner.');
    const prev=e.vertices[(corner-1+n)%n],v=e.vertices[corner],next=e.vertices[(corner+1)%n],f=filletGeometry(v,prev,next,r);
    const turn=Math.sign(cross(sub(v,prev),sub(next,v))),bulge=turn*Math.tan((Math.PI-f.angle)/4),result=structuredClone(e);
    result.vertices.splice(corner,1,{...f.t1,bulge},{...f.t2,bulge:0});
    // Reject a new arc that crosses any non-adjacent existing edge.
    const old=primitives(e);for(let k=0;k<old.length;k++)if(k!==i&&k!==j&&intersections(f.arc,old[k]).length)throw Error('The fillet would cross another edge. Reduce the radius.');
    return result;
  }
  function resizeRadius(entities,id,r,segmentIndex=null){
    if(!Number.isFinite(r)||r<=0)throw Error('Radius must be greater than zero.');
    const source=entities.find(e=>e.id===id);if(!source)throw Error('Select a circle, arc or rounded polyline corner.');
    if(source.type==='circle')return entities.map(e=>e.id===id?{...e,r}:e);
    let arc,previous,next,joinA,joinB,prevIndex,nextIndex;
    const tolerance=1e-5;
    if(source.type==='polyline'){
      const vs=source.vertices,n=vs.length,i=segmentIndex;
      if(!Number.isInteger(i)||!vs[i]?.bulge||(!source.closed&&i===n-1))throw Error('Select the rounded segment with the Radius tool.');
      if(!source.closed&&(i===0||i+1===n-1))throw Error('A rounded corner needs a straight tangent on each side.');
      prevIndex=(i-1+n)%n;nextIndex=(i+1)%n;
      if(vs[prevIndex].bulge||vs[nextIndex].bulge)throw Error('Radius editing currently requires straight tangent edges on both sides.');
      const b=C.bulgeArc(vs[i],vs[nextIndex]);let s=b.start,t=s+b.sweep;if(b.sweep<0)[s,t]=[t,s];arc={type:'arc',x:b.x,y:b.y,r:b.r,start:s*180/Math.PI,end:t*180/Math.PI};
      joinA={x:vs[i].x,y:vs[i].y};joinB={x:vs[nextIndex].x,y:vs[nextIndex].y};
      previous={type:'line',a:vs[prevIndex],b:joinA};next={type:'line',a:joinB,b:vs[(i+2)%n]};
    }else if(source.type==='arc'){
      arc=source;joinA=point(arc,0);joinB=point(arc,sweep(arc));
      const tangent=(line,p)=>{const v=sub(line.b,line.a),radial=sub(p,arc),len=Math.hypot(v.x,v.y);return Math.abs(dot(v,radial))<=Math.max(1,len*arc.r)*1e-6;};
      const touching=p=>entities.filter(e=>e.type==='line'&&(C.distance(e.a,p)<tolerance||C.distance(e.b,p)<tolerance));
      const as=touching(joinA),bs=touching(joinB);
      if(!as.length&&!bs.length){
        const attached=entities.filter(e=>e.id!==id&&e.type!=='dimension').some(e=>primitives(e).some(part=>{const ends=part.type==='line'?[part.a,part.b]:part.type==='arc'?[point(part,0),point(part,sweep(part))]:[];return ends.some(p=>C.distance(p,joinA)<tolerance||C.distance(p,joinB)<tolerance);}));
        if(attached)throw Error('The attached geometry is not two independent straight lines. Use a rounded polyline corner or explode its adjoining contour first.');
        return entities.map(e=>e.id===id?{...e,r}:e);
      }
      if(as.length!==1||bs.length!==1||as[0].id===bs[0].id||!tangent(as[0],joinA)||!tangent(bs[0],joinB))throw Error('Cannot preserve this corner: exactly one straight tangent line must meet each arc endpoint.');
      previous=as[0];next=bs[0];
    }else throw Error('Select a circle, arc or rounded polyline corner.');
    const far=(line,join)=>C.distance(line.a,join)<tolerance?line.b:line.a;
    const endA=far(previous,joinA),endB=far(next,joinB),v=sub(previous.b,previous.a),w=sub(next.b,next.a),den=cross(v,w);
    if(Math.abs(den)<EPS)throw Error('Cannot resize a fillet between parallel lines.');
    const vertex=at(previous.a,v,cross(sub(next.a,previous.a),w)/den);
    const old=filletGeometry(vertex,endA,endB,arc.r);
    if(C.distance(old.t1,joinA)>tolerance||C.distance(old.t2,joinB)>tolerance||C.distance(old.arc,arc)>tolerance)throw Error('The selected arc is not tangent to the adjoining lines.');
    const f=filletGeometry(vertex,endA,endB,r);
    if(source.type==='polyline'){
      const result=structuredClone(source),i=segmentIndex;
      result.vertices[i]={...f.t1,bulge:source.vertices[i].bulge};result.vertices[nextIndex]={...result.vertices[nextIndex],...f.t2};
      const parts=primitives(result);for(let k=0;k<parts.length;k++)if(k!==i&&k!==prevIndex&&k!==nextIndex&&intersections(f.arc,parts[k]).length)throw Error('The resized corner would cross another edge.');
      return entities.map(e=>e.id===id?result:e);
    }
    const adjusted=(line,join,tangent)=>C.distance(line.a,join)<tolerance?{...line,a:tangent}:{...line,b:tangent};
    return entities.map(e=>e.id===id?{...source,...f.arc}:e.id===previous.id?adjusted(previous,joinA,f.t1):e.id===next.id?adjusted(next,joinB,f.t2):e);
  }
  const api={primitives,intersections,offset,edit,snapCandidates,nodeHandles,moveNode,edgeHandles,dragEdge,inPickBox,filletLines,filletPolyline,resizeRadius};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CADEdit=api;
})(globalThis);

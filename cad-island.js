(function(root){
  'use strict';

  const TAU=Math.PI*2, EPS=1e-8;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const dot=(a,b,c)=>(b.x-a.x)*(c.x-a.x)+(b.y-a.y)*(c.y-a.y);
  const samePoint=(a,b,tolerance=EPS)=>distance(a,b)<=tolerance;
  const normalAngle=a=>{let r=a%(TAU);return r<0?r+TAU:r;};
  const signedDelta=a=>{a=(a+Math.PI)%TAU;if(a<0)a+=TAU;return a-Math.PI;};

  function linePiece(a,b,synthetic=false){
    return {kind:'line',a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},synthetic};
  }

  function bulgeArc(a,b,bulge){
    const chord=distance(a,b);
    if(!bulge||chord<EPS)return null;
    const offset=chord*(1-bulge*bulge)/(4*bulge);
    return {
      center:{x:(a.x+b.x)/2-(b.y-a.y)/chord*offset,y:(a.y+b.y)/2+(b.x-a.x)/chord*offset},
      r:chord*(1+bulge*bulge)/(4*Math.abs(bulge)),
      startAngle:Math.atan2(a.y-((a.y+b.y)/2+(b.x-a.x)/chord*offset),a.x-((a.x+b.x)/2-(b.y-a.y)/chord*offset)),
      sweep:4*Math.atan(bulge)
    };
  }

  function arcPiece(a,b,center,r,startAngle,sweep,synthetic=false,sourceId=null){
    return {kind:'arc',a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},center:{...center},r,startAngle,sweep,synthetic,sourceId};
  }

  function arcEndpoints(center,r,startAngle,sweep){
    const a={x:center.x+r*Math.cos(startAngle),y:center.y+r*Math.sin(startAngle)};
    const b={x:center.x+r*Math.cos(startAngle+sweep),y:center.y+r*Math.sin(startAngle+sweep)};
    return {a,b};
  }

  function primitiveSamples(piece){
    if(piece.kind==='line')return [piece.a,piece.b];
    const count=Math.max(8,Math.ceil(Math.abs(piece.sweep)*32));
    return Array.from({length:count+1},(_,i)=>{
      const a=piece.startAngle+piece.sweep*i/count;
      return {x:piece.center.x+piece.r*Math.cos(a),y:piece.center.y+piece.r*Math.sin(a)};
    });
  }

  function reversedPiece(piece){
    if(piece.kind==='line')return linePiece(piece.b,piece.a,piece.synthetic);
    return arcPiece(piece.b,piece.a,piece.center,piece.r,piece.startAngle+piece.sweep,-piece.sweep,piece.synthetic,piece.sourceId);
  }

  function primitives(entities){
    const out=[];
    const push=(piece,sourceId)=>out.push({...piece,sourceId:sourceId??piece.sourceId});
    for(const e of entities||[]){
      if(e.type==='line'){
        if(distance(e.a,e.b)>EPS)push(linePiece(e.a,e.b),e.id);
      }else if(e.type==='arc'){
        if(!(e.r>0)||!Number.isFinite(e.start)||!Number.isFinite(e.end))continue;
        const start=e.start*Math.PI/180,sweep=((e.end-e.start)*Math.PI/180%TAU+TAU)%TAU||TAU;
        const ends=arcEndpoints({x:e.x,y:e.y},e.r,start,sweep);
        push(arcPiece(ends.a,ends.b,{x:e.x,y:e.y},e.r,start,sweep),e.id);
      }else if(e.type==='circle'){
        if(!(e.r>0))continue;
        for(let i=0;i<4;i++){
          const start=i*Math.PI/2,sweep=Math.PI/2,ends=arcEndpoints({x:e.x,y:e.y},e.r,start,sweep);
          push(arcPiece(ends.a,ends.b,{x:e.x,y:e.y},e.r,start,sweep),e.id);
        }
      }else if(e.type==='polyline'&&Array.isArray(e.vertices)){
        const n=e.vertices.length,limit=e.closed?n:n-1;
        for(let i=0;i<limit;i++){
          const a=e.vertices[i],b=e.vertices[(i+1)%n];
          if(!a||!b||distance(a,b)<=EPS)continue;
          const arc=bulgeArc(a,b,a.bulge||0);
          push(arc?arcPiece(a,b,arc.center,arc.r,arc.startAngle,arc.sweep):linePiece(a,b),e.id);
        }
      }
    }
    return out;
  }

  function clusterEndpoints(items,tolerance){
    const nodes=[];
    const nodeFor=p=>{
      let best=-1,bestDistance=Infinity;
      nodes.forEach((node,i)=>{const d=distance(node.point,p);if(d<=tolerance&&d<bestDistance){best=i;bestDistance=d;}});
      if(best<0){nodes.push({point:{x:p.x,y:p.y},ends:[]});return nodes.length-1;}
      const node=nodes[best];node.ends.push(p);node.point={x:node.ends.reduce((s,q)=>s+q.x,0)/node.ends.length,y:node.ends.reduce((s,q)=>s+q.y,0)/node.ends.length};return best;
    };
    for(const item of items){item.nodeA=nodeFor(item.a);item.nodeB=nodeFor(item.b);}
    return nodes;
  }

  function directionAngle(piece){
    const ps=primitiveSamples(piece),a=ps[0],b=ps[1]||piece.b;
    return Math.atan2(b.y-a.y,b.x-a.x);
  }

  function graphFor(primitiveList,tolerance){
    const edges=primitiveList.filter(p=>distance(p.a,p.b)>EPS).map(p=>({...p}));
    const nodes=clusterEndpoints(edges,tolerance),halfEdges=[],outgoing=nodes.map(()=>[]);
    edges.forEach((edge,index)=>{
      if(edge.nodeA===edge.nodeB)return;
      const forward={edgeIndex:index,from:edge.nodeA,to:edge.nodeB,reversed:false,piece:edge};
      const backward={edgeIndex:index,from:edge.nodeB,to:edge.nodeA,reversed:true,piece:reversedPiece(edge)};
      forward.twin=halfEdges.length+1;backward.twin=halfEdges.length;
      const fi=halfEdges.push(forward)-1,bi=halfEdges.push(backward)-1;
      outgoing[forward.from].push(fi);outgoing[backward.from].push(bi);
    });
    outgoing.forEach(list=>list.sort((a,b)=>directionAngle(halfEdges[a].piece)-directionAngle(halfEdges[b].piece)));
    const next=new Array(halfEdges.length);
    halfEdges.forEach((h,index)=>{
      const list=outgoing[h.to],reverseIndex=list.indexOf(h.twin);
      next[index]=reverseIndex<0?undefined:list[(reverseIndex-1+list.length)%list.length];
    });
    return {edges,nodes,halfEdges,outgoing,next};
  }

  function cyclePieces(graph,cycle){
    if(!cycle.length)return [];
    const pieces=[];let previous=null;
    for(const index of cycle){
      const piece=graph.halfEdges[index].piece;
      if(previous&&distance(previous,piece.a)>EPS)pieces.push(linePiece(previous,piece.a,true));
      pieces.push(piece);previous=piece.b;
    }
    const first=graph.halfEdges[cycle[0]].piece.a;
    if(previous&&distance(previous,first)>EPS)pieces.push(linePiece(previous,first,true));
    return pieces;
  }

  function samplePieces(pieces){
    const out=[];
    pieces.forEach((piece,i)=>{
      const ps=primitiveSamples(piece);
      if(i&&ps.length)ps.shift();
      out.push(...ps);
    });
    if(out.length>1&&samePoint(out[0],out.at(-1),1e-7))out.pop();
    return out;
  }

  function polygonArea(points){let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;}return area/2;}

  function pointOnSegment(p,a,b,tolerance){
    if(distance(a,b)<EPS)return distance(p,a)<=tolerance;
    const d=Math.abs(cross(a,b,p))/distance(a,b),along=dot(a,b,p);
    return d<=tolerance&&along>=-tolerance&&along<=distance(a,b)**2+tolerance;
  }

  function pointInPolygon(point,points,tolerance=1e-7){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if(pointOnSegment(point,a,b,tolerance))return true;
      if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  }

  function traverseCycles(graph){
    const visited=new Set(),cycles=[];
    for(let start=0;start<graph.halfEdges.length;start++){
      if(visited.has(start))continue;
      const local=new Set(),cycle=[];let current=start;
      while(current!==undefined&&!local.has(current)&&cycle.length<=graph.halfEdges.length+1){
        if(visited.has(current)&&current!==start)break;
        local.add(current);cycle.push(current);current=graph.next[current];
      }
      cycle.forEach(i=>visited.add(i));
      if(current===start&&cycle.length>=3)cycles.push(cycle);
    }
    return cycles;
  }

  function solve3(matrix,vector){
    const a=matrix.map((row,i)=>[...row,vector[i]]);
    for(let col=0;col<3;col++){
      let pivot=col;for(let row=col+1;row<3;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
      if(Math.abs(a[pivot][col])<1e-12)return null;
      [a[col],a[pivot]]=[a[pivot],a[col]];
      const factor=a[col][col];for(let j=col;j<4;j++)a[col][j]/=factor;
      for(let row=0;row<3;row++)if(row!==col){const f=a[row][col];for(let j=col;j<4;j++)a[row][j]-=f*a[col][j];}
    }
    return a.map(row=>row[3]);
  }

  function fitArc(points,tolerance){
    if(points.length<4)return null;
    let turnSign=0,totalTurn=0;
    for(let i=1;i<points.length-1;i++){
      const u={x:points[i].x-points[i-1].x,y:points[i].y-points[i-1].y},v={x:points[i+1].x-points[i].x,y:points[i+1].y-points[i].y};
      const lu=Math.hypot(u.x,u.y),lv=Math.hypot(v.x,v.y);if(lu<EPS||lv<EPS)return null;
      const turn=Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y);
      if(Math.abs(turn)>Math.PI/3)return null;
      if(Math.abs(turn)>1e-4){const sign=Math.sign(turn);if(turnSign&&sign!==turnSign)return null;turnSign=sign;totalTurn+=turn;}
    }
    if(Math.abs(totalTurn)<0.12)return null;
    let sx=0,sy=0,sxx=0,syy=0,sxy=0,sr=0,sxr=0,syr=0;
    for(const p of points){const r=p.x*p.x+p.y*p.y;sx+=p.x;sy+=p.y;sxx+=p.x*p.x;syy+=p.y*p.y;sxy+=p.x*p.y;sr+=r;sxr+=p.x*r;syr+=p.y*r;}
    const n=points.length,solution=solve3([[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,n]],[sxr,syr,sr]);
    if(!solution)return null;
    const center={x:solution[0]/2,y:solution[1]/2},r2=solution[2]+center.x*center.x+center.y*center.y,r=Math.sqrt(r2);
    if(!(r>EPS)||!Number.isFinite(r))return null;
    const residual=Math.max(...points.map(p=>Math.abs(distance(p,center)-r)));if(residual>tolerance)return null;
    const angles=points.map(p=>Math.atan2(p.y-center.y,p.x-center.x));let sweep=0;
    for(let i=1;i<angles.length;i++)sweep+=signedDelta(angles[i]-angles[i-1]);
    if(Math.abs(sweep)<0.12||Math.abs(sweep)>Math.PI*1.95)return null;
    return {kind:'arc',a:points[0],b:points.at(-1),center,r,startAngle:angles[0],sweep,synthetic:false,fit:true};
  }

  function compressLineRuns(pieces,arcTolerance){
    const out=[];let i=0;
    while(i<pieces.length){
      const p=pieces[i];
      if(p.kind!=='line'||p.synthetic){out.push(p);i++;continue;}
      let j=i;while(j+1<pieces.length&&pieces[j+1].kind==='line'&&!pieces[j+1].synthetic)j++;
      const run=pieces.slice(i,j+1);let start=0,turnSign=0;
      const flush=end=>{
        const section=run.slice(start,end),points=[section[0].a,...section.map(x=>x.b)],arc=fitArc(points,arcTolerance);
        if(arc)out.push(arc);else out.push(...section);
        start=end;turnSign=0;
      };
      for(let k=1;k<run.length;k++){
        const a=run[k-1],b=run[k],u={x:a.b.x-a.a.x,y:a.b.y-a.a.y},v={x:b.b.x-b.a.x,y:b.b.y-b.a.y};
        const turn=Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y),sign=Math.sign(turn);
        if(Math.abs(turn)>Math.PI/3||(sign&&turnSign&&sign!==turnSign)){flush(k);}
        else if(sign)turnSign=sign;
      }
      flush(run.length);
      i=j+1;
    }
    return out;
  }

  function cleanPieces(pieces,tolerance){
    const filtered=pieces.filter(p=>distance(p.a,p.b)>Math.max(EPS,tolerance*1e-5));
    if(!filtered.length)return [];
    const out=[];
    for(const piece of filtered){
      const previous=out.at(-1);
      if(previous&&piece.kind==='line'&&previous.kind==='line'&&!previous.synthetic&&!piece.synthetic&&Math.abs(cross(previous.a,previous.b,piece.b))<=Math.max(1e-7,tolerance*1e-4)&&dot(previous.a,previous.b,piece.b)>0){
        previous.b={...piece.b};
      }else out.push({...piece});
    }
    if(out.length>1&&out[0].kind==='line'&&out.at(-1).kind==='line'&&!out[0].synthetic&&!out.at(-1).synthetic&&Math.abs(cross(out.at(-1).a,out.at(-1).b,out[0].b))<=Math.max(1e-7,tolerance*1e-4)&&dot(out.at(-1).a,out.at(-1).b,out[0].b)>0){out[0].a={...out.at(-1).a};out.pop();}
    return out;
  }

  function piecesToPolyline(pieces){
    if(pieces.length<3)return null;
    const vertices=pieces.map(piece=>({x:piece.a.x,y:piece.a.y,bulge:piece.kind==='arc'?Math.tan(piece.sweep/4):0}));
    if(vertices.length<3)return null;
    vertices.forEach(v=>{if(Math.abs(v.bulge)<1e-10)v.bulge=0;});
    return {type:'polyline',closed:true,vertices};
  }

  function candidateFromCycle(graph,cycle){
    const pieces=cyclePieces(graph,cycle),sample=samplePieces(pieces),area=polygonArea(sample);
    if(sample.length<3||Math.abs(area)<1e-7)return null;
    const key=[...new Set(cycle.map(index=>graph.halfEdges[index].edgeIndex))].sort((a,b)=>a-b).join(',');
    return {pieces,sample,area,key};
  }

  function candidatesFor(entities,point,tolerance){
    return candidatesFromPrimitives(primitives(entities),tolerance);
  }

  function candidatesFromPrimitives(list,tolerance){
    const graph=graphFor(list,tolerance),candidates=[],keys=new Set();
    for(const cycle of traverseCycles(graph)){
      const candidate=candidateFromCycle(graph,cycle);if(!candidate||keys.has(candidate.key))continue;
      keys.add(candidate.key);candidates.push(candidate);
    }
    return {candidates,graph};
  }

  function repairOpenEnds(list,tolerance){
    const graph=graphFor(list,tolerance),degree=graph.nodes.map(()=>0);
    graph.edges.forEach(edge=>{if(edge.nodeA!==edge.nodeB){degree[edge.nodeA]++;degree[edge.nodeB]++;}});
    const open=degree.map((count,index)=>count===1?index:-1).filter(index=>index>=0),repaired=list.map(piece=>({...piece}));
    // If the boundary is open or split into several close fragments, pair the
    // nearest dangling endpoints. These connectors are intentionally marked
    // synthetic so they are never mistaken for true source arcs during fit.
    while(open.length>=2){
      let ai=0,bi=1,best=Infinity;
      for(let i=0;i<open.length;i++)for(let j=i+1;j<open.length;j++){
        const d=distance(graph.nodes[open[i]].point,graph.nodes[open[j]].point);
        if(d<best){best=d;ai=i;bi=j;}
      }
      const a=graph.nodes[open[ai]].point,b=graph.nodes[open[bi]].point;
      if(distance(a,b)>EPS)repaired.push(linePiece(a,b,true));
      open.splice(bi,1);open.splice(ai,1);
    }
    return repaired;
  }

  function chooseCandidate(candidates,point){
    return candidates.filter(c=>pointInPolygon(point,c.sample,1e-6)).sort((a,b)=>Math.abs(a.area)-Math.abs(b.area))[0]||null;
  }

  function createIslandPolyline(entities,point,options={}){
    const gapTolerance=Math.max(0,Number(options.gapTolerance??5)||0),arcTolerance=Math.max(.01,Number(options.arcTolerance??Math.max(.25,gapTolerance*.1))||.25);
    let result=candidatesFor(entities,point,gapTolerance),candidate=chooseCandidate(result.candidates,point),usedTolerance=gapTolerance;
    // A second, deliberately conservative repair pass makes imported drawings
    // with chained endpoint errors usable without changing the user's setting.
    if(!candidate&&gapTolerance>0){usedTolerance=gapTolerance*2;result=candidatesFor(entities,point,usedTolerance);candidate=chooseCandidate(result.candidates,point);}
    if(!candidate){
      const repairedList=repairOpenEnds(primitives(entities),usedTolerance);
      result=candidatesFromPrimitives(repairedList,usedTolerance);
      candidate=chooseCandidate(result.candidates,point);
      if(!candidate&&result.candidates.length)candidate=result.candidates.slice().sort((a,b)=>Math.abs(a.area)-Math.abs(b.area))[0];
      if(candidate)usedTolerance=Math.max(usedTolerance,gapTolerance);
    }
    if(!candidate&&result.candidates.length){
      candidate=result.candidates.slice().sort((a,b)=>Math.abs(a.area)-Math.abs(b.area))[0];
    }
    if(!candidate)return null;
    const pieces=cleanPieces(compressLineRuns(candidate.pieces,arcTolerance),Math.max(gapTolerance,1e-6));
    const polyline=piecesToPolyline(pieces);if(!polyline)return null;
    return {polyline,repaired:usedTolerance>gapTolerance||pieces.some(p=>p.synthetic),gapTolerance:usedTolerance,area:Math.abs(candidate.area)};
  }

  const api={createIslandPolyline,fitArc,primitives,pointInPolygon,polygonArea};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CADIsland=api;
})(typeof globalThis!=='undefined'?globalThis:this);

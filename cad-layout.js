(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./cad-core.js'):root.CAD;
  const S=typeof module!=='undefined'&&module.exports?require('./cad-selection.js'):root.CADSelection;
  const rad=d=>d*Math.PI/180;
  function bounds(es){const ps=es.flatMap(S.extentPoints);if(!ps.length)throw Error('No geometry to arrange.');return {minX:Math.min(...ps.map(p=>p.x)),maxX:Math.max(...ps.map(p=>p.x)),minY:Math.min(...ps.map(p=>p.y)),maxY:Math.max(...ps.map(p=>p.y))};}
  function rotatePoint(p,pivot,angle){const c=Math.cos(angle),s=Math.sin(angle),dx=p.x-pivot.x,dy=p.y-pivot.y;return {x:pivot.x+dx*c-dy*s,y:pivot.y+dx*s+dy*c};}
  function rotateEntity(e,pivot,angle){
    const n=structuredClone(e),move=p=>rotatePoint(p,pivot,angle);
    if(n.type==='line'||n.type==='dimension'){n.a=move(n.a);n.b=move(n.b);}
    else if(n.type==='polyline')n.vertices=n.vertices.map(v=>({...move(v),bulge:v.bulge||0}));
    else if(n.type==='circle'){const p=move(n);n.x=p.x;n.y=p.y;}
    else if(n.type==='arc'){const p=move(n);n.x=p.x;n.y=p.y;n.start+=angle*180/Math.PI;n.end+=angle*180/Math.PI;}
    else if(n.type==='text'){const p=move(n);n.x=p.x;n.y=p.y;n.rotation=(n.rotation||0)+angle*180/Math.PI;}
    return n;
  }
  function translated(unit,dx,dy){return unit.map(e=>C.translate(e,dx,dy));}
  function candidate(unit,angle){
    const b=bounds(unit),pivot={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2};
    const rotated=angle?unit.map(e=>rotateEntity(e,pivot,angle)):structuredClone(unit),r=bounds(rotated);
    return {entities:rotated,bounds:r,width:r.maxX-r.minX,height:r.maxY-r.minY,angle:angle*180/Math.PI};
  }
  function arrangeMulti(entities,ids,sheet){
    const {width,height,margin,gap,sheetGap=100,rotate=true}=sheet;
    if(![width,height,margin,gap,sheetGap].every(Number.isFinite)||width<=0||height<=0||margin<0||gap<0||sheetGap<0||width<=2*margin||height<=2*margin)throw Error('Enter valid sheet dimensions, margin, spacing and sheet gap.');
    const chosen=S.expand(entities,ids);if(!chosen.size)throw Error('Select parts to arrange. Group each outline and its cutouts first.');
    const units=new Map();for(const e of entities.filter(e=>chosen.has(e.id))){const key=e.groupId?'g:'+e.groupId:'e:'+e.id;if(!units.has(key))units.set(key,[]);units.get(key).push(e);}
    const usableW=width-2*margin,usableH=height-2*margin,changes=new Map(),placed=[];let sheetIndex=0,x=margin,top=height-margin,rowHeight=0;
    const sheets=[{index:0,x:0,y:0,width,height}];
    function newSheet(){sheetIndex++;sheets.push({index:sheetIndex,x:0,y:sheetIndex*(height+sheetGap),width,height});x=margin;top=height-margin;rowHeight=0;}
    for(const unit of units.values()){
      const options=(rotate?[0,90]:[0]).map(deg=>candidate(unit,rad(deg))),valid=options.filter(o=>o.width<=usableW+1e-7&&o.height<=usableH+1e-7);
      if(!valid.length)throw Error('A selected part is larger than the usable sheet, even after rotation. Nothing was moved.');
      let fits=valid.filter(o=>x+o.width<=width-margin+1e-7&&top-o.height>=margin-1e-7);
      if(!fits.length){x=margin;top-=rowHeight+gap;rowHeight=0;fits=valid.filter(o=>x+o.width<=width-margin+1e-7&&top-o.height>=margin-1e-7);}
      if(!fits.length){newSheet();fits=valid.filter(o=>x+o.width<=width-margin+1e-7&&top-o.height>=margin-1e-7);}
      if(!fits.length)throw Error('A selected part could not be placed on a new sheet. Nothing was moved.');
      const chosenOption=fits.sort((a,b)=>(a.height+Math.max(0,a.width-(width-margin-x)))-(b.height+Math.max(0,b.width-(width-margin-x))))[0];
      const localY=top-chosenOption.height,originY=sheets[sheetIndex].y,dx=x-chosenOption.bounds.minX,dy=originY+localY-chosenOption.bounds.minY;
      for(const e of translated(chosenOption.entities,dx,dy))changes.set(e.id,e);
      placed.push({sheet:sheetIndex,minX:x,minY:originY+localY,maxX:x+chosenOption.width,maxY:originY+top,angle:chosenOption.angle});x+=chosenOption.width+gap;rowHeight=Math.max(rowHeight,chosenOption.height);
    }
    return {entities:entities.map(e=>changes.get(e.id)||e),sheets,placed};
  }
  function stockDefinitions(sheet){
    const base={width:Number(sheet.width),height:Number(sheet.height),margin:Number(sheet.margin),gap:Number(sheet.gap)};
    const source=Array.isArray(sheet.stocks)&&sheet.stocks.length?sheet.stocks:[{...base,quantity:Infinity,name:'Sheet'}];
    const defs=source.map((raw,index)=>({width:Number(raw.width),height:Number(raw.height),margin:Number(raw.margin??base.margin),gap:Number(raw.gap??base.gap),quantity:raw.quantity===Infinity?Infinity:Math.floor(Number(raw.quantity)),name:String(raw.name||('Sheet '+(index+1))),index}));
    if(!defs.length||defs.some(s=>!Number.isFinite(s.width)||!Number.isFinite(s.height)||!Number.isFinite(s.margin)||!Number.isFinite(s.gap)||s.width<=0||s.height<=0||s.margin<0||s.gap<0||s.width<=2*s.margin||s.height<=2*s.margin||!(s.quantity===Infinity||(Number.isFinite(s.quantity)&&s.quantity>=0))))throw Error('Enter valid sheet sizes, margins, spacing and quantities.');
    return defs;
  }
  function arrangeMultiOptimized(entities,ids,sheet){
    const sheetGap=Number(sheet.sheetGap??100),rotate=sheet.rotate!==false;
    if(!Number.isFinite(sheetGap)||sheetGap<0)throw Error('Enter valid sheet dimensions, margin, spacing and sheet gap.');
    const chosen=S.expand(entities,ids);if(!chosen.size)throw Error('Select parts to arrange. Group each outline with its cutouts first.');
    const defs=stockDefinitions(sheet),units=new Map();for(const e of entities.filter(e=>chosen.has(e.id))){const key=e.groupId?'g:'+e.groupId:'e:'+e.id;if(!units.has(key))units.set(key,[]);units.get(key).push(e);}
    const ordered=[...units.values()].sort((a,b)=>{const ba=bounds(a),bb=bounds(b);return (bb.maxX-bb.minX)*(bb.maxY-bb.minY)-(ba.maxX-ba.minX)*(ba.maxY-ba.minY);});
    const changes=new Map(),placed=[],states=[],usedCounts=defs.map(()=>0),EPS=1e-7;
    function makeState(def){const last=states.at(-1);return {index:states.length,x:0,y:last?last.y+last.height+sheetGap:0,width:def.width,height:def.height,margin:def.margin,gap:def.gap,stockIndex:def.index,stockName:def.name,cursor:def.margin,top:def.height-def.margin,rowHeight:0,usedArea:0,placedCount:0};}
    function placement(state,option){
      const right=state.width-state.margin;
      const current=state.cursor+option.width<=right+EPS&&state.top-option.height>=state.margin-EPS?{x:state.cursor,top:state.top,newRow:false}:null;
      const nextTop=state.placedCount?state.top-state.rowHeight-state.gap:state.top;
      const next=state.placedCount&&state.margin+option.width<=right+EPS&&nextTop-option.height>=state.margin-EPS?{x:state.margin,top:nextTop,newRow:true}:null;
      if(!current&&!next)return null;if(!current)return next;if(!next)return current;
      return (right-(current.x+option.width))<(right-(next.x+option.width))?current:next;
    }
    function available(){return defs.filter((def,i)=>def.quantity===Infinity||usedCounts[i]<def.quantity);}
    function stateScore(state,option,slot){return [state.width*state.height-(state.usedArea+option.width*option.height),slot.newRow?1:0,state.index];}
    for(const unit of ordered){
      const options=(rotate?[0,90]:[0]).map(deg=>candidate(unit,rad(deg))),candidates=[];
      for(const state of states)for(const option of options){const slot=placement(state,option);if(slot)candidates.push({state,option,slot,score:stateScore(state,option,slot)});}
      for(const def of available()){const virtual=makeState(def);for(const option of options){const slot=placement(virtual,option);if(slot)candidates.push({state:null,def,option,slot,score:stateScore(virtual,option,slot)});}}
      if(!candidates.length)throw Error('A selected part is larger than the available sheet sizes, even after rotation. Nothing was moved.');
      candidates.sort((a,b)=>a.score[0]-b.score[0]||a.score[1]-b.score[1]||a.score[2]-b.score[2]);const best=candidates[0];
      let state=best.state;if(!state){state=makeState(best.def);states.push(state);usedCounts[best.def.index]++;best.slot=placement(state,best.option);}
      const localY=best.slot.top-best.option.height,dx=best.slot.x-best.option.bounds.minX,dy=state.y+localY-best.option.bounds.minY;
      for(const e of translated(best.option.entities,dx,dy))changes.set(e.id,e);
      placed.push({sheet:state.index,minX:best.slot.x,minY:state.y+localY,maxX:best.slot.x+best.option.width,maxY:state.y+best.slot.top,angle:best.option.angle});
      state.cursor=best.slot.x+best.option.width+state.gap;state.rowHeight=best.slot.newRow?best.option.height:Math.max(state.rowHeight,best.option.height);if(best.slot.newRow)state.top=best.slot.top;state.usedArea+=best.option.width*best.option.height;state.placedCount++;
    }
    const sheets=states.map(state=>({index:state.index,x:0,y:state.y,width:state.width,height:state.height,margin:state.margin,gap:state.gap,stockIndex:state.stockIndex,stockName:state.stockName}));
    return {entities:entities.map(e=>changes.get(e.id)||e),sheets,placed};
  }
  function arrange(entities,ids,sheet){
    const result=arrangeMultiOptimized(entities,ids,sheet),chosen=S.expand(entities,ids),gap=sheet.gap;
    for(const e of entities.filter(e=>!chosen.has(e.id)&&!['text','dimension'].includes(e.type))){const b=bounds([e]);if(result.placed.some(p=>p.minX<b.maxX+gap&&p.maxX+gap>b.minX&&p.minY<b.maxY+gap&&p.maxY+gap>b.minY))throw Error('Arranged parts would overlap unselected geometry. Move it away or include it in the selection.');}
    return result.entities;
  }
  function snapTranslation(entities,ids,dx,dy,sheet,sheets,tolerance=50){
    const chosen=S.expand(entities,ids),moving=entities.filter(e=>chosen.has(e.id)&&!['text','dimension'].includes(e.type));if(!moving.length)return {dx,dy};
    const b=bounds(moving),gap=sheet.gap,others=entities.filter(e=>!chosen.has(e.id)&&!['text','dimension'].includes(e.type)),xs=[],ys=[];
    for(const sh of sheets||[{x:0,y:0,width:sheet.width,height:sheet.height}]){
      xs.push(sh.x+sheet.margin-b.minX,sh.x+sh.width-sheet.margin-b.maxX);
      ys.push(sh.y+sheet.margin-b.minY,sh.y+sh.height-sheet.margin-b.maxY);
    }
    for(const e of others){const o=bounds([e]);xs.push(o.minX-gap-b.maxX,o.maxX+gap-b.minX);ys.push(o.minY-gap-b.maxY,o.maxY+gap-b.minY);}
    const nearest=(value,list)=>{let best=value,distance=tolerance;for(const candidate of list){const d=Math.abs(candidate-value);if(d<distance){distance=d;best=candidate;}}return best;};
    return {dx:nearest(dx,xs),dy:nearest(dy,ys)};
  }
  const api={arrange,arrangeMulti:arrangeMultiOptimized,arrangeMultiLegacy:arrangeMulti,bounds,rotateEntity,snapTranslation};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CADLayout=api;
})(globalThis);

(function(root){
  'use strict';
  const TAU=Math.PI*2, rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function trackSnap(raw,base,nodes,tolerance){const point={...base},guides=[];for(const axis of ['x','y']){let best=tolerance,node=null;for(const n of nodes){const d=Math.abs(raw[axis]-n[axis]);if(d<best){best=d;node=n;}}if(node){point[axis]=node[axis];guides.push({axis,node:{x:node.x,y:node.y}});}}return {point,guides};}
  function angleSnap(origin,p,step=10){const length=distance(origin,p),angle=Math.atan2(p.y-origin.y,p.x-origin.x),increment=rad(step);const snapped=Math.round(angle/increment)*increment;return {x:origin.x+length*Math.cos(snapped),y:origin.y+length*Math.sin(snapped)};}
  function dimension(e){
    const length=distance(e.a,e.b),u={x:(e.b.x-e.a.x)/length,y:(e.b.y-e.a.y)/length},n={x:-u.y,y:u.x};
    if(e.mode==='radius'||e.mode==='diameter'){
      const opposite={x:e.a.x-u.x*length,y:e.a.y-u.y*length},a=e.mode==='diameter'?opposite:e.a,b=e.b,text={x:b.x+u.x*e.offset,y:b.y+u.y*e.offset},size=Math.min(10,length/5),lines=[[a,b],[b,text]];
      const tips=e.mode==='diameter'?[[a,1],[b,-1]]:[[b,-1]];for(const [tip,sign]of tips)for(const side of [-1,1])lines.push([tip,{x:tip.x+u.x*size*sign+n.x*size*.35*side,y:tip.y+u.y*size*sign+n.y*size*.35*side}]);
      return{a,b,text,lines,length:length*(e.mode==='diameter'?2:1),label:(e.mode==='diameter'?'Ø ':'R ')+Number((length*(e.mode==='diameter'?2:1)).toFixed(2))+' mm'};
    }
    const a={x:e.a.x+n.x*e.offset,y:e.a.y+n.y*e.offset},b={x:e.b.x+n.x*e.offset,y:e.b.y+n.y*e.offset};
    const size=Math.min(10,length/5),lines=[[e.a,a],[a,b],[e.b,b]];
    for(const [tip,sign] of [[a,1],[b,-1]])for(const side of [-1,1])lines.push([tip,{x:tip.x+u.x*size*sign+n.x*size*.35*side,y:tip.y+u.y*size*sign+n.y*size*.35*side}]);
    return {a,b,length,lines,text:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},label:Number(length.toFixed(2))+' mm'};
  }
  function bulgeArc(a,b){
    const bulge=a.bulge||0,chord=distance(a,b); if(!bulge||chord<1e-10)return null;
    const offset=chord*(1-bulge*bulge)/(4*bulge);
    const center={x:(a.x+b.x)/2-(b.y-a.y)/chord*offset,y:(a.y+b.y)/2+(b.x-a.x)/chord*offset};
    return {...center,r:chord*(1+bulge*bulge)/(4*Math.abs(bulge)),start:Math.atan2(a.y-center.y,a.x-center.x),sweep:4*Math.atan(bulge)};
  }
  function sweepOf(e){return ((rad(e.end-e.start)%TAU)+TAU)%TAU||TAU;}
  function textBox(e){
    const angle=rad(e.rotation||0),lines=e.text.split('\n'),w=Math.max(1,...lines.map(line=>[...line].length))*e.height*.62,h=e.height,bottom=-h*.2-(lines.length-1)*h*1.4;
    return [[0,bottom],[w,bottom],[w,h],[0,h],[0,bottom]].map(([x,y])=>({x:e.x+x*Math.cos(angle)-y*Math.sin(angle),y:e.y+x*Math.sin(angle)+y*Math.cos(angle)}));
  }
  function textContains(e,p){const a=rad(-(e.rotation||0)),dx=p.x-e.x,dy=p.y-e.y,x=dx*Math.cos(a)-dy*Math.sin(a),y=dx*Math.sin(a)+dy*Math.cos(a);return x>=0&&x<=Math.max(1,...e.text.split('\n').map(line=>[...line].length))*e.height*.62&&y>=-e.height*.2-(e.text.split('\n').length-1)*e.height*1.4&&y<=e.height;}
  function points(e){
    if(e.type==='text')return textBox(e);
    if(e.type==='dimension')return dimension(e).lines.flat();
    if(e.type==='line')return [e.a,e.b];
    if(e.type==='circle'||e.type==='arc'){
      const start=e.type==='circle'?0:rad(e.start),sweep=e.type==='circle'?TAU:sweepOf(e),steps=Math.max(16,Math.ceil(sweep*48));
      return Array.from({length:steps+1},(_,i)=>({x:e.x+e.r*Math.cos(start+sweep*i/steps),y:e.y+e.r*Math.sin(start+sweep*i/steps)}));
    }
    const out=[];
    e.vertices.forEach((v,i)=>{out.push(v); const next=e.vertices[(i+1)%e.vertices.length];if(i===e.vertices.length-1&&!e.closed)return;
      const arc=bulgeArc(v,next);if(arc){const n=Math.ceil(Math.abs(arc.sweep)*48);for(let j=1;j<n;j++){const t=arc.start+arc.sweep*j/n;out.push({x:arc.x+arc.r*Math.cos(t),y:arc.y+arc.r*Math.sin(t)});}}
    });if(e.closed&&out.length)out.push(out[0]);return out;
  }
  function bounds(entities){
    if(!entities.length)return null;const b={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    for(const e of entities){let p=points(e);if(e.type==='circle')p=[{x:e.x-e.r,y:e.y-e.r},{x:e.x+e.r,y:e.y+e.r}];for(const v of p){b.minX=Math.min(b.minX,v.x);b.minY=Math.min(b.minY,v.y);b.maxX=Math.max(b.maxX,v.x);b.maxY=Math.max(b.maxY,v.y);}}return b;
  }
  function translate(e,dx,dy){const n=structuredClone(e);if(n.type==='line'||n.type==='dimension'){n.a.x+=dx;n.a.y+=dy;n.b.x+=dx;n.b.y+=dy;}else if(n.vertices){n.vertices.forEach(p=>{p.x+=dx;p.y+=dy;});}else{n.x+=dx;n.y+=dy;}return n;}
  function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)||0));return distance(p,{x:a.x+t*dx,y:a.y+t*dy});}
  function hitDistance(e,p){if(e.type==='text'&&textContains(e,p))return 0;if(e.type==='dimension')return Math.min(...dimension(e).lines.map(([a,b])=>segmentDistance(p,a,b)));if(e.type==='circle')return Math.abs(distance(e,p)-e.r);const ps=points(e);let d=Infinity;for(let i=1;i<ps.length;i++)d=Math.min(d,segmentDistance(p,ps[i-1],ps[i]));return d;}
  function anchors(e){if(e.type==='text')return [{x:e.x,y:e.y}];if(e.type==='line'||e.type==='dimension')return [e.a,e.b];if(e.vertices)return e.vertices;if(e.type==='circle')return [{x:e.x,y:e.y},{x:e.x+e.r,y:e.y},{x:e.x-e.r,y:e.y},{x:e.x,y:e.y+e.r},{x:e.x,y:e.y-e.r}];return [{x:e.x,y:e.y},points(e)[0],points(e).at(-1)];}
  const unitFactors={0:1,1:25.4,2:304.8,4:1,5:10,6:1000,7:1e6,8:0.0000254,9:0.0254,10:914.4,11:1e-7,12:1e-6,13:.001,14:100,15:10000,16:100000,17:1e12,18:1.495978707e14,19:9.4607304725808e18,20:3.085677581491367e19,21:1200000/3937,22:100000/3937,23:3600000/3937,24:6336000000/3937,3:1609344};
  const aciPalette={1:'#ff0000',2:'#ffff00',3:'#00ff00',4:'#00ffff',5:'#0000ff',6:'#ff00ff',7:'#ffffff',8:'#808080',9:'#c0c0c0',10:'#ff0000',11:'#ff7f7f',12:'#a50000',13:'#a55050',14:'#bf00bf',15:'#bf7fbf',16:'#a50000',17:'#a50050',18:'#a500a5',19:'#a500ff',20:'#5000ff',21:'#7f7fff',22:'#0050ff',23:'#007fff',24:'#00a5ff',25:'#00bfff',26:'#00a500',27:'#50ff50',28:'#00a500',29:'#50a550',30:'#00a500',31:'#50a550',32:'#00a500',33:'#50a550',34:'#00a500',35:'#50a550',36:'#00a500',37:'#50a550',38:'#00a500',39:'#50a550',40:'#00a500',41:'#50a550',42:'#00a500',43:'#50a550',44:'#00a500',45:'#50a550',46:'#00a500',47:'#50a550',48:'#00a500',49:'#50a550',50:'#00a500',51:'#50a550',52:'#00a500',53:'#50a550',54:'#00a500',55:'#50a550',56:'#00a500',57:'#50a550',58:'#00a500',59:'#50a550',60:'#00a500',61:'#50a550',62:'#00a500',63:'#50a550',64:'#00a500',65:'#50a550',66:'#00a500',67:'#50a550',68:'#00a500',69:'#50a550',70:'#00a500',71:'#50a550',72:'#00a500',73:'#50a550',74:'#00a500',75:'#50a550',76:'#00a500',77:'#50a550',78:'#00a500',79:'#50a550',80:'#00a500',81:'#50a550',82:'#00a500',83:'#50a550',84:'#00a500',85:'#50a550',86:'#00a500',87:'#50a550',88:'#00a500',89:'#50a550',90:'#00a500',91:'#50a550',92:'#00a500',93:'#50a550',94:'#00a500',95:'#50a550',96:'#00a500',97:'#50a550',98:'#00a500',99:'#50a550',100:'#00a500',101:'#50a550',102:'#00a500',103:'#50a550',104:'#00a500',105:'#50a550',106:'#00a500',107:'#50a550',108:'#00a500',109:'#50a550',110:'#00a500',111:'#50a550',112:'#00a500',113:'#50a550',114:'#00a500',115:'#50a550',116:'#00a500',117:'#50a550',118:'#00a500',119:'#50a550',120:'#00a500',121:'#50a550',122:'#00a500',123:'#50a550',124:'#00a500',125:'#50a550',126:'#00a500',127:'#50a550',128:'#00a500',129:'#50a550',130:'#00a500',131:'#50a550',132:'#00a500',133:'#50a550',134:'#00a500',135:'#50a550',136:'#00a500',137:'#50a550',138:'#00a500',139:'#50a550',140:'#00a500',141:'#50a550',142:'#00a500',143:'#50a550',144:'#00a500',145:'#50a550',146:'#00a500',147:'#50a550',148:'#00a500',149:'#50a550',150:'#00a500',151:'#50a550',152:'#00a500',153:'#50a550',154:'#00a500',155:'#50a550',156:'#00a500',157:'#50a550',158:'#00a500',159:'#50a550',160:'#00a500',161:'#50a550',162:'#00a500',163:'#50a550',164:'#00a500',165:'#50a550',166:'#00a500',167:'#50a550',168:'#00a500',169:'#50a550',170:'#00a500',171:'#50a550',172:'#00a500',173:'#50a550',174:'#00a500',175:'#50a550',176:'#00a500',177:'#50a550',178:'#00a500',179:'#50a550',180:'#00a500',181:'#50a550',182:'#00a500',183:'#50a550',184:'#00a500',185:'#50a550',186:'#00a500',187:'#50a550',188:'#00a500',189:'#50a550',190:'#00a500',191:'#50a550',192:'#00a500',193:'#50a550',194:'#00a500',195:'#50a550',196:'#00a500',197:'#50a550',198:'#00a500',199:'#50a550',200:'#00a500',201:'#50a550',202:'#00a500',203:'#50a550',204:'#00a500',205:'#50a550',206:'#00a500',207:'#50a550',208:'#00a500',209:'#50a550',210:'#00a500',211:'#50a550',212:'#00a500',213:'#50a550',214:'#00a500',215:'#50a550',216:'#00a500',217:'#50a550',218:'#00a500',219:'#50a550',220:'#00a500',221:'#50a550',222:'#00a500',223:'#50a550',224:'#00a500',225:'#50a550',226:'#00a500',227:'#50a550',228:'#00a500',229:'#50a550',230:'#00a500',231:'#50a550',232:'#00a500',233:'#50a550',234:'#00a500',235:'#50a550',236:'#00a500',237:'#50a550',238:'#00a500',239:'#50a550',240:'#00a500',241:'#50a550',242:'#00a500',243:'#50a550',244:'#00a500',245:'#50a550',246:'#00a500',247:'#50a550',248:'#00a500',249:'#50a550',250:'#00a500',251:'#50a550',252:'#00a500',253:'#50a550',254:'#00a500',255:'#ffffff'};
  const trueColor=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?('#'+Math.round(n).toString(16).padStart(6,'0').slice(-6)):null;};
  const aciColor=v=>{const n=Math.abs(Math.trunc(Number(v)));return n>0&&n<256?aciPalette[n]||null:null;};
  function parseDXF(text){
    if(text.startsWith('AutoCAD Binary DXF'))throw Error('Binary DXF is not supported. Save the drawing as an ASCII DXF.');
    const lines=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');while(lines.length&&!lines.at(-1).trim())lines.pop();
    if(lines.length%2)throw Error('Invalid DXF: an incomplete group-code pair was found.');
    const pairs=[];for(let i=0;i<lines.length;i+=2){if(!/^\s*\d+\s*$/.test(lines[i]))throw Error('Invalid DXF group code at line '+(i+1));pairs.push([Number(lines[i]),[1,3].includes(Number(lines[i]))?lines[i+1]:lines[i+1].trim()]);}
    if(!pairs.some(p=>p[0]===0&&p[1]==='EOF'))throw Error('Invalid DXF: missing EOF marker.');
    let units=0;const unitIndex=pairs.findIndex(p=>p[0]===9&&p[1]==='$INSUNITS');if(unitIndex>=0&&pairs[unitIndex+1]?.[0]===70)units=Number(pairs[unitIndex+1][1]);
    if(!(units in unitFactors))throw Error('Unsupported DXF unit code: '+units);
    const scale=unitFactors[units],entities=[],skipped={},warnings=[];let section='',record=null,poly=null,found=false;
    const skip=type=>skipped[type]=(skipped[type]||0)+1;
    const note=message=>{if(!warnings.includes(message))warnings.push(message);};
    const layerColors=new Map();
    for(let i=0;i<pairs.length;i++)if(pairs[i][0]===0&&pairs[i][1]==='LAYER'){
      const data=[];for(let j=i+1;j<pairs.length&&pairs[j][0]!==0;j++)data.push(pairs[j]);
      const get=c=>data.find(p=>p[0]===c)?.[1],trueHex=get(420)!==undefined?trueColor(get(420)):null,aci=aciColor(get(62));
      if(get(2)&&(trueHex|| (aci&&aci!=='#ffffff')))layerColors.set(get(2),trueHex||aci);
    }
    function read(r){if(!r)return;const type=r.type, g=c=>r.data.find(p=>p[0]===c)?.[1],n=(c,def=0)=>g(c)===undefined?def:Number(g(c)),p=(xc=10,yc=20)=>({x:n(xc,NaN)*scale,y:n(yc,NaN)*scale});
      const layer=g(8)||'0';const extrusion=[n(210),n(220),n(230,1)];
      if(n(67)===1){skip(type+' (paper space)');if(type==='POLYLINE')poly={invalid:true};return;}
      if(extrusion[0]||extrusion[1]||extrusion[2]!==1||[30,31,38,39].some(c=>n(c)!==0)){skip(type+' (non-planar)');if(type==='POLYLINE')poly={invalid:true};if(type==='VERTEX'&&poly)poly.invalid=true;return;}
      let e;
      if(type==='TEXT'){
        if(n(72)||n(73)||n(71)||n(51)||n(41,1)!==1)note('TEXT alignment, width or style was normalized to baseline-left text.');
        e={type:'text',layer,...p(),height:n(40,NaN)*scale,rotation:n(50),text:(g(1)||'').replace(/%%c/gi,'Ø').replace(/%%d/gi,'°').replace(/%%p/gi,'±').replace(/\\U\+([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))};
      }
      else if(type==='MTEXT'){
        if(n(71,1)!==1||n(41)!==0)note('MTEXT attachment or wrapping was normalized to baseline-left text.');
        let encoded=r.data.filter(([c])=>c===1||c===3).map(([,v])=>v).join('');const bold=encoded.startsWith('\\fCourier New|b1|i0;');if(bold)encoded=encoded.slice('\\fCourier New|b1|i0;'.length);let content='';
        for(let i=0;i<encoded.length;i++){
          const c=encoded[i];if(c==='{'||c==='}'){note('MTEXT formatting was simplified during import.');continue;}
          if(c!=='\\'){content+=c;continue;}
          const next=encoded[++i];if(next==='P')content+='\n';else if(['\\','{','}'].includes(next))content+=next;
          else if(next==='U'&&/^\+[0-9a-f]{4}/i.test(encoded.slice(i+1))){content+=String.fromCharCode(parseInt(encoded.slice(i+2,i+6),16));i+=5;}
          else{note('MTEXT formatting was simplified during import.');content+=next||'';}
        }
        const rotation=g(50)!==undefined?deg(n(50)):g(11)!==undefined?deg(Math.atan2(n(21),n(11))):0,height=n(40,NaN)*scale,origin=p(),angle=rad(rotation);
        e={type:'text',layer,x:origin.x+height*Math.sin(angle),y:origin.y-height*Math.cos(angle),height,rotation,text:content};if(bold)e.bold=true;
        if(Math.abs(n(44,.84)-.84)>1e-7)warnings.push('MTEXT line spacing was normalized to 1.4 times text height.');
      }
      else if(type==='LINE')e={type:'line',layer,a:p(),b:p(11,21)};
      else if(type==='DIMENSION'){
        const kind=n(70)&7;
        if(![1,3,4].includes(kind)||[33,34,35].some(c=>n(c)!==0)){skip('DIMENSION (unsupported type or plane)');return;}
        if(kind===1){const a=p(13,23),b=p(14,24),def=p(),len=distance(a,b);e={type:'dimension',layer,a,b,offset:((def.x-a.x)*-(b.y-a.y)+(def.y-a.y)*(b.x-a.x))/len};}
        else{const b=p(15,25),def=p(),a=kind===3?{x:(b.x+def.x)/2,y:(b.y+def.y)/2}:def;e={type:'dimension',mode:kind===3?'diameter':'radius',layer,a,b,offset:n(40)*scale};}
        if(g(1)&&g(1)!=='<>')warnings.push('Dimension text overrides were replaced with measured lengths.');
      }
      else if(type==='CIRCLE'||type==='ARC'){e={type:type.toLowerCase(),layer,...p(),r:n(40,NaN)*scale};if(type==='ARC')Object.assign(e,{start:n(50,NaN),end:n(51,NaN)});}
      else if(type==='LWPOLYLINE'){
        const vertices=[];for(const [c,v]of r.data){if(c===10)vertices.push({x:Number(v)*scale,y:NaN,bulge:0});else if(c===20&&vertices.length)vertices.at(-1).y=Number(v)*scale;else if(c===42&&vertices.length)vertices.at(-1).bulge=Number(v);}
        e={type:'polyline',layer,vertices,closed:!!(n(70)&1)};
        if(r.data.some(([c,v])=>[40,41,43].includes(c)&&Number(v)!==0))warnings.push('Polyline widths were ignored; centreline geometry was imported.');
      }else if(type==='POLYLINE'){poly={type:'polyline',layer,vertices:[],closed:!!(n(70)&1),invalid:!!(n(70)&(8|16|64))};if(poly.invalid)skip('3D / mesh POLYLINE');return;}
      else if(type==='VERTEX'){if(poly&&!poly.invalid)poly.vertices.push({...p(),bulge:n(42)});return;}
      else if(type==='SEQEND'){if(poly&&!poly.invalid)e=poly;poly=null;if(!e)return;}
      else{skip(type);return;}
      if(g(420)!==undefined)e.color=trueColor(g(420));
      else if(g(62)!==undefined&&n(62)!==0&&n(62)!==256)e.color=aciColor(n(62))||e.color;
      else if(g(62)!==undefined&&n(62)===0&&layerColors.has(layer))e.color=layerColors.get(layer);
      if(!valid(e)){skip(type+' (invalid geometry)');return;}const gi=r.data.findIndex(([c,v])=>c===1001&&v==='TRENDCAD_GROUP');if(gi>=0&&r.data[gi+1]?.[0]===1000&&/^[A-Za-z0-9_-]{1,100}$/.test(r.data[gi+1][1]))e.groupId=r.data[gi+1][1];entities.push(e);
    }
    for(let i=0;i<pairs.length;i++){
      const [c,v]=pairs[i];
      if(c===0&&v==='SECTION'){if(pairs[i+1]?.[0]!==2)throw Error('Invalid DXF section.');section=pairs[++i][1];if(section==='ENTITIES')found=true;continue;}
      if(c===0&&v==='ENDSEC'){if(section==='ENTITIES')read(record);record=null;section='';continue;}
      if(section!=='ENTITIES')continue;
      if(c===0){read(record);record={type:v,data:[]};}else if(record)record.data.push([c,v]);
    }
    if(!found)throw Error('This DXF does not contain an ENTITIES section.');
    if(units===0)warnings.push('DXF units are unspecified; coordinates were interpreted as millimetres.');else if(scale!==1)warnings.push('Converted source units to millimetres (×'+scale+').');
    for(const [type,count]of Object.entries(skipped))warnings.push(count+' × '+type+' not imported.');
    return {entities,units,scale,skipped,warnings:[...new Set(warnings)]};
  }
  function valid(e){const finite=p=>Number.isFinite(p.x)&&Number.isFinite(p.y);if(e.type==='text')return finite(e)&&Number.isFinite(e.height)&&e.height>0&&Number.isFinite(e.rotation)&&(e.bold===undefined||typeof e.bold==='boolean')&&(e.color===undefined||/^#[0-9a-f]{6}$/i.test(e.color))&&typeof e.text==='string'&&e.text.trim().length>0&&!/[\r\x00]/.test(e.text);if(e.type==='dimension')return finite(e.a)&&finite(e.b)&&distance(e.a,e.b)>1e-9&&Number.isFinite(e.offset);if(e.type==='line')return finite(e.a)&&finite(e.b)&&distance(e.a,e.b)>1e-9;if(e.vertices)return e.vertices.length>=2&&e.vertices.every(p=>finite(p)&&Number.isFinite(p.bulge??0));return finite(e)&&Number.isFinite(e.r)&&e.r>0&&(e.type!=='arc'||Number.isFinite(e.start)&&Number.isFinite(e.end));}
  function writeDXF(entities){
    const out=[],put=(c,v)=>out.push(String(c),typeof v==='number'?String(Number(v.toFixed(10))):String(v).replace(/[\r\n]/g,' '));
    put(0,'SECTION');put(2,'HEADER');put(9,'$ACADVER');put(1,'AC1015');put(9,'$INSUNITS');put(70,4);put(9,'$MEASUREMENT');put(70,1);put(0,'ENDSEC');
    put(0,'SECTION');put(2,'TABLES');put(0,'TABLE');put(2,'LAYER');const layers=[...new Set(['0',...entities.map(e=>e.layer||'0')])];put(70,layers.length);for(const layer of layers){put(0,'LAYER');put(100,'AcDbSymbolTableRecord');put(100,'AcDbLayerTableRecord');put(2,layer);put(70,0);put(62,7);const layerColor=entities.find(e=>(e.layer||'0')===layer&&e.color)?.color;if(layerColor)put(420,parseInt(layerColor.slice(1),16));put(6,'CONTINUOUS');}put(0,'ENDTAB');
    if(entities.some(e=>e.groupId)){put(0,'TABLE');put(2,'APPID');put(70,1);put(0,'APPID');put(100,'AcDbSymbolTableRecord');put(100,'AcDbRegAppTableRecord');put(2,'TRENDCAD_GROUP');put(70,0);put(0,'ENDTAB');}
    const dims=entities.filter(e=>e.type==='dimension');
    if(dims.length){
      put(0,'TABLE');put(2,'DIMSTYLE');put(70,1);put(0,'DIMSTYLE');put(100,'AcDbSymbolTableRecord');put(100,'AcDbDimStyleTableRecord');put(2,'STANDARD');put(70,0);put(40,1);put(41,10);put(140,10);put(147,3);put(271,2);put(0,'ENDTAB');
      put(0,'TABLE');put(2,'BLOCK_RECORD');put(70,dims.length);dims.forEach((e,i)=>{put(0,'BLOCK_RECORD');put(100,'AcDbSymbolTableRecord');put(100,'AcDbBlockTableRecord');put(2,'*D'+(i+1));});put(0,'ENDTAB');
    }
    put(0,'ENDSEC');
    if(dims.length){put(0,'SECTION');put(2,'BLOCKS');dims.forEach((e,i)=>{
      if(!valid(e))throw Error('Cannot export invalid dimension.');const d=dimension(e),name='*D'+(i+1);
      put(0,'BLOCK');put(100,'AcDbEntity');put(8,e.layer||'DIMENSIONS');put(100,'AcDbBlockBegin');put(2,name);put(70,1);put(10,0);put(20,0);put(30,0);put(3,name);put(1,'');
      for(const [a,b] of d.lines){put(0,'LINE');put(100,'AcDbEntity');put(8,e.layer||'DIMENSIONS');put(100,'AcDbLine');put(10,a.x);put(20,a.y);put(30,0);put(11,b.x);put(21,b.y);put(31,0);}
      put(0,'TEXT');put(100,'AcDbEntity');put(8,e.layer||'DIMENSIONS');put(100,'AcDbText');put(10,d.text.x);put(20,d.text.y+3);put(30,0);put(40,10);put(1,d.label.replace('Ø','%%c'));put(72,1);put(11,d.text.x);put(21,d.text.y+3);put(31,0);put(100,'AcDbText');put(73,1);
      put(0,'ENDBLK');put(100,'AcDbEntity');put(8,e.layer||'DIMENSIONS');put(100,'AcDbBlockEnd');
    });put(0,'ENDSEC');}
    put(0,'SECTION');put(2,'ENTITIES');
    for(const e of entities){if(!valid(e))throw Error('Cannot export invalid geometry.');put(0,e.type==='polyline'?'LWPOLYLINE':e.type==='text'&&(e.text.includes('\n')||e.bold)?'MTEXT':e.type.toUpperCase());put(100,'AcDbEntity');put(8,e.layer||'0');if(e.color)put(420,parseInt(e.color.slice(1),16));
      if(e.type==='dimension'){const d=dimension(e);put(100,'AcDbDimension');put(2,'*D'+(dims.indexOf(e)+1));const radial=e.mode==='radius'||e.mode==='diameter',def=radial?d.a:d.b;put(10,def.x);put(20,def.y);put(30,0);put(11,d.text.x);put(21,d.text.y+3);put(31,0);put(70,e.mode==='diameter'?35:e.mode==='radius'?36:33);put(1,'<>');put(3,'STANDARD');if(radial){put(100,e.mode==='diameter'?'AcDbDiametricDimension':'AcDbRadialDimension');put(15,e.b.x);put(25,e.b.y);put(35,0);put(40,e.offset);}else{put(100,'AcDbAlignedDimension');put(13,e.a.x);put(23,e.a.y);put(33,0);put(14,e.b.x);put(24,e.b.y);put(34,0);}}
      else if(e.type==='text'&&(e.text.includes('\n')||e.bold)){
        put(100,'AcDbMText');const angle=rad(e.rotation);put(10,e.x-e.height*Math.sin(angle));put(20,e.y+e.height*Math.cos(angle));put(30,0);put(40,e.height);put(41,0);put(71,1);put(50,angle);put(73,2);put(44,.84);
        const encoded=e.text.replace(/[\\{}]/g,c=>'\\'+c).replace(/\n/g,'\\P').replace(/[^\x20-\x7e]/g,c=>'\\U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'));let rest=(e.bold?'\\fCourier New|b1|i0;':'')+encoded;while(rest.length>250){put(3,rest.slice(0,250));rest=rest.slice(250);}put(1,rest);
      }
      else if(e.type==='text'){put(100,'AcDbText');put(10,e.x);put(20,e.y);put(30,0);put(40,e.height);put(1,e.text.replace(/[^\x20-\x7e]/g,c=>'\\U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')));put(50,e.rotation);put(72,0);put(100,'AcDbText');put(73,0);}
      else if(e.type==='line'){put(100,'AcDbLine');put(10,e.a.x);put(20,e.a.y);put(30,0);put(11,e.b.x);put(21,e.b.y);put(31,0);}
      else if(e.type==='polyline'){put(100,'AcDbPolyline');put(90,e.vertices.length);put(70,e.closed?1:0);for(const p of e.vertices){put(10,p.x);put(20,p.y);if(p.bulge)put(42,p.bulge);}}
      else{put(100,'AcDbCircle');put(10,e.x);put(20,e.y);put(30,0);put(40,e.r);if(e.type==='arc'){put(100,'AcDbArc');put(50,e.start);put(51,e.end);}}
      if(e.groupId){put(1001,'TRENDCAD_GROUP');put(1000,e.groupId);}
    }put(0,'ENDSEC');put(0,'EOF');return out.join('\r\n')+'\r\n';
  }
  const api={textBox,textContains,distance,trackSnap,angleSnap,dimension,bulgeArc,points,bounds,translate,hitDistance,anchors,parseDXF,writeDXF,valid};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CAD=api;
})(typeof globalThis!=='undefined'?globalThis:this);

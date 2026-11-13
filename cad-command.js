(function(root){
  'use strict';
  const number='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  function parse(text){
    const s=text.trim();let m;
    if((m=s.match(new RegExp('^('+number+')\\s*<\\s*('+number+')$'))))return{kind:'polar',length:Number(m[1]),angle:Number(m[2])};
    if((m=s.match(new RegExp('^(@?)('+number+')\\s*[,xX]\\s*('+number+')$'))))return{kind:m[1]?'relative':'pair',x:Number(m[2]),y:Number(m[3])};
    if(new RegExp('^'+number+'$').test(s)){const value=Number(s);if(Number.isFinite(value))return{kind:'number',value};}
    if(/^[a-z]+$/i.test(s))return{kind:'command',value:s.toLowerCase()};
    throw Error('Enter a number, width,height, length<angle, or a command name.');
  }
  function endpoint(origin,length,aim,angle){
    if(!Number.isFinite(length)||length<=0)throw Error('Length must be greater than zero.');
    const dx=aim.x-origin.x,dy=aim.y-origin.y;
    if(angle===undefined&&Math.hypot(dx,dy)<1e-8)throw Error('Point the mouse in the line direction, then type the length again (or enter length<angle).');
    const r=angle===undefined?Math.atan2(dy,dx):angle*Math.PI/180;
    if(!Number.isFinite(r))throw Error('Enter a valid angle.');
    const clean=n=>Math.abs(n)<1e-12?0:n;
    return{x:origin.x+length*clean(Math.cos(r)),y:origin.y+length*clean(Math.sin(r))};
  }
  const api={parse,endpoint};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CADCommand=api;
})(globalThis);

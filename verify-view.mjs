import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stalls,halls,colors} from './dist/data.js';
import {circulation,lengthOf,sampleLane} from './dist/circulation.js';
import {selectionZoom,planFocus,calloutPosition,SELECTION_ZOOM} from './dist/selection-view.js';
import {walkerState,arrowState} from './dist/hall-motion.js';
import {PlanView} from './dist/plan-view.js';
import {HallExplorer as CanvasExplorer} from './dist/canvas-scene.js';
import * as THREE from './dist/assets/vendor/three.module.js';

// Every stall fits inside an absolute, moderate frame, including the largest
// stalls, corners and both halls. Clicking again must not compound the zoom.
for(const s of stalls){
 const hall=halls[s.hall],base={x:-4,y:-4,w:hall.width+8,h:hall.depth+10},frame=planFocus(s,base);
 assert.ok(base.w/frame.w>1.5&&base.w/frame.w<=SELECTION_ZOOM+1e-8);
 assert.ok(s.x>frame.x&&s.x+s.w<frame.x+frame.w);
 assert.ok(s.z>frame.y&&s.z+s.d<frame.y+frame.h);
 const plan=Object.create(PlanView.prototype);Object.assign(plan,{hall:s.hall,base,camera:{...base},projectPin(){}});
 plan.focus(s.n,{immediate:true});assert.deepEqual(plan.camera,frame);
 plan.focus(s.n,{immediate:true});assert.deepEqual(plan.camera,frame);
 const c=new CanvasExplorer(null,null,()=>({t:k=>k}));c.setHall(s.hall);c.select(s.n,true);
 assert.equal(c.goal.x,s.x+s.w/2);assert.equal(c.goal.z,s.z+s.d/2);
 assert.equal(c.goal.zoom,selectionZoom(s,hall));assert.ok(c.goal.zoom<=SELECTION_ZOOM);
 const goal={...c.goal};c.select(s.n,true);assert.deepEqual(c.goal,goal);
 c.clear();assert.deepEqual(c.goal,c.camera);
}
console.log('PASS: all 193 stalls receive a bounded local zoom; repeated selection does not multiply zoom; clearing selection cancels camera motion.');

// Retargeting a smooth plan zoom cancels its old frame. Reset and manual input
// cannot be overwritten by a stale animation callback.
let nextFrame=1;const frames=new Map();
globalThis.requestAnimationFrame=callback=>{const id=nextFrame++;frames.set(id,callback);return id;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
globalThis.matchMedia=()=>({matches:false});
const p=Object.create(PlanView.prototype),attrs=new Map();
Object.assign(p,{hall:1,base:{x:-4,y:-4,w:122,h:120},camera:{x:-4,y:-4,w:122,h:120},svg:{setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)},projectPin(){}});
p.focus(1);const first=p.transitionFrame;p.focus(119);assert.ok(!frames.has(first));
const callback=frames.get(p.transitionFrame);callback(performance.now()+600);
assert.deepEqual(p.camera,planFocus(stalls[118],p.base));assert.equal(p.transitionFrame,null);
p.focus(14);p.reset();assert.deepEqual(p.camera,p.base);assert.equal(p.transitionFrame,null);
console.log('PASS: rapid plan selections finish on the latest stall; reset cancels pending animation.');

// Long-running traffic keeps a positive source direction and fixed spacing.
for(const hall of[1,2]){
 const lanes=circulation[hall].lanes;
 for(let lane=0;lane<lanes.length;lane++){
  const len=lengthOf(lanes[lane].points),index=lane;
  for(const time of[1,2,10,100,1000]){
   const a=walkerState(index,lanes.length,len,time),b=walkerState(index,lanes.length,len,time+.01);
   assert.ok(a.alpha>=0&&a.alpha<=1);
   if(a.visible&&b.visible){const x=sampleLane(lanes[lane].points,a.distance),y=sampleLane(lanes[lane].points,b.distance);assert.ok((y.x-x.x)*x.dx+(y.z-x.z)*x.dz>=-1e-8);}
   const arrowA=arrowState(0,len,time),arrowB=arrowState(0,len,time+.01);
   if(arrowB.distance>arrowA.distance)assert.ok(arrowB.distance-arrowA.distance<.008);
  }
  const traffic=Array.from({length:24},(_,i)=>i).filter(i=>i%lanes.length===lane).map(i=>walkerState(i,lanes.length,len,100).distance).sort((a,b)=>a-b);
  for(let i=1;i<traffic.length;i++)assert.ok(traffic[i]-traffic[i-1]>2,'Walkers overlap on their lane');
 }
}
console.log('PASS: arrows and people share all 19 one-way lanes, with fixed spacing and endpoint fades.');

// Exercise the real WebGL mesh and animation code with Three's CPU geometry.
// Only import specifiers change to match the browser's existing import map.
const sceneFile=new URL('./dist/scene.js',import.meta.url);
const source=fs.readFileSync(sceneFile,'utf8').replace(/from(['"])([^'"]+)\1/g,(_,quote,spec)=>{
 const url=spec==='three'?new URL('./dist/assets/vendor/three.module.js',import.meta.url).href:spec.split('?')[0].endsWith('OrbitControls.js')?'data:text/javascript,export class OrbitControls{}':new URL(spec,sceneFile).href;
 return 'from'+JSON.stringify(url);
});
const {HallExplorer:WebGLExplorer}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const context=new Proxy({measureText:text=>({width:text.length*60})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
for(const hall of[1,2]){
 const el={clientWidth:900,clientHeight:650,getBoundingClientRect:()=>({width:900,height:650})};
 const e=new WebGLExplorer(el,null,()=>({t:k=>k}));e.scene=new THREE.Scene();e.camera=new THREE.PerspectiveCamera(38,900/650,1,800);
 e.mat=Object.fromEntries(['wall','rail','floor','base','grass','light','foliage','planter','metal','table','zone','common'].map(k=>[k,new THREE.MeshStandardMaterial()]));
 e.renderer={capabilities:{getMaxAnisotropy:()=>1},render(){}};
 let controlDelta=null;e.controls={target:new THREE.Vector3(),update(dt){controlDelta=dt;e.camera.lookAt(this.target);e.camera.updateMatrixWorld();},autoRotate:false};
 e.clock={getDelta:()=>.05};e.animTime=1;e.setHall(hall);
 const caps=e.world.children.filter(o=>o.geometry?.type==='ExtrudeGeometry');assert.equal(caps.length,1);
 assert.equal(caps[0].material[0],e.mat.floor);assert.equal(caps[0].material[1],e.mat.base);
 assert.equal(e.world.children.filter(o=>o.geometry?.type==='ShapeGeometry'&&o.material===e.mat.floor).length,0,'Duplicate floor face causes brown depth fighting');
 assert.ok(e.booths.every(b=>b.label.material.depthTest===false&&b.label.renderOrder===5),'Number labels can flicker behind booth floors');
 e.animate();assert.equal(controlDelta,.05);const before=e.people.map(p=>p.mesh.position.clone());e.animate();
 e.routes.forEach((route,i)=>{
  const arrows=e.arrows.filter(a=>a.route===i),offsets=arrows.map(a=>a.offset%route.total);assert.equal(new Set(offsets.map(x=>x.toFixed(6))).size,offsets.length,'Coincident arrow surfaces on lane '+i);assert.equal(arrows.length,Math.max(1,Math.floor(route.total/8)));assert.ok(arrows.every(a=>a.mesh.material.depthWrite===false));
  const a=e.arrows.find(a=>a.route===i),heading=new THREE.Vector3(0,-1,0).applyQuaternion(a.mesh.quaternion).normalize(),movement=e.people[i].mesh.position.clone().sub(before[i]);movement.y=0;
  assert.ok(heading.dot(movement.normalize())>.999999,`Arrow/walker mismatch: ${hall}/${i}`);
  for(const limb of e.people[i].limbs)assert.ok(Math.abs(limb.shoulder.rotation.x+limb.hip.rotation.x*.8)<1e-10);
 });
 for(const booth of e.booths){
  e.select(booth.s.n,true);assert.equal(e.selectionRig.material.depthWrite,false);assert.equal(e.selectionRig.material.depthTest,false);assert.equal(e.selectionRig.renderOrder,6);assert.equal(booth.floor.castShadow,false);const target=e.focusTarget;
  assert.ok(target.target.equals(booth.floor.position));
  const pose=target.camera.clone();e.select(booth.s.n,true);assert.ok(e.focusTarget.camera.equals(pose));
  e.camera.position.copy(pose);e.controls.target.copy(target.target);e.controls.update();
  for(const dx of[-booth.s.w/2,booth.s.w/2])for(const dz of[-booth.s.d/2,booth.s.d/2]){
   const corner=booth.floor.position.clone().add(new THREE.Vector3(dx,1,dz)).project(e.camera);
   assert.ok(Math.abs(corner.x)<.8&&Math.abs(corner.y)<.8,`Stall clipped by focus: ${booth.s.n}`);
  }
 }
 e.clear();assert.equal(e.focusTarget,null);
 for(const b of e.booths)assert.equal(b.floor.material.color.getHexString(),new THREE.Color(colors[b.s.color]).getHexString());
 let disposed=false,sharedDisposed=false;e.booths[0].floor.material.addEventListener('dispose',()=>disposed=true);e.mat.floor.addEventListener('dispose',()=>sharedDisposed=true);e.setHall(hall===1?2:1);assert.ok(disposed);assert.equal(sharedDisposed,false);assert.equal(e.world.children.filter(o=>o.geometry?.type==='ExtrudeGeometry').length,1);
}
console.log('PASS: actual WebGL floor has one cream cap and no duplicate surface; number labels use a stable layer; all walkers face their arrows; every stall fits its focused camera.');

// The price bubble must sit outside the selected floor, including edge cases.
for(const scene of[{width:900,height:650},{width:340,height:450}])for(const bounds of[{top:230,bottom:290},{top:80,bottom:130},{top:360,bottom:400}]){
 const pin={width:125,height:54},point={x:scene.width/2,y:bounds.top,bounds};
 const pos=calloutPosition(point,scene,pin);
 assert.ok(pos.x-pin.width/2>=0&&pos.x+pin.width/2<=scene.width);
 assert.ok(pos.below?pos.y>=bounds.bottom:pos.y<=bounds.top,'Price bubble hides the selected stall');
}

// The compatible 3D renderer paints all booth geometry before its number pass,
// and paints the selected label last. Labels can no longer be covered by floors.
const c=new CanvasExplorer(null,null,()=>({t:k=>k}));c.setHall(2);
Object.assign(c,{ctx:context,width:900,height:650,dpr:1,arrive:1,selected:149});
const order=[],geometry=c.drawStall,label=c.drawStallLabel;
c.drawStall=function(...args){order.push('geometry');return geometry.apply(this,args);};
c.drawStallLabel=function(s){order.push('label:'+s.n);return label.call(this,s);};
c.draw();assert.ok(order.lastIndexOf('geometry')<order.findIndex(x=>x.startsWith('label:')));assert.equal(order.at(-1),'label:149');
const region=c.labelRegions.find(r=>r.n===149);assert.equal(c.pick(region.x,region.y),149);
console.log('PASS: price bubbles clear selected tiles; compatible 3D labels render above all floors, with selected numbers picked correctly.');

// A tap selects once; rotating away and back or ending a pinch must never be
// misinterpreted as a click that suddenly starts a selection zoom.
const clicks=[],events=new Map(),pickCanvas={addEventListener(type,fn){if(!events.has(type))events.set(type,[]);events.get(type).push(fn);},getBoundingClientRect:()=>({left:0,top:0,width:900,height:650}),style:{}};
const tapProbe=Object.create(WebGLExplorer.prototype);Object.assign(tapProbe,{pointer:new THREE.Vector2(),ray:{setFromCamera(){},intersectObjects:()=>[{object:{userData:{n:58}}}]},pickables:[],camera:{},onSelect:n=>clicks.push(n),callbacks:{}});tapProbe.bindPicking(pickCanvas);
const fire=(type,id,x=20,y=20,button=0)=>{for(const fn of events.get(type)||[])fn({pointerId:id,clientX:x,clientY:y,button,buttons:type==='pointermove'?1:0});};
fire('pointerdown',1);fire('pointerup',1);assert.deepEqual(clicks,[58]);clicks.length=0;
fire('pointerdown',1);fire('pointermove',1,140,20);fire('pointermove',1,20,20);fire('pointerup',1);assert.deepEqual(clicks,[],'Rotate-return triggered an accidental zoom');
fire('pointerdown',1);fire('pointerdown',2,80,20);fire('pointerup',2,80,20);fire('pointerup',1);assert.deepEqual(clicks,[],'Pinch release selected a stall');
fire('pointerdown',1);fire('pointercancel',1);fire('pointerup',1);assert.deepEqual(clicks,[]);
fire('pointerdown',1,20,20,2);fire('pointerup',1,20,20,2);assert.deepEqual(clicks,[]);
fire('pointerdown',3);fire('pointerup',3);assert.deepEqual(clicks,[58]);
console.log('PASS: drag-return, pinch, pointer cancellation and right-click never trigger a stall zoom; ordinary taps still select.');

// Orbit scale must stay constant for a complete turn. Box side visibility must
// match the viewing quadrant, and walkers must join the scene depth ordering.
const rotation=new CanvasExplorer(null,null,()=>({t:k=>k}));rotation.setHall(1);Object.assign(rotation,{ctx:context,width:900,height:650,dpr:1,arrive:1,time:10});
let scale=null;
for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12){rotation.camera.yaw=angle;rotation.draw();if(scale==null)scale=rotation.scale;else assert.ok(Math.abs(rotation.scale-scale)<1e-10,'Hall changes apparent scale during rotation');}
for(const angle of[.4,2.2,3.7,5.4]){
 const faces=[],box=Object.create(CanvasExplorer.prototype);box.camera={yaw:angle};box.polygon=points=>faces.push(points);box.tile=()=>{};box.box(10,20,8,4,2,'#f59b23');
 assert.ok(faces[0].every(p=>p[2]===(Math.cos(angle)>=0?24:20)),'Wrong north/south face');
 assert.ok(faces[1].every(p=>p[0]===(Math.sin(angle)>=0?18:10)),'Wrong east/west face');
}
const depthOrder=[],drawBooth=rotation.drawStall,drawFacility=rotation.drawFacility,drawWalker=rotation.drawPerson;
rotation.drawStall=function(s,...args){depthOrder.push({kind:'stall',depth:this.project(s.x+s.w/2,0,s.z+s.d/2).depth});return drawBooth.call(this,s,...args);};
rotation.drawFacility=function(f){depthOrder.push({kind:'facility',depth:this.project(f.x+f.w/2,0,f.z+f.d/2).depth});return drawFacility.call(this,f);};
rotation.drawPerson=function(p){depthOrder.push({kind:'walker',depth:this.project(p.p.x,.9,p.p.z).depth});return drawWalker.call(this,p);};
rotation.draw();for(let i=1;i<depthOrder.length;i++)assert.ok(depthOrder[i].depth>=depthOrder[i-1].depth-1e-10,'A walker was painted over foreground geometry');
assert.ok(depthOrder.findIndex(o=>o.kind==='walker')<depthOrder.map(o=>o.kind).lastIndexOf('stall'));
rotation.camera.yaw=Math.PI*5+.4;rotation.select(65,true);assert.equal(rotation.goal.yaw,rotation.camera.yaw,'Selection reset the viewing angle');
console.log('PASS: full-turn scale is stable, side faces match all four quadrants, walkers respect scene depth, and selection preserves the viewing angle.');

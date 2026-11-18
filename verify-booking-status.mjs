import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BookingStatus,validateBookingPayload,BOOKING_POLL_MS} from './dist/booking-status.js';
import {PlanView} from './dist/plan-view.js';
import {HallExplorer as CanvasExplorer} from './dist/canvas-scene.js';
import {stalls,colors} from './dist/data.js';
import * as THREE from './dist/assets/vendor/three.module.js';
const timestamp='2026-11-17T09:00:00Z';
const payload=rows=>({bookings:rows,updatedAt:timestamp});
const row=(stall,booked,revision=1)=>({stall,booked,revision,updatedAt:timestamp});
assert.equal(BOOKING_POLL_MS,20000);
assert.equal(validateBookingPayload(payload([])).records.size,0);
for(const invalid of[payload([row(0,true)]),payload([row(194,true)]),payload([row(65,'true')]),payload([row(65,true,-1)]),payload([row(65,true),row(65,false)]),{bookings:[],updatedAt:'invalid'}])assert.throws(()=>validateBookingPayload(invalid));
let now=1000,online=true,fetches=0,mode='ok',rows=[];const updates=[];
const store=new BookingStatus({now:()=>now,online:()=>online,onChange:s=>updates.push(s),documentRef:{visibilityState:'visible'},windowRef:null,fetcher:async(url,options)=>{fetches++;assert.equal(url,'/api/bookings');assert.equal(options.cache,'no-store');if(mode==='error')throw new Error('offline');if(mode==='malformed')return{ok:true,json:async()=>payload([row(65,'yes')])};return{ok:true,json:async()=>payload(rows)};}});
assert.equal(store.state,'loading');assert.equal(store.isBooked(65),false);
await store.refresh();assert.equal(store.state,'live');assert.equal(store.booked.size,0);assert.equal(updates.at(-1).changed,false);
rows=[row(65,true),row(173,true),row(149,false)];now+=1000;await store.refresh();assert.equal(store.isBooked(65),true);assert.equal(store.isBooked(173),true);assert.equal(store.isBooked(149),false);
mode='error';now+=2000;await store.refresh();assert.equal(store.state,'stale');assert.equal(store.isBooked(65),true,'Failed refresh erased last synced bookings');
mode='malformed';await store.refresh();assert.equal(store.state,'stale');assert.equal(store.isBooked(173),true,'Malformed response erased known booking');
online=false;const beforeOffline=fetches;await store.refresh();assert.equal(store.state,'offline');assert.equal(fetches,beforeOffline);
online=true;mode='ok';rows=[row(65,false,2),row(173,true)];await store.refresh();assert.equal(store.isBooked(65),false);assert.equal(store.isBooked(173),true);
now+=60001;assert.equal(store.state,'stale');
console.log('PASS: empty/unknown stalls stay unmarked; explicit bookings and releases sync; stale/offline/malformed responses retain last synced status.');

// Only one fetch runs at a time; hidden pages stop periodic requests.
let resolveFetch;const pending=new BookingStatus({documentRef:{visibilityState:'visible'},windowRef:null,fetcher:()=>new Promise(resolve=>resolveFetch=resolve)});
const a=pending.refresh(),b=pending.refresh();assert.equal(a,b);resolveFetch({ok:true,json:async()=>payload([])});await a;
class Surface extends EventTarget{visibilityState='visible';}
const doc=new Surface(),win=new Surface(),nativeSet=globalThis.setInterval,nativeClear=globalThis.clearInterval,timers=new Map();let timerId=0,count=0;
globalThis.setInterval=(fn,ms)=>{assert.equal(ms,20000);timers.set(++timerId,fn);return timerId;};globalThis.clearInterval=id=>timers.delete(id);
try{const poller=new BookingStatus({documentRef:doc,windowRef:win,fetcher:async()=>{count++;return{ok:true,json:async()=>payload([])};}});poller.start();await poller.inFlight;assert.equal(timers.size,1);doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,0);const old=count;win.dispatchEvent(new Event('focus'));await Promise.resolve();assert.equal(count,old);doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));await poller.inFlight;assert.equal(count,old+1);win.dispatchEvent(new Event('focus'));await poller.inFlight;assert.equal(count,old+2);poller.stop();assert.equal(timers.size,0);}finally{globalThis.setInterval=nativeSet;globalThis.clearInterval=nativeClear;}
console.log('PASS: visible pages poll every20seconds, refresh on focus/visibility, coalesce requests and stop hidden-page polling.');

// Booking overlays never reset view state or turn category tiles into a status colour.
const c=new CanvasExplorer(null,null,()=>({t:k=>k}));c.setHall(1);c.select(65,true);const camera={...c.camera},goal={...c.goal};c.setBookings(new Set([65]));assert.deepEqual(c.camera,camera);assert.deepEqual(c.goal,goal);assert.equal(c.selected,65);c.setBookings(new Set());assert.equal(c.bookings.size,0);
const klass=()=>({values:new Set(),toggle(k,on){on?this.values.add(k):this.values.delete(k);}}),tile={dataset:{mapStall:'65'},classList:klass(),setAttribute(k,v){this[k]=v;}};
const plan=Object.create(PlanView.prototype);Object.assign(plan,{hall:1,selected:65,category:'all',directions:true,camera:{x:1,y:2,w:50,h:50},locale:()=>({t:k=>k}),el:{querySelector:selector=>selector==='.plan-directions'?{classList:klass()}:selector==='#plan-selection-overlay'?{innerHTML:''}:null,querySelectorAll:()=>[tile]},projectPin(){}});const planCamera=plan.camera;plan.setBookings(new Set([65]));assert.equal(plan.camera,planCamera);assert.equal(plan.selected,65);assert.ok(tile.classList.values.has('is-booked'));plan.setBookings(new Set());assert.equal(tile.classList.values.has('is-booked'),false);
const sceneFile=new URL('./dist/scene.js',import.meta.url),source=fs.readFileSync(sceneFile,'utf8').replace(/from(['"])([^'"]+)\1/g,(_,quote,spec)=>'from'+JSON.stringify(spec==='three'?new URL('./dist/assets/vendor/three.module.js',import.meta.url).href:spec.split('?')[0].endsWith('OrbitControls.js')?'data:text/javascript,export class OrbitControls{}':new URL(spec,sceneFile).href));
const {HallExplorer}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const e=new HallExplorer(null,null,()=>({t:k=>k})),s=stalls[64],floor=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({color:colors[s.color]}));Object.assign(e,{world:new THREE.Group(),booths:[{s,floor,label:{material:new THREE.MeshBasicMaterial()}}],camera:new THREE.PerspectiveCamera(),focusTarget:{camera:new THREE.Vector3(40,60,70),target:new THREE.Vector3()}});e.camera.position.set(80,110,130);const position=e.camera.position.clone(),focus=e.focusTarget;
e.setBookings(new Set([65]));assert.ok(e.booths[0].bookingMarker.visible);assert.equal(e.focusTarget,focus);assert.ok(e.camera.position.equals(position));assert.equal(floor.material.color.getHexString(),new THREE.Color(colors[s.color]).getHexString());e.setBookings(new Set());assert.equal(e.booths[0].bookingMarker.visible,false);
console.log('PASS: booking overlays repaint all map modes without resetting camera, focus, selection or source category colours.');

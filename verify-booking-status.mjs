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
await store.refresh();assert.equal(store.state,'live');assert.equal(store.booked.size,0);assert.equal(updates.at(-1).changed,true);
rows=[row(65,true),row(173,true),row(149,false)];now+=1000;await store.refresh();assert.equal(store.isBooked(65),true);assert.equal(store.isBooked(173),true);assert.equal(store.isBooked(149),false);
mode='error';now+=2000;await store.refresh();assert.equal(store.state,'stale');assert.equal(store.isBooked(65),true,'Failed refresh erased last synced bookings');
mode='malformed';await store.refresh();assert.equal(store.state,'stale');assert.equal(store.isBooked(173),true,'Malformed response erased known booking');
online=false;const beforeOffline=fetches;await store.refresh();assert.equal(store.state,'offline');assert.equal(fetches,beforeOffline);
online=true;mode='ok';rows=[row(65,false,2),row(173,true)];await store.refresh();assert.equal(store.isBooked(65),false);assert.equal(store.isBooked(173),true);
now+=60001;assert.equal(store.state,'stale');
console.log('PASS: unknown status is withheld; legacy occupied records become sold-out; releases sync; failed updates retain last synced status.');

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

// Canonical states are strict; occupied legacy booleans migrate conservatively.
const canonical=(stall,status,revision=1)=>({...row(stall,status!=='available',revision),status});
const strict=validateBookingPayload(payload([canonical(1,'reserved'),canonical(2,'sold_out'),canonical(3,'available'),row(4,true)]));
assert.equal(strict.records.get(1).status,'reserved');assert.equal(strict.records.get(2).status,'sold_out');assert.equal(strict.records.get(4).status,'sold_out');
for(const bad of[{...row(5,false),status:'unknown'},{...row(5,true),status:'available'},{...row(5,false),status:'sold_out'},{...row(5,true),status:null},row(5,true,0)])assert.throws(()=>validateBookingPayload(payload([bad])));
let liveRows=[canonical(65,'reserved'),canonical(173,'sold_out')],isOnline=true;
const statuses=new BookingStatus({online:()=>isOnline,documentRef:{visibilityState:'visible'},windowRef:null,fetcher:async()=>({ok:true,json:async()=>payload(liveRows)})});
assert.equal(statuses.statusFor(65),null);assert.equal((await statuses.checkStall(65)).status,'reserved');assert.deepEqual([...statuses.reserved],[65]);assert.deepEqual([...statuses.soldOut],[173]);assert.deepEqual([...statuses.booked].sort((a,b)=>a-b),[65,173]);assert.equal(statuses.snapshot().statuses.size,193);assert.equal(statuses.statusFor(1),'available');
isOnline=false;assert.equal((await statuses.checkStall(65)).allowed,false);assert.equal((await statuses.checkStall(173)).reason,'sold_out');isOnline=true;
liveRows=[canonical(65,'sold_out',2),canonical(173,'available',2)];assert.equal((await statuses.checkStall(65)).reason,'sold_out');assert.equal(statuses.statusFor(173),'available');
const resolvers=[];const fresh=new BookingStatus({documentRef:{visibilityState:'visible'},windowRef:null,fetcher:()=>new Promise(resolve=>resolvers.push(resolve))});const oldPoll=fresh.refresh(),freshDecision=fresh.checkStall(65);resolvers[0]({ok:true,json:async()=>payload([])});await oldPoll;await Promise.resolve();assert.equal(resolvers.length,2,'An old in-flight poll approved a new intent');resolvers[1]({ok:true,json:async()=>payload([canonical(65,'sold_out')])});assert.equal((await freshDecision).reason,'sold_out');
console.log('PASS: strict canonical/legacy states, occupied union, unknown/offline fail-closed checks, and fresh post-intent reads after older in-flight polls.');

// Execute the application's actual intent handlers with controlled reads. These
// regressions catch UI wiring races beyond the independent store policy tests.
const vm=await import('node:vm'),{guardedWhatsAppHandoff}=await import('./dist/whatsapp.js');
const appSource=fs.readFileSync('dist/app.js','utf8');
const actualFunction=name=>{const found=appSource.match(new RegExp('^(?:async )?function '+name+'\\([^\\n]+','m'));assert.ok(found,'Missing actual app function '+name);return found[0];};
const ui=new Map();let focused=0;
function element(selector){if(!ui.has(selector))ui.set(selector,{dataset:{},isConnected:true,hidden:false,disabled:false,style:{setProperty(){}},classList:{contains:()=>false,toggle(){}},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[],animate(){},scrollIntoView(){},focus(){focused++;}});return ui.get(selector);}
const modal={open:false,handlers:{},showModal(){this.open=true;},close(){if(!this.open)return;this.open=false;this.handlers.close?.();},addEventListener(type,callback){this.handlers[type]=callback;}};
const notice={open:false,kind:null,stall:null,show(kind,{stall}={}){this.open=true;this.kind=kind;this.stall=stall;},close(){this.open=false;}};
const checks=[],known=new Map(Array.from({length:193},(_,i)=>[i+1,'available']));
const appBookings={checkStall:number=>new Promise(resolve=>checks.push({number,resolve})),statusFor:number=>known.get(number),state:'live'};
const noOp=()=>{},scope={stalls,hall:1,selected:null,view:'3d',paused:true,selectionIntent:0,enquiryIntent:0,selectionChecking:false,enquiryOpening:false,enquiryBusy:false,enquiryStall:null,enquiryPreparedAt:null,document:{activeElement:element('trigger'),fullscreenElement:null},bookings:appBookings,statusNotice:notice,dialog:modal,enquiryForm:element('form'),$:element,t:key=>key,explorer:{select:noOp,clear:noOp,setBookings:noOp},plan:{focus:noOp,update:noOp,setBookings:noOp},renderBookingStatus:noOp,renderDetail:noOp,renderDirectory:noOp,renderEnquiry:noOp,syncDirectorySelection:noOp,syncDirectoryBookings:noOp,syncQuickPickBookings:noOp,syncSelectedBooking:noOp,renderFlat:noOp,updateSelectionPin:noOp,showHover:noOp,stopAutoUI:noOp};
scope.switchHall=number=>{scope.hall=number;scope.selected=null;};vm.createContext(scope);
for(const name of['selectStall','statusRefusal','clearSelection','openEnquiry','syncBookingStatus'])vm.runInContext(actualFunction(name),scope);
const closeStart=appSource.indexOf("dialog.addEventListener('close',"),closeEnd=appSource.indexOf("});dialog.addEventListener('click'",closeStart);assert.ok(closeStart>=0&&closeEnd>closeStart);vm.runInContext(appSource.slice(closeStart,closeEnd+3),scope);
const resolveNext=(number,status)=>{const check=checks.shift();assert.equal(check.number,number);known.set(number,status);check.resolve({allowed:status!=='sold_out',reason:status,status});};
const oldSelection=scope.selectStall(65),latestSelection=scope.selectStall(66);assert.equal(scope.selected,null);checks[1].resolve({allowed:true,status:'available'});await latestSelection;assert.equal(scope.selected.n,66);checks[0].resolve({allowed:true,status:'available'});await oldSelection;assert.equal(scope.selected.n,66,'Older selection replaced the newest click');checks.length=0;
const soldSelection=scope.selectStall(67);resolveNext(67,'sold_out');await soldSelection;assert.equal(scope.selected.n,66);assert.equal(notice.kind,'sold_out');notice.close();
const reservedSelection=scope.selectStall(69);resolveNext(69,'reserved');await reservedSelection;assert.equal(scope.selected.n,69);assert.equal(notice.kind,'reserved');notice.close();
const firstOpen=scope.openEnquiry(stalls[64]),secondOpen=scope.openEnquiry(stalls[172]);checks[0].resolve({allowed:true,status:'available'});await firstOpen;assert.equal(modal.open,false,'An old open intent displayed an enquiry');checks[1].resolve({allowed:true,status:'available'});await secondOpen;assert.equal(modal.open,true);assert.equal(scope.enquiryStall.n,173);checks.length=0;modal.close();
// The actual detail-navigation listener must await selection and leave a warning
// dialog's keyboard focus alone.
const navLine=appSource.split('\n').find(line=>line.includes("el.querySelectorAll('[data-step]')")),navStart=navLine.indexOf("el.querySelectorAll('[data-step]')"),navCode=navLine.slice(navStart,-1),nextButton={dataset:{step:'1'}};
scope.el={querySelectorAll:()=>[nextButton]};scope.s=stalls[64];scope.hall=1;scope.selected=stalls[64];vm.runInContext(navCode,scope);focused=0;let navigation=nextButton.onclick();assert.equal(focused,0);resolveNext(66,'available');await navigation;assert.equal(scope.selected.n,66);assert.equal(focused,1);
scope.s=stalls[64];scope.selected=stalls[64];vm.runInContext(navCode,scope);focused=0;navigation=nextButton.onclick();resolveNext(66,'reserved');await navigation;assert.equal(focused,0,'Detail navigation stole focus from the reserved warning');assert.equal(notice.kind,'reserved');notice.close();
// A live sold-out update while a draft is open clears selection and closes the
// real enquiry dialog. Even an old successful check cannot hand off afterwards.
scope.selected=stalls[64];scope.enquiryStall={...stalls[64],status:'available'};modal.open=true;const epoch=scope.enquiryIntent,blankURLs=[],currentURLs=[],blank={closed:false,document:{body:{}},location:{replace:url=>blankURLs.push(url)},close(){this.closed=true;}};let completeCheck;
const pendingHandoff=guardedWhatsAppHandoff({stall:stalls[64],openWindow:()=>blank,navigateCurrent:url=>currentURLs.push(url),checkStatus:()=>new Promise(resolve=>completeCheck=resolve),isCurrent:()=>scope.enquiryIntent===epoch&&modal.open,getDraft:()=>assert.fail('Closed sold-out dialog produced an outgoing draft')});
known.set(65,'sold_out');scope.syncBookingStatus({changed:true,state:'live',statuses:new Map(known),booked:new Set([65])});assert.equal(scope.selected,null);assert.equal(modal.open,false);assert.equal(notice.kind,'sold_out');completeCheck({allowed:true,status:'available'});assert.equal((await pendingHandoff).reason,'cancelled');assert.ok(blank.closed);assert.equal(blankURLs.length,0);assert.equal(currentURLs.length,0);
console.log('PASS: actual app rapid selection/open intent cancellation, sold-out click blocking, reserved notice, awaited detail-nav focus, and sold-out refresh during a pending enquiry prevent every outgoing URL.');

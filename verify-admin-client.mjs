import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stalls,halls,colors} from './dist/data.js';

// Execute the authored client with a small DOM/event adapter and an isolated
// revision-aware API fixture. No browser, HTTP call or production secret is used.
class Element{
 constructor(){
  this.hidden=false;this.disabled=false;this.value='';this._text='';this.innerHTML='';this.dataset={};this.attrs=new Map();this.children=[];this.handlers={};this.sub=new Map();this.classes=new Set();
  this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),remove:(...names)=>names.forEach(name=>this.classes.delete(name)),toggle:(name,force)=>{const active=force??!this.classes.has(name);active?this.classes.add(name):this.classes.delete(name);return active;},contains:name=>this.classes.has(name)};
  this.style={setProperty(){}};
 }
 get textContent(){return this._text;}set textContent(value){this._text=String(value);}
 setAttribute(key,value){this.attrs.set(key,String(value));}
 append(child){this.children.push(child);}
 addEventListener(type,handler){this.handlers[type]=handler;}
 querySelector(selector){if(!this.sub.has(selector))this.sub.set(selector,new Element());return this.sub.get(selector);}
 matches(selector){return selector==='input[name="booking-status"]'&&this.name==='booking-status';}
 focus(){this.focused=true;}blur(){this.blurred=true;}
 scrollIntoView(options){this.scrolled=options;}
 reportValidity(){return !!this.value;}
}
const elements=new Map(),get=selector=>{if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);};
get('#status-filter').value='all';get('#admin-hall-1').dataset.hall='1';get('#admin-hall-2').dataset.hall='2';
const radios=['available','reserved','sold_out'].map(status=>{const input=new Element();input.name='booking-status';input.value=status;return input;});
const timestamp='2026-11-18T09:00:00.000Z',records=new Map(),requests=[],intervals=new Map();
let intervalId=0,authenticated=false,expire=false,hold=false,releasePut,invalidFeed=false,narrow=false;
const response=(status,data)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)});
function record(stall,status,revision){return{stall,status,booked:status!=='available',revision,updatedAt:timestamp};}
async function fetchMock(url,options){
 requests.push({url,options});
 if(url==='/api/admin/session')return response(authenticated?200:401,{authenticated});
 if(url==='/api/admin/login'){authenticated=JSON.parse(options.body).password==='test-only';return response(authenticated?200:401,{authenticated});}
 if(url==='/api/bookings')return response(200,{bookings:invalidFeed?[record(65,'invalid',9)]:[...records.values()],updatedAt:timestamp});
 if(url==='/api/admin/logout'){authenticated=false;return response(200,{authenticated:false});}
 if(url.startsWith('/api/admin/bookings/')){
  if(expire){authenticated=false;return response(401,{error:'Expired'});}
  const number=Number(url.split('/').at(-1)),body=JSON.parse(options.body),previous=records.get(number)??record(number,'available',0);
  assert.deepEqual(Object.keys(body).sort(),['revision','status'],'New client sends one canonical status representation');
  if(body.revision!==previous.revision)return response(409,{error:'Changed',booking:previous});
  const booking=record(number,body.status,previous.revision+1);
  if(hold){hold=false;return new Promise(resolve=>releasePut=()=>{records.set(number,booking);resolve(response(200,{booking}));});}
  records.set(number,booking);return response(200,{booking});
 }
 throw new Error('Unexpected fixture request '+url);
}
const documentRef={querySelector:get,querySelectorAll:selector=>selector==='[data-hall]'?[get('#admin-hall-1'),get('#admin-hall-2')]:selector==='input[name="booking-status"]'?radios:[],createElement:()=>new Element(),addEventListener(){},visibilityState:'visible',activeElement:null};
const context=vm.createContext({console,stalls,halls,colors,Map,Set,Date,Intl,Number,JSON,AbortController,setTimeout,clearTimeout,setInterval:fn=>{const id=++intervalId;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),fetch:fetchMock,matchMedia:query=>({matches:narrow&&query.includes('max-width')}),document:documentRef,window:{addEventListener(){}}});
const source=fs.readFileSync(new URL('./dist/admin.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
await vm.runInContext('(async()=>{'+source+';globalThis.test={state,cards,parseBooking,recordFor,selectStall,saveBooking};})()',context);
const api=context.test;
function choose(status){const input=radios.find(item=>item.value===status);get('#status-options').handlers.change({target:input});assert.equal(input.checked,true);}
const changes=()=>requests.filter(item=>item.url.startsWith('/api/admin/bookings/'));
const poll=()=>intervals.get(api.state.poll)();

assert.equal(get('#login-panel').hidden,false);assert.equal(get('#dashboard').hidden,true);assert.equal(api.cards.size,193);
get('#admin-password').value='test-only';await get('#login-form').handlers.submit({preventDefault(){}});
assert.equal(api.state.authenticated,true);assert.equal(get('#admin-password').value,'');assert.equal(api.state.loaded,true);
assert.equal(get('#total-available').textContent,'193');assert.equal(get('#total-reserved').textContent,'0');assert.equal(get('#total-sold-out').textContent,'0');
assert.equal(api.recordFor(1).revision,0);assert.equal(api.recordFor(1).status,'available');
api.selectStall(149,{reveal:false});assert.match(get('#source-note').textContent,/198/);
api.selectStall(114,{reveal:false});assert.match(get('#source-note').textContent,/conflicting dimensions/);
api.selectStall(194);assert.equal(api.state.selected,114,'Experience zones cannot be edited as stalls');
api.selectStall(65,{reveal:false});assert.equal(get('#selected-status').textContent,'Available');assert.equal(get('#save-booking').disabled,true);
let before=changes().length;await api.saveBooking();assert.equal(changes().length,before,'Unchanged status creates no update');
choose('reserved');assert.match(get('#status-draft-note').textContent,/Unsaved selection: Reserved/);
hold=true;const pending=api.saveBooking();assert.equal(api.recordFor(65).status,'available','Pending changes never appear saved');assert.equal(get('#save-booking').disabled,true);assert.equal(get('#status-options').disabled,true);releasePut();await pending;
assert.equal(api.recordFor(65).status,'reserved');assert.equal(api.recordFor(65).revision,1);assert.match(get('#save-success').textContent,/Saved: stall 65 is reserved/);
assert.equal(get('#total-available').textContent,'192');assert.equal(get('#total-reserved').textContent,'1');assert.equal(get('#selected-status').textContent,'Reserved');assert.equal(api.cards.get(65).classList.contains('status-reserved'),true);
get('#status-filter').value='reserved';get('#status-filter').handlers.change();assert.equal(get('#result-count').textContent,'1 / 119 stalls');assert.equal(api.cards.get(65).hidden,false);assert.equal(api.cards.get(1).hidden,true);
get('#status-filter').value='all';get('#status-filter').handlers.change();choose('sold_out');await api.saveBooking();
assert.equal(api.recordFor(65).status,'sold_out');assert.equal(api.recordFor(65).revision,2);assert.equal(get('#total-reserved').textContent,'0');assert.equal(get('#total-sold-out').textContent,'1');assert.equal(get('#selected-status').textContent,'Sold out');assert.equal(api.cards.get(65).classList.contains('status-sold-out'),true);
get('#status-filter').value='sold_out';get('#status-filter').handlers.change();assert.equal(get('#result-count').textContent,'1 / 119 stalls');
get('#status-filter').value='all';get('#status-filter').handlers.change();choose('available');await api.saveBooking();
assert.equal(api.recordFor(65).status,'available');assert.equal(api.recordFor(65).revision,3);assert.equal(get('#total-available').textContent,'193');assert.equal(get('#total-sold-out').textContent,'0');assert.equal(api.cards.get(65).classList.contains('status-available'),true);
assert.deepEqual(changes().slice(0,3).map(item=>JSON.parse(item.options.body)),[{status:'reserved',revision:0},{status:'sold_out',revision:1},{status:'available',revision:2}]);

// A refresh must not silently upgrade an unsaved edit's CAS revision.
choose('reserved');assert.equal(api.state.draftRevision,3);records.set(65,record(65,'sold_out',4));await poll();
assert.equal(api.recordFor(65).status,'sold_out');assert.equal(api.state.draftStatus,'reserved');assert.equal(api.state.draftRevision,3);assert.equal(radios.find(input=>input.value==='reserved').checked,true);assert.equal(get('#selected-status').textContent,'Sold out');
await api.saveBooking();assert.equal(changes().at(-1).options.body,JSON.stringify({status:'reserved',revision:3}));assert.equal(records.get(65).status,'sold_out');assert.equal(api.state.draftStatus,'sold_out');assert.equal(api.state.draftRevision,4);assert.match(get('#save-error').textContent,/another session/);assert.equal(get('#save-booking').disabled,true);
choose('available');await api.saveBooking();assert.equal(api.recordFor(65).revision,5);assert.equal(api.recordFor(65).status,'available');
invalidFeed=true;await poll();assert.equal(api.state.needsRefresh,true);assert.equal(api.recordFor(65).status,'available');assert.equal(get('#status-options').disabled,true);invalidFeed=false;await get('#refresh').handlers.click();assert.equal(api.state.needsRefresh,false);

assert.equal(api.parseBooking({stall:1,booked:true,revision:1,updatedAt:timestamp}).status,'sold_out','Old occupied feed cannot be reopened by the client');
assert.equal(api.parseBooking({stall:1,booked:false,revision:1,updatedAt:timestamp}).status,'available');
for(const item of[{stall:1,status:'unknown',booked:true,revision:1,updatedAt:timestamp},{stall:1,status:'available',booked:true,revision:1,updatedAt:timestamp},{stall:1,status:'reserved',booked:false,revision:1,updatedAt:timestamp},{stall:1,status:'sold_out',booked:true,revision:0,updatedAt:timestamp},{stall:1,status:'reserved',booked:true,revision:1,updatedAt:'not-a-date'}])assert.throws(()=>api.parseBooking(item));

narrow=true;documentRef.activeElement=get('#stall-search');api.selectStall(173);assert.equal(get('#stall-search').blurred,true);assert.equal(get('#stall-detail').scrolled.block,'start');assert.equal(api.state.hall,2);assert.equal(get('#selected-status').textContent,'Available');
choose('reserved');expire=true;await api.saveBooking();assert.equal(api.state.authenticated,false);assert.equal(get('#dashboard').hidden,true);assert.match(get('#login-error').textContent,/session expired/);assert.equal(get('#admin-password').value,'');assert.equal(api.state.draftStatus,null);assert.equal(intervals.size,0);
for(const {url,options}of requests){assert.equal(options.credentials,'same-origin');assert.ok(!url.includes('password'));}
const html=fs.readFileSync(new URL('./dist/admin.html',import.meta.url),'utf8');assert.match(html,/<form id="login-form" method="post" action="\/api\/admin\/login">/);assert.match(html,/maxlength="256"/);
console.log('PASS: actual admin client three-state saves, no optimistic status, counters/filter/tags, preserved unsaved CAS revision on polling, conflict reset, malformed feed lock, legacy occupied safety, narrow-screen selection reveal and auth expiry.');

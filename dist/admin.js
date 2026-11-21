import{stalls,halls,colors}from'./data.js?v=a1c783d9ed280196';

const $=selector=>document.querySelector(selector);
const statusNames={available:'Available',reserved:'Reserved',sold_out:'Sold out'};
const statusClass=status=>'status-'+status.replaceAll('_','-');
const tierNames={starPrime:'Star Prime',prime:'Prime',platinum:'Platinum',starGold:'Star Gold',golden:'Golden',silver:'Silver'};
const stallByNumber=new Map(stalls.map(stall=>[stall.n,stall])),cards=new Map();
const state={authenticated:false,epoch:0,hall:1,selected:null,bookings:new Map(),loaded:false,loading:false,saving:null,needsRefresh:false,requestSerial:0,poll:null,draftStatus:null,draftRevision:0};
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value);
const date=value=>{if(!value)return 'Default status';const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?'Not available':new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(parsed)+' IST';};
const recordFor=number=>state.bookings.get(number)??{stall:number,status:'available',booked:false,updatedAt:null,revision:0};
const statusFor=number=>!state.loaded?'Not loaded':statusNames[recordFor(number).status];
function resetDraft(){const record=recordFor(state.selected);state.draftStatus=record.status;state.draftRevision=record.revision;}
function setStatusClass(element,status){for(const key of Object.keys(statusNames))element.classList.remove(statusClass(key));if(status)element.classList.add(statusClass(status));}
function pageStatus(message='',error=false){const el=$('#page-status');el.textContent=message;el.classList.toggle('error',error);}
function saveMessage(message='',error=false){$('#save-success').textContent=error?'':message;$('#save-error').textContent=error?message:'';}
const validTimestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
function parseBooking(record){
 if(!record||!stallByNumber.has(record.stall)||typeof record.booked!=='boolean'||!Number.isInteger(record.revision)||record.revision<1||!validTimestamp(record.updatedAt))throw new Error('Invalid booking response');
 const status=record.status===undefined?(record.booked?'sold_out':'available'):record.status;
 if(!Object.hasOwn(statusNames,status)||record.booked!==(status!=='available'))throw new Error('Invalid booking status');
 return{stall:record.stall,status,booked:record.booked,revision:record.revision,updatedAt:record.updatedAt};
}
async function request(url,{method='GET',body}={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});let data=null;const text=await response.text();if(text){try{data=JSON.parse(text);}catch{if(response.ok)throw new Error('Unexpected server response');}}return{ok:response.ok,status:response.status,data};}finally{clearTimeout(timeout);}
}
function stopPolling(){if(state.poll)clearInterval(state.poll);state.poll=null;}
function showLogin(message=''){
 stopPolling();state.epoch++;state.authenticated=false;state.requestSerial++;state.bookings.clear();state.loaded=false;state.loading=false;state.saving=null;state.needsRefresh=false;state.selected=null;state.draftStatus=null;state.draftRevision=0;
 $('#auth-loading').hidden=true;$('#dashboard').hidden=true;$('#logout').hidden=true;$('#login-panel').hidden=false;$('#admin-password').value='';$('#admin-password').type='password';$('#show-password').textContent='Show';$('#show-password').setAttribute('aria-pressed','false');$('#login-error').textContent=message;$('#login-submit').disabled=false;$('#login-submit').innerHTML='Sign in <span aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></span>';
}
function sessionExpired(){showLogin('Your session expired. Sign in again to update booking statuses.');$('#admin-password').focus({preventScroll:true});}
async function sessionIsValid(epoch){
 const response=await request('/api/admin/session');if(epoch!==state.epoch)return false;
 if(response.status===401||response.status===403){sessionExpired();return false;}
 if(!response.ok||response.data?.authenticated!==true)throw new Error('Could not verify session');return true;
}
async function refreshBookings({quiet=false,checkSession=false}={}){
 if(!state.authenticated||state.saving!==null)return;const epoch=state.epoch,serial=++state.requestSerial;state.loading=true;renderControls();renderDetail();if(!quiet)pageStatus('Refreshing booking statuses…');
 try{
  if(checkSession&&!await sessionIsValid(epoch))return;
  const response=await request('/api/bookings');if(epoch!==state.epoch||serial!==state.requestSerial)return;
  if(response.status===401||response.status===403){sessionExpired();return;}
  if(!response.ok||!Array.isArray(response.data?.bookings)||!validTimestamp(response.data.updatedAt))throw new Error('Could not load booking statuses');
  const next=new Map();for(const item of response.data.bookings){const booking=parseBooking(item),previous=next.get(booking.stall);if(!previous||booking.revision>=previous.revision)next.set(booking.stall,booking);}
  const dirty=state.selected!==null&&state.draftStatus!==recordFor(state.selected).status;state.bookings=next;state.loaded=true;state.needsRefresh=false;if(state.selected!==null&&(!dirty||state.draftStatus===recordFor(state.selected).status))resetDraft();$('#last-updated').textContent=response.data.updatedAt?'Updated '+date(response.data.updatedAt):'Booking statuses loaded';render();if(!quiet||$('#page-status').classList.contains('error'))pageStatus('Booking statuses are up to date.');
 }catch{
  if(epoch!==state.epoch||serial!==state.requestSerial)return;state.needsRefresh=true;pageStatus(state.loaded?'Could not refresh. The last loaded statuses are shown. Refresh before making another change.':'Could not load booking statuses. Use Refresh to try again.',true);render();
 }finally{if(epoch===state.epoch&&serial===state.requestSerial){state.loading=false;renderControls();renderDetail();}}
}
function startPolling(){
 stopPolling();state.poll=setInterval(async()=>{if(!state.authenticated||state.saving!==null||state.loading||document.visibilityState!=='visible')return;const epoch=state.epoch;try{if(await sessionIsValid(epoch))await refreshBookings({quiet:true});}catch{if(epoch===state.epoch&&state.authenticated){state.needsRefresh=true;pageStatus('Connection interrupted. Refresh to confirm your session and the latest booking statuses.',true);renderControls();renderDetail();}}},30000);
}
async function showDashboard(){
 state.epoch++;state.authenticated=true;state.loaded=false;state.needsRefresh=false;$('#login-panel').hidden=true;$('#auth-loading').hidden=true;$('#dashboard').hidden=false;$('#logout').hidden=false;$('#login-error').textContent='';$('#admin-password').value='';pageStatus('Loading booking statuses…');render();await refreshBookings({quiet:true});if(state.authenticated){if(state.loaded)pageStatus('');startPolling();}
}
function renderControls(){
 $('#refresh').disabled=state.loading||state.saving!==null;$('#refresh').innerHTML=state.loading?'Refreshing…':'Refresh <span aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/></svg></span>';$('#refresh').setAttribute('aria-busy',String(state.loading));$('#status-filter').disabled=!state.loaded;
}
function render(){
 const counts={available:0,reserved:0,sold_out:0};if(state.loaded)for(const stall of stalls)counts[recordFor(stall.n).status]++;
 for(const status of Object.keys(statusNames))$('#total-'+status.replaceAll('_','-')).textContent=state.loaded?counts[status]:'—';
 for(const hall of[1,2]){const count={available:0,reserved:0,sold_out:0};if(state.loaded)for(const stall of stalls.filter(stall=>stall.hall===hall))count[recordFor(stall.n).status]++;$('#hall-'+hall+'-summary').textContent=state.loaded?`${count.available} available · ${count.reserved} reserved · ${count.sold_out} sold out`:'Statuses not loaded';const tab=$('#admin-hall-'+hall),active=state.hall===hall;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
 $('#stall-panel').setAttribute('aria-labelledby','admin-hall-'+state.hall);$('#stall-grid').setAttribute('aria-label','Hall '+state.hall+' stalls');renderGrid();renderDetail();renderControls();
}
function renderGrid(){
 const query=$('#stall-search').value.trim(),filter=$('#status-filter').value;let shown=0;
 for(const stall of stalls){
  const card=cards.get(stall.n),record=recordFor(stall.n),matches=stall.hall===state.hall&&(!query||String(stall.n).includes(query))&&(filter==='all'||!state.loaded||filter===record.status);
  card.hidden=!matches;if(matches)shown++;setStatusClass(card,state.loaded?record.status:null);card.classList.toggle('not-loaded',!state.loaded);card.setAttribute('aria-pressed',String(state.selected===stall.n));card.setAttribute('aria-label',`Hall ${stall.hall}, stall ${stall.n}, ${tierNames[stall.tier]}, ${statusFor(stall.n)}`);card.querySelector('.card-status').textContent=statusFor(stall.n);
 }
 $('#result-count').textContent=shown+' / '+halls[state.hall].count+' stalls';$('#no-results').hidden=shown!==0;$('#stall-grid').hidden=shown===0;
}
function renderDetail(){
 const stall=stallByNumber.get(state.selected);$('#selection-empty').hidden=!!stall;$('#selection-details').hidden=!stall;$('#stall-detail').classList.toggle('has-selection',!!stall);$('#stall-detail').setAttribute('aria-labelledby',stall?'selected-title':'detail-title');if(!stall)return;
 const record=recordFor(stall.n);$('#stall-detail').style.setProperty('--selected-color',colors[stall.color]);$('#selected-title').textContent='Stall '+stall.n+' details';$('#selected-hall').textContent='Hall '+stall.hall+' / Stall';$('#selected-number').textContent=String(stall.n);$('#selected-tier span').textContent=tierNames[stall.tier];$('#selected-color').style.background=colors[stall.color];$('#selected-status').textContent=statusFor(stall.n);setStatusClass($('#selected-status'),state.loaded?record.status:null);$('#selected-price').textContent=money(stall.price);$('#selected-size').textContent=stall.size||'Confirm with organiser';$('#selected-updated').textContent=state.loaded?date(record.updatedAt):'Not loaded';
 const note=stall.sourceIssue==='numberConflict'?'The supplied map prints 198; the tariff list identifies this stall as 149.':stall.sourceIssue==='sizeConflict'?'The supplied map and tariff list give conflicting dimensions. Confirm the size with the organiser.':'';$('#source-note').textContent=note;$('#source-note').hidden=!note;
 const unavailable=!state.loaded||state.loading||state.needsRefresh||state.saving!==null;
 $('#status-options').disabled=unavailable;for(const input of document.querySelectorAll('input[name="booking-status"]'))input.checked=input.value===state.draftStatus;
 const changed=state.draftStatus!==record.status;$('#status-draft-note').textContent=!state.loaded?'Load statuses before editing.':state.needsRefresh?'Refresh before editing.':changed?'Unsaved selection: '+statusNames[state.draftStatus]+'.':'The saved status is shown above.';
 const button=$('#save-booking');button.disabled=unavailable||!changed;button.setAttribute('aria-busy',String(state.saving===stall.n));button.textContent=state.saving!==null?'Saving stall '+state.saving+'…':!state.loaded?'Load statuses first':state.needsRefresh?'Refresh before updating':changed?'Save status':'Status unchanged';
}
function selectStall(number,{reveal=true}={}){
 const stall=stallByNumber.get(number);if(!stall)return;state.hall=stall.hall;state.selected=number;resetDraft();saveMessage();render();if(reveal&&matchMedia('(max-width:850px)').matches){if(document.activeElement===$('#stall-search'))$('#stall-search').blur();$('#stall-detail').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}
}
function switchHall(number){state.hall=number;state.selected=null;state.draftStatus=null;$('#stall-search').value='';saveMessage();render();}
async function saveBooking(){
 const stall=stallByNumber.get(state.selected);if(!stall||!state.authenticated||!state.loaded||state.loading||state.needsRefresh||state.saving!==null)return;
 const current=recordFor(stall.n),desired=state.draftStatus,revision=state.draftRevision,epoch=state.epoch;if(!Object.hasOwn(statusNames,desired)||desired===current.status)return;
 state.saving=stall.n;state.loading=false;state.requestSerial++;saveMessage();renderControls();renderDetail();let conflict=false;
 try{
  const response=await request('/api/admin/bookings/'+stall.n,{method:'PUT',body:{status:desired,revision}});if(epoch!==state.epoch||!state.authenticated)return;
  if(response.status===401||response.status===403){sessionExpired();return;}
  if(response.status===409){conflict=true;if(response.data?.booking){const latest=parseBooking(response.data.booking);if(latest.stall===stall.n)state.bookings.set(stall.n,latest);}if(state.selected===stall.n)resetDraft();saveMessage('Stall '+stall.n+' changed in another session. The latest saved status is being refreshed. Review it before saving again.',true);render();return;}
  if(!response.ok)throw new Error('Save failed');const saved=parseBooking(response.data?.booking);if(saved.stall!==stall.n||saved.status!==desired)throw new Error('Save was not confirmed');state.bookings.set(stall.n,saved);if(state.selected===stall.n)resetDraft();$('#last-updated').textContent='Updated '+date(saved.updatedAt);render();const message='Saved: stall '+stall.n+' is '+statusNames[saved.status].toLowerCase()+'.';if(state.selected===stall.n)saveMessage(message);else pageStatus(message);
 }catch{if(epoch!==state.epoch||!state.authenticated)return;state.needsRefresh=true;saveMessage('This save could not be confirmed. Refresh to load the latest status before trying again.',true);pageStatus('Refresh is required before another booking change.',true);
 }finally{if(epoch===state.epoch&&state.authenticated){state.saving=null;renderControls();renderDetail();if(conflict)await refreshBookings({quiet:true});}}
}

for(const stall of stalls){const card=document.createElement('button');card.type='button';card.className='stall-card';card.dataset.stall=String(stall.n);card.style.setProperty('--stall-color',colors[stall.color]);card.innerHTML=`<strong>${stall.n}</strong><span class="card-tier">${tierNames[stall.tier]}</span><span class="card-status">Not loaded</span>`;cards.set(stall.n,card);$('#stall-grid').append(card);}
$('#stall-grid').addEventListener('click',event=>{const card=event.target.closest('[data-stall]');if(card)selectStall(Number(card.dataset.stall));});
for(const tab of document.querySelectorAll('[data-hall]')){tab.addEventListener('click',()=>switchHall(Number(tab.dataset.hall)));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const hall=event.key==='Home'?1:event.key==='End'?2:state.hall===1?2:1;switchHall(hall);$('#admin-hall-'+hall).focus();});}
$('#stall-search').addEventListener('input',renderGrid);$('#status-filter').addEventListener('change',renderGrid);
$('#stall-search-form').addEventListener('submit',event=>{event.preventDefault();const query=$('#stall-search').value.trim();if(/^\d+$/.test(query)&&stallByNumber.has(Number(query))){$('#stall-search').value=String(Number(query));$('#status-filter').value='all';pageStatus('');selectStall(Number(query));}else pageStatus('Enter a stall number from 1 to 193.',true);});
$('#status-options').addEventListener('change',event=>{if(event.target.matches('input[name="booking-status"]')&&Object.hasOwn(statusNames,event.target.value)){state.draftStatus=event.target.value;saveMessage();renderDetail();}});
$('#clear-selection').addEventListener('click',()=>{const card=cards.get(state.selected);state.selected=null;state.draftStatus=null;saveMessage();render();if(card&&!card.hidden)card.focus({preventScroll:true});else $('#admin-hall-'+state.hall).focus({preventScroll:true});});$('#save-booking').addEventListener('click',saveBooking);$('#refresh').addEventListener('click',()=>refreshBookings({checkSession:true}));
$('#show-password').addEventListener('click',()=>{const shown=$('#admin-password').type==='text';$('#admin-password').type=shown?'password':'text';$('#show-password').textContent=shown?'Show':'Hide';$('#show-password').setAttribute('aria-pressed',String(!shown));});
$('#login-form').addEventListener('submit',async event=>{
 event.preventDefault();const input=$('#admin-password');if(!input.value){input.reportValidity();return;}const button=$('#login-submit');button.disabled=true;button.textContent='Signing in…';$('#login-error').textContent='';
 try{const response=await request('/api/admin/login',{method:'POST',body:{password:input.value}});input.value='';if(!response.ok||response.data?.authenticated!==true){$('#login-error').textContent=response.status===429?'Too many attempts. Please wait before trying again.':response.status===401||response.status===403?'That password was not accepted. Please try again.':'Could not sign in. Please try again.';return;}await showDashboard();}catch{input.value='';$('#login-error').textContent='Could not reach the sign-in service. Please try again.';}finally{button.disabled=false;button.innerHTML='Sign in <span aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></span>';}
});
$('#logout').addEventListener('click',async()=>{const button=$('#logout');button.disabled=true;button.textContent='Signing out…';try{const response=await request('/api/admin/logout',{method:'POST'});if(!response.ok&&response.status!==401)throw new Error('Sign out failed');showLogin();$('#admin-password').focus({preventScroll:true});}catch{pageStatus('Sign-out could not be confirmed. Please try again.',true);}finally{button.disabled=false;button.textContent='Sign out';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.authenticated&&!state.loading&&state.saving===null)refreshBookings({quiet:true,checkSession:true});});
window.addEventListener('pagehide',stopPolling);
try{const session=await request('/api/admin/session');if(session.ok&&session.data?.authenticated===true)await showDashboard();else if(session.status===401||session.status===403)showLogin();else showLogin('Could not verify your session. Sign in to try again.');}catch{showLogin('Could not reach the sign-in service. Please try again.');}

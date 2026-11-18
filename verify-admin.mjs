import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import {handleAPI,verifyPassword} from './worker/api.js';

const migrations=(await fs.readdir('drizzle')).filter(name=>name.endsWith('.sql')).sort();
assert.ok(migrations.length>=2,'Three-state booking support appends a migration');
const migrationSQL=await Promise.all(migrations.map(name=>fs.readFile('drizzle/'+name,'utf8')));
// Exercise the actual upgrade over existing boolean records. The schema upgrade
// must leave their booked bits, revisions and timestamps unchanged.
const upgrade=new DatabaseSync(':memory:');
upgrade.exec(migrationSQL[0]);
upgrade.prepare('INSERT INTO stall_bookings (stall,booked,revision,updated_at) VALUES (?,?,?,?)').run(172,0,3,'2026-11-17T12:00:00.000Z');
upgrade.prepare('INSERT INTO stall_bookings (stall,booked,revision,updated_at) VALUES (?,?,?,?)').run(173,1,7,'2026-11-17T13:00:00.000Z');
for(const sql of migrationSQL.slice(1))upgrade.exec(sql);
assert.deepEqual(upgrade.prepare('SELECT stall,booked,status,revision,updated_at FROM stall_bookings ORDER BY stall').all().map(row=>({...row})),[
 {stall:172,booked:0,status:0,revision:3,updated_at:'2026-11-17T12:00:00.000Z'},
 {stall:173,booked:1,status:0,revision:7,updated_at:'2026-11-17T13:00:00.000Z'},
]);
upgrade.close();

const database=new DatabaseSync(':memory:');
for(const sql of migrationSQL)database.exec(sql);
class Statement{
 constructor(sql,values=[]){this.sql=sql;this.values=values;}
 bind(...values){return new Statement(this.sql,values);}
 async first(){return database.prepare(this.sql).get(...this.values)||null;}
 async all(){return {results:database.prepare(this.sql).all(...this.values)};}
 async run(){return database.prepare(this.sql).run(...this.values);}
}
const DB={prepare:sql=>new Statement(sql),async batch(statements){database.exec('BEGIN');try{const result=await Promise.all(statements.map(s=>s.run()));database.exec('COMMIT');return result;}catch(error){database.exec('ROLLBACK');throw error;}}};
const password='fixture-password-for-testing-only',salt=randomBytes(16),encoded=`pbkdf2_sha256$100000$${salt.toString('base64')}$${pbkdf2Sync(password,salt,100000,32,'sha256').toString('base64')}`;
const env={DB,ADMIN_PASSWORD_HASH:encoded},origin='https://expo.example';
let cookie='';
function request(path,{method='GET',body,headers={},session=true}={}){return new Request(origin+path,{method,headers:{...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...(session&&cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});}
async function call(path,options){return handleAPI(request(path,options),env);}
async function feed(){return (await (await call('/api/bookings')).json()).bookings;}
async function save(stall,body){return call('/api/admin/bookings/'+stall,{method:'PUT',body});}
assert.equal(await verifyPassword(password,encoded),true);assert.equal(await verifyPassword('wrong',encoded),false);assert.equal(await verifyPassword(password,'bad'),false);
assert.equal(await handleAPI(request('/'),env),null);
assert.equal((await handleAPI(request('/api/bookings'),{})).status,503);
assert.equal((await call('/api/admin/session')).status,401);
assert.deepEqual(await feed(),[]);
for(const path of ['/api/admin/login','/api/admin/logout','/api/admin/bookings/1'])assert.equal((await call(path,{method:path.includes('bookings')?'PUT':'POST',body:{password},headers:{Origin:'https://attacker.example'}})).status,403);
assert.equal((await call('/api/admin/login',{method:'POST',body:{password:'wrong'}})).status,401);
assert.equal((await call('/api/admin/login',{method:'POST',body:{password},headers:{'Content-Type':'text/plain'}})).status,415);
assert.equal((await call('/api/admin/login',{method:'POST',body:'{bad'})).status,400);
assert.equal((await call('/api/admin/login',{method:'POST',body:JSON.stringify({password:'x'.repeat(5000)})})).status,413);
const streamRequest=new Request(origin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('x'.repeat(5000)));controller.close();}}),duplex:'half'});
assert.equal((await handleAPI(streamRequest,env)).status,413);
const login=await call('/api/admin/login',{method:'POST',body:{password}});assert.equal(login.status,200);const setCookie=login.headers.get('Set-Cookie');
for(const flag of ['__Host-expo_admin=','Secure','HttpOnly','SameSite=Strict','Path=/','Max-Age=28800'])assert.ok(setCookie.includes(flag));
cookie=setCookie.split(';')[0];assert.equal((await call('/api/admin/session')).status,200);
const stored=database.prepare('SELECT * FROM admin_sessions').get();assert.ok(!cookie.includes(stored.token_hash));assert.ok(!JSON.stringify(stored).includes(password));
for(const body of [{booked:true,revision:0},{status:'reserved',revision:0}]){
 assert.equal((await call('/api/admin/bookings/1',{method:'PUT',body,headers:{Origin:'https://attacker.example'}})).status,403);
 assert.equal((await call('/api/admin/bookings/1',{method:'PUT',body,session:false})).status,401);
}
// Existing callers retain their boolean contract: true is sold out, false is available.
const created=await save(1,{booked:true,revision:0});assert.equal(created.status,200);const first=(await created.json()).booking;
assert.deepEqual(first,{stall:1,status:'sold_out',booked:true,revision:1,updatedAt:(await feed())[0].updatedAt});
const firstConflict=await save(1,{booked:false,revision:0});assert.equal(firstConflict.status,409);assert.deepEqual((await firstConflict.json()).booking,first);
assert.equal((await save(1,{booked:false,revision:1})).status,200);
const legacyConflict=await save(1,{booked:true,revision:1});assert.equal(legacyConflict.status,409);assert.equal((await legacyConflict.json()).booking.status,'available');
const reopened=(await feed())[0];assert.equal(reopened.status,'available');assert.equal(reopened.booked,false);assert.equal(reopened.revision,2);

// Every directed transition among the three statuses works, with compatible
// boolean output and an incremented revision confirmed in the stored row.
let revision=0;
for(const status of ['available','reserved','sold_out','available','sold_out','reserved','available']){
 const response=await save(2,{status,revision});assert.equal(response.status,200);
 const booking=(await response.json()).booking;revision++;
 assert.equal(booking.status,status);assert.equal(booking.booked,status!=='available');assert.equal(booking.revision,revision);
 const row=database.prepare('SELECT booked,status,revision FROM stall_bookings WHERE stall=2').get();
 assert.equal(row.booked,status==='available'?0:1);assert.equal(row.status,{available:0,reserved:1,sold_out:2}[status]);assert.equal(row.revision,revision);
 assert.deepEqual((await feed()).find(row=>row.stall===2),booking);
}
const beforeRace=revision;
const race=await Promise.all([save(2,{status:'reserved',revision:beforeRace}),save(2,{status:'sold_out',revision:beforeRace})]);
assert.deepEqual(race.map(response=>response.status).sort(),[200,409]);
const winner=(await race.find(response=>response.status===200).json()).booking;
assert.deepEqual((await race.find(response=>response.status===409).json()).booking,winner);
assert.equal(winner.revision,beforeRace+1);

// A pre-upgrade booked row keeps its occupied status even with the new default
// status=0. Only an explicit authenticated current-revision edit can reopen it.
const legacyTimestamp='2026-11-17T13:00:00.000Z';
database.prepare('INSERT INTO stall_bookings (stall,booked,revision,updated_at) VALUES (?,?,?,?)').run(173,1,7,legacyTimestamp);
assert.deepEqual((await feed()).find(row=>row.stall===173),{stall:173,status:'sold_out',booked:true,revision:7,updatedAt:legacyTimestamp});
assert.equal(database.prepare('SELECT status FROM stall_bookings WHERE stall=173').get().status,0,'Reading legacy status does not rewrite inventory');
const staleLegacy=await save(173,{status:'available',revision:6});assert.equal(staleLegacy.status,409);assert.equal((await staleLegacy.json()).booking.status,'sold_out');
const explicitReopen=await save(173,{status:'available',revision:7});assert.equal(explicitReopen.status,200);assert.equal((await explicitReopen.json()).booking.status,'available');
assert.equal(database.prepare('SELECT booked FROM stall_bookings WHERE stall=173').get().booked,0);

const invalidBodies=[
 {booked:'true',revision:0},{booked:true,revision:-1},{booked:true,revision:1.2},{booked:true,revision:2147483647},
 {status:'pending',revision:0},{status:'sold out',revision:0},{status:'Reserved',revision:0},{status:' reserved ',revision:0},
 {status:0,revision:0},{status:true,revision:0},{status:null,revision:0},{status:{},revision:0},{status:[],revision:0},{status:'',revision:0},
 {status:'reserved',revision:-1},{status:'reserved',revision:1.2},{status:'reserved',revision:2147483647},{status:'available'},
 {status:'reserved',booked:true,revision:0},{status:'available',booked:false,revision:0},{status:'sold_out',booked:false,revision:0},
 {revision:0},
];
for(const body of invalidBodies)assert.equal((await save(4,body)).status,400,JSON.stringify(body));
for(const stall of [0,194])for(const body of [{booked:true,revision:0},{status:'reserved',revision:0}])assert.equal((await save(stall,body)).status,400);
assert.throws(()=>database.prepare('INSERT INTO stall_bookings (stall,booked,status,revision,updated_at) VALUES (5,0,3,1,?)').run(legacyTimestamp),/constraint/i,'The migration rejects out-of-range status values');
const bookingJSON=JSON.stringify(await (await call('/api/bookings')).json());assert.ok(!bookingJSON.includes('token'));assert.ok(!bookingJSON.includes(password));
assert.match((await call('/api/bookings')).headers.get('Cache-Control'),/no-store/);
for(let i=0;i<8;i++)assert.equal((await call('/api/admin/login',{method:'POST',body:{password:'bad'},headers:{'CF-Connecting-IP':'198.51.100.7'}})).status,401);
const limited=await call('/api/admin/login',{method:'POST',body:{password},headers:{'CF-Connecting-IP':'198.51.100.7'}});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('Retry-After'))>0);
assert.equal((await handleAPI(request('/api/admin/session'),{...env,ADMIN_PASSWORD_HASH:encoded+'changed'})).status,401);
assert.equal((await call('/api/admin/logout',{method:'POST'})).status,200);assert.equal((await call('/api/admin/session')).status,401);
const secondLogin=await call('/api/admin/login',{method:'POST',body:{password}});cookie=secondLogin.headers.get('Set-Cookie').split(';')[0];database.exec('UPDATE admin_sessions SET expires_at=1');assert.equal((await call('/api/admin/session')).status,401);
assert.equal(database.prepare('SELECT count(*) as total FROM stall_bookings').get().total,3,'Invalid and unauthenticated requests did not create inventory records');
database.close();
console.log('PASS: actual SQLite migration preserves legacy bookings; all available/reserved/sold-out transitions, legacy API compatibility, CAS conflicts/races, invalid status guards, auth/session/CSRF/expiry/rate/body limits and public status privacy.');

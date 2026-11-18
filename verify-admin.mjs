import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import {handleAPI,verifyPassword} from './worker/api.js';

const database=new DatabaseSync(':memory:');
for(const name of (await fs.readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())database.exec(await fs.readFile('drizzle/'+name,'utf8'));
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
assert.equal(await verifyPassword(password,encoded),true);assert.equal(await verifyPassword('wrong',encoded),false);assert.equal(await verifyPassword(password,'bad'),false);
assert.equal(await handleAPI(request('/'),env),null);
assert.equal((await handleAPI(request('/api/bookings'),{})).status,503);
assert.equal((await call('/api/admin/session')).status,401);
assert.deepEqual((await (await call('/api/bookings')).json()).bookings,[]);
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
assert.equal((await call('/api/admin/bookings/1',{method:'PUT',body:{booked:true,revision:0},headers:{Origin:'https://attacker.example'}})).status,403);
assert.equal((await call('/api/admin/bookings/1',{method:'PUT',body:{booked:true,revision:0},session:false})).status,401);
const created=await call('/api/admin/bookings/1',{method:'PUT',body:{booked:true,revision:0}});assert.equal(created.status,200);assert.deepEqual(await created.json(),{booking:{stall:1,booked:true,revision:1,updatedAt:(await (await call('/api/bookings')).json()).bookings[0].updatedAt}});
const firstConflict=await call('/api/admin/bookings/1',{method:'PUT',body:{booked:false,revision:0}});assert.equal(firstConflict.status,409);assert.equal((await firstConflict.json()).booking.booked,true);
assert.equal((await call('/api/admin/bookings/1',{method:'PUT',body:{booked:false,revision:1}})).status,200);
assert.equal((await call('/api/admin/bookings/1',{method:'PUT',body:{booked:true,revision:1}})).status,409);
const reopened=(await (await call('/api/bookings')).json()).bookings[0];assert.equal(reopened.booked,false);assert.equal(reopened.revision,2);
for(const [path,body] of [
 ['/api/admin/bookings/0',{booked:true,revision:0}],['/api/admin/bookings/194',{booked:true,revision:0}],['/api/admin/bookings/4',{booked:'true',revision:0}],['/api/admin/bookings/4',{booked:true,revision:-1}],['/api/admin/bookings/4',{booked:true,revision:1.2}],['/api/admin/bookings/4',{booked:true,revision:2147483647}]
])assert.equal((await call(path,{method:'PUT',body})).status,400);
const bookingJSON=JSON.stringify(await (await call('/api/bookings')).json());assert.ok(!bookingJSON.includes('token'));assert.ok(!bookingJSON.includes(password));
assert.match((await call('/api/bookings')).headers.get('Cache-Control'),/no-store/);
for(let i=0;i<8;i++)assert.equal((await call('/api/admin/login',{method:'POST',body:{password:'bad'},headers:{'CF-Connecting-IP':'198.51.100.7'}})).status,401);
const limited=await call('/api/admin/login',{method:'POST',body:{password},headers:{'CF-Connecting-IP':'198.51.100.7'}});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('Retry-After'))>0);
assert.equal((await handleAPI(request('/api/admin/session'),{...env,ADMIN_PASSWORD_HASH:encoded+'changed'})).status,401);
assert.equal((await call('/api/admin/logout',{method:'POST'})).status,200);assert.equal((await call('/api/admin/session')).status,401);
const secondLogin=await call('/api/admin/login',{method:'POST',body:{password}});cookie=secondLogin.headers.get('Set-Cookie').split(';')[0];database.exec('UPDATE admin_sessions SET expires_at=1');assert.equal((await call('/api/admin/session')).status,401);
assert.equal(database.prepare('SELECT count(*) as total FROM stall_bookings').get().total,1,'Untrusted requests did not modify records');
database.close();
console.log('PASS: actual SQLite migrations, server password/session/CSRF/expiry/rate-limit/body guards, shared booking updates, reopen, optimistic concurrency and public status privacy.');

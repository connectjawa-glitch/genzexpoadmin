import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Readable} from 'node:stream';
import handler,{proxyToBackend} from './server/backend-proxy.mjs';

const root=path.dirname(fileURLToPath(import.meta.url)),output=path.join(root,'vercel-public');
const exists=async file=>{try{await fs.stat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
assert.equal(await exists(path.join(root,'dist/index.html')),false,'The standalone admin source must not depend on the separate public website entry');
const build=spawnSync(process.execPath,['build-vercel.mjs'],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
assert.equal(build.status,0,'Standalone Vercel build failed: '+build.stderr);
async function walk(directory){const files=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())files.push(...await walk(file));else files.push(path.relative(output,file).split(path.sep).join('/'));}return files.sort();}
const publicFiles=await walk(output);
assert.deepEqual(publicFiles,['admin-mobile.css','admin.css','admin.js','assets/event-recreated.png','assets/favicon.svg','data.js','index.html','release.json']);
assert.equal(await exists(path.join(root,'dist/index.html')),false);
const html=await fs.readFile(path.join(output,'index.html'),'utf8');
assert.match(html,/id="login-form"[^>]*method="post"[^>]*action="\/api\/admin\/login"/);
assert.ok(html.includes('https://genzexpo.vercel.app/#halls'),'Public hall link points to the separate public site');
assert.ok(html.includes('class="brand" href="https://genzexpo.vercel.app/"'));
const queue=['index.html'],seen=new Set();let assetReferences=0;
function resolveAsset(from,reference){
 if(/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference))return null;
 const clean=decodeURIComponent(reference.split(/[?#]/)[0]);
 const resolved=path.resolve(output,clean.startsWith('/')?'.'+clean:path.join(path.dirname(from),clean));
 assert.ok(resolved.startsWith(output+path.sep),'Asset reference stays inside generated output');return path.relative(output,resolved).split(path.sep).join('/');
}
while(queue.length){const file=queue.shift();if(seen.has(file))continue;seen.add(file);assert.ok(publicFiles.includes(file),'Missing generated asset '+file);const extension=path.extname(file);if(!['.html','.js','.css','.json','.svg'].includes(extension))continue;const text=await fs.readFile(path.join(output,file),'utf8');
 assert.ok(!/ADMIN_PASSWORD_HASH|SESSION_SECRET|pbkdf2_sha256\$|BEGIN (?:RSA |EC )?PRIVATE KEY/.test(text),'Server credentials/source are not copied into '+file);
 const refs=extension==='.html'?[...text.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match=>match[1]):extension==='.js'?[...text.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)(['"])([^'"]+)\1/g)].map(match=>match[2]):extension==='.css'?[...text.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g)].map(match=>match[2]??match[4]):[];
 for(const reference of refs){const target=resolveAsset(file,reference);if(target){assetReferences++;assert.ok(publicFiles.includes(target),`${file} resolves ${reference}`);queue.push(target);}}
}
assert.ok(seen.has('admin.js')&&seen.has('admin.css')&&seen.has('admin-mobile.css')&&seen.has('data.js'));
for(const file of publicFiles.filter(file=>file!=='index.html'))assert.deepEqual(await fs.readFile(path.join(output,file)),await fs.readFile(path.join(root,'dist',file)),file+' is copied exactly');
for(const file of ['api/bookings.js','api/admin/session.js','api/admin/login.js','api/admin/logout.js','api/admin/bookings/[stall].js'])assert.equal((await import(pathToFileURL(path.join(root,file)).href)).default,handler,file+' exports the shared proxy handler');
const config=JSON.parse(await fs.readFile(path.join(root,'vercel.json'),'utf8'));assert.equal(config.outputDirectory,'vercel-public');assert.equal(config.buildCommand,'node build-vercel.mjs');assert.equal(config.installCommand,'');assert.ok(config.rewrites.some(rule=>rule.source==='/admin'&&rule.destination==='/index.html'));
console.log(`PASS: real standalone build without dist/index.html; ${publicFiles.length} safe public files, ${assetReferences} resolved asset/module references and five API wrappers.`);

const portal='https://admin-fixture.example',backend='https://booking-fixture.example',token='a'.repeat(64),cookie='__Host-expo_admin='+token;
const validCookie=cookie+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800';
const clearingCookie='__Host-expo_admin=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0';
const json=(data={authenticated:true},status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}});
function req(url='/api/admin/session',{method='GET',headers={},body,stream}={}){
 const request=stream?Readable.from(stream):{};Object.assign(request,{url,method,headers:{host:'admin-fixture.example',...(method==='GET'?{}:{origin:portal,'sec-fetch-site':'same-origin','content-type':'application/json'}),...headers}});if(body!==undefined)request.body=body;return request;
}
async function call(request,fetcher=async()=>json(),options={}){
 const headers=new Map(),response={statusCode:0,setHeader(name,value){headers.set(name.toLowerCase(),value);},end(body){this.raw=body;}};
 await proxyToBackend(request,response,{fetcher,backendOrigin:backend,...options});
 assert.match(headers.get('content-type'),/^application\/json/);assert.match(headers.get('cache-control'),/no-store/);assert.equal(headers.get('x-content-type-options'),'nosniff');assert.equal(headers.get('referrer-policy'),'no-referrer');
 return{status:response.statusCode,headers,data:JSON.parse(response.raw),raw:response.raw};
}
async function blocked(request,status,options={}){let fetched=false;const result=await call(request,async()=>{fetched=true;throw new Error('Guard failed');},options);assert.equal(result.status,status);assert.equal(fetched,false,'Rejected request must not reach the backend');return result;}
for(const url of ['/api/admin/login','/api/admin/logout','/api/admin/bookings/1']){
 const method=url.includes('/bookings/')?'PUT':'POST',body=url.endsWith('login')?{password:'fixture-only'}:{booked:true,revision:0};
 for(const headers of[{origin:''},{origin:'https://attacker.example'},{origin:portal,'sec-fetch-site':'cross-site'},{origin:'null'}])await blocked(req(url,{method,body,headers}),403);
}
await blocked(req('/api/admin/session',{headers:{'sec-fetch-site':'cross-site'}}),403);
for(const [url,method,allowed]of[['/api/bookings','POST','GET'],['/api/admin/session','POST','GET'],['/api/admin/login','GET','POST'],['/api/admin/logout','GET','POST'],['/api/admin/bookings/1','POST','PUT']]){const result=await blocked(req(url,{method,body:{}}),405);assert.equal(result.headers.get('allow'),allowed);}
for(const url of['/api/admin/bookings/0','/api/admin/bookings/194','/api/admin/bookings/01','/api/admin/bookings/1/extra','/api/admin/unknown','/worker/api.js','/api/admin/bookings/%31'])await blocked(req(url,{method:'PUT',body:{booked:true,revision:0}}),404);
for(const host of['','attacker.example@admin-fixture.example','admin-fixture.example/path','admin-fixture.example\r\nx-evil: true'])await blocked(req('/api/admin/session',{headers:{host}}),400);
await blocked(req('/api/admin/session',{headers:{host:['admin-fixture.example']}}),400);
for(const origin of['http://booking-fixture.example','https://user:password@booking-fixture.example','https://booking-fixture.example/path','https://booking-fixture.example/'])await blocked(req(),503,{backendOrigin:origin});
console.log('PASS: missing/mismatched/cross-site CSRF, cross-site GET session, host, method, path and backend-origin guards reject before fetch.');

let captured;
const capture=async(url,options)=>{captured={url,options};return json();};
await call(req('/api/admin/session',{headers:{cookie:'tracking=secret; '+cookie+'; other=discard',authorization:'Bearer do-not-forward','x-forwarded-for':'private','user-agent':'Fixture Browser'}}),capture);
assert.equal(captured.url,backend+'/api/admin/session');assert.equal(captured.options.headers.Cookie,cookie);assert.equal(captured.options.headers.Authorization,undefined);assert.equal(captured.options.headers['x-forwarded-for'],undefined);assert.equal(captured.options.headers['User-Agent'],'Fixture Browser');assert.equal(captured.options.redirect,'manual');
for(const invalid of['expo_admin='+token,'__Host-expo_admin=short','__Host-expo_admin='+'A'.repeat(64),cookie+'; '+cookie,'__Host-expo_admin='+token+'extra','__Host-expo_admin=']){await call(req('/api/admin/session',{headers:{cookie:invalid}}),capture);assert.equal(captured.options.headers.Cookie,undefined,invalid.slice(0,30));}
for(const url of['/api/bookings','/api/admin/login']){await call(req(url,{method:url.endsWith('login')?'POST':'GET',body:url.endsWith('login')?{password:'fixture-only'}:undefined,headers:{cookie}}),capture);assert.equal(captured.options.headers.Cookie,undefined,'No incoming session cookie on public/login requests');}
await call(req('/api/admin/bookings/193?discard=private',{method:'PUT',body:{booked:true,revision:0},headers:{cookie}}),capture);
assert.equal(captured.url,backend+'/api/admin/bookings/193');assert.equal(captured.options.method,'PUT');assert.equal(captured.options.headers.Origin,backend);assert.equal(captured.options.headers['Sec-Fetch-Site'],'same-origin');assert.equal(captured.options.headers['Content-Type'],'application/json');assert.equal(captured.options.headers.Cookie,cookie);assert.deepEqual(JSON.parse(captured.options.body),{booked:true,revision:0});
await call(req('/api/admin/logout',{method:'POST',headers:{cookie,'content-type':'text/plain'}}),capture);assert.equal(captured.options.body,undefined);assert.equal(captured.options.headers.Cookie,cookie);
console.log('PASS: only one valid host session token crosses authenticated routes; public/login cookies and unrelated credentials are stripped; upstream Origin is translated after CSRF checks.');

for(const type of['text/plain','application/x-www-form-urlencoded',''])await blocked(req('/api/admin/login',{method:'POST',body:{password:'fixture-only'},headers:{'content-type':type}}),415);
for(const body of['{broken','null','[]','42','"string"'])await blocked(req('/api/admin/login',{method:'POST',body}),400);
await blocked(req('/api/admin/login',{method:'POST',body:{password:'x'.repeat(5000)}}),413);
await blocked(req('/api/admin/login',{method:'POST',body:{password:'small'},headers:{'content-length':'4097'}}),413);
await blocked(req('/api/admin/login',{method:'POST',stream:[Buffer.from('x'.repeat(3000)),Buffer.from('x'.repeat(1200))]}),413);
for(const body of[{password:'fixture-only'},JSON.stringify({password:'fixture-only'}),Buffer.from(JSON.stringify({password:'fixture-only'}))]){await call(req('/api/admin/login',{method:'POST',body}),capture);assert.deepEqual(JSON.parse(captured.options.body),{password:'fixture-only'});}
await call(req('/api/admin/login',{method:'POST',stream:[Buffer.from('{"password":'),Buffer.from('"fixture-only"}')]}),capture);assert.deepEqual(JSON.parse(captured.options.body),{password:'fixture-only'});
console.log('PASS: login accepts parsed/string/buffer/stream JSON objects only, rejects wrong media/types/malformed data and enforces the 4096-byte input bound.');

let result=await call(req('/api/admin/login',{method:'POST',body:{password:'fixture-only'}}),async()=>json({authenticated:true},200,{'Set-Cookie':validCookie}));assert.deepEqual(result.headers.get('set-cookie'),[validCookie]);
result=await call(req('/api/admin/session'),async()=>json({error:'Please sign in.'},401,{'Set-Cookie':clearingCookie}));assert.equal(result.status,401);assert.deepEqual(result.headers.get('set-cookie'),[clearingCookie]);
for(const bad of[cookie+'; Path=/; HttpOnly; SameSite=Strict',cookie+'; Path=/; Secure; SameSite=Strict',cookie+'; Path=/; Secure; HttpOnly; SameSite=Lax',cookie+'; Path=/admin; Secure; HttpOnly; SameSite=Strict',validCookie+'; Domain=booking-fixture.example','other='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict',validCookie+'; Unexpected=1']){result=await call(req(),async()=>json({},200,{'Set-Cookie':bad}));assert.equal(result.headers.get('set-cookie'),undefined);}
const twoCookies=new Headers({'Content-Type':'application/json'});twoCookies.append('Set-Cookie',validCookie);twoCookies.append('Set-Cookie',clearingCookie);result=await call(req(),async()=>new Response('{}',{headers:twoCookies}));assert.equal(result.headers.get('set-cookie'),undefined,'Ambiguous multiple session cookies are not forwarded');
result=await call(req('/api/bookings'),async()=>json({bookings:[]},200,{'Set-Cookie':validCookie}));assert.equal(result.headers.get('set-cookie'),undefined);
const conflict={error:'Changed in another session',booking:{stall:1,booked:true,revision:2,updatedAt:'2026-11-18T00:00:00.000Z'}};result=await call(req('/api/admin/bookings/1',{method:'PUT',body:{booked:false,revision:1}}),async()=>json(conflict,409));assert.equal(result.status,409);assert.deepEqual(result.data,conflict);
for(const retry of['90','0','99999']){result=await call(req('/api/admin/login',{method:'POST',body:{password:'fixture-only'}}),async()=>json({error:'Try later'},429,{'Retry-After':retry}));assert.equal(result.status,429);assert.equal(result.headers.get('retry-after'),retry);}
for(const retry of['not-a-number','100000','-1','Wed, 18 Nov 2026 00:00:00 GMT']){result=await call(req(),async()=>json({error:'Limited'},429,{'Retry-After':retry}));assert.equal(result.headers.get('retry-after'),undefined);}
result=await call(req(),async()=>json({},200,{'Retry-After':'90'}));assert.equal(result.headers.get('retry-after'),undefined);
console.log('PASS: Secure/HttpOnly/SameSite=Strict/Path=/ host-only cookies, clearing, public-cookie suppression, 401/409 responses and bounded 429 Retry-After forwarding.');

const generic='Could not reach the booking service. Please try again.';
for(const fetcher of[
 async()=>new Response(null,{status:302,headers:{Location:'https://attacker.example/private'}}),
 async()=>new Response('<h1>secret backend failure</h1>',{status:500,headers:{'Content-Type':'text/html'}}),
 async()=>new Response('{broken',{headers:{'Content-Type':'application/json'}}),
 async()=>json(null),async()=>json([]),async()=>json('private error'),
 async()=>{throw new Error('Internal password/database/private-origin fixture sentinel');},
 async()=>json({},200,{'Content-Length':String(1024*1024+1)}),
 async()=>json({padding:'x'.repeat(1024*1024)})
]){result=await call(req(),fetcher);assert.equal(result.status,502);assert.equal(result.data.error,generic);assert.equal(result.headers.get('set-cookie'),undefined);assert.equal(result.headers.get('location'),undefined);assert.ok(!result.raw.includes('sentinel'));}
result=await call(req(),(_url,{signal})=>new Promise((_resolve,reject)=>{const abort=()=>reject(Object.assign(new Error('private timeout details'),{name:'AbortError'}));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}),{timeoutMs:5});assert.equal(result.status,502);assert.equal(result.data.error,generic);
console.log('PASS: redirects, non-JSON/invalid JSON, invalid payloads, upstream errors, 1MiB response limits and timeouts fail closed with sanitized JSON.');

// Server-only booking administration. No password or session token is bundled.
const COOKIE='__Host-expo_admin',SESSION_SECONDS=8*60*60,WINDOW_SECONDS=15*60,MAX_ATTEMPTS=8;
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const noStore={'Cache-Control':'no-store, max-age=0','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Cookie'};
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{...noStore,...headers}});
const fail=(error,status=400,headers={})=>json({error},status,headers);
const cookie=(token,maxAge)=>`${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
const decode64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const rowBooking=row=>row?{stall:row.stall,booked:row.booked===1,revision:row.revision,updatedAt:row.updated_at}:null;

export async function verifyPassword(password,encoded){
 try{
  const [format,rounds,salt,key,...extra]=String(encoded||'').split('$');
  if(format!=='pbkdf2_sha256'||Number(rounds)!==100000||extra.length||!salt||!key)return false;
  const expected=decode64(key),saltBytes=decode64(salt);
  if(expected.length!==32||saltBytes.length<16)return false;
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBytes,iterations:Number(rounds)},material,256));
  let difference=0;for(let i=0;i<expected.length;i++)difference|=actual[i]^expected[i];return difference===0;
 }catch{return false;}
}
async function bodyJSON(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))throw {status:415,message:'Send JSON data.'};
 if(Number(request.headers.get('Content-Length'))>4096)throw {status:413,message:'Request is too large.'};
 const reader=request.body?.getReader();if(!reader)throw {status:400,message:'Missing request data.'};
 let size=0,parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw {status:413,message:'Request is too large.'};}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||Array.isArray(value)||typeof value!=='object')throw 0;return value;}catch{throw {status:400,message:'Invalid request data.'};}
}
function sameOrigin(request){return request.headers.get('Origin')===new URL(request.url).origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site';}
async function authenticated(request,env){
 const token=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!/^[a-f0-9]{64}$/.test(token||''))return null;
 const row=await env.DB.prepare('SELECT token_hash, expires_at, generation FROM admin_sessions WHERE token_hash = ?').bind(await hash(token)).first();
 return row&&row.expires_at>Math.floor(Date.now()/1000)&&row.generation===await hash(env.ADMIN_PASSWORD_HASH)?row:null;
}
async function login(request,env,ctx){
 const input=await bodyJSON(request);
 if(typeof input.password!=='string'||!input.password||input.password.length>256)return fail('Enter the admin password.');
 const now=Math.floor(Date.now()/1000),window=Math.floor(now/WINDOW_SECONDS)*WINDOW_SECONDS;
 // Cloudflare supplies this header. Only its salted digest is stored.
 const key=await hash(`${env.ADMIN_PASSWORD_HASH}:${request.headers.get('CF-Connecting-IP')||'unknown'}`);
 const attempt=await env.DB.prepare('INSERT INTO admin_login_limits (client_key, window_start, attempts) VALUES (?, ?, 1) ON CONFLICT(client_key) DO UPDATE SET attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END, window_start = excluded.window_start RETURNING attempts').bind(key,window).first();
 if(attempt.attempts>MAX_ATTEMPTS)return fail('Too many sign-in attempts. Please try again in 15 minutes.',429,{'Retry-After':String(window+WINDOW_SECONDS-now)});
 if(!await verifyPassword(input.password,env.ADMIN_PASSWORD_HASH))return fail('Password is incorrect.',401);
 const token=randomToken(),tokenHash=await hash(token);
 await env.DB.prepare('INSERT INTO admin_sessions (token_hash, expires_at, generation) VALUES (?, ?, ?)').bind(tokenHash,now+SESSION_SECONDS,await hash(env.ADMIN_PASSWORD_HASH)).run();
 await env.DB.prepare('DELETE FROM admin_login_limits WHERE client_key = ?').bind(key).run();
 const cleanup=env.DB.batch([
  env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now),
  env.DB.prepare('DELETE FROM admin_login_limits WHERE window_start < ?').bind(window-WINDOW_SECONDS)
 ]);
 if(ctx?.waitUntil)ctx.waitUntil(cleanup.catch(()=>{}));else await cleanup;
 return json({authenticated:true},200,{'Set-Cookie':cookie(token,SESSION_SECONDS)});
}

export async function handleAPI(request,env,ctx){
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/api/'))return null;
 if(!env.DB||!env.ADMIN_PASSWORD_HASH)return fail('Booking management is temporarily unavailable.',503);
 try{
  if(path==='/api/bookings'&&request.method==='GET'){
   const result=await env.DB.prepare('SELECT stall, booked, revision, updated_at FROM stall_bookings ORDER BY stall').all();
   const bookings=result.results.map(rowBooking);return json({bookings,updatedAt:new Date().toISOString()});
  }
  if(!path.startsWith('/api/admin/'))return fail('Not found.',404);
  if(!['GET','POST','PUT'].includes(request.method))return fail('Method is not allowed.',405);
  if(request.method!=='GET'&&!sameOrigin(request))return fail('This request is not permitted.',403);
  if(path==='/api/admin/login'&&request.method==='POST')return await login(request,env,ctx);
  const session=await authenticated(request,env);
  if(!session)return fail('Please sign in to manage bookings.',401,{'Set-Cookie':cookie('',0)});
  if(path==='/api/admin/session'&&request.method==='GET')return json({authenticated:true});
  if(path==='/api/admin/logout'&&request.method==='POST'){
   await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(session.token_hash).run();
   return json({authenticated:false},200,{'Set-Cookie':cookie('',0)});
  }
  const match=path.match(/^\/api\/admin\/bookings\/(\d{1,3})$/);
  if(match&&request.method==='PUT'){
   const stall=Number(match[1]),input=await bodyJSON(request);
   if(stall<1||stall>193||typeof input.booked!=='boolean'||!Number.isSafeInteger(input.revision)||input.revision<0||input.revision>2147483646)return fail('Invalid stall booking update.');
   const updatedAt=new Date().toISOString();
   const row=input.revision===0
    ?await env.DB.prepare('INSERT INTO stall_bookings (stall, booked, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(stall) DO NOTHING RETURNING stall, booked, revision, updated_at').bind(stall,input.booked?1:0,updatedAt).first()
    :await env.DB.prepare('UPDATE stall_bookings SET booked = ?, revision = revision + 1, updated_at = ? WHERE stall = ? AND revision = ? RETURNING stall, booked, revision, updated_at').bind(input.booked?1:0,updatedAt,stall,input.revision).first();
   if(!row){const current=await env.DB.prepare('SELECT stall, booked, revision, updated_at FROM stall_bookings WHERE stall = ?').bind(stall).first();return json({error:'This stall was updated in another session. Review the latest status and try again.',booking:rowBooking(current)},409);}
   return json({booking:rowBooking(row)});
  }
  return fail('Not found.',404);
 }catch(error){return fail(error.status?error.message:'Booking management is temporarily unavailable.',error.status||503);}
}

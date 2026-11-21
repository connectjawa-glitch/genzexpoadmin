import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import worker from './dist/server/index.js';
const source=await fs.readFile('dist/server/index.js');
assert.ok(gzipSync(source,{level:9}).length<10*1024*1024,'Worker is within the compressed artifact budget');
const manifest=JSON.parse(await fs.readFile('.openai/hosting.json','utf8'));
assert.equal(manifest.static,undefined);assert.equal(manifest.d1,'DB');
assert.deepEqual(JSON.parse(await fs.readFile('dist/.openai/hosting.json','utf8')),manifest);
async function bytes(response){const raw=Buffer.from(await response.arrayBuffer());return response.headers.get('Content-Encoding')==='gzip'?gunzipSync(raw):raw;}
for(const [url,file,type]of [['/','index.html','text/html'],['/admin','admin.html','text/html'],['/admin/','admin.html','text/html'],['/admin.js','admin.js','text/javascript'],['/admin.css','admin.css','text/css'],['/assets/expo-logo-original.png','assets/expo-logo-original.png','image/png'],['/assets/event-recreated.png','assets/event-recreated.png','image/png'],['/records/hall2-preview.jpg','records/hall2-preview.jpg','image/jpeg'],['/records/expo-website-and-recreated-assets.zip','records/expo-website-and-recreated-assets.zip','application/zip']]){
 const response=await worker.fetch(new Request('https://expo.example'+url),{});assert.equal(response.status,200,url);assert.ok(response.headers.get('Content-Type').startsWith(type));assert.equal(response.headers.get('Content-Encoding'),null,'Stored compression is decoded before the hosting dispatch');assert.deepEqual(await bytes(response),await fs.readFile('dist/'+file),url+' preserved exact content');
 if(type.startsWith('image/')){
  const head=await worker.fetch(new Request('https://expo.example'+url,{method:'HEAD'}),{});
  assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal(Number(head.headers.get('Content-Length')),(await fs.stat('dist/'+file)).size);
  const cached=await worker.fetch(new Request('https://expo.example'+url,{headers:{'If-None-Match':response.headers.get('ETag')}}),{});assert.equal(cached.status,304);
 }
 if(url.startsWith('/admin')){assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('X-Robots-Tag'),/noindex/);}
}
assert.equal((await worker.fetch(new Request('https://expo.example/worker/api.js'),{})).status,404);
assert.equal((await worker.fetch(new Request('https://expo.example/server/index.js'),{})).status,404);
assert.equal((await worker.fetch(new Request('https://expo.example/drizzle/0000_booking_admin.sql'),{})).status,404);
assert.equal((await worker.fetch(new Request('https://expo.example/api/admin/session'),{})).status,503,'Missing backend configuration fails closed');
const journal=JSON.parse(await fs.readFile('drizzle/meta/_journal.json','utf8'));
const migrations=(await fs.readdir('drizzle')).filter(name=>name.endsWith('.sql')).sort();
assert.equal(journal.entries[0].tag,'0000_booking_admin');
assert.equal(journal.entries.length,2,'Initial schema plus appended status-column migration');
assert.deepEqual(journal.entries.map(entry=>entry.tag+'.sql'),migrations);
for(const file of migrations){assert.deepEqual(await fs.readFile('dist/drizzle/'+file),await fs.readFile('drizzle/'+file),'Deployment includes the exact committed migration');assert.equal((await worker.fetch(new Request('https://expo.example/drizzle/'+file),{})).status,404,'Migration SQL is not a public static asset');}
console.log('PASS: deployable Worker, compressed size, preserved public/admin content and backup, static security routing, private source exclusion and committed migration metadata.');

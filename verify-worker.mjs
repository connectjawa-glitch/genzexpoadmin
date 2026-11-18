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
for(const [url,file,type]of [['/','index.html','text/html'],['/admin','admin.html','text/html'],['/admin/','admin.html','text/html'],['/admin.js','admin.js','text/javascript'],['/admin.css','admin.css','text/css'],['/assets/event-recreated.png','assets/event-recreated.png','image/png'],['/records/expo-website-and-recreated-assets.zip','records/expo-website-and-recreated-assets.zip','application/zip']]){
 const response=await worker.fetch(new Request('https://expo.example'+url),{});assert.equal(response.status,200,url);assert.ok(response.headers.get('Content-Type').startsWith(type));assert.equal(response.headers.get('Content-Encoding'),null,'Stored compression is decoded before the hosting dispatch');assert.deepEqual(await bytes(response),await fs.readFile('dist/'+file),url+' preserved exact content');
 if(url.startsWith('/admin')){assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('X-Robots-Tag'),/noindex/);}
}
assert.equal((await worker.fetch(new Request('https://expo.example/worker/api.js'),{})).status,404);
assert.equal((await worker.fetch(new Request('https://expo.example/server/index.js'),{})).status,404);
assert.equal((await worker.fetch(new Request('https://expo.example/drizzle/0000_booking_admin.sql'),{})).status,404);
assert.equal((await worker.fetch(new Request('https://expo.example/api/admin/session'),{})).status,503,'Missing backend configuration fails closed');
const journal=JSON.parse(await fs.readFile('drizzle/meta/_journal.json','utf8'));assert.equal(journal.entries.length,1);assert.equal(journal.entries[0].tag,'0000_booking_admin');
console.log('PASS: deployable Worker, compressed size, preserved public/admin content and backup, static security routing, private source exclusion and committed migration metadata.');

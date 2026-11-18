import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {componentZip,archiveComponent} from './worker/downloads.js';
import worker from './dist/server/index.js';
const source=await fs.readFile('dist/records/expo-website-and-recreated-assets.zip'),original=Buffer.from(source),root='erode-genz-expo/';
const admin=componentZip(source,'admin'),website=componentZip(source,'website');assert.deepEqual(source,original,'ZIP extraction never mutates the source');
const has=(archive,name)=>archive.names.includes(root+name);
for(const name of ['dist/admin.html','dist/admin.js','dist/admin-mobile.css','worker/api.js','worker/downloads.js','db/schema.js','drizzle/meta/_journal.json','build-worker.mjs','package.json','README-ADMIN.md'])assert.ok(has(admin,name),'Admin dependency: '+name);
for(const name of ['dist/index.html','dist/app.js','dist/mobile.css','dist/scene.js','dist/whatsapp.js','dist/booking-status.js','dist/assets/vendor/THREE-LICENSE.txt','README-WEBSITE.md'])assert.ok(has(website,name),'Public dependency: '+name);
for(const name of ['dist/data.js','dist/assets/event-recreated.png','dist/assets/favicon.svg'])assert.ok(has(admin,name)&&has(website,name),'Shared dependency: '+name);
assert.ok(!has(admin,'dist/index.html'));assert.ok(!has(website,'dist/admin.html'));assert.ok(!has(website,'worker/api.js'));
for(const archive of [admin,website])assert.ok(archive.names.every(name=>!name.endsWith('.zip')&&!/\/\.env|EXPO_ADMIN_ACCESS|node_modules|\/\.git\//.test(name)),'Excluded credentials/runtime/nested archives');
assert.equal(archiveComponent('README-ADMIN.md'),'admin');assert.equal(archiveComponent('README-WEBSITE.md'),'website');assert.throws(()=>componentZip(source,'other'));assert.throws(()=>componentZip(new Uint8Array([1,2,3]),'admin'));
const directory=await fs.mkdtemp(path.join(tmpdir(),'expo-archives-'));
try{
 await fs.writeFile(path.join(directory,'source.zip'),source);
 for(const [kind,expected]of [['admin',admin],['website',website]]){
  const url='https://expo.example/records/erode-genz-'+kind+'.zip',response=await worker.fetch(new Request(url),{});
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/zip');assert.match(response.headers.get('Content-Disposition'),/^attachment; filename=/);assert.equal(Number(response.headers.get('Content-Length')),expected.bytes.length);assert.equal(response.headers.get('Content-Encoding'),null);
  const bytes=Buffer.from(await response.arrayBuffer());assert.deepEqual(bytes,Buffer.from(expected.bytes));await fs.writeFile(path.join(directory,kind+'.zip'),bytes);
  const head=await worker.fetch(new Request(url,{method:'HEAD'}),{});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await worker.fetch(new Request(url,{headers:{'If-None-Match':response.headers.get('ETag')}}),{})).status,304);
  assert.equal((await worker.fetch(new Request(url,{method:'POST'}),{})).status,405);
 }
 const result=spawnSync('python',['-c',`import sys,zipfile,pathlib
d=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(d/'source.zip') as source,zipfile.ZipFile(d/'admin.zip') as admin,zipfile.ZipFile(d/'website.zip') as website:
 assert source.testzip() is None and admin.testzip() is None and website.testzip() is None
 assert set(source.namelist())==set(admin.namelist())|set(website.namelist())
 for archive in [admin,website]:
  for name in archive.namelist(): assert archive.read(name)==source.read(name),name
 print('CRC/inflate integrity, complete combined coverage and exact source bytes verified')`,directory],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);console.log('PASS: '+result.stdout.trim());
}finally{await fs.rm(directory,{recursive:true,force:true});}
console.log(`PASS: split downloads with fixed membership, shared dependencies, GET/HEAD/ETag, attachment headers and source immutability; admin ${admin.bytes.length} bytes, website ${website.bytes.length} bytes.`);

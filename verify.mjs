import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stalls,tiers,halls} from './dist/data.js';
import {copy,languages} from './dist/i18n.js';
assert.equal(stalls.length,193);
assert.equal(new Set(stalls.map(s=>s.n)).size,193);
for(const s of stalls){assert.ok([s.x,s.z,s.w,s.d].every(Number.isFinite),`Geometry ${s.n}`);assert.equal(s.price,tiers[s.tier].price);assert.ok(s.x>=0&&s.z>=0&&s.x+s.w<=halls[s.hall].width&&s.z+s.d<=halls[s.hall].depth,`Bounds ${s.n}`);}
for(const [key,tier]of Object.entries(tiers))assert.equal(stalls.filter(s=>s.tier===key).length,tier.count,key);
for(const [h,counts]of Object.entries({1:{blue:82,orange:23,yellow:14},2:{blue:52,orange:13,yellow:9}}))for(const [c,count]of Object.entries(counts))assert.equal(stalls.filter(s=>s.hall===Number(h)&&s.color===c).length,count,`${h} ${c}`);
for(const [key,strings]of Object.entries(copy)){assert.equal(strings.length,languages.length,key);strings.forEach((s,i)=>assert.ok(typeof s==='string'&&s.length,`${key} ${i}`));}
const html=fs.readFileSync('dist/index.html','utf8');for(const m of html.matchAll(/data-i18n(?:-placeholder|-aria)?="([\w]+)"/g))assert.ok(copy[m[1]],`Missing translation ${m[1]}`);
for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(/^(https?:|tel:)/.test(m[1]))continue;assert.ok(fs.existsSync('dist/'+m[1].split(/[?#]/)[0]),`Missing file ${m[1]}`);}
assert.equal(stalls[148].sourceIssue,'numberConflict');for(const n of[114,115,116])assert.equal(stalls[n-1].sourceIssue,'sizeConflict');assert.equal(stalls[172].tier,'starGold');
// Booth geometry must not overlap other booth geometry in the same hall.
for(let i=0;i<stalls.length;i++)for(let j=i+1;j<stalls.length;j++){const a=stalls[i],b=stalls[j];if(a.hall!==b.hall)continue;const overlapX=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),overlapZ=Math.min(a.z+a.d,b.z+b.d)-Math.max(a.z,b.z);assert.ok(overlapX<.01||overlapZ<.01,`Overlapping stalls ${a.n}/${b.n}`);}
console.log(`PASS: 193 unique, non-overlapping stalls; six price-tier counts; six map-color totals; geometry bounds; ${Object.keys(copy).length} × six language entries; source annotations; local asset links.`);

// Directed reference lanes replace invented return loops. No segment may intersect
// a stall, staircase, lift, toilet, LED panel or either experience-zone block.
const {circulation,auditCirculation,sampleLane,lengthOf,segmentHitsBox}=await import('./dist/circulation.js');
assert.deepEqual(auditCirculation(),[],'Circulation intersects a blocked area');
function inPolygon(x,z,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i][1]>z)!==(poly[j][1]>z)&&x<(poly[j][0]-poly[i][0])*(z-poly[i][1])/(poly[j][1]-poly[i][1])+poly[i][0])yes=!yes;return yes;}
for(const id of[1,2])for(const l of circulation[id].lanes){const len=lengthOf(l.points);assert.ok(len>0);for(let d=.15;d<len-.1;d+=.4){const p=sampleLane(l.points,d);assert.ok(inPolygon(p.x,p.z,circulation[id].outline),`Outside floor: ${l.id}`);}}
const expected={'h1-left-up':[0,-1],'h1-top-right':[1,0],'h1-centre-down':[0,1],'h1-right-up':[0,-1],'h1-bottom-right':[1,0],'h2-entry-left':[-1,0],'h2-right-up':[0,-1],'h2-top-left':[-1,0],'h2-centre-down':[0,1],'h2-lower-left':[-1,0],'h2-left-up':[0,-1],'h2-zone-west':[-1,0],'h2-zone-east':[1,0],'h2-exit-up':[0,-1]};
for(const l of Object.values(circulation).flatMap(n=>n.lanes)){if(expected[l.id]){const p=sampleLane(l.points,lengthOf(l.points)/2);assert.deepEqual([p.dx,p.dz],expected[l.id],`Wrong source arrow direction: ${l.id}`);}}
for(const id of[1,2])for(const p of circulation[id].portals)for(const [a,b]of circulation[id].walls){const rect=p.side==='east'?{x:p.x-.4,z:p.from+.4,w:.8,d:p.to-p.from-.8}:{x:p.from+.4,z:p.z-.4,w:p.to-p.from-.8,d:.8};assert.ok(!segmentHitsBox(a,b,rect),`Wall closes portal ${id}/${p.key}`);}
for(const h of[1,2]){const obs=halls[h].facilities.filter(f=>f.blocked!==false);for(const f of obs)for(const s of stalls.filter(s=>s.hall===h)){const ox=Math.min(f.x+f.w,s.x+s.w)-Math.max(f.x,s.x),oz=Math.min(f.z+f.d,s.z+s.d)-Math.max(f.z,s.z);assert.ok(ox<.01||oz<.01,`Facility overlaps booth ${s.n}: ${f.key}`);}}
console.log('PASS: 19 directed lanes clear all obstacles; sampled points stay inside the floor; 14 key arrow directions match source; all 3 entry/exit openings remain unobstructed.');

// A visible number must be selectable even when its raised billboard projects
// over a different floor tile at a low camera angle.
const {HallExplorer}=await import('./dist/canvas-scene.js');
const picker=Object.create(HallExplorer.prototype);picker.labelRegions=[{n:65,x:12,y:12,w:18,h:12}];picker.hitRegions=[{n:64,poly:[{x:0,y:0},{x:60,y:0},{x:60,y:60},{x:0,y:60}]}];picker.stalls=[];
assert.equal(picker.pick(12,12),65);assert.equal(picker.pick(40,40),64);
console.log('PASS: raised visible number picking takes precedence over underlying floor geometry.');

import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=path.resolve('dist'),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.zip':'application/zip','.ics':'text/calendar; charset=utf-8'};
const assets={};
async function collect(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){if(dir===root&&['server','.openai','drizzle'].includes(item.name))continue;const file=path.join(dir,item.name);if(item.isDirectory())await collect(file);else if(item.isFile()){
 const name='/'+path.relative(root,file).split(path.sep).join('/'),raw=await fs.readFile(file),compressed=gzipSync(raw,{level:9}),encoded=compressed.length<raw.length?compressed:raw;
 assets[name]={body:encoded.toString('base64'),type:types[path.extname(name)]||'application/octet-stream',gzip:encoded!==raw,etag:'"'+createHash('sha256').update(raw).digest('hex').slice(0,32)+'"'};
}}}
await collect(root);
const api=await fs.readFile('worker/api.js','utf8'),downloads=await fs.readFile('worker/downloads.js','utf8');
const source=api+'\n'+downloads+`\nconst assets=${JSON.stringify(assets)};\n`+String.raw`
function serveAsset(request){
 const url=new URL(request.url);let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return new Response('Invalid path',{status:400});}
 if(pathname==='/'||pathname==='/index.html')pathname='/index.html';
 if(pathname==='/admin'||pathname==='/admin/')pathname='/admin.html';
 const asset=assets[pathname];if(!asset||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
 const admin=pathname.startsWith('/admin'),html=asset.type.startsWith('text/html');
 const headers={'Content-Type':asset.type,'Cache-Control':admin||html?'no-store':'public, max-age=300','ETag':asset.etag,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN'};
 if(admin)headers['X-Robots-Tag']='noindex, nofollow, noarchive';
 if(request.headers.get('If-None-Match')===asset.etag&&!html&&!admin)return new Response(null,{status:304,headers});
 // The hosting dispatch may normalise Content-Encoding. Decode stored assets
 // here so every response contains ordinary bytes independently of that layer.
 const binary=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));
 const body=asset.gzip?new Response(binary).body.pipeThrough(new DecompressionStream('gzip')):binary;
 return new Response(request.method==='HEAD'?null:body,{headers});
}
export default{async fetch(request,env,ctx){return await handleAPI(request,env,ctx)||await handleProjectDownload(request,assets)||serveAsset(request);}};
`;
const compressed=gzipSync(source,{level:9}).length;
if(compressed>10*1024*1024)throw new Error('Worker exceeds 10 MiB compressed; move assets to a supported asset store before deployment.');
await fs.mkdir('dist/server',{recursive:true});await fs.writeFile('dist/server/index.js',source);
await fs.mkdir('dist/.openai',{recursive:true});await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
await fs.cp('drizzle','dist/drizzle',{recursive:true});
console.log(`Built Worker: ${Object.keys(assets).length} embedded assets; ${compressed} compressed bytes.`);

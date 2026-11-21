const sharedArchiveFiles=new Set(['.gitignore','README.md','dist/data.js','dist/release.json','dist/assets/event-recreated.png','dist/assets/expo-logo-original.png','dist/assets/favicon.svg']);
export function archiveComponent(path){
 if(sharedArchiveFiles.has(path))return 'shared';
 if(path==='README-WEBSITE.md')return 'website';
 if(path==='README-ADMIN.md'||path.startsWith('dist/admin.')||path==='dist/admin-mobile.css'||path==='dist/records/admin-login-preview.jpg'||path==='dist/records/mobile-admin-preview.jpg')return 'admin';
 return path.startsWith('dist/')?'website':'admin';
}
// Reuse the original compressed ZIP entries. This preserves exact file bytes,
// avoids recompression, and keeps duplicate asset archives out of the Worker.
export function componentZip(input,component){
 if(!['admin','website'].includes(component))throw new Error('Unknown archive component');
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw new Error('Unsupported ZIP archive');
 const total=view.getUint16(end+10,true),directorySize=view.getUint32(end+12,true),directoryOffset=view.getUint32(end+16,true);
 if(total===65535||view.getUint16(end+8,true)!==total||directoryOffset+directorySize>end)throw new Error('Invalid ZIP directory');
 const chunks=[],central=[],names=[],decoder=new TextDecoder();let position=directoryOffset,outputOffset=0;
 for(let i=0;i<total;i++){
  if(position+46>end||view.getUint32(position,true)!==0x02014b50)throw new Error('Invalid ZIP entry');
  const flags=view.getUint16(position+8,true),size=view.getUint32(position+20,true),nameLength=view.getUint16(position+28,true),extraLength=view.getUint16(position+30,true),commentLength=view.getUint16(position+32,true),localOffset=view.getUint32(position+42,true),recordEnd=position+46+nameLength+extraLength+commentLength;
  if(recordEnd>directoryOffset+directorySize||size===0xffffffff||localOffset===0xffffffff||(flags&9))throw new Error('Unsupported ZIP entry');
  const name=decoder.decode(bytes.subarray(position+46,position+46+nameLength));
  if(!name.startsWith('erode-genz-expo/')||name.includes('\\')||name.split('/').some(part=>part==='..'))throw new Error('Unsafe ZIP filename');
  const member=archiveComponent(name.slice('erode-genz-expo/'.length));
  if(member===component||member==='shared'){
   if(localOffset+30>directoryOffset||view.getUint32(localOffset,true)!==0x04034b50)throw new Error('Invalid local ZIP header');
   const localEnd=localOffset+30+view.getUint16(localOffset+26,true)+view.getUint16(localOffset+28,true)+size;
   if(localEnd>directoryOffset)throw new Error('Invalid local ZIP data');
   const local=bytes.subarray(localOffset,localEnd),record=Uint8Array.from(bytes.subarray(position,recordEnd));
   new DataView(record.buffer).setUint32(42,outputOffset,true);chunks.push(local);central.push(record);names.push(name);outputOffset+=local.length;
  }
  position=recordEnd;
 }
 if(position!==directoryOffset+directorySize||!names.length)throw new Error('Invalid ZIP directory size');
 const centralSize=central.reduce((size,record)=>size+record.length,0),footer=new Uint8Array(22),footerView=new DataView(footer.buffer);
 footerView.setUint32(0,0x06054b50,true);footerView.setUint16(8,names.length,true);footerView.setUint16(10,names.length,true);footerView.setUint32(12,centralSize,true);footerView.setUint32(16,outputOffset,true);
 const result=new Uint8Array(outputOffset+centralSize+22);let offset=0;
 for(const chunk of [...chunks,...central,footer]){result.set(chunk,offset);offset+=chunk.length;}
 return {bytes:result,names};
}
export async function handleProjectDownload(request,assets){
 const path=new URL(request.url).pathname,component=path==='/records/erode-genz-admin.zip'?'admin':path==='/records/erode-genz-website.zip'?'website':null;
 if(!component)return null;
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 const asset=assets['/records/expo-website-and-recreated-assets.zip'];
 if(!asset)return new Response('Download unavailable',{status:503});
 const etag='"'+asset.etag.replaceAll('"','')+'-'+component+'"';
 const headers={'Content-Type':'application/zip','Content-Disposition':'attachment; filename="erode-genz-'+component+'.zip"','Cache-Control':'public, max-age=300','ETag':etag,'X-Content-Type-Options':'nosniff'};
 if(request.headers.get('If-None-Match')===etag)return new Response(null,{status:304,headers});
 try{
  const stored=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)),source=asset.gzip?new Uint8Array(await new Response(new Response(stored).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()):stored;
  const output=componentZip(source,component).bytes;headers['Content-Length']=String(output.length);
  return new Response(request.method==='HEAD'?null:output,{headers});
 }catch{return new Response('Download unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}
}

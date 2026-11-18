import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const defaultDistRoot=fileURLToPath(new URL('./dist/',import.meta.url));
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const external=ref=>/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref);
const relativeModule=ref=>ref.startsWith('./')||ref.startsWith('../')||ref.startsWith('/');
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);

export function withoutRelease(ref){
 const hashAt=ref.indexOf('#'),fragment=hashAt<0?'':ref.slice(hashAt),main=hashAt<0?ref:ref.slice(0,hashAt),queryAt=main.indexOf('?');
 if(queryAt<0)return ref;
 const query=new URLSearchParams(main.slice(queryAt+1));query.delete('v');
 return main.slice(0,queryAt)+(query.size?'?'+query.toString():'')+fragment;
}
export function versioned(ref,release){
 const clean=withoutRelease(ref),hashAt=clean.indexOf('#'),fragment=hashAt<0?'':clean.slice(hashAt),main=hashAt<0?clean:clean.slice(0,hashAt);
 return main+(main.includes('?')?'&':'?')+'v='+release+fragment;
}
function decodeString(raw){
 return raw.replace(/\\(?:u\{([\da-f]+)\}|u([\da-f]{4})|x([\da-f]{2})|\r?\n|([\s\S]))/gi,(_,point,unicode,hex,char)=>point?String.fromCodePoint(parseInt(point,16)):unicode?String.fromCharCode(parseInt(unicode,16)):hex?String.fromCharCode(parseInt(hex,16)):char==null?'':({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'}[char]??char));
}
function encodeString(value,quote){return value.replace(/\\/g,'\\\\').replaceAll(quote,'\\'+quote).replace(/\n/g,'\\n').replace(/\r/g,'\\r');}

// A small lexical scanner keeps comment, string and template text out of import
// matching. Template expressions are scanned because imports can occur in them.
function tokensOf(source){
 const tokens=[];let i=0;
 const add=(kind,value,start,end,quote)=>tokens.push({kind,value,start,end,quote});
 const regexAllowed=()=>{const previous=tokens.at(-1);return !previous||previous.kind==='punct'&&/^[({[,:;=!?&|+*%~^<>-]$/.test(previous.value)||previous.kind==='word'&&/^(return|throw|case|delete|void|typeof|instanceof|in|of|yield|await|else|do)$/.test(previous.value);};
 function scan(stopAtBrace=false){let braces=0;while(i<source.length){
  const char=source[i],next=source[i+1];
  if(/\s/.test(char)){i++;continue;}
  if(char==='/'&&next==='/'){i+=2;while(i<source.length&&!/[\r\n]/.test(source[i]))i++;continue;}
  if(char==='/'&&next==='*'){const end=source.indexOf('*/',i+2);i=end<0?source.length:end+2;continue;}
  if(char==='"'||char==="'"){const quote=char,start=++i;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]===quote)break;i++;}add('string',decodeString(source.slice(start,i)),start,i,quote);i++;continue;}
  if(char==='`'){i++;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='`'){i++;break;}if(source[i]==='$'&&source[i+1]==='{'){i+=2;scan(true);}else i++;}add('template','',i,i);continue;}
  if(char==='/'&&regexAllowed()){i++;let bracket=false;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='[')bracket=true;if(source[i]===']')bracket=false;if(source[i]==='/'&&!bracket){i++;break;}i++;}while(/[a-z]/i.test(source[i]??'')&&i<source.length)i++;add('regex','',i,i);continue;}
  if(/[a-z_$]/i.test(char)){const start=i++;while(/[\w$]/.test(source[i]??'')&&i<source.length)i++;add('word',source.slice(start,i),start,i);continue;}
  if(/\d/.test(char)){const start=i++;while(/[\w.]/.test(source[i]??'')&&i<source.length)i++;add('number',source.slice(start,i),start,i);continue;}
  if(char==='}'&&stopAtBrace&&braces===0){i++;return;}
  if(char==='{')braces++;if(char==='}')braces--;
  add('punct',char,i,i+1);i++;
 }}
 scan();return tokens;
}
export function jsReferences(source){
 const tokens=tokensOf(source),references=[],seen=new Set();
 const capture=token=>{if(token?.kind==='string'&&!seen.has(token.start)){references.push({...token,type:'module'});seen.add(token.start);}};
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i];if(token.kind!=='word'||!['import','export'].includes(token.value)||tokens[i-1]?.value==='.')continue;
  const next=tokens[i+1];
  if(token.value==='import'&&next?.kind==='string'){capture(next);continue;}
  if(token.value==='import'&&next?.value==='('){
   const spec=tokens[i+2],after=tokens[i+3];
   if(spec?.kind!=='string'||![')',','].includes(after?.value))throw new Error('Nonliteral dynamic import cannot be release-versioned at offset '+token.start);
   capture(spec);continue;
  }
  if(next?.value==='.'||token.value==='export'&&!['{','*'].includes(next?.value))continue;
  for(let j=i+1;j<tokens.length&&tokens[j].value!==';';j++)if(tokens[j].kind==='word'&&tokens[j].value==='from'){capture(tokens[j+1]);break;}
 }
 return references.sort((a,b)=>a.start-b.start);
}
export function cssReferences(source){
 const masked=source.replace(/\/\*[\s\S]*?\*\//g,comment=>' '.repeat(comment.length)),references=[];
 const pattern=/@import\s+(?:url\(\s*(?:(["'])([^"']+)\1|([^\s)]+))\s*\)|(["'])([^"']+)\4)/gi;
 for(const match of masked.matchAll(pattern)){
  const value=match[2]??match[3]??match[5],quote=match[1]??match[4]??'',local=match[0].indexOf(value),start=match.index+local;
  references.push({kind:'string',value,start,end:start+value.length,quote,type:'style'});
 }
 return references;
}
function replaceReferences(source,references,mapper){
 let result=source;
 for(const ref of [...references].sort((a,b)=>b.start-a.start)){
  const next=mapper(ref.value,ref);if(next===ref.value)continue;
  result=result.slice(0,ref.start)+(ref.quote?encodeString(next,ref.quote):next)+result.slice(ref.end);
 }
 return result;
}
export function mapCode(source,extension,mapper){return replaceReferences(source,extension==='.css'?cssReferences(source):jsReferences(source),mapper);}
function attrsOf(tag){
 const attrs={};for(const match of tag.matchAll(/\b([\w:-]+)\s*=\s*(?:(["'])([\s\S]*?)\2|([^\s>]+))/g))attrs[match[1].toLowerCase()]=match[3]??match[4];return attrs;
}
function attribute(tag,name,mapper){
 const pattern=new RegExp('(\\b'+name+'\\s*=\\s*)(?:(["\'])([\\s\\S]*?)\\2|([^\\s>]+))','i');
 return tag.replace(pattern,(whole,prefix,quote,value,unquoted)=>{const current=value??unquoted,next=mapper(current);return next===current?whole:prefix+(quote||'"')+next+(quote||'"');});
}
export function mapHTML(source,mapper){
 const comments=[];
 let html=source.replace(/<!--[\s\S]*?-->/g,comment=>{const id=comments.push(comment)-1;return `\u0000EXPO_COMMENT_${id}\u0000`;});
 html=html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi,(whole,open,body,close)=>{
  const attrs=attrsOf(open);if(attrs.src)open=attribute(open,'src',value=>mapper(value,{type:'html-script'}));
  if(attrs.type==='importmap'){
   const map=JSON.parse(body);const rewrite=imports=>{for(const[key,value]of Object.entries(imports??{}))if(typeof value==='string')imports[key]=mapper(value,{type:'importmap',specifier:key});};
   rewrite(map.imports);for(const scope of Object.values(map.scopes??{}))rewrite(scope);body=JSON.stringify(map);
  }else if(attrs.type==='module'&&!attrs.src)body=mapCode(body,'.js',(value,ref)=>mapper(value,{...ref,type:'inline-module'}));
  return open+body+close;
 });
 html=html.replace(/<link\b[^>]*>/gi,tag=>{const attrs=attrsOf(tag),rel=(attrs.rel??'').toLowerCase().split(/\s+/);if(attrs.href&&(rel.includes('stylesheet')||rel.includes('modulepreload')||rel.includes('preload')&&['script','style'].includes(attrs.as)))return attribute(tag,'href',value=>mapper(value,{type:rel.includes('stylesheet')?'html-style':'html-module'}));return tag;});
 html=html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,(_,open,body,close)=>open+mapCode(body,'.css',(value,ref)=>mapper(value,{...ref,type:'inline-style'}))+close);
 return html.replace(/\u0000EXPO_COMMENT_(\d+)\u0000/g,(_,id)=>comments[Number(id)]);
}
export function localReference(ref,type){return !external(ref)&&!ref.startsWith('#')&&(type!=='module'&&type!=='inline-module'||relativeModule(ref));}
export function releaseMeta(html,release){
 let found=false;const changed=html.replace(/<meta\b[^>]*>/gi,tag=>{if(attrsOf(tag).name!=='expo-release')return tag;if(found)return '';found=true;return `<meta name="expo-release" content="${release}">`;});
 if(found)return changed;if(!/<\/head\s*>/i.test(changed))throw new Error('HTML entry is missing </head>');
 return changed.replace(/<\/head\s*>/i,` <meta name="expo-release" content="${release}">\n</head>`);
}
export function readReleaseMeta(html){
 const tags=[...html.matchAll(/<meta\b[^>]*>/gi)].map(match=>attrsOf(match[0])).filter(attrs=>attrs.name==='expo-release');
 if(tags.length!==1)throw new Error('Expected exactly one expo-release meta tag');return tags[0].content;
}
export async function readBuild(distRoot=defaultDistRoot){
 const root=path.resolve(distRoot),files=new Map(),html=new Map();
 async function walk(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){if(directory===root&&['server','.openai'].includes(entry.name))continue;const full=path.join(directory,entry.name);if(entry.isDirectory())await walk(full);else if(entry.isFile()){const relative=path.relative(root,full).split(path.sep).join('/'),ext=path.extname(entry.name);if(['.js','.mjs','.css'].includes(ext))files.set(relative,await fs.readFile(full,'utf8'));else if(ext==='.html')html.set(relative,await fs.readFile(full,'utf8'));}}}
 await walk(root);if(!html.has('index.html'))throw new Error('Missing dist/index.html');if(!files.size)throw new Error('No JavaScript or CSS found');return{root,files:new Map([...files].sort()),html:new Map([...html].sort())};
}
export function normalizedSources(build){return new Map([...build.files].map(([file,source])=>[file,mapCode(source,path.extname(file),(value,ref)=>localReference(value,ref.type)?withoutRelease(value):value)]));}
export function releaseIdentity(build){
 const source=normalizedSources(build),files=[...source].map(([file,contents])=>({path:file,sha256:digest(contents)}));
 return{release:digest('expo-code-release-v1\n'+files.map(file=>file.path+'\0'+file.sha256).join('\n')).slice(0,16),files};
}
export function resolveLocal(root,file,ref){
 const pathname=decodeURIComponent(ref.split(/[?#]/,1)[0]),resolved=path.resolve(root,pathname.startsWith('/')?'.'+pathname:path.join(path.dirname(file),pathname));
 if(resolved!==root&&!resolved.startsWith(root+path.sep))throw new Error(`Reference escapes dist: ${file} -> ${ref}`);return resolved;
}
export async function inspectBuild(build,{release,requireVersion=true}={}){
 const entryMaps=new Map();let references=0;
 for(const[file,html]of build.html)mapHTML(html,(value,ref)=>{if(ref.type==='importmap')entryMaps.set(ref.specifier,value);return value;});
 const pending=[];
 function check(file,value,ref){
  if(!localReference(value,ref.type)){
   if(['module','inline-module'].includes(ref.type)&&!external(value)&&!value.startsWith('#')){
    const mapping=entryMaps.get(value);if(!mapping)throw new Error(`Unmapped bare module: ${file} -> ${value}`);
   }
   return value;
  }
  const filename=resolveLocal(build.root,file,value);if(value.split(/[?#]/,1)[0].endsWith('/'))throw new Error(`Directory import mapping cannot be cache-versioned: ${file} -> ${value}`);
  if(requireVersion){const query=value.split('#',1)[0].split('?')[1]??'',versions=new URLSearchParams(query).getAll('v');if(versions.length!==1||versions[0]!==release)throw new Error(`Stale or unversioned reference: ${file} -> ${value}`);}
  references++;pending.push(fs.stat(filename).then(stat=>{if(!stat.isFile())throw new Error('Not a file: '+filename);}).catch(error=>{throw new Error(`Missing local reference: ${file} -> ${value} (${error.message})`);}));return value;
 }
 for(const[file,source]of build.files)mapCode(source,path.extname(file),(value,ref)=>check(file,value,ref));
 for(const[file,html]of build.html)mapHTML(html,(value,ref)=>check(file,value,ref));
 await Promise.all(pending);return{references};
}
async function writeChanged(file,contents){let before;try{before=await fs.readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}if(before===contents)return false;await fs.writeFile(file,contents);return true;}
export async function prepareRelease(distRoot=defaultDistRoot){
 const build=await readBuild(distRoot);await inspectBuild(build,{requireVersion:false});
 const identity=releaseIdentity(build),release=identity.release;
 const mapper=(value,ref)=>localReference(value,ref.type)?versioned(value,release):value;
 const next={...build,files:new Map([...build.files].map(([file,source])=>[file,mapCode(source,path.extname(file),mapper)])),html:new Map([...build.html].map(([file,html])=>[file,releaseMeta(mapHTML(html,mapper),release)]))};
 const audit=await inspectBuild(next,{release});let changed=0;
 for(const[file,source]of [...next.files,...next.html])if(await writeChanged(path.join(build.root,file),source))changed++;
 const metadata={schema:1,release,algorithm:'sha256-normalized-code-v1',entry:'index.html',files:identity.files};
 if(await writeChanged(path.join(build.root,'release.json'),JSON.stringify(metadata,null,2)+'\n'))changed++;
 return{release,assets:identity.files.length,references:audit.references,changed};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{const result=await prepareRelease(process.argv[2]??defaultDistRoot);console.log(`Prepared release ${result.release}: ${result.assets} code/style assets, ${result.references} local references, ${result.changed} files updated.`);}catch(error){console.error('Release preparation failed: '+error.message);process.exitCode=1;}
}

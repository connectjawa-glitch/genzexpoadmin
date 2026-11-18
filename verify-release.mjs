import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {defaultDistRoot,readBuild,releaseIdentity,inspectBuild,readReleaseMeta} from './prepare-release.mjs';

export async function verifyRelease(distRoot=defaultDistRoot){
 const build=await readBuild(distRoot),metadata=JSON.parse(await fs.readFile(path.join(build.root,'release.json'),'utf8'));
 assert.equal(metadata.schema,1,'Unknown release metadata schema');
 assert.equal(metadata.algorithm,'sha256-normalized-code-v1','Unknown release hash algorithm');
 assert.equal(metadata.entry,'index.html','Unexpected release entrypoint');
 assert.match(metadata.release,/^[a-f0-9]{16}$/,'Invalid release identifier');
 const identity=releaseIdentity(build);
 assert.equal(metadata.release,identity.release,'Code/style contents changed after release preparation');
 assert.deepEqual(metadata.files,identity.files,'Release asset manifest does not match current files');
 for(const[file,html]of build.html)assert.equal(readReleaseMeta(html),metadata.release,`Stale HTML release metadata: ${file}`);
 const audit=await inspectBuild(build,{release:metadata.release});
 return{release:metadata.release,assets:identity.files.length,references:audit.references};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{const result=await verifyRelease(process.argv[2]??defaultDistRoot);console.log(`PASS: release ${result.release}; ${result.assets} code/style assets and ${result.references} local references form one coherent versioned graph.`);}catch(error){console.error('Release verification failed: '+error.message);process.exitCode=1;}
}

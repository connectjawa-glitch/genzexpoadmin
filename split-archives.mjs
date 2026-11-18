import fs from 'node:fs/promises';
import path from 'node:path';
import {componentZip} from './worker/downloads.js';
const source=await fs.readFile('dist/records/expo-website-and-recreated-assets.zip'),output=path.resolve(process.argv[2]||'./exports');
await fs.mkdir(output,{recursive:true});
for(const component of ['admin','website']){
 const archive=componentZip(source,component),file=path.join(output,`erode-genz-${component}.zip`);
 await fs.writeFile(file,archive.bytes);console.log(`${file}: ${archive.names.length} files, ${archive.bytes.length} bytes`);
}

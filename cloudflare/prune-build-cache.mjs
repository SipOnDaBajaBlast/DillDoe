import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('.asset-cache');
const candidates=[];
for(const folder of ['packs','archives'])for(const name of await fs.readdir(path.join(root,folder)).catch(()=>[])){
 const file=path.resolve(root,folder,name);if(!file.startsWith(root+path.sep))throw new Error('Unsafe build cache path');
 const stat=await fs.stat(file);if(!stat.isFile())continue;
 candidates.push({file,size:stat.size,priority:folder==='packs'?0:1,partial:name.endsWith('.part')});
}
let kept=0;
for(const item of candidates.sort((a,b)=>a.priority-b.priority||a.size-b.size)){
 if(item.partial||kept+item.size>9*1024**3)await fs.unlink(item.file);else kept+=item.size;
}
console.log('Reusable source cache bounded to '+(kept/1024**3).toFixed(2)+' GiB; repository cache limits are unchanged.');

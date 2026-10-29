import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createGzip} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {transformGameText} from './lib/game-text.mjs';
import {staticPlan,STATIC_ORIGIN,isSecondaryFile,isSecondaryGameFile} from './lib/static-plan.mjs';
import gtaStaticData from './lib/gta-static-data.json' with {type:'json'};

const cache=path.resolve(process.env.GAME_ASSET_CACHE||'.asset-cache');
const packBase='https://github.com/MagiczLunchly/gta5-webport-vercel/releases/download/dilldoe-game-assets-v1/';
const textFile=/\.(html|js|mjs|css|json)$/;
const exists=async(file,size)=>{const stat=await fs.stat(file).catch(()=>null);return stat?.isFile()&&(size===undefined||stat.size===size);};
async function download(url,file,size,sha){
 if(await exists(file,size))return;
 await fs.mkdir(path.dirname(file),{recursive:true});
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(1800000),headers:{'User-Agent':'DillDoe-static-builder'}});
   if(!response.ok||!response.body)throw new Error('Download HTTP '+response.status);
   await pipeline(Readable.fromWeb(response.body),createWriteStream(file+'.part'));
   if(size!==undefined&&!await exists(file+'.part',size))throw new Error('Download size mismatch');
   if(sha){const hash=createHash('sha256');for await(const chunk of createReadStream(file+'.part'))hash.update(chunk);if(hash.digest('hex')!==sha)throw new Error('Download hash mismatch');}
   await fs.rename(file+'.part',file);return;
  }catch(error){if(attempt===2)throw new Error('Static asset download failed for '+path.basename(file)+': '+error.message);await new Promise(r=>setTimeout(r,1000*2**attempt));}
 }
}
async function parallel(values,count,run){let index=0;await Promise.all(Array.from({length:Math.min(count,values.length)},async()=>{while(index<values.length)await run(values[index++]);}));}
async function rawSource(name,entry,files){
 const directory=path.join(cache,'raw',name,entry.sha);
 const wanted=files.filter(file=>entry.files[file]>0);
 // Archives avoid thousands of separate GitHub requests. Very large archives
 // with only a few useful small files are fetched individually instead.
 const allBytes=Object.values(entry.files).reduce((a,b)=>a+b,0);
 const wantedBytes=wanted.reduce((a,file)=>a+entry.files[file],0);
 if(wanted.length>80&&wantedBytes<2*1024**3&&wantedBytes/Math.max(1,allBytes)>.3){
  const complete=path.join(directory,'.complete');
  if(!await exists(complete)){
   const archive=path.join(cache,'archives',name+'-'+entry.sha+'.tar.gz');
   await download(`https://codeload.github.com/${entry.repo}/tar.gz/${entry.sha}`,archive);
   await fs.mkdir(directory,{recursive:true});
   const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:30*1024*1024}).split('\n').filter(Boolean);
   if(names.some(n=>n.startsWith('/')||n.includes('\\')||n.split('/').includes('..')))throw new Error('Unsafe source archive');
   execFileSync('tar',['-xzf',archive,'-C',directory,'--strip-components=1'],{maxBuffer:1024*1024});
   await fs.writeFile(complete,'pinned source extracted');
  }
 }else await parallel(wanted,8,async file=>{
  const relative=(entry.directory||'')+file;
  const target=path.join(directory,relative);
  await download(`https://raw.githubusercontent.com/${entry.repo}/${entry.sha}/${relative.split('/').map(encodeURIComponent).join('/')}`,target,entry.files[file]);
 });
 return file=>path.join(directory,(entry.directory||'')+file);
}
export async function buildStaticGames(output,catalog){
 const packed=JSON.parse(await fs.readFile('lib/game-assets.json','utf8'));
 const plan=staticPlan(catalog);
 const overflow=path.resolve('dist-games');
 await fs.mkdir(overflow,{recursive:true});
 // Only this build's owned output is cleared. Cached source archives stay local.
 if(overflow!==path.join(process.cwd(),'dist-games'))throw new Error('Unsafe static output');
 await fs.rm(overflow,{recursive:true,force:true});await fs.mkdir(overflow,{recursive:true});
 const neededPacks=new Set();
 for(const[name,game]of Object.entries(plan.games))if(catalog.games[name].mode!=='raw')for(const file of [...game.files,...game.large.filter(file=>file.endsWith('.wasm'))]){const record=packed.files[name+'/'+file];if(record&&record[2])neededPacks.add(record[0]);}
 await parallel([...neededPacks],4,async number=>{const pack=packed.packs[number];await download(packBase+pack.name,path.join(cache,'packs',pack.name),pack.size,pack.sha256);});
 const extensions=new Set(),compressedFiles=new Set();let staticFiles=0,staticBytes=0;
 for(const[name,game]of Object.entries(plan.games)){
  const entry=catalog.games[name];
  if(name==='gta5-webport-vercel'&&entry.sha!==gtaStaticData.sourceSha)throw new Error('Revalidate GTA static metadata before changing its pinned source revision');
  console.log('Preparing static game '+name+' ('+game.files.length+' files)');
  const wasmCandidates=game.large.filter(file=>file.endsWith('.wasm'));
  const source=entry.mode==='raw'?await rawSource(name,entry,[...game.files,...wasmCandidates]):null;
  await parallel(game.files,8,async file=>{
   const root=isSecondaryGameFile(name,file)?overflow:output;
   if(isSecondaryFile(file))extensions.add(file.split('.').at(-1));
   let bytes;
   if(entry.files[file]===0)bytes=Buffer.alloc(0);
   else if(source)bytes=await fs.readFile(source(file));
   else{
    const record=packed.files[name+'/'+file];if(!record)throw new Error('Missing packed asset '+name+'/'+file);
    const handle=await fs.open(path.join(cache,'packs',packed.packs[record[0]].name));
    try{bytes=Buffer.alloc(record[2]);let offset=0;while(offset<bytes.length){const read=await handle.read(bytes,offset,bytes.length-offset,record[1]+offset);if(!read.bytesRead)throw new Error('Short asset pack');offset+=read.bytesRead;}}finally{await handle.close();}
   }
   if(bytes.length!==entry.files[file])throw new Error('Pinned asset size mismatch '+name+'/'+file);
   if(name==='gta5-webport-vercel'&&file.startsWith('data/')&&gtaStaticData.hashes[file.slice(5)]&&createHash('sha256').update(bytes).digest('hex')!==gtaStaticData.hashes[file.slice(5)])throw new Error('GTA static data differs from the verified dataset: '+file);
   if(textFile.test(file))bytes=Buffer.from(transformGameText(bytes.toString('utf8'),name,entry,file));
   if(bytes.length>25*1024*1024)throw new Error('Transformed static asset is too large '+name+'/'+file);
   const target=path.resolve(root,'ports',name,file);
   if(!target.startsWith(path.resolve(root)+path.sep))throw new Error('Unsafe game asset path');
   await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);staticFiles++;staticBytes+=bytes.length;
  });
  // Compression can bring large WebAssembly runtimes below Pages' per-file
  // limit without changing the URL or the decoded bytes seen by the browser.
  for(const file of wasmCandidates){
   const compressed=path.resolve(output,'ports',name,file);
   await fs.mkdir(path.dirname(compressed),{recursive:true});
   let input;
   if(source){if(!await exists(source(file),entry.files[file]))throw new Error('Pinned WebAssembly size mismatch '+name+'/'+file);input=createReadStream(source(file));}
   else{const record=packed.files[name+'/'+file];if(!record)throw new Error('Missing WebAssembly pack');input=createReadStream(path.join(cache,'packs',packed.packs[record[0]].name),{start:record[1],end:record[1]+record[2]-1});}
   await pipeline(input,createGzip({level:6}),createWriteStream(compressed+'.part'));
   if((await fs.stat(compressed+'.part')).size<=25*1024*1024){await fs.rename(compressed+'.part',compressed);compressedFiles.add('/ports/'+name+'/'+file);staticFiles++;staticBytes+=(await fs.stat(compressed)).size;}
   else await fs.unlink(compressed+'.part');
  }
  const entryFile=entry.entry||'index.html';
  if(entryFile!=='index.html'&&game.files.includes(entryFile))await fs.copyFile(path.join(output,'ports',name,entryFile),path.join(output,'ports',name,'index.html'));
  if(source&&process.env.CI){const extracted=path.resolve(cache,'raw',name,entry.sha);if(!extracted.startsWith(cache+path.sep))throw new Error('Unsafe extracted source path');await fs.rm(extracted,{recursive:true,force:true});}
 }
 const staticHeaders='/ports/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: cross-origin\n  Access-Control-Allow-Origin: *\n  Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\n  Permissions-Policy: cross-origin-isolated=(self), fullscreen=(self), gamepad=(self)\n  Cache-Control: public, max-age=3600\n\n/ports/*.html\n  Cache-Control: no-cache\n\n/ports/*.br\n  Content-Encoding: br\n\n/ports/*.gz\n  Content-Encoding: gzip\n\n/ports/*.wasm\n  Content-Type: application/wasm\n\n/ports/*.wasm.br\n  Content-Type: application/wasm\n\n/ports/*.wasm.gz\n  Content-Type: application/wasm\n\n/ports/*.js.br\n  Content-Type: text/javascript\n\n/ports/*.js.gz\n  Content-Type: text/javascript\n';
 const compressedHeaders=[...compressedFiles].map(file=>'\n'+encodeURI(file)+'\n  Content-Encoding: gzip\n  Content-Type: application/wasm\n').join('');
 await fs.writeFile(path.join(overflow,'_headers'),staticHeaders);
 // Directory entry points revalidate so website updates do not leave old menus.
 await fs.appendFile(path.join(overflow,'_headers'),'\n/ports/:game/\n  Cache-Control: no-cache\n');
 await fs.writeFile(path.join(overflow,'404.html'),'<!doctype html><title>Game file not found</title><p>This game file is unavailable. Please return to the game library.</p>');
 await fs.writeFile(path.join(output,'_redirects'),[`/ports/omori/audio/* ${STATIC_ORIGIN}/ports/omori/audio/:splat 302`,...[...extensions].sort().map(ext=>`/ports/*.${ext} ${STATIC_ORIGIN}/ports/:splat.${ext} 302`)].join('\n')+'\n');
 const routes=plan.routes.filter(route=>!compressedFiles.has(decodeURI(route)));
 await fs.writeFile(path.join(output,'static-game-report.json'),JSON.stringify({staticFiles,staticBytes,compressedFiles:[...compressedFiles],secondaryOrigin:STATIC_ORIGIN,remainingFunctionRoutes:routes.length,games:Object.fromEntries(Object.entries(plan.games).map(([n,g])=>[n,{staticFiles:g.files.length+[...compressedFiles].filter(p=>p.startsWith('/ports/'+n+'/')).length,largeFiles:g.large.length-[...compressedFiles].filter(p=>p.startsWith('/ports/'+n+'/')).length,secondaryFiles:g.secondaryFiles.length}]))},null,2));
 return {routes,headers:staticHeaders+'\n/ports/:game/\n  Cache-Control: no-cache\n'+compressedHeaders,overflow,staticFiles};
}

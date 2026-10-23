const origin=process.env.SITE_ORIGIN||'https://dilldoe-games.pages.dev';
const expected=process.env.GITHUB_SHA;
if(!expected)throw new Error('Expected website commit is missing');
let published=false;
for(let attempt=0;attempt<12;attempt++){
 try{
  const response=await fetch(origin+'/website-version.json?commit='+expected+'&attempt='+attempt,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.ok&&response.headers.get('content-type')?.includes('application/json')&&(await response.json()).commit===expected){published=true;break;}
  await response.body?.cancel().catch(()=>{});
 }catch(error){console.log('Waiting for the production website to update: '+error.message);}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!published)throw new Error('The live website has not published this commit');
const health=await fetch(origin+'/__migration/health',{signal:AbortSignal.timeout(15000)});
if(!health.ok)throw new Error('The game server check failed');
const data=await health.json();
if(data.missingSources.length)throw new Error('Some migrated game sources are missing');
const {default:catalog}=await import('./lib/game-catalog.json',{with:{type:'json'}});
const {isSecondaryFile,STATIC_LIMIT,STATIC_ORIGIN}=await import('./lib/static-plan.mjs');
const dataOrigin=process.env.STATIC_DATA_ORIGIN||STATIC_ORIGIN;
const report=await(await fetch(origin+'/static-game-report.json',{signal:AbortSignal.timeout(15000)})).json();
const isStatic=(game,file)=>entrySize(game,file)<=STATIC_LIMIT||report.compressedFiles.includes('/ports/'+game+'/'+file);
const entrySize=(game,file)=>catalog.games[game].files[file]??Infinity;
let checked=0;
for(const [game,entry]of Object.entries(catalog.games)){
 const candidates=[entry.entry||'index.html',Object.keys(entry.files).find(file=>isSecondaryFile(file)&&isStatic(game,file)&&!(game==='halo-mobile'&&file==='game-download.json')),Object.keys(entry.files).find(file=>/\.wasm(?:\.(?:gz|br))?$/.test(file)&&isStatic(game,file))].filter(Boolean);
 for(const file of new Set(candidates)){
  if(!Object.hasOwn(entry.files,file)||!isStatic(game,file))continue;
  const url=origin+'/ports/'+game+'/'+file.split('/').map(encodeURIComponent).join('/');
  const result=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(30000)});
  if(!result.ok)throw new Error('Static game check failed: '+game+'/'+file+' HTTP '+result.status);
  if(isSecondaryFile(file)&&(!result.url.startsWith(dataOrigin+'/')||result.headers.get('access-control-allow-origin')!=='*'))throw new Error('Static game CORS/redirect check failed: '+game+'/'+file);
  if(/\.wasm(?:\.(?:gz|br))?$/.test(file)&&!result.headers.get('content-type')?.includes('application/wasm'))throw new Error('WebAssembly MIME check failed: '+game+'/'+file);
  if(/\.(gz|br)$/.test(file)&&result.headers.get('content-encoding')!==file.split('.').at(-1))throw new Error('Compressed game encoding check failed: '+game+'/'+file);
  if(report.compressedFiles.includes('/ports/'+game+'/'+file)&&result.headers.get('content-encoding')!=='gzip')throw new Error('Static runtime gzip check failed: '+game+'/'+file);
  checked++;
 }
 const largeWasm=Object.keys(entry.files).find(file=>file.endsWith('.wasm')&&!isStatic(game,file));
 if(largeWasm){
  const url=origin+'/ports/'+game+'/'+largeWasm.split('/').map(encodeURIComponent).join('/');
  let ready=false;
  for(let attempt=0;attempt<10;attempt++){
   let detail='no response';
   try{
    const result=await fetch(url+'?publish-check='+expected+'&attempt='+attempt,{method:'HEAD',headers:{'Accept-Encoding':'identity'},cache:'no-store',signal:AbortSignal.timeout(30000)});
    detail=`HTTP ${result.status}, ${result.headers.get('content-type')||'no content type'}, ${result.headers.get('content-encoding')||'uncompressed'}`;
    ready=result.ok&&result.headers.get('content-type')==='application/wasm'&&!result.headers.has('content-encoding');
   }catch(error){detail=error.message;}
   if(ready)break;
   console.log('Waiting for large WebAssembly route '+game+'/'+largeWasm+': '+detail);
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(!ready)throw new Error('Large WebAssembly route check failed: '+game+'/'+largeWasm);
  checked++;
 }
}
const haloManifest=await fetch(origin+'/ports/halo-mobile/local-maps.json',{signal:AbortSignal.timeout(15000)});
if(!haloManifest.ok||!(await haloManifest.json()).files?.some(file=>file.name==='ui.map'))throw new Error('Halo streamed map manifest check failed');
const haloMap=await fetch(origin+'/downloaded-maps//ui.map',{headers:{Range:'bytes=0-7'},signal:AbortSignal.timeout(15000)});
if(haloMap.status!==206||!haloMap.headers.get('content-range')?.startsWith('bytes 0-7/'))throw new Error('Halo streamed map range check failed');
await haloMap.body?.cancel();
console.log('Live website updated to '+expected+'; '+data.games.length+' game ports configured; '+checked+' static entry/data/runtime checks passed.');

import catalog from './game-catalog.json' with {type:'json'};
import packed from './game-assets.json' with {type:'json'};
import gtaIndex from './gta-data-index.json' with {type:'json'};
import {createDataServer} from './gta-data-server.mjs';
import {createReleaseStore,parseByteRange} from './release-store.mjs';
import {bootstrap,cleanPath,contentType,isolatedHeaders,rewriteRootPaths} from './migration-paths.mjs';
import {splitStream} from './split-stream.mjs';
import {patchFeedPitHtml} from './feed-pit-loader.mjs';

const readPacked=createReleaseStore('https://github.com/MagiczLunchly/gta5-webport-vercel/releases/download/dilldoe-game-assets-v1/',packed.packs);
const gta=createDataServer(gtaIndex);
const emulatorGames={
 'master-quest-browser':['masterquest.z64',33554432],
 'persona3-browser':['persona3portable.iso',1321861120],
 'ghost-sparta-browser':['ghostofsparta.iso',1747714048],
};
const emulatorStores=Object.fromEntries(Object.entries(emulatorGames).map(([name,[file,size]])=>[name,createReleaseStore(`https://github.com/MagiczLunchly/${name}/releases/download/game-v1/`,[{name:file,size}])]));
const haloSize=1857797028;
const haloStore=createReleaseStore('https://github.com/MagiczLunchly/Halo-Mobile/releases/download/halo-game-data-v1/',[{name:'halo-maps.bin.gz',size:haloSize}]);
const spiderSize=436830208;
const spiderStore=createReleaseStore('https://github.com/MagiczLunchly/gta5-webport-vercel/releases/download/spiderman-psp-v1/',[{name:'webofshadows.iso',size:spiderSize}]);

function response(body,status=200,headers={}){return new Response(body,{status,headers:{...isolatedHeaders,...headers}});}
function rangeHeaders(size,start,end,partial){return {'Accept-Ranges':'bytes','Content-Length':String(Math.max(0,end-start+1)),'Vary':'Range','Cache-Control':partial?'no-store':'public, max-age=86400',...(partial?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})};}
function rangeError(size){return response('Invalid byte range',416,{'Content-Range':`bytes */${size}`,'Cache-Control':'no-store'});}
async function specialDownload(request,url,game,path) {
 if(emulatorStores[game]&&path==='api/game'){
  const start=Number(url.searchParams.get('start')),end=Number(url.searchParams.get('end')),size=emulatorGames[game][1];
  if(!url.searchParams.has('start')||!url.searchParams.has('end')||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>=size||end-start+1>4194304)return response('Invalid game range',400);
  return response(request.method==='HEAD'?null:await emulatorStores[game]([0,0,size],start,end,request.signal),200,{'Content-Type':'application/octet-stream',...rangeHeaders(size,start,end,false),'Cache-Control':'public, max-age=31536000, immutable'});
 }
 if(game==='halo-mobile'&&path==='game-data/halo-maps.bin.gz'){
  let start,end;try{[start,end]=parseByteRange(request.headers.get('Range'),haloSize);}catch{return rangeError(haloSize);}
  if(!request.headers.has('Range')||end-start+1>8388608)return rangeError(haloSize);
  return response(request.method==='HEAD'?null:await haloStore([0,0,haloSize],start,end,request.signal),206,{'Content-Type':'application/octet-stream',...rangeHeaders(haloSize,start,end,true)});
 }
 if(game==='gta5-webport-vercel'&&path.startsWith('data/')){
  const internal=new URL(request.url);internal.pathname='/'+path;
  const result=await gta(new Request(internal,request));
  const headers=new Headers(result.headers);for(const[k,v]of Object.entries(isolatedHeaders))headers.set(k,v);
  return new Response(result.body,{status:result.status,headers});
 }
 if(game==='gta5-webport-vercel'&&path==='deployment-status.json')return response(JSON.stringify({ready:true}),200,{'Content-Type':'application/json','Cache-Control':'no-store'});
 return null;
}

async function rawBody(entry,path,start,end,partial,signal){
 const target=`https://raw.githubusercontent.com/${entry.repo}/${entry.sha}/${(entry.directory||'')+path.split('/').map(encodeURIComponent).join('/')}`;
 const upstream=await fetch(target,{headers:{'Accept-Encoding':'identity',...(partial?{Range:`bytes=${start}-${end}`}:{})},signal});
 if(!upstream.ok||!upstream.body){await upstream.body?.cancel();throw new Error('Game asset unavailable');}
 if(!partial)return upstream.body;
 if(upstream.status===206&&upstream.headers.get('Content-Range')===`bytes ${start}-${end}/${entry.files[path]}`)return upstream.body;
 // GitHub raw may ignore Range. Slice its stream without buffering the file.
 if(upstream.status!==200){await upstream.body.cancel();throw new Error('Unexpected upstream range');}
 const reader=upstream.body.getReader();let position=0,done=false;
 return new ReadableStream({async pull(controller){try{while(!done){const chunk=await reader.read();if(chunk.done){done=true;controller.error(new Error('Incomplete upstream asset'));return;}const from=Math.max(0,start-position),to=Math.min(chunk.value.byteLength,end+1-position);position+=chunk.value.byteLength;if(to>from)controller.enqueue(chunk.value.subarray(from,to));if(position>end){done=true;await reader.cancel();controller.close();return;}if(to>from)return;}}catch(e){controller.error(e);}},cancel(reason){done=true;return reader.cancel(reason);}});
}

async function gameAsset(request,url,game,path) {
 const entry=catalog.games[game];if(!entry)return response('Game not found',404);
 if(!path)path=entry.entry||'index.html';
 const special=await specialDownload(request,url,game,path);if(special)return special;
 if(!Object.hasOwn(entry.files,path)) {
  if(Object.hasOwn(entry.files,path+'/index.html'))return Response.redirect(new URL(url.pathname+'/',url),308);
  if(!path.includes('.')&&Object.hasOwn(entry.files,path+'.html'))path+='.html';
  else return response('Game file not found',404);
 }
 const size=entry.files[path],partial=request.headers.has('Range');let start,end;
 try{[start,end]=size===0&&!partial?[0,-1]:parseByteRange(request.headers.get('Range'),size);}catch{return rangeError(size);}
 const headers={'Content-Type':contentType(path),...rangeHeaders(size,start,end,partial),'ETag':`"${entry.sha||'pack-v1'}-${size}"`};
 if(/\.(wasm|js|data)\.br$/.test(path))headers['Content-Encoding']='br';
 if(/\.(wasm|js|data)\.gz$/.test(path))headers['Content-Encoding']='gzip';
 if(request.method==='HEAD')return response(null,partial?206:200,headers);
 if(size===0)return response('',200,headers);
 const body=entry.splitFiles?.[path]
  ?splitStream(entry.splitFiles[path].map(part=>({path:part,size:entry.files[part]})),start,end,(part,a,b,size)=>rawBody(entry,part,a,b,a!==0||b!==size-1,request.signal))
  :entry.mode==='raw'?await rawBody(entry,path,start,end,partial,request.signal):await readPacked(packed.files[game+'/'+path],start,end,request.signal);
 const textFile=/\.(html|js|mjs|css|json)$/.test(path);
 if(!partial&&textFile&&size<8*1024*1024){
  let text=await new Response(body).text();text=rewriteRootPaths(text,game,entry.files,path);
  if(path.endsWith('.html')){
   if(game==='feed-the-pit')text=patchFeedPitHtml(text,entry);
   text=text.replace(/<base\b[^>]*>/gi,'');
   if(entry.files['renpy.wasm'])text=text.replace(/(src=["'])(renpy(?:-pre)?\.js)(["'])/g,'$1$2?paths=2$3');
   const inject=bootstrap(game);
   text=/<head\b[^>]*>/i.test(text)?text.replace(/<head\b[^>]*>/i,m=>m+inject):inject+text;
  }
  delete headers['Content-Length'];delete headers.ETag;
  if(path.endsWith('.html')||(entry.files['renpy.wasm']&&/^renpy(?:-pre)?\.js$/.test(path)))headers['Cache-Control']='no-cache';
  return response(text,200,headers);
 }
 const result=response(body,partial?206:200,headers);
 if(!partial&&path.endsWith('.html')){
  result.headers.delete('Content-Length');result.headers.set('Cache-Control','no-cache');
   if(typeof HTMLRewriter==='undefined')return result;
  return new HTMLRewriter().on('head',{element(el){el.prepend(bootstrap(game),{html:true});}}).transform(result);
 }
 return result;
}

export async function migrationRouter(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/ports/spiderman-psp/api/game'){
  if(!['GET','HEAD'].includes(request.method))return response('Method not allowed',405,{'Allow':'GET, HEAD'});
  const start=Number(url.searchParams.get('start')),end=Number(url.searchParams.get('end'));
  if(!url.searchParams.has('start')||!url.searchParams.has('end')||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>=spiderSize||end-start+1>4194304)return response('Invalid game range',400);
  try{return response(request.method==='HEAD'?null:await spiderStore([0,0,spiderSize],start,end,request.signal),200,{'Content-Type':'application/octet-stream','Content-Length':String(end-start+1),'Cache-Control':'public, max-age=31536000, immutable'});}
  catch(e){console.error('Spider-Man game download failed',e instanceof Error?e.message:String(e));return response('Download temporarily unavailable. Please retry.',503,{'Cache-Control':'no-store','Retry-After':'2'});}
 }
 if(url.pathname==='/__migration/health')return Response.json({site:'DillDoe',games:Object.keys(catalog.games),missingSources:catalog.missingSources},{headers:{'Cache-Control':'no-store'}});
 if(url.pathname.startsWith('/halo-mobile/'))return Response.redirect(new URL(url.pathname.replace('/halo-mobile/','/ports/halo-mobile/')+url.search,url),307);
 const match=/^\/ports\/([a-z0-9-]+)(\/.*)?$/.exec(url.pathname);
 if(match){
  if(!match[2])return Response.redirect(new URL(url.pathname+'/'+url.search,url),308);
  const path=cleanPath(match[2]);if(path===null)return response('Invalid game path',400);
  if(!['GET','HEAD'].includes(request.method)&&!(match[1]==='gta5-webport-vercel'&&path==='data/batch'&&request.method==='POST'))return response('Method not allowed',405,{'Allow':'GET, HEAD'});
  try{return await gameAsset(request,url,match[1],path);}catch(e){console.error('Game asset request failed',match[1],path,e instanceof Error?e.message:String(e));return response('Download temporarily unavailable. Please retry.',503,{'Cache-Control':'no-store','Retry-After':'2'});}
 }
 const path=cleanPath(url.pathname);if(path===null)return response('Invalid path',400);
 let source=path||'index.html';if(!source.includes('.'))source+='.html';
 if(catalog.main.includes(source)){
  const assetUrl=new URL(request.url);assetUrl.pathname='/site/'+source;
  const result=await env.ASSETS.fetch(new Request(assetUrl,request));
  const headers=new Headers(result.headers);
  const needsIsolation=catalog.mainIsolation.includes(source);
  if(needsIsolation)for(const[k,v]of Object.entries(isolatedHeaders))headers.set(k,v);
  if(source.endsWith('.html'))headers.set('Cache-Control','no-cache');
  return new Response(result.body,{status:result.status,headers});
 }
 return null;
}

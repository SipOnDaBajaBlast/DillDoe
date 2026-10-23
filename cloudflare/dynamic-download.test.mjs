import test from 'node:test';
import assert from 'node:assert/strict';
import index from './lib/gta-data-index.json' with {type:'json'};
import {migrationRouter} from './lib/migration-router.mjs';
import {createDataServer} from './lib/gta-data-server.mjs';
import haloMaps from './lib/halo-stream-manifest.json' with {type:'json'};
test('GTA data API preserves partial-read headers after static routing changes',async()=>{
 const[name,record]=Object.entries(index.files).find(([,r])=>r[2]>8*1024*1024);
 const request=new Request('https://dilldoe-games.pages.dev/ports/gta5-webport-vercel/data/file?file='+encodeURIComponent(name),{method:'HEAD',headers:{Range:'bytes=4-12'}});
 const response=await migrationRouter(request,{});
 assert.equal(response.status,206);assert.equal(response.headers.get('Content-Length'),'9');assert.equal(response.headers.get('Content-Range'),`bytes 4-12/${record[2]}`);
 assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'),'require-corp');
});
test('invalid dynamic batches are rejected before any upstream download',async()=>{
 const response=await migrationRouter(new Request('https://dilldoe-games.pages.dev/ports/gta5-webport-vercel/data/batch',{method:'POST',body:'[]'}),{});
 assert.equal(response.status,400);
});
test('GTA data follows a renamed GitHub repository to its release asset',async()=>{
 const calls=[];
 const fetcher=async(url)=>{
  calls.push(url);
  if(calls.length===1)return new Response(null,{status:301,headers:{Location:'https://github.com/SipOnDaBajaBlast/gta5-webport-vercel/releases/download/game-data-v2/pack.bin'}});
  if(calls.length===2)return new Response(null,{status:302,headers:{Location:'https://release-assets.githubusercontent.com/asset'}});
  return new Response('abc',{status:206,headers:{'Content-Range':'bytes 0-2/10'}});
 };
 const handler=createDataServer({packs:[{name:'pack.bin',size:10}],files:{'manifest.json':[0,0,3]}},fetcher);
 const result=await handler(new Request('https://example.test/data/file?file=manifest.json'));
 assert.equal(result.status,200);assert.equal(await result.text(),'abc');assert.equal(calls.length,3);
});
test('Halo streamed map routes advertise correct byte ranges',async()=>{
 const first=haloMaps.files[0];
 const response=await migrationRouter(new Request('https://dilldoe-games.pages.dev/downloaded-maps/'+first.name,{method:'HEAD',headers:{Range:'bytes=0-1023'}}),{});
 assert.equal(response.status,206);
 assert.equal(response.headers.get('Content-Range'),`bytes 0-1023/${first.size}`);
 const wasmfs=await migrationRouter(new Request('https://dilldoe-games.pages.dev/downloaded-maps//'+first.name,{method:'HEAD',headers:{Range:'bytes=0-1023'}}),{});
 assert.equal(wasmfs.status,206);
 const manifest=await migrationRouter(new Request('https://dilldoe-games.pages.dev/ports/halo-mobile/local-maps.json'),{});
 assert.equal(manifest.status,200);
 assert.deepEqual((await manifest.json()).files,haloMaps.files);
});

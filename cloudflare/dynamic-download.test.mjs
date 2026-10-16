import test from 'node:test';
import assert from 'node:assert/strict';
import index from './lib/gta-data-index.json' with {type:'json'};
import {migrationRouter} from './lib/migration-router.mjs';
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

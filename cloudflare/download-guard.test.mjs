import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installGameDownloadGuard} from './lib/migration-paths.mjs';
function guard(fetch,worker=false){
 let now=1000;const scope={fetch};
 const context={URL,Request,Date:{now:()=>now},location:new URL('https://dilldoe-games.pages.dev/ports/example/'),[worker?'self':'window']:scope};
 vm.runInNewContext('('+installGameDownloadGuard.toString()+')()',context);
 return {fetch:(...args)=>scope.fetch(...args),advance:()=>{now+=31000;}};
}
test('an unavailable download cannot repeatedly spend requests during backoff',async()=>{
 let requests=0;const g=guard(async()=>{requests++;return new Response('Unavailable',{status:503});});
 assert.equal((await g.fetch('/ports/example/data.bin')).status,503);
 await assert.rejects(g.fetch('/ports/example/data.bin?retry=2'),/Wait 30 seconds/);
 assert.equal(requests,1);g.advance();await g.fetch('/ports/example/data.bin');assert.equal(requests,2);
});
test('quota homepage is rejected instead of passed to a WebAssembly compiler',async()=>{
 let requests=0;const g=guard(async()=>{requests++;return new Response('<html>Homepage</html>',{headers:{'Content-Type':'text/html'}});},true);
 await assert.rejects(g.fetch('/ports/example/game.wasm'),/webpage instead of game data/);
 await assert.rejects(g.fetch('/ports/example/game.wasm'),/Wait 30 seconds/);assert.equal(requests,1);
});
test('cancellation and unrelated external requests do not trigger download backoff',async()=>{
 let requests=0;const g=guard(async()=>{requests++;throw Object.assign(new Error('Cancelled'),{name:'AbortError'});});
 await assert.rejects(g.fetch('/ports/example/data.bin'));await assert.rejects(g.fetch('/ports/example/data.bin'));assert.equal(requests,2);
 const external=guard(async()=>new Response('Unavailable',{status:503}));
 assert.equal((await external.fetch('https://example.com/asset')).status,503);assert.equal((await external.fetch('https://example.com/asset')).status,503);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBaseline,mergeManifest,deploymentForm,staticFingerprint} from './lib/static-build-state.mjs';
const baseline={schema:1,fingerprint:'example',gameManifest:{'/ports/game/runtime.wasm':'a'.repeat(32)},report:{games:{game:{}}},staticHeaders:'/ports/*\n',redirects:''};
test('fast deployment retains game files and replaces only the current website inventory',()=>{
 const result=mergeManifest(validateBaseline(baseline,'example'),{'/index.html':'b'.repeat(32),'/games.html':'c'.repeat(32)});
 assert.equal(result['/ports/game/runtime.wasm'],'a'.repeat(32));
 assert.equal(result['/index.html'],'b'.repeat(32));assert.equal(Object.keys(result).length,3);
 assert.equal(result['/removed-old-page.html'],undefined);
});
test('changed sources and unsafe baseline paths cannot silently reuse old game data',()=>{
 assert.throws(()=>validateBaseline(baseline,'changed'));
 assert.throws(()=>validateBaseline({...baseline,gameManifest:{'/ports/../index.html':'a'.repeat(32)}},'example'));
 assert.throws(()=>validateBaseline({...baseline,gameManifest:{'/index.html':'a'.repeat(32)}},'example'));
 assert.throws(()=>validateBaseline({...baseline,gameManifest:{'/ports/game/x':'bad-hash'}},'example'));
});
test('direct deployment preserves the Worker, headers, redirects and selective routes',async()=>{
 const files={'_worker.js':'export default {fetch(){return new Response("ok")}}','_routes.json':'{"version":1,"include":["/api/*"],"exclude":[]}','_headers':'/games/game\n  Cross-Origin-Embedder-Policy: require-corp','_redirects':'/old /new 302'};
 const form=deploymentForm(baseline.gameManifest,files,'abc');
 for(const [name,value]of Object.entries(files))assert.equal(await form.get(name).text(),value);
 assert.equal(form.get('branch'),'main');assert.equal(form.get('commit_hash'),'abc');
 assert.deepEqual(JSON.parse(form.get('manifest')),baseline.gameManifest);
 assert.equal(form.has('_worker.bundle'),false);
});
test('fingerprint is deterministic and includes game materialization inputs',async()=>{
 assert.match(await staticFingerprint(),/^[a-f0-9]{64}$/);
 assert.equal(await staticFingerprint(),await staticFingerprint());
});

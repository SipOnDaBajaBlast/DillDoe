import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installDeathNoteData, patchDeathNoteHtml} from './lib/death-note-loader.mjs';

function setup(fetch, parts = ['data.part0', 'data.part1'], size = 5) {
 const window = {fetch};
 vm.runInNewContext('(' + installDeathNoteData.toString() + ')(parts,size)', {
  window, parts, size, location:{href:'https://example.test/ports/death-note/'},
  Request, Response, ReadableStream, DOMException, URL
 });
 return window.fetch;
}
test('split Unity data streams byte-for-byte with original cache key and version', async () => {
 const requests = [];
 const fetch = setup(async url => {
  requests.push(String(url));
  return new Response(new Uint8Array(url.includes('part0') ? [31,139,8] : [4,5]));
 });
 const response = await fetch('Build/DeathNote.data.unityweb?v=test');
 assert.equal(response.headers.get('Content-Length'), '5');
 assert.equal(response.headers.get('Content-Encoding'), null);
 // Unity clones the stream for its IndexedDB/Cache API path.
 const clone = response.clone();
 assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [31,139,8,4,5]);
 assert.deepEqual([...new Uint8Array(await clone.arrayBuffer())], [31,139,8,4,5]);
 assert.deepEqual(requests, ['https://example.test/ports/death-note/Build/data.part0?v=test', 'https://example.test/ports/death-note/Build/data.part1?v=test']);
});
test('unrelated fetches pass through; missing chunks and wrong size fail clearly', async () => {
 const fetch = setup(async url => url === 'other.json' ? new Response('other') : new Response('<html>missing</html>', {status:404, headers:{'Content-Type':'text/html'}}));
 assert.equal(await (await fetch('other.json')).text(), 'other');
 await assert.rejects((await fetch('Build/DeathNote.data.unityweb')).arrayBuffer(), /HTTP 404/);
 const truncated = setup(async () => new Response(new Uint8Array([1])));
 await assert.rejects((await truncated('Build/DeathNote.data.unityweb')).arrayBuffer(), /incomplete/);
});
test('compatibility patch is limited to a validated original Death Note loader', () => {
 const entry={files:{'Build/data.part0':2},splitFiles:{'Build/DeathNote.data.unityweb':['Build/data.part0']}};
 const result=patchDeathNoteHtml('<head></head><script src="Build/DeathNote.loader.js"></script>',entry);
 assert.ok(result.includes('installDeathNoteData'));
 assert.ok(result.includes('["data.part0"],2)'));
 assert.throws(()=>patchDeathNoteHtml('<head></head>',entry),/Recheck/);
});

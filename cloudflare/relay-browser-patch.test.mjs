import test from 'node:test';
import assert from 'node:assert/strict';
import {patchRobloxText, serveRoblox} from './worker.mjs';

/* Excerpt shaped like the served multiplayer.js server browser. */
const source = [
  "  setStatus(els.sbStatus, 'Loading rooms...');",
  '  var timer = controller ? setTimeout(function () { controller.abort(); }, 5000) : null;',
  '  fetch(url).then(function (data) {',
  "    setStatus(els.sbStatus, '');",
  '  }).catch(function () {',
  '    if (state.browsing) {',
  "      setStatus(els.sbStatus, 'Multiplayer relay is offline. Play Solo still works.');",
  '    }',
  '  });'
].join('\n');

test('room list waits longer than five seconds', () => {
  const patched = patchRobloxText(source);
  assert.match(patched, /controller\.abort\(\); \}, 12000\)/);
  assert.doesNotMatch(patched, /\}, 5000\)/);
});

test('room list retries before claiming the relay is offline', () => {
  const patched = patchRobloxText(source);
  assert.match(patched, /state\.roomFails = \(state\.roomFails \|\| 0\) \+ 1;/);
  assert.match(patched, /Relay is not responding\. Retrying/);
  assert.match(patched, /state\.roomFails >= 4/);
  assert.match(patched, /Multiplayer relay is offline\. Play Solo still works\./);
});

test('a successful room list resets the failure count', () => {
  const patched = patchRobloxText(source);
  assert.match(patched, /state\.roomFails = 0; setStatus\(els\.sbStatus, ''\);/);
});

const fileUrl = 'https://example.test/ports/roblox-march-2007/web/js/multiplayer.js';

function assetEnv(body, etag) {
  const seen = [];
  return {
    seen,
    ASSETS: {
      fetch: async req => {
        seen.push(req.headers.get('if-none-match'));
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/javascript', etag, 'cache-control': 'public, max-age=600' }
        });
      }
    }
  };
}

test('patched files never reuse the unpatched asset ETag', async () => {
  const env = assetEnv(source, 'W/"asset-v1"');
  const res = await serveRoblox(
    new Request(fileUrl, { headers: { 'if-none-match': 'W/"asset-v1"' } }), env
  );
  assert.equal(res.status, 200);
  assert.notEqual(res.headers.get('etag'), 'W/"asset-v1"');
  assert.match(await res.text(), /roomFails/);
  assert.equal(env.seen[0], null);
});

test('a matching patched-content tag answers 304', async () => {
  const env = assetEnv(source, 'W/"asset-v1"');
  const first = await serveRoblox(new Request(fileUrl), env);
  const tag = first.headers.get('etag');
  const second = await serveRoblox(
    new Request(fileUrl, { headers: { 'if-none-match': tag } }), env
  );
  assert.equal(second.status, 304);
  assert.equal(await second.text(), '');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {patchRobloxText} from './worker.mjs';

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

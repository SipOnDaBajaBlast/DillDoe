import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startFeedThePit} from './lib/feed-pit-loader.mjs';

const data = Uint8Array.of(71, 68, 80, 67, 4, 5, 6, 7);
const parts = [{path: 'a', size: 4}, {path: 'b', size: 4}];
const config = {executable: 'feedthepit', args: [], fileSizes: {'feedthepit.pck': 8}};
function fakeEngine() {
  const calls = [];
  return {calls, async init(name) { calls.push(['init', name]); },
    async preloadFile(bytes, path) { assert.ok(bytes instanceof ArrayBuffer); calls.push(['preload', Array.from(new Uint8Array(bytes)), path]); },
    async start(options) { calls.push(['start', options]); }};
}
test('retries a short successful HTTP response and mounts the complete pack before starting', async () => {
  const engine = fakeEngine(), attempts = {a: 0, b: 0}, reported = [];
  await startFeedThePit(engine, config, {onProgress: (current, total) => reported.push([current, total])}, parts, async url => {
    const path = url.split('?')[0]; attempts[path]++;
    return new Response(path === 'a' ? data.slice(0, attempts.a === 1 ? 2 : 4) : data.slice(4));
  });
  assert.equal(attempts.a, 2);
  assert.deepEqual(engine.calls, [['init', 'feedthepit'], ['preload', Array.from(data), 'feedthepit.pck'], ['start', {args: ['--main-pack', 'feedthepit.pck']}]]);
  assert.deepEqual(reported.at(-1), [8, 8]);
});
test('permanently incomplete downloads and invalid pack headers never start the game', async () => {
  for (const body of [new Uint8Array(2), new Uint8Array(4)]) {
    const engine = fakeEngine();
    await assert.rejects(startFeedThePit(engine, config, {}, parts, async () => new Response(body)), /interrupted|Invalid game data/);
    assert.deepEqual(engine.calls, []);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {needsGameIsolation} from './lib/isolation-page.mjs';

test('a library thumbnail in /ports does not isolate all external cover art',()=>{
 const library='<a href="games/Omori.html"><img src="/ports/omori/icon/icon.png"></a>';
 assert.equal(needsGameIsolation('games.html',library),false);
});

test('playable port pages retain isolation unless explicitly opted out',()=>{
 assert.equal(needsGameIsolation('games/Omori.html','<iframe src="/ports/omori/">'),true);
 assert.equal(needsGameIsolation('games/Omori.html','<meta name="cross-origin-isolation" content="unneeded"><iframe src="/ports/omori/">'),false);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rewriteRootPaths} from './lib/migration-paths.mjs';
test('RenPy virtual filesystem paths survive migration',()=>{
 const files={'game.zip':100,'renpy.wasm':100,'game/cache/bytecode-311.rpyb':100};
 const source="FS.open('/game.zip', 'w'); FSDownload('/game/cache/bytecode-311.rpyb');";
 for(const script of ['renpy.js','renpy-pre.js'])assert.equal(rewriteRootPaths(source,'daybreak-web',files,script),source);
 assert.equal(rewriteRootPaths('<a href="/game.zip">game</a>','daybreak-web',files,'index.html'),'<a href="/ports/daybreak-web/game.zip">game</a>');
});

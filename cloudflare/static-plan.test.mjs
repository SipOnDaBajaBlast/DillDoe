import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {staticPlan,STATIC_LIMIT} from './lib/static-plan.mjs';
import {transformGameText} from './lib/game-text.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('./lib/game-catalog.json',import.meta.url)));
test('every game file is static or explicitly retains a function route',()=>{
 const plan=staticPlan(catalog);let primary=0,secondary=0;
 for(const[name,game]of Object.entries(plan.games)){
  assert.equal(game.files.length+game.large.length,Object.keys(catalog.games[name].files).length);
  for(const file of game.files)assert.ok(catalog.games[name].files[file]<=STATIC_LIMIT);
  for(const file of game.large)assert.ok(plan.routes.includes(encodeURI('/ports/'+name+'/'+file))||plan.routes.includes('/ports/'+name+'/*'));
  secondary+=game.secondaryFiles.length;primary+=game.files.length-game.secondaryFiles.length;
 }
 assert.ok(primary<=19000);assert.ok(secondary<19000);assert.ok(plan.routes.length<=100);
 // Thousands of GTA shaders and Hit & Run textures must bypass functions.
 assert.equal(plan.routes.some(p=>p==='/ports/*'),false);
 assert.ok(!plan.games['gta5-webport-vercel'].secondaryFiles.some(p=>/\.(html|js|wasm)$/.test(p)));
 assert.equal(plan.games['kisakcodfork1'].large.length,0);
 assert.equal(plan.routes.includes('/ports/gta5-webport-vercel/data/*'),false);
 assert.ok(plan.routes.includes('/ports/gta5-webport-vercel/data/batch'));
 for(const game of Object.values(plan.games))assert.ok(!game.secondaryFiles.some(file=>/\.(html|js|mjs|png|webp|jpg|ogg|mp3|wasm)$/.test(file)));
});
test('static and dynamic text retain game scoping and RenPy filesystem paths',()=>{
 const entry={files:{'index.html':100,'assets/game.js':100,'renpy.wasm':100}};
 const html=transformGameText('<html><head></head><script src="/assets/game.js"></script></html>','example',entry,'index.html');
 assert.ok(html.includes('src="/ports/example/assets/game.js"'));
 assert.ok(html.includes('window.fetch'));
 const renpy='FS.mkdir("/game"); fetch("/renpy.wasm")';
 assert.equal(transformGameText(renpy,'example',entry,'renpy.js'),renpy);
 const gtaData='{"path":"/data/a.rpf"}';
 assert.equal(transformGameText(gtaData,'gta5-webport-vercel',entry,'data/example.json'),gtaData);
});

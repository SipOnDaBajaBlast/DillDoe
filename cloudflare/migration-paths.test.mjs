import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {rewriteRootPaths, bootstrap, installSmgShaderCompatibility} from './lib/migration-paths.mjs';
test('RenPy virtual filesystem paths survive migration',()=>{
 const files={'game.zip':100,'renpy.wasm':100,'game/cache/bytecode-311.rpyb':100};
 const source="FS.open('/game.zip', 'w'); FSDownload('/game/cache/bytecode-311.rpyb');";
 for(const script of ['renpy.js','renpy-pre.js'])assert.equal(rewriteRootPaths(source,'daybreak-web',files,script),source);
 assert.equal(rewriteRootPaths('<a href="/game.zip">game</a>','daybreak-web',files,'index.html'),'<a href="/ports/daybreak-web/game.zip">game</a>');
});
test('SMG falls back to synchronous shader compilation without losing other extensions',()=>{
 const parallel={COMPLETION_STATUS_KHR:0x91b1},other={supported:true};
 const gl={getExtension(name){return name==='KHR_parallel_shader_compile'?parallel:other;},getSupportedExtensions(){return ['KHR_parallel_shader_compile','EXT_color_buffer_float'];}};
 const drawing={fillRect(){}};
 class Canvas{getContext(type){return type==='webgl2'?gl:type==='2d'?drawing:null;}}
 vm.runInNewContext(`(${installSmgShaderCompatibility.toString()})()`,{HTMLCanvasElement:Canvas,WeakSet});
 const canvas=new Canvas();
 assert.equal(canvas.getContext('webgl2'),gl);
 assert.equal(gl.getExtension('KHR_parallel_shader_compile'),null);
 assert.equal(gl.getExtension('khr_parallel_shader_compile'),null);
 assert.deepEqual(gl.getSupportedExtensions(),['EXT_color_buffer_float']);
 assert.equal(gl.getExtension('EXT_color_buffer_float'),other);
 assert.equal(canvas.getContext('webgl2'),gl);
 assert.equal(gl.getExtension('EXT_color_buffer_float'),other);
 assert.equal(canvas.getContext('2d'),drawing);
 assert.equal(canvas.getContext('unsupported'),null);
});
test('SMG shader fallback is injected before player scripts and only for SMG',()=>{
 assert.match(bootstrap('smg-webport'),/^<script>\(function installSmgShaderCompatibility/);
 assert.doesNotMatch(bootstrap('daybreak-web'),/KHR_parallel_shader_compile|installSmgShaderCompatibility/);
});

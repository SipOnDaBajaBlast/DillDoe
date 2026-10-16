import test from 'node:test';
import assert from 'node:assert/strict';
import {splitStream} from './lib/split-stream.mjs';
const parts=[{path:'one',size:3},{path:'two',size:4},{path:'three',size:2}];
const source={one:new Uint8Array([0,1,2]),two:new Uint8Array([3,4,5,6]),three:new Uint8Array([7,8])};
test('streams a full asset, crossing ranges, and final bytes in order',async()=>{
  for(const [start,end]of [[0,8],[2,7],[3,6],[8,8]]){
    const calls=[];
    const stream=splitStream(parts,start,end,async(path,a,b)=>{calls.push(path);return new Response(source[path].slice(a,b+1)).body;});
    assert.deepEqual([...new Uint8Array(await new Response(stream).arrayBuffer())],Array.from({length:end-start+1},(_,i)=>start+i));
    if(start===8)assert.deepEqual(calls,['three']);
  }
});
test('rejects invalid ranges and truncated source parts',async()=>{
  assert.throws(()=>splitStream(parts,0,9,()=>{}),/Invalid split asset range/);
  const stream=splitStream(parts,0,8,async()=>new Response(new Uint8Array([0])).body);
  await assert.rejects(new Response(stream).arrayBuffer(),/Incomplete/);
});
test('cancelled clients do not fetch later parts',async()=>{
  const calls=[];
  const stream=splitStream(parts,0,8,async(path,a,b)=>{calls.push(path);return new Response(source[path].slice(a,b+1)).body;});
  const reader=stream.getReader();await reader.read();await reader.cancel();
  assert.deepEqual(calls,['one']);
});

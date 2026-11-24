import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedTarget,handleWisp,packet,sameSite,WispSession,WEBBLOX_ROUTES} from './lib/wisp.mjs';

class FakeSocket extends EventTarget {
 readyState=1;sent=[];
 send(data){this.sent.push(data);}
 close(){this.readyState=3;}
 receive(data){this.dispatchEvent(Object.assign(new Event('message'),{data}));}
}

function connectPacket(streamId,hostname,port){
 const name=new TextEncoder().encode(hostname),payload=new Uint8Array(3+name.length);
 payload[0]=1;new DataView(payload.buffer).setUint16(1,port,true);payload.set(name,3);
 return packet(1,streamId,payload);
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
const parse=data=>({type:data[0],stream:new DataView(data.buffer,data.byteOffset).getUint32(1,true),payload:data.subarray(5)});

test('only Roblox hosts on port 443 are reachable',()=>{
 for(const host of ['apis.roblox.com','roblox.com','setup.rbxcdn.com','gamejoin.roblox.com','clientsettings.sitetest1.robloxlabs.com'])assert.ok(allowedTarget(host,443),host);
 for(const [host,port] of [['apis.roblox.com',80],['example.com',443],['roblox.com.evil.net',443],['evilroblox.com',443],['127.0.0.1',443],['localhost',443],['a..roblox.com',443],['.roblox.com',443]])assert.ok(!allowedTarget(host,port),host+':'+port);
});

test('a blocked host is refused without opening a socket',async()=>{
 let opened=0;const ws=new FakeSocket();
 new WispSession(ws,()=>{opened++;}).attach();
 assert.deepEqual([...parse(ws.sent[0]).payload],[128,0,0,0]);
 ws.receive(connectPacket(1,'example.com',443).buffer);
 await settle();
 assert.equal(opened,0);
 const close=parse(ws.sent.at(-1));
 assert.equal(close.type,4);assert.equal(close.stream,1);assert.equal(close.payload[0],0x48);
});

test('data is relayed both ways for an allowed host',async()=>{
 const written=[];let push;
 const socket={opened:Promise.resolve(),
  readable:new ReadableStream({start(controller){push=controller;}}),
  writable:new WritableStream({write(chunk){written.push(new TextDecoder().decode(chunk));}}),
  close:async()=>{}};
 const targets=[];const ws=new FakeSocket();
 new WispSession(ws,target=>{targets.push(target);return socket;}).attach();
 ws.receive(connectPacket(7,'apis.roblox.com',443).buffer);
 await settle();
 assert.deepEqual(targets,[{hostname:'apis.roblox.com',port:443}]);
 ws.receive(packet(2,7,new TextEncoder().encode('hello')).buffer);
 push.enqueue(new TextEncoder().encode('world'));
 await settle();
 assert.deepEqual(written,['hello']);
 const data=ws.sent.map(parse).find(p=>p.type===2);
 assert.equal(data.stream,7);assert.equal(new TextDecoder().decode(data.payload),'world');
 push.close();await settle();
 const close=parse(ws.sent.at(-1));
 assert.equal(close.type,4);assert.equal(close.payload[0],0x02);
});

test('the relay only accepts WebSockets from this site',()=>{
 const url='https://dilldoe-games.pages.dev/wisp/';
 assert.ok(sameSite(new Request(url,{headers:{origin:'https://dilldoe-games.pages.dev'}})));
 assert.ok(!sameSite(new Request(url,{headers:{origin:'https://other.example'}})));
 assert.ok(!sameSite(new Request(url)));
 assert.equal(handleWisp(new Request(url,{headers:{upgrade:'websocket',origin:'https://other.example'}}),()=>{}).status,403);
 assert.equal(handleWisp(new Request(url),()=>{}).status,426);
});

test('Webblox routes stay small and explicit',()=>{
 assert.ok(WEBBLOX_ROUTES.includes('/wisp/*'));
 assert.ok(!WEBBLOX_ROUTES.includes('/blox/*'),'static /blox/ files must not use Function requests');
});

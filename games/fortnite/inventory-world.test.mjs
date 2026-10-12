import test from 'node:test';import assert from 'node:assert/strict';
import {Match,terrain}from './core.mjs';import {DEFAULT_BINDINGS,rebind}from './bindings.mjs';
const clear=()=>{const m=new Match(1,1);m.obstacles=[];m.walls=[];m.chests=[];m.bots[0].think=Infinity;return m;};
test('empty consumable slots cannot be selected; collected items can be held and used',()=>{
 const m=clear();assert.equal(m.select(3),false);m.pickups=[{x:0,z:10,y:m.player.y+.5,kind:'shield',taken:false}];assert.equal(m.collect(0),true);assert.equal(m.inventory[3],'shield');assert.equal(m.select(3),true);assert.equal(m.useItem,null);assert.equal(m.useSelected(),true);for(let i=0;i<102;i++)m.step(.05);assert.equal(m.shields,0);assert.equal(m.inventory[3],null);assert.equal(m.selected,-1);assert.equal(m.player.shield,100);
});
test('full inventory keeps a third consumable on the ground and stacks owned kinds',()=>{
 const m=clear();m.pickups=['medkit','shield','bandage','shield'].map(kind=>({x:0,z:10,y:m.player.y+.5,kind,taken:false}));assert.ok(m.collect(0));assert.ok(m.collect(1));assert.equal(m.collect(2),false);assert.equal(m.pickups[2].taken,false);assert.ok(m.collect(3));assert.equal(m.shields,2);
});
test('switching cancels a consumable without spending it; guns reload only in gun slots',()=>{
 const m=clear();m.shields=2;m.inventory[3]='shield';m.select(3);m.useSelected();m.select(0);assert.equal(m.useItem,null);assert.equal(m.shields,2);m.select(3);assert.doesNotThrow(()=>m.reload());assert.equal(m.reloadTime,0);
});
test('pickaxe damages and destroys house walls and stops harvesting removed walls',()=>{
 const m=clear(),y=m.player.y+1.35;m.walls=[{id:0,x:0,y,z:8,hx:1.6,hy:1.6,hz:.15,health:100,type:'wall'}];const o={x:0,y,z:10},d={x:0,y:0,z:-1};m.select(-1);m.harvest(o,d);assert.equal(m.walls[0].health,50);m.cooldown=0;m.harvest(o,d);assert.equal(m.walls[0].health,0);assert.ok(m.events.some(e=>e.type==='worldHit'&&e.destroyed));const wood=m.wood;m.cooldown=0;m.harvest(o,d);assert.equal(m.wood,wood);
});
test('chests can be destroyed by pickaxe and bullets, then cannot be searched',()=>{
 const m=clear(),y=m.player.y;m.chests=[{x:0,y,z:8,health:50,opened:false,search:0}];m.select(-1);m.harvest({x:0,y:y+.5,z:10},{x:0,y:0,z:-1});assert.equal(m.chests[0].health,0);m.interact({type:'chest',item:m.chests[0],index:0},2);assert.equal(m.chests[0].opened,false);
 m.chests[0].health=20;m.select(0);m.cooldown=0;m.fire({x:0,y:y+.5,z:10},{x:0,y:0,z:-1},true);assert.equal(m.chests[0].health,0);
});
test('tree trunks can be hit at player hand height and destruction emits one final event',()=>{
 const m=clear(),y=m.player.y;m.obstacles=[{id:1,kind:'tree',x:0,z:8,y,radius:1,height:12,health:50}];m.select(-1);m.harvest({x:0,y:y+1.35,z:10},{x:0,y:0,z:-1});assert.equal(m.obstacles[0].health,0);assert.equal(m.events.filter(e=>e.type==='worldHit'&&e.destroyed).length,1);
});
test('keybind assignment swaps conflicts and keeps Escape available',()=>{
 const bindings={...DEFAULT_BINDINGS};assert.ok(rebind(bindings,'forward','KeyZ'));assert.equal(bindings.forward,'KeyZ');assert.ok(rebind(bindings,'reload','KeyZ'));assert.equal(bindings.forward,'KeyR');assert.equal(bindings.reload,'KeyZ');assert.equal(rebind(bindings,'forward','Escape'),false);assert.equal(new Set(Object.values(bindings)).size,Object.keys(bindings).length);
});

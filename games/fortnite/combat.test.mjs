import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Bone,Quaternion,Vector3} from './vendor/three.core.js';
import {applyFirePose,applyAimPitch,poseCache,restorePose,savePose,shotDirection,alignWeapon} from './combat.mjs';

test('component-space firing does not apply parent recoil twice',()=>{
 const root=new Group(),parent=new Bone(),child=new Bone();parent.name='spine_01';child.name='spine_02';root.add(parent);parent.add(child);
 const delta=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.2).toArray();
 applyFirePose(root,{duration:1,additiveKind:2,bones:{spine_01:{rotation:delta},spine_02:{rotation:delta}}},.1);
 assert.ok(Math.abs(child.getWorldQuaternion(new Quaternion()).angleTo(new Quaternion())-.2)<1e-6);
 assert.ok(child.quaternion.angleTo(new Quaternion())<1e-6);
});
test('aim follows pitch and cached base pose prevents accumulated rotation',()=>{
 const root=new Group();let p=root;for(const name of ['spine_01','spine_02','spine_03']){const b=new Bone();b.name=name;p.add(b);p=b;}
 const cache=poseCache(root);savePose(cache);
 for(let i=0;i<60;i++){restorePose(cache);applyAimPitch(root,0,.5);}
 assert.ok(Math.abs(p.getWorldQuaternion(new Quaternion()).angleTo(new Quaternion())-.5)<1e-6);
});
test('weapon alignment turns the upper body and both grips toward the target',()=>{
 const root=new Group(),spine=new Bone(),gun=new Group();spine.name='spine_02';root.add(spine);spine.add(gun);
 gun.userData.barrel=[new Vector3(),new Vector3(1,0,0)];
 alignWeapon([root],gun,{x:0,y:0,z:-10});
 gun.updateWorldMatrix(true,false);
 const forward=gun.localToWorld(new Vector3(1,0,0)).sub(gun.localToWorld(new Vector3())).normalize();
 assert.ok(forward.distanceTo(new Vector3(0,0,-1))<1e-6);
});
test('off-centre muzzle converges on crosshair and intervening cover stops it',async()=>{
 const {Match}=await import('./core.mjs');const m=new Match(1,1);m.obstacles=[];m.walls=[];
 const muzzle={x:1,y:30,z:0},target={x:0,y:30,z:-20},d=shotDirection(muzzle,target);
 assert.ok(new Vector3(muzzle.x,muzzle.y,muzzle.z).addScaledVector(d,Math.hypot(1,20)).distanceTo(new Vector3(0,30,-20))<1e-6);
 m.walls=[{id:0,x:.5,y:30,z:-10,hx:2,hy:2,hz:.2,health:100}];
 assert.equal(m.trace(muzzle,d,0).hit.wall.id,0);
});

import {Quaternion,Vector3} from './vendor/three.core.js';

export const upperBody=name=>/^(spine|clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky|weapon|neck|head)/i.test(name);

export function poseCache(root){const cache=[];root.traverse(bone=>{if(bone.isBone&&upperBody(bone.name))cache.push({bone,rotation:bone.quaternion.clone(),position:bone.position.clone()});});return cache;}
export function restorePose(cache){for(const {bone,rotation,position}of cache){bone.quaternion.copy(rotation);bone.position.copy(position);}}
export function savePose(cache){for(const item of cache){item.rotation.copy(item.bone.quaternion);item.position.copy(item.bone.position);}}

function rotationAt(entry,time,duration){
  const values=entry.rotation,count=values.length/4;
  if(count===1)return new Quaternion().fromArray(values);
  const frame=Math.min(count-1,Math.max(0,time/duration*(count-1))),a=Math.floor(frame),b=Math.min(count-1,a+1);
  return new Quaternion().fromArray(values,a*4).slerp(new Quaternion().fromArray(values,b*4),frame-a).normalize();
}

// UE rotation-offset clips store component-space deltas. Treating them as
// ordinary local-space actions twists the arms and applies parent recoil twice.
export function applyFirePose(root,data,time,weight=1){
  if(time<0||time>=data.duration||weight<=0)return;
  root.updateWorldMatrix(true,true);
  const component=root.getWorldQuaternion(new Quaternion()),inverse=component.clone().invert(),bones=[];
  root.traverse(bone=>{const entry=data.bones[bone.name];if(bone.isBone&&upperBody(bone.name)&&entry?.rotation)bones.push({bone,entry,base:bone.getWorldQuaternion(new Quaternion())});});
  for(const {bone,entry,base} of bones){
    const delta=new Quaternion().slerp(rotationAt(entry,time,data.duration),weight);
    if(data.additiveKind===2){
      const desired=component.clone().multiply(delta).multiply(inverse).multiply(base);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired));
    }else bone.quaternion.premultiply(delta);
    bone.updateWorldMatrix(false,false);
  }
}

export function applyAimPitch(root,yaw,pitch){
  const right=new Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  root.updateWorldMatrix(true,true);
  for(const [name,weight] of [['spine_01',.2],['spine_02',.35],['spine_03',.45]]){
    const bone=root.getObjectByName(name);if(!bone)continue;
    const parent=bone.parent.getWorldQuaternion(new Quaternion());
    const local=parent.clone().invert().multiply(new Quaternion().setFromAxisAngle(right,pitch*weight)).multiply(parent);
    bone.quaternion.premultiply(local);bone.updateWorldMatrix(false,true);
  }
}

export function shotDirection(muzzle,target){
  return new Vector3(target.x-muzzle.x,target.y-muzzle.y,target.z-muzzle.z).normalize();
}

export function alignWeapon(roots,gun,target){
  gun.updateWorldMatrix(true,false);
  const ends=gun.userData.barrel.map(p=>gun.localToWorld(p.clone()));
  const toward=shotDirection(ends[0],target),forward=ends[1].clone().sub(ends[0]).normalize();
  if(forward.dot(toward)<0)forward.negate();
  const delta=new Quaternion().setFromUnitVectors(forward,toward);
  // Rotate the upper body together, preserving both hands' original grip.
  for(const root of roots){const spine=root.getObjectByName('spine_02');if(!spine)continue;
    const parent=spine.parent.getWorldQuaternion(new Quaternion());
    spine.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));
    spine.updateWorldMatrix(false,true);
  }
}

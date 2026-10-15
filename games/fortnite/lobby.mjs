import * as THREE from 'three';
import {clone} from './vendor/utils/SkeletonUtils.js';
// Original Frontend camera and crossed-arm clip over the user's original S4 art.
// Pads already exist in that artwork; adding substitute geometry would duplicate them.
export function lobbyVerticalFov(aspect){return 2*Math.atan(Math.tan(55*Math.PI/360)/Math.max(16/9,aspect))*180/Math.PI;}
export async function createOriginalLobby({character,clip,makeAnimation,aspect=innerWidth/innerHeight,version='16'}){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(lobbyVerticalFov(aspect),aspect,.1,40);
 camera.position.set(-.039453125,.875133059,5.7953125);camera.lookAt(camera.position.x,camera.position.y,-5);
 scene.add(new THREE.HemisphereLight('#8ed5ff','#132844',1.4));
 const key=new THREE.DirectionalLight('#c5e8ff',2);key.position.set(1.41,2.92,2);scene.add(key);
 const rim=new THREE.DirectionalLight('#28baff',1.8);rim.position.set(-1.6,2.08,-1.45);scene.add(rim);
 const mixers=[];for(const template of character){const root=clone(template);scene.add(root);root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});const mixer=new THREE.AnimationMixer(root);mixer.clipAction(makeAnimation(root,clip)).play();mixers.push(mixer);}
 const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.fov=lobbyVerticalFov(camera.aspect);camera.updateProjectionMatrix();};window.addEventListener('resize',resize);
 document.body.classList.add('original-lobby');
 if(!document.querySelector('link[data-original-lobby]')){const style=document.createElement('link');style.rel='stylesheet';style.dataset.originalLobby='';style.href=new URL('./lobby.css?v='+version,document.baseURI).href;document.head.append(style);}
 return {scene,camera,mixers};
}

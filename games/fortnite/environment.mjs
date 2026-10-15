import * as THREE from 'three';
import {GRAPHICS_QUALITIES} from './graphics.mjs?v=15';
export class Environment{
 constructor(scene,camera,renderer,{quality='performance',onQualityChange=()=>{}}={}){
 this.scene=scene;this.camera=camera;this.renderer=renderer;this.outside=0;this.quality=quality;this.distance=GRAPHICS_QUALITIES[quality].viewDistance;this.shadowTime=1;this.customDistance=false;
 this.colors=Object.fromEntries(Object.entries({normal:'#319ed8',purple:'#7262ad',fog:'#7db6d4',stormFog:'#7361b0',sun:'#fff5e5',stormSun:'#ad83ed',sky:'#b7d8ef',stormSky:'#997be2',ground:'#57513c',stormGround:'#42334e'}).map(([k,v])=>[k,new THREE.Color(v)]));
 try{const saved=+[90,110,140,180,260].find(x=>x===+localStorage.getItem('fortniteViewDistance'));if(saved){this.distance=saved;this.customDistance=true;}}catch{}
 const host=document.getElementById('videoSettings');host.insertAdjacentHTML('beforeend',`<label>Graphics <select id="graphicsQuality">${Object.entries(GRAPHICS_QUALITIES).map(([key,p])=>`<option value="${key}" ${key===quality?'selected':''}>${p.label}</option>`).join('')}</select></label><label>View distance <select id="viewDistance">${[90,110,140,180,260].map(n=>`<option value="${n}" ${n===this.distance?'selected':''}>${n} m</option>`).join('')}</select></label>`);
 document.getElementById('graphicsQuality').onchange=e=>{try{localStorage.setItem('fortniteGraphicsQuality',e.target.value);}catch{}onQualityChange(e.target.value);};
 document.getElementById('viewDistance').onchange=e=>{this.customDistance=true;this.distance=+e.target.value;try{localStorage.setItem('fortniteViewDistance',this.distance);}catch{}};this.tint=document.createElement('div');this.tint.id='stormTint';this.tint.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse,#7362d13d,#3810829c);opacity:0;mix-blend-mode:multiply';document.body.append(this.tint);this.sun=scene.children.find(o=>o.isDirectionalLight);this.sky=scene.children.find(o=>o.isHemisphereLight);this.wall=null;const cloud=new THREE.TextureLoader().load('./assets/skyClouds.png');cloud.wrapS=cloud.wrapT=THREE.RepeatWrapping;this.dome=new THREE.Mesh(new THREE.SphereGeometry(1,40,20),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{cloud:{value:cloud},time:{value:0},storm:{value:0}},vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vDirection;uniform sampler2D cloud;uniform float time;uniform float storm;void main(){vec3 n=normalize(vDirection);float h=max(0.,n.y);vec3 sky=mix(vec3(.35,.68,.83),vec3(.025,.32,.67),sqrt(h));vec2 uv=n.xz/(.25+h)*.17+vec2(time*.0015,0.);float c=texture2D(cloud,uv).b;float mask=smoothstep(.42,.72,c)*smoothstep(.05,.25,h);sky=mix(sky,vec3(.56,.77,.89),mask*.7);sky=mix(sky,sky*vec3(.68,.45,.95),storm*.8);gl_FragColor=vec4(sky,1.);}'}));this.dome.frustumCulled=false;this.dome.renderOrder=-10;scene.add(this.dome);}
 setQuality(quality){this.quality=quality;this.shadowTime=1;if(!this.customDistance){this.distance=GRAPHICS_QUALITIES[quality].viewDistance;const select=document.getElementById('viewDistance');if(select)select.value=this.distance;}}
 makeStorm(mesh){this.wall=mesh;mesh.material.dispose();mesh.material=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,uniforms:{time:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float time;void main(){float bands=pow(.5+.5*sin(vUv.y*170.+sin(vUv.x*280.+time*2.)*2.-time*3.),7.);float streak=pow(.5+.5*sin(vUv.x*630.+sin(vUv.y*22.+time)*3.),20.);vec3 c=mix(vec3(.36,.16,.69),vec3(.36,.72,1.),bands*.7+streak*.5);gl_FragColor=vec4(c,.25+bands*.25+streak*.2);}'});mesh.geometry.dispose();mesh.geometry=new THREE.CylinderGeometry(1,1,160,160,1,true);mesh.position.y=50;}
 update(match,dt,active){
  const p=match?.spectatedActor||match?.player,storm=active&&match.time>25&&Math.hypot(p.x,p.z)>match.radius,c=this.colors;
  this.outside=THREE.MathUtils.damp(this.outside,storm?1:0,4,dt);this.tint.style.opacity=active?this.outside:0;
  this.scene.background.copy(c.normal).lerp(c.purple,this.outside);this.scene.fog.color.copy(c.fog).lerp(c.stormFog,this.outside);
  this.scene.fog.near=this.distance*(.85-this.outside*.43);this.scene.fog.far=this.distance*(1.5-this.outside*.65);
  const far=Math.max(250,this.distance*1.3);if(this.camera.far!==far){this.camera.far=far;this.camera.updateProjectionMatrix();}
  this.dome.position.copy(this.camera.position);this.dome.scale.setScalar(far*.85);this.dome.material.uniforms.time.value=match?.time||0;this.dome.material.uniforms.storm.value=this.outside;
  this.shadowTime+=dt;
  if(this.sun){
   this.sun.color.copy(c.sun).lerp(c.stormSun,this.outside);this.sun.intensity=2.7-this.outside*1.15;
   const interval=this.quality==='high'?1/30:1/20;
   if(!this.sun.castShadow||this.shadowTime>=interval){const x=Math.round((p?.x||0)*32)/32,z=Math.round((p?.z||0)*32)/32,y=p?.y||0;this.sun.position.set(x-35,y+70,z+35);this.sun.target.position.set(x,y,z);this.sun.target.updateMatrixWorld();if(this.sun.castShadow)this.renderer.shadowMap.needsUpdate=true;this.shadowTime=0;}
  }
  if(this.sky){this.sky.color.copy(c.sky).lerp(c.stormSky,this.outside);this.sky.groundColor.copy(c.ground).lerp(c.stormGround,this.outside);this.sky.intensity=1.25+this.outside*.1;}
  if(this.wall)this.wall.material.uniforms.time.value=match?.time||0;
  const x=p?.x||0,z=p?.z||0;for(const root of this.scene.children){if(!root.userData.distanceCull)continue;const dx=root.position.x-x,dz=root.position.z-z,dy=root.userData.heightCull?root.position.y-(p?.y||0):0,distance=(root.userData.cullDistance||this.distance)+(root.userData.cullRadius||0);root.visible=root.userData.present!==false&&dx*dx+dy*dy+dz*dz<distance*distance;}
 }

}

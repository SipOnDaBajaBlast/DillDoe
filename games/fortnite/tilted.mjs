import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {setHeightfield} from './heightfield.mjs';
import {originalHeight} from './heightfield.mjs';
import {mergeGeometries} from './vendor/utils/BufferGeometryUtils.js';
import {loadTiltedMaterials} from './tilted-materials.mjs?v=14';

export async function loadTilted(status){
  const checked=async path=>{const r=await fetch(path+'?v=14');if(!r.ok)throw new Error(`Original city asset missing: ${path}`);return r.json();};
  status('Loading original Tilted Towers…',88);
  const [layout,height,correctMaterial,...bundles]=await Promise.all([checked('./assets/tilted/layout.json'),checked('./assets/tilted/terrain.json'),loadTiltedMaterials(),...[0,1,2].map(i=>new GLTFLoader().loadAsync(`./assets/tilted/city-${i}.glb?v=14`))]);
  setHeightfield(height);
  return new Tilted(layout,height,bundles,correctMaterial);
}
class Tilted{
  constructor(layout,height,bundles,correctMaterial){
    this.correctMaterial=correctMaterial;
    this.layout=layout;this.height=height;this.templates=new Map();this.materials=new Map();this.root=new THREE.Group();this.cells=new Map();this.objects=[];this.batches=[];this.ray=new THREE.Raycaster();this.floorCache=new Map();this.canonicalMaterials=new Map();this.dirty=false;
    // Associate catalog original paths with nodes in scene order; glTF names are sanitized by Three.
    for(const bundle of bundles){const ns=bundle.parser.json.scenes[0].nodes;ns.forEach((ni,i)=>{const n=bundle.parser.json.nodes[ni].name,o=bundle.scene.children[i];if(n.startsWith('material:')){let m;o.traverse(c=>{if(c.isMesh&&!m)m=c.material;});this.materials.set(n.slice(9),m);}else this.templates.set(n,o);});}
  }
  addTo(scene){scene.add(this.root);}
  populate(match){
    for(const batch of this.batches)batch.mesh.geometry.dispose();this.root.clear();this.cells.clear();this.floorCache.clear();this.objects=[];this.batches=[];match.obstacles=[];match.pickups=[];match.chests=[];
    const grouped=new Map(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3();
    for(const p of this.layout.placements){
      const [x,y,z]=[p.position[0]/100,p.position[2]/100,-p.position[1]/100];
      if(/FloorLoot/.test(p.mesh)){const kind=['ammo','shield','medkit','bandage','shells','heavy'][match.pickups.length%6];match.pickups.push({x,y:y+.3,z,kind,taken:false});continue;}
      if(/TreasureChest/.test(p.mesh)){match.chests.push({x,y,z,opened:false,search:0,health:200});continue;}
      const template=this.templates.get(p.mesh);if(!template)throw new Error(`Missing city mesh ${p.mesh}`);
      q.set(p.quaternion[0],p.quaternion[2],-p.quaternion[1],p.quaternion[3]);pos.set(x,y,z);scale.set(p.scale[0],p.scale[2],p.scale[1]);matrix.compose(pos,q,scale);
      const entity={x,y,z,health:400,maxHealth:400,city:true,parts:[],class:p.class};
      const variant=p.textureData.map(n=>this.materials.get(n)).find(Boolean);
      let slot=0;
      template.updateMatrixWorld(true);
      template.traverse(o=>{if(!o.isMesh||/ambient_Cone/i.test(o.material?.name))return;const mtx=matrix.clone().multiply(o.matrixWorld);let material=variant||this.materials.get(p.materials[slot++])||this.materials.get(p.baseMaterial)||o.material;
        material=this.correctMaterial(material);const materialKey=material.name;if(this.canonicalMaterials.has(materialKey))material=this.canonicalMaterials.get(materialKey);else this.canonicalMaterials.set(materialKey,material);
        const key=materialKey+':'+Math.floor(x/64)+':'+Math.floor(z/64);
        let group=grouped.get(key);if(!group){group={material,items:[],geometries:[],indexCount:0};grouped.set(key,group);}
        o.geometry.computeBoundingBox();const collision=new THREE.Mesh(o.geometry,material);collision.matrixAutoUpdate=false;collision.matrix.copy(mtx);collision.matrixWorld.copy(mtx);collision.userData.entity=entity;
        const renderGeometry=o.geometry.clone().applyMatrix4(mtx),source=renderGeometry.getAttribute('color'),color=new Float32Array(renderGeometry.getAttribute('position').count*4);if(source)for(let i=0;i<source.count;i++){color[i*4]=source.getX(i);color[i*4+1]=source.getY(i);color[i*4+2]=source.getZ(i);color[i*4+3]=source.itemSize===4?source.getW(i):0;}renderGeometry.setAttribute('color',new THREE.BufferAttribute(color,4));
        const indexCount=renderGeometry.index.count,box=new THREE.Box3().setFromObject(collision);collision.userData.box=box;entity.parts.push({collision,group,indexStart:group.indexCount,indexCount});group.geometries.push(renderGeometry);group.indexCount+=indexCount;group.items.push(entity);
        for(let cx=Math.floor(box.min.x/12);cx<=Math.floor(box.max.x/12);cx++)for(let cz=Math.floor(box.min.z/12);cz<=Math.floor(box.max.z/12);cz++){const k=cx+','+cz;if(!this.cells.has(k))this.cells.set(k,[]);this.cells.get(k).push(collision);}
      });this.objects.push(entity);
    }
    for(const group of grouped.values()){const geometry=mergeGeometries(group.geometries,false);if(!geometry)throw new Error('Unable to batch original city geometry');group.geometries.forEach(g=>g.dispose());group.geometries=[];geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,group.material);group.mesh=mesh;mesh.castShadow=mesh.receiveShadow=true;this.root.add(mesh);this.batches.push(group);}
    match.cityFloor=(x,z,y)=>this.floor(x,z,y);
    match.cityBlocked=(a,dx,dz)=>this.blocked(a,dx,dz);
    match.cityTrace=(origin,direction,max)=>this.trace(origin,direction,max);
    match.city=this;match.arenaRadius=210;match.movementRadius=290;
    for(const b of match.actors)b.y=this.floor(b.x,b.z,130);
  }
  candidates(origin,direction,distance){const found=new Set(),visited=new Set(),horizontal=Math.hypot(direction.x,direction.z);const steps=horizontal<1e-7?0:Math.ceil(distance*horizontal/6);for(let i=0;i<=steps;i++){const t=steps?distance*i/steps:0,x=origin.x+direction.x*t,z=origin.z+direction.z*t,cx=Math.floor(x/12),cz=Math.floor(z/12);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const key=(cx+dx)+','+(cz+dz);if(visited.has(key))continue;visited.add(key);for(const o of this.cells.get(key)||[])if(o.userData.entity.health>0&&this.ray.ray.intersectsBox(o.userData.box))found.add(o);}}return [...found];}
  trace(origin,direction,distance){this.ray.set(new THREE.Vector3(origin.x,origin.y,origin.z),new THREE.Vector3(direction.x,direction.y,direction.z));this.ray.near=0;this.ray.far=distance;const hit=this.ray.intersectObjects(this.candidates(origin,direction,distance),false)[0];return hit?{distance:hit.distance,object:hit.object.userData.entity,point:hit.point}:null;}
  floor(x,z,y){const key=Math.round(x*4)+','+Math.round(z*4)+','+Math.floor(y*2),now=performance.now(),cached=this.floorCache.get(key);if(cached&&now-cached.time<180)return cached.y;const origin={x,y:y+.6,z},hit=this.trace(origin,{x:0,y:-1,z:0},Math.max(2,y+60)),floor=hit?Math.max(originalHeight(x,z),hit.point.y):originalHeight(x,z);if(this.floorCache.size>4096)this.floorCache.clear();this.floorCache.set(key,{time:now,y:floor});return floor;}
  blocked(a,dx,dz){const d=Math.hypot(dx,dz);if(!d)return false;for(const h of [.55,a.crouched?1.05:1.5])if(this.trace({x:a.x,y:a.y+h,z:a.z},{x:dx/d,y:0,z:dz/d},d+.3))return true;return false;}
  update(camera,distance){for(const e of this.objects)if(e.health<=0&&!e.hidden){e.hidden=true;this.floorCache.clear();for(const p of e.parts){const index=p.group.mesh.geometry.index,indexArray=index.array,point=indexArray[p.indexStart];indexArray.fill(point,p.indexStart,p.indexStart+p.indexCount);index.needsUpdate=true;}}
    for(const b of this.batches){const s=b.mesh.geometry.boundingSphere;b.mesh.visible=Math.hypot(camera.position.x-s.center.x,camera.position.z-s.center.z)<distance+s.radius;}
  }
}

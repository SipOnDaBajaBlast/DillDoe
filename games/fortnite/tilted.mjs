import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {setHeightfield,originalHeight} from './heightfield.mjs';
import {mergeGeometries} from './vendor/utils/BufferGeometryUtils.js';
import {loadTiltedMaterials} from './tilted-materials.mjs?v=15';
import {loadCityAtlas} from './city-performance.mjs?v=15';
import {cityDetailKind,cityGroundMesh,rayGridCells} from './city-policy.mjs?v=15';
import {readGraphicsQuality} from './graphics.mjs?v=15';

async function catalogs(performanceMode){return Promise.all([0,1,2].map(i=>new GLTFLoader().loadAsync(`./assets/tilted/${performanceMode?'performance-':''}city-${i}.glb?v=15`)));}
export async function loadTilted(status){
  const checked=async path=>{const r=await fetch(path+'?v=15');if(!r.ok)throw new Error(`Original city asset missing: ${path}`);return r.json();};
  status('Loading original Tilted Towers…',88);const quality=readGraphicsQuality(),performanceMode=quality==='performance';
  const [layout,height,correctMaterial,bundles,atlas]=await Promise.all([checked('./assets/tilted/layout.json'),checked('./assets/tilted/terrain.json'),loadTiltedMaterials(),catalogs(performanceMode),performanceMode?loadCityAtlas():null]);
  setHeightfield(height);return new Tilted(layout,height,bundles,correctMaterial,{quality,atlas,fullMaterials:!performanceMode});
}
export class Tilted{
  constructor(layout,height,bundles,correctMaterial,{quality='high',atlas=null,fullMaterials=true}={}){
    this.correctMaterial=correctMaterial;this.quality=quality;this.atlas=atlas;this.fullMaterials=fullMaterials;
    this.layout=layout;this.height=height;this.templates=new Map();this.materials=new Map();this.sourceMaterials=new Map();this.root=new THREE.Group();this.cells=new Map();this.objects=[];this.batches=[];this.ray=new THREE.Raycaster();this.floorCache=new Map();this.canonicalMaterials=new Map();this.dirty=false;
    this.seen=new Set();this.candidateList=[];this.hits=[];this.boxPoint=new THREE.Vector3();this.stats={rays:0,boxTests:0,triangleObjects:0};this.cellSize=6;this.installBundles(bundles);
  }
  installBundles(bundles){
    this.templates.clear();this.materials.clear();this.sourceMaterials.clear();
    for(const bundle of bundles){const ns=bundle.parser.json.scenes[0].nodes;ns.forEach((ni,i)=>{const name=bundle.parser.json.nodes[ni].name,object=bundle.scene.children[i];object.traverse(o=>{if(o.isMesh)for(const material of Array.isArray(o.material)?o.material:[o.material])this.sourceMaterials.set(material.name,material);});if(name.startsWith('material:')){let material;object.traverse(o=>{if(o.isMesh&&!material)material=o.material;});this.materials.set(name.slice(9),material);}else this.templates.set(name,object);});}
  }
  addTo(scene){scene.add(this.root);}
  async setQuality(quality){
    this.requestedQuality=quality;this.quality=quality;
    if(quality==='performance'&&!this.atlas)this.atlas=await loadCityAtlas();
    if(quality!=='performance'&&!this.fullMaterials){
      this.fullLoading??=Promise.all([catalogs(false),loadTiltedMaterials()]).then(([bundles,correct])=>{this.installBundles(bundles);this.correctMaterial=correct;this.fullMaterials=true;this.canonicalMaterials.clear();});
      await this.fullLoading;
    }
    this.quality=this.requestedQuality;if(this.objects.length)this.buildVisuals();
  }
  populate(match){
    this.disposeVisuals();this.cells.clear();this.floorCache.clear();this.objects=[];match.obstacles=[];match.pickups=[];match.chests=[];
    const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3();
    for(const p of this.layout.placements){
      const [x,y,z]=[p.position[0]/100,p.position[2]/100,-p.position[1]/100];
      if(/FloorLoot/.test(p.mesh)){match.pickups.push({x,y:y+.3,z,kind:['ammo','shield','medkit','bandage','shells','heavy'][match.pickups.length%6],taken:false});continue;}
      if(/TreasureChest/.test(p.mesh)){match.chests.push({x,y,z,opened:false,search:0,health:200});continue;}
      const template=this.templates.get(p.mesh);if(!template)throw Error(`Missing city mesh ${p.mesh}`);
      q.set(p.quaternion[0],p.quaternion[2],-p.quaternion[1],p.quaternion[3]);position.set(x,y,z);scale.set(p.scale[0],p.scale[2],p.scale[1]);matrix.compose(position,q,scale);
      const entity={x,y,z,_health:400,maxHealth:400,city:true,parts:[],class:p.class,detail:cityDetailKind(p.mesh),indestructible:cityGroundMesh(p.mesh)};
      Object.defineProperty(entity,'health',{enumerable:true,get(){return this._health;},set:value=>{entity._health=value;this.dirty=true;}});
      const variant=p.textureData.map(n=>this.materials.get(n)).find(Boolean);let slot=0;template.updateMatrixWorld(true);
      template.traverse(o=>{if(!o.isMesh||/ambient_Cone/i.test(o.material?.name))return;
        const mtx=matrix.clone().multiply(o.matrixWorld),material=variant||this.materials.get(p.materials[slot++])||this.materials.get(p.baseMaterial)||o.material;
        o.geometry.computeBoundingBox();const box=o.geometry.boundingBox.clone().applyMatrix4(mtx),collision=new THREE.Mesh(o.geometry,material);
        collision.matrixAutoUpdate=false;collision.matrixWorldAutoUpdate=false;collision.matrix.copy(mtx);collision.matrixWorld.copy(mtx);collision.userData={entity,box};
        entity.parts.push({collision,matrix:mtx,geometry:o.geometry,materialName:material.name,originalMaterial:material});
        for(let cx=Math.floor(box.min.x/this.cellSize);cx<=Math.floor(box.max.x/this.cellSize);cx++)for(let cz=Math.floor(box.min.z/this.cellSize);cz<=Math.floor(box.max.z/this.cellSize);cz++){const key=cx+','+cz;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(collision);}
      });this.objects.push(entity);
    }
    this.buildVisuals();match.cityFloor=(x,z,y)=>this.floor(x,z,y);match.cityBlocked=(a,dx,dz)=>this.blocked(a,dx,dz);match.cityTrace=(origin,direction,max)=>this.trace(origin,direction,max);
    match.city=this;match.arenaRadius=210;match.movementRadius=290;for(const actor of match.actors)actor.y=this.floor(actor.x,actor.z,130);
  }
  disposeVisuals(){for(const batch of this.batches)batch.mesh.geometry.dispose();this.root.clear();this.batches=[];}
  buildVisuals(){
    this.disposeVisuals();const groups=new Map(),performanceMode=this.quality==='performance'&&this.atlas;
    for(const entity of this.objects)for(const part of entity.parts){
      const original=this.correctMaterial(this.sourceMaterials.get(part.materialName)||part.originalMaterial),atlasMaterial=performanceMode?this.atlas.material(original):original;
      let material=atlasMaterial;const materialKey=material.name;
      if(this.canonicalMaterials.has(materialKey))material=this.canonicalMaterials.get(materialKey);else this.canonicalMaterials.set(materialKey,material);
      const detail=performanceMode?entity.detail:'structure',cell=detail==='structure'?32:16,key=materialKey+':'+detail+':'+Math.floor(entity.x/cell)+':'+Math.floor(entity.z/cell)+':'+(detail==='interior'?Math.floor(entity.y/8):0);
      let group=groups.get(key);if(!group){group={material,detail,geometries:[],indexCount:0};groups.set(key,group);}
      const geometry=part.geometry.clone().applyMatrix4(part.matrix),source=geometry.getAttribute('color'),count=geometry.getAttribute('position').count,colors=new Float32Array(count*4);
      if(source)for(let i=0;i<count;i++){colors[i*4]=source.getX(i);colors[i*4+1]=source.getY(i);colors[i*4+2]=source.getZ(i);colors[i*4+3]=source.itemSize===4?source.getW(i):0;}
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));if(performanceMode)this.atlas.geometry(geometry,original);
      for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv','color','cityAtlasRect'].includes(name))geometry.deleteAttribute(name);
      if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(count*2),2));
      part.group=group;part.indexStart=group.indexCount;part.indexCount=geometry.index.count;group.indexCount+=part.indexCount;group.geometries.push(geometry);
    }
    for(const group of groups.values()){
      const geometry=mergeGeometries(group.geometries,false);if(!geometry)throw Error('Unable to batch original city geometry');group.geometries.forEach(g=>g.dispose());group.geometries=[];geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,group.material);group.mesh=mesh;mesh.castShadow=mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.updateMatrixWorld(true);mesh.matrixWorldAutoUpdate=false;this.root.add(mesh);this.batches.push(group);
    }
    for(const entity of this.objects)entity.hidden=false;this.dirty=true;this.root.updateMatrixWorld(true);this.root.matrixAutoUpdate=false;
    // High can be selected without restarting a match. Returning to Performance
    // releases its original GPU maps; Three uploads them again if High returns.
    if(performanceMode)for(const source of this.sourceMaterials.values())for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','alphaMap'])source[key]?.dispose();
  }
  candidates(origin,direction,distance){
    this.seen.clear();this.candidateList.length=0;const far2=distance*distance;
    for(const [x,z]of rayGridCells(origin,direction,distance,this.cellSize))for(const object of this.cells.get(x+','+z)||[]){
      if(this.seen.has(object)||object.userData.entity.health<=0)continue;this.seen.add(object);this.stats.boxTests++;const box=object.userData.box;
      if(!box.containsPoint(this.ray.ray.origin)){const point=this.ray.ray.intersectBox(box,this.boxPoint);if(!point||point.distanceToSquared(this.ray.ray.origin)>far2)continue;}
      this.candidateList.push(object);
    }
    return this.candidateList;
  }
  trace(origin,direction,distance){
    this.stats.rays++;this.ray.ray.origin.set(origin.x,origin.y,origin.z);this.ray.ray.direction.set(direction.x,direction.y,direction.z);this.ray.near=0;this.ray.far=distance;
    const candidates=this.candidates(origin,direction,distance);this.stats.triangleObjects+=candidates.length;this.hits.length=0;const hit=this.ray.intersectObjects(candidates,false,this.hits)[0];return hit?{distance:hit.distance,object:hit.object.userData.entity,point:hit.point}:null;
  }
  floor(x,z,y){const key=Math.round(x*4)+','+Math.round(z*4)+','+Math.floor(y*2),now=performance.now(),cached=this.floorCache.get(key);if(cached&&now-cached.time<180)return cached.y;const hit=this.trace({x,y:y+.6,z},{x:0,y:-1,z:0},Math.max(2,y+60)),height=originalHeight(x,z),floor=hit?Math.max(height,hit.point.y):height;if(this.floorCache.size>4096)this.floorCache.clear();this.floorCache.set(key,{time:now,y:floor});return floor;}
  blocked(actor,dx,dz){const distance=Math.hypot(dx,dz);if(!distance)return false;const direction={x:dx/distance,y:0,z:dz/distance};for(const h of [.55,actor.crouched?1.05:1.5])if(this.trace({x:actor.x,y:actor.y+h,z:actor.z},direction,distance+.3))return true;return false;}
  update(camera,distance){
    if(this.dirty){this.dirty=false;for(const entity of this.objects)if(entity.health<=0&&!entity.hidden){entity.hidden=true;this.floorCache.clear();for(const part of entity.parts){const index=part.group.mesh.geometry.index,array=index.array;array.fill(array[part.indexStart],part.indexStart,part.indexStart+part.indexCount);index.needsUpdate=true;}}}
    for(const batch of this.batches){const sphere=batch.mesh.geometry.boundingSphere,limit=this.quality==='performance'?batch.detail==='interior'?28:batch.detail==='foliage'?55:distance:distance,dx=camera.position.x-sphere.center.x,dz=camera.position.z-sphere.center.z;batch.mesh.visible=dx*dx+dz*dz<(limit+sphere.radius)**2;}
  }
}

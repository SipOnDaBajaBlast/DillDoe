import * as THREE from 'three';
import {citySurfaceMode} from './tilted-materials.mjs?v=16';

export async function loadCityAtlas(){
  const r=await fetch('./assets/tilted/performance-atlas.json?v=16');if(!r.ok)throw Error('Missing Performance texture catalog');
  const catalog=await r.json(),loader=new THREE.TextureLoader(),pages=await Promise.all(catalog.pages.map(async page=>{
    const [color,alpha]=await Promise.all([loader.loadAsync('./assets/tilted/'+page.color),loader.loadAsync('./assets/tilted/'+page.alpha)]);
    color.colorSpace=THREE.SRGBColorSpace;for(const map of [color,alpha]){map.flipY=false;map.anisotropy=1;}
    return {color,alpha};
  }));
  return new CityAtlas(catalog,pages);
}
export class CityAtlas{
  constructor(catalog,pages){this.catalog=catalog;this.pages=pages;this.materials=new Map();}
  entry(original){return citySurfaceMode(original.name)?null:this.catalog.materials[original.name];}
  material(original){
    const entry=this.entry(original);if(!entry)return original;
    const key=entry.page+':'+entry.masked;if(this.materials.has(key))return this.materials.get(key);
    const page=this.pages[entry.page],material=new THREE.MeshLambertMaterial({map:page.color,alphaMap:entry.masked?page.alpha:null,alphaTest:entry.masked?.45:0,side:THREE.DoubleSide,vertexColors:true});
    material.name='PerformanceAtlas:'+key;
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute vec4 cityAtlasRect;varying vec4 vCityAtlasRect;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCityAtlasRect=cityAtlasRect;');
      shader.fragmentShader='varying vec4 vCityAtlasRect;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
        vec2 atlasUv=vCityAtlasRect.xy+fract(vMapUv)*vCityAtlasRect.zw;
        diffuseColor*=textureGrad(map,atlasUv,dFdx(vMapUv)*vCityAtlasRect.zw,dFdy(vMapUv)*vCityAtlasRect.zw);
      #endif`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`#ifdef USE_ALPHAMAP
        vec2 alphaUv=vCityAtlasRect.xy+fract(vAlphaMapUv)*vCityAtlasRect.zw;
        diffuseColor.a*=textureGrad(alphaMap,alphaUv,dFdx(vAlphaMapUv)*vCityAtlasRect.zw,dFdy(vAlphaMapUv)*vCityAtlasRect.zw).g;
      #endif`);
    };
    material.customProgramCacheKey=()=>`performance-city-atlas-1:${entry.masked}`;
    this.materials.set(key,material);return material;
  }
  geometry(geometry,original){
    const entry=this.entry(original);if(!entry)return;
    const count=geometry.getAttribute('position').count,rects=new Float32Array(count*4),colors=new Float32Array(count*4);
    const color=entry.color||[1,1,1,1];for(let i=0;i<count;i++){rects.set(entry.rect,i*4);colors.set(color,i*4);}
    geometry.setAttribute('cityAtlasRect',new THREE.BufferAttribute(rects,4));geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));
    if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(count*2),2));
  }
}

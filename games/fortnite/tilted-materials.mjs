import * as THREE from 'three';

// The UE terrain shader uses vertex RGBA as layer weights, not a color tint.
// Its exported "Diffuse" is the optional leaf overlay, not the street surface.
export function citySurfaceMode(name=''){
  if(name==='Original_Landscape')return 'landscape';
  if(/Concerte_Inst|Asphalt_Road_Crossing/.test(name))return /Crossing/.test(name)?'crosswalk':'asphalt';
  if(/M_Terrain_SidewalkAndStreets/.test(name))return 'sidewalk-road';
  if(/M_Sidewalk_GrassTerrain/.test(name))return 'sidewalk-grass';
  if(/Biome_Cliff|M_Terrain_Cliff|M_Terrain_Cave/.test(name))return 'cliff';
  if(/Biome_NoAsphalt/.test(name))return 'farm-grass';
  if(/Athena_Terrain_Mat_Biome|^Terrain_Mat$/.test(name))return 'grass';
  return null;
}

export async function loadTiltedMaterials(){
  const names=['asphalt','sidewalk','grass','farm-grass','cliff','crosswalk'],loader=new THREE.TextureLoader();
  const maps=Object.fromEntries(await Promise.all(names.map(async name=>{
    const map=await loader.loadAsync(`./assets/tilted/surface-${name}.jpg`);
    map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.flipY=false;map.anisotropy=2;return [name,map];
  })));
  const cache=new Map();
  return original=>{
    const name=original.name||original.uuid;
    if(cache.has(name))return cache.get(name);
    const mode=citySurfaceMode(name),material=original.clone();
    material.vertexColors=false;cache.set(name,material);
    if(!mode)return material;
    material.color.set(0xffffff);material.transparent=false;material.opacity=1;material.alphaTest=0;
    material.roughness=.95;material.metalness=0;material.normalMap=null;
    material.map=maps[mode==='sidewalk-road'||mode==='sidewalk-grass'?'sidewalk':mode==='crosswalk'?'asphalt':mode==='landscape'?'grass':mode];
    // Keeping vertexColors enabled declares the RGBA attribute. The ordinary
    // color multiplication below is replaced by the original layer purpose.
    material.vertexColors=true;
    material.onBeforeCompile=shader=>{
      shader.uniforms.cityGrass={value:maps[mode==='farm-grass'?'farm-grass':'grass']};
      shader.uniforms.cityAsphalt={value:maps.asphalt};shader.uniforms.citySidewalk={value:maps.sidewalk};
      shader.uniforms.cityCliff={value:maps.cliff};shader.uniforms.cityCrosswalk={value:maps.crosswalk};
      shader.vertexShader=`varying vec3 vCityWorld;\nvarying vec3 vCityNormal;\nvarying vec4 vCityLayers;\nvarying vec2 vCityUv;\n${shader.vertexShader}`;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec4 cityPosition=vec4(transformed,1.0);
        vec3 cityNormal=objectNormal;
        #ifdef USE_INSTANCING
          cityPosition=instanceMatrix*cityPosition;
          cityNormal=mat3(instanceMatrix)*cityNormal;
        #endif
        vCityWorld=(modelMatrix*cityPosition).xyz;
        vCityNormal=normalize(mat3(modelMatrix)*cityNormal);
        vCityUv=uv;
        #ifdef USE_COLOR_ALPHA
          vCityLayers=color;
        #elif defined(USE_COLOR)
          vCityLayers=vec4(color,0.0);
        #else
          vCityLayers=vec4(0.0);
        #endif`);
      shader.fragmentShader=`varying vec3 vCityWorld;\nvarying vec3 vCityNormal;\nvarying vec4 vCityLayers;\nvarying vec2 vCityUv;
        uniform sampler2D cityGrass;uniform sampler2D cityAsphalt;uniform sampler2D citySidewalk;
        uniform sampler2D cityCliff;uniform sampler2D cityCrosswalk;
        ${shader.fragmentShader}`;
      const baseUV='vec2(vCityWorld.x,-vCityWorld.z)/5.12';
      let surface;
      if(mode==='asphalt'||mode==='crosswalk')surface=`vec3 citySurface=texture2D(cityAsphalt,${baseUV}).rgb;`;
      else if(mode==='sidewalk-road')surface=`vec3 citySurface=mix(texture2D(citySidewalk,${baseUV}).rgb,texture2D(cityAsphalt,${baseUV}).rgb,clamp(vCityLayers.r,0.0,1.0));`;
      else if(mode==='sidewalk-grass')surface=`vec3 citySurface=mix(texture2D(cityGrass,${baseUV}).rgb,texture2D(citySidewalk,${baseUV}).rgb,clamp(vCityLayers.r,0.0,1.0));`;
      else surface=`vec3 citySurface=texture2D(cityGrass,${baseUV}).rgb;
        ${mode==='grass'?'citySurface=mix(citySurface,texture2D(cityAsphalt,vec2(vCityWorld.x,-vCityWorld.z)/5.12).rgb,clamp(vCityLayers.r,0.0,1.0));':''}
        vec3 cityN=abs(normalize(vCityNormal));
        vec3 cityWeights=pow(cityN,vec3(5.0));cityWeights/=max(dot(cityWeights,vec3(1.0)),.0001);
        vec3 cityRock=texture2D(cityCliff,vCityWorld.zy/9.0).rgb*cityWeights.x
          +texture2D(cityCliff,vCityWorld.xz/9.0).rgb*cityWeights.y
          +texture2D(cityCliff,vCityWorld.xy/9.0).rgb*cityWeights.z;
        float cityRockBlend=max(clamp(vCityLayers.a,0.0,1.0),smoothstep(.25,.65,1.0-cityN.y));
        citySurface=mix(citySurface,cityRock,cityRockBlend);`;
      if(mode==='crosswalk')surface+=`\nfloat cityPaint=texture2D(cityCrosswalk,vCityUv).r;citySurface=mix(citySurface,vec3(.54),cityPaint*.85);`;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',surface+'\ndiffuseColor.rgb*=citySurface;').replace('#include <color_fragment>','');
    };
    material.customProgramCacheKey=()=>`tilted-original-layers-2:${mode}`;
    material.needsUpdate=true;return material;
  };
}

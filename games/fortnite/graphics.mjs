export const GRAPHICS_QUALITIES=Object.freeze({
  performance:Object.freeze({label:'Performance (Chromebook)',maxPixels:1280*720,maxPixelRatio:1,shadows:false,shadowSize:512,viewDistance:110,terrainSegments:200,nearAnimation:30,farAnimation:65,hudInterval:1/24}),
  balanced:Object.freeze({label:'Balanced',maxPixels:1920*1080,maxPixelRatio:1.25,shadows:true,shadowSize:1024,viewDistance:140,terrainSegments:280,nearAnimation:45,farAnimation:90,hudInterval:1/30}),
  high:Object.freeze({label:'High',maxPixels:2560*1440,maxPixelRatio:1.5,shadows:true,shadowSize:2048,viewDistance:180,terrainSegments:400,nearAnimation:70,farAnimation:140,hudInterval:1/30})
});
export function readGraphicsQuality(storage){
  try{const quality=(storage??globalThis.localStorage)?.getItem('fortniteGraphicsQuality');if(Object.hasOwn(GRAPHICS_QUALITIES,quality))return quality;}catch{}
  return 'performance';
}
export function renderPixelRatio(width,height,deviceRatio,quality='performance'){
  const profile=GRAPHICS_QUALITIES[quality]||GRAPHICS_QUALITIES.performance;
  return Math.min(Math.max(.25,deviceRatio||1),profile.maxPixelRatio,Math.sqrt(profile.maxPixels/Math.max(1,width*height)));
}
export function botAnimationInterval(distance,quality='performance'){
  const profile=GRAPHICS_QUALITIES[quality]||GRAPHICS_QUALITIES.performance;
  return distance<profile.nearAnimation?0:distance<profile.farAnimation?1/15:1/6;
}

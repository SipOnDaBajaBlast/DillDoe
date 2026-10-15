// Original3.5 FortWorldSettings and the placed Tilted foundation transform.
export const ORIGINAL_MAP=Object.freeze({size:2048,worldScale:290,worldXOffset:42000,cityX:33280,cityY:-59904,extent:320,label:[.3700000047683716,.492000013589859]});
export function originalMapPixel(x,z){const m=ORIGINAL_MAP;return {x:m.size/2+(m.cityY+x*100)/m.worldScale,y:m.size/2+(m.cityX+z*100-m.worldXOffset)/m.worldScale};}
export function originalMapCrop(extent=ORIGINAL_MAP.extent){const center=originalMapPixel(0,0),width=extent*200/ORIGINAL_MAP.worldScale;return {x:center.x-width/2,y:center.y-width/2,width,height:width};}
export function originalMapLabel(size=512,extent=ORIGINAL_MAP.extent){const crop=originalMapCrop(extent);return{x:(ORIGINAL_MAP.label[0]*ORIGINAL_MAP.size-crop.x)/crop.width*size,y:(ORIGINAL_MAP.label[1]*ORIGINAL_MAP.size-crop.y)/crop.height*size};}

import {ORIGINAL_MAP,originalMapCrop,originalMapLabel} from './map-coordinates.mjs?v=17';

export async function loadOriginalWorldMap(){
 const image=new Image();image.src='./assets/hud/MiniMapAthena-3.5.png?v=17';await image.decode();
 await document.fonts.load('bold 23px Noto');
 const size=512,canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),crop=originalMapCrop();
 // Keep the shipped texture untouched. Crop only when drawing the local HUD.
 ctx.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,size,size);
 const label=originalMapLabel(size);ctx.font='bold 23px Noto, sans-serif';ctx.textAlign='center';ctx.shadowColor='#152018';ctx.shadowBlur=3;ctx.shadowOffsetY=2;ctx.fillStyle='#fff';ctx.fillText('TILTED TOWERS',label.x,label.y);
 return {canvas,extent:ORIGINAL_MAP.extent,source:'Fortnite3.5 MiniMapAthena',crop};
}

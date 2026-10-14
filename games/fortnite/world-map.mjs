import * as THREE from 'three';

// Capture the same placed geometry used for play. This keeps the map and
// world coordinates aligned without borrowing a different island's image.
export function captureWorldMap(renderer,ground,city){
  const extent=320,size=512,scene=new THREE.Scene();scene.background=new THREE.Color('#6f8749');
  scene.add(ground.clone(),city.clone(true));
  scene.add(new THREE.HemisphereLight('#dae6f2','#777251',1.6));
  const sun=new THREE.DirectionalLight('#fff0d5',2.3);sun.position.set(-180,350,100);scene.add(sun);
  const camera=new THREE.OrthographicCamera(-extent,extent,extent,-extent,.1,1000);camera.position.set(0,450,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  const target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:true});target.texture.colorSpace=THREE.SRGBColorSpace;
  const prior=renderer.getRenderTarget(),shadow=renderer.shadowMap.enabled,pixels=new Uint8Array(size*size*4);
  try{renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);}finally{renderer.setRenderTarget(prior);renderer.shadowMap.enabled=shadow;target.dispose();}
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),data=ctx.createImageData(size,size);
  for(let row=0;row<size;row++)data.data.set(pixels.subarray(row*size*4,(row+1)*size*4),(size-1-row)*size*4);
  ctx.putImageData(data,0,0);ctx.font='bold 23px Burbank, sans-serif';ctx.textAlign='center';ctx.shadowColor='#18220d';ctx.shadowBlur=4;ctx.fillStyle='#fff';ctx.fillText('TILTED TOWERS',size/2,size/2-40);return {canvas,extent};
}

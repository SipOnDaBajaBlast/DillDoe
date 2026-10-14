let field;
export function setHeightfield(value){
  if(!value||!Number.isInteger(value.size)||value.size<2||value.heights?.length!==value.size**2||!Number.isFinite(value.step)||!(value.step>0)||!Number.isFinite(value.offset)||!value.heights.every(Number.isFinite))throw new Error('Invalid original terrain heightfield');
  field=value;
}
export function originalHeight(x,z){
  if(!field)return null;
  const {size,step,offset,heights}=field;
  const gx=Math.max(0,Math.min(size-1,(x-offset)/step)),gz=Math.max(0,Math.min(size-1,(z-offset)/step));
  const ix=Math.min(size-2,Math.floor(gx)),iz=Math.min(size-2,Math.floor(gz)),fx=gx-ix,fz=gz-iz,i=iz*size+ix;
  return (heights[i]*(1-fx)+heights[i+1]*fx)*(1-fz)+(heights[i+size]*(1-fx)+heights[i+size+1]*fx)*fz;
}

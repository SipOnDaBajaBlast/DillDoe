export function cityDetailKind(mesh=''){
  if(/(?:Leaves|Foliage|Flowers|Flower_|Bush|Shrub)/i.test(mesh))return 'foliage';
  if(/\/Props\/(?:Kitchen|Office|Residential|Bathroom|Books|Food|Laundry|Restaurant|Dishes|Toys|Electronics|Storage|Decorations)\//i.test(mesh))return 'interior';
  return 'structure';
}
export function cityGroundMesh(mesh=''){
  return /DS_Fortnite_Terrain|\/World\/(?:Sidewalks|Roads)\/|\/S_Road_|\/S_Elevation_Ground_/i.test(mesh);
}
// Ray traversal needs only cells actually crossed. Every collider is inserted
// into all cells touched by its bounds, including broad road/landscape meshes.
export function rayGridCells(origin,direction,distance,cellSize=6){
  let x=Math.floor(origin.x/cellSize),z=Math.floor(origin.z/cellSize),t=0;
  const sx=Math.sign(direction.x),sz=Math.sign(direction.z),dx=sx?cellSize/Math.abs(direction.x):Infinity,dz=sz?cellSize/Math.abs(direction.z):Infinity;
  let tx=sx?((x+(sx>0?1:0))*cellSize-origin.x)/direction.x:Infinity,tz=sz?((z+(sz>0?1:0))*cellSize-origin.z)/direction.z:Infinity;
  const cells=[];
  while(t<=distance){cells.push([x,z]);if(!sx&&!sz)break;const next=Math.min(tx,tz);if(!Number.isFinite(next))break;if(tx<=tz){x+=sx;tx+=dx;}if(tz<=next){z+=sz;tz+=dz;}t=next;}
  return cells;
}

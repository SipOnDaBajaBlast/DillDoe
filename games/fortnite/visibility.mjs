import * as THREE from 'three';

// A small margin wakes objects before they enter the picture during a turn.
// Rendering visibility never changes collision, loot state or simulation.
export class ViewCuller{
 constructor(){this.projection=new THREE.Matrix4();this.matrix=new THREE.Matrix4();this.frustum=new THREE.Frustum();}
 update(camera,margin=1.14){camera.updateMatrixWorld();this.projection.copy(camera.projectionMatrix);this.projection.elements[0]/=margin;this.projection.elements[5]/=margin;this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(this.projection,camera.matrixWorldInverse));return this;}
 visible(sphere){return this.frustum.intersectsSphere(sphere);}
}

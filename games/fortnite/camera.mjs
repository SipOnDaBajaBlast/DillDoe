// Values read from Athena_PlayerCameraModeBase and RangedTargeting in the local 1.8 files.
export const OG_CAMERA={horizontalFov:80,distance:2.8,aimDistance:1.6,shoulder:.31,height:1.6,crouchHeight:1.2};
export function verticalFov(horizontal,aspect){return 2*Math.atan(Math.tan(horizontal*Math.PI/360)/Math.max(.1,aspect))*180/Math.PI;}

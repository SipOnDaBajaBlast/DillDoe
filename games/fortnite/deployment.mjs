export class Deployment{
 constructor(player){this.stage='bus';this.time=0;this.bus={x:0,y:100,z:130};Object.assign(player,this.bus,{vy:0,crouched:false});}
 jump(events){if(this.stage==='bus'){this.stage='dive';events.push({type:'busJump'});}else if(this.stage==='dive'){this.stage='glide';events.push({type:'gliderOpen'});}}
 step(dt,p,input,ground,events){this.time+=dt;this.bus.z=130-this.time*12;if(this.stage==='bus'){Object.assign(p,this.bus);if(input.jump||this.time>=20)this.jump(events);return false;}const length=Math.max(1,Math.hypot(input.x||0,input.z||0)),speed=this.stage==='dive'?13:9;p.x=Math.max(-135,Math.min(135,p.x+(input.x||0)/length*speed*dt));p.z=Math.max(-135,Math.min(135,p.z+(input.z||0)/length*speed*dt));p.yaw=input.yaw??p.yaw;const floor=ground(p.x,p.z);if(this.stage==='dive'&&p.y-floor<24)this.jump(events);p.vy=this.stage==='glide'?-5:-22;p.y+=p.vy*dt;if(p.y<=floor){p.y=floor;p.vy=0;events.push({type:'gliderClose'},{type:'land'});return true;}return false;}
}

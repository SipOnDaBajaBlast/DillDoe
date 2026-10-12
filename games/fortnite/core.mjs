// Browser match simulation. No network services or executable game binaries.
export const WEAPONS = [
  { name: 'ASSAULT RIFLE', clip: 30, reserve: 180, damage: 26, interval: .15, reload: 2.1, spread: .012, pellets: 1 },
  { name: 'PUMP SHOTGUN', clip: 5, reserve: 35, damage: 15, interval: .85, reload: 2.8, spread: .09, pellets: 7 },
  { name: 'BOLT-ACTION', clip: 1, reserve: 24, damage: 100, interval: 1.2, reload: 2.4, spread: .001, pellets: 1 },
];
export function randomGenerator(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const terrain = (x,z) => Math.sin(x*.032)*1.4+Math.cos(z*.041)*1.2 + 17*Math.exp(-((x+43)**2/700+(z+15)**2/1900)) + 12*Math.exp(-((x-65)**2/1500+(z+52)**2/1400))+18*Math.exp(-((x-5)**2/9000+(z+125)**2/1600))+5*Math.sin(x*.012)*Math.cos(z*.014);
export const length = a => Math.hypot(a.x,a.y||0,a.z);
export const normalize = a => { const l=length(a)||1; return {x:a.x/l,y:(a.y||0)/l,z:a.z/l}; };
export function raySphere(o,d,c,r) { const x=o.x-c.x,y=o.y-c.y,z=o.z-c.z,b=x*d.x+y*d.y+z*d.z,q=x*x+y*y+z*z-r*r,disc=b*b-q; if(disc<0)return Infinity; const near=-b-Math.sqrt(disc),far=-b+Math.sqrt(disc);return near>=0?near:far>=0?far:Infinity; }
export function rayBox(o,d,b) { let near=0,far=Infinity;for(const k of ['x','y','z']) {const low=b[k]-b['h'+k],high=b[k]+b['h'+k];if(Math.abs(d[k])<1e-8){if(o[k]<low||o[k]>high)return Infinity;continue;}let a=(low-o[k])/d[k],c=(high-o[k])/d[k];if(a>c)[a,c]=[c,a];near=Math.max(near,a);far=Math.min(far,c);if(near>far)return Infinity;}return near; }
export class Match {
  constructor(seed=42, count=12) {
    this.seed=seed;this.random=randomGenerator(seed);this.time=0;this.phase='playing';this.events=[];this.shots=[];this.eliminations=0;this.wood=100;this.stone=0;this.bandages=0;this.medkits=0;this.shields=0;this.useItem=null;this.chests=[];this.selected=0;this.cooldown=0;this.reloadTime=0;
    this.inventory=['rifle','shotgun','sniper',null,null];this.ammo=WEAPONS.map(w=>({mag:w.clip,reserve:w.reserve}));this.player={id:0,x:0,z:10,y:terrain(0,10),vy:0,health:100,shield:50,alive:true,yaw:Math.PI};this.bots=[];this.obstacles=[];this.pickups=[];this.walls=[];
    for(let i=0;i<125;i++){const angle=this.random()*Math.PI*2,r=16+this.random()*112,x=Math.cos(angle)*r,z=Math.sin(angle)*r;if(Math.abs(x)<9&&z<15&&z>-65)continue;this.obstacles.push({id:i,x,z,y:terrain(x,z),radius:i%5?1:1.5,height:i%5?8+this.random()*5:1.5+this.random()*1.3,kind:i%5?'tree':'rock',health:i%5?250:200});}
    for(let i=0;i<count;i++){const a=i/count*Math.PI*2,r=35+this.random()*58,x=Math.cos(a)*r,z=Math.sin(a)*r;this.bots.push({id:i+1,x,z,y:terrain(x,z),yaw:a,health:100,shield:25,alive:true,cooldown:2+this.random()*3,think:0,target:null});}
    for(const [x,z] of [[2,4],[-5,-27],[6,-38],[-38,-14],[65,-40],[30,38]])this.chests.push({x,z,y:terrain(x,z),opened:false,search:0,health:200});
    for(let i=0;i<26;i++){const a=this.random()*Math.PI*2,r=10+this.random()*90,x=Math.cos(a)*r,z=Math.sin(a)*r;this.pickups.push({x,z,y:terrain(x,z)+.6,kind:['ammo','shield','medkit','wood','bandage','shells','heavy'][i%7],taken:false});}
  }
  get radius(){return 125-Math.min(1,Math.max(0,(this.time-25)/215))*117;}
  get alive(){return this.bots.filter(b=>b.alive).length+(this.player.alive?1:0);}
  get actors(){return [this.player,...this.bots];}
  itemCount(kind){return kind==='medkit'?this.medkits:kind==='bandage'?this.bandages:kind==='shield'?this.shields:0;}
  select(slot){
    if(slot< -1||slot>=5||slot>=3&&!this.itemCount(this.inventory[slot]))return false;
    if(slot!==this.selected){this.selected=slot;this.reloadTime=0;this.useItem=null;this.events.push({type:'equip',slot});}return true;
  }
  cycle(direction){const slots=[-1,0,1,2,3,4].filter(slot=>slot<3||this.itemCount(this.inventory[slot]));const i=slots.indexOf(this.selected);this.select(slots[(i+direction+slots.length)%slots.length]);}
  useSelected(){return this.selected>=3?this.heal(this.inventory[this.selected]):false;}
  heal(kind=this.medkits>0?'medkit':'bandage'){
    const p=this.player;if(this.useItem||this.phase!=='playing')return false;
    const count={bandage:this.bandages,medkit:this.medkits,shield:this.shields}[kind];
    if(!count||kind==='shield'&&p.shield>=100||kind==='bandage'&&p.health>=75||kind==='medkit'&&p.health>=100)return false;
    this.useItem={kind,remaining:kind==='medkit'?10:kind==='shield'?5:3.5,total:kind==='medkit'?10:kind==='shield'?5:3.5};return true;
  }
  targetInteraction(yaw,pitch=0){
    const p=this.player,dir={x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};let best=null,score=Infinity;
    for(const [type,items]of [['chest',this.chests],['pickup',this.pickups]])for(let i=0;i<items.length;i++){
      const a=items[i];if(a.opened||a.taken||a.health===0)continue;const dx=a.x-p.x,dy=a.y+(type==='chest'?.55:0)-p.y-1.35,dz=a.z-p.z,d=Math.hypot(dx,dy,dz);if(d>4.5)continue;
      const dot=(dx*dir.x+dy*dir.y+dz*dir.z)/Math.max(d,.01);if(dot<.72)continue;const value=(1-dot)*5+d*.1;if(value<score){score=value;best={type,index:i,item:a};}
    }return best;
  }
  collect(index){const item=this.pickups[index];if(!item||item.taken||this.phase!=='playing'||Math.hypot(item.x-this.player.x,item.z-this.player.z)>4.5)return false;
    const k=item.kind;
    if(['shield','medkit','bandage'].includes(k)&&!this.inventory.includes(k)){
      const free=this.inventory.indexOf(null);if(free<0){this.events.push({type:'inventoryFull'});return false;}this.inventory[free]=k;
    }
    item.taken=true;if(['ammo','shells','heavy'].includes(k))this.ammo[{ammo:0,shells:1,heavy:2}[k]].reserve+=k==='ammo'?30:k==='shells'?8:6;
    if(k==='shield')this.shields++;if(k==='medkit')this.medkits++;if(k==='bandage')this.bandages+=5;if(k==='wood')this.wood+=30;
    this.events.push({type:'pickup',kind:k});return true;
  }
  interact(target,dt){if(!target||this.phase!=='playing')return;const a=target.item;if(target.type==='pickup'){this.collect(target.index);return;}
    if(a.opened||a.health===0)return;a.search+=dt;if(a.search<1)return;a.opened=true;for(const [i,kind]of ['ammo','shield','wood','bandage'].entries()){const angle=i*Math.PI/2;const x=a.x+Math.cos(angle)*1.35,z=a.z+Math.sin(angle)*1.35;this.pickups.push({x,z,y:terrain(x,z)+.45,kind,taken:false});}this.events.push({type:'chest'});
  }
  floorAt(x,z,currentY){let floor=terrain(x,z);for(const w of this.walls){if(w.health<=0||w.type==='wall'||!w.type)continue;
    const dx=x-w.x,dz=z-w.z;if(Math.abs(dx)>1.6||Math.abs(dz)>1.6)continue;let y=w.y+w.hy;
    if(w.type==='stair'){const forward=dx*Math.sin(w.yaw||0)+dz*Math.cos(w.yaw||0);y=w.y-w.hy+(forward+1.6);}
    if(w.type==='roof')y=w.y-w.hy+(1-Math.max(Math.abs(dx),Math.abs(dz))/1.6)*3.2;
    if(y<=currentY+.65)floor=Math.max(floor,y);
    }return floor;
  }
  reload(){if(this.selected<0||this.selected>=3)return;const w=WEAPONS[this.selected],a=this.ammo[this.selected];if(!this.reloadTime&&a.mag<w.clip&&a.reserve>0){this.reloadTime=w.reload;this.events.push({type:'reload',weapon:this.selected});}}
  move(actor,dx,dz){const x=actor.x+dx,z=actor.z+dz;if(Math.hypot(x,z)>143)return;for(const o of this.obstacles)if(o.health!==0&&Math.hypot(x-o.x,z-o.z)<o.radius+.4)return;for(const w of this.walls)if(w.health>0&&(!w.type||w.type==='wall')&&actor.y<w.y+w.hy&&actor.y+1.8>w.y-w.hy&&Math.abs(x-w.x)<w.hx+.4&&Math.abs(z-w.z)<w.hz+.4)return;actor.x=x;actor.z=z;}
  damage(actor,amount,source,ignoreShield=false){if(!actor.alive||this.phase!=='playing')return;const healthBefore=actor.health;let left=amount,absorbed=0;if(!ignoreShield){const s=Math.min(actor.shield,left);actor.shield-=s;left-=s;absorbed=s;}actor.health=Math.max(0,actor.health-left);if(source===0&&actor!==this.player){for(const [amount,shield]of [[absorbed,true],[healthBefore-actor.health,false]])if(amount>0)this.events.push({type:'damageDealt',id:actor.id,amount,shield,position:{x:actor.x,y:actor.y+2.05+(shield?.3:0),z:actor.z}});}if(actor===this.player){this.events.push({type:'hurt',shield:absorbed>0,shieldBreak:absorbed>0&&actor.shield===0});this.useItem=null;}if(actor.health<=0){actor.alive=false;this.events.push({type:'elimination',id:actor.id,source});if(source===0)this.eliminations++;if(actor!==this.player)this.pickups.push({x:actor.x,z:actor.z,y:actor.y+.6,kind:'ammo',taken:false});}}
  trace(origin,dir,shooter){let hit=null,near=240;for(const a of this.actors){if(!a.alive||a.id===shooter)continue;const t=raySphere(origin,dir,{x:a.x,y:a.y+1.05,z:a.z},.7);if(t<near){near=t;hit={actor:a};}}for(const o of this.obstacles){if(o.health===0)continue;const t=o.kind==='tree'?rayBox(origin,dir,{x:o.x,y:o.y+o.height/2,z:o.z,hx:o.radius*.6,hy:o.height/2,hz:o.radius*.6}):raySphere(origin,dir,{x:o.x,y:o.y+o.height*.4,z:o.z},o.radius);if(t<near){near=t;hit={obstacle:o};}}for(const w of this.walls){if(w.health<=0)continue;const t=rayBox(origin,dir,w);if(t<near){near=t;hit={wall:w};}}for(const c of this.chests){if(c.health===0)continue;const t=rayBox(origin,dir,{x:c.x,y:c.y+.45,z:c.z,hx:.6,hy:.45,hz:.4});if(t<near){near=t;hit={chest:c};}}for(let t=1;t<near;t+=1){if(origin.y+dir.y*t<terrain(origin.x+dir.x*t,origin.z+dir.z*t)){near=t;hit=null;break;}}return {hit,distance:near,point:{x:origin.x+dir.x*near,y:origin.y+dir.y*near,z:origin.z+dir.z*near}};}
  damageWorld(object,amount,surface,position){
    if(object.health===0)return false;object.health=Math.max(0,(object.health??200)-amount);
    this.events.push({type:'worldHit',surface,destroyed:object.health===0,position:position||{x:object.x,y:object.y+.5,z:object.z},variant:object.kind==='tree'?object.id%3:0});
    return object.health===0;
  }
  harvest(origin,dir){
    if(this.phase!=='playing'||this.cooldown>0)return false;this.cooldown=.5;
    const r=this.trace(origin,dir,0);let hit=false;
    if(r.distance<4&&r.hit){
      const object=r.hit.obstacle||r.hit.wall||r.hit.chest;
      if(object){const surface=r.hit.chest?'chest':r.hit.wall?'wood':object.kind==='tree'?'tree':'rock';this.damageWorld(object,50,surface,r.point);if(surface==='rock')this.stone+=5;else this.wood+=5;hit=true;}
      else if(r.hit.actor){this.damage(r.hit.actor,20,0);hit=true;}
    }
    this.events.push({type:'fire',hit,weapon:-1});return true;
  }
  fire(origin,direction,aim=false){if(this.selected>=3)return this.useSelected();this.useItem=null;if(this.selected<0)return this.harvest(origin,direction);if(this.phase!=='playing'||this.cooldown>0||this.reloadTime>0)return false;const w=WEAPONS[this.selected],a=this.ammo[this.selected];if(!a.mag){this.events.push({type:'empty',weapon:this.selected});this.cooldown=.3;this.reload();return false;}a.mag--;this.cooldown=w.interval;let hits=0;for(let i=0;i<w.pellets;i++){const s=w.spread*(aim?.45:1),d=normalize({x:direction.x+(this.random()-.5)*s,y:direction.y+(this.random()-.5)*s,z:direction.z+(this.random()-.5)*s}),r=this.trace(origin,d,0);if(r.hit?.actor){this.damage(r.hit.actor,w.damage,0);hits++;}if(r.hit?.wall)this.damageWorld(r.hit.wall,w.damage,'wood',r.point);if(r.hit?.chest)this.damageWorld(r.hit.chest,w.damage,'chest',r.point);if(r.hit?.obstacle)this.damageWorld(r.hit.obstacle,w.damage,r.hit.obstacle.kind==='tree'?'tree':'rock',r.point);this.shots.push({from:{...origin},to:r.point,life:.09,player:true});}this.events.push({type:'fire',hit:hits>0,weapon:this.selected});return true;}
  build(yaw,type='wall'){if(this.phase!=='playing'||this.wood<10)return false;const x=Math.round((this.player.x-Math.sin(yaw)*3)/3)*3,z=Math.round((this.player.z-Math.cos(yaw)*3)/3)*3;if(this.walls.some(w=>w.health>0&&Math.hypot(w.x-x,w.z-z)<2))return false;if(this.obstacles.some(o=>Math.hypot(o.x-x,o.z-z)<o.radius+1))return false;const side=Math.abs(Math.sin(yaw))>Math.abs(Math.cos(yaw));this.walls.push({id:this.walls.length,type,yaw:side?Math.PI/2:0,x,z,y:terrain(x,z)+(type==='floor'?.1:1.6),hx:type==='wall'?(side?.15:1.6):1.6,hy:type==='floor'?.1:1.6,hz:type==='wall'?(side?1.6:.15):1.6,health:150});this.wood-=10;this.events.push({type:'build'});return true;}
  step(dt,input={}){
    if(this.phase!=='playing')return;dt=Math.max(0,Math.min(dt,.05));this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);const wasReloading=this.reloadTime>0;this.reloadTime=Math.max(0,this.reloadTime-dt);if(wasReloading&&!this.reloadTime){const a=this.ammo[this.selected],n=Math.min(WEAPONS[this.selected].clip-a.mag,a.reserve);a.mag+=n;a.reserve-=n;this.events.push({type:'reloadEnd',weapon:this.selected});}
    const p=this.player;p.yaw=input.yaw??p.yaw;let dx=input.x||0,dz=input.z||0;const norm=Math.hypot(dx,dz);if(norm>1){dx/=norm;dz/=norm;}const speed=5.5;this.move(p,dx*speed*dt,dz*speed*dt);const floor=this.floorAt(p.x,p.z,p.y);if(input.jump&&p.y<=floor+.01){p.vy=7;this.events.push({type:'jump'});}const falling=p.vy< -1;p.vy-=20*dt;p.y+=p.vy*dt;if(p.y<floor){p.y=floor;p.vy=0;if(falling)this.events.push({type:'land'});}
    if(this.useItem){if(norm>.1||input.jump)this.useItem=null;else{this.useItem.remaining-=dt;if(this.useItem.remaining<=0){const k=this.useItem.kind;if(k==='shield'){this.shields--;p.shield=Math.min(100,p.shield+50);}if(k==='medkit'){this.medkits--;p.health=100;}if(k==='bandage'){this.bandages--;p.health=Math.min(75,p.health+15);}this.events.push({type:'heal',kind:k});this.useItem=null;if(!this.itemCount(k)){const slot=this.inventory.indexOf(k);if(slot>=0)this.inventory[slot]=null;if(this.selected===slot)this.selected=-1;}}}}
    for(let i=0;i<this.pickups.length;i++){const a=this.pickups[i];if(!a.taken&&['ammo','shells','heavy','wood'].includes(a.kind)&&Math.hypot(p.x-a.x,p.z-a.z)<1.3&&Math.abs(p.y+.5-a.y)<2)this.collect(i);}
    for(const b of this.bots){if(!b.alive)continue;b.cooldown-=dt;b.think-=dt;if(b.think<=0){b.think=.5+this.random()*.3;b.target=this.actors.filter(a=>a.alive&&a.id!==b.id).sort((a,c)=>Math.hypot(a.x-b.x,a.z-b.z)-Math.hypot(c.x-b.x,c.z-b.z))[0];}const target=b.target;if(!target?.alive)continue;let x=target.x-b.x,z=target.z-b.z,d=Math.hypot(x,z);if(Math.hypot(b.x,b.z)>this.radius-4){x=-b.x;z=-b.z;d=Math.hypot(x,z);}const advance=d>17?1:d<9?-.65:0,strafe=Math.sin(this.time*.9+b.id)*.6,dir=normalize({x,z});this.move(b,(dir.x*advance+dir.z*strafe)*3.5*dt,(dir.z*advance-dir.x*strafe)*3.5*dt);b.y=terrain(b.x,b.z);b.yaw=Math.atan2(-(target.x-b.x),-(target.z-b.z));if(d<55&&b.cooldown<=0){b.cooldown=.65+this.random()*.6;const origin={x:b.x,y:b.y+1.35,z:b.z},direction=normalize({x:target.x-b.x+(this.random()-.5)*2,y:target.y+.9-origin.y+(this.random()-.5)*.6,z:target.z-b.z+(this.random()-.5)*2}),r=this.trace(origin,direction,b.id);if(r.hit?.actor)this.damage(r.hit.actor,7,b.id);if(r.hit?.wall)this.damageWorld(r.hit.wall,12,'wood',r.point);if(r.hit?.chest)this.damageWorld(r.hit.chest,12,'chest',r.point);this.events.push({type:'botFire',position:origin});this.shots.push({from:origin,to:r.point,life:.09,player:false});}}
    for(const a of this.actors)if(a.alive&&Math.hypot(a.x,a.z)>this.radius)this.damage(a,(this.time>180?12:4)*dt,-1,true);
    for(const shot of this.shots)shot.life-=dt;this.shots=this.shots.filter(s=>s.life>0);
    if(!p.alive){this.phase='lost';this.events.push({type:'end',won:false});}else if(!this.bots.some(b=>b.alive)){this.phase='won';this.events.push({type:'end',won:true});}
  }
}

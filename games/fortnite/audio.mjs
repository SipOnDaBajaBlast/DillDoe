const guns=['ar','shotgun','sniper'];
export class OriginalAudio{
  constructor(){this.raw=new Map();this.buffers=new Map();this.loops=new Map();this.voices=new Set();this.enabled=true;this.previous=null;this.footstep=0;this.reloadInsert=false;}
  async load(){
    const r=await fetch('./assets/audio/manifest.json?v=16');if(!r.ok)throw Error('Original audio manifest missing');this.manifest=await r.json();
    const files=Object.values(this.manifest.sounds).flatMap(s=>s.files);
    // Limit parallel requests so audio does not starve model downloads.
    for(let i=0;i<files.length;i+=6)await Promise.all(files.slice(i,i+6).map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('Missing original sound: '+url);this.raw.set(url,await r.arrayBuffer());}));
  }
  async unlock(){
    if(!this.context){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=this.enabled?.8:0;this.master.connect(this.context.destination);}
    await this.context.resume();
    if(!this.decoding)this.decoding=Promise.all([...this.raw].map(async([url,bytes])=>this.buffers.set(url,await this.context.decodeAudioData(bytes.slice(0)))));
    await this.decoding;
  }
  setEnabled(enabled){this.enabled=enabled;if(this.master)this.master.gain.setTargetAtTime(enabled?.8:0,this.context.currentTime,.015);}
  play(key,{volume=1,position=null,loop=false,pitch=1}={}){
    const files=this.manifest?.sounds[key]?.files;if(!files||!this.context||!this.enabled)return null;
    const buffer=this.buffers.get(files[Math.floor(Math.random()*files.length)]);if(!buffer)return null;
    if(!loop&&this.voices.size>=40)return null;
    const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=buffer;source.loop=loop;source.playbackRate.value=pitch;gain.gain.value=volume;source.connect(gain);
    let panner;if(position){panner=this.context.createPanner();panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=4;panner.maxDistance=100;panner.rolloffFactor=1;panner.positionX.value=position.x;panner.positionY.value=position.y;panner.positionZ.value=position.z;gain.connect(panner);panner.connect(this.master);}else gain.connect(this.master);
    const voice={source,gain,panner};this.voices.add(voice);source.onended=()=>{this.voices.delete(voice);source.disconnect();gain.disconnect();panner?.disconnect();};source.start();return voice;
  }
  stopVoice(voice){if(voice)try{voice.source.stop();}catch{}}
  loop(key,active,options={}){let voice=this.loops.get(key);if(!active||!this.enabled){this.stopVoice(voice);this.loops.delete(key);return;}if(!voice){voice=this.play(key,{...options,loop:true});if(voice)this.loops.set(key,voice);}if(voice){voice.gain.gain.setTargetAtTime(options.volume??1,this.context.currentTime,.1);if(voice.panner&&options.position){const p=options.position;voice.panner.positionX.value=p.x;voice.panner.positionY.value=p.y;voice.panner.positionZ.value=p.z;}}}
  stop(){for(const voice of this.voices)this.stopVoice(voice);this.loops.clear();this.previous=null;this.footstep=0;}
  event(e){
    if(e.type==='fire'){this.play(e.weapon<0?'swing':guns[e.weapon]+'Fire');if(e.hit&&e.weapon>=0)this.play('hit',{volume:1.8});}
    if(e.type==='danceStart')this.danceVoice=this.play('dance');if(e.type==='danceStop')this.stopVoice(this.danceVoice);if(['busJump','gliderOpen','gliderClose'].includes(e.type))this.play(e.type);if(e.type==='empty')this.play(guns[e.weapon]+'Empty');
    if(e.type==='botFire')this.play('arFire',{position:e.position,volume:.7});
    if(e.type==='worldHit'){const key=e.surface==='tree'?(e.destroyed?(e.variant===1?'oakBreak':'treeBreak'):(e.variant===1?'oakHit':e.variant===2?'pineHit':'treeHit')):e.surface==='rock'?(e.destroyed?'rockBreak':'rockHit'):e.destroyed?'treeBreak':'impact';this.play(key,{position:e.position});}
    if(e.type==='hurt')this.play(e.shieldBreak?'shieldBreak':e.shield?'shieldHit':'hit',{volume:1.5});
    if(e.type==='pickup')this.play(['shield','bandage','medkit'].includes(e.kind)?e.kind+'Pickup':e.kind==='wood'||e.kind==='stone'?'woodPickup':'ammoPickup');
    if(e.type==='chest'){this.loop('chestSearch',false);this.play('chestOpen');}
    if(e.type==='heal')this.play(e.kind==='shield'?'shieldRestore':'healthRestore',{pitch:1.5});
    if(e.type==='reload'){this.reloadInsert=false;this.play(guns[e.weapon]+'ReloadStart');}
    if(e.type==='reloadEnd')this.play(guns[e.weapon]+'ReloadEnd');
    if(e.type==='build')this.play('build');
    if(e.type==='equip')this.play(e.slot<0?'axeEquip':'equip');
    if(e.type==='jump'||e.type==='land')this.play(e.type);
  }
  update(match,dt,{searching=false,yaw=0,aim=false}={}){
    if(!this.context)return;this.loop('busLoop',match.deployment?.stage==='bus',{volume:.8});this.loop('diveLoop',match.deployment?.stage==='dive',{volume:.8});this.loop('glideLoop',match.deployment?.stage==='glide',{volume:.8});const p=match.spectatedActor||match.player,l=this.context.listener;
    if(l.positionX){l.positionX.value=p.x;l.positionY.value=p.y+1.5;l.positionZ.value=p.z;l.forwardX.value=-Math.sin(yaw);l.forwardY.value=0;l.forwardZ.value=-Math.cos(yaw);l.upX.value=0;l.upY.value=1;l.upZ.value=0;}
    const previous=this.previous;if(previous){const moved=Math.hypot(p.x-previous.x,p.z-previous.z);this.footstep+=moved;if(!match.deployment&&this.footstep>.0&&this.footstep>=1.65&&Math.abs(p.vy)<.1){this.play('footstep',{volume:2});this.footstep=0;}
      if(!previous.using&&match.useItem)this.healVoice=this.play('healApply');if(previous.using&&!match.useItem)this.stopVoice(this.healVoice);
      if(aim!==previous.aim&&match.selected===2)this.play(aim?'scopeIn':'scopeOut');
      if(previous.time<25&&match.time>=25)this.play('storm');
    }
    if(match.reloadTime>0&&match.selected>=0&&match.selected<3&&!this.reloadInsert&&match.reloadTime<[2.1,2.8,2.4][match.selected]*.55){this.play(guns[match.selected]+'ReloadCartridge');this.reloadInsert=true;}
    this.loop('chestSearch',searching,{volume:.9});
    let nearest=null,distance=14;for(const chest of match.chests){if(chest.opened||chest.health===0)continue;const d=Math.hypot(p.x-chest.x,p.z-chest.z);if(d<distance){nearest=chest;distance=d;}}
    this.loop('chestHum',!!nearest,{volume:1.5,position:nearest?{x:nearest.x,y:nearest.y+.5,z:nearest.z}:null});
    this.loop('ambience',true,{volume:1.3});this.loop('stormLoop',Math.hypot(p.x,p.z)>match.radius,{volume:1});
    this.previous={x:p.x,z:p.z,time:match.time,using:!!match.useItem,aim};
  }
}

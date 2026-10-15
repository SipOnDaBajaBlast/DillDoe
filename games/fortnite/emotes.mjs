export function canEmote(match,input={}){return match.phase==='playing'&&match.player.alive&&!match.deployment&&!match.useItem&&!match.player.crouched&&Math.abs(match.player.vy)<.1&&!input.jump&&Math.hypot(input.x||0,input.z||0)<.01;}
// MI-PieMenu in the original 3.5 files is a procedural UI material, not a bitmap.
// These are its stored inner radius, opacity and color; original art supplies
// the center, pointer, dotted rule and the sole equipped Dance Moves icon.
export function installEmoteWheel({choose,cancel}){
 const root=document.createElement('section');root.id='emoteWheel';root.hidden=true;root.setAttribute('aria-label','Locker Emotes');
 root.innerHTML='<h2>Locker Emotes</h2><div class="emote-disc"><canvas class="emote-ring" width="768" height="768" aria-hidden="true"></canvas><button class="dance-choice" aria-label="Dance Moves"><img src="./assets/danceIcon.png" alt=""><span>Dance Moves</span></button><button class="emote-cancel">Cancel</button><img class="emote-pointer" src="./assets/hud/Radial_Pointer.png" alt=""></div>';
 let selected=true;const disc=root.querySelector('.emote-disc'),canvas=root.querySelector('canvas'),pointer=root.querySelector('.emote-pointer'),ctx=canvas.getContext('2d');
 function paint(){
  ctx.clearRect(0,0,768,768);ctx.fillStyle='rgba(0,4,26,.85)';ctx.beginPath();ctx.arc(384,384,382,0,Math.PI*2);ctx.arc(384,384,384*.35,0,Math.PI*2,true);ctx.fill('evenodd');
  if(selected){ctx.fillStyle='rgba(36,67,106,.32)';ctx.beginPath();ctx.arc(384,384,382,-Math.PI*2/3,-Math.PI/3);ctx.arc(384,384,384*.35,-Math.PI/3,-Math.PI*2/3,true);ctx.closePath();ctx.fill();}
 }
 function select(value){if(selected!==value){selected=value;root.classList.toggle('dance-highlight',selected);paint();}}
 root.onpointermove=e=>{
  const rect=disc.getBoundingClientRect(),x=e.clientX-rect.left-rect.width/2,y=e.clientY-rect.top-rect.height/2,r=Math.hypot(x,y),angle=Math.atan2(y,x);
  select(r>rect.width*.175&&r<rect.width*.5&&y<0&&Math.abs(x)<-y*.58);
  pointer.style.transform=`translate(-50%,-50%) translate(${Math.cos(angle)*rect.width*.205}px,${Math.sin(angle)*rect.width*.205}px) rotate(${angle}rad)`;
 };
 document.body.append(root);root.querySelector('.dance-choice').onclick=choose;root.querySelector('.emote-cancel').onclick=cancel;
 return {get selected(){return selected;},get open(){return !root.hidden;},show(){selected=true;root.classList.add('dance-highlight');root.hidden=false;pointer.style.transform=`translate(-50%,-50%) translateY(-${disc.getBoundingClientRect().width*.205}px) rotate(-1.5708rad)`;paint();},hide(){root.hidden=true;}};
}

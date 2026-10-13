export function canEmote(match,input={}){return match.phase==='playing'&&match.player.alive&&!match.deployment&&!match.useItem&&!match.player.crouched&&Math.abs(match.player.vy)<.1&&!input.jump&&Math.hypot(input.x||0,input.z||0)<.01;}
export function installEmoteWheel({choose,cancel}){
 const root=document.createElement('section');root.id='emoteWheel';root.hidden=true;root.setAttribute('aria-label','Locker Emotes');root.innerHTML='<h2>LOCKER EMOTES</h2><div class="emote-disc"><button class="dance-choice" aria-label="Dance Moves"><img src="./assets/danceIcon.png" alt=""><span>Dance Moves</span></button><button class="emote-cancel">Cancel</button></div><p>Release emote key or click to play</p>';document.body.append(root);root.querySelector('.dance-choice').onclick=choose;root.querySelector('.emote-cancel').onclick=cancel;
 return {get open(){return !root.hidden;},show(){root.hidden=false;},hide(){root.hidden=true;}};
}

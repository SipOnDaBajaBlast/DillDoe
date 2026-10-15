let worldMap;
export function setWorldMap(value){worldMap=value;}
const nodes=new Map(),$=id=>nodes.get(id)||remember(id),art=name=>'./assets/hud/'+name+'.png';
function remember(id){const node=document.getElementById(id);if(node)nodes.set(id,node);return node;}
const values=new Map();
function text(id,value){value=String(value);if(values.get(id)!==value){values.set(id,value);$(id).textContent=value;}}
function width(id,value){const key=id+':width';if(values.get(key)!==value){values.set(key,value);$(id).style.width=value+'%';}}
const hud=$('hud');
hud.innerHTML=`<div id="squad"><img class="squad-arrow" src="${art('Compass_CenterMark')}" alt=""> <b>Player 1</b><i></i></div><div id="compass"><img src="${art('Compass_CenterMark')}" alt=""></div>
<div id="match"><div class="minimap-wrap"><canvas id="map" width="264" height="264" aria-label="Minimap and storm circle"></canvas><img class="map-frame" src="${art('minimap_Art_square')}" alt=""></div><div class="match-counts"><span class="storm-clock"><img src="${art('T_Clock')}" alt="Storm timer"></span><span id="storm">0:25</span><img src="${art('AliveIco')}" alt="Players"><span id="alive">13</span><img src="${art('KillsIco')}" alt="Eliminations"><span id="kills">0</span></div></div>
<div id="matchOutcome" hidden></div><div id="spectatingName"></div><div id="flightPrompt" hidden></div><div id="damageArc"></div><div id="objectHealth" hidden><i></i><span></span></div><div id="weakPoint" hidden><i></i><b></b></div><div id="crosshair"><i></i><i></i><i></i><i></i></div><div id="hit" aria-hidden="true"></div><div id="toast" role="status"></div>
<div id="vitals"><div class="vital-row shield"><img src="${art('icon_shield')}" alt="Shield"><div class="vital-track"><i id="shieldBar"></i><span><strong id="shieldText">0</strong> <small>100</small></span></div></div><div class="vital-row health"><img src="${art('icon_health')}" alt="Health"><div class="vital-track"><i id="healthBar"></i><span><strong id="healthText">100</strong> <small>100</small></span></div></div></div>
<div id="resources"><div><img src="${art('T-Icon-Logs')}" alt="Wood"><b id="wood">100</b></div><div><img src="${art('T-Icon-S-Loot-Stone')}" alt="Stone"><b id="stone">0</b></div><div><img src="${art('T-Icon-IBeam')}" alt="Metal"><b>0</b></div></div>
<div id="loadout"><div id="ammo"><b id="ammoMag"></b><i></i><small id="ammoReserve"></small><img src="${art('T-Items-AmmoMedium')}" alt="Ammo"><span id="reloadLabel" hidden>Reloading…</span></div><div id="weapon" hidden></div><div id="builds">${[['Wall','F1'],['Floor','F2'],['Stair','F3'],['Roof','F4']].map(([type,key])=>`<button data-build="${type.toLowerCase()}" title="Build ${type} (${key})"><kbd>${key}</kbd><img src="${art('Icon_Building_'+type)}" alt="${type}"></button>`).join('')}</div><div id="slots">
<button data-slot="-1" class="pickaxe selected" title="Pickaxe (1)"><kbd>1</kbd><img src="${art('T-Icon-Weapons-SK-Pick')}" alt="Pickaxe"></button>
<button data-slot="0" class="common" title="Assault rifle (2)"><kbd>2</kbd><img src="${art('T-Icon-Weapons-Assault-01')}" alt="Assault rifle"><span class="slot-ammo" id="rifle-count">30</span></button>
<button data-slot="1" class="uncommon" title="Pump shotgun (3)"><kbd>3</kbd><img src="${art('T-Icon-Weapons-SK-Shotgun-Standard')}" alt="Pump shotgun"><span class="slot-ammo" id="shotgun-count">5</span></button>
<button data-slot="2" class="rare" title="Bolt-action sniper (4)"><kbd>4</kbd><img src="${art('T-Icon-Weapons-SK-Sniper-02')}" alt="Sniper"><span class="slot-ammo" id="sniper-count">1</span></button>
<button id="bandage" data-slot="3" class="empty" title="Empty slot (5)" disabled><kbd>5</kbd><img class="bandage-icon" hidden alt=""><span class="slot-ammo" id="bandage-count" hidden></span></button><button id="shieldSlot" data-slot="4" class="empty" title="Empty slot (6)" disabled><kbd>6</kbd><img hidden alt=""><span class="slot-ammo" id="shield-count" hidden></span></button></div></div>
<div id="interaction" hidden><div class="interact-key"><kbd>E</kbd><span id="itemAction">Search</span></div><div class="item-card"><strong id="itemName"></strong><small id="itemType"></small><i id="searchProgress"></i></div></div><div id="useProgress" hidden></div><div id="context-controls"><span><kbd>Q</kbd> BUILD</span><span><kbd>R</kbd> RELOAD</span><span><kbd>ESC</kbd> MENU</span></div>`;
const island=new Image();island.src=art('MiniMapAthena');
const slotButtons=[...hud.querySelectorAll('[data-slot]')],buildButtons=[...hud.querySelectorAll('[data-build]')];
const consumables=[[3,'bandage','bandage-count'],[4,'shieldSlot','shield-count']].map(([slot,id,countId])=>({slot,button:$(id),img:$(id).querySelector('img'),countId}));
let compassHeading=-1,lastSelected=null,lastBindings='',lastMapDraw=-Infinity;
export function updateHud(match,yaw,controls){
 const p=match.spectatedActor||match.player,slot=match.selected,a=match.ammo[slot];
 text('healthText',Math.ceil(p.health));text('shieldText',Math.ceil(p.shield));width('healthBar',p.health);width('shieldBar',p.shield);
 text('alive',match.alive);text('kills',match.eliminations);text('wood',match.wood);text('stone',match.stone||0);
 for(const item of consumables){
  const {slot,button,img,countId}=item,kind=match.inventory[slot],count=match.itemCount(kind),signature=kind+':'+count;
  if(item.signature===signature)continue;item.signature=signature;button.disabled=!count;
  button.className=count?(kind==='shield'?'rare':kind==='medkit'?'uncommon':'common'):'empty';button.classList.toggle('selected',match.selected===slot);img.hidden=!count;$(countId).hidden=!count;
  if(count){const icon={medkit:'T-Icon-MedKit',bandage:'T-Icon-MedBandage',shield:'T-Icon-Items-MineralPowder-06'}[kind];img.src=art(icon);img.alt={medkit:'Medkit',bandage:'Bandages',shield:'Shield potion'}[kind];text(countId,count);button.title=img.alt+' ('+(controls?.label('slot'+(slot+1))||slot+2)+')';}
  else{img.removeAttribute('src');img.alt='';button.title='Empty inventory slot';}
 }
 const ammoState=slot<0?'none':slot>=3?'item':match.reloadTime>0?'reload':'weapon';
 if(values.get('ammo:state')!==ammoState){values.set('ammo:state',ammoState);$('ammo').dataset.state=ammoState;$('reloadLabel').hidden=ammoState!=='reload';}
 if(ammoState==='weapon'){text('ammoMag',a.mag);text('ammoReserve',a.reserve);}
 else if(ammoState==='item')text('ammoMag',match.itemCount(match.inventory[slot]));
 ['rifle-count','shotgun-count','sniper-count'].forEach((id,i)=>text(id,match.ammo[i].mag));
 if(lastSelected!==slot){lastSelected=slot;for(const button of slotButtons)button.classList.toggle('selected',+button.dataset.slot===slot);}
 if(controls){
  const bindingNames=['pickaxe','slot1','slot2','slot3','slot4','slot5','wall','floor','stair','roof','build','reload'],signature=bindingNames.map(k=>controls.label(k)).join('|');
  if(lastBindings!==signature){lastBindings=signature;
   for(const button of slotButtons)button.querySelector('kbd').textContent=controls.label(+button.dataset.slot<0?'pickaxe':'slot'+(+button.dataset.slot+1));
   for(const button of buildButtons)button.querySelector('kbd').textContent=controls.label(button.dataset.build);
   hud.querySelectorAll('#context-controls kbd').forEach((key,i)=>key.textContent=i===0?controls.label('build'):i===1?controls.label('reload'):'ESC');
  }
 }
 const heading=Math.round((((-yaw*180/Math.PI)%360+360)%360)*4)/4;
 if(heading!==compassHeading){compassHeading=heading;$('compass').style.setProperty('--heading',heading);}
 const remaining=Math.max(0,Math.ceil(match.time<25?25-match.time:240-match.time));text('storm',`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`);
 // The minimap is a small navigation aid. Repainting it eight times a second
 // keeps it responsive without competing with the 3D frame on lower-end GPUs.
 const now=performance.now();if(now-lastMapDraw<125)return;lastMapDraw=now;
 const ctx=$('map').getContext('2d'),scale=264/(worldMap?worldMap.extent*2:300);ctx.fillStyle='#748c41';ctx.fillRect(0,0,264,264);
 if(worldMap)ctx.drawImage(worldMap.canvas,0,0,264,264);else if(island.complete&&island.naturalWidth)ctx.drawImage(island,820,700,420,420,0,0,264,264);
 ctx.fillStyle='#6c418a88';ctx.beginPath();ctx.rect(0,0,264,264);ctx.arc(132,132,match.radius*scale,0,Math.PI*2,true);ctx.fill('evenodd');ctx.strokeStyle='#e9d4ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(132,132,match.radius*scale,0,Math.PI*2);ctx.stroke();
 ctx.save();ctx.translate(132+p.x*scale,132+p.z*scale);ctx.rotate(-yaw);ctx.fillStyle='#fff';ctx.strokeStyle='#2228';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(0,2);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}


const outcomes=document.createElement('div');outcomes.id='outcomeActions';outcomes.hidden=true;outcomes.innerHTML='<button id="outcomeLobby">RETURN TO LOBBY</button>';document.body.append(outcomes);

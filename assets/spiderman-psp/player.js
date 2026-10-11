'use strict';
const SIZE=436830208, CHUNK=4*1024*1024, COUNT=Math.ceil(SIZE/CHUNK);
const $=id=>document.getElementById(id), status=$('status'), play=$('play'), bar=$('progress');
let db, busy=false, cached=[], memoryOnly=false;
function openCache(){return new Promise((resolve,reject)=>{const r=indexedDB.open('dilldoe-spiderman-psp-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('chunks');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Close other Spider-Man tabs and try again.'));});}
function readChunks(){return new Promise((resolve,reject)=>{const result=[],r=db.transaction('chunks').objectStore('chunks').openCursor();r.onsuccess=()=>{const cursor=r.result;if(!cursor){resolve(result);return;}const n=cursor.key,b=cursor.value;if(Number.isInteger(n)&&n>=0&&n<COUNT&&b instanceof Blob&&b.size===Math.min(CHUNK,SIZE-n*CHUNK))result[n]=b;cursor.continue();};r.onerror=()=>reject(r.error);});}
function storeChunk(n,blob){return new Promise((resolve,reject)=>{const tx=db.transaction('chunks','readwrite');tx.objectStore('chunks').put(blob,n);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});}
function bytesSaved(){return cached.reduce((total,b)=>total+(b?.size||0),0);}
function report(bytes,text='Downloading game'){bar.hidden=false;bar.value=bytes;status.textContent=`${text}… ${Math.floor(bytes/SIZE*100)}% (${Math.round(bytes/1048576)} / 417 MB)`;}
async function download(){
  let next=0, loaded=bytesSaved();const controller=new AbortController();report(loaded);
  async function worker(){while(next<COUNT){const n=next++;if(cached[n])continue;const start=n*CHUNK,end=Math.min(SIZE-1,start+CHUNK-1);let blob;
    for(let attempt=0;attempt<4;attempt++){try{const timeout=AbortSignal.timeout(90000);const response=await fetch(`/ports/spiderman-psp/api/game?start=${start}&end=${end}&v=1`,{signal:AbortSignal.any([controller.signal,timeout])});if(!response.ok)throw new Error('Game download is temporarily unavailable.');blob=await response.blob();if(blob.size!==end-start+1)throw new Error('Incomplete game download.');break;}catch(error){if(controller.signal.aborted||attempt===3)throw error;await new Promise(resolve=>setTimeout(resolve,500*2**attempt));}}
    cached[n]=blob;loaded+=blob.size;report(loaded);
    if(db&&!memoryOnly){try{await storeChunk(n,blob);}catch{memoryOnly=true;console.warn('Browser storage is full or unavailable; this visit can still play.');}}
  }}
  try{await Promise.all(Array.from({length:3},worker));}catch(error){controller.abort();throw error;}
}
function settings(mode){const fast=mode!=='compatible';return{
  ppsspp_internal_resolution:'480x272',ppsspp_software_rendering:'disabled',
  // GPU mode is opt-in: hardware transforms previously corrupted the system dialog.
  ppsspp_gpu_hardware_transform:mode==='gpu'?'enabled':'disabled',ppsspp_software_skinning:'enabled',
  ppsspp_cpu_core:'IR JIT',ppsspp_fast_memory:'enabled',ppsspp_locked_cpu_speed:fast?'222MHz':'disabled',
  ppsspp_inflight_frames:fast?'Up to 1':'Up to 2',
  ppsspp_skip_gpu_readbacks:mode==='gpu'?'enabled':'disabled',
  ppsspp_frameskip:fast?'1':'disabled',ppsspp_auto_frameskip:fast?'enabled':'disabled',ppsspp_frame_duplication:'disabled',
  ppsspp_texture_scaling_level:'disabled',ppsspp_texture_anisotropic_filtering:'disabled',
  ppsspp_texture_filtering:fast?'Nearest':'Auto',ppsspp_lazy_texture_caching:fast?'enabled':'disabled',
  ppsspp_spline_quality:'Low',ppsspp_lower_resolution_for_effects:fast?'Aggressive':'Safe',shader:'disabled'
};}
function configureStartup(emulator,options){
  // Verified against EmulatorJS 4.2.3. Set startup-only options before RetroArch
  // reads them, while retaining unrelated saved settings and key bindings.
  const original=emulator.getCoreSettings.bind(emulator);
  emulator.getCoreSettings=()=>{
    let config=original();
    for(const [key,value] of Object.entries(options)){
      if(!key.startsWith('ppsspp_'))continue;
      config=config.replace(new RegExp('^'+key+'\\s*=.*(?:\\r?\\n|$)','gm'),'');
      if(config&&!config.endsWith('\n'))config+='\n';
      config+=key+' = "'+value+'"\n';
    }
    return config;
  };
  emulator.on('saveDatabaseLoaded',FS=>{
    // Absorb brief scheduling stalls; extra buffering cannot cure sustained
    // slow emulation. Preserve every other frontend configuration line.
    try{
      const path='/home/web_user/.config/retroarch/retroarch.cfg';
      let config=FS.readFile(path,{encoding:'utf8'});
      config=config.replace(/^audio_latency\s*=.*(?:\r?\n|$)/gm,'');
      if(config&&!config.endsWith('\n'))config+='\n';
      FS.writeFile(path,config+'audio_latency = 128\n');
    }catch(error){console.warn('Could not configure audio buffering.',error);}
  });
}
function boot(file){
  const options=settings($('quality').value);const gameUrl=URL.createObjectURL(file);
  window.EJS_player='#game';window.EJS_core='psp';window.EJS_gameUrl=gameUrl;
  window.EJS_gameName='Spider-Man Web of Shadows';
  window.EJS_pathtodata='https://cdn.emulatorjs.org/4.2.3/data/';window.EJS_threads=true;
  window.EJS_ready=()=>{try{configureStartup(window.EJS_emulator,options);}catch(error){console.warn('Could not apply startup performance settings.',error);}};
  window.EJS_startOnLoaded=true;window.EJS_defaultOptions=options;window.EJS_color='#57cce6';
  window.EJS_onGameStart=()=>{
    // EmulatorJS restores saved core options over defaults. Apply only this
    // game's selected preset, preserving saves, key bindings and other preferences.
    const manager=window.EJS_emulator?.gameManager;
    if(manager?.setVariable){for(const [key,value] of Object.entries(options)){if(key.startsWith('ppsspp_'))manager.setVariable(key,value);}}
    $('note').textContent='Click the game to enable play and sound.';$('game').addEventListener('pointerdown',()=>{$('note').hidden=true;},{once:true});URL.revokeObjectURL(gameUrl);};
  $('setup').hidden=true;$('note').hidden=false;
  if(memoryOnly)$('note').textContent='Storage unavailable: play works this visit, but the game may download again next time. Click to enable sound.';
  const loader=document.createElement('script');loader.src=window.EJS_pathtodata+'loader.js';loader.crossOrigin='anonymous';
  loader.onerror=()=>{$('setup').hidden=false;status.textContent='The emulator could not load. Check your connection and reload; saved downloads are kept.';play.disabled=false;busy=false;};document.body.append(loader);
}
play.onclick=async()=>{
  if(busy)return;busy=true;play.disabled=true;$('quality').disabled=true;
  if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined'){status.textContent='Open this game directly in a current Chrome or Edge browser. The emulator needs browser isolation.';play.disabled=false;$('quality').disabled=false;busy=false;return;}
  try{if(bytesSaved()!==SIZE)await download();status.textContent='Starting emulator…';
    const file=new File(cached,'Spider-Man-Web-of-Shadows.iso',{type:'application/octet-stream'});
    const header=new Uint8Array(await file.slice(32768,32775).arrayBuffer());if(String.fromCharCode(...header.slice(1,6))!=='CD001')throw new Error('Game verification failed. Clear this game’s site storage and retry.');
    boot(file);
  }catch(error){status.textContent=`${error.name==='TimeoutError'?'Download timed out.':error.message} Press Resume to retry; saved parts are kept.`;play.textContent='Resume download';play.disabled=false;$('quality').disabled=false;busy=false;}
};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('stage').requestFullscreen().catch(()=>{});};
$('persist').onclick=async()=>{const kept=await navigator.storage?.persist?.().catch(()=>false);$('storage-status').textContent=kept?'Browser storage protection is enabled. Clearing site data still removes files.':'This browser manages storage automatically. Keep enough free space and avoid clearing site data.';};
(async()=>{play.disabled=true;try{db=await openCache();cached=await readChunks();}catch{memoryOnly=true;}
  const saved=bytesSaved();if(saved===SIZE){play.textContent='Play saved game';status.textContent='Game saved in this browser. No game download needed.';}else if(saved){play.textContent='Resume download & play';report(saved,'Saved download');}else status.textContent=memoryOnly?'Browser storage unavailable: first play downloads 417 MB; files may not be kept.':'Ready. First play downloads 417 MB; later visits reuse the saved game.';play.disabled=false;
})();

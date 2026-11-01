import {worldfoxHtml} from './worldfox-loader.mjs';
import {bootstrap,rewriteRootPaths,installGameDownloadGuard} from './migration-paths.mjs';
import {patchFeedPitHtml} from './feed-pit-loader.mjs';
import {gtaRoutingScript} from './gta-static-routing.mjs';
import {patchDeathNoteHtml} from './death-note-loader.mjs';

// Share exactly the same compatibility fixes between static builds and downloads.
export function transformGameText(text,game,entry,path) {
 if(game==='worldfox'&&path==='index.html')return worldfoxHtml();
 if(game==='gta5-webport-vercel'&&path.startsWith('data/'))return text;
 // Bump Halo's shell version when its mounted-map paths change, so its
 // service worker offers existing visitors the corrected files.
 if(game==='halo-mobile'&&path==='version.json'){
  const version=JSON.parse(text);
  return JSON.stringify({...version,version:version.version+'-dilldoe-stream2'});
 }
 // Halo's /data paths are virtual WasmFS mount points, not network URLs.
 if(!(game==='halo-mobile'&&['app.js','stream-maps.js'].includes(path)))text=rewriteRootPaths(text,game,entry.files,path);
 if(game==='gta5-webport-vercel'&&path.endsWith('/loader.js'))text=text.replace("new Worker(B + '/io_worker.js')","new Worker(B + '/io_worker.js?assets=static-v2')");
 if(game==='gta5-webport-vercel'&&path.endsWith('/io_worker.js')){
  if(!text.includes('const SLICE_BLOCKS = 32;'))throw new Error('Recheck GTA I/O batching before changing its source revision');
  text=text.replace('const SLICE_BLOCKS = 32;','const SLICE_BLOCKS = 128;').replace('128 KB: see startRun','512 KB: fewer range requests; cache block sizes are unchanged');
  text+='\n'+gtaRoutingScript()+'\n('+installGameDownloadGuard.toString()+')();\n';
 }
 if(game==='feed-the-pit'&&path==='feedthepit.js')text=text.replace('`${loadPath}.wasm`','`${loadPath}.wasm?loader=3`');
 if(path.endsWith('.html')){
  if(game==='death-note'&&path==='index.html')text=patchDeathNoteHtml(text,entry);
  if(game==='kindergarten3'&&path==='index.html'){
   if(!text.includes('Promise.all([')||!text.includes('Kindergarten3Port.loader.js'))throw new Error('Kindergarten 3 loader changed; recheck split file loading');
   text=text.replace(/<link\b[^>]*href="TemplateData\/[^"]+"[^>]*>/gi,'');
   text=text.replace('</head>','<style>body{background:#111823;color:#edf4ff}#unity-canvas{display:block;width:100%;height:100%}#loading-text{position:fixed;top:35%;left:5%;width:90%;z-index:3;color:#edf4ff!important;font:24px Arial,sans-serif!important}#unity-loading-bar{position:absolute;bottom:12%;left:15%;width:70%;height:16px;border:1px solid #dcecff;border-radius:8px;overflow:hidden;background:#26354c}#unity-progress-bar-empty,#unity-progress-bar-full{height:100%}#unity-progress-bar-full{background:#72baff;width:0}</style></head>');
   text=text.replace('.then((response) => response.arrayBuffer())','.then((response) => { if (!response.ok) throw new Error("Download failed (HTTP " + response.status + ")"); return response.arrayBuffer(); })');
   text=text.replace(/\}\);\s*<\/script>/,'}).catch(error => { document.getElementById("loading-text").textContent = "Unable to load game files. " + error.message + ". Reload to try again."; console.error(error); });</script>');
  }
  if(game==='yandere-simulator'&&path==='index.html'){
   if(!text.includes('const gameInstance = UnityLoader.instantiate'))throw new Error('Yandere loader changed; recheck disc data setup');
   text=text.replace('const gameInstance = UnityLoader.instantiate','window.dataUrll = dataUrl;\n            const gameInstance = UnityLoader.instantiate');
   text=text.replace('</div>LOADING...</div>','</div>');
  }
  if(game==='gta5-webport-vercel')text=text.replace(/(src=["'])([^"']+\.js)(["'])/g,(whole,start,url,end)=>/^https?:|^\/\//.test(url)?whole:start+url+'?assets=static-v2'+end);
  if(game==='feed-the-pit')text=patchFeedPitHtml(text,entry);
  text=text.replace(/<base\b[^>]*>/gi,'');
  if(entry.files['renpy.wasm'])text=text.replace(/(src=["'])(renpy(?:-pre)?\.js)(["'])/g,'$1$2?paths=2$3');
  const inject=bootstrap(game)+(game==='gta5-webport-vercel'?'<script>'+gtaRoutingScript()+'</script>':'');
  text=/<head\b[^>]*>/i.test(text)?text.replace(/<head\b[^>]*>/i,m=>m+inject):inject+text;
 }
 return text;
}

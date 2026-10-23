import {bootstrap,rewriteRootPaths,installGameDownloadGuard} from './migration-paths.mjs';
import {patchFeedPitHtml} from './feed-pit-loader.mjs';
import {gtaRoutingScript} from './gta-static-routing.mjs';

// Share exactly the same compatibility fixes between static builds and downloads.
export function transformGameText(text,game,entry,path) {
 if(game==='gta5-webport-vercel'&&path.startsWith('data/'))return text;
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
  if(game==='gta5-webport-vercel')text=text.replace(/(src=["'])([^"']+\.js)(["'])/g,(whole,start,url,end)=>/^https?:|^\/\//.test(url)?whole:start+url+'?assets=static-v2'+end);
  if(game==='feed-the-pit')text=patchFeedPitHtml(text,entry);
  text=text.replace(/<base\b[^>]*>/gi,'');
  if(entry.files['renpy.wasm'])text=text.replace(/(src=["'])(renpy(?:-pre)?\.js)(["'])/g,'$1$2?paths=2$3');
  const inject=bootstrap(game)+(game==='gta5-webport-vercel'?'<script>'+gtaRoutingScript()+'</script>':'');
  text=/<head\b[^>]*>/i.test(text)?text.replace(/<head\b[^>]*>/i,m=>m+inject):inject+text;
 }
 return text;
}

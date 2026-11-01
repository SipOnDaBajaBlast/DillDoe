export function worldfoxHtml(){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self' https://dilldoe-gamefiles.pages.dev; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>WorldBox</title><style>html,body{margin:0;width:100%;height:100%;background:#141e2d;color:white;font:16px Arial}canvas{display:block;width:100%;height:100%;object-fit:contain}#status{position:fixed;top:35%;left:10%;width:80%;text-align:center;background:#141e2ddd;padding:1rem;box-sizing:border-box}#progress{width:100%}</style></head><body><canvas id="unity-canvas" width="960" height="600" tabindex="0"></canvas><div id="status" role="status"><p id="message">Loading WorldBox… First load downloads about 495 MB.</p><progress id="progress" max="1" value="0"></progress></div><script>
const status=document.getElementById('status'),message=document.getElementById('message'),progress=document.getElementById('progress'),canvas=document.getElementById('unity-canvas');
function fail(error){status.hidden=false;message.textContent='Could not load WorldBox. '+error.message+' Reload to retry.';console.error(error);}
const root=new URL('./',location.href),originalFetch=window.fetch.bind(window);
(async()=>{
const response=await originalFetch(new URL('Build/split-files.json',root));if(!response.ok)throw Error('Missing game file list');const manifest=await response.json();
window.fetch=async function(input,init){
const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,root);
const path=url.origin===root.origin&&url.pathname.startsWith(root.pathname)?url.pathname.slice(root.pathname.length):null;
const entry=path&&manifest[path];if(!entry)return originalFetch(input,init);
let index=0,total=0,reader=null;
const stream=new ReadableStream({async pull(controller){try{
while(true){if(reader){const next=await reader.read();if(!next.done){total+=next.value.byteLength;controller.enqueue(next.value);return;}reader=null;}
if(index>=entry.parts.length){if(total!==entry.size)throw Error('Incomplete game download');controller.close();return;}
const part=entry.parts[index++];if(part.includes('..')||part.startsWith('/')||part.includes(':'))throw Error('Invalid game file path');
const chunk=await originalFetch(new URL(part,root),init);if(!chunk.ok||!chunk.body)throw Error('Download failed (HTTP '+chunk.status+')');reader=chunk.body.getReader();
}
}catch(error){controller.error(error);fail(error);}},cancel(reason){return reader?.cancel(reason);}});
return new Response(stream,{headers:{'Content-Type':path.endsWith('.wasm')?'application/wasm':'application/octet-stream','Content-Length':String(entry.size)}});
};
const script=document.createElement('script');script.src=new URL('Build/WorldFox.loader.js',root);script.onerror=()=>fail(Error('Emulator loader unavailable'));script.onload=()=>{
createUnityInstance(canvas,{dataUrl:new URL('Build/WorldFox.data',root).href,frameworkUrl:new URL('Build/WorldFox.framework.js',root).href,codeUrl:new URL('Build/WorldFox.wasm',root).href,streamingAssetsUrl:new URL('StreamingAssets',root).href,companyName:'mkarpenko',productName:'WorldBox',productVersion:'0.51.2',showBanner:(msg,type)=>{if(type==='error')fail(Error(msg));else console.warn(msg);}},value=>{progress.value=value;message.textContent='Loading WorldBox… '+Math.round(value*100)+'%';}).then(instance=>{status.hidden=true;canvas.focus();window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='worldfox-fullscreen')instance.SetFullscreen(1);});}).catch(fail);
};document.body.append(script);
})().catch(fail);
</script></body></html>`;}

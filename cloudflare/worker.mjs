import {migrationRouter} from './lib/migration-router.mjs';
import {handleRelay} from './lib/relay.mjs';
import {POLLING_RELAY_CLIENT} from './lib/roblox-polling-client.mjs';

const ROBLOX_PREFIX='/ports/roblox-march-2007/';
const OLD_ORIGIN='https://desktop-33lh8ah.tail4210dd.ts.net';
const OLD_SOCKET='wss://desktop-33lh8ah.tail4210dd.ts.net';
const NEW_ORIGIN='https://dilldoe-games.pages.dev';
const NEW_SOCKET='wss://dilldoe-games.pages.dev';

/* The server browser used to turn the first slow or failed room-list request
 * into "relay is offline". It polls every couple of seconds, so give the
 * relay more time and only call it offline after repeated failures. */
export function patchRobloxText(text){
 return text
  .replace(/window\.RBLX_RELAY_URL\s*=\s*['"][^'"]*['"];/,"window.RBLX_RELAY_URL = location.origin + '/relay';")
  .replace('setTimeout(function () { controller.abort(); }, 5000)',
           'setTimeout(function () { controller.abort(); }, 12000)')
  .replace("setStatus(els.sbStatus, '');", "state.roomFails = 0; setStatus(els.sbStatus, '');")
  .replace("setStatus(els.sbStatus, 'Multiplayer relay is offline. Play Solo still works.');",
           "state.roomFails = (state.roomFails || 0) + 1;\n" +
           "          setStatus(els.sbStatus, state.roomFails >= 4\n" +
           "            ? 'Multiplayer relay is offline. Play Solo still works.'\n" +
           "            : 'Relay is not responding. Retrying…');")
  .replace('<script src="js/netconfig.js"></script>','<script src="js/polling-relay.js"></script>\n<script src="js/netconfig.js"></script>')
  .replaceAll(OLD_SOCKET,NEW_SOCKET)
  .replaceAll(OLD_ORIGIN,NEW_ORIGIN);
}

async function serveRoblox(request,env){
 const path=new URL(request.url).pathname;
 if(path===ROBLOX_PREFIX+'web/js/polling-relay.js'){
  return new Response(POLLING_RELAY_CLIENT,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-cache'}});
 }
 const response=await env.ASSETS.fetch(request);
 const type=response.headers.get('content-type')||'';
 if(request.method!=='GET'||!(/text|javascript|json|xml|html|css/i.test(type)||/\.(?:js|html|json|css|txt|xml)$/i.test(new URL(request.url).pathname)))return response;
 const headers=new Headers(response.headers);
 const text=patchRobloxText(await response.text());
 headers.delete('content-length');
 headers.delete('content-encoding');
 headers.set('cache-control','no-cache');
 const csp=headers.get('content-security-policy');
 if(csp)headers.set('content-security-policy',patchRobloxText(csp));
 return new Response(text,{status:response.status,statusText:response.statusText,headers});
}

export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/relay'||path.startsWith('/relay/'))return handleRelay(request,env);
 // Roblox's source files live in the retained game manifest, so rewrite them
 // before the migration router resolves the static asset.
 if(path.startsWith(ROBLOX_PREFIX))return serveRoblox(request,env);
 const result=await migrationRouter(request,env);
 if(result)return result;
 return env.ASSETS.fetch(request);
}};

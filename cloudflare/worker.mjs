import {migrationRouter} from './lib/migration-router.mjs';
import {handleRelay} from './lib/relay.mjs';
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/relay'||path.startsWith('/relay/'))return handleRelay(request);
 const result=await migrationRouter(request,env);
 return result || env.ASSETS.fetch(request);
}};

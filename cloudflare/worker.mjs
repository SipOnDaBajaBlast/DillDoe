import {migrationRouter} from './lib/migration-router.mjs';
export default {async fetch(request,env){
 const result=await migrationRouter(request,env);
 return result || env.ASSETS.fetch(request);
}};

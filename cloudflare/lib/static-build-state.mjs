import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

export const BASELINE_PATH='/__migration/static-build.json';
export const STATIC_INPUTS=['package-lock.json','static-games.mjs','lib/game-catalog.json','lib/game-assets.json','lib/game-text.mjs','lib/migration-paths.mjs','lib/gta-static-data.json','lib/gta-static-routing.mjs','lib/static-plan.mjs','lib/feed-pit-loader.mjs','lib/death-note-loader.mjs','public/ports/dumbfire/Build/data-parts.txt'];
export async function staticFingerprint(){
 const hash=createHash('sha256');
 for(const file of STATIC_INPUTS)hash.update(file+'\0').update((await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n')).update('\0');
 return hash.digest('hex');
}
export function validateBaseline(value,fingerprint){
 if(value?.schema!==1||value.fingerprint!==fingerprint||!value.gameManifest||!value.report?.games||typeof value.staticHeaders!=='string'||typeof value.redirects!=='string')throw new Error('Static game baseline is unavailable or outdated');
 const entries=Object.entries(value.gameManifest);
 if(!entries.length||entries.length>20000)throw new Error('Invalid static game file inventory');
 for(const [file,hash]of entries)if(!file.startsWith('/ports/')||file.includes('\\')||file.split('/').includes('..')||! /^[a-f0-9]{32}$/.test(hash))throw new Error('Invalid static game inventory entry');
 return value;
}
export function mergeManifest(baseline,website){
 const manifest={...baseline.gameManifest,...website};
 if(Object.keys(manifest).length>20000)throw new Error('Cloudflare static file limit exceeded');
 return manifest;
}
export async function createBaseline(manifest,output='dist',overflow='dist-games'){
 return {schema:1,fingerprint:await staticFingerprint(),gameManifest:Object.fromEntries(Object.entries(manifest).filter(([file])=>file.startsWith('/ports/'))),report:JSON.parse(await fs.readFile(output+'/static-game-report.json','utf8')),staticHeaders:await fs.readFile(overflow+'/_headers','utf8'),redirects:await fs.readFile(output+'/_redirects','utf8')};
}
export function deploymentForm(manifest,files,commit){
 const form=new FormData();
 form.set('manifest',JSON.stringify(manifest));form.set('branch','main');
 if(commit)form.set('commit_hash',commit);
 form.set('commit_dirty','false');
 for(const name of ['_headers','_redirects','_routes.json','_worker.js'])if(files[name])form.set(name,new File([files[name]],name,{type:name==='_worker.js'?'application/javascript+module':'text/plain'}));
 return form;
}

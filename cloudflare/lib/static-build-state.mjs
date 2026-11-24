import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const BASELINE_PATH='/__migration/static-build.json';
// Non-runtime documentation, source symbols, and build notes. Pages counts
// every one of these against the 20,000-file deployment limit, so keep the
// playable files and drop the packaging clutter.
export const retiredAssetPaths=new Set([
 '/ports/class-of-09/index.html.symbols',
 '/ports/class-of-09/renpy.wasm.map',
 '/ports/class-of-09-the-flip-side/index.html.symbols',
 '/ports/daybreak-web/index.html.symbols',
 '/ports/ddkk-vercel-split/runtime-notes.md',
 '/ports/fearme-web/README-DEPLOY.txt',
 '/ports/fearme-web/index.html.symbols',
 '/ports/fnfgame/CHANGELOG.md',
 '/ports/fnfgame/do NOT readme.txt',
 '/ports/fnfgame/assets/fonts/fonts-go-here.txt',
 '/ports/fnfgame/assets/tutorial/tutorial_stuff_here.txt',
 '/ports/fnfgame/assets/videos/videos/encoding_info.txt',
 '/ports/fnfgame/assets/videos/videos/subtitle_info.txt',
 '/ports/gta5-webport-vercel/robots.txt',
 '/ports/smg-webport/README.md',
 '/ports/sms-siteisoinclude/sms-game.js.symbols',
 '/ports/sms-siteisoinclude/sms.js.symbols',
 '/ports/undertale/change.txt',
 '/ports/undertale/error.txt',
 // Licences and readmes are not loaded by any game. Keep the deployable file
 // count below Pages' limit as new games are added.
 '/ports/class-of-09-the-flip-side/LICENSE',
 '/ports/class-of-09-the-flip-side/index.html.symbols',
 '/ports/ddkk-vercel-split/ENGINE-LICENSE.txt',
 '/ports/ddkk-vercel-split/ORIGINAL-ENGINE-LICENSE.txt',
 '/ports/ddkk-vercel-split/ORIGINAL-LICENSES.txt',
 '/ports/ddkk-vercel-split/SCREENPACK-LICENSE.txt',
 '/ports/fnfgame/LICENSE.md',
 '/ports/halo-mobile/fonts/README.md',
 '/ports/smg-webport/README.md',
 '/ports/tf2-web/LICENSE',
 // Attribution files for engines and fonts. No game fetches these at runtime;
 // retiring them keeps room under the 20,000-file deployment limit.
 '/ports/kisakcodfork1/LICENSE.txt',
 '/ports/ruffle/LICENSE_APACHE',
 '/ports/ruffle/LICENSE_MIT',
 '/ports/smm2/LICENSE-LASRecomp.txt',
 '/ports/smm2/LICENSE.txt',
 '/ports/smm2/THIRD-PARTY.txt',
 '/ports/smo-webport/LICENSE.txt',
 '/ports/smo-webport/NOTICE.txt',
 '/ports/smo-webport/OFL-Hind.txt',
 '/ports/trombone-champ/LICENSE',
 '/ports/granule/LICENSES/Pixeloid-OFL.txt',
 '/ports/granule/LICENSES/Tiny5-OFL.txt',
 '/ports/granule/LICENSES/rapier2d.txt',
 '/ports/ddkk-vercel-split/version.txt',
 '/ports/fnfgame/assets/fonts/OFL.txt',
 '/ports/poppyplaytime/Build/bb1.config.txt',
]);
export const isRetiredAsset=file=>retiredAssetPaths.has(file);
export const STATIC_INPUTS=['package-lock.json','static-games.mjs','lib/game-catalog.json','lib/game-assets.json','lib/game-text.mjs','lib/migration-paths.mjs','lib/gta-static-data.json','lib/gta-static-routing.mjs','lib/static-plan.mjs','lib/feed-pit-loader.mjs','lib/death-note-loader.mjs','lib/worldfox-loader.mjs','public/ports/dumbfire/Build/data-parts.txt'];
export async function staticFingerprint(){
 const hash=createHash('sha256');
 for(const file of STATIC_INPUTS)hash.update(file+'\0').update((await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n')).update('\0');
 async function addExtraPorts(directory,relative=''){
  for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const rel=path.posix.join(relative,entry.name),filename=path.join(directory,entry.name);
   if(entry.isSymbolicLink())throw new Error('Extra game port contains a symbolic link: '+filename);
   if(entry.isDirectory())await addExtraPorts(filename,rel);
   else if(entry.isFile())hash.update(rel+'\0').update(await fs.readFile(filename)).update('\0');
  }
 }
 const extraPorts=path.resolve('extra-game-ports');
 if(await fs.stat(extraPorts).catch(()=>null))await addExtraPorts(extraPorts);
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
 const retained=Object.fromEntries(Object.entries(baseline.gameManifest).filter(([file])=>!isRetiredAsset(file)));
 const manifest={...retained,...website};
 const manifestSize=Object.keys(manifest).length;
 if(manifestSize>20000)throw new Error('Cloudflare static file limit exceeded: '+manifestSize+' files ('+Object.keys(retained).length+' retained, '+Object.keys(website).length+' website)');
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

import fs from 'node:fs/promises';
import {BASELINE_PATH,staticFingerprint,validateBaseline} from './lib/static-build-state.mjs';

const fingerprint=await staticFingerprint();
let baseline;
if(process.env.REBUILD_GAMES!=='true'){
 try{const response=await fetch('https://dilldoe-games.pages.dev'+BASELINE_PATH+'?fingerprint='+fingerprint,{signal:AbortSignal.timeout(15000),cache:'no-store'});if(response.ok)baseline=validateBaseline(await response.json(),fingerprint);}catch{}
 if(!baseline)try{baseline=validateBaseline(JSON.parse(await fs.readFile('lib/static-build-bootstrap.json','utf8')),fingerprint);}catch{}
 if(baseline&&process.env.CLOUDFLARE_API_TOKEN){
  const account=process.env.CLOUDFLARE_ACCOUNT_ID;
  const headers={Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN};
  const token=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/pages/projects/dilldoe-games/upload-token',{headers,signal:AbortSignal.timeout(30000)});
  const result=await token.json();
  if(!token.ok||!result.success)throw new Error('Cannot check existing Cloudflare game assets');
  const hashes=[...new Set(Object.values(baseline.gameManifest))];
  for(let start=0;start<hashes.length;start+=5000){
   const response=await fetch('https://api.cloudflare.com/client/v4/pages/assets/check-missing',{method:'POST',headers:{Authorization:'Bearer '+result.result.jwt,'Content-Type':'application/json'},body:JSON.stringify({hashes:hashes.slice(start,start+5000)}),signal:AbortSignal.timeout(30000)});
   const checked=await response.json();
   if(!response.ok||!checked.success)throw new Error('Cannot verify retained Cloudflare game assets');
   if(checked.result.length){console.log('Some game files need restoring; selecting the full game build.');baseline=undefined;break;}
  }
 }
}
await fs.mkdir('.static-build',{recursive:true});
if(baseline)await fs.writeFile('.static-build/baseline.json',JSON.stringify(baseline));
else await fs.rm('.static-build/baseline.json',{force:true});
const mode=baseline?'fast':'full';
await fs.writeFile('.static-build/plan.json',JSON.stringify({mode,fingerprint}));
if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,'mode='+mode+'\n');
console.log(mode==='fast'?'Fast website update: reuse '+Object.keys(baseline.gameManifest).length+' uploaded game files.':'Full game-file build: sources changed, recovery requested, or no matching baseline.');

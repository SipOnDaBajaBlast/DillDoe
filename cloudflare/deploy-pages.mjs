import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {BASELINE_PATH,staticFingerprint,validateBaseline,createBaseline,mergeManifest,deploymentForm} from './lib/static-build-state.mjs';

const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw new Error('Existing Cloudflare deployment credentials are required');
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/pages/projects/dilldoe-games';
const authorization={Authorization:'Bearer '+token};
const tokenResponse=await fetch(base+'/upload-token',{headers:authorization,signal:AbortSignal.timeout(30000)});
const tokenResult=await tokenResponse.json();
if(!tokenResponse.ok||!tokenResult.success)throw new Error('Cloudflare upload authorization failed');
const jwt=tokenResult.result.jwt;
async function upload(directory,manifestPath){
 const child=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','pages','project','upload',directory,'--output-manifest-path',manifestPath],{stdio:'inherit',env:{...process.env,CF_PAGES_UPLOAD_JWT:jwt,WRANGLER_SEND_METRICS:'false'}});
 if(child.error||child.status!==0)throw new Error('Cloudflare file upload failed');
 return JSON.parse(await fs.readFile(manifestPath,'utf8'));
}
const plan=JSON.parse(await fs.readFile('.static-build/plan.json','utf8'));
const fingerprint=await staticFingerprint();
if(plan.fingerprint!==fingerprint)throw new Error('Game sources changed after deployment planning');
let baseline;
if(plan.mode==='fast'){
 baseline=validateBaseline(JSON.parse(await fs.readFile('.static-build/baseline.json','utf8')),fingerprint);
 await fs.mkdir(path.dirname('dist'+BASELINE_PATH),{recursive:true});
 await fs.writeFile('dist'+BASELINE_PATH,JSON.stringify(baseline));
}
let manifest=await upload('dist','.static-build/website-manifest.json');
if(plan.mode==='full'){
 baseline=validateBaseline(await createBaseline(manifest),fingerprint);
 const directory='.static-build/baseline-upload';
 await fs.mkdir(directory+path.dirname(BASELINE_PATH),{recursive:true});
 await fs.writeFile(directory+BASELINE_PATH,JSON.stringify(baseline));
 manifest={...manifest,...await upload(directory,'.static-build/baseline-manifest.json')};
}else manifest=mergeManifest(baseline,manifest);
if(Object.keys(manifest).length>20000)throw new Error('Cloudflare static file limit exceeded');
const files=Object.fromEntries(await Promise.all(['_headers','_redirects','_routes.json','_worker.js'].map(async name=>[name,await fs.readFile('dist/'+name)])));
// Cloudflare's documented Direct Upload API preserves unchanged content hashes.
// The single bundled ESM Worker is submitted with its documented _worker.js field.
const response=await fetch(base+'/deployments',{method:'POST',headers:authorization,body:deploymentForm(manifest,files,process.env.GITHUB_SHA),signal:AbortSignal.timeout(120000)});
const result=await response.json();
if(!response.ok||!result.success)throw new Error('Cloudflare deployment failed: '+JSON.stringify(result.errors));
console.log('Website deployment submitted: '+result.result.url+' ('+plan.mode+' update; '+Object.keys(baseline.gameManifest).length+' game files retained).');

import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildGamePages} from '../vercel/game-pages.mjs';
import {buildStaticGames} from './static-games.mjs';
import {installGameDownloadGuard} from './lib/migration-paths.mjs';
import {finalizeBuild} from './finalize-build.mjs';
import {staticFingerprint,validateBaseline} from './lib/static-build-state.mjs';
const project=process.cwd(),output=path.join(project,'dist');
if(path.resolve(output)!==path.resolve(project,'dist')||path.dirname(output)!==project)throw new Error('Unsafe build directory');
await fs.rm(output,{recursive:true,force:true});
await fs.mkdir(output,{recursive:true});
await fs.cp(path.join(project,'public'),output,{recursive:true});
const catalog=JSON.parse(await fs.readFile('lib/game-catalog.json','utf8'));
const hosts=JSON.parse(await fs.readFile('lib/embed-hosts.json','utf8'));
const rewrite=text=>text.replace(/https?:\/\/([a-z0-9.-]+\.vercel\.app)\/*/gi,(whole,host)=>catalog.games[hosts[host]]?'/ports/'+hosts[host]+'/':whole).replace(/(["'])\/halo-mobile\//g,'$1/ports/halo-mobile/');
const repository=path.resolve(project,'..');
if(await fs.stat(path.join(repository,'games.html')).catch(()=>null)){
 const tracked=execFileSync('git',['ls-files','-z'],{cwd:repository,encoding:'utf8'}).split('\0').filter(Boolean);
 // Read the editable website from the repository root on every build.
 const siteFiles=tracked.filter(file=>!file.split('/').some(part=>part.startsWith('.'))&&!file.startsWith('cloudflare/')&&!/^(README[^/]*|vercel\.json)$/.test(file)&&!file.endsWith('.test.mjs')&&(file==='ads.txt'||/\.(html|css|m?js|json|svg|png|jpe?g|webp|gif|ico|swf|woff2?|ttf|mp[34]|ogg|wav|webm|glb|gltf|bin|wasm|txt)$/i.test(file)));
 for(const file of catalog.main){
  if(siteFiles.includes(file))continue;
  const target=path.resolve(output,file);if(!target.startsWith(output+path.sep))throw new Error('Unsafe website path');
  await fs.unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});
 }
 for(const file of siteFiles){
  const target=path.join(output,file);await fs.mkdir(path.dirname(target),{recursive:true});
  if(file.endsWith('.html')){
   let text=rewrite(await fs.readFile(path.join(repository,file),'utf8'));
   if(file.startsWith('games/'))text=text.replace(/<head\b[^>]*>/i,head=>head+'<script src="/assets/game-download-guard.js?v=1"></script>');
   if(text.includes('/ports/')){
    if(!catalog.mainIsolation.includes(file))catalog.mainIsolation.push(file);
    text=text.replace(/<iframe\b([^>]*)>/gi,(whole,attrs)=>/\ballow=/.test(attrs)?whole:'<iframe'+attrs+' allow="cross-origin-isolated; fullscreen; autoplay; gamepad" allowfullscreen>');
   }
   await fs.writeFile(target,text);
  }else await fs.copyFile(path.join(repository,file),target);
 }
}
await buildGamePages(output);
await fs.mkdir(path.join(output,'assets'),{recursive:true});
await fs.writeFile(path.join(output,'assets','game-download-guard.js'),'('+installGameDownloadGuard.toString()+')();');
const baseline=process.env.FAST_WEBSITE_BUILD==='1'?validateBaseline(JSON.parse(await fs.readFile('.static-build/baseline.json','utf8')),await staticFingerprint()):null;
let staticGames;
if(baseline){
 await fs.writeFile(path.join(output,'static-game-report.json'),JSON.stringify(baseline.report,null,2));
 await fs.writeFile(path.join(output,'_redirects'),baseline.redirects);
 staticGames={staticFiles:baseline.report.staticFiles};
 console.log('Reusing '+Object.keys(baseline.gameManifest).length+' existing game assets; no game downloads or rebuild.');
}else staticGames=await buildStaticGames(output,catalog);
await fs.mkdir(path.join(output,'__migration'),{recursive:true});
await fs.writeFile(path.join(output,'__migration','health'),JSON.stringify({site:'DillDoe',games:Object.keys(catalog.games),missingSources:catalog.missingSources,staticFiles:staticGames.staticFiles}));
await finalizeBuild(output,catalog,{baseline});


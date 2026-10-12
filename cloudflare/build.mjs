import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {buildGamePages} from '../vercel/game-pages.mjs';
const {build}=createRequire(import.meta.url)('esbuild');
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
   if(text.includes('/ports/')){
    if(!catalog.mainIsolation.includes(file))catalog.mainIsolation.push(file);
    text=text.replace(/<iframe\b([^>]*)>/gi,(whole,attrs)=>/\ballow=/.test(attrs)?whole:'<iframe'+attrs+' allow="cross-origin-isolated; fullscreen; autoplay; gamepad" allowfullscreen>');
   }
   await fs.writeFile(target,text);
  }else await fs.copyFile(path.join(repository,file),target);
 }
}
await buildGamePages(output);
await fs.writeFile(path.join(output,'website-version.json'),JSON.stringify({commit:process.env.GITHUB_SHA||null,builtAt:new Date().toISOString()}));
await build({entryPoints:['worker.mjs'],outfile:path.join(output,'_worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await fs.writeFile(path.join(output,'_routes.json'),JSON.stringify({version:1,include:['/ports/*','/__migration/*','/halo-mobile/*'],exclude:[]},null,2));
let headers='/*\n  X-Content-Type-Options: nosniff\n';
for(const file of catalog.mainIsolation)for(const route of ['/'+file,'/'+file.replace(/\.html$/,'')])headers+=`\n${route}\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: same-origin\n`;
await fs.writeFile(path.join(output,'_headers'),headers);
async function inspect(directory){for(const file of await fs.readdir(directory,{withFileTypes:true})){const filename=path.join(directory,file.name);if(file.isDirectory())await inspect(filename);else if((await fs.stat(filename)).size>25*1024*1024)throw new Error('Cloudflare asset limit exceeded: '+filename);}}
await inspect(output);
console.log('Cloudflare Pages build ready: '+Object.keys(catalog.games).length+' game ports.');


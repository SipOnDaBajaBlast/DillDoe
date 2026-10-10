const origin='https://dilldoe-games.pages.dev';
const expected=process.env.GITHUB_SHA;
if(!expected)throw new Error('Expected website commit is missing');
let published=false;
for(let attempt=0;attempt<12;attempt++){
 try{
  const response=await fetch(origin+'/website-version.json?commit='+expected+'&attempt='+attempt,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.ok&&response.headers.get('content-type')?.includes('application/json')&&(await response.json()).commit===expected){published=true;break;}
  await response.body?.cancel().catch(()=>{});
 }catch(error){console.log('Waiting for the production website to update: '+error.message);}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!published)throw new Error('The live website has not published this commit');
const health=await fetch(origin+'/__migration/health',{signal:AbortSignal.timeout(15000)});
if(!health.ok)throw new Error('The game server check failed');
const data=await health.json();
if(data.missingSources.length)throw new Error('Some migrated game sources are missing');
console.log('Live website updated to '+expected+'; '+data.games.length+' game launchers configured.');

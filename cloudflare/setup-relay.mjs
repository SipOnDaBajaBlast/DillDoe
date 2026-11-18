const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw new Error('Cloudflare deployment credentials are required');

const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const api='https://api.cloudflare.com/client/v4/accounts/'+account;

async function get(path){
  const response=await fetch(api+path,{headers,signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  if(!response.ok||!result.success)throw new Error('Cloudflare API request failed: '+path);
  return result.result;
}

async function patch(path,body){
  const response=await fetch(api+path,{method:'PATCH',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  if(!response.ok||!result.success)throw new Error('Cloudflare API update failed: '+path);
  return result.result;
}

const namespaces=await get('/workers/durable_objects/namespaces?per_page=1000');
const relay=namespaces.find(item=>item.script==='dilldoe-roblox-relay'&&item.class==='RelayRoom');
if(!relay?.id)throw new Error('Relay Durable Object namespace was not found after deployment');

const project=await get('/pages/projects/dilldoe-games');
const configs=project.deployment_configs||{};
const production=configs.production||{};
const preview=configs.preview||{};
const binding={RELAY_ROOM:{namespace_id:relay.id}};
const nextProduction={...production,durable_object_namespaces:{...(production.durable_object_namespaces||{}),...binding}};
await patch('/pages/projects/dilldoe-games',{deployment_configs:{preview,production:nextProduction}});
console.log('Attached RELAY_ROOM to the Pages production configuration.');

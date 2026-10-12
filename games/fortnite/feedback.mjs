// Combine shotgun pellets into one readable total for each victim and damage type.
export function groupDamage(events){const groups=new Map();for(const e of events){if(e.type!=='damageDealt'||e.amount<=0)continue;const key=e.id+':'+e.shield;const prior=groups.get(key);if(prior)prior.amount+=e.amount;else groups.set(key,{...e});}return [...groups.values()];}

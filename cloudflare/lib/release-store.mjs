export function parseByteRange(value, size) {
  if (value === null) return [0, size - 1];
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new Error('Invalid range');
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('Invalid suffix');
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new Error('Invalid range');
  return [start, end];
}

export function createReleaseStore(release, packs, fetcher = fetch) {
  if (!/^https:\/\/github\.com\/MagiczLunchly\/[^/]+\/releases\/download\/[^/]+\/$/.test(release)) throw new Error('Unexpected release');
  const redirects = new Map();
  async function location(pack) {
    const cached = redirects.get(pack.name);
    if (cached && cached.expires > Date.now()) return cached.promise;
    const promise = (async () => {
      const response = await fetcher(release + encodeURIComponent(pack.name), {redirect:'manual',headers:{Range:'bytes=0-0'}});
      const target = response.headers.get('Location');
      await response.body?.cancel();
      if (![301,302,303,307,308].includes(response.status) || !target || new URL(target).origin !== 'https://release-assets.githubusercontent.com') throw new Error('Game download unavailable');
      return target;
    })();
    redirects.set(pack.name, {promise,expires:Date.now()+240000});
    try { return await promise; } catch(e) { redirects.delete(pack.name);throw e; }
  }
  return async function read(record, start, end, signal) {
    const [number, offset, size] = record, pack = packs[number];
    if (!pack || start < 0 || end >= size || end < start) throw new Error('Invalid stored range');
    for (let attempt=0;attempt<2;attempt++) {
      const response=await fetcher(await location(pack),{headers:{Range:`bytes=${offset+start}-${offset+end}`,'Accept-Encoding':'identity'},signal});
      if(response.status===206 && response.headers.get('Content-Range')===`bytes ${offset+start}-${offset+end}/${pack.size}` && response.body) return response.body;
      await response.body?.cancel();redirects.delete(pack.name);
    }
    throw new Error('Game download range unavailable');
  };
}

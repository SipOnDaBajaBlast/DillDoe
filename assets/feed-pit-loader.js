async function startFeedThePit(engine, config, options, parts, fetchPart = fetch) {
  const packSize = parts.reduce((sum, part) => sum + part.size, 0);
  if (packSize !== config.fileSizes['feedthepit.pck']) throw new Error('Invalid game download manifest.');
  let pack = new Uint8Array(packSize), offset = 0, next = 0;
  const progress = parts.map(() => 0);
  const jobs = parts.map(part => { const job = {...part, offset}; offset += part.size; return job; });
  const controllers = new Set();
  let stopped = false;
  const report = () => options.onProgress?.(progress.reduce((a, b) => a + b, 0), packSize);
  async function worker() {
    while (!stopped && next < jobs.length) {
      const index = next++, job = jobs[index];
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        controllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), 90000);
        let reader;
        try {
          progress[index] = 0;
          const response = await fetchPart(job.path + '?download=parts-v2', {signal: controller.signal});
          if (!response.ok || !response.body) throw new Error('Game download unavailable');
          reader = response.body.getReader();
          let received = 0;
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            if (received + chunk.value.length > job.size) throw new Error('Oversized game download');
            pack.set(chunk.value, job.offset + received);
            received += chunk.value.length;
            progress[index] = received;
            report();
          }
          if (received !== job.size) throw new Error('Incomplete game download');
          break;
        } catch (error) {
          await reader?.cancel().catch(() => {});
          if (stopped || attempt === 2) throw new Error('The game download was interrupted. Please retry.');
        } finally {
          clearTimeout(timeout);
          controllers.delete(controller);
        }
      }
    }
  }
  try {
    await Promise.all([worker(), worker()]);
    if (new DataView(pack.buffer).getUint32(0, true) !== 0x43504447) throw new Error('Invalid game data. Please retry.');
    const progressBar = typeof document === 'undefined' ? null : document.getElementById('status-progress');
    if (progressBar) progressBar.removeAttribute('value');
    await engine.init(config.executable);
    // Godot indexes fileSizes by this argument; a large typed array would be
    // coerced to an enormous string. ArrayBuffer avoids that conversion.
    await engine.preloadFile(pack.buffer, 'feedthepit.pck');
    pack = null;
    return await engine.start({args: ['--main-pack', 'feedthepit.pck', ...config.args]});
  } catch (error) {
    stopped = true;
    for (const controller of controllers) controller.abort();
    throw error;
  }
}

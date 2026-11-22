/* The Page stays small; all large game objects resolve to the R2-backed route. This file is served
   cross-origin (scripts only), but game.js is served from the site itself: the runtime's pthread
   workers are created from its own script URL, and worker scripts have to be same-origin. */
(() => {
  "use strict";

  const status = document.getElementById("status");
  const canvas = document.getElementById("canvas");
  const asset = path => `https://rocket-league-dhl.pages.dev/assets/${path}`;
  const query = new URLSearchParams(location.search);

  // on-demand shader cache (default; ?sclazy=0 for the normal one): RefShaderCache with every shader stubbed and the
  // code in RefShaderCode.bin, read by the runtime when a shader is made (scripts/shader-store.py, d3d11.c
  // shader_real_code). The package, the store and the index that lists them come from data-sclazy/; the shaders a menu
  // and a match use are first in the store and put in the browser's cache as soon as the file index is in
  const SCLAZY = { cache: 10531, store: 21128, hotBytes: 50954544 };
  const LAZY_SHADERS = query.get("sclazy") !== "0";
  if (LAZY_SHADERS) {
    const realFetch = window.fetch.bind(window);
    const re = new RegExp(String.raw`https://rocket-league-dhl\.pages\.dev/assets/data/(index\.txt|(?:${SCLAZY.cache}|${SCLAZY.store})(?:\.\d+)?)$`);
    const swap = u => u.replace(re, "https://rocket-league-dhl.pages.dev/assets/data-sclazy/$1");
    window.fetch = (input, init) => {
      if (typeof input === "string") return realFetch(swap(input), init);
      if (input instanceof Request) { const u = swap(input.url); if (u !== input.url) return realFetch(new Request(u, input), init); }
      return realFetch(input, init);
    };
    const prefetch = setInterval(() => {
      const F = window.Module && Module.uewFiles;
      if (!F || !F.files || !F.files.length) return;
      clearInterval(prefetch);
      const f = F.lookup("/game/TAGame/CookedPCConsole/RefShaderCode.bin");
      if (!f || f.dir) return console.warn("[sclazy] RefShaderCode.bin is not in the index");
      // into the browser's cache (cache-sw.js), not the game's small block cache: blocks put there ahead of time
      // pushed out the ones the game was waiting for
      F.warm(f.id, 0, Math.ceil(SCLAZY.hotBytes / 1048576) - 1);
      console.log(`[sclazy] on-demand shader cache; warming ${(SCLAZY.hotBytes / 1048576).toFixed(1)} MB of shader code`);
    }, 50);
  }
  const requested = query.get("res") || "native";
  let width = 0;
  let height = 0;
  if (requested === "native") {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    width = (innerWidth || screen.availWidth || 1280) * dpr;
    height = (innerHeight || screen.availHeight || 720) * dpr;
    const scale = Math.min(1, 3840 / width, 2160 / height);
    width = Math.round(width * scale) & ~7;
    height = Math.round(height * scale) & ~7;
  } else {
    const match = /^(\d{3,5})x(\d{3,5})$/.exec(requested);
    if (match) { width = +match[1]; height = +match[2]; }
  }
  if (width >= 320 && height >= 200) {
    canvas.width = width;
    canvas.height = height;
    canvas.style.aspectRatio = `${width} / ${height}`;
  }

  // gzip-compressed code parts (327 MB of code, ThinLTO -O3 build, is ~61 MB on the wire); each part is decompressed as it arrives
  // c4 is the cooperative-thread build the single-file distribution uses; the v19 parts stop after runtime init
  const wasmParts = Array.from({ length: 14 }, (_, index) => `game.wasm.${index}.c4.gz`);
  window.Module = {
    canvas,
    arguments: [
      "--image", "/image.bin",
      "--root", "/game",
      "--save", "/save/RocketLeague",
      "--exe", "Binaries/Win64/RocketLeague.exe",
      `-ResX=${width || 1280}`,
      `-ResY=${height || 720}`,
      ...query.getAll("arg"),
    ],
    // Used by the game's on-demand virtual file system in game.js.
    uewDataUrl: asset("data/"),
    uewSave: "/save/RocketLeague",
    uewSeed: {},
    uewAsyncShaders: true,
    uewDebugPanel: true,
    uewNetPlaceholders: false,
    // decompressed file blocks kept in the tab. 96 MB was tried (160 MB less RAM) but is smaller than what a match
    // reads: texture streaming and shader creation kept losing blocks and reading them again (2.7 GB of 3.4 GB read in
    // one match was a re-read), and each re-read held up a frame
    uewCacheMB: 256,
    // guest memory the runtime reserves (all of it is wasm memory from the start, and the browser counts all of it as
    // the tab's memory): with the on-demand shader cache the game peaked at 1.92 GB over matches on four arenas
    // (Mannfield, Beckwith Park 3v3, a neon city arena, Vent in Bullet Ball), so 2.5 GB leaves ~640 MB to spare; the
    // normal cache needs the build's full 7 GB. ?guestmb=N overrides (2304 at least)
    uewGuestMB: LAZY_SHADERS ? 2560 : 0,
    uewGpuMB: 512,
    print: message => console.log(message),
    printErr: message => console.log(message),
    setStatus: message => { if (message) status.textContent = message; },
    onRuntimeInitialized: () => { status.textContent = ""; },
  };

  // The generated loader asks for game.wasm; this supplies the split binary from R2.
  Module.instantiateWasm = (imports, done) => {
    // The parts download side by side, but only the part being compiled is decompressed: the others wait as gzip
    // (about 5 MB each) instead of as ~24 MB of decompressed code, so loading holds ~60 MB here rather than ~300 MB.
    // The compile pulls the stream, so nothing is decompressed faster than it is taken. Progress counts the
    // compressed bytes received across all parts.
    let received = 0, expected = 0;
    const mb = n => Math.round(n / 1048576);
    const show = () => {
      status.textContent = expected ? `Loading code ${mb(received)} / ${mb(expected)} MB` : `Loading code ${mb(received)} MB`;
    };
    const parts = wasmParts.map(name => {
      const part = { chunks: [], done: false, error: null, wake: null };
      const notify = () => { const wake = part.wake; part.wake = null; if (wake) wake(); };
      // a connection that fails before any bytes arrive is retried (nothing of the part has been handed on yet)
      const get = async attempt => {
        try {
          const response = await fetch(asset(name));
          if (response.ok || attempt >= 3 || response.status < 500) return response;
        } catch (error) {
          if (attempt >= 3) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 500 << attempt));
        return get(attempt + 1);
      };
      get(0).then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${name}`);
        expected += Number(response.headers.get("Content-Length")) || 0;
        const reader = response.body.getReader();
        for (;;) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          received += value.length;
          show();
          part.chunks.push(value);
          notify();
        }
      }).catch(error => { part.error = error; }).finally(() => { part.done = true; notify(); });
      return part;
    });
    // one part's compressed bytes in order, handed over (and dropped here) as the decompressor asks for them
    const compressed = part => new ReadableStream({
      async pull(controller) {
        for (;;) {
          if (part.chunks.length) { controller.enqueue(part.chunks.shift()); return; }
          if (part.error) throw part.error;
          if (part.done) { controller.close(); return; }
          await new Promise(resolve => { part.wake = resolve; });
        }
      },
    }, { highWaterMark: 0 });
    let index = 0, current = null;
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          for (;;) {
            if (!current) {
              if (index >= parts.length) {
                status.textContent = "Compiling...";
                controller.close();
                return;
              }
              current = compressed(parts[index++]).pipeThrough(new DecompressionStream("gzip")).getReader();
            }
            const { done: finished, value } = await current.read();
            if (!finished) { controller.enqueue(value); return; }
            current = null;
          }
        } catch (error) {
          controller.error(error);
        }
      },
    }, { highWaterMark: 0 });
    WebAssembly.instantiateStreaming(
      new Response(stream, { headers: { "Content-Type": "application/wasm" } }),
      imports,
    ).then(result => done(result.instance, result.module)).catch(error => {
      status.textContent = `Failed to load: ${error.message}`;
      console.error(error);
    });
    return {};
  };

  // Show every item in the garage. At startup ProductDatabase_TA::UpdateAvailableProducts (native) drops ~1,000 items
  // (49 bodies, 167 wheels, 400 decals, goal explosions...) because Psyonix's FilterContent feature is on: with it on,
  // an item is only kept if the content filter that PsyNet sends lists it, and offline that never arrives. The feature
  // set is compiled into the game, so the flag is cleared here, in the FeatureSystem object, as soon as it exists
  // (about 1 s in; the product list is built about 20 s in). Everything is checked against this build first (the guest
  // image, the global's class name, the property's offset and bit) and nothing is touched if any of it differs.
  const disableFilterContent = () => {
    const IMAGE = 0x400000, FEATURES = 0x27d20c8, NAMES = 0x28f1f18, OBJECTS = 0x28f1f60;
    let base = -1, tries = 0, searched = false;
    const timer = setInterval(() => {
      if (typeof wasmMemory === "undefined" || !wasmMemory) return;   // the game hasn't started yet
      if (++tries > 3000) { clearInterval(timer); return; }            // 60 s after it started
      const bytes = new Uint8Array(wasmMemory.buffer), view = new DataView(wasmMemory.buffer);
      const isImage = at => at >= 0 && at + IMAGE + 0x1008 < bytes.length && bytes[at + IMAGE] === 0x4d && bytes[at + IMAGE + 1] === 0x5a &&
        view.getUint32(at + IMAGE + 0x1000, true) === 0xf9488d4d && view.getUint32(at + IMAGE + 0x1004, true) === 0x49d18b4c;
      if (base < 0) {
        // where guest memory starts inside the wasm memory: the same place every run so far, searched once if not
        if (isImage(38431344)) base = 38431344;
        else if (!searched && tries > 100) {   // give the image 2 s to load before searching
          searched = true;
          for (let at = 0; at < Math.min(bytes.length, 1 << 30) - IMAGE; at += 16) if (isImage(at)) { base = at; break; }
        }
        if (base < 0) return;
      }
      const ptr = a => Number(view.getBigUint64(base + a, true));
      const names = ptr(NAMES), nameCount = view.getInt32(base + NAMES + 8, true);
      const name = obj => {
        const i = view.getInt32(base + obj + 0x48, true);
        const entry = i >= 0 && i < nameCount ? ptr(names + i * 8) : 0;
        let s = "";
        for (let k = 0; entry && k < 32; k++) { const ch = view.getUint16(base + entry + 0x18 + k * 2, true); if (!ch) break; s += String.fromCharCode(ch); }
        return s;
      };
      const features = ptr(FEATURES);
      if (!features || !names) return;
      const cls = ptr(features + 0x50), clsName = cls ? name(cls) : "";
      if (!clsName) return;   // not set up yet
      const stop = why => { clearInterval(timer); if (why) console.warn(`[items] ${why}; left as is`); };
      if (clsName !== "FeatureSystem") return stop("FeatureSystem isn't where this build keeps it");
      // the FilterContent property: a field of FeatureSystem at 0x6c, bit 0x1000
      const objects = ptr(OBJECTS), objectCount = view.getInt32(base + OBJECTS + 8, true);
      let prop = 0;
      for (let i = 0; i < objectCount && !prop; i++) {
        const o = ptr(objects + i * 8);
        if (o && ptr(o + 0x40) === cls && name(o) === "FilterContent") prop = o;
      }
      if (!prop) return;      // not registered yet
      if (view.getUint32(base + prop + 0x98, true) !== 0x6c || view.getUint32(base + prop + 0xc8, true) !== 0x1000)
        return stop("FilterContent property differs in this build");
      stop();
      const flags = view.getUint32(base + features + 0x6c, true);
      view.setUint32(base + features + 0x6c, flags & ~0x1000, true);
      console.log("[items] FilterContent feature off: every item is listed");
    }, 20);
  };
  disableFilterContent();

  const memory64 = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 4, 0]));
  if (!memory64) {
    status.textContent = "This game needs 64-bit WebAssembly memory (memory64): use a current Chrome, Edge, or Brave.";
  } else if (!self.crossOriginIsolated) {
    status.textContent = "This host must send cross-origin-isolation headers before real threads can run.";
  }
})();

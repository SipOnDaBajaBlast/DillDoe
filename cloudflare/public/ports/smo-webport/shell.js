// SwitchRecomp - Copyright 2026 MZ Labs. AGPL-3.0, see LICENSE.txt and NOTICE.txt.
// the page around the wasm build: checks the browser, imports the user's own game dump into the origin private file
// system (the runtime mounts it at /game), starts the module, feeds it keyboard/gamepad input through a struct in
// the shared linear memory, plays its audio ring with an AudioWorklet and shows the frames the GL thread sends.
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  let game = { title: 'Super Mario Odyssey', script: 'Super Mario Odyssey.js', gl: true };
  let running = false;

  // ------------------------------------------------------------------ cross-origin isolation (SharedArrayBuffer)
  // a server that sends COOP/COEP (serve.py) needs nothing; elsewhere coi-sw.js adds the headers and we reload once
  if (!window.crossOriginIsolated && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('coi-sw.js').then((r) => {
      if (!navigator.serviceWorker.controller && !sessionStorage.getItem('swr-coi-reload')) { sessionStorage.setItem('swr-coi-reload', '1'); location.reload(); }
    }).catch(() => {});
  }

  // ------------------------------------------------------------------ browser checks
  const MEM64 = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 4, 1]);   // (memory i64 1)
  function checks() {
    const r = [];
    const add = (ok, text, fix) => r.push({ ok, text: ok ? text : text + (fix ? ' — ' + fix : '') });
    add(window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined', 'Threads (SharedArrayBuffer)', 'serve the page with serve.py (COOP/COEP headers), or reload once');
    let m64 = false; try { m64 = WebAssembly.validate(MEM64); } catch (e) {}
    add(m64, '64-bit WebAssembly memory (memory64)', 'needs Chrome/Edge 133+ or Firefox 134+');
    add(!!(navigator.storage && navigator.storage.getDirectory), 'Private file storage (OPFS)');
    let gl = false, glinfo = '';
    try { const c = document.createElement('canvas').getContext('webgl2'); gl = !!c && !!c.getExtension('EXT_color_buffer_float');
      const d = c && c.getExtension('WEBGL_debug_renderer_info'); if (d) glinfo = ' (' + c.getParameter(d.UNMASKED_RENDERER_WEBGL) + ')'; } catch (e) {}
    add(gl, 'WebGL2 with float render targets' + glinfo, game.gl ? 'the game runs without graphics' : '');
    add(typeof AudioWorkletNode !== 'undefined', 'Audio (AudioWorklet)');
    const ul = $('checks'); ul.innerHTML = '';
    for (const c of r) { const li = document.createElement('li'); li.className = c.ok ? 'ok' : 'bad'; li.textContent = c.text; ul.appendChild(li); }
    return r[0].ok && r[1].ok && r[2].ok;
  }

  // ------------------------------------------------------------------ game data in OPFS
  const dataDir = () => game.title + '_data';
  async function opfs() { return navigator.storage.getDirectory(); }
  async function dirAt(root, parts, create) { let d = root; for (const p of parts) d = await d.getDirectoryHandle(p, { create }); return d; }
  async function exists(root, parts) { try { await dirAt(root, parts, false); return true; } catch (e) { return false; } }
  async function dataState() {
    try {
      const root = await opfs();
      const ok = await exists(root, [dataDir(), 'exefs']) && await exists(root, [dataDir(), 'romfs']);
      let marker = null; try { const f = await (await (await dirAt(root, [dataDir()], false)).getFileHandle('.imported')).getFile(); marker = JSON.parse(await f.text()); } catch (e) {}
      let est = ''; try { const e = await navigator.storage.estimate(); est = ' · storage used ' + (e.usage / 1073741824).toFixed(1) + ' GB of ' + (e.quota / 1073741824).toFixed(0) + ' GB'; } catch (e) {}
      $('datastate').textContent = ok && marker ? 'Imported: ' + marker.files + ' files, ' + (marker.bytes / 1073741824).toFixed(2) + ' GB' + est : 'Not imported yet' + est;
      dataMarker = ok ? marker : null;
      return ok && !!marker;
    } catch (e) { $('datastate').textContent = 'Private storage unavailable: ' + e.message; return false; }
  }
  let dataMarker = null;

  // ------------------------------------------------------------------ files split into parts (web/split_build.py)
  // hosts with a size cap per file (25 MB): split.json lists those files, name.000, name.001, ... are their parts in
  // order. sfetch gives one Response streaming the parts back to back; without split.json it's a plain fetch
  let SPLIT = null;
  async function splitMap() { if (SPLIT) return SPLIT;
    try { const r = await fetch('split.txt', { cache: 'no-cache' }); SPLIT = r.ok ? await r.json() : {}; } catch (e) { SPLIT = {}; } return SPLIT; }
  async function sfetch(url, type) {
    const m = await splitMap(), e = m[decodeURIComponent(url)];
    if (!e) return fetch(url);
    let i = 0, rd = null;
    const body = new ReadableStream({ async pull(c) {
      for (;;) {
        if (!rd) { if (i >= e.parts) { c.close(); return; }
          const r = await fetch(url + '.' + String(i++).padStart(3, '0')); if (!r.ok || !r.body) { c.error(new Error(url + ' part ' + (i - 1) + ': ' + r.status)); return; } rd = r.body.getReader(); }
        const x = await rd.read(); if (x.done) { rd = null; continue; } c.enqueue(x.value); return; } } });
    const h = { 'Content-Length': String(e.size) }; if (type) h['Content-Type'] = type;
    return new Response(body, { headers: h }); }

  // ------------------------------------------------------------------ start screen: one bar, then the play button
  // the bar: the game files setup (first visit, up to BAR_DATA) then the game module's download (the rest)
  const BAR_DATA = 0.85;
  let wasmBuf = null;   // the module's bytes when they came in parts
  function bar(f) { const b = $('bar'); b.classList.remove('busy'); $('barfill').style.width = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + '%'; }
  function ready() { $('bar').style.display = 'none'; $('importmsg').textContent = ''; $('start').style.display = 'block'; $('start').disabled = false; $('start').focus(); }
  // the module (.wasm, the big one) into the browser's cache now, so the play button starts right away
  async function prefetchModule(from) {
    const url = game.script.replace(/\.js$/, '.wasm');
    // split: coi-sw.js joins it into Cache Storage under its own URL, the fetch below goes through it. without a service
    // worker: joined here and handed to the module (instantiateWasm), slower (no compiled code kept between launches)
    if (Object.keys(await splitMap()).length && !(navigator.serviceWorker && navigator.serviceWorker.controller)) { wasmBuf = await (async () => {
      const r = await sfetch(url), total = +r.headers.get('content-length') || 0, out = new Uint8Array(total), rd = r.body.getReader(); let got = 0;
      for (;;) { const c = await rd.read(); if (c.done) break; out.set(c.value, got); got += c.value.length;
        bar(from + (1 - from) * got / (total || 1)); $('importmsg').textContent = 'Loading the game · ' + (got / 1048576).toFixed(0) + ' / ' + (total / 1048576).toFixed(0) + ' MB'; }
      return out; })(); bar(1); return; }
    try { const r = await fetch(url); if (!r.ok || !r.body) return;
      const total = +r.headers.get('content-length') || 0, rd = r.body.getReader(); let got = 0;
      for (;;) { const c = await rd.read(); if (c.done) break; got += c.value.length;
        if (total) { bar(from + (1 - from) * got / total); $('importmsg').textContent = 'Loading the game · ' + (got / 1048576).toFixed(0) + ' / ' + (total / 1048576).toFixed(0) + ' MB'; } }
    } catch (e) {}
    bar(1); }

  // ------------------------------------------------------------------ game data that came with the build
  // gamedata/manifest.json + game_NN.data (build_web.py's pack_data): the files back to back. copied into the private
  // storage on the first start, and again when the build brings other data. saves already there are kept
  async function packedManifest() {
    try { const r = await fetch('gamedata/manifest.txt', { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) {}
    return null;
  }
  async function importPacked(man) {
    const root = await opfs(); const base = await dirAt(root, [dataDir()], true);
    try { await navigator.storage.persist(); } catch (e) {}
    const total = man.parts.reduce((a, p) => a + p.size, 0);
    const estimate = await navigator.storage.estimate();
    if (estimate.quota && estimate.quota - (estimate.usage || 0) < total + 268435456)
      throw new Error('This browser allows only ' + ((estimate.quota - (estimate.usage || 0)) / 1073741824).toFixed(1) + ' GB of free site storage; the game needs at least ' + ((total + 268435456) / 1073741824).toFixed(1) + ' GB. Free disk space or use a browser profile with more storage.');
    let done = 0, n = 0; const prog = $('prog'); prog.style.display = ''; prog.max = total || 1; const t0 = performance.now();
    const show = () => { const s = (performance.now() - t0) / 1000; prog.value = done; bar(done / (total || 1) * BAR_DATA);
      $('importmsg').textContent = 'Setting up the game files (first time only) · ' + (done / 1073741824).toFixed(2) + ' / ' + (total / 1073741824).toFixed(2) + ' GB' +
        (s > 1 ? ' · ' + (done / 1048576 / s).toFixed(0) + ' MB/s' : ''); };
    for (let pi = 0; pi < man.parts.length; pi++) {
      const list = man.files.filter((f) => f[1] === pi).sort((a, b) => a[2] - b[2]);
      const res = await sfetch(man.parts[pi].url || 'gamedata/' + man.parts[pi].name);
      if (!res.ok || !res.body) throw new Error('gamedata/' + man.parts[pi].name + ': ' + res.status);
      const rd = res.body.getReader(); let buf = null, bo = 0, pos = 0;
      const take = async (len, sink) => {   // the next len bytes of the part, to sink (or skipped)
        while (len > 0) {
          if (!buf || bo >= buf.length) { const r = await rd.read(); if (r.done) throw new Error(man.parts[pi].name + ' ends early'); buf = r.value; bo = 0; }
          const k = Math.min(len, buf.length - bo); if (sink) await sink(buf.subarray(bo, bo + k));
          bo += k; len -= k; pos += k; done += k;
        }
      };
      for (const [rel, , off, size] of list) {
        if (off > pos) await take(off - pos, null);
        const parts = rel.split('/'); const d = await dirAt(base, parts.slice(0, -1), true); const name = parts[parts.length - 1];
        let skip = false; try { const old = await (await d.getFileHandle(name)).getFile(); skip = old.size === size || parts[0] === 'save'; } catch (e) {}
        if (skip) await take(size, null);
        else { const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await take(size, (c) => w.write(c)); await w.close(); }
        n++; if (n % 25 === 0) show();
      }
      try { await rd.cancel(); } catch (e) {}
    }
    show();
    // wide layout copies (name.wideNNN, picked by the runtime's RomFS) an older build left that this one doesn't have
    try { const keep = new Set(man.files.map((f) => f[0])); const ld = await dirAt(base, ['romfs', 'LayoutData'], false);
      const old = []; for await (const [nm] of ld.entries()) if (nm.includes('.wide') && !keep.has('romfs/LayoutData/' + nm)) old.push(nm);
      for (const nm of old) await ld.removeEntry(nm); } catch (e) {}
    const mw = await (await base.getFileHandle('.imported', { create: true })).createWritable();
    await mw.write(JSON.stringify({ files: man.files.length, bytes: total, when: Date.now(), id: man.id })); await mw.close();
    $('importmsg').textContent = 'Game files ready.'; prog.style.display = 'none';
  }

  // walk a picked folder: FileSystemDirectoryHandle (Chrome/Edge) or a webkitdirectory FileList
  async function* walkHandle(dir, path) {
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'directory') yield* walkHandle(h, path.concat(name)); else yield { path: path.concat(name), file: () => h.getFile() };
    }
  }
  function* walkList(list) { for (const f of list) { const p = (f.webkitRelativePath || f.name).split('/'); p.shift(); yield { path: p, file: async () => f }; } }

  async function importFrom(entries) {
    // keep what's under exefs/, romfs/ and save/ wherever they are in the picked folder (dump root or GAME_data)
    const items = [];
    for await (const e of entries) {
      const i = e.path.findIndex((s) => s === 'exefs' || s === 'romfs' || s === 'save');
      if (i < 0 || i === e.path.length - 1) continue;
      items.push({ rel: e.path.slice(i), file: e.file });
    }
    if (!items.some((x) => x.rel[0] === 'exefs') || !items.some((x) => x.rel[0] === 'romfs'))
      throw new Error('that folder has no exefs and romfs folders inside');
    const root = await opfs(); const base = await dirAt(root, [dataDir()], true);
    try { await navigator.storage.persist(); } catch (e) {}
    const files = await Promise.all(items.map(async (x) => ({ rel: x.rel, f: await x.file() })));
    const total = files.reduce((a, x) => a + x.f.size, 0);
    let done = 0, n = 0; const prog = $('prog'); prog.style.display = ''; prog.max = total || 1; const t0 = performance.now();
    for (const x of files) {
      const d = await dirAt(base, x.rel.slice(0, -1), true); const name = x.rel[x.rel.length - 1];
      let skip = false; try { const old = await (await d.getFileHandle(name)).getFile(); skip = old.size === x.f.size; } catch (e) {}
      if (!skip) { const w = await (await d.getFileHandle(name, { create: true })).createWritable(); await x.f.stream().pipeTo(w); }
      done += x.f.size; n++; prog.value = done; bar(done / (total || 1) * BAR_DATA);
      if (n % 20 === 0 || n === files.length) {
        const s = (performance.now() - t0) / 1000;
        $('importmsg').textContent = 'Copying ' + n + ' / ' + files.length + ' files, ' + (done / 1073741824).toFixed(2) + ' / ' + (total / 1073741824).toFixed(2) + ' GB' + (s > 1 ? ' (' + (done / 1048576 / s).toFixed(0) + ' MB/s)' : '');
      }
    }
    const mw = await (await base.getFileHandle('.imported', { create: true })).createWritable();
    await mw.write(JSON.stringify({ files: files.length, bytes: total, when: Date.now() })); await mw.close();
    $('importmsg').textContent = 'Done: ' + files.length + ' files.';
  }

  $('pick').onclick = async () => {
    try {
      $('pick').disabled = true;
      if (window.showDirectoryPicker) { const d = await window.showDirectoryPicker({ id: 'swr-game', mode: 'read' }); await importFrom(walkHandle(d, [])); }
      else {
        const inp = document.createElement('input'); inp.type = 'file'; inp.webkitdirectory = true;
        const list = await new Promise((res) => { inp.onchange = () => res(inp.files); inp.click(); });
        await importFrom((async function* () { yield* walkList(list); })());
      }
    } catch (e) { if (e.name !== 'AbortError') $('importmsg').textContent = 'Import failed: ' + e.message; }
    finally { $('pick').disabled = false;
      if (await dataState() && checks()) { $('pick').style.display = 'none'; await prefetchModule(BAR_DATA); ready(); } }
  };
  $('wipe').onclick = async () => {
    if (!confirm('Remove the imported game data (and its saves) from this browser?')) return;
    try { await (await opfs()).removeEntry(dataDir(), { recursive: true }); } catch (e) {}
    await dataState(); $('start').disabled = true;
  };
  $('getlog').onclick = async () => {
    try { const f = await (await (await opfs()).getFileHandle(game.title + '.log')).getFile();
      const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = game.title + '.log'; a.click(); }
    catch (e) { $('status').textContent = 'No log yet.'; }
  };

  // ------------------------------------------------------------------ log panel
  const logEl = $('log'); let logLines = [];
  function logAdd(s) { logLines.push(s); if (logLines.length > 600) logLines = logLines.slice(-400); if (logEl.style.display === 'block') { logEl.textContent = logLines.join('\n'); logEl.scrollTop = 1e9; } }
  function toggleLog() { const on = logEl.style.display !== 'block'; logEl.style.display = on ? 'block' : 'none'; if (on) { logEl.textContent = logLines.join('\n'); logEl.scrollTop = 1e9; } }
  $('showlog').onclick = toggleLog;

  // ------------------------------------------------------------------ settings
  // the menus are the game's own Options screen (runtime/webmenu.c: "Web Settings" in the pause menu, the debug menu
  // on Ins). the game sends what was picked to Module.swrSettings as {key: index}; it's saved here, the page does
  // its part right away and passes all of it back at the next start (--web_ws, and the runtime options it needs early)
  const SET_KEY = 'swr-web-settings';
  const WS_DEF = { renderer: 0, res: 0, shadows: 1, fps: 0, aspect: 0, csfast: 0, showfps: 0, preload: 0, docked: 0, lang: 0, pausehidden: 0, lowpower: 1,
    volume: 10, audiosync: 0, awake: 0, mousecam: 0, mousesens: 2, mouseinvx: 0, mouseinvy: 0, deadzone: 2, padlayout: 0, touch: 0, mousebtn: 1 };
  const WS = Object.assign({}, WS_DEF);
  let freshSet = true;   // nothing saved yet: the first start picks settings for the device (devicePreset)
  try { const old = JSON.parse(localStorage.getItem(SET_KEY) || '{}'); if (old.ws) { Object.assign(WS, old.ws); freshSet = false; } } catch (e) {}
  // first start only: low end (few cores or little memory, a phone, a software GPU) gets Auto resolution and no
  // shadows, mid range (integrated / mobile GPUs) Auto resolution, the rest the defaults. all of it stays changeable
  async function devicePreset() {
    const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8, mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    let tier = cores <= 4 || mem <= 4 || mobile ? 0 : cores <= 6 || mem < 8 ? 1 : 2;
    try { const a = navigator.gpu && await navigator.gpu.requestAdapter();
      if (a && a.isFallbackAdapter) tier = 0;
      const i = a && (a.info || (a.requestAdapterInfo && await a.requestAdapterInfo()));
      if (tier > 1 && i && /intel|qualcomm|arm|mali|adreno|imagination|powervr/i.test((i.vendor || '') + ' ' + (i.architecture || ''))) tier = 1; } catch (e) {}
    saveSet(); console.log('device preset: ' + ['low', 'medium', 'high'][tier]); }
  const saveSet = () => { try { localStorage.setItem(SET_KEY, JSON.stringify({ ws: WS })); } catch (e) {} };
  // what an index means (the order of webmenu.c's value lists)
  const V = {
    renderer: ['webgpu', 'webgl2'], res: [0.5, 0.75, 1, 1.5, 2, 1], shadows: [1, 0], fps: [1, 0], aspect: ['16:9', 'fill', '16:10', '21:9', '32:9'], csfast: [1, 0], showfps: [0, 1], preload: [1, 0],
    docked: [0, 1], lang: [1, 12, 2, 13, 3, 4, 5, 14, 8, 10, 0], pausehidden: [1, 0], lowpower: [0, 1], volume: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], audiosync: [1, 0], awake: [1, 0],
    mousecam: [0, 1], mousesens: [0.35, 0.6, 1, 1.6, 2.6], mouseinvx: [0, 1], mouseinvy: [0, 1], deadzone: [0.05, 0.1, 0.15, 0.2, 0.25], padlayout: ['switch', 'xbox'], touch: ['auto', 'on', 'off'], mousebtn: [0, 1],
  };
  const S = (k) => { const a = V[k], i = WS[k] | 0; return a[i < a.length ? i : 0]; };
  function gameSettings(o) { for (const k in o) if (k in WS_DEF) WS[k] = o[k] | 0; saveSet(); applyLive(); }

  // ------------------------------------------------------------------ input: g_web_in in backend_web.c
  // u32 seq, buttons_lo, buttons_hi; i32 lx, ly, rx, ry; u32 quit, w, h, focus (2 = paused by the page), shot,
  // fps_toggle, presented, debug (Ins)
  let inPtr = 0, keys = 0n;
  // physical keys (KeyboardEvent.code: the position, so WASD is ZQSD on an AZERTY keyboard)
  const KEYS = { KeyX: 0, Space: 0, KeyZ: 1, KeyC: 2, KeyV: 3, KeyQ: 6, KeyE: 7, Digit1: 8, Digit3: 9, Enter: 10, NumpadEnter: 10, Backspace: 11,
                   ArrowLeft: 12, ArrowUp: 13, ArrowRight: 14, ArrowDown: 15, KeyA: 40, KeyW: 41, KeyD: 42, KeyS: 43, KeyJ: 44, KeyI: 45, KeyL: 46, KeyK: 47 };
  function heap32() { return new Int32Array(Module.wasmMemory.buffer); }
  function setIn(word, v) { if (inPtr) Atomics.store(heap32(), inPtr / 4 + word, v | 0); }
  window.addEventListener('keydown', (e) => {
    if (!running) return;
    if (e.code === 'F11') { e.preventDefault(); fullscreen(); return; }
    if (e.code === 'F9') { e.preventDefault(); toggleLog(); return; }
    if (e.code === 'F4') { e.preventDefault(); if (!e.repeat) setIn(12, 1); return; }
    if (e.code === 'F5') { e.preventDefault(); if (!e.repeat) setIn(11, 1); return; }   // render target dump (diagnostics)
    if (e.code === 'Insert' || e.code === 'Backslash' || e.code === 'IntlBackslash') { e.preventDefault(); if (!e.repeat) setIn(14, 1); return; }   // the debug menu (Ins or \, keyboards without Ins)
    if (e.code === 'Escape' && document.pointerLockElement) return;
    const b = KEYS[e.code]; if (b === undefined) return; e.preventDefault(); keys |= 1n << BigInt(b);
  });
  window.addEventListener('keyup', (e) => { const b = KEYS[e.code]; if (b !== undefined) keys &= ~(1n << BigInt(b)); });
  window.addEventListener('blur', () => { keys = 0n; });
  const axis = (b, neg, pos) => (((b >> BigInt(pos)) & 1n) ? 32767 : 0) - (((b >> BigInt(neg)) & 1n) ? 32767 : 0);
  const dz = (v) => { const d = S('deadzone'), m = Math.abs(v); return m < d ? 0 : Math.max(-32767, Math.min(32767, Math.round(Math.sign(v) * (m - d) / (1 - d) * 32767))); };
  // standard gamepad -> switch button bits, by position like the desktop backends (Xbox layout: by label, A is A)
  const PAD_SW = [[1, 0], [0, 1], [3, 2], [2, 3], [10, 4], [11, 5], [4, 6], [5, 7], [6, 8], [7, 9], [9, 10], [8, 11], [14, 12], [12, 13], [15, 14], [13, 15]];
  const PAD_XB = [[0, 0], [1, 1], [2, 2], [3, 3], [10, 4], [11, 5], [4, 6], [5, 7], [6, 8], [7, 9], [9, 10], [8, 11], [14, 12], [12, 13], [15, 14], [13, 15]];

  // mouse camera: with the pointer locked to the picture, mouse movement turns the camera (the right stick). the
  // movement of each frame becomes a stick deflection, so faster moves turn faster
  let mdx = 0, mdy = 0;
  $('screen').addEventListener('click', () => { if (running && S('mousecam') && !document.pointerLockElement) { try { $('screen').requestPointerLock(); } catch (e) {} } });
  document.addEventListener('mousemove', (e) => { if (document.pointerLockElement === $('screen')) { mdx += e.movementX; mdy += e.movementY; } });
  // mouse buttons (with the pointer locked): left throws Cappy (Y), right jumps (A)
  let mbits = 0n; const MB = { 0: 3n, 2: 0n };
  document.addEventListener('mousedown', (e) => { if (document.pointerLockElement === $('screen') && S('mousebtn') && MB[e.button] !== undefined) { e.preventDefault(); mbits |= 1n << MB[e.button]; } });
  document.addEventListener('mouseup', (e) => { if (MB[e.button] !== undefined) mbits &= ~(1n << MB[e.button]); });
  document.addEventListener('contextmenu', (e) => { if (document.pointerLockElement) e.preventDefault(); });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) mbits = 0n; });
  function mouseStick() {
    if (document.pointerLockElement !== $('screen')) { mdx = mdy = 0; return null; }
    const k = S('mousesens') * 1100; let x = mdx * k, y = -mdy * k; mdx = mdy = 0;
    if (S('mouseinvx')) x = -x; if (S('mouseinvy')) y = -y;
    const m = Math.hypot(x, y); if (m > 32767) { x *= 32767 / m; y *= 32767 / m; }
    return [Math.round(x), Math.round(y)];
  }

  // on-screen controls (touch screens): a stick that appears where the left thumb lands, the camera on a drag at
  // the right, the Switch buttons
  const touch = { lx: 0, ly: 0, rx: 0, ry: 0, bits: 0n, stick: null, cam: null };
  const TBTN = [
    { b: 0, t: 'A', r: 20, bt: 92 }, { b: 1, t: 'B', r: 92, bt: 24 }, { b: 2, t: 'X', r: 92, bt: 160 }, { b: 3, t: 'Y', r: 164, bt: 92 },
    { b: 7, t: 'R', r: 20, tp: 70, sm: 1 }, { b: 9, t: 'ZR', r: 76, tp: 70, sm: 1 }, { b: 6, t: 'L', l: 20, tp: 70, sm: 1 }, { b: 8, t: 'ZL', l: 76, tp: 70, sm: 1 },
    { b: 10, t: '+', r: 132, tp: 70, sm: 1 }, { b: 11, t: '−', l: 132, tp: 70, sm: 1 },
  ];
  function buildTouch() {
    const root = $('touch'); if (root.dataset.built) return; root.dataset.built = '1';
    for (const d of TBTN) {
      const el = document.createElement('div'); el.className = 'tbtn' + (d.sm ? ' sm' : ''); el.textContent = d.t;
      if (d.r !== undefined) el.style.right = d.r + 'px'; if (d.l !== undefined) el.style.left = d.l + 'px';
      if (d.bt !== undefined) el.style.bottom = d.bt + 'px'; if (d.tp !== undefined) el.style.top = d.tp + 'px';
      const bit = 1n << BigInt(d.b);
      const down = (e) => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); el.classList.add('down'); touch.bits |= bit; if (navigator.vibrate) navigator.vibrate(8); };
      const up = (e) => { e.preventDefault(); el.classList.remove('down'); touch.bits &= ~bit; };
      el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      root.appendChild(el);
    }
    const zone = $('t-zone'), base = $('t-base'), knob = $('t-knob');
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault(); zone.setPointerCapture(e.pointerId);
      if (e.clientX < window.innerWidth * 0.45 && !touch.stick) {
        touch.stick = { id: e.pointerId, cx: e.clientX, cy: e.clientY };
        base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; base.style.display = 'block'; knob.style.transform = '';
      } else if (!touch.cam) touch.cam = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    zone.addEventListener('pointermove', (e) => {
      const s = touch.stick;
      if (s && s.id === e.pointerId) {
        let dx = (e.clientX - s.cx) / 60, dy = (e.clientY - s.cy) / 60; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
        touch.lx = Math.round(dx * 32767); touch.ly = Math.round(-dy * 32767); knob.style.transform = 'translate(' + dx * 36 + 'px,' + dy * 36 + 'px)';
      }
      const c = touch.cam;
      if (c && c.id === e.pointerId) { touch.rx += (e.clientX - c.x) * 700; touch.ry -= (e.clientY - c.y) * 700; c.x = e.clientX; c.y = e.clientY; }
    });
    const end = (e) => {
      if (touch.stick && touch.stick.id === e.pointerId) { touch.stick = null; touch.lx = touch.ly = 0; base.style.display = 'none'; }
      if (touch.cam && touch.cam.id === e.pointerId) touch.cam = null;
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }
  let sawTouch = false; window.addEventListener('touchstart', () => { if (!sawTouch) { sawTouch = true; applyLive(); } }, { passive: true });
  const touchOn = () => { const t = S('touch'); return running && (t === 'on' || (t === 'auto' && (sawTouch || matchMedia('(pointer: coarse)').matches))); };

  function inputTick() {
    if (!inPtr) return;
    const h = heap32(), w = inPtr / 4;
    setIn(10, document.hidden && S('pausehidden') ? 2 : 1);
    let b = (keys & 0xFFFFn) | mbits;
    let lx = axis(keys, 40, 42), ly = axis(keys, 43, 41), rx = axis(keys, 44, 46), ry = axis(keys, 47, 45);
    const PAD = S('padlayout') === 'xbox' ? PAD_XB : PAD_SW;
    for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) {
      if (!p || !p.connected) continue;
      for (const [i, bit] of PAD) if (p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5)) b |= 1n << BigInt(bit);
      if (!lx && !ly) { lx = dz(p.axes[0] || 0); ly = dz(-(p.axes[1] || 0)); }
      if (!rx && !ry) { rx = dz(p.axes[2] || 0); ry = dz(-(p.axes[3] || 0)); }
      break;
    }
    const ms = S('mousecam') ? mouseStick() : null; if (ms && !rx && !ry) { rx = ms[0]; ry = ms[1]; }
    if (touchOn()) {
      b |= touch.bits; if (!lx && !ly) { lx = touch.lx; ly = touch.ly; }
      if (!rx && !ry) { rx = Math.max(-32767, Math.min(32767, touch.rx)); ry = Math.max(-32767, Math.min(32767, touch.ry)); } touch.rx = touch.ry = 0;
    }
    if (lx < -16000) b |= 1n << 16n; if (ly > 16000) b |= 1n << 17n; if (lx > 16000) b |= 1n << 18n; if (ly < -16000) b |= 1n << 19n;
    if (rx < -16000) b |= 1n << 20n; if (ry > 16000) b |= 1n << 21n; if (rx > 16000) b |= 1n << 22n; if (ry < -16000) b |= 1n << 23n;
    Atomics.store(h, w + 1, Number(b & 0xFFFFFFFFn) | 0); Atomics.store(h, w + 2, Number(b >> 32n) | 0);
    Atomics.store(h, w + 3, lx); Atomics.store(h, w + 4, ly); Atomics.store(h, w + 5, rx); Atomics.store(h, w + 6, ry);
    // output size: the canvas on screen in device pixels, in the picture shape's box, at most 1080 lines and 2560 wide
    const c = $('screen'), dpr = window.devicePixelRatio || 1;
    let ow = Math.round(c.clientWidth * dpr), oh = Math.round(c.clientHeight * dpr);
    const a = aspectOf(); if (ow > oh * a) ow = Math.round(oh * a); else oh = Math.round(ow / a);
    const k = Math.min(1, 2560 / ow, 1080 / oh); ow = Math.max(320, Math.round(ow * k)); oh = Math.max(180, Math.round(oh * k));
    Atomics.store(h, w + 8, ow); Atomics.store(h, w + 9, oh);
    Atomics.add(h, w, 1);
  }
  function loop() { inputTick(); uiTick(); requestAnimationFrame(loop); }

  // ------------------------------------------------------------------ audio
  let actx = null, anode = null, gain = null;
  async function audioStart() {
    try { actx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' }); await actx.audioWorklet.addModule('audio_worklet.js'); await actx.resume(); }
    catch (e) { console.warn('audio unavailable', e); actx = null; }
  }
  document.addEventListener('visibilitychange', () => {   // paused while hidden: no stale sound loop either
    if (!actx) return; if (document.hidden && S('pausehidden')) actx.suspend().catch(() => {}); else actx.resume().catch(() => {});
    if (!document.hidden) wakeLock();
  });

  // ------------------------------------------------------------------ frames
  let br = null;
  function present(bmp, w, h) {
    const c = $('screen'); if (!br) br = c.getContext('bitmaprenderer');
    if (c.width !== bmp.width || c.height !== bmp.height) { c.width = bmp.width; c.height = bmp.height; }
    br.transferFromImageBitmap(bmp); fpsN++;
    if (inPtr) Atomics.add(heap32(), inPtr / 4 + 13, 1);   // shown: the runtime keeps at most 2 frames in flight (WebIn.presented)
  }
  function fullscreen() { const g = $('game'); if (document.fullscreenElement) document.exitFullscreen(); else g.requestFullscreen().catch(() => {}); }
  $('fs').onclick = fullscreen;

  // ------------------------------------------------------------------ the page's part of the settings
  let wl = null;
  async function wakeLock() {
    try { if (running && S('awake') && !wl && navigator.wakeLock) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
      if (!S('awake') && wl) { await wl.release(); wl = null; } } catch (e) {}
  }
  function applyLive() {
    layout();
    if (gain) gain.gain.value = S('volume') / 100;
    $('fpsbox').style.display = S('showfps') && running ? 'block' : 'none';
    if (!S('mousecam') && document.pointerLockElement) document.exitPointerLock();
    const t = touchOn(); if (t) buildTouch(); $('touch').style.display = t ? 'block' : 'none';
    wakeLock();
  }
  ['fpsbox', 'dbgbox', 'touch'].forEach((id) => $('game').appendChild($(id)));   /* inside the fullscreen element */
  // picture shape: the game renders this shape from its start (a change waits for a restart: the page box doesn't
  // change before, that would only stretch the picture). Fill Window: the window's shape when the game starts
  const shapeOf = (a) => a === 'fill' ? Math.min(4, Math.max(1.25, window.innerWidth / Math.max(1, window.innerHeight))) : a === '32:9' ? 32 / 9 : a === '21:9' ? 21 / 9 : a === '16:10' ? 16 / 10 : 16 / 9;
  let startShape = 0;
  const aspectOf = () => startShape || shapeOf(S('aspect'));

  // picture shape: the biggest box of that shape in the window; the runtime renders at that size (inputTick)
  function layout() {
    const g = $('game'), c = $('screen'), W = g.clientWidth, H = g.clientHeight; if (!W || !H) return;
    const a = aspectOf();
    let w = W, h = Math.round(W / a); if (h > H) { h = H; w = Math.round(H * a); }
    c.style.width = w + 'px'; c.style.height = h + 'px'; c.style.left = ((W - w) / 2) + 'px'; c.style.top = ((H - h) / 2) + 'px';
  }
  window.addEventListener('resize', layout); document.addEventListener('fullscreenchange', () => setTimeout(layout, 50));
  let fpsN = 0, fpsT = performance.now();
  function uiTick() {
    const now = performance.now(); if (now - fpsT >= 1000) { $('fpsbox').textContent = Math.round(fpsN * 1000 / (now - fpsT)) + ' FPS'; fpsN = 0; fpsT = now; }
  }
  // the debug menu's overlay (profiler stats, player position): text from the runtime
  function debugText(t) { const d = $('dbgbox'); d.textContent = t; d.style.display = t ? 'block' : 'none'; }

  // ------------------------------------------------------------------ start
  $('start').onclick = async () => {
    $('start').disabled = true; $('status').textContent = 'Loading ' + game.script + ' (it is big, the first time takes a while)…';
    await audioStart();
    if (freshSet) { freshSet = false; await devicePreset(); }
    const ws =Object.keys(WS_DEF).map((k) => k + '=' + (WS[k] | 0)).join(',');
    startShape = shapeOf(S('aspect'));
    window.Module = {
      // ?arg=--key=value (repeatable): runtime options for testing, the same as the desktop command line
      swrGame: game.title, mainScriptUrlOrBlob: game.script,
      // split build: the module from the joined parts (prefetchModule), not from one .wasm file
      ...(wasmBuf ? { instantiateWasm: (imports, ok) => { WebAssembly.instantiate(wasmBuf, imports).then((r) => { wasmBuf = null; ok(r.instance, r.module); },
        (e) => { $('status').textContent = 'Could not start the game module: ' + e.message; }); return {}; } } : {}),
      arguments: ['--web_ws=' + ws, '--web_renderer=' + S('renderer'), '--web_lowpower=' + S('lowpower'), '--docked=' + S('docked'), '--resolution=' + S('res'), '--dynamic_resolution=' + (WS.res === 5 ? 1 : 0), '--dynamic_resolution_min=0.5',
        '--fps_limit=' + S('fps'), '--shadows=' + S('shadows'), '--audio_slowdown=' + S('audiosync'), '--aspect=' + startShape.toFixed(4), '--language=' + S('lang'),
        '--shader_preload=' + S('preload')].concat(new URLSearchParams(location.search).getAll('arg')),
      // ?env=NAME=value (repeatable): the runtime's SWR_* diagnostics switches
      preRun: [() => { for (const kv of new URLSearchParams(location.search).getAll('env')) { const i = kv.indexOf('='); if (i > 0) ENV[kv.slice(0, i)] = kv.slice(i + 1); } }],
      print: (s) => { logAdd(s); console.log(s); }, printErr: (s) => { logAdd(s); console.warn(s); },
      swrMessage: (t, err) => { logAdd(t); if (err) alert(t); },
      swrInputAttach: (p, n) => { inPtr = Number(p); },
      swrPresent: present, swrSettings: gameSettings, swrDebug: debugText,
      swrAudioAttach: (p) => {
        if (!actx) return;
        anode = new AudioWorkletNode(actx, 'swr-audio', { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { memory: Module.wasmMemory, ptr: Number(p) } });
        gain = actx.createGain(); gain.gain.value = S('volume') / 100; anode.connect(gain).connect(actx.destination);
      },
      onAbort: (w) => { $('status').textContent = 'Stopped: ' + w; },
      onExit: (c) => { running = false; logAdd('exited (' + c + ')'); },
      monitorRunDependencies: (n) => { if (!n) { $('status').textContent = 'Running.'; } },
    };
    const s = document.createElement('script'); s.src = game.script;
    s.onerror = () => { $('status').textContent = 'Could not load ' + game.script; };
    document.body.appendChild(s);
    $('setup').style.display = 'none'; $('game').style.display = 'flex'; $('hud').style.display = 'flex';
    running = true; $('screen').focus(); applyLive(); requestAnimationFrame(loop);
  };

  // ------------------------------------------------------------------ boot
  (async () => {
    try { const r = await fetch('game.txt', { cache: 'no-cache' }); if (r.ok) game = Object.assign(game, await r.json()); } catch (e) {}
    document.title = game.title + ' - SwitchRecomp'; $('title').textContent = game.title;
    // split build: coi-sw.js has to be in charge of this page before the module loads (see prefetchModule)
    if (Object.keys(await splitMap()).length && 'serviceWorker' in navigator && location.protocol !== 'file:') {
      try { await navigator.serviceWorker.register('coi-sw.js'); await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller && !sessionStorage.getItem('swr-sw-reload')) { sessionStorage.setItem('swr-sw-reload', '1'); location.reload(); return; } } catch (e) {} }
    const ok = checks(); let have = await dataState();
    if (!ok) { $('bar').style.display = 'none';
      $('importmsg').textContent = 'This browser can\'t run the game:\n' + [...$('checks').querySelectorAll('li.bad')].map((l) => l.textContent).join('\n'); return; }
    const man = await packedManifest(); let setUp = false;
    if (man && (!have || !dataMarker || dataMarker.id !== man.id)) {
      setUp = true;
      try { await importPacked(man); } catch (e) { $('bar').style.display = 'none'; $('importmsg').textContent = 'Setting up the game files failed: ' + (/quota|storage/i.test(e.message) ? 'This browser ran out of site storage. Free at least 7 GB of disk space, or use another browser profile, then reload.' : e.message); return; }
      have = await dataState();
    }
    if (!have) { $('bar').style.display = 'none'; $('importmsg').textContent = 'No game files yet. Pick the folder with exefs and romfs inside (your own copy of the game).';
      $('pick').style.display = 'block'; return; }
    $('importmsg').textContent = 'Loading the game';
    await prefetchModule(setUp ? BAR_DATA : 0); ready();
  })();
})();

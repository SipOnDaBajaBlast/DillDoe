// lm-page.js - page side of the Luigi's Mansion web port:
// stitches chunked disc (8 parts) into OPFS and wasm (3 parts) into memory.
'use strict';

const DISC_NAME = 'lm.rvz';
const DISC_PARTS = 8;
const DISC_CHUNK_PREFIX = 'disc.rvz.part';
const WASM_PARTS = 3;
const WASM_CHUNK_PREFIX = 'lm.wasm.part';
const EXPECTED_ID = 'GLME01';

const $ = (id) => document.getElementById(id);
const overlay = $('overlay'), message = $('message'), statusEl = $('status'), logEl = $('log');
const progressWrap = $('progress-wrap'), progressBar = $('progress-bar'), startHint = $('start-hint');

const logLines = [];
let logDirty = false;
const fullLog = window.sadxLog = [];
function log(text) {
  if (fullLog.length < 20000) fullLog.push(text);
  logLines.push(text);
  if (logLines.length > 300) logLines.splice(0, logLines.length - 300);
  scheduleLogDraw();
}
function scheduleLogDraw() {
  if (logDirty || !settings.showInfo) return;
  logDirty = true;
  setTimeout(() => {
    logDirty = false;
    logEl.textContent = logLines.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }, 100);
}
function status(text) {
  statusEl.textContent = text;
  if (!overlay.classList.contains('hidden')) message.textContent = text;
}
function setProgress(fraction) {
  progressWrap.classList.toggle('hidden', fraction === null);
  if (fraction !== null) progressBar.style.width = `${(100 * Math.min(1, fraction)).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------------------------
// Settings & Controls

const CONTROLS = [
  ['A', 'Space', ['Space', 'KeyK'], 'b0'],
  ['B', 'KeyJ', ['KeyJ', 'ShiftLeft'], 'b2'],
  ['X', 'KeyL', ['KeyL'], 'b1'],
  ['Y', 'KeyI', ['KeyI'], 'b3'],
  ['Z', 'KeyZ', ['KeyZ'], 'b5'],
  ['Start', 'Enter', ['Enter'], 'b9'],
  ['L trigger', 'KeyQ', ['KeyQ'], 'b6'],
  ['R trigger', 'KeyE', ['KeyE'], 'b7'],
  ['Stick up', 'KeyW', ['KeyW', 'ArrowUp'], 'a1-'],
  ['Stick down', 'KeyS', ['KeyS', 'ArrowDown'], 'a1+'],
  ['Stick left', 'KeyA', ['KeyA', 'ArrowLeft'], 'a0-'],
  ['Stick right', 'KeyD', ['KeyD', 'ArrowRight'], 'a0+'],
  ['C-stick up', 'Numpad8', ['Numpad8'], 'a3-'],
  ['C-stick down', 'Numpad2', ['Numpad2'], 'a3+'],
  ['C-stick left', 'Numpad4', ['Numpad4'], 'a2-'],
  ['C-stick right', 'Numpad6', ['Numpad6'], 'a2+'],
  ['D-pad up', 'Digit1', ['Digit1'], 'b12'],
  ['D-pad down', 'Digit2', ['Digit2'], 'b13'],
  ['D-pad left', 'Digit3', ['Digit3'], 'b14'],
  ['D-pad right', 'Digit4', ['Digit4'], 'b15'],
];
const SETTINGS_KEY = 'lm-settings';
function defaultBinds() {
  return Object.fromEntries(CONTROLS.map(([, canon, keys]) => [canon, [keys[0] || '', keys[1] || '']]));
}
function defaultPadBinds() { return Object.fromEntries(CONTROLS.map(([, canon, , pad]) => [canon, pad])); }
function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch {}
  const binds = defaultBinds();
  const padBinds = defaultPadBinds();
  for (const canon of Object.keys(binds)) {
    const keys = saved.binds && saved.binds[canon];
    if (Array.isArray(keys)) binds[canon] = [keys[0] || '', keys[1] || ''];
    const pad = saved.pad && saved.pad.binds && saved.pad.binds[canon];
    if (typeof pad === 'string') padBinds[canon] = pad;
  }
  const players = [0, 1, 2, 3].map((i) => {
    const pad = saved.players && saved.players[i] && saved.players[i].pad;
    return { pad: typeof pad === 'string' ? pad : (i === 0 ? 'auto' : 'none') };
  });
  const keyboardPlayer = Number.isInteger(saved.keyboardPlayer) ? saved.keyboardPlayer : 0;
  return { showInfo: !!saved.showInfo, showFps: !!saved.showFps, binds, pad: { binds: padBinds },
           players, keyboardPlayer };
}
const settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

let keyMap = new Map();
function rebuildKeyMap() {
  keyMap = new Map();
  for (const [canon, keys] of Object.entries(settings.binds)) {
    for (const code of keys) {
      if (!code) continue;
      if (!keyMap.has(code)) keyMap.set(code, []);
      keyMap.get(code).push(canon);
    }
  }
}
rebuildKeyMap();

function prettyKey(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  if (code.startsWith('Arrow')) return code.slice(5) + ' arrow';
  return code.replace(/(Left|Right)$/, ' $1');
}
const PAD_BUTTONS = ['A (Cross)', 'B (Circle)', 'X (Square)', 'Y (Triangle)', 'LB (L1)', 'RB (R1)',
  'LT (L2)', 'RT (R2)', 'Back (Share)', 'Start (Options)', 'Left stick press', 'Right stick press',
  'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];
const PAD_AXES = [['Left stick left', 'Left stick right'], ['Left stick up', 'Left stick down'],
  ['Right stick left', 'Right stick right'], ['Right stick up', 'Right stick down']];
function prettyPad(code) {
  if (!code) return '-';
  const n = parseInt(code.slice(1), 10);
  if (code[0] === 'b') return PAD_BUTTONS[n] || `Button ${n}`;
  const dir = code.endsWith('-') ? 0 : 1;
  return (PAD_AXES[n] && PAD_AXES[n][dir]) || `Axis ${n}${code.endsWith('-') ? '-' : '+'}`;
}

function connectedPads() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
  return pads.filter((p) => p && p.connected);
}
function playerPads() {
  const pads = connectedPads();
  const taken = new Set();
  const out = settings.players.map((player) => {
    if (!player.pad.startsWith('slot')) return null;
    const pad = pads.find((p) => p.index === Number(player.pad.slice(4))) || null;
    if (pad) taken.add(pad.index);
    return pad;
  });
  const free = pads.filter((p) => !taken.has(p.index));
  settings.players.forEach((player, i) => { if (player.pad === 'auto') out[i] = free.shift() || null; });
  return out;
}
function portMask() {
  return settings.players.map((player, i) =>
    (player.pad !== 'none' || settings.keyboardPlayer === i ? '1' : '0')).join('');
}
const STICK_DEADZONE = 0.15;
function padValue(pad, code) {
  if (!pad || !code) return 0;
  const n = parseInt(code.slice(1), 10);
  if (code[0] === 'b') return pad.buttons[n] ? pad.buttons[n].value : 0;
  const v = (pad.axes[n] || 0) * (code.endsWith('-') ? -1 : 1);
  return v > STICK_DEADZONE ? (v - STICK_DEADZONE) / (1 - STICK_DEADZONE) : 0;
}

function applyInfoBar() {
  $('infobar').classList.toggle('hidden', !settings.showInfo);
  $('opt-info').checked = settings.showInfo;
  $('fps').classList.toggle('hidden', !settings.showFps);
  $('opt-fps').checked = settings.showFps;
  scheduleLogDraw();
}

const bootPortMask = portMask();
function renderPlayers() {
  const list = $('players');
  list.textContent = '';
  const pads = connectedPads();
  for (let i = 0; i < 4; i++) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = `Player ${i + 1}`;
    const controls = document.createElement('div');
    controls.className = 'keys';
    const select = document.createElement('select');
    select.className = 'pick';
    const add = (value, text) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.append(option);
    };
    add('none', 'No controller');
    add('auto', 'Controller: automatic');
    for (const pad of pads) add(`slot${pad.index}`, `Controller ${pad.index + 1}: ${pad.id}`);
    const current = settings.players[i].pad;
    if (current.startsWith('slot') && !pads.some((p) => `slot${p.index}` === current))
      add(current, `Controller ${Number(current.slice(4)) + 1} (not connected)`);
    select.value = current;
    select.addEventListener('change', () => {
      settings.players[i].pad = select.value;
      saveSettings();
      renderPlayers();
    });
    const kb = document.createElement('label');
    kb.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = settings.keyboardPlayer === i;
    box.addEventListener('change', () => {
      settings.keyboardPlayer = box.checked ? i : -1;
      saveSettings();
      renderPlayers();
    });
    kb.append(box, document.createTextNode(' Keyboard'));
    controls.append(select, kb);
    row.append(label, controls);
    list.append(row);
  }
  const hint = $('players-hint');
  const changed = portMask() !== bootPortMask;
  hint.textContent = changed
    ? 'You have to reload the page to apply the player changes. '
    : 'Note: adding or removing players only applies after reloading the page.';
  hint.style.color = changed ? '#ffb020' : '';
  hint.style.fontWeight = changed ? 'bold' : '';
  if (changed) {
    const reload = document.createElement('button');
    reload.textContent = 'Reload now';
    reload.addEventListener('click', () => location.reload());
    hint.append(reload);
  }
}

let bindTab = 'keyboard';
let listening = null;
function stopListening() {
  if (listening) listening.button.classList.remove('listening');
  listening = null;
}
function renderBinds() {
  for (const tab of document.querySelectorAll('.tab'))
    tab.classList.toggle('active', tab.dataset.tab === bindTab);
  const pad = bindTab === 'controller';
  $('binds-hint').textContent = pad
    ? (connectedPads().length
        ? "For every player's controller. Click a control, then press a button or move a stick. Esc cancels, Backspace clears."
        : 'No controller found: plug one in and press any button on it.')
    : 'Click a key, then press the new key. Esc cancels, Backspace clears.';
  const list = $('binds');
  list.textContent = '';
  for (const [name, canon] of CONTROLS) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = name;
    const keys = document.createElement('div');
    keys.className = 'keys';
    for (let slot = 0; slot < (pad ? 1 : 2); slot++) {
      const button = document.createElement('button');
      const code = pad ? settings.pad.binds[canon] : settings.binds[canon][slot];
      button.className = 'key' + (code ? '' : ' empty') + (pad ? ' wide' : '');
      button.textContent = pad ? prettyPad(code) : prettyKey(code);
      button.addEventListener('click', () => {
        stopListening();
        listening = { kind: pad ? 'pad' : 'key', canon, slot, button, baseline: null };
        button.classList.add('listening');
        button.textContent = pad ? 'press a button' : 'press a key';
        if (pad) requestAnimationFrame(watchPadForBinding);
      });
      keys.append(button);
    }
    row.append(label, keys);
    list.append(row);
  }
}
function finishBinding(code) {
  const { kind, canon, slot } = listening;
  listening = null;
  if (code !== null) {
    if (kind === 'key') {
      if (code) {
        for (const keys of Object.values(settings.binds))
          for (let i = 0; i < 2; i++) if (keys[i] === code) keys[i] = '';
      }
      settings.binds[canon][slot] = code;
      rebuildKeyMap();
    } else {
      if (code) {
        for (const other of Object.keys(settings.pad.binds))
          if (settings.pad.binds[other] === code) settings.pad.binds[other] = '';
      }
      settings.pad.binds[canon] = code;
    }
    saveSettings();
  }
  renderBinds();
}
function watchPadForBinding() {
  if (!listening || listening.kind !== 'pad') return;
  for (const pad of connectedPads()) {
    const inputs = [];
    pad.buttons.forEach((_, i) => inputs.push(`b${i}`));
    pad.axes.forEach((_, i) => inputs.push(`a${i}-`, `a${i}+`));
    const active = inputs.filter((code) => padValue(pad, code) > 0.5);
    listening.baseline = listening.baseline || new Map();
    if (!listening.baseline.has(pad.index)) listening.baseline.set(pad.index, new Set(active));
    const held = listening.baseline.get(pad.index);
    const fresh = active.find((code) => !held.has(code));
    for (const code of held) if (!active.includes(code)) held.delete(code);
    if (fresh) { finishBinding(fresh); return; }
  }
  requestAnimationFrame(watchPadForBinding);
}

let settingsOpen = false;
function openSettings(open) {
  settingsOpen = open;
  $('settings').classList.toggle('hidden', !open);
  if (open) { releaseAllKeys(); renderPlayers(); renderBinds(); }
  else { stopListening(); $('display').focus(); }
}
$('gear').addEventListener('click', () => openSettings(!settingsOpen));
$('settings-close').addEventListener('click', () => openSettings(false));
$('settings').addEventListener('click', (e) => { if (e.target === $('settings')) openSettings(false); });
$('opt-info').addEventListener('change', (e) => { settings.showInfo = e.target.checked; saveSettings(); applyInfoBar(); });
$('opt-fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});
for (const tab of document.querySelectorAll('.tab'))
  tab.addEventListener('click', () => { stopListening(); bindTab = tab.dataset.tab; renderBinds(); });
$('opt-fps').addEventListener('change', (e) => { settings.showFps = e.target.checked; saveSettings(); applyInfoBar(); });
const refreshPads = () => { if (settingsOpen && !listening) { renderPlayers(); renderBinds(); } };
addEventListener('gamepadconnected', refreshPads);
addEventListener('gamepaddisconnected', refreshPads);
$('binds-reset').addEventListener('click', () => {
  stopListening();
  if (bindTab === 'controller') settings.pad.binds = defaultPadBinds();
  else { settings.binds = defaultBinds(); rebuildKeyMap(); }
  saveSettings();
  renderBinds();
});
addEventListener('keydown', (e) => {
  if (listening) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') finishBinding(null);
    else if (e.code === 'Backspace' || e.code === 'Delete') finishBinding('');
    else if (listening.kind === 'key') finishBinding(e.code);
    return;
  }
  if (e.code === 'Escape' && settingsOpen) { e.preventDefault(); openSettings(false); }
}, true);
applyInfoBar();

let idleTimer = 0;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!settingsOpen) document.body.classList.add('idle'); }, 3000);
}
addEventListener('mousemove', wake);
wake();

// ---------------------------------------------------------------------------------------------
// OPFS Disc Loader: Streams 8 parts (disc.rvz.part0001 -> disc.rvz.part0008)

async function opfsRoot() { return navigator.storage.getDirectory(); }

async function storedDisc() {
  try {
    const handle = await (await opfsRoot()).getFileHandle(DISC_NAME);
    return await handle.getFile();
  } catch { return null; }
}

async function checkRvz(file) {
  if (!file || file.size < 0x60) return 'Stored disc image is incomplete or missing.';
  const head = new Uint8Array(await file.slice(0, 0x60).arrayBuffer());
  const magic = String.fromCharCode(...head.slice(0, 3));
  const id = String.fromCharCode(...head.slice(0x58, 0x5e));
  if (magic !== 'RVZ') return 'disc.rvz is not an .rvz disc image.';
  if (id !== EXPECTED_ID) return `disc.rvz is ${id}, but this port is built for ${EXPECTED_ID} (Luigi's Mansion, USA).`;
  return null;
}

async function keepStorage() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted()))
      await navigator.storage.persist();
  } catch {}
}

async function prepareDisc() {
  const existing = await storedDisc();
  if (existing && existing.size > 140000000 && !(await checkRvz(existing))) {
    log(`[page] verified existing disc in OPFS (${(existing.size / 2 ** 20).toFixed(0)} MiB)`);
    return null;
  }

  await keepStorage();

  const handle = await (await opfsRoot()).getFileHandle(DISC_NAME, { create: true });
  const writable = await handle.createWritable();
  let totalBytes = 0;

  setProgress(0);
  for (let i = 1; i <= DISC_PARTS; i++) {
    const chunkNum = String(i).padStart(4, '0');
    const chunkUrl = `${DISC_CHUNK_PREFIX}${chunkNum}`;
    message.textContent = `Downloading disc part ${i} of ${DISC_PARTS}...`;

    let res = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(chunkUrl, { cache: 'no-store' });
        if (res.ok) break;
      } catch (e) {}
    }

    if (!res || !res.ok) {
      await writable.abort();
      return `Failed to fetch chunk ${chunkUrl} (HTTP ${res ? res.status : 'Network Error'}).`;
    }

    const reader = res.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      await writable.write(value);
      totalBytes += value.byteLength;
    }

    setProgress(i / DISC_PARTS);
    message.textContent = `Downloaded part ${i}/${DISC_PARTS} (${(totalBytes / 2 ** 20).toFixed(0)} MiB)`;
  }

  await writable.close();
  setProgress(null);

  const finalDisc = await storedDisc();
  return checkRvz(finalDisc);
}

// ---------------------------------------------------------------------------------------------
// WASM Chunk Stitcher: Assembles 3 parts (lm.wasm.part0001 -> lm.wasm.part0003)

let cachedWasmUrl = null;
async function prepareWasm() {
  if (cachedWasmUrl) return cachedWasmUrl;
  status('Downloading WASM binary parts...');
  const chunks = [];
  for (let i = 1; i <= WASM_PARTS; i++) {
    const chunkNum = String(i).padStart(4, '0');
    const chunkUrl = `${WASM_CHUNK_PREFIX}${chunkNum}`;
    let res = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(chunkUrl);
        if (res.ok) break;
      } catch (e) {}
    }
    if (!res || !res.ok) {
      throw new Error(`Failed to load ${chunkUrl} (HTTP ${res ? res.status : 'Error'})`);
    }
    chunks.push(await res.arrayBuffer());
  }
  const blob = new Blob(chunks, { type: 'application/wasm' });
  cachedWasmUrl = URL.createObjectURL(blob);
  return cachedWasmUrl;
}

// ---------------------------------------------------------------------------------------------
// Inputs, Saves & Worklets

let releaseAllKeys = () => {};
function startInput(Module) {
  const PADS = 4, BUTTONS = 17, AXES = 4;
  const base = Module._sadx_web_input_state() >>> 0;
  const connectedAt = base + 128;
  const buttonsAt = (connectedAt + PADS) >>> 2, axesAt = buttonsAt + PADS * BUTTONS;
  const rumbleAt = axesAt + PADS * AXES;
  const rumbleUntil = [0, 0, 0, 0];

  const rumble = (pad, port) => {
    const on = Module.HEAPF32[rumbleAt + port] > 0;
    const now = performance.now();
    if (!pad) return;
    if (on && now >= rumbleUntil[port]) {
      rumbleUntil[port] = now + 100;
      if (pad.vibrationActuator && pad.vibrationActuator.playEffect)
        pad.vibrationActuator.playEffect('dual-rumble', { duration: 150, strongMagnitude: 1.0, weakMagnitude: 1.0 }).catch(() => {});
      else if (pad.hapticActuators && pad.hapticActuators[0])
        pad.hapticActuators[0].pulse(1.0, 150).catch(() => {});
    } else if (!on && rumbleUntil[port]) {
      rumbleUntil[port] = 0;
      if (pad.vibrationActuator && pad.vibrationActuator.reset) pad.vibrationActuator.reset().catch(() => {});
    }
  };

  const heldKeys = new Set();
  const onKey = (e, down) => {
    if (!keyMap.has(e.code)) return;
    e.preventDefault();
    if (down && !settingsOpen) heldKeys.add(e.code);
    else heldKeys.delete(e.code);
  };
  addEventListener('keydown', (e) => onKey(e, true));
  addEventListener('keyup', (e) => onKey(e, false));
  releaseAllKeys = () => heldKeys.clear();
  addEventListener('blur', () => releaseAllKeys());

  const buttons = new Float32Array(BUTTONS), axes = new Float32Array(AXES);
  const poll = () => {
    const pads = playerPads();
    for (let port = 0; port < PADS; port++) {
      const pad = pads[port];
      const keyboard = settings.keyboardPlayer === port;
      rumble(pad, port);
      buttons.fill(0);
      axes.fill(0);
      if (!settingsOpen) {
        for (const [, canon, , target] of CONTROLS) {
          let v = pad ? padValue(pad, settings.pad.binds[canon]) : 0;
          if (keyboard && settings.binds[canon].some((code) => code && heldKeys.has(code))) v = 1;
          if (!v) continue;
          const n = parseInt(target.slice(1), 10);
          if (target[0] === 'b') buttons[n] = Math.max(buttons[n], v);
          else axes[n] += target.endsWith('-') ? -v : v;
        }
      }
      Module.HEAPU8[connectedAt + port] = pad || keyboard ? 1 : 0;
      for (let b = 0; b < BUTTONS; b++) Module.HEAPF32[buttonsAt + port * BUTTONS + b] = buttons[b];
      for (let a = 0; a < AXES; a++)
        Module.HEAPF32[axesAt + port * AXES + a] = Math.max(-1, Math.min(1, axes[a]));
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

const SAVE_DB = 'lm-save-files', SAVE_STORE = 'cards';
function saveDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SAVE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SAVE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadSaves() {
  const db = await saveDb();
  return new Promise((resolve) => {
    const out = [];
    const cursor = db.transaction(SAVE_STORE).objectStore(SAVE_STORE).openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return resolve(out);
      out.push([c.key, c.value]);
      c.continue();
    };
    cursor.onerror = () => resolve(out);
  });
}
async function storeSave(name, data) {
  const db = await saveDb();
  db.transaction(SAVE_STORE, 'readwrite').objectStore(SAVE_STORE).put(data, name);
  log(`[page] saved ${name} to IndexedDB (${SAVE_DB})`);
}
function savePath(name) { return name.includes('/') ? '/user/' + name : '/user/GC/' + name; }
function restoreSaves(Module, saves) {
  for (const [name, data] of saves) {
    const path = new TextEncoder().encode(savePath(name) + '\0');
    const pathPtr = Module._malloc(path.length), dataPtr = Module._malloc(data.length);
    Module.HEAPU8.set(path, pathPtr);
    Module.HEAPU8.set(data, dataPtr);
    const ok = Module._sadx_restore_file(pathPtr, dataPtr, data.length);
    Module._free(pathPtr);
    Module._free(dataPtr);
    log(`[page] ${ok ? 'restored' : 'could not restore'} ${name} from IndexedDB`);
  }
}

const SHADER_CACHE_KEY = 'Cache/GLME01.uidcache';
async function starterShaderCache() {
  try {
    const response = await fetch('GLME01.uidcache');
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch { return null; }
}
function readWasmFile(Module, path) {
  const bytes = new TextEncoder().encode(path + '\0');
  const pathPtr = Module._malloc(bytes.length), sizePtr = Module._malloc(4);
  Module.HEAPU8.set(bytes, pathPtr);
  const dataPtr = Module._sadx_read_file(pathPtr, sizePtr);
  const size = new Int32Array(Module.HEAPU8.buffer, sizePtr, 1)[0];
  const data = dataPtr ? Module.HEAPU8.slice(dataPtr, dataPtr + size) : null;
  if (dataPtr) Module._free(dataPtr);
  Module._free(pathPtr);
  Module._free(sizePtr);
  return data;
}
function keepShaderCache(Module) {
  let saved = -1;
  setInterval(() => {
    const data = readWasmFile(Module, savePath(SHADER_CACHE_KEY));
    if (data && data.length !== saved) {
      saved = data.length;
      storeSave(SHADER_CACHE_KEY, data);
    }
  }, 15000);
}

async function startAudio(Module, ctx) {
  const workletRes = await fetch('lm-audio-worklet.js');
  const workletCode = await workletRes.text();
  const workletBlob = new Blob([workletCode], { type: 'application/javascript' });
  await ctx.audioWorklet.addModule(URL.createObjectURL(workletBlob));
  const node = new AudioWorkletNode(ctx, 'sadx-audio', { outputChannelCount: [2] });
  node.port.postMessage({ buffer: Module.HEAPU8.buffer, ring: Module._sadx_web_audio_ring() });
  node.connect(ctx.destination);
}

// ---------------------------------------------------------------------------------------------
// Engine Boot

async function start(audioCtx, ready = Promise.resolve()) {
  status('Stitching game code and binary parts...');
  const wasmBlobUrl = await prepareWasm();

  const params = new URLSearchParams(location.search);
  const video = params.get('video') || 'OGL';
  const displayCtx = $('display').getContext('bitmaprenderer');
  const saves = await loadSaves().catch(() => []);
  if (!saves.some(([name]) => name === SHADER_CACHE_KEY)) {
    const starter = await starterShaderCache();
    if (starter) saves.push([SHADER_CACHE_KEY, starter]);
  }

  status('Loading the game code and compiling shaders...');
  const Module = await createGame({
    canvas: $('canvas'),
    locateFile: (path) => {
      if (path.endsWith('.wasm')) return wasmBlobUrl;
      return path;
    },
    print: (t) => log(t),
    printErr: (t) => log(t),
    onMemoryCardWrite: (name, data) => storeSave(name, data),
    sadxPresent: (frame) => {
      window.sadxFrames = (window.sadxFrames || 0) + 1;
      fpsFrames++;
      if (window.sadxFrames === 1 && !graphicsResetShown) { overlay.classList.add('hidden'); status('Running'); }
      try {
        displayCtx.transferFromImageBitmap(frame);
      } catch (e) {
        frame.close();
        log(`[page] could not show a frame: ${e.message}`);
      } finally {
        if (framesInFlight) Atomics.sub(framesInFlight, 0, 1);
      }
      noteFrameGap();
    },
    sadxContextLost: () => showGraphicsReset(),
  });

  framesInFlight = new Int32Array(Module.HEAPU8.buffer, Module._sadx_web_frames_in_flight(), 1);
  watchGpuReset();
  window.sadxModule = Module;
  restoreSaves(Module, saves);

  const cpuClock = Number(params.get('cpuclock'));
  if (cpuClock > 0 && cpuClock <= 400) {
    const ini = `[Core]\nCPUThread = True\nOverclockEnable = True\nOverclock = ${(cpuClock / 100).toFixed(2)}\n`;
    restoreSaves(Module, [['GameSettings/GLME01.ini', new TextEncoder().encode(ini)]]);
    log(`[page] CPU clock ${cpuClock}%`);
  }

  keepShaderCache(Module);

  const pauseButton = $('pause');
  let paused = false;
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    Module._lm_set_paused(paused ? 1 : 0);
    pauseButton.classList.toggle('paused', paused);
    pauseButton.title = paused ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-label', pauseButton.title);
    pauseButton.setAttribute('aria-pressed', String(paused));
    if (audioCtx) (paused ? audioCtx.suspend() : audioCtx.resume()).catch(() => {});
    $('display').focus();
  });

  startInput(Module);

  if (!audioCtx) {
    const header = new Uint32Array(Module.HEAPU8.buffer, Module._sadx_web_audio_ring(), 3);
    setInterval(() => Atomics.store(header, 1, Atomics.load(header, 2)), 20);
  } else {
    startAudio(Module, audioCtx).catch((e) => log(`[page] audio unavailable: ${e.message}`));
  }

  status('Starting the game...');
  const debug = [params.get('debug'), params.has('noframelimit') ? 'noframelimit' : ''].filter(Boolean).join(',');
  await ready;
  Module.callMain(['/opfs/' + DISC_NAME, video, params.get('shaders') || 'spec', params.get('scale') || '1',
                   params.get('xfb') || 'tex', debug, bootPortMask]);
  $('display').focus();
}

let framesInFlight = null;
let fpsFrames = 0;
setInterval(() => {
  if (settings.showFps) $('fps').textContent = `${fpsFrames} FPS`;
  fpsFrames = 0;
}, 1000);

let gpuSentinel = null;
function watchGpuReset() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  gpuSentinel = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gpuSentinel) return;
  canvas.addEventListener('webglcontextlost', () => showGraphicsReset(), { once: true });
}

let graphicsResetShown = false;
function showGraphicsReset() {
  if (graphicsResetShown) return;
  graphicsResetShown = true;
  log('[page] WebGL context lost');
  overlay.classList.remove('hidden');
  message.textContent = 'The browser reset the graphics. Reload to keep playing; your saved games are kept.';
  startHint.textContent = 'Reload';
  startHint.classList.remove('hidden');
  startHint.onclick = () => location.reload();
}

let lastFrameAt = 0;
function noteFrameGap() {
  const now = performance.now();
  const gap = now - lastFrameAt;
  if (lastFrameAt && gap > 250) {
    const entry = `[hitch] ${gap.toFixed(0)} ms without a frame (last log: ${logLines[logLines.length - 1] || ''})`;
    (window.sadxHitches = window.sadxHitches || []).push(entry);
    log(entry);
  }
  lastFrameAt = now;
}
document.addEventListener('visibilitychange', () => { lastFrameAt = 0; });

function loadedModules(Module) {
  const ids = [];
  const read32 = (address) => {
    const ptr = Module._sadx_debug_guest_ptr(address, 4);
    return ptr ? new DataView(Module.HEAPU8.buffer).getUint32(ptr, false) : 0;
  };
  for (let info = read32(0x800030C8), n = 0; info >= 0x80000000 && n < 64; n++) {
    ids.push(read32(info));
    info = read32(info + 4);
  }
  return ids;
}
window.sadxLoadedModules = () => loadedModules(window.sadxModule);

// ---------------------------------------------------------------------------------------------
// Boot Execution

(async () => {
  if (!crossOriginIsolated) {
    message.textContent = 'This page needs cross-origin isolation for threads. Check your service worker (sw.js).';
    return;
  }
  const problem = await prepareDisc();
  if (problem) { message.textContent = problem; return; }
  keepStorage();
  if (new URLSearchParams(location.search).get('mute')) { start(null); return; }
  const audioCtx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  if (audioCtx.state !== 'running') {
    const resume = () => {
      audioCtx.resume().then(() => {
        removeEventListener('pointerdown', resume, true);
        removeEventListener('keydown', resume, true);
      }).catch(() => {});
    };
    addEventListener('pointerdown', resume, true);
    addEventListener('keydown', resume, true);
  }
  start(audioCtx, playIntro());
})();

function playIntro() {
  const video = $('intro');
  if (!video) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      video.pause();
      video.hidden = true;
      video.removeAttribute('src');
      video.load();
      if (!window.sadxFrames) {
        message.textContent = statusEl.textContent || 'Starting the game...';
        overlay.classList.remove('hidden');
      }
      resolve();
    };
    video.addEventListener('ended', done, { once: true });
    video.addEventListener('error', done, { once: true });
    video.hidden = false;
    overlay.classList.add('hidden');
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(done);
    });
  });
}

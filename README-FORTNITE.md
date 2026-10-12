# Fortnite Browser Arena for DillDoe

This is a standalone single-player browser adaptation using assets exported by
[omonkeyz/Fortnite-Rust](https://github.com/omonkeyz/Fortnite-Rust). Its match
simulation is newly written JavaScript. It is not a WebAssembly build of the
entire desktop runtime or a connection to official Fortnite servers.

## Install in the existing website

Merge this folder into the root of `MagiczLunchly/DillDoe` on its `App` branch.
Keep the existing website files that are not supplied in this folder. The changed
files are `games.html`, `vercel/game-guides.mjs`, and `cloudflare/build.mjs`.
New game files live under `games/fortnite/`, with `games/Fortnite.html` as the
library entry point. The existing Update website workflow builds and publishes
the site. No Cloudflare credentials are included or needed in the game itself.

The build change includes ES modules and 3D asset formats in the existing static
file copy step. Every game asset must remain below Cloudflare's 25 MiB per-file
limit. The game needs no server, multiplayer service, native installer, or
downloaded executable. All runtime requests are for the bundled same-origin files.

## Play locally

Serve this folder over HTTP with any static server. For example, from this folder:

    python -m http.server 8080 --bind 127.0.0.1

Open `http://127.0.0.1:8080/games/fortnite/index.html`. Opening `index.html`
directly as a `file://` URL does not support the module and asset requests.

## Controls

- WASD: move; Space: jump. No sprint.
- Mouse: look with pointer lock; left click: fire; right click: aim.
- Hold E: search chests or pick up consumables. Ammo and wood collect nearby.
- 1â€“3 or mouse wheel: select rifle, shotgun, or sniper; R: reload.
- Q: build a wall. F1–F4: build wall, floor, stairs, or roof for 10 wood.
- Escape: pause and release the mouse. Changing tabs pauses the match.
- Touch controls appear automatically on touch devices.

Defeat the 12 bots and survive the closing storm. Pickups restore health, shield,
ammo, or wood. The arena and match rules are a new adaptation; this build does not
contain the original island map, online matchmaking, or the official game modes.

## Checks

Run the simulation checks with Node.js:

    node --test games/fortnite/core.test.mjs

The original assets are data exports (GLB, PNG, JSON). Client EXE, DLL, installer,
and anti-cheat files are not part of the browser package. See `SAFETY-REPORT.md`
for the actual archive verification and scan results, including any limitations.

Three.js 0.180.0 is bundled locally, with its license in
`games/fortnite/vendor/THREE-LICENSE.txt`. Fortnite assets remain Epic Games'
property. This fan project is not affiliated with Epic Games.

The HUD uses original exported fonts, weapon/resource/building icons and minimap
artwork. Layout follows the early Fortnite reference. This is an approximation,
not a pixel-identical reproduction; the minimap artwork is illustrative and the
arena terrain is newly authored.

This update replaces the placeholder loot and player builds with exported original
meshes and materials, adds searchable chests and aimed item labels, and removes
sprint. Mouse capture is required on desktop. If the embedded preview blocks it,
open the localhost URL in Chrome or Edge. Map and POI replacement remains pending.

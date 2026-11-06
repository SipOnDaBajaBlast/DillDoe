# GameCube homebrew browser demo — emulator core notice

This directory contains **no game data**. No Nintendo code, assets, disc images or
keys are stored or served here. Any image a visitor loads is read locally in the
browser and never uploaded.

## Emulator core

`gecko/web.js`, `gecko/web_bg.wasm` and `gecko/web.d.ts` are a patched
[wasm-pack](https://github.com/rustwasm/wasm-pack) build of
[**gecko**](https://github.com/ioncodes/gecko), a GameCube/Wii emulator written
in Rust, licensed **GNU GPL, version 3.0 or later**.

- Upstream project: https://github.com/ioncodes/gecko
- Pinned upstream commit: `39e82205a0da154f23fd36b95e64a8029d468618`
- Local patch: [`gecko-web-disc.patch.txt`](gecko/gecko-web-disc.patch.txt) — the patch series
  from [yerry262/gamecube-web](https://github.com/yerry262/gamecube-web)
  (`emulator/gecko-web-disc.patch`), which adds:

  - disc-image boot in the web crate (ISO / RVZ / zipped ISO via `image::load_dvd`,
    booted through the IPL HLE apploader path; Wii discs are rejected),
  - a 2 MiB slot-A memory card with an in-memory backing store plus
    `get_memcard()` / `memcard_version()` so the host page can persist saves,
  - `set_pad_state(...)` so page-level touch and Gamepad input can drive the pad,
  - `get_perf()`, exposing smoothed `[fps, percent-of-native-speed]` to the page,
  - removal of the in-core egui perf overlay (the host page draws its own HUD).

`gecko-web-disc.patch.txt` is the complete corresponding source delta for the binary
in this directory: apply it to the pinned upstream commit to reproduce
`web.js` / `web_bg.wasm` exactly.

The page itself (`/games/GameCubeHomebrew.html`) is this site's own code and is not
part of the emulator.

## Local modification: memory ceiling

The vendored build declared a WebAssembly memory maximum of 8,192 pages
(512 MiB). The core copies the whole disc image into that memory, so no retail
disc could fit and every attempt aborted with an out-of-memory trap.
[`gecko/patch-memory-limit.py`](gecko/patch-memory-limit.py) rewrites that single
memory-section field to 65,536 pages (4 GiB); nothing else in the module is
changed. With it applied, a 1.03 GiB Wind Waker RVZ boots and measures about
10 fps (~18% of full speed), and the Swiss homebrew boot disc about 14 fps
(~23%). Run the script against the pinned build to reproduce the shipped binary.

## Homebrew test payload

The demo was validated with **Swiss r2073**, an open-source GPL GameCube
homebrew boot disc (`swiss_r2073.dol`, bundled in the upstream CubeDeck demo).
It was used only as a local test payload and is **not** committed here.

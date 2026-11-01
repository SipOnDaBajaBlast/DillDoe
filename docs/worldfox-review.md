# WorldBox / Worldfox integration review

Reviewed upstream: Shindo957-Official/worldfox on GitLab, commit 4f4833720b036d3340be3869f433d3a9b2c05b05.

- Microsoft Defender custom scan of all 53 downloaded files completed with exit code 0 and reported no threats. No native installer or executable is included.
- Inspected the launcher, loader/framework JavaScript, diagnostic scripts, service configuration, WASM imports, file inventory, and URL-bearing JavaScript. The runtime is a compiled Unity WorldBox player; the original gameplay source is not supplied, so this is not a full source-code security audit or a guarantee of safety.
- Replaced the original launcher’s mixed external CDN locations with local pinned assets. Removed the code that unregisters every service worker on the site.
- Added SHA-256 validation for every upstream file used by the build. The GitLab revision is fixed; upstream changes are not picked up automatically.
- The game is hosted on DillDoe’s separate game-file origin so its scripts cannot read the main website’s DOM or browser storage.
- Player CSP limits connections to the two DillDoe static origins, blocks workers, plugins and forms, and limits scripts to local scripts, launcher code and WebAssembly compilation. The embedding frame restricts popups, top navigation and downloads. No camera/microphone permissions are delegated.
- Split WASM, game data and audio are reconstructed as streams in their original order, with total size validation. Every source part is below Cloudflare’s 25 MiB file limit. No new dynamic download routes are required.
- Local browser test reached world generation and the tutorial; clicking advanced the tutorial. Fullscreen is supplied by the existing browser fullscreen API. A complete feature-by-feature playthrough and audible verification have not been performed.
- Static-plan, fast-publish, isolation and path compatibility tests: 12 passed. Runtime emitted the original Unity persistent-data synchronization deprecation warning; it did not prevent startup.

This report records checks, not a malware-free certification.


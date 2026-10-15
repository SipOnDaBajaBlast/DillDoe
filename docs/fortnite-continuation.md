# Fortnite browser continuation — release 15

Source lives under `outputs/fortnite-browser/games/fortnite` in the local workspace. Deploy only production files to `MagiczLunchly/DillDoe`, branch `App`; preserve unrelated website changes. Cloudflare Pages site: https://dilldoe-games.pages.dev/games/fortnite/.

This batch adds geometry-only city catalogs and original diffuse texture atlases for Performance mode, cuts city draw calls, removes Performance chest point lights, culls distant furnishings and loot, and speeds original triangle collision traversal. Original full textures load for Balanced/High. Performance defaults to six bots on the next match. Roads and native ground are indestructible to prevent holes. Hidden tabs stop rendering.

HUD uses newly extracted original 3.5 compass strip, hit indicator, directional damage alert, Victory Royale banner, storm icons, health/shield art and emote menu textures. Browser layout, interaction code and material effects remain implementations; this is not a complete 1:1 engine port.

Validation: 52 Node tests passed; 1,000 collision rays matched prior geometry results. Local in-app Chromium at 1280×720, same street position and 12 bots, measured about 63–64 FPS vs 20.6 FPS previously, approximately 84 vs 395 draw calls and 55 vs 425 GPU textures. Hardware dependent; no physical Chromebook benchmark yet.

Original source archive is locally at `C:/Users/Aiden/Downloads/Fortnite.7z`, MD5 `c09a1f652decf0faaa82c19c679413c9`. Original 3.5 PAKs and 1.8 source assets were scanned. Do not execute the old game client. UModel exports and packing scripts are under `work`. UI provenance: `work/og35-ui-original/asset-provenance.json`.

Next batch: original lobby scene (new lobby.mjs/lobby.css and assets/lobby) is prepared but NOT deployed in release15; integrate and visually test. User requests a continuous view-distance slider plus camera-frustum culling with a small prefetch margin after the current deployment. Settings styling is also in progress. Exact original island beyond Tilted, all original UI behavior, and later consume animations still require work.

Never publish qa/, qa.html, qa.mjs, test modules, source archives, tools, reports, or temporary export files. Deployment checkpoints: work/performance-ui-15-upload.json and work/performance-ui-15-blobs.json. Always verify the exact GitHub Actions commit and live website-version.json before claiming deployment completed.

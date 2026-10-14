# Fortnite browser continuation

Release: og-tilted-14. Website: https://dilldoe-games.pages.dev/games/fortnite/ . Repository: MagiczLunchly/DillDoe, App branch. Browser source and runtime assets are in games/fortnite/. The original client is not needed to play this browser adaptation.

Implemented in this release:
- Original Fortnite 3.5 Tilted Towers: 16 streamed source maps, 3,886 placements and 473 mesh templates. Three city GLBs remain below Cloudflare's per-file limit.
- Corrected geometry handedness/winding, original material assignments, asphalt and sidewalk layers, grass and cliff textures. Some Unreal material blending remains approximate.
- Original landscape heightfield and clipping beneath placed exterior ground, triangle collision/raycasting, roof landing, destructible city geometry, placed chests and loot.
- World minimap captured from the playable geometry, with matching player and storm coordinates.
- Original 3.5 bus models/textures and original Male_commando_Idle_2 crossed-arm lobby animation; reconstructed lobby IK removed. Bus camera follows mouse yaw and pitch.
- Performance (Chromebook), Balanced and High graphics profiles. Performance caps rendering at720p/DPR1, disables shadows, lowers terrain resolution and view distance. Animation updates occur once per displayed frame; distant bot poses are throttled. Actual Chromebook hardware has not been benchmarked.
- Warmer daylight, blue shadow fill, projected cliff textures and antialiasing. Default dance wheel, local XP/levels, usable settings, keybinds, original audio and previous combat/HUD work retained.

Validation: 49 Node tests pass, including city cover, movement, roof landing, heightfield interpolation and bus orbit. Browser checks showed original lobby pose, rendered city streets and aligned minimap with no console shader errors. Local QA helpers are excluded from production.

Known limits: this is not a complete1:1 Unreal port or the full island. Full UE terrain painting, baked lighting/postprocessing and some material behavior remain approximations. The next fidelity pass should compare building surfaces, foliage, sky, bus shading, original HUD spacing and emote-wheel silhouette against supplied references while retaining the Performance option.

Original source archive: https://archive.org/download/fortnite-4000805-3.5/Fortnite.7z . Verified downloaded MD5:c09a1f652decf0faaa82c19c679413c9. Original PAKs and official Gildor UModel exporter were Defender-scanned; original game executables were not run. Local extraction scripts and full source archive are outside this website repository; the converted browser assets are saved here.

# Task brief for an AI coding assistant — "Stillwater" (Three.js mobile FPS)

## Project
Static browser game (no server), deployed to GitHub Pages and wrapped as an Android APK with Capacitor. Owner plays on a phone browser first; desktop (Electron/Tauri) later.
Stack: Vite + React 19 (UI shell only) + Three.js (^0.186) + TypeScript strict. All gameplay is in plain TS under `src/game/`.

## File map
- `src/main.tsx` — mounts `<Game/>`, error log, blocks pinch/context menu.
- `src/game/Game.tsx` — HUD/menu/pause markup (ids `sw-*`), settings panel, crash screen.
- `src/game/engine.ts` — main loop, input (pointer + touch + keyboard), player, shooting, modes (menu/play/pause/dead).
- `terrain.ts`, `foliage.ts` (merged procedural trees/rocks), `actors.ts` (wolves), `atmosphere.ts` (sky/sun/fog), `audio.ts` (WebAudio synth), `noise.ts`.
- `settings.ts` (persisted options), `debug.ts` (error log), `SettingsPanel.tsx`.
- Upgrade pack modules (`adaptiveQuality`, `saveGame`, `gamepad` are already wired into engine.ts/Game.tsx; `assets` and `animation` are written but not yet used): `assets.ts` (GLB loader), `animation.ts` (mixer), `adaptiveQuality.ts`, `saveGame.ts`, `gamepad.ts`. See `INTEGRATION.md`.

## Hard rules
1. Must keep working on a mid-range phone (WebGL2): target 45+ fps, <200 draw calls, <5k triangles per prop, textures <=1024px, total download < 25 MB.
2. No server, no auth, no backend. `vite.config.ts` keeps `base: "./"`.
3. Every new asset must be CC0 or CC-BY; list authors in `CREDITS.md`. Never load assets from a CDN at runtime (offline APK): put files in `public/models`, `public/textures`, `public/audio`.
4. Never leave the screen black: failures must fall back (procedural geometry) and be logged via `debug.ts`.
5. `mergeGeometries` requires identical attributes: make parts non-indexed and delete `uv` (see `painted()` in foliage.ts).
6. Return complete files, not fragments; keep TS strict-clean; run `npm run build`.

## Tasks in priority order (do one, build, test, then next)
1. Use `assets.ts` + `animation.ts` for real GLB models (see `INTEGRATION.md` step 4). Adaptive quality, gamepad and save/continue are already wired.
2. Realism pass on the map: GLB pine/oak/rock/bush as `InstancedMesh` (wind sway in the vertex shader), PBR ground textures (grass/rock/snow blended by height+slope, triplanar), HDRI-based sky/ambient light, softer fog, cheap shadow for the sun only around the player.
3. Weapon: GLB rifle view-model with reload / fire / sprint animations, muzzle flash, shell casing, hit markers, recoil curve.
4. Wolves: GLB animated model (idle/walk/run/attack/death), navmesh or steering (Yuka), hearing/sight, group behaviour.
5. Audio: positional footsteps by surface (grass/rock/water), gunshot with tail, ambience; all small .ogg files.
6. Polish: loading screen with progress, minimap/compass, hunger/ammo pickups, difficulty option, localization (EN/FA).
7. Optional post FX (bloom, vignette, SSAO) behind the "high" graphics setting only.

## Acceptance checks for each task
- `npm run build` passes; game starts from the menu on a 390x844 and an 844x390 viewport; no console errors.
- Touch: left thumb stick moves, right drag looks, fire/jump/reload/sprint buttons work.
- Settings (sensitivity, FOV, volume, quality, invert Y, FPS counter) still work.

## Free asset/library sources
Models: quaternius.com, kenney.nl, polyhaven.com, poly.pizza, kaylousberg.itch.io. Textures/HDRI: ambientcg.com, polyhaven.com. Animations: Quaternius Universal Animation Library, mixamo.com (check terms). Audio: kenney.nl, freesound.org (check license), sonniss.com GDC bundle.
Libraries: three-mesh-bvh, @dimforge/rapier3d-compat, yuka, three-pathfinding, postprocessing (pmndrs), three.quarks, @gltf-transform/cli.
Reference code: github.com/Mugen87/dive (MIT, Yuka FPS AI), threejs.org/examples/?q=game#games_fps.

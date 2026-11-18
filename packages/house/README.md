# @huis/house

The house at Oude Terelststraat 15, shared by both games in this monorepo: [Little Rotors](../../apps/toy-flight/README.md) (`apps/toy-flight`, the multiplayer drone game) and [Little Defenders](../../apps/tower-defense/README.md) (`apps/tower-defense`, the tower defense). This package holds the Three.js world, lighting, doors, closets, collision, the exported game assets and the whole Blender → asset pipeline. The Blender sources live in [`models/`](../../models) at the repository root; the canonical file is `models/Huis_Oude_Terelststraat_15.blend`.

| Path | Contents | Import as |
| --- | --- | --- |
| `src/client/` | Three.js world, materials and batching, baked lighting, fixtures and drafts, doors, closets, fridge, laundry, comic/splat styles, quality tiers, sky, visibility | `@huis/house/client/<x>` |
| `src/shared/` | Collision, doors, closets, laundry, paint surfaces, world geometry and rooms, daylight, `vec.ts` | `@huis/house/shared/<x>` |
| `src/node/` | `houseCollision.ts`, `paths.ts` (`houseModelPath()`), `setupCollision.ts` (test preload) | `@huis/house/node/<x>` |
| `public/models/` | Exported assets; the games serve them at `/models` | — |
| `scripts/` | The Blender export, optimization, compression, bakes and verify scripts | `@huis/house/scripts/<file>` |
| `vite-plugin.ts` | Basis transcoder plugin and `housePublicDir` for the games' Vite configs | `@huis/house/vite` |
| `tests/` | House-only tests (`npm test`, `npm run test:lighting`) | — |

Run the scripts below from this directory (`npm run <script>`), or from the repository root with `npm run <script> -w @huis/house`. Paths in this README are relative to `packages/house` unless noted. Several checks below open the game in a browser; they use Little Rotors' development server (`npm run dev` from the root, http://localhost:5173) and its scripts in `apps/toy-flight`.

`npm run verify` runs every asset gate (`verify:paint`, `verify:collision`, `verify:textures`, `verify:backfaces`, `verify:ceilings`, `verify:volume`, `verify:visibility`). The root `npm run build` runs this package's typecheck and `verify` before building the games, so "`npm run build` checks …" below means these gates.

## Regenerating the game from the Blender model

Every game asset is generated from `../../models/Huis_Oude_Terelststraat_15.blend`. One command runs the whole chain in order, from this directory:

```sh
npm run pipeline:house
```

Blender is taken from `$BLENDER`, otherwise `/Applications/Blender.app/Contents/MacOS/Blender`; `npm run compress:house` also needs `toktx` (see [GPU texture compression](#gpu-texture-compression-and-visual-comparison) below). The pipeline checks both before starting. Each stage wraps the existing script and logs its wall time; a summary table follows the run.

| Stage | Produces |
| --- | --- |
| `export-house` | `house.glb`, `house-manifest.json`, `house-collision.json` and its inventory (Blender) |
| `oak-floor` | First-floor reference oak merged into `house.glb`; skipped when already integrated (Blender) |
| `stair-brick` | `stair-brick-continuous.png` and repaired stair UVs (Blender) |
| `optimize` | Losslessly packaged `house.glb` |
| `doors` | `doors.glb`, `doors-manifest.json`, `room-door-targets.json` (Blender) |
| `closets` | `closets-manifest.json`, refreshed collision and door targets; only with `--closets` (Blender) |
| `collision` | `public/models/house-collision.meshopt.bin`, `house-collision.json` |
| `windows` | `window-collision.json` |
| `compress` | `house-gpu.glb`, `house-gpu-manifest.json` |
| `backfaces` | `src/client/architecture-backfaces.json` |
| `paint` | `paint-surfaces.meshopt.bin`, `paint-surfaces.json` |
| `emitters` | `src/client/house-lamp-emitters.json`; skipped with `--no-bake` |
| `lighting` | `house-light-volume.{json,bin}` (seconds); with `--full-bake` also the classic bake (`house-baked-lighting.*`, 25+ minutes); skipped with `--no-bake` |
| `visibility` | `house-visibility.{json,bin.gz}` (about 15 minutes in headless Chrome); skipped with `--no-bake` |
| `verify` | Runs `verify:house` and `verify:ceilings` |
| `build` | The monorepo build from the root (typecheck, companion-asset integrity checks, production builds of both games) |
| `audit` | Comparison against a baseline snapshot; only with `--baseline <dir>` |

`--list` prints the stages, `--dry-run` prints the commands without running them, and `--only windows,paint` runs selected stages. When a stage fails, the pipeline stops and prints the resume command, for example `npm run pipeline:house -- --from compress`. `--skip-blender` runs only the Node stages, for when Blender is unavailable or the Blender outputs are already current. The closet inventory is curated, so `--closets` (off by default) is needed before the pipeline rewrites `src/shared/closets-manifest.json`. `--out <dir>` sets `PIPELINE_OUT`; currently only the audit reads it, and every other stage still writes into the package.

To check a fresh export against the committed one, capture a baseline before re-exporting and audit afterwards:

```sh
node scripts/audit-house-export.mjs --snapshot test-results/pipeline-baseline
npm run pipeline:house -- --baseline test-results/pipeline-baseline
```

The audit compares node, mesh, material and texture names; triangle counts per material; the oak and continuous stair-brick content; and the collision, door, closet, window, paint and lighting counts. It also reports hash changes, which are expected after an export. The audit fails if anything is missing or a triangle count drops by more than 0.5%. Run `npm run audit:house` on its own to repeat the comparison, and add `--json <file>` to save the result.

Afterwards, commit the regenerated `public/models/*`, `src/shared/*.json` and `src/client/*.json`. Never edit generated files by hand. Change the Blender file or the generating script, then rerun the affected stages. After a re-export, also rebake the tower defense placement grid (see the [Little Defenders README](../../apps/tower-defense/README.md#placement-grid)).

`HOUSE_BLEND=/path/to/copy.blend npm run pipeline:house` exports another file, for example a copy with a test object; `BAKE_QUALITY=quick BAKE_BOUNCES=1` shortens the lighting bake for such smoke tests. `scripts/export-material-overrides.json` lists image materials the exporter writes directly instead of baking their colour graph (the photographed oak floor, which keeps its world-aligned UV layer) and the base-colour calibration `optimize:house` applies to them. The old incremental merge scripts (`merge-reference-oak-floor.mjs`, `merge-reference-lights.mjs`, `merge-living-craft-desk.mjs`) are now no-ops on a full export because the canonical `.blend` already contains that content; the pipeline keeps the oak stage and treats "already integrated" as skipped.

The first full re-export after the 2026-10-05 lighting work (Blender 5.2.1, about 6 minutes for the export and 26 for the bake on an Apple M2) reproduced every node, material and texture name and the same collision, door, closet, window and paint counts. Its audit still flags triangle drops that are expected and correct: the previously packaged `house.glb` carried the reference light fixtures three times over (coincident copies from repeated merges, now once), and door leaves plus their hardware now live only in `doors.glb`. Refresh the snapshot with `node scripts/audit-house-export.mjs --snapshot test-results/pipeline-baseline` after accepting an export so later audits compare against it.

### Running the stages by hand

Export changes apply only to the game assets; the original model is not overwritten. See `scripts/export-house.py` for the reproducible asset pipeline. To regenerate assets after editing the house without the pipeline runner, run from this directory with Blender available on your PATH:

```sh
blender -b ../../models/Huis_Oude_Terelststraat_15.blend --python scripts/export-house.py
npm run optimize:house
npm run compress:house
npm run prepare:backfaces
npm run bake:lighting
npm run build --prefix ../..
```

On this Mac, Blender is `/Applications/Blender.app/Contents/MacOS/Blender`.

## The visual export

The visual export retains the canonical scene's original bevels, smoothing, small parts, planting, and embedded texture resolution. It also includes the lowered kitchen ceiling at the pendant canopy's mounting height. An export-only solid closes the kitchen plenum edge. The connected living-room, office and landing ceiling uses the existing upper slab underside, uniformly lowered from source Z 5.12 m to 5.07 m; the stair landing infill follows that plane and retains the authored opening. Separate living/office ceiling boxes are removed, and both first-floor WC spots follow the new mounting height. `scripts/ceiling-levels.json` and `scripts/interior-finishes.json` define these repairs for rendering and collision; the original Blender file is never saved. `npm run verify:ceilings` checks matching visual/collision heights and an open stairwell. `node scripts/level-first-floor-ceiling.mjs` applies this correction once to an older packaged export without re-exporting unrelated materials. The three upper bedrooms and bathroom retain their original authored ceiling meshes and materials through an explicit export allowlist, placed 3 mm below the coincident roof underside to avoid flicker. Presentation helpers and moving room-door leaves are omitted. Collision geometry is simplified separately; it does not control what is drawn. A small depth bias on structural front-infill plaster prevents coincident brick reveals and door profiles from flickering; their geometry and materials remain intact.

Packaging uses lossless buffer compression and deduplication, with no mesh simplification, vertex quantization, or texture resizing. Rendering partitions complete opaque triangles into adaptive spatial cells (starting at four game units), combines compatible materials and vertex layouts, and compacts each batch to only its referenced vertices. Bounds follow the actual triangles for tighter frustum culling; geometry is never clipped or simplified. Transparent and transmissive source ranges remain separate, unsplit batches for sorting. All texture channels and vertex attributes are retained. The provenance manifest records the source hash and export settings. Procedural Base Color graphs throughout the house are evaluated into separate color textures, preserving source coordinates and leaving solid colors and existing image materials intact. The optimizer rejects missing baked color textures before packaging. It also restores PNG alpha blending for the original bear and dragon wall decals, whose Blender transparency shader mix is not carried into glTF automatically. The browser uses AgX tone mapping with restrained neutral indirect light and weaker ground bounce, preserving subtle wall shades without global material tinting. Kitchen cupboard fronts and carcasses have a scoped `#fcf8ed` finish; their shared Camber source material elsewhere remains unchanged. Reference fixtures add three stair sconces, six kitchen spots, two spots in each WC, and warm cabinet strips in the kitchen and above the living-room acoustic panels. The `?lighting=live` comparison mode uses a fixed pool of four nearby spotlights with 512 px shadow maps, refreshed only when a slot moves to another fixture; three rectangular strip lights provide a continuous wash. The original daylight shadow map remains static. It does not reproduce Blender's Cycles lighting or every procedural surface effect.

The visual asset is 160.9 MB before HTTP compression. Its 52 procedural color bake records contain approximately 130 million texels (about 520 MB decoded RGBA before mipmaps); the living-room craft desk adds 13,570 triangles and one 4.59 MB embedded reference-photo texture. The photographed first-floor oak finish adds a 1,254×1,254, 2.29 MB texture across 372 replacement triangles; it supersedes the earlier living-floor and first-landing baked appearance while retaining those bake records as provenance. A single production headless Chrome client at 1440×1000 measured 22 FPS before these additions, with no runtime errors. This is location-dependent, not a hardware-independent benchmark. Full detail increases initial loading and GPU work; rendering and asset delivery still need optimization to meet the original performance target.

## Rendering options and comparison switches

The switches below are URL parameters of the game page (Little Rotors in development: `http://localhost:5173/`).

The renderer uses half-resolution glass refraction by default (`transmissionResolutionScale = 0.5`): one quarter as many pixels in that intermediate pass, while the main image, materials and hitboxes keep their existing resolution and geometry. Use `?glass=full` to restore full-resolution refraction. This can soften the scene seen through glass; it is an appearance tradeoff for visual review, not a measured FPS claim.

Selective back-face culling uses an offline eligibility manifest: preparation checks exact closed edges, consistent outward winding, positive volume in every connected component, and compatible normals. The browser applies only validated entries, avoiding the multi-second topology analysis during loading. The current manifest qualifies 4,998 meshes containing 1,400,852 triangles. It clones materials only for verified opaque solids and keeps their original two-sided shadow casting. Open surfaces, cutouts, glass and ambiguous geometry retain both sides. Use `?backfaces=off` to restore the previous two-sided rendering.

### Baked lighting

Baked lighting (format v3) precomputes two irradiance channels per vertex against the static house: warm **fixture** light from the 13 spots, 3 strips and 12 lamp emitters derived from the emissive lamp meshes (`npm run derive:emitters` writes `src/client/house-lamp-emitters.json`), and **daylight** from a uniform sky, a soft high sun and two bounces gathered from the surfaces each sample can see (the second gather reads direct plus first-bounce light, and `bounce.gain` stands in for further bounces). Glass is not an occluder, so daylight enters through the windows. Both channels are stored front/back as four bytes per vertex with a square-root curve, so dim pools keep their gradient. Sun, sky, bounce gain and the fixture tint live in `src/shared/daylight.json`, the only hand-authored lighting input; the bake hashes it. When the bake applies, the renderer creates no scene lights at all: the shader uses the baked channels as the only diffuse ambient term and the procedural sky (`src/client/skyEnvironment.ts`) only supplies reflections and the view through the windows. Moving doors, cupboard interiors, laundry machines, drones, paint and projectiles sample a 23×27×36 irradiance volume (`public/models/house-irradiance-volume.bin`, written by the same bake) at their world position, so they match the room they are in. Missing or incompatible baked data falls back to live lighting (`?lighting=live`: sun, hemisphere and four pooled spotlights).

Architectural faces (walls, ceilings, floors, plaster) refine to a 1.4 game-unit sample spacing (level 3 cap) within a hard limit of 150,000 added triangles; leftover budget refines fixture-lit furnishings. The bake runs on worker threads (`npm run bake:lighting`, about 26 minutes on an Apple M2 with seven workers, or a few minutes with `BAKE_QUALITY=quick BAKE_BOUNCES=1` for pipeline smoke tests) and reports its ray count. Indoor daylight is averaged over neighbouring samples on the same plane after the gathers, because a few dozen sky rays per sample would otherwise show as blotches on large walls; bright fixture pools keep their detail. Glass is rendered as cheap alpha-blended panes instead of refractive transmission, which removes Three's second opaque pass whenever a window is visible; `?glass=transmission` restores the original materials for comparison. Lamp lenses and diffusers render with a strong emissive and a small additive halo sprite (`?glow=off` disables the halos). Use `?lighting=live` to compare with the old live-light path, `?show=daylight|fixture|nospec|front` to inspect one baked term, and `?background=flat` to drop the sky cube map. The bake loses view-dependent fixture highlights and resolves light at vertex spacing, so very small pools can still look soft. Closed roller shutters, their backing panels and curtains are modelled as solid sheets in Blender; `src/shared/daylight.json` lists them as light-passing so the bedrooms read as daytime rooms.

The default toy style of Little Rotors does not use this bake; it needs only the lamp light volume (`npm run bake:volume`). See [Look and frame rate](../../apps/toy-flight/README.md#look-and-frame-rate) in the Little Rotors README for the styles and the visibility bake.

### Light drafts

Proposed fixtures live in `src/client/house-light-drafts.json` (same schema as the reference fixtures, plus a `fixture` kind for the generated trim or lamp body). Their trims and lenses are always drawn; open the game with `?drafts=live` to run them as real shadowed spotlights, scaled like the bake, and judge placement and brightness before committing to a bake. Edit the JSON, reload, and when a proposal is right run `npm run bake:lighting`; the bake hashes the drafts file and treats every draft as a fixture. To make accepted drafts part of the model, run `blender -b ../../models/Huis_Oude_Terelststraat_15.blend --python ../../models/game_light_fixtures.py -- --save`: it builds the lamps listed in `../../models/game_light_fixtures.json` as `Game lighting /` meshes and spot lights (add `-- --with-drafts` to include the drafts file as well; move accepted entries into that JSON), then `scripts/export-reference-lights.py` writes them into `src/client/house-light-fixtures.json` and the drafts file is emptied. The eight lamps added on 2026-10-05 (three spiral spot lamps, three recessed spots, the office wall washer and the veranda torch) were moved in this way.

### Lighting benchmarks

The lighting benchmarks are Little Rotors scripts. With the development server running (`npm run dev` from the root), run from the root `npm run bench:lighting -w @huis/toy-flight -- baseline` before a change and `npm run bench:lighting -w @huis/toy-flight -- v3` after, then `npm run bench:compare -w @huis/toy-flight -- baseline v3` (12 fixed views, median GPU and CPU milliseconds, draw calls; `LIGHTING_VIEWS=first-living,ground-stair` restricts a run). The Apple M2 GPU switches power states between runs, so a single view can differ by 30% between two identical runs; judge on the mean and on repeated runs.

### Companion assets

Regenerate both companion assets after changing the house export: run `npm run compress:house`, `npm run prepare:backfaces`, `npm run prepare:paint`, then `npm run bake:lighting`. Fixture, ambient-sampling or moving-part definition edits require a new lighting bake. `npm run build` checks that the texture variant, back-face manifest and lighting bake match the source files and bake inputs; it does not rerun the bake or topology proof. Neither preparation script overwrites the original GLBs, collision data or Blender file. `npm run pipeline:house` runs these steps in the correct order (see [Regenerating the game from the Blender model](#regenerating-the-game-from-the-blender-model)).

Comparison switches can be combined, for example `http://localhost:5173/?glass=full&backfaces=off&lighting=live`; append them with `&` when an invite already contains `?room=...`. Reload after changing a switch. These restore the three appearance options while retaining the earlier texture, batching, paint and allocation optimizations.

No additional visibility culling is performed during flight. Type checking, production build, companion-asset integrity checks and a CPU-only bake application check passed. No browser benchmark or broad test suite was run; final visual and FPS checks are intentionally left to the user.

## GPU texture compression and visual comparison

The game loads `public/models/house-gpu.glb` by default. This is a separate download variant of the original `house.glb` (KTX2 textures, quantized geometry), which remains unchanged for comparison and future exports. Open `http://localhost:5173/?textures=original` to use the original textures; open `http://localhost:5173/` for the compressed version. On a hosted game, use the same query parameter (or append `&textures=original` to an invite). Reload after changing modes; only one version is loaded at a time.

The current variant compresses 60 of 61 images (41 ETC1S, 19 UASTC); the one texture used as both colour and normal map keeps its original PNG. The download is about 68 MB (49.5 MB with brotli) instead of 159 MB, and the estimated texture payload including mipmaps is 177 MiB instead of 684 MiB. These are texture payload sizes, not total driver/GPU memory or an FPS improvement claim. With the Little Rotors dev server running, `/tests/texture-review.html` (`apps/toy-flight/tests/texture-review.html`) provides matching living-room, kitchen and Camber views with original/compressed links.

Install the official [KTX-Software tools](https://github.com/KhronosGroup/KTX-Software/releases), then run `npm run compress:house`. Set `TOKTX=/path/to/toktx` if the encoder is not on PATH. Each texture is first encoded as ETC1S (clevel 4, qlevel 255) and decoded again with KTX-Software's `ktx` tool (next to `toktx`, or set `KTX`); when it stays at or above 38 dB PSNR against the source it is kept, otherwise the texture is encoded as UASTC quality 3 with RDO (lambda 1) and Zstandard 19. Every texture gets a full mipmap chain and keeps its color-space assignment and transparency. Sizes are rounded to multiples of four (as KTX2 requires), and every texture except the stair brick sheet is capped at 2048 px. `upper_door_pale_oak_texture` stays an uncompressed PNG because its material uses the same photo as base colour and normal map; removing that normal-map link in Blender would let it compress. Geometry is then quantized by `scripts/quantize-house-geometry.mjs`: positions become normalized int16 per accessor (largest error 0.6 mm) and normals normalized int8. Node transforms stay unchanged; each primitive stores its dequantization in `extras`, and `src/client/houseQuantization.ts` restores float32 attributes right after loading. The script verifies that nodes, materials, textures, indices and UVs are unchanged. Material properties are untouched, collision data is hashed and checked unchanged, and textures whose color-space use is ambiguous retain their original encoding. Encoding results and PSNR measurements are cached under `node_modules/.cache/house-ktx2` (relative to the directory the script runs in, normally `packages/house`). The manifest also records a `geometrySha256` (`scripts/house-geometry-hash.mjs`: scene graph and decoded mesh data only); the visibility bake is keyed on it, so re-encoding textures only needs `npm run prepare:backfaces`, not a new visibility bake.

Run compression again after any script updates `house.glb`, including incremental furniture, floor or lighting merges, then rebuild. `public/models/house-gpu-manifest.json` records the source/output hashes, each texture's treatment and estimated texture memory for ASTC 4×4 / BC7 GPUs. Actual memory depends on the GPU's supported format; devices without suitable compression can fall back to RGBA. The games ship the matching Three.js Basis transcoder locally in both development and production (through `houseBasisTranscoder()` in `vite-plugin.ts`). The original asset's lossless packaging description above still applies to `house.glb`; the runtime variant intentionally uses lossy texture compression for lower GPU memory.

To validate the compressed model's repaired floors and UVs, run `node scripts/verify-house-surfaces.mjs public/models/house-gpu.glb`. Do not pass the original as that script's optional texture-equality baseline: its image bytes intentionally differ. The converter itself checks unchanged geometry payloads and scene/material properties before publishing its output. `npm run build` also checks the source, compressed-asset and collision hashes, rejecting stale variants without requiring the native encoder. With the Little Rotors dev server running, `npm run test:textures -w @huis/toy-flight` loads both variants in Chrome, checks texture dimensions/color spaces and GPU payload sizes, and saves matching room screenshots under `apps/toy-flight/test-results/textures/`.

## Floor-surface regression check

The floor-surface regression check (`npm run verify:house`) rejects leftover old kitchen/first-floor triangles, checks the 48 lowered first-landing wall caps, preserves the upper floor, and checks continuous reference-oak UVs. An optional baseline GLB argument also verifies texture pixels and material factors were retained. The latest artifact sweep and fixes are recorded in [`apps/toy-flight/VISUAL-AUDIT.md`](../../apps/toy-flight/VISUAL-AUDIT.md).

## Updating the reference lighting

The canonical Blender update is `../../models/reference_light_fixtures.py` (run on the house with `-- --save`; it creates a one-time backup). It reuses the existing Camber diffuser, retains the kitchen pendant, links the authored lowered kitchen ceiling into the house, and replaces the old ground-WC surface lamp. Fixture dimensions and spot layout are estimated from the photographs and room geometry.

After changing fixtures in Blender, run Blender on the canonical house with `--python scripts/export-reference-lights.py`, then `node scripts/merge-reference-lights.mjs` from this directory. This exports both the meshes and `src/client/house-light-fixtures.json`, preserving the previous house surface corrections. The merge verifies unchanged existing geometry, material references and texture bytes. Run `npm run verify:house` and the root `npm run build` afterwards. The small fittings use the existing wall/ceiling collision surfaces.

## Stair brick sheet

The stair material uses one continuous 4096×4096 color sheet sampled with the original metric Blender UVs. This replaces the old 2048×2048 atlas, whose many narrow wall islands produced visible broken courses. Regenerate it after a full house export with Blender `--python scripts/bake-stair-brick-sheet.py`, followed by `node scripts/repair-stair-brick-uv.mjs`. The repair checks every corner against the canonical wall position/normal and leaves all geometry and collision unchanged. The larger sheet adds approximately 48 MiB decoded RGBA before mipmaps relative to the old stair atlas.

## Doors and storage assets

Room doors use the original authored geometry in `public/models/doors.glb`, exported independently with `scripts/export-doors.py`. The generated `src/shared/doors-manifest.json` and shared `src/shared/door-motion.ts` supply matching animated component poses to the server and client. Regenerate fixed glazing collision with `npm run prepare:windows` after changing the house model. How doors, storage and windows behave in the drone game is described under [Doors](../../apps/toy-flight/README.md#doors) in the Little Rotors README.

Storage uses `src/shared/closets-manifest.json`, generated by the curated inventory in `scripts/closet-inventory.mjs` from an evaluated Blender audit. To refresh the storage inventory and its collision after source furniture changes, run from this directory:

```sh
blender --background --factory-startup ../../models/Huis_Oude_Terelststraat_15.blend --python scripts/closet-inventory.py -- --all --output /tmp/closet-source-inventory.json
node scripts/closet-inventory.mjs --source /tmp/closet-source-inventory.json
blender --background --factory-startup ../../models/Huis_Oude_Terelststraat_15.blend --python scripts/export-house.py -- --collision-only
node --import tsx scripts/prepare-door-targets.ts
```

`npm run pipeline:house -- --closets` runs the same steps as its `closets` stage.

## Whole-house solid collision

Flight collision now includes every visible mesh/curve in the playable house surroundings, regardless of furniture collection, object size, or triangle count. The exporter retains 6,971 static source objects (1,277,804 triangles), with hollow laundry geometry supplied at runtime, including small furnishings, bedding, chair shells, mats, lamps, and fixed glass. Bevel/subdivision modifiers remain disabled only for collision. Printed overlays and presentation helpers are excluded; moving doors and cabinet parts keep their runtime collision, and cabinet cavities stay hollow.

`src/shared/house-collision.json` stores shared vertex positions plus triangle indices to reduce duplication. `src/shared/house-collision-inventory.json` lists every object's triangle range and each excluded visual object's reason. Regenerate both with the existing Blender `export-house.py -- --collision-only` command. Landing regressions are in `apps/toy-flight/tests/solid-surfaces.test.ts`; the room connectivity test still reaches all 19 rooms and 13 spawns.

The expanded geometry also exposes authored cabinet travel intersections with previously non-solid trim, nearby seating, bedding, and hardware. The dense cabinet-clearance audit is therefore not clean; those layout/travel issues are not resolved by the static collision export.

With the expanded indexed mesh (1,311,800 triangles including runtime shells and glazing), the three-pilot 6,000-tick benchmark (`npm run benchmark -w @huis/toy-flight`) measured 2.447 ms p99 on this Mac, below the 16.667 ms simulation budget. This is a server simulation measurement, not a browser FPS measurement.

## Laundry appliance assets

The left appliance is the washing machine and the right appliance is the dryer. Their hollow bodies and circular drum openings share geometry across rendering, flight collision, and static paint surfaces.

`src/shared/laundry-source-names.json` identifies the fourteen replaced source pieces. Keep these out of the static Blender collision export; `src/client/laundry.ts` installs their runtime replacements. Regenerate paint surfaces after changes. `apps/toy-flight/tests/laundry.test.ts` covers collision, G interaction, door snapshots and stop/resume behavior; `apps/toy-flight/tests/laundry.browser.ts` verifies both machines in the full house and saves open/closed screenshots.

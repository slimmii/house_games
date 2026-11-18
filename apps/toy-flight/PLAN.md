# Toy Flight implementation plan

> Written before the monorepo split: house code, assets and pipeline scripts now live in [packages/house](../../packages/house/README.md), Blender sources in [models/](../../models) (formerly `output/blender`), and the tower defense in [apps/tower-defense](../tower-defense/README.md). Paths below are as they were in the original `toy-flight/` app.

Build a clean TypeScript browser multiplayer sandbox for 2–3 players (solo practice allowed), using the user's existing Blender house (`../output/blender/Huis_Oude_Terelststraat_15.blend`) as the continuous arena, with open doors, harmless paint, and fast random surface respawns.

## Flight revision

The user's follow-up supersedes automatic crash respawns: planes are 40% smaller, A turns left and D turns right, impacts gently stop or slide the plane, and only R requests a new spawn. Lower speed, faster braking, automatic pitch leveling, and steering while stopped make indoor flight easier. Prediction and authoritative movement share the collision response. Regression tests cover contact survival, steering away, left/right orientation, and leveling.

## Arena correction

The user clarified that the arena must be the actual Blender house. Replace the initially generated placeholder entirely with an optimized export of that model. Preserve all three floors, real room layout and furniture. Open door leaves in the gameplay export without modifying the original Blender file. Export matching collision triangles and validate stairwell connections, doorway clearance and surface spawns against the real geometry. Uniformly scale the environment to accommodate the toy planes.

## Architecture

- Three.js client, Vite build, Colyseus 0.17 Node server.
- One authoritative simulation per private room, 60 Hz physics and 20 Hz snapshots. Clients send bounded controls, never positions or hit claims.
- Shared exported house collision mesh with a BVH spatial index and flight math. Render prediction is disposable and corrected from snapshots; the server alone resolves outcomes.
- Private room IDs/invite links, three-player limit, bounded paint history/projectiles and input rate.
- Single Node service serves production assets plus WebSockets; Docker deployment.

## Agent ownership

| Agent | Owned files | Work |
| --- | --- | --- |
| Sol server | src/server/**, src/shared/simulation.ts, src/shared/collision.ts | Authoritative room, exact mesh collisions, flight, paint, respawn, benchmarks |
| Sol world | scripts/export-house.py, public/models/**, src/shared/house-collision.json | Export the canonical Blender scene, open doors, reduce asset cost |
| Sol client | src/client/main.ts, src/client/style.css, index.html | Lobby, networking, controls, HUD, game loop |
| Root | scaffolding, protocol, world metadata/rendering, tests/**, docs, integration | Contracts, asset optimization, geometry verification, three-browser testing |

## Acceptance

- Three real clients share identical authoritative state and paint; fourth is rejected.
- Late join receives current world paint; disconnects cleanly remove players.
- Doors are traversable; spawn points are collision-free and on surfaces.
- Controls, crash respawn, paint-hit overlay and invite links work in browser.
- Type checking, meaningful simulation/integration tests and production build pass.
- Demo starts locally with one command; production has health check, Docker recipe and clear limitations.

## Progress

- Server and shared flight: implemented; authoritative simulation, paint, respawn and three-client state equality verified.
- House: canonical Blender model exported and optimized; doors and garage opened. Exact geometry verifies 19 rooms and 13 supported spawns across all three floors. Original source SHA-256 remains unchanged.
- Client: actual-house loading, floor-aware map, lobby, HUD, controls and flight loop implemented. Three real Chrome clients passed flight, paint, respawn, join and leave checks with no runtime errors.
- Performance: focused Chrome client measured 60 FPS on Apple M2. Three-player authoritative simulation benchmark completed within the 16.67 ms tick budget; details in README.
- Final verification: 14 automated tests, typecheck, production build, and three-player production Chrome smoke test pass. Production health and compressed asset responses verified on port 2567. Final visual review removed the laundry door's leftover dark backing and loose hardware.

All three Sol agents have completed their assigned work. Root integrated their changes, corrected the Blender export selection, optimized transfer/rendering, and owns the running production demo.

## Visual-detail restoration

The user requested undoing visual simplification. Restore authored render modifiers, small parts, planting and original embedded textures. Keep collision simplification separate. Preserve full material identity and vertex channels in spatial render batches, and use lossless asset compression only. Keep open room doors and the smaller, easier-to-fly plane with gentle collisions.

Restoration completed: original render modifiers and detail geometry restored; Camber procedural oak finish baked at 4096px for browser rendering. The original Blender SHA-256 is unchanged. Typecheck, production build, 16 automated tests and the three-player production browser smoke test passed. Cabinet preview visually verified; no browser runtime errors. The detailed asset is 73.6 MB before HTTP compression, so initial loading is heavier than the simplified version.

Rendering performance remains a limitation after restoring full detail: production headless Chrome spot checks measured 17 FPS for one client and 7 FPS for three clients sharing this machine. Earlier 60 FPS measurements above describe the superseded simplified asset.

## Material-color correction

Sol generalized procedural Base Color baking to all 52 affected materials across 2,263 visible objects, preserving source texture coordinates and existing image materials. Root reviewed the implementation, added packaging validation, switched to Blender's AgX tone mapping, and added neutral indirect lighting and reflections. All 52 optimized textures are present and nonempty; 305 surviving solid-color materials match source factors with no mismatches. Browser previews confirm restored sofa fabric, timber flooring, oak furniture and kitchen stone in three room views without runtime errors. The Blender source and collision export hashes are unchanged. All 16 automated gameplay/multiplayer tests and the production build pass. The optimized asset is 154.2 MB, with a substantial GPU-memory footprint documented in README.

Final production browser check passed: the corrected model loads, room creation and flight work, departure succeeds, and no runtime errors occur. A single-client flight spot check measured 22 FPS. Production health is OK on port 2567.

## Surface flicker and kitchen ceiling

Reproduced the entrance stripes with shadows disabled: structural front-infill plaster shares planes with brick reveals and door profiles. A scoped depth bias on those backing materials resolves the conflict without changing geometry, textures or interior plaster. Verified frontal and oblique browser views.

Restored the existing `Kitchen ceiling for interior view` mesh from the source Blender file. Its underside is at 4.85 m, exactly matching the pendant canopy. The exporter now includes this specific interior-scene object in rendering and collision; the current colored GLB was patched with that original mesh without rebaking or changing textures. Collision now has 168,864 triangles. The new ceiling test confirms the mounting height and upward flight/paint collision. All 17 regression tests verified; the multiplayer startup check passed on retry after concurrent asset packaging completed. Build and four browser viewpoints pass with no runtime errors. All 52 color textures remain present, 305 solid colors still match, and the original Blender SHA-256 is unchanged. Production restarted on port 2567 with the updated collision mesh.

## Wall-decal transparency

The original bear and dragon PNGs retain their alpha channels, but their Blender Transparent/Principled shader mixes exported as opaque glTF materials. The optimizer now explicitly restores BLEND mode for those two named decals. Geometry and image pixels remain unchanged. Verified both production GLB materials, completed typecheck/build, and visually checked the bear in Chrome: the pink wall now shows through the transparent background with no browser runtime errors.

## Ceiling joins and whole-house visual audit

Reproduced the kitchen opening and the brick strip above the living/office front wall in Chrome. Kitchen's 4 cm presentation ceiling left an open plenum edge; structural slab underside at 5.12 m also sat 5 cm above the 5.07 m wall finishes. Export-only solids now close the plenum and connect the living/office ceiling to the walls, retaining the kitchen canopy height and clear door/stair routes. Bounds and explanations are kept in `scripts/interior-finishes.json`; render and collision use the same solids. The original Blender SHA-256 remains unchanged. Both reported views visually verified; all 18 tests and production build passed. Only 24 net collision triangles added.

Sol agent `/root/visual_audit` completed an audit of all 19 rooms, nine exterior views, and coincident geometry. Root reviewed the contact sheets and targeted closeups. The confirmed additional finding was four omitted authored upper-room ceilings; these exact meshes/materials are now restored through an explicit allowlist with collision. Browser verification exposed coplanarity with the roof underside, so the restored ceiling objects receive a 3 mm downward clearance in the export. No other visible open joins were reproduced. Coincident concealed/stable faces are retained as low-priority audit data, not automatically removed. All 19 tests and the production build pass after the restoration; source Blender SHA-256 is unchanged.

Final browser verification confirms all four restored ceiling finishes render without coplanar flicker after the 3 mm clearance; roof exterior is intact. Audit and root verification are recorded in `VISUAL-AUDIT.md`.


## Living craft desk and landing flicker — 2026-10-01

Root modelled the reference desk in the canonical Blender file: two drawer pedestals, tabletop, heart painting using the reference photo, mushroom stool and selected craft clutter. The original source was backed up as `Huis_before_living_craft_desk_20261001.blend`; verification confirms all 9,107 original objects unchanged. New collection `01 / Furniture / living craft desk` contains 163 meshes. Sol integrated it into the game with 13,570 render triangles and one embedded photo texture, preserving all 52 baked materials, decal transparency and seven ceiling repairs. Collision includes the desktop, cabinet bodies and stool seat, with usable knee space and clear kitchen access.

The reported upper stair landing flicker was reproduced at grazing camera angles and fixed by lowering only the conflicting wall/lintel top caps by 12 mm in the export clone. Root reviewed the desk and landing game screenshots. All 20 tests, typecheck and production build pass; all 19 rooms and 13 spawns remain connected. Production restarted on port 2567. Current source SHA-256: `4c731fb1d8449da965fa3647d5ab0b33c2bcda59d7e81f19c45b5123704aa9ab`. Final optimized GLB: 159.0 MB; existing loading/GPU performance limitations remain documented in README.


## Reference oak flooring — 2026-10-01

Root replaced the first-floor living/kitchen/landing timber material and UV mapping in Blender using a photo-referenced oak texture. Eight 28 cm boards span a 2.24 m repeat, with 2 m long staggered courses along house Y. Dimensions are estimated from the photos. The floor material uses a linear .55 multiplier, verified in Blender and in the actual game asset. The packed texture and built-in image-generation prompt/provenance are under `output/blender/textures`. A pre-floor-change source backup is retained. All 9,272 objects retain their original geometry and transforms; only four source objects received material/UV changes.

Sol incrementally replaced the three game floor surfaces, retained the original stair-opening edge, verified world UV continuity below 1e-7 and removed duplicate incoming edge geometry. The fourth source section is review-only. Root reviewed Blender and final game screenshots. Collision remains byte-for-byte unchanged, all 20 tests passed, and the final material update passed optimization/typecheck/build. Blender's incremental glTF exporter omits the MixRGB tint, so `scripts/calibrate-reference-oak-floor.mjs` reapplies the source .55 factor during this incremental workflow. Final source SHA-256: `9805a5701c7932e6e1df45467344fe8bcd3a6f9427d2e7e83199c154dcd29fc9`. GLB: 160,911,184 bytes. Production restarted on port 2567 with the verified asset.

## Hover-drone refactor — 2026-10-01

Root replaced airplane dynamics and visuals with a palm-sized guarded quadcopter. Shared controls now separate forward/back, strafe, lift, yaw, aim and precision. Velocity is authoritative and included in deep-copied snapshots; neutral input brakes to exact hover, and swept contact removes only velocity into the wall so sideways motion/backing out remain possible. Maximum horizontal speed is 2.4 game units/s, vertical speed 1.8, with a 0.35 precision multiplier. The drone's maximum mesh radius is 0.1505 against a 0.16 collision radius.

The root-generated Three.js model has four counter-rotating rotors, rounded colored shell, rubber guards, landing feet, status lights and an independently aimed camera/paint nozzle. Stationary parts share cached material batches; only four rotor blades animate. The close chase camera sweeps against the house after smoothing; aim projects to the reticle. Client prediction is re-anchored to authoritative snapshots with at most 120 ms extrapolation; remote players interpolate server snapshots. UI, help, icon and README now describe Little Rotors and the new controls. House model/materials remain unchanged by this refactor.

Sol `/root/drone_tests` updated and ran the 22-test suite, including three real clients receiving identical snapshots, hover/timeout, directional controls, normalized cruise speed, precision and backing away from a wall. Root reviewed and requested stronger steady-state movement assertions; the updated simulation suite passes. Sol `/root/drone_browser` owns browser/control/visual validation and the server performance benchmark. Browser verification remains in progress until recorded below.


Final drone verification: root reviewed the gameplay screenshots and the corrected compact quadcopter model. The final model uses 10 draws, with four independent rotor blades and clear guard/body spacing. Build/typecheck pass. Sol browser smoke passed the foreground full-house controls and three-client networking with zero runtime errors; to bound memory, two auxiliary browser clients used an explicitly opted-in empty visual house, while retaining real drone/client/network code. This is not a three-full-house rendering stress-test. The three-client protocol test independently verifies identical snapshots. Browser captures showed 20–25 FPS, final headless readout 12 FPS; the large house remains a rendering limitation. Server p99 tick: 0.4055 ms. Details in `test-results/drone-validation.md`. Production rebuilt and restarted after the final visual-only body narrowing.


## Continuous movement and mouse controls — 2026-10-01

Root replaced snapshot-anchored extrapolation with continuous 60 Hz local prediction and acknowledged input replay. The server consumes bounded input batches at one command per simulation tick, validates absolute mouse aim and acknowledges consumed commands. Local rendering interpolates simulation steps and eases reconciliation error only. Remote players use a 100 ms snapshot buffer with a gently adjusted render clock. Frame catch-up now retains up to 250 ms instead of discarding movement time below 20 FPS.

Mouse look plus WASD is the primary control scheme, with Space/C for height, Shift for precision, and automatic braking to hover. First-person view removes chase-camera lag; V retains an optional collision-aware chase view. Pointer capture begins only on a trusted click, without firing paint; Escape, blur and hidden tabs release controls. Keyboard steering remains available. Render pixel ratio is capped at 1 to avoid excess retina fill cost while preserving the house geometry and textures.

Root owns the input, prediction, network and camera refactor. Sol `/root/drone_tests` owns focused simulation and reconciliation tests; Sol `/root/drone_browser` owns real-browser controls and multiplayer validation. All 29 automated tests, typecheck and production build pass. Root caught and corrected a floating-point catch-up boundary at 24 FPS; render-rate tests now exercise the exact production condition. Browser validation passed pointer capture, mouse steering, both views, Escape braking, paint and three-client leave/rejoin with zero runtime errors (one full house plus two explicitly lightweight auxiliary renderers). Root also tightened static material batches from 12 to 6 game units to improve off-screen culling without altering any house geometry or material. The final production server is running on port 2567 with a healthy response.


Final single-client diagnostic: one full house, no auxiliaries, 42.36 FPS over six seconds; median frame time 16.7 ms, p95 33.4 ms, no runtime/request errors or in-window long tasks. The random viewpoint faced a nearby wall, so this verifies operation of the final renderer but not visual completeness or house-wide performance. The earlier three-client smoke and deterministic tests cover controls/network behavior. Full diagnostic limitations are retained in `test-results/drone-validation.md`.


## Full-house artifact follow-up — 2026-10-01, evening

Two Sol agents completed a geometry/export investigation and room-by-room browser audit under root review. Confirmed kitchen striping came from ten superseded floor-shell triangles surviving a height cutoff; confirmed first-landing white slivers came from 48 wall caps at the oak finish height. Both packaged geometry and reproducible export/replacement paths are repaired. Added `npm run verify:house` regression coverage; the pre-repair asset fails and the new asset passes. Texture images, material factors, all unrelated geometry, canonical Blender and collision remain unchanged. Root reviewed the final clean closeups and published matching verified production assets. See `VISUAL-AUDIT.md` for coverage, evidence and limits.


## Subtle cupboard finish and lighting balance — 2026-10-02

Kitchen cupboard fronts, carcasses and integrated cabinet bases now clone their shared Camber material with sRGB base color `#fcf8ed` before batching. Other furniture, handles, stone and textures retain their source materials. Reduced environment intensity from 2 to 1.1 and hemisphere intensity from 0.3 to 0.18, with neutral gray ground bounce instead of equal white fill above and below. Daylight, exposure, AgX, static shadows and geometry remain unchanged; no additional lighting or postprocessing passes.

Compared three lighting balances at identical cameras in the kitchen, living room, Camber dining area, ground laundry and two upper bedrooms. Reviewed final captures and confirmed cupboard material color plus unchanged Camber linear color in the browser. Typecheck, production build and house surface verification pass. Public and built house GLBs retain SHA-256 `3b96e832c523d7a1ea7b466952047facfb31d9ef0188bc6c5176c8c1455cb1e6`. Diagnostic comparisons and material verification are under ignored `test-results/lighting/`.


## Photographed light fixtures and cabinet strips — 2026-10-02

Added 57 editable fixture meshes to the canonical Blender house: two curved stainless/opal stair sconces, one square upper-hall fitting, six recessed kitchen spots, two recessed spots in each WC, and two continuous kitchen under-cabinet strips. Added illumination to the existing Camber strip above the acoustic panels rather than duplicating its mesh. The kitchen pendant remains. The old ground-WC surface lamp is removed; the original kitchen ceiling is linked into the canonical house so fixtures are supported in Blender as well as the game. Source fixture script, backup and verification reports are in `output/blender`. Layout and sizes are estimates, not supplied measurements.

The incremental export carries meshes plus 16 source-derived light definitions. Runtime illumination uses four nearby shadowed spots, with hysteresis and a short fade when reassigning slots, plus three continuous area lights. Shadow maps are static until a slot changes fixture. This bounds lighting cost independently of the total source fixture count. No simulation, multiplayer or flight controls changed.

Verified nine browser views (kitchen ceiling, both kitchen strips, living strip, both WCs and all three stair fixtures). Corrected the initial middle-sconce placement at a brick/plaster boundary, reduced shadow acne on cabinet fronts and tuned strip brightness without changing furniture materials. Diagnostic results are in ignored `test-results/fixtures/`. Blender preservation check confirms 9,271 original objects unchanged, with only the replaced ground-WC surface lamp removed. The game merge confirms 6,822 existing nodes and all 61 texture images preserved.

The user flagged broken brick courses during the fixture review. Replaced the stair material's fragmented 2048² bake atlas with a single 4096² sheet evaluated from the original Blender brick colors. Restored all 1,104 UV corners by matching source world positions and normals; vertical coordinates follow the corrected game geometry. Maximum source-position mismatch is 6.1e-8 m; reconstructed course-height error is below 2.4e-7 m. All three stair levels were visually rechecked, including a lights-off view. The original Blender material and UVs remain intact. Typecheck/build and existing floor/ceiling surface verification pass. Nine final diagnostic views averaged approximately 16.5–19.8 ms per frame in one local headless Chrome client; these close views are not a house-wide performance guarantee.

Final production check: updated house loaded on port 2567 and joined a real multiplayer room with no browser runtime errors. Static assets and source asset hashes match.

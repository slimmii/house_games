# Full-house visual geometry audit

> Written before the monorepo split: house code, assets and pipeline scripts now live in [packages/house](../../packages/house/README.md), Blender sources in [models/](../../models) (formerly `output/blender`), and the tower defense in [apps/tower-defense](../tower-defense/README.md). Paths below are as they were in the original `toy-flight/` app.

Date: 2026-10-01. Initial inspection opened the source read-only. Subsequent export repairs and verification are recorded below. The later, user-requested craft desk was added to the canonical Blender file after backing up the original; all 9,107 pre-existing objects were verified unchanged.

## Scope and method

- Reviewed all 19 room bounds from `src/shared/world.ts` with two opposing in-room browser cameras, plus nine front/rear/side/roof facade cameras. Contact sheets and full-resolution captures are in `test-results/visual-audit/`.
- Inspected 686 runtime mesh batches and all 2,807,232 triangles in the current optimized GLB. The coincident-triangle inventory is reproducible with `node test-results/audit-glb-overlaps.mjs`.
- Opened the canonical Blender source in background/read-only mode and recorded exact evaluated mesh bounds and exact-coordinate duplicate groups. Reproduce with Blender `-b ...blend --python test-results/audit-source-duplicates.py`.
- Treated open room doors, the garage/entrance openings, stair voids, and the veranda opening as intentional gameplay changes. The kitchen lowered-ceiling and first-floor office/living ceiling fixes were being handled independently and are excluded as findings here.

## Confirmed actionable finding

### P1 view-dependent flicker: wall and door-lintel top caps intersect the upper landing floor

A moving grazing camera at the upper spiral landing reveals white triangular strips through the timber floor. The static room views missed this. The landing timber patch correctly stops at the fitted stair-hole edge; the conflict comes from upward-facing Warm white plaster caps on the first-floor wall and stair-door lintel below, exported at source Z `5.310 m`, coplanar with `2 / floor finish`.

The ray-hit portion is `Stair photo / white plaster lintel above door`, top polygon 5, spanning source X `1.945–2.745`, Y `5.160–5.300`, Z `5.310`. It joins cap triangles on `first / source masonry 038/039` to its right and `040/041` to its left. For example, `first / source masonry 040` contains `[(1.944947,5.300110,5.310),(0.330738,5.300110,5.310),(1.944947,5.160480,5.310)]`; its game coordinates are `[(5.83484,15.93000,-15.90033),(0.99222,15.93000,-15.90033),(5.83484,15.93000,-15.48144)]`.

Minimal robust fix: in the export clone, sink the lintel and adjacent wall top ring to the upper floor-finish underside at source Z `5.298 m`. This preserves the visible wall underside and closed solids while giving the timber finish 12 mm clearance. The analogous first landing has ground-masonry caps at Z `2.410 m`; lower those to its finish underside if a moving-camera check reproduces flicker there. Do not apply polygon offset to the shared Warm white plaster material globally.

Repair: `export-house.py` now applies that 12 mm export-only clearance to the stair-door lintel and the proven adjacent `first / source masonry 038–069` top rings. The current packaged GLB received the matching vertex repair without rebaking textures. Established upper north/south grazing views are clean; the first-floor south view remains clean and unchanged. The asset still has 60 textures, 367 materials, both decal materials remain `BLEND`, and all 52 procedural bake records remain in the manifest.

### P1 visual fidelity: four upper-floor authored ceilings were omitted from the game export (restored)

The upper-bedroom and bathroom captures show the darker structural roof underside rather than the authored room ceilings. The source meshes exist, are visible, and close the rooms at source Z ≈ 8.11 m, but three unique ceiling materials are entirely absent from the runtime scene. The fourth material (`Small bedroom / warm white lacquer`) survives only because it is also used by other furniture/finishes; its ceiling mesh is not separately present.

Exact source objects and source-coordinate bounds:

| Room | Source object | Min XYZ | Max XYZ |
| --- | --- | --- | --- |
| Bedroom 1 | `Bedroom 1 / room ceiling` | `[2.921, 0.280, 8.109]` | `[7.100, 4.980, 8.137]` |
| Bedroom 2 | `Bedroom 2 / ceiling` | `[2.920, 5.120, 8.110]` | `[7.101, 8.720, 8.135]` |
| Bedroom 3 | `Small bedroom / ceiling` | `[0.280, 0.280, 8.110]` | `[2.780, 3.240, 8.135]` |
| Bathroom | `Bathroom photo / bathroom ceiling` | `[0.280, 6.540, 8.110]` | `[2.780, 8.720, 8.135]` |

Evidence: `floor-2-contact.png` (all four rooms), `structural-bounds.json`, and `audit-scene.json`. The adjacent `Stair dome / taupe ceiling surround` is present, so the omission is scoped to the four room-ceiling objects rather than the entire upper ceiling level.

Repair: root restored all four original meshes and materials through an explicit export allowlist and included them in collision. The first browser check exposed coplanarity with the roof underside, so the exported ceiling objects are now placed 3 mm below that plane. The original .blend remains unchanged. Collision tests verify the resulting underside heights and the full 19-test suite passes. Final browser evidence is recorded below.

All four materials are export-safe solid Principled BSDF inputs with no linked Base Color: Bedroom 1/2 `[0.907547, 0.883180, 0.819964, 1]`, Bedroom 3 `[0.859174, 0.851252, 0.812241, 1]`, and bathroom `[0.843370, 0.804559, 0.722672, 1]`.

## Coincident geometry inventory (not confirmed visible defects)

The GLB contains 3,002 repeated triangle-coordinate keys (3,392 extra triangles); 490 keys use different materials. Coordinates were rounded to 0.0001 game units for this inventory; matches are candidates, not proof of harmful overlapping surfaces. Most are degenerate decorative triangles, intentionally layered tiny decor, or fully occluded construction faces. Targeted browser closeups did not show flicker at the largest architectural cases, so they should not block the current repair:

- Warm white plaster vs stair brick at game `[0.9906, 7.2315, -13.5382]` and `[0.9906, 15.9300, -13.5382]` (source ≈ `[0.3302, 4.5127, 2.4105/5.3100]`). These coincide at the two spiral-stair floor interfaces. `defect-stair-floor1.png` and `defect-stair-floor2.png` were stable.
- Camber interior Acacia vs natural Casella oak on concealed/edge faces around game X `20.7981`, Y `10.08–12.58`, Z `-9.61…-18.84`. `defect-camber-overlap.png` was stable.
- Office noticeboard vs white cabinet backing has small coincident edge triangles around game X `1.08/4.075`, Y `9.52–11.40`, Z `-1.44…-9.60`. The frontal view was stable.

Candidate cleanup: remove the hidden member of each pair during export or offset the intended decorative layer by 0.5–1 mm. Use material-scoped polygon offset only if removing geometry is unsafe. These are low priority unless motion testing reproduces shimmer.

## Room-by-room result

| Floor | Rooms checked | Result |
| --- | --- | --- |
| Ground | Entrance; cloakroom & stairs; laundry; ground bedroom; shower room; dressing; bicycle room | No open wall/slab joins found. Door openings and stair void are intentional. Dressing cabinetry limits sight lines but visible perimeter joins are closed. |
| First | Office; living room; landing; WC; kitchen; veranda | No additional open joins found after excluding the ceiling repairs handled by the main task. Kitchen green rear-wall lines are stable authored paint-piece/window-reveal boundaries, not flicker. Veranda glazing/open connection is intentional. |
| Upper | Bedroom 1; Bedroom 2; Bedroom 3; landing; storage; bathroom | Walls, floor edges, windows, and stair opening stitch. Four room ceiling finishes were restored and checked as detailed above. Stair dome surround is present. Storage brick enclosure and open stair void are intentional. |

## Facades and exterior joins

Front, rear, both sides, four obliques, and roof were checked. The front entrance and garage/bicycle-room openings, rear veranda opening, stair/terrace geometry, and side cladding transitions are coherent with the gameplay export. No daylight crack or detached facade component was reproduced. The thin kitchen rear-wall vertical lines land on the source paint segmentation at X ≈ 0.86 m and 2.54 m around the window/reveal and remain stable under a closer oblique view (`defect-kitchen-rear-seams.png`).

## Evidence index

- `floor-0-contact.png`, `floor-1-contact.png`, `floor-2-contact.png`: opposing views for all 19 rooms.
- `exterior-contact.png`: nine exterior/roof views.
- `defect-*.png`: exact-coordinate closeups for coincident geometry and kitchen seams.
- `audit-scene.json`: runtime mesh/material/bounds inventory.
- `glb-coincident-triangles.json`: full coincident triangle report.
- `source-exact-duplicates.json`: read-only source duplicate-coordinate scan; many entries are repeated authored hardware/decor and should not be treated as defects without visual reproduction.

## Audit limitations

This is a sampled visual audit plus geometry inventory, not a guarantee that every hidden surface is defect-free. Each room has two selected viewpoints; large furniture can obstruct small areas. Closeups checked the main overlap candidates, but they do not replace continuous motion checks from every flight path. No further visible building gaps were reproduced in the inspected views.

## Final repair verification by root

- Kitchen plenum opening and living/office exposed brick band: fixed and visually checked from the reported corners and normal flight height.
- All four restored upper ceilings: visually checked after the 3 mm clearance correction; no roof/ceiling depth flicker remained in those views. Exterior roof remained intact.
- Evidence: `test-results/office-front-fixed.png`, `test-results/kitchen-entry-join-fixed.png`, `test-results/upper-bedroom1-ceiling-fixed.png`, `test-results/upper-bedroom2-ceiling-fixed.png`, `test-results/upper-bedroom3-ceiling-fixed.png`, `test-results/upper-bathroom-ceiling-fixed.png`, `test-results/roof-after-ceiling-restoration.png`.
- Typecheck, production build and all 20 automated tests pass. Collision has 170,590 triangles; all 19 rooms and 13 spawns remain connected. All 52 procedural material textures and both decal alpha modes are preserved. The living craft desk adds 13,570 render triangles and one 4.59 MB embedded photo texture; the optimized GLB is 159.0 MB.
- Original backup SHA-256: `60e9acf6c608d81fec4f1deb972d67548a0b35d66f0130750b73612667c77c64`. Canonical source after the desk addition: `4c731fb1d8449da965fa3647d5ab0b33c2bcda59d7e81f19c45b5123704aa9ab`.
- Root reviewed the desk front/oblique game previews and upper landing grazing views. The desk retains clear knee space and kitchen access; the reported white landing strips are absent from the repaired views. Production restarted with the final asset and collision mesh.


## Drone-height artifact sweep and repair — 2026-10-01, evening

Root coordinated two Sol agents: geometry investigation/export repair and deterministic browser inspection. The fresh sweep captured 38 initial room views, 38 collision-cleared opposed room views, 38 ceiling/perimeter views, and targeted grazing/diagnostic views across all 19 rooms. Root reviewed the room/ceiling contact sheets and final repair closeups. Obstructed or camera-embedded views were replaced and excluded from conclusions.

Two visible defects were confirmed and repaired:

- **Kitchen striping:** the earlier incremental oak replacement removed old floor triangles only below game Y 7.25. The kitchen shell reaches Y 7.254, leaving 10 old top/side triangles competing with the new oak. Both merge and cleanup scripts now include the whole kitchen shell. The retained superseded triangles were removed from the live asset; the new floor geometry, UVs, material and elevation are unchanged. Before repair, 104 sampled rays found old and new materials at exactly the same kitchen top height. The repeated ray grid now finds zero old kitchen-top hits.
- **First-landing white slivers:** ground masonry objects 036–083 ended at the same height as the oak finish. Their concealed top rings now sit at source Z 2.398 rather than 2.410, matching the finish underside while keeping the wall solids closed. This changes 210 Y coordinates in 48 packaged meshes. The export pipeline applies the same named-object repair in memory, including its normal and collision-only manifest branches.

`npm run verify:house` rejects stale first-floor triangles, checks all 48 lowered caps, confirms all three oak surfaces and their world UV continuity, and ensures the untouched upper floor remains. It passes on the repaired asset and rejects the pre-repair asset. Running with an optional baseline additionally confirms identical texture image hashes and material factors.

Preservation comparison retained all 6,823 scene nodes. Only the 10 obsolete triangles and 210 named cap coordinates changed; all other vertex attributes and index buffers are unchanged. All texture pixels and material factors are unchanged. Canonical Blender SHA remains `9805a5701c7932e6e1df45467344fe8bcd3a6f9427d2e7e83199c154dcd29fc9`; collision SHA remains `e09879c984d86e652806d55d1d59bd53c0c561efb7722b74b52054e88455e995`. Current public and production GLBs match SHA `3b96e832c523d7a1ea7b466952047facfb31d9ef0188bc6c5176c8c1455cb1e6`.

Build/typecheck, Python syntax, surface regression and preservation checks pass. The production health check is healthy; the updated asset is served on port 2567. The prior upper-landing, ceiling and decal repairs remain present. Detailed normal views reproduced no further visible defect; near-duplicate masonry remains an inventory candidate unless it causes a normal-render artifact. This is systematic sampled coverage, not a guarantee about every hidden surface or possible viewpoint.

Evidence: `test-results/artifact-audit/report.md`, `verification.json`, `preservation.json`, `after-threshold-1.png`, `after-threshold-grazing.png`, `after-first-cap-1.png`, `after-first-cap-3.png`, and the safe room/ceiling contact sheets.

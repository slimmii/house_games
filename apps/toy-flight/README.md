# Little Rotors

A small, nonviolent multiplayer toy-drone sandbox set in the existing Blender model of the house at Oude Terelststraat 15. Fly through its real rooms and three floors, play hide-and-seek rounds or free play, leave colorful paint everywhere, and splat your friends' screens. Private rooms hold up to six pilots; you can practice alone while friends join. Bumping into things gently stops or slides the drone; it never destroys or automatically respawns it. Press R when you want a new launch spot.

This app (`@huis/toy-flight`) is one workspace of the `huis-games` monorepo:

- The house itself (Three.js world, lighting, doors, closets, collision, the exported assets in `public/models` and the whole Blender → asset pipeline) lives in [`packages/house`](../../packages/house/README.md) (`@huis/house`). The Blender sources are in [`models/`](../../models) at the repository root.
- The tower defense game on the same house, Little Defenders, lives in [`apps/tower-defense`](../tower-defense/README.md). This app's production server also serves its build at `/defense/`.

Commands below run from the repository root unless noted. Scripts that exist only in this app run from `apps/toy-flight` (`npm run <script>`) or from the root with `npm run <script> -w @huis/toy-flight`; house scripts run with `npm run <script> -w @huis/house` (or plain `npm run <script>` inside `packages/house`).

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:5173, choose a pilot name, and create a house. Copy the invite into another browser or send it to a friend. For computers on the same Wi-Fi, open the host computer's LAN address with port 5173 first; invites then use that address. A localhost invite only works on the same computer. All players must be able to reach the host, and its firewall must allow the port.

## Fly

| Control | Action |
| --- | --- |
| W / S | Forward / backward |
| A / D | Slide left / right |
| Mouse | Look and steer after clicking the game |
| Q / E (or ← / →) | Keyboard steering alternative |
| Space | Rise |
| Ctrl / C | Descend |
| Shift | Hold for precision movement |
| ↑ / ↓ | Aim paint up / down |
| F / left mouse button | Spray paint |
| R | Quick respawn |
| G | Aim at a door or cupboard handle to open / close it |
| Esc | Release mouse and stop held controls |


The house loads once before joining, then all floors remain available without room loading screens. Room doors and storage fronts open with G while aimed at them. Cupboards and drawers require the crosshair on their visible handle or grip within reach; walls and other furniture block interaction. Hinged cupboard doors swing out, sliding fronts move sideways, and drawers pull out with their trays. Shells, shelves and moving panels remain solid. Spawn locations include floors and furniture surfaces. Hitting another pilot covers their screen briefly. Furniture and drones remain intact.

With nothing targeted, G closes the last cupboard you used while you remain nearby. Inside a cupboard, G instead opens your compartment's exit without aiming at its outside handle, even if another player closed it. The HUD shows “Open … from inside”; repeated presses keep the exit opening. Sliding leaves stack to leave a gap, and opening drawers carry their occupants outward, pausing safely at obstacles until there is room to continue.

The lobby is plain HTML and starts downloading the house in the background (with a progress bar) as soon as it opens; the flight scene reuses that download, so nothing renders or loads twice. Pick a mode when creating a room; invite links join the room's mode.

**Hide & Seek** (2+ pilots) — any pilot presses *Start round* once everyone has loaded the house. A random pilot becomes the seeker: their screen is blurred and their drone frozen while the others hide. Hiders press **H** (or *I'm hidden*); when all are in place — or after 2 minutes — the seeker's screen clears. The seeker tags a hider by hitting them with paint; found pilots keep flying but drop off the radar. The round ends when everyone is found or the seeker gives up. Hiders cannot quick-respawn while seeking. Rules live in `src/shared/hideSeek.ts` (server-owned, sent in every snapshot as `game`).

The warm/cold radar compares full 3D distance: the seeker tracks the nearest hider still in play, hiders track the seeker, and in **Free Play** it tracks the nearest pilot. It reveals no name, room, direction, or exact distance. The house map shows only your own drone.

Click the game to capture the mouse; this first click does not spray paint. Mouse movement looks and steers, WASD moves horizontally relative to your heading, and Space/C controls height. The camera always follows the drone in a collision-aware chase view. This uses the familiar mouse-look and keyboard-movement pattern described in [Minecraft’s controls guide](https://www.minecraft.net/article/minecraft-controls).

Paintballs travel at 90 game units per second toward the surface or pilot under the center crosshair. Shots follow a straight path, with the chase camera's offset and wall clearance included in aiming. Cover between your drone and the target still blocks a shot, even when the camera can see over it.

The drone holds altitude automatically and brakes to a hover when you release movement. Looking up or down does not change altitude. Hold Shift for precise movement through doorways. Escape, focus loss and hidden tabs clear held controls and release the mouse. The compact guarded quadcopter and shared swept collision allow harmless wall slides and backing away from obstacles.

## Build and host

From the repository root:

```sh
npm run build
npm start
```

The root `npm run build` runs the house typecheck and its `verify` gates (companion-asset integrity checks), builds the tower defense, then builds this app: typecheck, Vite client build into `dist/client`, `scripts/add-defense.mjs` (copies `apps/tower-defense/dist` into `dist/client/defense`), `scripts/precompress-client.mjs` and `scripts/build-server.mjs` (esbuild; bundles the `@huis/*` sources into `dist/server`).

Production serves both the browser game and Colyseus WebSockets on port 2567, plus Little Defenders at `/defense/`. Set `PORT` to override it. `GET /health` is the health check.

The `Dockerfile` and `docker-compose.yml` are at the repository root; the build context is the whole repository (`models/` is excluded through `.dockerignore`). From the root:

```sh
docker build -t little-wings .
docker run --rm -p 2567:2567 little-wings
```

Deploy the Docker container or Node service to a host supporting long-lived WebSocket connections. Use `npm ci && npm run build` as the build command and `npm start` as the start command. Put HTTPS/WSS on the same public origin and forward WebSocket upgrades. Start with **one always-running instance**: the current room directory lives in memory. Horizontal scaling needs Colyseus shared presence/driver and routing; plain random load balancing is insufficient. Static-only hosting and request-limited serverless functions cannot run the authoritative room server.

Rooms and paint exist for the room lifetime. Restarting the server ends sessions. There is no account system, public room directory, or persistent save. An invite grants access to its room. Hosting credentials and a public deployment are not included.

The build writes brotli-11 copies (`*.br`) of the built client with `scripts/precompress-client.mjs`; the server sends them to browsers that accept brotli and compresses everything else on the fly. Browsers build their paint-surface BVH from the loaded house (`packPaintSurfaces`), so `paint-surfaces.meshopt.bin` is only read by the server.

## Synchronization and performance

The server owns positions, collisions, projectiles, paint hits, and respawns. It accepts validated controls rather than client position or hit claims. A fixed 60 Hz simulation publishes 20 Hz authoritative snapshots. Paint history is sent once on joining, followed by small additions. The client continuously simulates the same 60 Hz movement steps, batches sequenced commands, and replays unacknowledged commands over authoritative snapshots. The server acknowledges each command only after consuming it. Rendering interpolates fixed steps and eases only correction error; mouse look stays immediate. Remote drones render from a 100 ms snapshot buffer whose clock adjusts gently when packets arrive unevenly. This avoids permanent divergent gameplay state, but no networked game can guarantee identical instantaneous images during latency or a dropped connection.

The visual GLB and collision mesh come from the same Blender export. The environment is uniformly enlarged for toy-scale flight; its original architecture and furniture are retained. Mesh collision uses a BVH spatial index, preserving the actual stair openings and doorways. Three.js uses a capped pixel ratio and cached static architecture shadows. Projectile counts, lifetime, fire rate, and paint history are bounded. Old paint is eventually recycled to keep memory and rendering predictable.

Architecture keeps normal Three.js frustum culling, but does not use stationary-camera occlusion queries. The query optimization was removed because paint is a separate dynamic layer: hiding a supporting or occluding architecture batch could make a splat pop in or out when the camera moved.

Paint uses one fixed-capacity mesh, retaining each seeded splat outline, color, size and depth ordering. Projectiles share sphere geometry through color-based instance pools. Collision sweeps and overlap queries reuse temporary vectors, bounds and root storage; the collision asset and hit calculations remain unchanged. These changes received a build/typecheck and 48 focused comparisons against the previous collision implementation, with final visual and FPS testing left to the user. No new FPS measurement is claimed.

The reproducible authoritative-loop benchmark runs three moving, continuously firing pilots for 600 warmup ticks and 6,000 measured ticks, including 20 Hz snapshot and paint-delta work. An earlier movement build with 170,590 collision triangles measured 1.368 ms p99 per tick on this Mac while browser validation was also running, within the 16.67 ms 60 Hz budget. This measures server simulation, not browser rendering. Run `npm run benchmark -w @huis/toy-flight` on the deployment machine to measure its actual headroom.

The chase camera reuses its vectors and caches its exact collision sweep result while the drone position and yaw are unchanged. Pitch still updates the aim every frame, movement recomputes collision immediately, and scene transitions clear the cache. Flight physics and collision data are unchanged.

The house assets themselves — the Blender export, packaging, GPU texture compression, baked lighting, light drafts, back-face culling and the URL switches that compare them (`?glass=`, `?backfaces=`, `?lighting=`, `?textures=`, `?drafts=`) — are documented in the [house README](../../packages/house/README.md). The comparison switches work on this game's URL, for example `http://localhost:5173/?glass=full&backfaces=off&lighting=live`.

## Look and frame rate

The default **toy** style is live and needs no light bake: every surface is shaded per pixel from its facing direction (a sky/ground tint plus a soft key and fill light), and lamp pools come from a small lamp-only light volume (`npm run bake:volume -w @huis/house`, about 10 seconds, 46×53×71 cells over the house; `packages/house/public/models/house-light-volume.{json,bin}`). `npm run build` checks that the volume matches the house and the lamp definitions. Tune the tones, light strengths and exposure in the `toy` block of `packages/house/src/shared/daylight.json`; `?outline=on` adds thin ink lines. `?style=classic` restores the baked path described in the [house README](../../packages/house/README.md#baked-lighting) (needs `npm run pipeline:house -w @huis/house -- --full-bake`).

**Older computers.** On a weak GPU (an Intel graphics chip, such as a 2015 MacBook Pro, or a software renderer) the game starts in low quality: no multisampling, no sky reflections, 2× instead of 8× anisotropic filtering, and dynamic resolution down to 0.5× instead of 0.7×. If a high-quality session still runs under ~40 FPS at its lowest resolution for 8 seconds, the game says so and the next load starts in low quality. `?quality=low` or `?quality=high` forces a tier and remembers it in the browser. Textures are uploaded during loading, not when a room first comes into view, and release builds skip the synchronous shader-error check.

**Visibility culling.** The toy style draws only the house batches that can be seen from the camera's 2-unit voxel. `npm run bake:visibility -w @huis/house` (about 15 minutes; `packages/house/public/models/house-visibility.{json,bin.gz}`) renders batch-ID cube maps from a half-voxel lattice in headless Chrome; each voxel keeps what its 27 lattice points and its six neighbours see. Doors, closets, laundry, glass and cut-out materials never occlude, so opening a door never shows a hole. Data that does not match the current batch layout is ignored and everything is drawn; `npm run build` rejects stale data. `?visibility=off` compares. On the fixed lighting-review views this halves draw calls and triangles indoors.

`?style=comic` switches to a comic style: no light bake, no shadow maps and no scene lights. Every surface is shaded in its material shader from its facing direction (a sky/ground tint plus a banded key and fill light), and one full-screen pass draws ink lines along silhouettes and creases. Tune the tones, light strengths, line strength and exposure in the `comic` block of `packages/house/src/shared/daylight.json`. The classic style uses the [baked lighting](../../packages/house/README.md#baked-lighting) described in the house README.

Speed choices for 60 FPS on an Apple M2:
- No multisampling in the comic buffer by default (`?aa=2` or `?aa=4` to compare), since the ink lines hide most stair-stepping.
- No environment reflections in comic (`?env=on` to compare) and no lamp halos in either style (`?glow=on` shows them).
- Static architecture batches use 36-unit cells (`?cells=` to override), which cuts per-object CPU work, and their matrices are computed once instead of every frame.
- No CSS backdrop blur behind the HUD panels.
- If frames average above about 15 ms for a second, the renderer lowers its pixel ratio in steps down to 0.7 and raises it again when there is headroom.

`npm run test:perf -w @huis/toy-flight` (with `npm start` running) joins a real room headless at 1920×1080, records frame times while hovering and while flying, and lists the hottest functions; results go to `apps/toy-flight/test-results/perf/`.

## Development

From the repository root:

```sh
npm run typecheck
npm run verify:house -w @huis/house
npm test
npm run benchmark -w @huis/toy-flight
npm run build
```

`npm test` runs the tests of every workspace; `npm test -w @huis/toy-flight` runs only this app's.

For a real browser smoke test, start the game, install Chrome, then run `GAME_URL=http://localhost:2567 npm run test:browser -w @huis/toy-flight`. By default it loads three full houses. On a memory-limited test machine, `LIGHTWEIGHT_AUXILIARY_CLIENTS=1 npm run test:browser -w @huis/toy-flight` loads the full house only for the controlled foreground pilot and substitutes an empty visual scene for two auxiliary clients; their real network, simulation and drone rendering still run. The output reports that topology explicitly. The earlier movement smoke used this lighter mode and exercised pointer capture, mouse steering, FPV/chase switching, Escape release, hover, directional controls, paint, respawn and leave/rejoin without runtime errors. All 29 automated tests pass, including delayed input replay, uneven remote snapshot delivery, and equivalent fixed-step movement at 24 and 60 FPS. The separate three-client protocol test compares authoritative snapshots directly. The multi-browser headless run showed 12–13 FPS in captures and 9 FPS at its final readout; the detailed house remains a rendering limitation. A final single-client sample measured 42.36 FPS, 16.7 ms median and 33.4 ms p95 frame time with zero runtime errors; it faced a nearby wall, so it is not a representative house-wide performance claim or a matched before/after comparison. The measurements and limits were recorded in `test-results/drone-validation.md` of the pre-monorepo `toy-flight/` checkout (test results were not carried over).

`src/shared` contains transport contracts, flight simulation, hide-and-seek, ink, aim, interaction and spawn data. `src/server` owns Colyseus rooms and authoritative outcomes. `src/client` owns drone rendering, controls, and UI. The house world, collision, doors, closets and laundry come from `@huis/house` (`@huis/house/client/<x>`, `@huis/house/shared/<x>`, `@huis/house/node/<x>`). The original implementation plan and agent ownership are in [PLAN.md](PLAN.md).

Framework references: [Colyseus rooms](https://docs.colyseus.io/room), [Colyseus deployment](https://docs.colyseus.io/deployment), [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer.html).

The floor-surface regression check (`npm run verify:house -w @huis/house`) is described in the [house README](../../packages/house/README.md#floor-surface-regression-check). The latest artifact sweep and fixes are recorded in [VISUAL-AUDIT.md](VISUAL-AUDIT.md).

### Doors

From outside, fly within 2.4 game units, aim the crosshair at the room door or a cupboard/drawer handle, and press **G** when the prompt appears. If you aim at nothing after using a cupboard, G closes that same cupboard while you remain nearby; a directly aimed target takes priority. Inside storage, G toggles the current compartment open **and closed**, without requiring a handle target or previous interaction. The prompt shows the next action. Repeating G during movement reverses the group intent. Sliding leaves stack to create an exit, and inner drawers include their enclosing fronts. Drawers carry their occupants in both directions, stopping safely for obstacles or other pilots. An outer wardrobe leaf waits until its inner drawers retract before closing.

Motion eases into its endpoints and stays synchronized for the multiplayer room. Ordinary hinges and drawers take 1.1 seconds; the top-hinged laundry flap takes 1.3 seconds and tracked slides take 1.6 seconds. The veranda first unseats, then slides parallel to the fixed glazing. Bathroom mirrors use permanently separated bypass rails, including when closed, so independently operated panels and handles cannot cross each other. The garage uses twelve articulated panels that follow curved rails inward beneath the ceiling over 2.8 seconds, with a visible ceiling motor and linkage. Fixed buttons on both sides remain reachable when it is fully open. Opening and closing pause when a drone occupies the path. Handles, lock plates and key slots move with the leaf. Q/E and arrow keys remain available for steering. Solid doors and entrance privacy panels are opaque; veranda glazing retains the clear window material.

Room doors use the original authored geometry in `packages/house/public/models/doors.glb`, exported independently with `packages/house/scripts/export-doors.py`; the sectional garage replaces its original single leaf at runtime and retains its authored graphite finish. The original Blender scene and static house assets are unchanged. The generated `packages/house/src/shared/doors-manifest.json` and shared `door-motion.ts` (`@huis/house/shared/door-motion`) supply matching animated component poses to the server and client. Doors, cupboards, sliding panels, and drawers block drones, chase cameras, and paintballs. Paint that hits a moving assembly stays attached to the struck panel or drawer component as it opens and closes, including individual sections around the garage track.

Fixed window panes, sidelights, and glazed roofs block drones, cameras and paintballs using their exported triangles. Moving veranda panels use their animated collision: G opens a passable gap and closes it again. Fixed windows currently have no opening control. Regenerate fixed glazing collision with `npm run prepare:windows -w @huis/house` after changing the house model.


Storage uses `packages/house/src/shared/closets-manifest.json`, generated by the curated inventory in `packages/house/scripts/closet-inventory.mjs` from an evaluated Blender audit. Moving fronts and hardware are extracted before static batching; source textures stay intact. Solid cabinet blocks become hollow shells, with shared visual/collision descriptions for shelves, sides, backs and drawer trays. Wardrobes have rails and hangers, and sink units have plumbing. Existing open shelves, loose baskets, and appliance doors remain separate from operable cupboard storage. To refresh the storage inventory and its collision after source furniture changes, see [Doors and storage assets](../../packages/house/README.md#doors-and-storage-assets) in the house README.

Run `node --import tsx tests/closets.browser.ts` (from `apps/toy-flight`) against the development server to capture open/closed cupboard reviews. The regression tests cover precise targeting, moving handles, collision, hollow trays and animation obstruction. The server retains a short history of its own door poses to validate a handle at its displayed interpolated position; clients never choose the authoritative object or send its transform.

### Laundry appliances

The left appliance is the washing machine and the right appliance is the dryer. Aim at a round door and press G to open or close it. Both use authoritative, networked door states and collision. The washer alternates its drum direction; the dryer tumbles slowly. Rotation stops as soon as opening is requested and resumes only after the door has fully closed. Their hollow bodies and circular drum openings share geometry across rendering, flight collision, and static paint surfaces. How the replacement geometry relates to the Blender export is described under [Laundry appliance assets](../../packages/house/README.md#laundry-appliance-assets) in the house README.

`tests/laundry.test.ts` covers collision, G interaction, door snapshots and stop/resume behavior; `tests/laundry.browser.ts` verifies both machines in the full house and saves open/closed screenshots.

### Unlimited ink

Hold **Click** or **F** to fire continuously at eight shots per second. Ink is unlimited. The server resolves every projectile against players, static surfaces and the current moving-door components; muzzle cover still takes priority over a camera-visible target. The room retains its latest 600 paint marks and at most 72 live projectiles, so sustained firing has bounded storage. Late joiners receive the current paint history and moving-surface attachments.

Glossy organic patches clip to their supporting surface, including thin moving panels. Newer ink coats older colors. Projectile droplets, short trails and impact bursts use bounded render pools. The reticle confirms firing and impacts, and **INK SOUND** toggles the synthesized audio after a user gesture.

See [DOOR-AND-INK-HANDOFF.md](DOOR-AND-INK-HANDOFF.md) for the motion/ink architecture, generation workflow, review findings and validation commands for the next maintainer.

Ink uses a separate exact static surface mesh, including rugs, curtains, illustrations, detailed furniture, and generated cabinet interiors. Flight keeps its simpler collision mesh. Crosshair targeting, authoritative projectile impacts, and splat clipping all use the same paint mesh; moving panels retain articulated collision and paint attachments. The losslessly meshopt-encoded asset (20.9 MiB; about 9.4 MiB with the server's brotli or gzip) is loaded once before joining a game. Regenerate it with `npm run prepare:paint -w @huis/house` after changing the house or cabinet geometry; `npm run build` checks its provenance with `npm run verify:paint -w @huis/house`.

### Whole-house collision

Flight collides with every visible mesh/curve in the playable house surroundings; the collision export and its inventory are described under [Whole-house solid collision](../../packages/house/README.md#whole-house-solid-collision) in the house README. Landing regressions are in `tests/solid-surfaces.test.ts`; the room connectivity test still reaches all 19 rooms and 13 spawns.

With the expanded indexed mesh (1,311,800 triangles including runtime shells and glazing), the three-pilot 6,000-tick benchmark measured 2.447 ms p99 on this Mac, below the 16.667 ms simulation budget. This is a server simulation measurement, not a browser FPS measurement.

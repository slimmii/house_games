# Little Defenders (tower defense)

A second, single-player game on the same house as [Little Rotors](../toy-flight/README.md): a tower defense on the living-room floor. Toy soldiers march in from the veranda (and, from wave 6, up the spiral stairs and through the office) toward a cushion fort in the TV corner; the other toys defend it. It needs no room server: the whole game runs in the browser.

The house (world, assets, collision mesh) comes from [`@huis/house`](../../packages/house/README.md).

## Run

From the repository root:

```sh
npm ci
npm run dev:defense
```

Open http://localhost:5174/. In development the page is served at the root, without the `/defense/` prefix, and the dev server serves the house assets itself. In production Vite builds with base `/defense/` and the Little Rotors container serves the build at https://drone.assimilate.be/defense/ (the root `npm run build` builds this app first; Little Rotors' build copies `dist/` into its client).

Scripts below run from `apps/tower-defense` (`npm run <script>`) or from the root with `npm run <script> -w @huis/tower-defense`.

## Play

| Input | Action |
| --- | --- |
| Left-drag, `W` `A` `S` `D` or arrows | Pan |
| Right-drag or `Alt`-drag, `Q` / `E` | Turn the camera (the walls on the camera's side slide away) |
| Wheel, pinch, `+` / `-` | Zoom |
| `1`–`6` | Pick a toy to place; click the floor or a furniture top |
| Click a toy | Select it: upgrade (`U`), sell (`X`), targeting (`T`) |
| `Space` | Send the next wave (early calls pay a bonus) |
| `F`, `G` | Abilities: Footsteps! (freeze), Marble spill (aim at a route) |
| `Tab`, `P`, `M`, `Esc` | Speed, pause, mute, cancel |

Thirty waves, three difficulties (Playtime, Rainy Day, Past Bedtime), an endless mode after a win. Best results are kept in `localStorage`.

## Code layout

- `index.html` (at the app root) is the Vite entry; `vite.config.ts` sets the `/defense/` base for production builds.
- `src/sim/` is the whole game as plain data and pure functions with a fixed 1/60 s step and a seeded generator: `map.ts` (routes, furniture tops, placement rules), `enemies.ts`, `towers.ts`, `waves.ts` (data tables) and `sim.ts` (`createGame`, `stepGame`, commands, events). Nothing in it imports Three.js.
- `src/render/` draws it: `scene.ts` loads the house through `createHouse` (`@huis/house/client/world`) with the drone-only steps switched off, `dollhouse.ts` cuts the house open (clipping planes, hidden storeys) and `sectionCaps.ts` closes the cut walls (it finds where wall surfaces cross each cutting plane and fills the gap between the two faces of a wall), `camera.ts` is the commander camera, `battle.ts` draws toys, shots and markers, `toys/` holds the procedural toy models (built from `toys/kit.ts`, one draw call per finish through `toyBatch.ts`).
- `src/ui/` is the DOM HUD (`hudTypes.ts` is its contract with `main.ts`); `src/audio.ts` synthesizes every sound.

The house itself is untouched. The page removes one piece of furniture from its own copy of the scene (the LÖMSK swivel chair, which blocks the lane along the cabinets) and never downloads the collision mesh.

## Placement grid

`src/sim/grid.generated.json` says which floor cells toys can stand on. It is baked from `@huis/house`'s `public/models/house-collision.meshopt.bin` (`packages/house/public/models/house-collision.meshopt.bin`) by `scripts/bake-defense-grid.ts`, and must never be edited by hand:

```sh
npm run bake:grid            # rewrite the grid (add -- --print to see it as text)
npm run verify:grid          # part of npm run build; fails when the collision mesh or the rules changed
```

After a house re-export (see [Regenerating the game from the Blender model](../../packages/house/README.md#regenerating-the-game-from-the-blender-model)), rerun the bake and `npm test`: the tests sweep both routes through the real collision mesh and check that each listed furniture top is where `map.ts` says.

## Tests and review pages

```sh
npm test                     # map, simulation and a bot that plays the whole campaign on each difficulty
npm run test:browser         # Playwright smoke test against the dev server; screenshots in test-results/defense/
node --import tsx tests/defense-bot.ts normal --log   # per-wave log of the bot, for balancing
```

`node tests/defense-flicker.mjs` counts pixels that change when the camera moves a fraction of a pixel (shimmer); run it after touching the cut-away or the camera. `tests/defense-toys-review.html` (a turntable of every toy model), `tests/defense-hud-review.html` (the HUD with mock data) and `tests/defense-audio-review.html` (offline measurement of every sound) open on the dev server (for example http://localhost:5174/tests/defense-toys-review.html); `tests/defense-shot.mjs` screenshots any of them. The browser scripts expect the dev server on port 5174 (`DEFENSE_URL` overrides the game URL for `test:browser` and the flicker check).

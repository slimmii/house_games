# Huis games

Two browser games set in a 3D model of the house at Oude Terelststraat 15, and the Blender sources they come from.

| Path | What |
| --- | --- |
| [`models/`](models/) | Blender sources (`Huis_Oude_Terelststraat_15.blend` is canonical) and the scripts that built them |
| [`packages/house`](packages/house/README.md) | `@huis/house`: the shared house (rendering, lighting, doors, collision), the exported assets and the Blender → asset pipeline |
| [`apps/toy-flight`](apps/toy-flight/README.md) | Little Rotors: a multiplayer drone game (hide & seek, free play) with a Colyseus room server |
| [`apps/tower-defense`](apps/tower-defense/README.md) | Little Defenders: a single-player toy tower defense on the living-room floor |

## Quick start

```sh
npm install
npm run dev            # Little Rotors on http://localhost:5173 (room server on :2567)
npm run dev:defense    # Little Defenders on http://localhost:5174
npm test               # unit tests of every workspace
npm run build          # house asset checks, then both games; output in apps/toy-flight/dist
npm start              # production server: / and /defense/
```

Large binaries (`*.blend`, renders in `models/`, `packages/house/public/models/*.{glb,bin,gz}`) are stored with Git LFS. Run `git lfs install` once before you clone.

Deployment: see [AGENTS.md](AGENTS.md).

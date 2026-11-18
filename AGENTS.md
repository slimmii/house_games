# Instructions

## Layout

npm workspaces monorepo:

- `models/`: Blender sources of the house (`Huis_Oude_Terelststraat_15.blend` is canonical) plus the Python scripts, notes and renders that built it.
- `packages/house` (`@huis/house`): what the games share. The Three.js house (`src/client`), house geometry, collision and doors (`src/shared`), Node helpers (`src/node`), the exported assets (`public/models`) and the Blender → asset pipeline (`scripts/`). Every derived asset must stay reproducible from `models/` through `npm run pipeline:house -w @huis/house`.
- `apps/toy-flight` (`@huis/toy-flight`): Little Rotors, the multiplayer drone game, plus the room server that serves both games.
- `apps/tower-defense` (`@huis/tower-defense`): Little Defenders, a single-player game that runs entirely in the browser.

Apps import the house as `@huis/house/client/<module>`, `@huis/house/shared/<module>` and `@huis/house/node/<module>`. They never import from each other.

## Deploying (Little Rotors + Little Defenders)

Production runs as one Docker container (`little-rotors`) on `root@49.12.197.52`, behind the Traefik container already running on that host. https://drone.assimilate.be serves toy-flight and https://drone.assimilate.be/defense/ serves the tower defense (Traefik labels in `docker-compose.yml`). The image is built on the server from an uploaded copy of the repository. `models/` is not needed and is not uploaded.

Each deploy goes into a new directory named `/root/little-rotors-release-YYYYMMDD`. Keep the previous directory so you can roll back. The compose project name is always `little-rotors`. Run these steps from the repository root:

```sh
NEW=/root/little-rotors-release-$(date +%Y%m%d)
OLD=$(ssh root@49.12.197.52 'docker inspect little-rotors --format "{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}"')

# 1. Copy the last release so rsync sends only the changes (packages/house/public is ~270 MB), then upload
ssh root@49.12.197.52 "cp -a $OLD $NEW"
# First deploy after the monorepo split only: the old release kept the assets in public/, so seed them:
#   ssh root@49.12.197.52 "test -d $NEW/packages/house/public || (mkdir -p $NEW/packages/house && mv $NEW/public $NEW/packages/house/public)"
rsync -az --delete --exclude node_modules --exclude dist --exclude .git --exclude models \
  --exclude test-results --exclude '.chart-data-*' ./ root@49.12.197.52:$NEW/

# 2. Build first, so the old container keeps serving until the build succeeds
#    (the build includes typecheck, the house verify:* asset checks and the defense grid check)
ssh root@49.12.197.52 "cd $NEW && docker compose -p little-rotors build"

# 3. Swap containers (container_name is fixed, so remove the old one first)
ssh root@49.12.197.52 "cd $NEW && docker rm -f little-rotors && docker compose -p little-rotors up -d"

# 4. Verify
ssh root@49.12.197.52 'docker ps --filter name=little-rotors; docker logs --tail 5 little-rotors'
curl -s -o /dev/null -w "%{http_code}\n" https://drone.assimilate.be/health      # expect 200
curl -s -o /dev/null -w "%{http_code}\n" https://drone.assimilate.be/defense/    # expect 200
```

- Restarting the container ends all active rooms, because room state lives only in memory.
- To roll back, run `cd <previous release dir> && docker rm -f little-rotors && docker compose -p little-rotors up -d --build`. Releases from before the monorepo split have their compose file in the release directory itself, so this also works for them.
- The server disk is about 92% full. Delete old release directories and run `docker image prune` from time to time.

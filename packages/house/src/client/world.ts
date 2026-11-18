import { prepareLaundry, createLaundry } from './laundry';
import { installPaintSurfaces, packPaintSurfaces } from '../shared/paint-surfaces';
import { decodeHouseCollision, installHouseCollision } from '../shared/collision';
import doorDetailPatterns from '../../scripts/door-details.json';
import { createDoors, preloadDoors } from './doors';
import { prepareClosets, createClosets } from './closets';
import type { DoorState } from '../shared/doors';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HOUSE_BOUNDS } from '../shared/world';
import { createFixtureLights } from './fixtureLights';
import { batchArchitecture } from './architectureBatching';
import { dequantizeHouse } from './houseQuantization';
import { applyArchitectureBackfaces } from './architectureBackfaces';
import { applyBakedFixtureLighting } from './bakedLighting';
import { customiseGlassAndLamps } from './houseMaterials';
import { createFixtureGlow } from './fixtureGlow';
import { createDraftLights } from './draftLights';
import { SKY_HORIZON, skyEnvironment } from './skyEnvironment';
import { installProbeShader, loadLightVolume, setIrradianceVolume } from './probeLighting';
import { COMIC_REFLECTIONS, COMIC_STYLE, TOY_STYLE } from './comicStyle';
import { LOW_QUALITY } from './quality';
import { loadHouseVisibility, type HouseVisibility } from './visibility';

let modelPromise: Promise<THREE.Group> | undefined;
let modelOptions: HouseOptions | undefined;
let collisionPromise: Promise<void> | undefined;

/**
 * Optional steps of the house load. The drone game needs all of them (the
 * defaults); a page that only shows the house can switch them off.
 */
export type HouseOptions = {
  /** Build the ink paint surfaces from the loaded house. */
  paintSurfaces?: boolean;
  /** Download the collision mesh and build its BVH. */
  collision?: boolean;
  /** Load the precomputed visibility data behind `updateVisibility`. */
  visibility?: boolean;
  /** Edit the source scene (named Blender objects) just before it is merged into batches. */
  onSource?(scene: THREE.Group): void;
};

/** Download/prepare progress of the shared house load, for loading screens. */
export type HouseLoadProgress = { stage: 'download' | 'prepare' | 'ready'; loaded: number; total: number };
let loadProgress: HouseLoadProgress = { stage: 'download', loaded: 0, total: 0 };
const progressListeners = new Set<(progress: HouseLoadProgress) => void>();
function reportProgress(progress: HouseLoadProgress): void {
  loadProgress = progress;
  for (const listener of progressListeners) listener(progress);
}
export function onHouseLoadProgress(listener: (progress: HouseLoadProgress) => void): () => void {
  progressListeners.add(listener);
  listener(loadProgress);
  return () => progressListeners.delete(listener);
}

// These fitted cupboards share a source material with the living-room Camber
// furniture. Clone only their finish; handles, stone and other rooms retain theirs.
const kitchenCupboards = new Set([
  'Kitchen base carcass',
  'Kitchen base door',
  'Kitchen bench - closed recessed white base',
  'Kitchen bench junction - raised cabinet',
  'Kitchen bench junction - short door',
  'Kitchen bench junction - solid white block',
  'Kitchen integrated refrigerator',
  'Kitchen long plinth',
  'Kitchen long upper cabinet',
  'Kitchen refrigerator door',
  'Kitchen return upper cabinet',
  'Kitchen sink base',
  'Kitchen sink cabinet door',
]);

/** Load the real Blender export once; scene clones share immutable GPU resources. */
function loadHouse(renderer: THREE.WebGLRenderer, options: HouseOptions = {}): Promise<THREE.Group> {
  if (modelPromise) {
    // The prepared house is cached per page, so the first caller's options win.
    const same = (['paintSurfaces', 'collision', 'visibility', 'onSource'] as const)
      .every(key => (options[key] ?? true) === (modelOptions?.[key] ?? true));
    if (!same) console.warn('House already loading with other options; these are ignored.');
    return modelPromise;
  }
  modelOptions = options;
  const textures = new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(2).detectSupport(renderer);
  const originalTextures = new URLSearchParams(location.search).get('textures') === 'original';
  const assetPath = originalTextures ? '/models/house.glb' : '/models/house-gpu.glb';
  modelPromise = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(textures)
    .loadAsync(assetPath, event => {
      reportProgress({ stage: 'download', loaded: event.loaded, total: event.lengthComputable ? event.total : 0 });
    }).then(async ({ scene, parser }) => {
    dequantizeHouse(scene);
    reportProgress({ ...loadProgress, stage: 'prepare' });
    // Let the loading screen paint before the long synchronous preparation passes.
    await new Promise(resolve => setTimeout(resolve, 0));
    const backingMaterials = new Map<THREE.Material, THREE.Material>();
    const cupboardMaterials = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const cupboardMaterial = (material: THREE.Material): THREE.Material => {
      if (!(material instanceof THREE.MeshStandardMaterial)
        || material.name !== 'Camber - premium white matt W1000 ST9') return material;
      let finish = cupboardMaterials.get(material);
      if (!finish) {
        finish = material.clone();
        finish.name = 'Kitchen cupboards / warm white #fcf8ed';
        finish.color.set('#fcf8ed');
        cupboardMaterials.set(material, finish);
      }
      return finish;
    };
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const sourceName = object.userData.name ?? object.name;
      if (kitchenCupboards.has(sourceName.replace(/\.\d+$/, ''))) {
        object.material = Array.isArray(object.material)
          ? object.material.map(cupboardMaterial) : cupboardMaterial(object.material);
      }
      if (/^\d+ \/ front infill(?:[. /]|$)/.test(sourceName)) {
        // These structural faces coincide with the authored brick reveals and
        // door profiles. Give the backing a depth bias so the finishes win
        // consistently, without moving geometry or changing interior plaster.
        const backingMaterial = (material: THREE.Material): THREE.Material => {
          if (material.name !== 'Warm white plaster') return material;
          let backing = backingMaterials.get(material);
          if (!backing) {
            backing = material.clone();
            backing.polygonOffset = true;
            backing.polygonOffsetFactor = 1;
            backing.polygonOffsetUnits = 2;
            backingMaterials.set(material, backing);
          }
          return backing;
        };
        object.material = Array.isArray(object.material)
          ? object.material.map(backingMaterial) : backingMaterial(object.material);
      }
      object.castShadow = true;
      object.receiveShadow = true;
    });
    // Glass loses its transmission pass and lamps brighten before the
    // back-face and bake passes classify and hook the materials.
    // Anisotropic filtering keeps brick and floor textures sharp at grazing
    // angles; without it the GPU drops to a blurry mip level on walls seen
    // side-on. `?aniso=1` turns it off for comparison; low quality uses 2.
    const anisotropy = Math.max(1, Math.min(renderer.capabilities.getMaxAnisotropy(),
      Number(new URLSearchParams(location.search).get('aniso')) || (LOW_QUALITY ? 2 : 8)));
    const sharpened = new Set<THREE.Texture>();
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture && !sharpened.has(value)) {
            value.anisotropy = anisotropy;
            value.needsUpdate = true;
            sharpened.add(value);
          }
        }
      }
    });
    const materials = customiseGlassAndLamps(scene, {
      transmission: new URLSearchParams(location.search).get('glass') === 'transmission',
    });
    const backfaces = await applyArchitectureBackfaces(scene, { assetPath });
    const lighting = await applyBakedFixtureLighting(scene, parser, assetPath);
    if (TOY_STYLE) {
      // Lamp pools come from the quick volume; every house material gets the
      // toy shading hook (after back-face cloning, which drops hooks).
      const volume = await loadLightVolume();
      if (!volume) console.warn('Light volume missing or stale; lamps are off. Run npm run bake:volume.');
      setIrradianceVolume(volume);
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) installProbeShader(material);
      });
    } else {
      setIrradianceVolume(lighting.volume);
    }
    // These parts existed in the static export; the separate door asset now
    // owns them. Remove them after applying source-indexed lighting/backfaces.
    const movingPatterns = doorDetailPatterns.map(pattern => new RegExp(pattern, 'i'));
    const movingParts: THREE.Object3D[] = [];
    scene.traverse(object => {
      if (movingPatterns.some(pattern => pattern.test(object.userData.name ?? object.name))) movingParts.push(object);
    });
    for (const part of movingParts) part.removeFromParent();
    const laundry = prepareLaundry(scene);
    const closets = prepareClosets(scene);
    // Same static surfaces as scripts/prepare-paint-surfaces.ts (the server's
    // copy); moving laundry doors/rotors and closet panels keep their own hits.
    if (options.paintSurfaces !== false) {
      installPaintSurfaces(packPaintSurfaces([scene, laundry, closets], object =>
        (object.parent === laundry && /:door$|:rotor$/.test(object.name))
        || (object.parent === closets && object.name.startsWith('closet-pivot:'))));
    }
    options.onSource?.(scene);
    const architecture = batchArchitecture(scene);
    architecture.add(closets, laundry);
    architecture.userData.closetDiagnostics = closets.userData.closetDiagnostics;
    architecture.userData.bakedFixtureLighting = lighting.applied;
    architecture.userData.backfaces = backfaces;
    architecture.userData.bakedLightingStatus = lighting;
    if (!backfaces.disabled && !backfaces.manifestMatched) {
      console.warn(`Selective back-face culling unavailable: ${backfaces.manifestReason}`);
    }
    if (!lighting.applied && lighting.reason !== 'live fixture lighting requested' && lighting.reason !== 'unbaked style requested') {
      console.warn(`Baked house lighting unavailable; using live fixtures: ${lighting.reason}`);
    }
    if (import.meta.env.DEV) {
      console.info('House render optimizations', {
        replacedGlass: materials.replacedGlass,
        boostedLamps: materials.boostedLamps,
        frontSidedMeshes: backfaces.meshesChanged,
        bakedLighting: lighting.applied,
        bakedLightingBytes: lighting.bytes,
      });
    }
    reportProgress({ ...loadProgress, stage: 'ready' });
    return architecture;
  }).catch(error => { modelPromise = undefined; throw error; }).finally(() => textures.dispose());
  return modelPromise;
}

function loadHouseCollision(): Promise<void> {
  return collisionPromise ??= fetch('/models/house-collision.meshopt.bin').then(async response => {
    if (!response.ok) throw new Error('Could not load house collision');
    installHouseCollision(await decodeHouseCollision(await response.arrayBuffer()));
  }).catch(error => { collisionPromise = undefined; throw error; });
}

/** Start the shared house download early (the lobby calls this); flight scenes reuse it. */
export function preloadHouse(renderer: THREE.WebGLRenderer, options: HouseOptions = {}): Promise<void> {
  return Promise.all([
    loadHouse(renderer, options), options.collision === false ? undefined : loadHouseCollision(), preloadDoors(),
  ]).then(() => undefined);
}

export function createHouse(scene: THREE.Scene, renderer: THREE.WebGLRenderer, options: HouseOptions = {}): {
  ready: Promise<void>;
  updateDoors(states: readonly DoorState[], dt?: number): void;
  /** Hide the house batches that cannot be seen from the camera position. */
  updateVisibility(cameraPosition: THREE.Vector3): void;
  dispose(): void;
} {
  const sky = skyEnvironment(renderer);
  // Comic style lights in the shader, and low quality drops reflections;
  // skipping the environment map removes a cubemap lookup from every pixel.
  scene.environment = (COMIC_STYLE && !COMIC_REFLECTIONS) || (LOW_QUALITY && TOY_STYLE) ? null : sky.environment;
  // ?background=flat keeps a plain colour behind the windows for comparison.
  scene.background = new URLSearchParams(location.search).get('background') === 'flat'
    ? new THREE.Color(SKY_HORIZON) : sky.background;
  scene.environmentIntensity = 1;
  const house = new THREE.Group();
  house.name = 'blender-house';
  scene.add(house);
  let disposed = false;
  let doors: Awaited<ReturnType<typeof createDoors>> | undefined;
  let closets: ReturnType<typeof createClosets> | undefined;
  let laundry: ReturnType<typeof createLaundry> | undefined;
  let fixtureLights: ReturnType<typeof createFixtureLights> | undefined;
  let glow: ReturnType<typeof createFixtureGlow> | undefined;
  let draftLights: ReturnType<typeof createDraftLights> | undefined;
  let sun: THREE.DirectionalLight | undefined;
  let visibility: HouseVisibility | undefined;
  const center = new THREE.Vector3(
    (HOUSE_BOUNDS.min.x + HOUSE_BOUNDS.max.x) / 2,
    (HOUSE_BOUNDS.min.y + HOUSE_BOUNDS.max.y) / 2,
    (HOUSE_BOUNDS.min.z + HOUSE_BOUNDS.max.z) / 2,
  );
  /** Live fallback only: the baked house carries sky, sun and bounce per vertex. */
  const createLiveLights = () => {
    scene.environmentIntensity = 0.5;
    const hemi = new THREE.HemisphereLight('#ffffff', '#d6d0c6', 0.35);
    house.add(hemi);
    sun = new THREE.DirectionalLight('#ffffff', 2.1);
    sun.position.copy(center).add(new THREE.Vector3(-25, 48, 20));
    sun.target.position.copy(center);
    house.add(sun, sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
    sun.shadow.camera.right = sun.shadow.camera.top = 24;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 160;
    sun.shadow.normalBias = 0.008;
    // The architecture never moves: bake its shadow map once per scene.
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
    fixtureLights = createFixtureLights(scene);
  };
  const paintReady = options.collision === false ? undefined : loadHouseCollision();
  const ready = Promise.all([loadHouse(renderer, options), paintReady]).then(async ([template]) => {
    if (disposed) return;
    const architecture = template.clone(true);
    house.add(architecture);
    // Toy style only: the classic sun shadow map is rendered once and must see every batch.
    const visibilityReady = TOY_STYLE && options.visibility !== false
      ? loadHouseVisibility(architecture) : Promise.resolve(undefined);
    closets = createClosets(architecture);
    laundry = createLaundry(architecture);
    // The batched house never moves: compute its matrices once and stop Three
    // from recomputing thousands of them every frame. Moving cupboards and the
    // laundry machines keep their per-frame updates.
    const moving = new Set(['operable-laundry', 'operable-closets']);
    architecture.updateMatrixWorld(true);
    for (const child of architecture.children) {
      if (moving.has(child.name)) continue;
      child.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; });
    }
    doors = await createDoors(house);
    if (disposed) { doors.dispose(); return; }
    visibility = await visibilityReady;
    const search = new URLSearchParams(location.search);
    if (architecture.userData.bakedFixtureLighting || COMIC_STYLE || TOY_STYLE) {
      // Comic style lights every surface in its shader: no scene lights and no halos.
      // Lamps glow through their emissive lenses only; halos are opt-in (?glow=on).
      if (!COMIC_STYLE && !TOY_STYLE && search.get('glow') === 'on') glow = createFixtureGlow(house);
    } else {
      createLiveLights();
    }
    // Proposed fixtures: visible trims always, live spotlights for evaluation.
    draftLights = createDraftLights(house, { live: !COMIC_STYLE && search.get('drafts') === 'live' });
  });
  return {
    ready,
    updateDoors(states, dt = 0) { doors?.update(states); closets?.update(states); laundry?.update(states, dt); },
    updateVisibility(cameraPosition) { visibility?.update(cameraPosition); },
    dispose() {
      disposed = true;
      doors?.dispose();
      closets?.dispose();
      fixtureLights?.dispose();
      glow?.dispose();
      draftLights?.dispose();
      scene.remove(house);
      sun?.shadow.map?.dispose();
      // Cached house geometry/materials are reused by preview and flight scenes.
    },
  };
}

import * as THREE from 'three';

export interface HouseMaterialOptions { transmission: boolean }
export interface HouseMaterialReport { replacedGlass: number; boostedLamps: number }

export const CLEAR_GLASS_MATERIALS: readonly string[] = [
  'Street photo / clear facade window glass',
  'Bathroom - glass screen and niche shelves',
  'Bedroom 1 / clear window glazing',
  'Entrance photo / clear safety glass - including 15',
  'Clear glazing',
  'Rear photo / clear rear glazing',
  'Stair dome / clear slightly blue acrylic dome',
];

export const FROSTED_GLASS_MATERIALS: readonly string[] = [
  'Entrance photo / semitransparent frosted surface',
  'Ground bathroom - frosted shower glass',
  'Small bedroom / sheer roller blind',
];

export const LAMP_MATERIALS: readonly string[] = [
  'Reference lighting / warm white LED lens',
  'Reference lighting / warm opal diffuser',
  'Game lighting / warm LED lens',
  'Game lighting / frosted glass',
  'Bathroom - warm lamp glass',
  'Camber drawing / warm concealed LED',
  'Dining ceiling lamp / warm white LED diffuser',
  'Hall photo - warm lamp diffuser',
  'Kitchen photo pendant / warm opal diffuser',
  'Laundry - lamp diffuser',
  'Ground bathroom - warm lamp diffuser',
];

/** Blend-mode decals that must never be altered. */
const PROTECTED_MATERIALS = new Set(['Bedroom 1 - detailed dragon wall decal', 'Small bedroom - detailed bear wall decal']);
const CLEAR = new Set(CLEAR_GLASS_MATERIALS);
const FROSTED = new Set(FROSTED_GLASS_MATERIALS);
const LAMPS = new Set(LAMP_MATERIALS);
const FROSTED_COLOR = new THREE.Color('#f4f4f2');
const LAMP_EMISSIVE = new THREE.Color('#fff0d6');

function makeGlass(source: THREE.MeshPhysicalMaterial, frosted: boolean): THREE.MeshPhysicalMaterial {
  const glass = source.clone();
  glass.transmission = 0;
  glass.thickness = 0;
  glass.attenuationDistance = Infinity;
  glass.transparent = true;
  glass.depthWrite = false;
  glass.metalness = 0;
  glass.opacity = frosted ? 0.7 : 0.14;
  glass.roughness = frosted ? 0.6 : 0.04;
  glass.envMapIntensity = frosted ? 0.6 : 1.2;
  if (frosted) glass.color.copy(FROSTED_COLOR);
  return glass;
}

function makeLamp(source: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const lamp = source.clone();
  lamp.emissiveIntensity = 6;
  if (lamp.emissive.getHex() === 0) lamp.emissive.copy(LAMP_EMISSIVE);
  lamp.toneMapped = true;
  return lamp;
}

/**
 * Swap transmissive glass for cheap alpha-blended glass (unless transmission is requested) and
 * boost lamp emissives. Shared source materials keep sharing their replacement. Idempotent.
 */
export function customiseGlassAndLamps(root: THREE.Object3D, options: HouseMaterialOptions): HouseMaterialReport {
  const report: HouseMaterialReport = { replacedGlass: 0, boostedLamps: 0 };
  const cache = new Map<THREE.Material, THREE.Material>();
  const unexpectedGlass = new Set<string>();

  const replace = (material: THREE.Material): THREE.Material => {
    const cached = cache.get(material);
    if (cached) return cached;
    let result = material;
    if (!material.userData.houseMaterialCustomised && !PROTECTED_MATERIALS.has(material.name)) {
      const name = material.name;
      if (!options.transmission && material instanceof THREE.MeshPhysicalMaterial
        && (CLEAR.has(name) || FROSTED.has(name) || (material.transmission > 0 && !LAMPS.has(name)))) {
        if (!CLEAR.has(name) && !FROSTED.has(name)) unexpectedGlass.add(name || '(unnamed)');
        result = makeGlass(material, FROSTED.has(name));
        report.replacedGlass++;
      } else if (material instanceof THREE.MeshStandardMaterial && LAMPS.has(name)) {
        result = makeLamp(material);
        report.boostedLamps++;
      }
      if (result !== material) result.userData.houseMaterialCustomised = true;
    }
    cache.set(material, result);
    return result;
  };

  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const mesh = object as THREE.Mesh;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(replace) : replace(mesh.material);
  });

  if (unexpectedGlass.size > 0) {
    console.warn(`[houseMaterials] replaced unlisted transmissive materials: ${[...unexpectedGlass].join(', ')}`);
  }
  return report;
}

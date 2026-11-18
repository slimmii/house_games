import type { ToyModel } from './kit';
import { SOLDIER_TOYS } from './soldiers';
import { VEHICLE_TOYS } from './vehicles';
import { TOWER_TOYS_A } from './towersA';
import { TOWER_TOYS_B } from './towersB';
import { PROP_TOYS } from './props';

const BUILDERS = { ...SOLDIER_TOYS, ...VEHICLE_TOYS, ...TOWER_TOYS_A, ...TOWER_TOYS_B, ...PROP_TOYS };
export type ToyId = keyof typeof BUILDERS;
export const TOY_IDS = Object.keys(BUILDERS) as ToyId[];

const cache = new Map<ToyId, ToyModel>();

/** Toy geometry is built on first use and shared by every instance. */
export function getToy(id: ToyId): ToyModel {
  let model = cache.get(id);
  if (!model) {
    model = BUILDERS[id]();
    cache.set(id, model);
  }
  return model;
}

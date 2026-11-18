/**
 * Draft fixtures may have several heads (a three-spot spiral, an up/down wall
 * washer). Each head is lit as its own spot; the live preview and the light
 * bake both expand drafts through this function so they always agree.
 */
export interface DraftHead { offset: number[]; direction: number[] }
export interface DraftLike {
  name: string;
  type: 'spot';
  position: number[];
  direction?: number[];
  heads?: DraftHead[];
  color: number[];
  intensity: number;
  distance: number;
  angle: number;
  penumbra: number;
}
export interface ExpandedSpot {
  name: string;
  type: 'spot';
  position: number[];
  direction: number[];
  color: number[];
  intensity: number;
  distance: number;
  angle: number;
  penumbra: number;
}

export function expandDraftFixtures(drafts: readonly DraftLike[]): ExpandedSpot[] {
  return drafts.flatMap(draft => {
    const heads = draft.heads ?? [{ offset: [0, 0, 0], direction: draft.direction ?? [0, -1, 0] }];
    return heads.map((head, index) => ({
      name: heads.length > 1 ? `${draft.name} / head ${index + 1}` : draft.name,
      type: 'spot' as const,
      position: draft.position.map((value, axis) => value + head.offset[axis]),
      direction: head.direction,
      color: draft.color,
      intensity: draft.intensity,
      distance: draft.distance,
      angle: draft.angle,
      penumbra: draft.penumbra,
    }));
  });
}

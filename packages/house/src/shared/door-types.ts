/** Closed-pose world coordinates; every component follows its assembly transform. */
export type SolidBox = { min: number[]; max: number[]; fixed?: boolean; sourceName?: string };
export type DoorMotion = {
  type: 'sectional';
  panelCount: number;
  panelGap: number;
  curveRadius: number;
  inward: number[];
  duration?: number;
} | {
  type: 'tracked-slide';
  /** Permanent bypass-rail position relative to authored closed coordinates. */
  baseOffset?: number[];
  unseat: number[];
  unseatFraction: number;
  duration?: number;
} | {
  type: 'flap';
  /** Rotation about the authored horizontal hinge line. */
  angle: number;
  duration?: number;
};
export type DoorPartPose = {
  /** Closed-pose rotation origin and current world-space position of it. */
  origin: number[];
  position: number[];
  rotationX: number;
  rotationY: number;
  rotationZ: number;
};
export type DoorDefinition = SolidBox & {
  id: string;
  label: string;
  pivot: number[];
  angle: number;
  slide: number[];
  fixed: boolean;
  /** Leads outside; pilots cannot open it in hide-and-seek rooms. */
  exterior?: boolean;
  kind: 'door' | 'cupboard' | 'drawer' | 'sliding';
  targetBoxes: SolidBox[];
  collisionBoxes: SolidBox[];
  motion?: DoorMotion;
};

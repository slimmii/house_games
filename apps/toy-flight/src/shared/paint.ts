import {
  DOORS,
  doorLocalPoint,
  doorLocalVector,
  doorWorldPoint,
  doorWorldVector,
  type DoorState,
} from '@huis/house/shared/doors';
import type { PaintAttachment, PaintMark, Vec3 } from './protocol';

export { doorLocalVector, doorWorldVector } from '@huis/house/shared/doors';

const doorIndexes = new Map(DOORS.map((door, index) => [door.id, index]));

/** Capture an authoritative impact in the moving assembly's closed-pose frame. */
export function createPaintAttachment(
  index: number,
  fraction: number,
  position: Vec3,
  normal: Vec3,
  partIndex = 0,
): PaintAttachment {
  const door = DOORS[index];
  if (!door) throw new RangeError(`Unknown door index ${index}`);
  return {
    doorId: door.id,
    ...(partIndex ? { partIndex } : {}),
    position: doorLocalPoint(position, index, fraction, partIndex),
    normal: doorLocalVector(normal, index, fraction, partIndex),
  };
}

export function paintAttachmentDoorIndex(mark: PaintMark): number {
  return mark.attachment ? (doorIndexes.get(mark.attachment.doorId) ?? -1) : -1;
}

/** Resolve any closed-pose splat vertex. Unknown attachments safely stay static. */
export function paintWorldPoint(mark: PaintMark, closedPoint: Vec3, states: readonly DoorState[]): Vec3 {
  const index = paintAttachmentDoorIndex(mark);
  return index < 0 ? { ...closedPoint } : doorWorldPoint(
    closedPoint,
    index,
    states[index]?.fraction ?? 0,
    mark.attachment?.partIndex ?? 0,
  );
}

/** Resolve the mark center and surface normal at the displayed door pose. */
export function resolvePaintPose(mark: PaintMark, states: readonly DoorState[]): { position: Vec3; normal: Vec3 } {
  const index = paintAttachmentDoorIndex(mark);
  if (index < 0 || !mark.attachment) return { position: { ...mark.position }, normal: { ...mark.normal } };
  const fraction = states[index]?.fraction ?? 0;
  const partIndex = mark.attachment.partIndex ?? 0;
  return {
    position: doorWorldPoint(mark.attachment.position, index, fraction, partIndex),
    normal: doorWorldVector(mark.attachment.normal, index, fraction, partIndex),
  };
}

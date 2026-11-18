import * as THREE from 'three';
import { installProbeShader } from '@huis/house/client/probeLighting';
import { FLOOR_Y } from '../sim/grid';
import { lanePoint, type Lane, type LanePoint } from '../sim/map';

const STRIP_LENGTH = 0.62;
const STRIP_GAP = 0.42;
const STRIP_WIDTH = 0.34;

/** A strip of masking tape with a felt-tip arrow, as one small texture. */
function tapeTexture(tape: string, ink: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.fillStyle = tape;
  context.fillRect(0, 0, 128, 64);
  // Torn ends and paper fibre.
  context.globalAlpha = 0.07;
  context.fillStyle = '#000';
  for (let line = 0; line < 22; line += 1) context.fillRect(0, Math.random() * 64, 128, 1);
  context.globalAlpha = 1;
  context.clearRect(0, 0, 3, 64);
  context.clearRect(125, 0, 3, 64);
  for (let notch = 0; notch < 64; notch += 5) {
    context.clearRect(3, notch, Math.random() * 4, 3);
    context.clearRect(125 - Math.random() * 4, notch, 4, 3);
  }
  context.strokeStyle = ink;
  context.lineWidth = 7;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(40, 32);
  context.lineTo(86, 32);
  context.moveTo(70, 16);
  context.lineTo(88, 32);
  context.lineTo(70, 48);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Marks a route on the floor with hand-stuck strips of tape, each with an
 * arrow pointing the way the soldiers march.
 */
export function createTapeRoute(lane: Lane, tape: string, ink: string): THREE.Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const point = {} as LanePoint;
  let seed = lane.id.length * 7919;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let distance = 0.5; distance + STRIP_LENGTH < lane.length - 0.6; distance += STRIP_LENGTH + STRIP_GAP) {
    lanePoint(lane, distance + STRIP_LENGTH / 2, (random() - 0.5) * 0.08, point);
    // Each strip is stuck down a little crooked.
    const angle = Math.atan2(point.dirZ, point.dirX) + (random() - 0.5) * 0.14;
    const forwardX = Math.cos(angle) * STRIP_LENGTH / 2;
    const forwardZ = Math.sin(angle) * STRIP_LENGTH / 2;
    const sideX = -Math.sin(angle) * STRIP_WIDTH / 2;
    const sideZ = Math.cos(angle) * STRIP_WIDTH / 2;
    const y = FLOOR_Y + 0.008;
    const corner = (forward: number, side: number, u: number, v: number) => {
      positions.push(point.x + forwardX * forward + sideX * side, y, point.z + forwardZ * forward + sideZ * side);
      uvs.push(u, v);
      normals.push(0, 1, 0);
    };
    corner(-1, -1, 0, 0); corner(1, 1, 1, 1); corner(1, -1, 1, 0);
    corner(-1, -1, 0, 0); corner(-1, 1, 0, 1); corner(1, 1, 1, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const material = new THREE.MeshStandardMaterial({
    map: tapeTexture(tape, ink), roughness: 0.9, transparent: true, alphaTest: 0.5,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  installProbeShader(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `tape-${lane.id}`;
  mesh.renderOrder = 0;
  return mesh;
}

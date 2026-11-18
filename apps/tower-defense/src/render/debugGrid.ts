import * as THREE from 'three';
import { FLOOR_Y } from '../sim/grid';
import type { GameMap } from '../sim/map';

/** `?debug=grid`: tint the floor by placement cell (red blocked, blue low clearance, yellow route). */
export function createGridOverlay(map: GameMap): THREE.Mesh {
  const { grid, laneMask } = map;
  const data = new Uint8Array(grid.width * grid.height * 4);
  for (let index = 0; index < grid.cells.length; index += 1) {
    const cell = grid.cells[index];
    const color = laneMask[index] && cell ? [247, 201, 72, 150] : cell === 0 ? [230, 60, 50, 110] : cell === 2 ? [60, 120, 230, 130] : [0, 0, 0, 0];
    data.set(color, index * 4);
  }
  const texture = new THREE.DataTexture(data, grid.width, grid.height);
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  const sizeX = grid.width * grid.cell;
  const sizeZ = grid.height * grid.cell;
  // Texture rows run from minZ upward; the plane is laid flat with +v toward +z.
  const geometry = new THREE.PlaneGeometry(sizeX, sizeZ).rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.position.set(grid.minX + sizeX / 2, FLOOR_Y + 0.02, grid.minZ + sizeZ / 2);
  mesh.renderOrder = 2;
  mesh.name = 'debug-grid';
  return mesh;
}

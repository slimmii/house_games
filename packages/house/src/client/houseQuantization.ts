import * as THREE from 'three';

type Dequantize = { position: [number, number, number, number] };

/**
 * house-gpu.glb stores positions as normalized int16 per accessor and normals
 * as normalized int8 (scripts/quantize-house-geometry.mjs). Restore float32
 * model-space attributes in place, so batching, back-face checks, doors and
 * closets see the same geometry layout as the original house.glb.
 */
export function dequantizeHouse(root: THREE.Object3D): number {
  const done = new Set<THREE.BufferGeometry>();
  // GLTFLoader shares an attribute between primitives that reuse an accessor; keep that sharing.
  const converted = new Map<THREE.BufferAttribute | THREE.InterleavedBufferAttribute, THREE.BufferAttribute>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || done.has(object.geometry)) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const params = geometry.userData.dequantize as Dequantize | undefined;
    if (!params) return;
    done.add(geometry);
    const [x, y, z, scale] = params.position;
    const position = geometry.getAttribute('position');
    let positions = converted.get(position);
    if (!positions) {
      positions = new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
      for (let i = 0; i < position.count; i += 1) {
        positions.setXYZ(i, position.getX(i) * scale + x, position.getY(i) * scale + y, position.getZ(i) * scale + z);
      }
      converted.set(position, positions);
    }
    geometry.setAttribute('position', positions);
    const normal = geometry.getAttribute('normal');
    if (normal) {
      let normals = converted.get(normal);
      if (!normals) {
        normals = new THREE.BufferAttribute(new Float32Array(normal.count * 3), 3);
        const vector = new THREE.Vector3();
        for (let i = 0; i < normal.count; i += 1) {
          vector.fromBufferAttribute(normal, i).normalize();
          normals.setXYZ(i, vector.x, vector.y, vector.z);
        }
        converted.set(normal, normals);
      }
      geometry.setAttribute('normal', normals);
    }
    delete geometry.userData.dequantize;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  });
  return done.size;
}

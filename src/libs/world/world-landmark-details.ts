import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mesh, type Point3 } from '@/libs/world/world-geometry';

export type LandmarkSurface = 'stone' | 'metal' | 'paint' | 'rubber' | 'ceramic' | 'glass' | `light:${string}`;

/** Each moving assembly keeps one mesh per surface, regardless of its detail count. */
export function createLandmarkBuilder() {
  const batches = new Map<THREE.Object3D, Map<LandmarkSurface, THREE.BufferGeometry[]>>();
  const materials = new Map<LandmarkSurface, THREE.MeshStandardMaterial>();
  const up = new THREE.Vector3(0, 1, 0);

  function surface(kind: LandmarkSurface) {
    let value = materials.get(kind);
    if (!value) {
      const finish = {
        stone: { roughness: 0.91, metalness: 0.03 },
        metal: { roughness: 0.34, metalness: 0.74 },
        paint: { roughness: 0.52, metalness: 0.19 },
        rubber: { roughness: 0.94, metalness: 0 },
        ceramic: { roughness: 0.28, metalness: 0.02 },
        glass: { roughness: 0.2, metalness: 0.5 },
      };
      value = new THREE.MeshStandardMaterial({
        vertexColors: true,
        ...(kind.startsWith('light:')
          ? { emissive: kind.slice(6), emissiveIntensity: 0.38, roughness: 0.4, metalness: 0.1 }
          : finish[kind as keyof typeof finish]),
      });
      value.name = `landmark-${kind}`;
      materials.set(kind, value);
    }
    return value;
  }

  function add(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    kind: LandmarkSurface,
    color: string,
    position: Point3 = [0, 0, 0],
    rotation: Point3 = [0, 0, 0],
  ) {
    geometry
      .rotateX(rotation[0])
      .rotateY(rotation[1])
      .rotateZ(rotation[2])
      .translate(...position);
    // Extrusions and rounded boxes are already non-indexed. Normalize the
    // remaining primitives so their normals/UVs/colors can share one buffer.
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) geometry.dispose();
    const colorAttribute = new Float32Array(part.getAttribute('position').count * 3);
    const tint = new THREE.Color(color);
    for (let vertex = 0; vertex < colorAttribute.length; vertex += 3) tint.toArray(colorAttribute, vertex);
    part.setAttribute('color', new THREE.BufferAttribute(colorAttribute, 3));
    const group = batches.get(parent) ?? new Map<LandmarkSurface, THREE.BufferGeometry[]>();
    const parts = group.get(kind) ?? [];
    parts.push(part);
    group.set(kind, parts);
    batches.set(parent, group);
  }

  function box(
    parent: THREE.Object3D,
    size: Point3,
    kind: LandmarkSurface,
    color: string,
    position: Point3,
    bevel = 0,
    rotation: Point3 = [0, 0, 0],
  ) {
    add(
      parent,
      bevel
        ? new RoundedBoxGeometry(...size, bevel >= 0.075 && Math.max(...size) > 1.4 ? 2 : 1, bevel)
        : new THREE.BoxGeometry(...size),
      kind,
      color,
      position,
      rotation,
    );
  }

  function oval(parent: THREE.Object3D, size: Point3, kind: LandmarkSurface, color: string, position: Point3) {
    const radius = Math.max(...size);
    const segments = radius < 0.12 ? 10 : radius < 0.4 ? 20 : 32;
    add(
      parent,
      new THREE.SphereGeometry(1, segments, Math.ceil(segments * 0.625)).scale(...size),
      kind,
      color,
      position,
    );
  }

  function cylinder(
    parent: THREE.Object3D,
    top: number,
    bottom: number,
    height: number,
    kind: LandmarkSurface,
    color: string,
    position: Point3,
    segments = 40,
    rotation: Point3 = [0, 0, 0],
  ) {
    const divisions = Math.max(top, bottom) < 0.1 ? Math.min(12, segments) : segments;
    add(parent, new THREE.CylinderGeometry(top, bottom, height, divisions), kind, color, position, rotation);
  }

  function torus(
    parent: THREE.Object3D,
    radius: number,
    tube: number,
    kind: LandmarkSurface,
    color: string,
    position: Point3,
    rotation: Point3 = [Math.PI / 2, 0, 0],
    arc = Math.PI * 2,
  ) {
    // Tiny links and short energy dashes need far fewer divisions than a
    // person-sized ring. This keeps detail proportional to its visible size.
    const segments = Math.max(12, Math.min(96, Math.ceil((radius * arc) / 0.09)));
    add(
      parent,
      new THREE.TorusGeometry(radius, tube, tube < 0.04 ? 6 : 8, segments, arc),
      kind,
      color,
      position,
      rotation,
    );
  }

  function beam(
    parent: THREE.Object3D,
    from: Point3,
    to: Point3,
    radius: number,
    kind: LandmarkSurface,
    color: string,
  ) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 12);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
    add(parent, geometry, kind, color, start.add(end).multiplyScalar(0.5).toArray() as Point3);
  }

  function flush() {
    for (const [parent, group] of batches) {
      for (const [kind, parts] of group) {
        const geometry = mergeGeometries(parts, false);
        parts.forEach((part) => part.dispose());
        if (!geometry) continue;
        const object = mesh(parent, geometry, surface(kind));
        object.name = `landmark-batch-${kind}`;
        geometry.computeBoundingSphere();
      }
    }
    batches.clear();
  }

  return { add, box, oval, cylinder, torus, beam, flush };
}

export type LandmarkBuilder = ReturnType<typeof createLandmarkBuilder>;

/** A curved solid band with an open center, used for coping and padded sectors. */
export function landmarkAnnulus(inner: number, outer: number, height: number, start: number, angle: number, bevel = 0) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, start, start + angle, false);
  shape.absarc(0, 0, inner, start + angle, start, true);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: Math.max(3, Math.min(16, Math.ceil((outer * angle) / 0.32))),
    steps: 1,
  }).rotateX(-Math.PI / 2);
}

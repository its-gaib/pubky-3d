import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeObject } from '@/libs/world/world-geometry';
import { WORLD_DIMENSIONS } from '@/libs/world/world-layout';

/** Fixed world-space limits, independent of the current camera, frustum or zoom. */
export const GALACTIC_JELLYFISH = {
  count: 8,
  farCount: 5,
  coastClearance: WORLD_DIMENSIONS.coastRadius + 12,
  nearOuterRadius: WORLD_DIMENSIONS.coastRadius * 2,
  farCoastClearance: WORLD_DIMENSIONS.coastRadius * 1.7,
  outerRadius: WORLD_DIMENSIONS.coastRadius * 2.8,
  upperY: 150,
  lowerY: 4,
  fadeWidth: 22,
  minScale: 3,
  maxScale: 7,
  unitExtent: 4,
  maxDelta: 0.05,
  colors: ['#61DFFF', '#CF99FF', '#FF91D7', '#82FFE1', '#FFCE86', '#A4B9FF'],
} as const;

export interface GalacticJellyfishState {
  id: number;
  generation: number;
  position: [number, number, number];
  velocity: [number, number, number];
  scale: number;
  speed: number;
  phase: number;
  color: number;
  age: number;
}

function random(seed: number): number {
  let value = (seed | 0) ^ 0x9e3779b9;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0x100000000;
}

export function jellyfishExtent(scale: number): number {
  // Includes all orientations, the longest animated tentacle, and its pulse.
  return scale * GALACTIC_JELLYFISH.unitExtent;
}

/** Stable cohorts: about 60% swim farther out; the rest retain their near envelope. */
export function jellyfishBounds(state: Pick<GalacticJellyfishState, 'id'>) {
  const far = state.id < GALACTIC_JELLYFISH.farCount;
  return {
    coastClearance: far ? GALACTIC_JELLYFISH.farCoastClearance : GALACTIC_JELLYFISH.coastClearance,
    outerRadius: far ? GALACTIC_JELLYFISH.outerRadius : GALACTIC_JELLYFISH.nearOuterRadius,
  };
}

function smooth(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function jellyfishOpacity(state: GalacticJellyfishState): number {
  const extent = jellyfishExtent(state.scale);
  const bounds = jellyfishBounds(state);
  const margin = Math.min(
    bounds.outerRadius - Math.hypot(...state.position) - extent,
    GALACTIC_JELLYFISH.upperY - state.position[1] - extent,
  );
  return smooth(margin / GALACTIC_JELLYFISH.fadeWidth) * smooth(state.age / 3.5);
}

/** A body is recycled only after its entire animated bounds leave the envelope. */
export function jellyfishOutsideEnvelope(state: GalacticJellyfishState): boolean {
  const extent = jellyfishExtent(state.scale);
  return (
    Math.hypot(...state.position) - extent > jellyfishBounds(state).outerRadius ||
    state.position[1] - extent > GALACTIC_JELLYFISH.upperY
  );
}

export function createJellyfishState(id: number, generation = 0, entering = false): GalacticJellyfishState {
  const seed = (id + 1) * 173 + generation * 7919;
  const scale =
    GALACTIC_JELLYFISH.minScale + random(seed) * (GALACTIC_JELLYFISH.maxScale - GALACTIC_JELLYFISH.minScale);
  const extent = jellyfishExtent(scale);
  const phase = random(seed + 1) * Math.PI * 2;
  const angle = id * 2.399963229728653 + generation * 1.324717957;
  const minY = GALACTIC_JELLYFISH.lowerY + extent;
  const high = id % 4 === 3;
  const y = high
    ? 72 + random(seed + 2) * (Math.min(125, GALACTIC_JELLYFISH.upperY - extent - 6) - 72)
    : minY + 6 + random(seed + 2) * 18;
  const bounds = jellyfishBounds({ id });
  const minimumRadius = bounds.coastClearance + extent;
  const outerCenter = bounds.outerRadius - extent - 10;
  const maximumRadius = Math.sqrt(Math.max(minimumRadius ** 2, outerCenter ** 2 - y ** 2));
  const radius = entering
    ? Math.sqrt((bounds.outerRadius + extent - 0.01) ** 2 - y ** 2)
    : minimumRadius + 4 + random(seed + 3) * Math.max(0, maximumRadius - minimumRadius - 4);
  const speed = 1.8 + random(seed + 4) * 4.2;
  const heading = entering ? angle + Math.PI + (random(seed + 5) - 0.5) * 0.9 : random(seed + 5) * Math.PI * 2;
  const vertical = (random(seed + 6) - 0.5) * 1.2;
  const normalize = speed / Math.hypot(Math.sin(heading), vertical, Math.cos(heading));
  return {
    id,
    generation,
    position: [Math.sin(angle) * radius, y, Math.cos(angle) * radius],
    velocity: [Math.sin(heading) * normalize, vertical * normalize, Math.cos(heading) * normalize],
    scale,
    speed,
    phase,
    color: (id + generation) % GALACTIC_JELLYFISH.colors.length,
    age: entering ? 0 : 12,
  };
}

/** Pure, bounded motion: steer away from land, glide above water, exit into space. */
export function stepJellyfish(state: GalacticJellyfishState, delta: number): GalacticJellyfishState {
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, GALACTIC_JELLYFISH.maxDelta)) : 0;
  if (dt === 0) return state;
  const extent = jellyfishExtent(state.scale);
  const innerRadius = jellyfishBounds(state).coastClearance + extent;
  const radial = Math.hypot(state.position[0], state.position[2]);
  const normalX = state.position[0] / radial;
  const normalZ = state.position[2] / radial;
  let [vx, vy, vz] = state.velocity;
  const age = state.age + dt;
  vx += Math.sin(age * 0.31 + state.phase) * 0.13 * dt;
  vz += Math.cos(age * 0.27 + state.phase) * 0.13 * dt;
  vy += Math.sin(age * 0.23 + state.phase) * 0.07 * dt;
  // Most bodies glide near the horizon; one quarter retain a higher, slowly varying lane.
  const cruisingY = state.id % 4 === 3 ? 94 : GALACTIC_JELLYFISH.lowerY + extent + 14;
  vy += ((cruisingY - state.position[1]) * 0.018 - vy * 0.12) * dt;
  const inward = vx * normalX + vz * normalZ;
  if (inward < 0 && radial < innerRadius + 18) {
    const turn = (1 - Math.max(0, radial - innerRadius) / 18) * state.speed * 2.1 * dt;
    vx += normalX * turn;
    vz += normalZ * turn;
  }
  const pace = state.speed / Math.hypot(vx, vy, vz);
  vx *= pace;
  vy *= pace;
  vz *= pace;
  let x = state.position[0] + vx * dt;
  let y = state.position[1] + vy * dt;
  let z = state.position[2] + vz * dt;
  const nextRadial = Math.hypot(x, z);
  if (nextRadial < innerRadius) {
    const nx = x / nextRadial;
    const nz = z / nextRadial;
    x = nx * innerRadius;
    z = nz * innerRadius;
    const incoming = vx * nx + vz * nz;
    if (incoming < 0) {
      vx -= 2 * incoming * nx;
      vz -= 2 * incoming * nz;
    }
  }
  const floor = GALACTIC_JELLYFISH.lowerY + extent;
  if (y < floor) {
    y = floor;
    vy = Math.abs(vy);
  }
  const next = {
    ...state,
    position: [x, y, z] as [number, number, number],
    velocity: [vx, vy, vz] as [number, number, number],
    age,
  };
  return jellyfishOutsideEnvelope(next) ? createJellyfishState(state.id, state.generation + 1, true) : next;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const combined = mergeGeometries(nonIndexed)!;
  new Set([...parts, ...nonIndexed]).forEach((part) => part.dispose());
  return combined;
}

function rimGeometry() {
  const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(1, 0.032, 6, 64).rotateX(Math.PI / 2)];
  for (let rib = 0; rib < 8; rib++) {
    const angle = (rib / 8) * Math.PI * 2;
    const points = Array.from({ length: 6 }, (_, index) => {
      const arc = ((index / 5) * Math.PI) / 2;
      return new THREE.Vector3(Math.sin(arc) * Math.cos(angle), Math.cos(arc) * 0.72, Math.sin(arc) * Math.sin(angle));
    });
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18, 0.013, 3, false));
  }
  return merge(parts);
}

function tentacleGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let arm = 0; arm < 11; arm++) {
    const angle = (arm / 8) * Math.PI * 2;
    const inner = arm >= 8;
    const length = inner ? 2.5 : 2.35 + (arm % 3) * 0.34;
    const points = Array.from({ length: 10 }, (_, index) => {
      const t = index / 9;
      const radius = inner ? 0.2 + t * 0.1 : 0.77 + t * 0.14;
      return new THREE.Vector3(
        Math.cos(angle) * radius + Math.sin(t * 8 + angle) * t * 0.23,
        -0.03 - t * length,
        Math.sin(angle) * radius + Math.cos(t * 6 + angle) * t * 0.23,
      );
    });
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, inner ? 0.047 : 0.019, 4, false));
  }
  return merge(parts);
}

/** Four instanced draw calls render a fixed, genuinely three-dimensional population. */
export function createGalacticJellyfish(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'Galactic jellyfish';
  scene.add(group);
  let states = Array.from({ length: GALACTIC_JELLYFISH.count }, (_, id) => createJellyfishState(id));
  let simulationTime = 0;
  let disposed = false;
  const makeInstances = (geometry: THREE.BufferGeometry, opacity: number, name: string) => {
    const material = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      fog: false,
      toneMapped: false,
    });
    const instances = new THREE.InstancedMesh(geometry, material, GALACTIC_JELLYFISH.count);
    instances.name = name;
    instances.frustumCulled = false;
    instances.castShadow = false;
    instances.receiveShadow = false;
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(instances);
    return instances;
  };
  const bell = makeInstances(
    new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.72, 1),
    0.18,
    'Translucent bells',
  );
  const rim = makeInstances(rimGeometry(), 0.82, 'Glowing bell ribs');
  const tentacles = makeInstances(tentacleGeometry(), 0.68, 'Trailing tentacles');
  const core = makeInstances(new THREE.SphereGeometry(0.24, 12, 8), 0.42, 'Luminous hearts');
  const instances = [bell, rim, tentacles, core];
  const transform = new THREE.Object3D();
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const targetRotation = new THREE.Quaternion();
  const twist = new THREE.Quaternion();
  const rotations = states.map((state) =>
    new THREE.Quaternion().setFromUnitVectors(up, direction.set(...state.velocity).normalize()),
  );
  const colors = GALACTIC_JELLYFISH.colors.map((color) => new THREE.Color(color));
  const tint = new THREE.Color();
  const white = new THREE.Color('#FFFFFF');

  function paint(delta: number) {
    states.forEach((state, index) => {
      const phase = simulationTime * (0.9 + state.speed * 0.16) + state.phase;
      const pulse = Math.sin(phase);
      const brightness = jellyfishOpacity(state);
      targetRotation.setFromUnitVectors(up, direction.set(...state.velocity).normalize());
      rotations[index].slerp(targetRotation, delta ? 1 - Math.exp(-delta * 2.5) : 1);
      transform.position.set(...state.position);
      transform.quaternion.copy(rotations[index]);
      transform.scale.set(
        state.scale * (1 + pulse * 0.075),
        state.scale * (1 - pulse * 0.09),
        state.scale * (1 + pulse * 0.075),
      );
      transform.updateMatrix();
      bell.setMatrixAt(index, transform.matrix);
      rim.setMatrixAt(index, transform.matrix);
      tint.copy(colors[state.color]).multiplyScalar(brightness);
      bell.setColorAt(index, tint);
      rim.setColorAt(index, tint);

      twist.setFromAxisAngle(up, Math.sin(phase * 0.55) * 0.17);
      transform.quaternion.multiply(twist);
      transform.scale.set(
        state.scale * (1 - pulse * 0.045),
        state.scale * (1 + pulse * 0.09),
        state.scale * (1 - pulse * 0.045),
      );
      transform.updateMatrix();
      tentacles.setMatrixAt(index, transform.matrix);
      tint.copy(colors[state.color]).lerp(white, 0.2).multiplyScalar(brightness);
      tentacles.setColorAt(index, tint);

      transform.quaternion.copy(rotations[index]);
      transform.scale.setScalar(state.scale * (1 + pulse * 0.16));
      transform.updateMatrix();
      core.setMatrixAt(index, transform.matrix);
      tint.copy(colors[state.color]).lerp(white, 0.6).multiplyScalar(brightness);
      core.setColorAt(index, tint);
    });
    for (const object of instances) {
      object.instanceMatrix.needsUpdate = true;
      if (object.instanceColor) object.instanceColor.needsUpdate = true;
    }
  }
  paint(0);

  return {
    group,
    animate(_time: number, delta: number, reducedMotion = false) {
      if (disposed || reducedMotion || !Number.isFinite(delta) || delta <= 0) return;
      const step = Math.min(delta, GALACTIC_JELLYFISH.maxDelta);
      simulationTime += step;
      states = states.map((state) => stepJellyfish(state, step));
      paint(step);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // InstancedMesh owns GPU attributes beyond its shared geometry/material.
      instances.forEach((object) => object.dispose());
      disposeObject(group);
    },
  };
}

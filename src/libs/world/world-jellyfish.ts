import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldBurnTarget } from '@/libs/world/world-burning';
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

function colorGeometry(geometry: THREE.BufferGeometry, alpha: (x: number, y: number, z: number) => number) {
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 4);
  for (let index = 0; index < positions.count; index++) {
    colors[index * 4] = 1;
    colors[index * 4 + 1] = 1;
    colors[index * 4 + 2] = 1;
    colors[index * 4 + 3] = alpha(positions.getX(index), positions.getY(index), positions.getZ(index));
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return geometry;
}

function bellPoint(angle: number, fraction: number) {
  const arc = (fraction * Math.PI) / 2;
  const scallop = Math.cos(angle * 12);
  const radius = Math.sin(arc) * (1 + scallop * 0.035 * fraction ** 5);
  return new THREE.Vector3(
    radius * Math.cos(angle),
    Math.cos(arc) * 0.72 - (1 - scallop) * 0.028 * fraction ** 8,
    radius * Math.sin(angle),
  );
}

function bellGeometry() {
  const geometry = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const angle = Math.atan2(positions.getZ(index), positions.getX(index));
    const fraction = (Math.acos(THREE.MathUtils.clamp(positions.getY(index), -1, 1)) * 2) / Math.PI;
    const point = bellPoint(angle, fraction);
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return colorGeometry(geometry, (x, y, z) => {
    const edge = 1 - Math.max(0, y) / 0.72;
    const radial = Math.cos(Math.atan2(z, x) * 12) * 0.08;
    return 0.2 + edge * 0.6 + radial * edge;
  });
}

function rimGeometry() {
  const edge = Array.from({ length: 96 }, (_, index) => bellPoint((index / 96) * Math.PI * 2, 1));
  const parts: THREE.BufferGeometry[] = [
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge, true), 128, 0.025, 4, true),
  ];
  for (let rib = 0; rib < 12; rib++) {
    const angle = (rib / 12) * Math.PI * 2;
    const points = Array.from({ length: 9 }, (_, index) =>
      bellPoint(angle + Math.sin((index / 8) * Math.PI) * 0.06, index / 8),
    );
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.011, 3, false));
    const bead = bellPoint(angle + Math.PI / 12, 0.99);
    parts.push(new THREE.OctahedronGeometry(0.035).translate(bead.x, bead.y, bead.z));
  }
  const geometry = merge(parts);
  return colorGeometry(geometry, (_x, y) => 0.45 + (1 - Math.max(0, y) / 0.75) * 0.5);
}

function oralArmGeometry(arm: number) {
  const steps = 32;
  const widthSteps = 4;
  const angle = (arm / 4) * Math.PI * 2;
  const vertices: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const radius = 0.16 + t * 0.23;
    const width = (0.055 + Math.sin(t * Math.PI) * 0.1) * (1 - t * 0.6);
    const centerX = Math.cos(angle) * radius + Math.sin(t * 8 + angle) * t * 0.16;
    const centerZ = Math.sin(angle) * radius + Math.cos(t * 7 + angle) * t * 0.16;
    for (let cross = 0; cross <= widthSteps; cross++) {
      const across = (cross / widthSteps) * 2 - 1;
      const ruffle = Math.sin(t * 46 + angle + across) * Math.abs(across) * 0.065 * Math.sin(t * Math.PI);
      vertices.push(
        centerX + Math.cos(angle + Math.PI / 2) * across * width + Math.cos(angle) * ruffle,
        0.08 - t * (2.42 + (arm % 2) * 0.12) + ruffle * 0.35,
        centerZ + Math.sin(angle + Math.PI / 2) * across * width + Math.sin(angle) * ruffle,
      );
      uv.push(cross / widthSteps, t);
      if (step < steps && cross < widthSteps) {
        const base = step * (widthSteps + 1) + cross;
        indices.push(base, base + widthSteps + 1, base + 1, base + 1, base + widthSteps + 1, base + widthSteps + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function tentacleGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let arm = 0; arm < 12; arm++) {
    const angle = (arm / 12) * Math.PI * 2;
    const length = 2.3 + (arm % 4) * 0.17;
    const points = Array.from({ length: 12 }, (_, index) => {
      const t = index / 11;
      const radius = 0.77 + t * 0.09;
      return new THREE.Vector3(
        Math.cos(angle) * radius + Math.sin(t * 8 + angle) * t * 0.2,
        -0.025 - t * length,
        Math.sin(angle) * radius + Math.cos(t * 7 + angle) * t * 0.2,
      );
    });
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 32, 0.021, 5, false);
    const positions = geometry.getAttribute('position');
    for (let step = 0; step <= 32; step++) {
      const t = step / 32;
      const center = curve.getPointAt(t);
      const taper = 1 - t * 0.82;
      for (let side = 0; side <= 5; side++) {
        const index = step * 6 + side;
        positions.setXYZ(
          index,
          center.x + (positions.getX(index) - center.x) * taper,
          center.y + (positions.getY(index) - center.y) * taper,
          center.z + (positions.getZ(index) - center.z) * taper,
        );
      }
    }
    geometry.computeVertexNormals();
    parts.push(geometry);
  }
  for (let arm = 0; arm < 4; arm++) parts.push(oralArmGeometry(arm));
  return colorGeometry(merge(parts), (_x, y) => 0.92 - THREE.MathUtils.clamp(-y / 3, 0, 1) ** 2 * 0.66);
}

function coreGeometry() {
  const parts: THREE.BufferGeometry[] = [new THREE.SphereGeometry(0.12, 12, 8).translate(0, 0.19, 0)];
  for (let lobe = 0; lobe < 4; lobe++) {
    const angle = (lobe / 4) * Math.PI * 2;
    parts.push(
      new THREE.TorusGeometry(0.12, 0.033, 4, 28)
        .scale(1, 1.35, 1)
        .rotateX(Math.PI / 2)
        .rotateY(-angle)
        .translate(Math.cos(angle) * 0.17, 0.17, Math.sin(angle) * 0.17),
    );
  }
  return colorGeometry(merge(parts), () => 0.8);
}

/** Four shared instance pools hold eight sculpted bells, veined rims, oral arms and trailing filaments. */
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
      vertexColors: true,
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
  const bell = makeInstances(bellGeometry(), 0.34, 'Translucent bells');
  const rim = makeInstances(rimGeometry(), 0.72, 'Glowing bell ribs');
  const tentacles = makeInstances(tentacleGeometry(), 0.67, 'Trailing tentacles');
  const core = makeInstances(coreGeometry(), 0.55, 'Luminous hearts');
  const tentacleTime = { value: 0 };
  const phases = new THREE.InstancedBufferAttribute(new Float32Array(GALACTIC_JELLYFISH.count), 1);
  phases.setUsage(THREE.DynamicDrawUsage);
  tentacles.geometry.setAttribute('jellyfishPhase', phases);
  // Vertex motion keeps every strand rooted to its bell without rebuilding geometry or textures.
  tentacles.material.onBeforeCompile = (shader) => {
    shader.uniforms.jellyfishTime = tentacleTime;
    shader.vertexShader = `uniform float jellyfishTime;\nattribute float jellyfishPhase;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float trail = pow(clamp(-position.y / 3.0, 0.0, 1.0), 1.35);
      float wave = jellyfishTime * 1.25 + jellyfishPhase - position.y * 2.4;
      transformed.x += sin(wave + position.z * 2.0) * 0.1 * trail;
      transformed.z += cos(wave * 0.87 + position.x * 2.0) * 0.08 * trail;`,
    );
  };
  tentacles.material.customProgramCacheKey = () => 'pubky-jellyfish-trailing-filaments-v1';
  const instances = [bell, rim, tentacles, core];
  const baseMatrices = instances.map(() => states.map(() => new THREE.Matrix4()));
  const ignited = new Set<number>();
  const gone = new Set<number>();
  const burnMatrix = new THREE.Matrix4();
  const burnScale = new THREE.Vector3();
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

  function writeInstance(part: number, index: number, matrix: THREE.Matrix4) {
    baseMatrices[part][index].copy(matrix);
    instances[part].setMatrixAt(index, matrix);
    instances[part].boundingBox = null;
    instances[part].boundingSphere = null;
  }

  function applyBurn(index: number) {
    const scale = gone.has(index) ? 0 : 1;
    burnScale.setScalar(scale);
    instances.forEach((instance, part) => {
      burnMatrix.copy(baseMatrices[part][index]).scale(burnScale);
      instance.setMatrixAt(index, burnMatrix);
      instance.instanceMatrix.needsUpdate = true;
      instance.boundingBox = null;
      instance.boundingSphere = null;
    });
  }

  function paint(delta: number) {
    tentacleTime.value = simulationTime;
    states.forEach((state, index) => {
      if (gone.has(index)) {
        applyBurn(index);
        return;
      }
      const phase = simulationTime * (0.9 + state.speed * 0.16) + state.phase;
      const pulse = Math.sin(phase);
      const brightness = jellyfishOpacity(state);
      phases.setX(index, state.phase);
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
      writeInstance(0, index, transform.matrix);
      writeInstance(1, index, transform.matrix);
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
      writeInstance(2, index, transform.matrix);
      tint.copy(colors[state.color]).lerp(white, 0.2).multiplyScalar(brightness);
      tentacles.setColorAt(index, tint);

      transform.quaternion.copy(rotations[index]);
      transform.scale.setScalar(state.scale * (1 + pulse * 0.16));
      transform.updateMatrix();
      writeInstance(3, index, transform.matrix);
      tint.copy(colors[state.color]).lerp(white, 0.6).multiplyScalar(brightness);
      core.setColorAt(index, tint);
    });
    phases.needsUpdate = true;
    for (const object of instances) {
      object.instanceMatrix.needsUpdate = true;
      if (object.instanceColor) object.instanceColor.needsUpdate = true;
    }
  }
  paint(0);

  const instanceMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const partBounds = new THREE.Box3();
  const hits: THREE.Intersection[] = [];
  // One non-rendered ray proxy borrows the four pools' resources sequentially.
  const rayProxy = new THREE.Mesh(bell.geometry, bell.material);
  const burnTargets: WorldBurnTarget[] = states.map((state, index) => ({
    id: `prop:jellyfish:${state.id}`,
    canIgnite: () => !disposed && !gone.has(index) && group.visible && jellyfishOpacity(states[index]) > 0.01,
    getBounds(out) {
      out.makeEmpty();
      if (disposed || gone.has(index) || !group.visible) return false;
      group.updateWorldMatrix(true, true);
      for (const instance of instances) {
        instance.getMatrixAt(index, instanceMatrix);
        worldMatrix.multiplyMatrices(instance.matrixWorld, instanceMatrix);
        if (!instance.geometry.boundingBox) instance.geometry.computeBoundingBox();
        partBounds.copy(instance.geometry.boundingBox!).applyMatrix4(worldMatrix);
        // CPU bounds include the bounded shader displacement of trailing strands.
        if (instance === tentacles) partBounds.expandByScalar(worldMatrix.getMaxScaleOnAxis() * 0.13);
        out.union(partBounds);
      }
      return !out.isEmpty();
    },
    raycast(raycaster) {
      if (disposed || gone.has(index) || !group.visible) return null;
      group.updateWorldMatrix(true, true);
      let closest = Infinity;
      for (const instance of instances) {
        instance.getMatrixAt(index, instanceMatrix);
        rayProxy.geometry = instance.geometry;
        rayProxy.material = instance.material;
        rayProxy.matrixWorld.multiplyMatrices(instance.matrixWorld, instanceMatrix);
        hits.length = 0;
        rayProxy.raycast(raycaster, hits);
        for (const hit of hits) closest = Math.min(closest, hit.distance);
      }
      return Number.isFinite(closest) ? closest : null;
    },
    onIgnite() {
      if (!disposed) ignited.add(index);
    },
    hide() {
      if (disposed) return;
      gone.add(index);
      ignited.delete(index);
      applyBurn(index);
    },
  }));

  return {
    group,
    burnTargets,
    animate(_time: number, delta: number, reducedMotion = false) {
      if (disposed || reducedMotion || !Number.isFinite(delta) || delta <= 0) return;
      const step = Math.min(delta, GALACTIC_JELLYFISH.maxDelta);
      simulationTime += step;
      // An ignited body stays with its fire; burning never teleports to a replacement.
      states = states.map((state, index) =>
        ignited.has(index) || gone.has(index) ? state : stepJellyfish(state, step),
      );
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

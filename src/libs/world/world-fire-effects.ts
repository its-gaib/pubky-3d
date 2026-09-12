import * as THREE from 'three';
import { WORLD_BURN_LIMITS } from '@/libs/world/world-burning';
import { disposeObject } from '@/libs/world/world-geometry';

export type WorldFireStreamKind = 'weapon' | 'dragon';

export const WORLD_FIRE_LIMITS = {
  flames: 384,
  smoke: 96,
  embers: 192,
  debris: 96,
  fires: 32,
  smoldering: WORLD_BURN_LIMITS.smoldering,
  explosions: 32,
  weaponRange: 22,
  dragonRange: 32,
} as const;

type ParticleKind = 'flame' | 'smoke' | 'ember' | 'debris';

interface ParticlePool {
  kind: ParticleKind;
  mesh: THREE.InstancedMesh;
  capacity: number;
  opacity: THREE.InstancedBufferAttribute;
  cursor: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  life: Float32Array;
  age: Float32Array;
  width: Float32Array;
  height: Float32Array;
  turn: Float32Array;
  warmth: Float32Array;
  directional: Uint8Array;
  burst: Uint8Array;
}

interface Stream {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  strength: number;
  pending: boolean;
  credit: number;
  kind: WorldFireStreamKind;
}

interface BurningVolume {
  min: THREE.Vector3;
  max: THREE.Vector3;
  size: THREE.Vector3;
  elapsed: number;
  credit: number;
}

interface Explosion {
  center: THREE.Vector3;
  size: THREE.Vector3;
  radius: number;
  pending: boolean;
  elapsed: number;
}

/** Code-generated soft sprites keep fire independent of external assets and canvas APIs. */
function sprite(kind: Exclude<ParticleKind, 'debris'>): THREE.DataTexture {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1) - 0.5) * 2;
      const ny = (y / (size - 1) - 0.5) * 2;
      let alpha: number;
      let light = 1;
      if (kind === 'flame') {
        const t = y / (size - 1);
        const center = Math.sin(t * 7 - 0.3) * 0.13 * (0.6 + t);
        const width = 0.67 * Math.pow(Math.max(0.005, 1 - t), 0.63) + 0.025;
        const core = Math.exp(-2.6 * ((nx - center) / width) ** 2);
        const wisp = Math.exp(-4 * ((nx + 0.18 - t * 0.35) / (width * 0.48)) ** 2 - ((t - 0.65) / 0.32) ** 2) * 0.42;
        alpha =
          Math.min(1, core + wisp) *
          THREE.MathUtils.smoothstep(t, 0, 0.22) *
          THREE.MathUtils.smoothstep(1 - t, 0, 0.12) *
          THREE.MathUtils.smoothstep(1 - Math.abs(nx), 0, 0.14);
        light = 0.8 + core * 0.2;
      } else if (kind === 'smoke') {
        const angle = Math.atan2(ny, nx);
        const radius = Math.hypot(nx, ny) * (1 + Math.sin(angle * 5 + 0.6) * 0.075);
        alpha = Math.pow(Math.max(0, 1 - radius), 1.2);
        light = 0.83 + Math.sin(nx * 11 + ny * 7) * Math.cos(ny * 9) * 0.08;
      } else {
        alpha = Math.pow(Math.max(0, 1 - Math.hypot(nx, ny)), 1.6);
      }
      const at = (y * size + x) * 4;
      pixels[at] = Math.round(light * 255);
      pixels[at + 1] = Math.round(light * 255);
      pixels[at + 2] = Math.round(light * 255);
      pixels[at + 3] = Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `world-fire-${kind}-sprite`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function pool(parent: THREE.Group, kind: ParticleKind, capacity: number): ParticlePool {
  const material = new THREE.MeshBasicMaterial({
    map: kind === 'debris' ? null : sprite(kind),
    vertexColors: kind === 'debris',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: kind === 'ember' ? THREE.AdditiveBlending : THREE.NormalBlending,
    opacity: kind === 'smoke' ? 0.42 : kind === 'ember' ? 0.92 : kind === 'debris' ? 1 : 0.86,
    toneMapped: false,
  });
  material.name = `world-fire-${kind}`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fireOpacity;\nvarying float vFireOpacity;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFireOpacity = fireOpacity;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFireOpacity;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFireOpacity;');
  };
  material.customProgramCacheKey = () => 'world-fire-opacity-v1';
  const geometry = kind === 'debris' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.PlaneGeometry(1, 1);
  if (kind === 'debris') {
    // Fixed face shading makes each solid fragment read while it tumbles, without adding lights.
    const normals = geometry.getAttribute('normal');
    const faceColors = new Float32Array(normals.count * 3);
    for (let index = 0; index < normals.count; index++) {
      const light = 0.67 + normals.getY(index) * 0.17 + normals.getZ(index) * 0.1;
      faceColors.set([light, light, light], index * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(faceColors, 3));
  }
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  opacity.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('fireOpacity', opacity);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = `world-fire-${kind}-particles`;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.renderOrder = kind === 'smoke' ? 8 : kind === 'debris' ? 10 : 9;
  const empty = new THREE.Matrix4().makeScale(0, 0, 0);
  const white = new THREE.Color(1, 1, 1);
  for (let index = 0; index < capacity; index++) {
    mesh.setMatrixAt(index, empty);
    mesh.setColorAt(index, white);
  }
  mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  parent.add(mesh);
  return {
    kind,
    mesh,
    capacity,
    opacity,
    cursor: 0,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    vz: new Float32Array(capacity),
    life: new Float32Array(capacity),
    age: new Float32Array(capacity).fill(-1),
    width: new Float32Array(capacity),
    height: new Float32Array(capacity),
    turn: new Float32Array(capacity),
    warmth: new Float32Array(capacity),
    directional: new Uint8Array(capacity),
    burst: new Uint8Array(capacity),
  };
}

/** Four capped particle draws serve every local fire, explosion and both kinds of fire breath. */
export function createWorldFireEffects(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.name = 'world-fire-effects';
  root.visible = false;
  scene.add(root);
  const flames = pool(root, 'flame', WORLD_FIRE_LIMITS.flames);
  const smoke = pool(root, 'smoke', WORLD_FIRE_LIMITS.smoke);
  const embers = pool(root, 'ember', WORLD_FIRE_LIMITS.embers);
  const debris = pool(root, 'debris', WORLD_FIRE_LIMITS.debris);
  const debrisAngles = new Float32Array(WORLD_FIRE_LIMITS.debris * 3);
  const debrisSpins = new Float32Array(WORLD_FIRE_LIMITS.debris * 3);
  const pools = [smoke, flames, embers];
  const fires = new Map<string, BurningVolume>();
  const smoldering = new Map<string, BurningVolume>();
  const createCorpseFlames = () => {
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: '#FF8C27',
        map: sprite('flame'),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
      WORLD_FIRE_LIMITS.smoldering * 3,
    );
    mesh.name = 'world-smoldering-corpse-flames';
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    return mesh;
  };
  let corpseFlames: ReturnType<typeof createCorpseFlames> | null = null;
  const explosions = new Map<string, Explosion>();
  const streams: Stream[] = (['weapon', 'dragon'] as const).map((kind) => ({
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, 1),
    strength: 0,
    pending: false,
    credit: 0,
    kind,
  }));
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const empty = new THREE.Matrix4().makeScale(0, 0, 0);
  const rotation = new THREE.Quaternion();
  const cameraRotation = new THREE.Quaternion();
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const color = new THREE.Color();
  const fragmentRotation = new THREE.Euler();
  let randomState = 0x3c8fd725;
  let disposed = false;

  function random() {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  }

  function birth(
    target: ParticlePool,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    width: number,
    height: number,
    warmth = random(),
    directional = false,
    burst = false,
  ) {
    const index = target.cursor;
    target.cursor = (index + 1) % target.capacity;
    target.x[index] = x;
    target.y[index] = y;
    target.z[index] = z;
    target.vx[index] = vx;
    target.vy[index] = vy;
    target.vz[index] = vz;
    target.life[index] = life;
    target.age[index] = 0;
    target.width[index] = width;
    target.height[index] = height;
    target.turn[index] = (random() - 0.5) * (target.kind === 'flame' ? 0.5 : Math.PI * 2);
    target.warmth[index] = warmth;
    target.directional[index] = Number(directional);
    target.burst[index] = Number(burst);
    return index;
  }

  function streamParticles(stream: Stream, dt: number, reducedMotion: boolean) {
    if (!stream.pending || stream.strength <= 0) {
      stream.credit = 0;
      return;
    }
    const dragon = stream.kind === 'dragon';
    const range = dragon ? WORLD_FIRE_LIMITS.dragonRange : WORLD_FIRE_LIMITS.weaponRange;
    const rate = (dragon ? 320 : 260) * stream.strength * (reducedMotion ? 0.45 : 1);
    stream.credit = Math.min(32, stream.credit + dt * rate);
    const count = Math.floor(stream.credit);
    stream.credit -= count;
    if (Math.abs(stream.direction.y) > 0.96) right.set(1, 0, 0);
    else right.crossVectors(stream.direction, up).normalize();
    cross.crossVectors(right, stream.direction).normalize();
    for (let index = 0; index < count; index++) {
      const distance = random() * range * 0.74;
      const along = distance / range;
      const angle = random() * Math.PI * 2;
      const radius = (0.1 + along * (dragon ? 1.8 : 0.9)) * Math.sqrt(random());
      const dx = (right.x * Math.cos(angle) + cross.x * Math.sin(angle)) * radius;
      const dy = (right.y * Math.cos(angle) + cross.y * Math.sin(angle)) * radius;
      const dz = (right.z * Math.cos(angle) + cross.z * Math.sin(angle)) * radius;
      const speed = (dragon ? 57 : 48) * (reducedMotion ? 0.72 : 1);
      const width = (dragon ? 0.68 : 0.37) + along * (dragon ? 2.4 : 1.5);
      birth(
        flames,
        stream.origin.x + stream.direction.x * distance + dx,
        stream.origin.y + stream.direction.y * distance + dy,
        stream.origin.z + stream.direction.z * distance + dz,
        stream.direction.x * speed + dx * 1.3,
        stream.direction.y * speed + dy * 1.3 + 1.1,
        stream.direction.z * speed + dz * 1.3,
        (range - distance) / speed,
        width,
        width * (1.6 + random() * 0.65),
        random() < 0.28 ? 0.95 : along * 0.48 + random() * 0.35,
        true,
      );
      if (index % 4 === 0) {
        birth(
          embers,
          stream.origin.x + stream.direction.x * distance + dx,
          stream.origin.y + stream.direction.y * distance + dy,
          stream.origin.z + stream.direction.z * distance + dz,
          stream.direction.x * speed * 0.72 + dx * 5,
          stream.direction.y * speed * 0.72 + 3 + dy * 4,
          stream.direction.z * speed * 0.72 + dz * 5,
          0.36 + random() * 0.4,
          0.05 + random() * 0.045,
          0.28 + random() * 0.48,
        );
      }
      if (index % 7 === 0) {
        birth(
          smoke,
          stream.origin.x + stream.direction.x * distance + dx,
          stream.origin.y + stream.direction.y * distance + dy,
          stream.origin.z + stream.direction.z * distance + dz,
          stream.direction.x * 5 + dx,
          stream.direction.y * 5 + 3.5,
          stream.direction.z * 5 + dz,
          0.7 + random() * 0.6,
          width * 1.25,
          width * 1.3,
        );
      }
    }
  }

  function fireParticles(fire: BurningVolume, dt: number, reducedMotion: boolean) {
    fire.elapsed += dt;
    const ramp = Math.min(1, fire.elapsed / 0.65);
    const magnitude = THREE.MathUtils.clamp(
      0.65 + Math.max(fire.size.x, fire.size.z) * 0.14 + fire.size.y * 0.045,
      0.7,
      5.2,
    );
    const rate =
      ((64 + magnitude * 20) * (0.35 + ramp * 0.65) * (reducedMotion ? 0.48 : 1)) / Math.max(1, fires.size / 8);
    fire.credit = Math.min(16, fire.credit + dt * rate);
    const count = Math.floor(fire.credit);
    fire.credit -= count;
    for (let index = 0; index < count; index++) {
      const face = Math.floor(random() * 4);
      const width = magnitude * (0.7 + random() * 0.55);
      const height = width * (1.55 + random() * 0.9);
      const x = face === 0 ? fire.min.x - 0.12 : face === 1 ? fire.max.x + 0.12 : fire.min.x + random() * fire.size.x;
      const z = face === 2 ? fire.min.z - 0.12 : face === 3 ? fire.max.z + 0.12 : fire.min.z + random() * fire.size.z;
      const y = fire.min.y + height * 0.42 + Math.pow(random(), 1.5) * fire.size.y * (0.35 + ramp * 0.55);
      const lift = (3.8 + magnitude * 1.1 + random() * 2) * (reducedMotion ? 0.55 : 1);
      birth(
        flames,
        x,
        y,
        z,
        (random() - 0.5) * 1.5,
        lift,
        (random() - 0.5) * 1.5,
        0.55 + random() * 0.9,
        width,
        height,
        random(),
      );
      if (index % 2 === 0) {
        birth(
          embers,
          x,
          y,
          z,
          (random() - 0.5) * 5,
          lift * 1.5,
          (random() - 0.5) * 5,
          0.65 + random() * 1.3,
          0.035 + random() * 0.08,
          0.18 + random() * 0.5,
        );
      }
      if (index % 3 === 0) {
        birth(
          smoke,
          x,
          y + height * 0.4,
          z,
          0.5 + random() * 0.65,
          lift * 0.75,
          (random() - 0.5) * 0.8,
          0.9 + random() * 1.1,
          width * 1.7,
          width * 1.75,
        );
      }
    }
  }

  function explosionParticles(explosion: Explosion, simultaneous: number, reducedMotion: boolean) {
    const { center, radius } = explosion;
    const travel = reducedMotion ? 0 : 1;
    const flameCount = Math.min(96, Math.floor(WORLD_FIRE_LIMITS.flames / simultaneous));
    const smokeCount = Math.min(20, Math.floor(WORLD_FIRE_LIMITS.smoke / simultaneous));
    const emberBudget = Math.floor(WORLD_FIRE_LIMITS.embers / simultaneous);
    const flashCount = emberBudget < 12 ? 1 : 3;
    const sparkCount = Math.min(72, emberBudget - flashCount);
    const fragmentCount = Math.min(48, Math.floor(WORLD_FIRE_LIMITS.debris / simultaneous));

    // A single golden flash opens the fireball; its soft layers fade once, without strobing.
    for (let index = 0; index < flashCount; index++) {
      const size = radius * (index === 0 ? 2.5 : index === 1 ? 1.7 : 1.05);
      birth(
        embers,
        center.x,
        center.y,
        center.z,
        0,
        0,
        0,
        reducedMotion ? 1.3 : 0.7 - index * 0.15,
        size,
        size,
        0.99,
        false,
        true,
      );
    }

    for (let index = 0; index < flameCount; index++) {
      const angle = ((index + random() * 0.55) / flameCount) * Math.PI * 2;
      const lift = random() * 0.9 - 0.15;
      const horizontal = Math.sqrt(1 - lift * lift);
      const dx = Math.cos(angle) * horizontal;
      const dz = Math.sin(angle) * horizontal;
      const distance = radius * (0.16 + random() * 0.4);
      const speed = (5 + radius * 1.55) * (0.6 + random() * 0.55) * travel;
      const width = radius * (0.32 + random() * 0.32);
      birth(
        flames,
        center.x + dx * distance,
        Math.max(0.2, center.y + lift * distance),
        center.z + dz * distance,
        dx * speed,
        lift * speed + 2.5 * travel,
        dz * speed,
        reducedMotion ? 1.35 : 0.65 + random() * 0.5,
        width,
        width * (1.25 + random() * 0.65),
        random() < 0.3 ? 0.96 : 0.35 + random() * 0.45,
        false,
        true,
      );
    }

    for (let index = 0; index < sparkCount; index++) {
      const angle = ((index + random() * 0.55) / sparkCount) * Math.PI * 2;
      const lift = random() * 0.9;
      const horizontal = Math.sqrt(1 - lift * lift);
      const speed = (9 + radius * 1.7) * (0.65 + random() * 0.55) * travel;
      const distance = radius * (0.25 + random() * 0.35);
      birth(
        embers,
        center.x + Math.cos(angle) * distance,
        center.y + lift * distance,
        center.z + Math.sin(angle) * distance,
        Math.cos(angle) * horizontal * speed,
        lift * speed + 2 * travel,
        Math.sin(angle) * horizontal * speed,
        reducedMotion ? 1.3 : 0.7 + random() * 1.05,
        0.045 + radius * 0.013,
        0.35 + radius * 0.1,
        0.2 + random() * 0.65,
        true,
        true,
      );
    }

    for (let index = 0; index < smokeCount; index++) {
      const angle = (index / smokeCount) * Math.PI * 2;
      const distance = radius * (0.25 + random() * 0.3);
      const speed = (2.5 + radius * 0.6) * travel;
      const width = radius * (0.55 + random() * 0.55);
      birth(
        smoke,
        center.x + Math.cos(angle) * distance,
        center.y + random() * radius * 0.35,
        center.z + Math.sin(angle) * distance,
        Math.cos(angle) * speed,
        (3 + random() * 2) * travel,
        Math.sin(angle) * speed,
        reducedMotion ? 1.7 : 1.4 + random() * 1.2,
        width,
        width,
        random(),
        false,
        true,
      );
    }

    for (let index = 0; index < fragmentCount; index++) {
      const angle = ((index + random() * 0.5) / fragmentCount) * Math.PI * 2;
      const distance = radius * (0.2 + random() * 0.55);
      const speed = (5 + radius * 1.2) * (0.6 + random() * 0.65) * travel;
      const size = THREE.MathUtils.clamp(radius * 0.12, 0.14, 1.7) * (0.65 + random() * 0.85);
      const fragment = birth(
        debris,
        center.x + Math.cos(angle) * distance,
        Math.max(0.3, center.y + (random() - 0.35) * Math.min(explosion.size.y, radius)),
        center.z + Math.sin(angle) * distance,
        Math.cos(angle) * speed,
        (3 + radius * 0.6 + random() * 5) * travel,
        Math.sin(angle) * speed,
        reducedMotion ? 1.7 : 1.7 + random() * 1.15,
        size,
        size * (0.4 + random() * 0.55),
        random(),
      );
      for (let axis = 0; axis < 3; axis++) {
        debrisAngles[fragment * 3 + axis] = random() * Math.PI * 2;
        debrisSpins[fragment * 3 + axis] = (random() - 0.5) * 12 * travel;
      }
    }
  }

  function updateDebris(dt: number, reducedMotion: boolean) {
    let updated = false;
    let visible = false;
    for (let index = 0; index < debris.capacity; index++) {
      if (debris.age[index] < 0) continue;
      updated = true;
      debris.age[index] += dt;
      if (debris.age[index] >= debris.life[index]) {
        debris.age[index] = -1;
        debris.mesh.setMatrixAt(index, empty);
        debris.opacity.setX(index, 0);
        continue;
      }
      visible = true;
      const progress = debris.age[index] / debris.life[index];
      if (!reducedMotion) {
        debris.x[index] += debris.vx[index] * dt;
        debris.y[index] += debris.vy[index] * dt;
        debris.z[index] += debris.vz[index] * dt;
        debris.vy[index] -= 11 * dt;
        const floor = 0.08 + debris.height[index] * 0.5;
        if (debris.y[index] < floor) {
          debris.y[index] = floor;
          debris.vy[index] = Math.abs(debris.vy[index]) > 0.8 ? Math.abs(debris.vy[index]) * 0.2 : 0;
          const friction = Math.exp(-dt * 8);
          debris.vx[index] *= friction;
          debris.vz[index] *= friction;
          for (let axis = 0; axis < 3; axis++) debrisSpins[index * 3 + axis] *= friction;
        }
        for (let axis = 0; axis < 3; axis++) {
          debrisAngles[index * 3 + axis] += debrisSpins[index * 3 + axis] * dt;
        }
      }
      position.set(debris.x[index], debris.y[index], debris.z[index]);
      fragmentRotation.set(debrisAngles[index * 3], debrisAngles[index * 3 + 1], debrisAngles[index * 3 + 2]);
      rotation.setFromEuler(fragmentRotation);
      scale.set(debris.width[index], debris.height[index], debris.width[index] * 0.7);
      matrix.compose(position, rotation, scale);
      debris.mesh.setMatrixAt(index, matrix);
      const heat = (1 - progress) * debris.warmth[index];
      color.setRGB(0.13 + heat * 0.82, 0.07 + heat * heat * 0.25, 0.035 + heat * 0.025);
      debris.mesh.setColorAt(index, color);
      // Solid fragments keep their shape and fade after tumbling, rather than shrinking away.
      debris.opacity.setX(index, Math.min(1, (1 - progress) * 4));
    }
    if (updated) {
      debris.mesh.instanceMatrix.needsUpdate = true;
      debris.mesh.instanceColor!.needsUpdate = true;
      debris.opacity.needsUpdate = true;
    }
    return visible;
  }

  function updateParticles(target: ParticlePool, dt: number, time: number, reducedMotion: boolean) {
    let updated = false;
    let visible = false;
    for (let index = 0; index < target.capacity; index++) {
      if (target.age[index] < 0) continue;
      updated = true;
      target.age[index] += dt;
      if (target.age[index] >= target.life[index]) {
        target.age[index] = -1;
        target.mesh.setMatrixAt(index, empty);
        target.opacity.setX(index, 0);
        continue;
      }
      visible = true;
      const progress = target.age[index] / target.life[index];
      const burst = target.burst[index] !== 0;
      if (!burst || !reducedMotion) {
        target.x[index] += target.vx[index] * dt;
        target.y[index] += target.vy[index] * dt;
        target.z[index] += target.vz[index] * dt;
        if (target.kind === 'ember') target.vy[index] -= dt * (reducedMotion ? 2 : 5.5);
        else target.vy[index] += dt * (target.kind === 'smoke' ? 0.7 : 1.4);
      }
      const fade = Math.min(1, (1 - progress) * (target.kind === 'smoke' ? 2 : 3));
      target.opacity.setX(
        index,
        burst ? fade : target.kind === 'ember' ? 1 : fade * Math.min(1, progress * (target.kind === 'smoke' ? 5 : 12)),
      );
      const grow =
        burst && reducedMotion
          ? 1
          : target.kind === 'smoke'
            ? 1 + progress * 1.55
            : target.kind === 'flame'
              ? 0.85 + progress * (burst ? 0.85 : 0.55)
              : burst
                ? 1 + progress * 0.4
                : 1;
      const sway = reducedMotion || target.kind !== 'flame' ? 0 : Math.sin(time * 5.5 + index * 1.7) * 0.085;
      position.set(target.x[index], target.y[index], target.z[index]);
      scale.set(target.width[index] * grow * (burst ? 1 : fade), target.height[index] * grow * (burst ? 1 : fade), 1);
      let angle = target.turn[index] + sway + (target.kind === 'smoke' && !reducedMotion ? progress * 0.35 : 0);
      if (target.directional[index] || target.kind === 'ember') {
        const horizontal =
          target.vx[index] * cameraRight.x + target.vy[index] * cameraRight.y + target.vz[index] * cameraRight.z;
        const vertical = target.vx[index] * cameraUp.x + target.vy[index] * cameraUp.y + target.vz[index] * cameraUp.z;
        angle = Math.atan2(-horizontal, vertical) + target.turn[index] * 0.1;
      }
      spin.setFromAxisAngle(zAxis, angle);
      rotation.copy(cameraRotation).multiply(spin);
      matrix.compose(position, rotation, scale);
      target.mesh.setMatrixAt(index, matrix);
      if (target.kind === 'smoke') {
        const value = 0.27 + progress * 0.13;
        color.setRGB(value, value * 0.88, value * 0.78);
      } else if (target.kind === 'ember') {
        if (burst && target.warmth[index] > 0.98) color.setRGB(2 * fade, 1.4 * fade, 0.5 * fade);
        else color.setRGB(1.6 * fade, (0.42 + target.warmth[index] * 0.47) * fade, 0.065 * fade);
      } else {
        const core = target.warmth[index];
        if (core > 0.9) color.setRGB(1, 0.87, 0.56);
        else color.setRGB(0.98, 0.12 + core * 0.42, 0.018 + core * core * 0.12);
      }
      target.mesh.setColorAt(index, color);
    }
    if (updated) {
      target.mesh.instanceMatrix.needsUpdate = true;
      target.mesh.instanceColor!.needsUpdate = true;
      target.opacity.needsUpdate = true;
    }
    return visible;
  }

  function validBounds(bounds: THREE.Box3) {
    return (
      !bounds.isEmpty() &&
      Number.isFinite(bounds.min.x) &&
      Number.isFinite(bounds.min.y) &&
      Number.isFinite(bounds.min.z) &&
      Number.isFinite(bounds.max.x) &&
      Number.isFinite(bounds.max.y) &&
      Number.isFinite(bounds.max.z) &&
      Math.max(
        Math.abs(bounds.min.x),
        Math.abs(bounds.min.y),
        Math.abs(bounds.min.z),
        Math.abs(bounds.max.x),
        Math.abs(bounds.max.y),
        Math.abs(bounds.max.z),
      ) <= 1_000_000 &&
      Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) <= 500
    );
  }

  return {
    /** Reissue each frame while firing. Inputs are copied, so moving mouth transforms cannot go stale. */
    emitStream(origin: THREE.Vector3, direction: THREE.Vector3, strength: number, kind: WorldFireStreamKind) {
      if (
        disposed ||
        !Number.isFinite(origin.x) ||
        !Number.isFinite(origin.y) ||
        !Number.isFinite(origin.z) ||
        !Number.isFinite(direction.x) ||
        !Number.isFinite(direction.y) ||
        !Number.isFinite(direction.z)
      )
        return;
      const length = direction.lengthSq();
      if (!Number.isFinite(length) || length < 1e-8 || !Number.isFinite(strength) || strength <= 0) return;
      const stream = streams[kind === 'dragon' ? 1 : 0];
      stream.origin.copy(origin);
      stream.direction.copy(direction).multiplyScalar(1 / Math.sqrt(length));
      stream.strength = Math.min(1, strength);
      stream.pending = true;
    },
    /** One emitter per target; repeat ignition preserves its intensity ramp and particle budget. */
    ignite(id: string, bounds: THREE.Box3) {
      if (
        disposed ||
        fires.has(id) ||
        smoldering.has(id) ||
        explosions.has(id) ||
        fires.size >= WORLD_FIRE_LIMITS.fires ||
        !validBounds(bounds)
      )
        return;
      const size = bounds.getSize(new THREE.Vector3());
      fires.set(id, { min: bounds.min.clone(), max: bounds.max.clone(), size, elapsed: 0, credit: 0 });
    },
    /** Corpses keep one bounded instanced flame draw without occupying active fire slots. */
    smolder(id: string, bounds: THREE.Box3) {
      if (disposed || smoldering.has(id) || smoldering.size >= WORLD_FIRE_LIMITS.smoldering || !validBounds(bounds))
        return;
      fires.delete(id);
      corpseFlames ??= createCorpseFlames();
      smoldering.set(id, {
        min: bounds.min.clone(),
        max: bounds.max.clone(),
        size: bounds.getSize(new THREE.Vector3()),
        elapsed: 0,
        credit: 0,
      });
    },
    /** Moving figures keep the same fire ramp and budget as their bounds follow them. */
    follow(id: string, bounds: THREE.Box3) {
      if (disposed || !validBounds(bounds)) return;
      const fire = fires.get(id);
      if (!fire) return;
      fire.min.copy(bounds.min);
      fire.max.copy(bounds.max);
      bounds.getSize(fire.size);
    },
    /** Finish a target once; emission is queued so this tick's reduced-motion preference applies. */
    explode(id: string, bounds: THREE.Box3) {
      if (disposed) return;
      fires.delete(id);
      if (explosions.has(id) || explosions.size >= WORLD_FIRE_LIMITS.explosions || !validBounds(bounds)) return;
      const size = bounds.getSize(new THREE.Vector3());
      explosions.set(id, {
        center: bounds.getCenter(new THREE.Vector3()),
        size,
        radius: THREE.MathUtils.clamp(Math.max(size.x, size.y, size.z) * 0.52, 0.9, 18),
        pending: true,
        elapsed: 0,
      });
    },
    tick(seconds: number, time: number, camera: THREE.Camera, reducedMotion = false) {
      if (disposed) return;
      const dt = Number.isFinite(seconds) ? THREE.MathUtils.clamp(seconds, 0, 0.05) : 0;
      const clock = Number.isFinite(time) ? time : 0;
      camera.getWorldQuaternion(cameraRotation);
      cameraRight.set(1, 0, 0).applyQuaternion(cameraRotation);
      cameraUp.set(0, 1, 0).applyQuaternion(cameraRotation);
      for (const stream of streams) {
        streamParticles(stream, dt, reducedMotion);
        stream.pending = false;
      }
      for (const fire of fires.values()) fireParticles(fire, dt, reducedMotion);
      let corpseSlot = 0;
      for (const fire of smoldering.values()) {
        for (let plume = 0; plume < 3; plume++) {
          const spread = (plume - 1) * 0.3;
          const flicker = reducedMotion ? 1 : 1 + Math.sin(clock * 5 + corpseSlot * 1.7) * 0.12;
          position.set(
            (fire.min.x + fire.max.x) / 2 + spread * Math.min(1.8, fire.size.x),
            fire.min.y + 0.6 * flicker,
            (fire.min.z + fire.max.z) / 2 + spread * Math.min(1.8, fire.size.z),
          );
          scale.set(0.85, 1.45 * flicker, 1);
          matrix.compose(position, cameraRotation, scale);
          corpseFlames?.setMatrixAt(corpseSlot++, matrix);
        }
      }
      if (corpseFlames) {
        corpseFlames.count = corpseSlot;
        if (corpseSlot) corpseFlames.instanceMatrix.needsUpdate = true;
      }
      let simultaneous = 0;
      for (const explosion of explosions.values()) if (explosion.pending) simultaneous++;
      for (const [id, explosion] of explosions) {
        if (explosion.pending) {
          explosionParticles(explosion, simultaneous, reducedMotion);
          explosion.pending = false;
        }
        explosion.elapsed += dt;
        if (explosion.elapsed >= 3.2) explosions.delete(id);
      }
      let visible = updateDebris(dt, reducedMotion);
      for (const particles of pools) {
        if (updateParticles(particles, dt, clock, reducedMotion)) visible = true;
      }
      root.visible = visible || corpseSlot > 0;
    },
    remove(id: string) {
      fires.delete(id);
      smoldering.delete(id);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      fires.clear();
      smoldering.clear();
      explosions.clear();
      streams.forEach((stream) => {
        stream.pending = false;
      });
      root.removeFromParent();
      disposeObject(root);
    },
  };
}

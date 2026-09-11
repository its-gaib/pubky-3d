import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeObject } from '@/libs/world/world-geometry';
import { WORLD_DIMENSIONS } from '@/libs/world/world-layout';

type PlanetSurface = 'bands' | 'ocean' | 'lava' | 'ice' | 'craters' | 'violet' | 'crystal';

interface PlanetDesign {
  name: string;
  surface: PlanetSurface;
  radius: number;
  distance: number;
  angle: number;
  elevation: number;
  tilt: number;
  spin: number;
  colors: readonly string[];
  ring?: number;
}

/** Distances scale with the island; body sizes retain a clear near/far perspective. */
const designs: readonly PlanetDesign[] = [
  {
    name: 'Tangerine giant',
    surface: 'bands',
    radius: 18,
    distance: 1.42,
    angle: 0.85,
    elevation: 48,
    tilt: 0.42,
    spin: 0.026,
    colors: ['#A86240', '#E4A76E', '#FFE1AC', '#C77C51'],
    ring: 2.15,
  },
  {
    name: 'Cobalt garden',
    surface: 'ocean',
    radius: 12,
    distance: 1.24,
    angle: -0.38,
    elevation: 26,
    tilt: -0.3,
    spin: -0.039,
    colors: ['#163F83', '#278EBA', '#78C7B1', '#E0EFDD'],
  },
  {
    name: 'Ember',
    surface: 'lava',
    radius: 15,
    distance: 1.82,
    angle: 2.55,
    elevation: 45,
    tilt: 0.2,
    spin: 0.032,
    colors: ['#492F42', '#8C3E48', '#E16B45', '#FFC478'],
  },
  {
    name: 'Mint ice',
    surface: 'ice',
    radius: 13,
    distance: 2.1,
    angle: -2.45,
    elevation: 110,
    tilt: -0.6,
    spin: 0.019,
    colors: ['#417F96', '#87CDC8', '#D8FFF0'],
  },
  {
    name: 'Pearl moon',
    surface: 'craters',
    radius: 8,
    distance: 1.42,
    angle: -1.32,
    elevation: 24,
    tilt: 0.4,
    spin: -0.044,
    colors: ['#777785', '#B7B5BF', '#E7DDD0'],
  },
  {
    name: 'Amethyst',
    surface: 'violet',
    radius: 11,
    distance: 2.4,
    angle: 0.04,
    elevation: 140,
    tilt: 0.75,
    spin: -0.021,
    colors: ['#665792', '#BA8DDD', '#EEBBE7'],
    ring: 1.9,
  },
  {
    name: 'Citrine crystal',
    surface: 'crystal',
    radius: 10,
    distance: 2.2,
    angle: 1.72,
    elevation: 32,
    tilt: -0.8,
    spin: 0.037,
    colors: ['#878B43', '#D2D76D', '#F1EDB2'],
    ring: 1.65,
  },
];

export const WORLD_PLANETS = designs.map((design) => {
  // The sphere contains the tilted rings, faceted poles and atmospheric shell.
  const extent = design.radius * Math.max(1.24, design.ring ?? 0);
  const radial = Math.max(WORLD_DIMENSIONS.coastRadius * design.distance, WORLD_DIMENSIONS.coastRadius + extent + 16);
  const elevation = Math.max(extent + 6, (design.elevation * WORLD_DIMENSIONS.coastRadius) / 150);
  return {
    ...design,
    extent,
    position: [Math.sin(design.angle) * radial, elevation, Math.cos(design.angle) * radial] as [number, number, number],
  };
});

/** Add this margin to camera distance so every orbit/portrait view retains distant planets. */
export const WORLD_PLANET_ENVELOPE = Math.ceil(
  Math.max(...WORLD_PLANETS.map((planet) => Math.hypot(...planet.position) + planet.extent)),
);

const craterCenters = [
  [0.4, 0.2, 0.9],
  [-0.5, 0.65, 0.55],
  [0.1, -0.7, 0.7],
  [0.6, 0.55, -0.6],
  [-0.7, -0.35, -0.6],
  [0, 0.95, -0.3],
].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

const smallCraters = Array.from({ length: 24 }, (_, index) => {
  const y = 1 - ((index + 0.5) / 24) * 2;
  const radius = Math.sqrt(1 - y * y);
  const angle = index * 2.399963;
  return {
    center: new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius),
    radius: 0.045 + (index % 5) * 0.019,
    depth: 0.1 + (index % 3) * 0.035,
  };
});
const craterDetails = [...craterCenters.map((center) => ({ center, radius: 0.24, depth: 0.26 })), ...smallCraters];
const SURFACE_WIDTH = 512;
const SURFACE_HEIGHT = 256;

type Planet = (typeof WORLD_PLANETS)[number];

function smooth(edge0: number, edge1: number, value: number) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lattice(x: number, y: number, z: number) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0x80000000 - 1;
}

/** Sampling in sphere coordinates keeps the painted longitude seam and poles continuous. */
function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const tx = x - ix;
  const ty = y - iy;
  const tz = z - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const sz = tz * tz * (3 - 2 * tz);
  const a = THREE.MathUtils.lerp(lattice(ix, iy, iz), lattice(ix + 1, iy, iz), sx);
  const b = THREE.MathUtils.lerp(lattice(ix, iy + 1, iz), lattice(ix + 1, iy + 1, iz), sx);
  const c = THREE.MathUtils.lerp(lattice(ix, iy, iz + 1), lattice(ix + 1, iy, iz + 1), sx);
  const d = THREE.MathUtils.lerp(lattice(ix, iy + 1, iz + 1), lattice(ix + 1, iy + 1, iz + 1), sx);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, sy), THREE.MathUtils.lerp(c, d, sy), sz);
}

function paintColor(colors: THREE.Color[], value: number, output: THREE.Color) {
  const position = THREE.MathUtils.clamp(value, 0, 1) * (colors.length - 1);
  const index = Math.floor(position);
  return output.copy(colors[index]).lerp(colors[Math.min(index + 1, colors.length - 1)], position - index);
}

function texture(data: Uint8Array, width: number, height: number, name: string, color = false) {
  const result = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  result.name = name;
  result.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  result.wrapS = height === 1 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  result.wrapT = THREE.ClampToEdgeWrapping;
  result.minFilter = THREE.LinearMipmapLinearFilter;
  result.magFilter = THREE.LinearFilter;
  result.generateMipmaps = true;
  result.anisotropy = 4;
  result.needsUpdate = true;
  return result;
}

/** Finite, locally painted albedo and packed height/roughness maps; never repainted while walking. */
function createSurface(planet: Planet) {
  const width = planet.surface === 'ocean' || planet.surface === 'craters' ? 1024 : SURFACE_WIDTH;
  const heightPixels = width === 1024 ? 512 : SURFACE_HEIGHT;
  const albedo = new Uint8Array(width * heightPixels * 4);
  const relief = new Uint8Array(albedo.length);
  const glow = planet.surface === 'lava' ? new Uint8Array(albedo.length) : null;
  const clouds = planet.surface === 'ocean' ? new Uint8Array(albedo.length) : null;
  const colors = (
    planet.surface === 'ocean'
      ? ['#102653', '#1c507c', '#2f879c', '#699d83', '#b7c49a', '#edf1dc']
      : planet.surface === 'craters'
        ? ['#373D49', '#787C86', '#BFC0BB', '#E0D9CB']
        : planet.colors
  ).map((color) => new THREE.Color(color));
  const color = new THREE.Color();
  const hot = new THREE.Color('#ffae59');
  const white = new THREE.Color('#edf5ed');
  const longitude = Array.from({ length: width }, (_, column) => {
    const angle = (column / (width - 1)) * Math.PI * 2;
    return [-Math.cos(angle), Math.sin(angle)];
  });
  for (let row = 0; row < heightPixels; row++) {
    const latitude = (1 - row / (heightPixels - 1)) * Math.PI;
    const ring = Math.sin(latitude);
    const y = Math.cos(latitude);
    for (let column = 0; column < width; column++) {
      const x = longitude[column][0] * ring;
      const z = longitude[column][1] * ring;
      const broad = noise(x * 3.2 + 8, y * 3.2 + 3, z * 3.2 + 5);
      const detail = noise(x * 18 + 2, y * 18 + 9, z * 18 + 1);
      const grain = noise(x * 74, y * 74, z * 74);
      let shade = 0.5;
      let height = 0.5;
      let roughness = 0.8;
      let heat = 0;
      let cloud = 0;
      if (planet.surface === 'bands' || planet.surface === 'violet') {
        const flow = y * 37 + broad * 3.2 + detail * 0.33;
        const bands = Math.sin(flow) * 0.2 + Math.sin(flow * 2.7 + broad * 2) * 0.085;
        shade = 0.55 + bands + broad * 0.11 + grain * 0.022;
        const stormX = x - (planet.surface === 'bands' ? -0.72 : -0.55);
        const stormY = (y + 0.21) * 2;
        const stormZ = z - (planet.surface === 'bands' ? -0.66 : 0.8);
        const stormRadius = Math.hypot(stormX, stormY, stormZ);
        const storm = 1 - smooth(0.12, 0.3, stormRadius);
        const curl = Math.sin(stormRadius * 69 + Math.atan2(stormY, stormX) * 2 + detail * 0.8);
        shade = THREE.MathUtils.lerp(shade, 0.3 + curl * 0.12, storm * 0.9);
        height = 0.5 + detail * 0.035;
        roughness = 0.78;
      } else if (planet.surface === 'ocean') {
        const continents = broad + noise(x * 7.1 + 2, y * 7.1, z * 7.1 + 1) * 0.48 + detail * 0.13 + grain * 0.025;
        const land = smooth(-0.025, 0.0025, continents);
        const elevation = Math.max(0, continents);
        shade = THREE.MathUtils.lerp(
          0.15 + broad * 0.08 + detail * 0.012,
          0.56 + elevation * 0.36 + detail * 0.055 + grain * 0.024,
          land,
        );
        const ice = smooth(0.82 + detail * 0.03, 0.96, Math.abs(y));
        shade = THREE.MathUtils.lerp(shade, 0.96, ice);
        height = 0.45 + land * (0.09 + elevation * 0.2) + grain * land * 0.025;
        roughness = THREE.MathUtils.lerp(0.35, 0.88, Math.max(land, ice));
        const weather = noise(x * 8 + broad * 2, y * 8, z * 8 + broad) + detail * 0.42 + grain * 0.13;
        cloud = smooth(0.3, 0.6, weather) * 0.8;
      } else if (planet.surface === 'lava') {
        const fault = Math.abs(noise(x * 7 + broad * 1.3, y * 7, z * 7 + 3));
        heat = (1 - smooth(0.018, 0.075, fault)) * smooth(-0.6, 0.1, broad);
        shade = 0.11 + (broad + 1) * 0.14 + detail * 0.04 + grain * 0.015;
        height = 0.53 + detail * 0.11 + grain * 0.025 - heat * 0.16;
        roughness = 0.92 - heat * 0.5;
      } else if (planet.surface === 'craters') {
        height = 0.55 + broad * 0.08 + detail * 0.025 + grain * 0.016;
        for (const crater of craterDetails) {
          const dx = x - crater.center.x;
          const dy = y - crater.center.y;
          const dz = z - crater.center.z;
          const distanceSquared = dx * dx + dy * dy + dz * dz;
          if (distanceSquared > crater.radius * crater.radius * 1.6) continue;
          const distance = Math.sqrt(distanceSquared) / crater.radius;
          if (distance < 1) height -= crater.depth * (1 - distance * distance) ** 2;
          height += crater.depth * 0.32 * Math.exp(-(((distance - 0.98) / 0.085) ** 2));
        }
        const maria = smooth(-0.14, 0.32, broad + detail * 0.12);
        shade = 0.34 + maria * 0.27 + detail * 0.065 + grain * 0.05 + (height - 0.55) * 1.35;
        roughness = 0.95;
      } else if (planet.surface === 'ice') {
        const fissure = 1 - smooth(0.025, 0.085, Math.abs(noise(x * 9 + broad, y * 9, z * 9)));
        shade = 0.69 + broad * 0.16 + detail * 0.07 + grain * 0.018 - fissure * 0.2;
        height = 0.55 + detail * 0.06 - fissure * 0.1;
        roughness = 0.61 + fissure * 0.25;
      } else {
        const vein = 1 - smooth(0.016, 0.055, Math.abs(noise(x * 6, y * 6 + broad, z * 6)));
        shade = 0.58 + broad * 0.18 + y * 0.13 + detail * 0.035 + vein * 0.2;
        height = 0.5 + vein * 0.045 + grain * 0.01;
        roughness = 0.38 + detail * 0.1;
      }
      const offset = (row * width + column) * 4;
      paintColor(colors, shade, color);
      if (heat) color.lerp(hot, heat * 0.82);
      color.convertLinearToSRGB();
      albedo[offset] = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
      albedo[offset + 1] = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
      albedo[offset + 2] = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
      albedo[offset + 3] = 255;
      relief[offset] = relief[offset + 2] = Math.round(THREE.MathUtils.clamp(height, 0, 1) * 255);
      relief[offset + 1] = Math.round(roughness * 255);
      relief[offset + 3] = 255;
      if (glow) {
        glow[offset] = Math.round(heat * 255);
        glow[offset + 1] = Math.round(heat * 109);
        glow[offset + 2] = Math.round(heat * 28);
        glow[offset + 3] = 255;
      }
      if (clouds) {
        clouds[offset] = Math.round(white.r * 255);
        clouds[offset + 1] = Math.round(white.g * 255);
        clouds[offset + 2] = Math.round(white.b * 255);
        clouds[offset + 3] = Math.round(cloud * 255);
      }
    }
  }
  return {
    albedo: texture(albedo, width, heightPixels, `${planet.name} painted surface`, true),
    relief: texture(relief, width, heightPixels, `${planet.name} height and roughness`),
    glow: glow ? texture(glow, width, heightPixels, 'Ember fissure emission', true) : null,
    clouds: clouds ? texture(clouds, width, heightPixels, 'Cobalt weather layer', true) : null,
  };
}

function createBodyGeometry(planet: Planet) {
  const geometry =
    planet.surface === 'crystal'
      ? new THREE.DodecahedronGeometry(1, 0)
      : planet.surface === 'lava' || planet.surface === 'ice'
        ? new THREE.IcosahedronGeometry(1, planet.surface === 'lava' ? 3 : 2)
        : new THREE.SphereGeometry(1, 64, 40);
  const vertices = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  for (let index = 0; index < vertices.count; index++) {
    point.fromBufferAttribute(vertices, index).normalize();
    const { x, y, z } = point;
    let radius = 1;
    let pole = 1;
    if (planet.surface === 'bands' || planet.surface === 'violet') {
      pole = planet.surface === 'bands' ? 0.92 : 0.85;
    } else if (planet.surface === 'lava') {
      radius += Math.sin(x * 10 + y * 7) * Math.cos(z * 8) * 0.035;
    } else if (planet.surface === 'craters') {
      for (const crater of craterCenters) {
        const distance = point.distanceTo(crater);
        radius -= 0.045 * Math.exp(-((distance / 0.19) ** 2));
        radius += 0.009 * Math.exp(-(((distance - 0.25) / 0.045) ** 2));
      }
    } else if (planet.surface === 'crystal' || planet.surface === 'ice') {
      pole = planet.surface === 'crystal' ? 1.18 : 1.12;
    }
    vertices.setXYZ(index, x * radius * planet.radius, y * radius * pole * planet.radius, z * radius * planet.radius);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createRings(planet: Planet) {
  const inner = 1.28;
  const width = planet.ring! - inner;
  const parts = [
    [0, 0.42],
    [0.48, 0.78],
    [0.84, 1],
  ].map(
    ([start, end]) =>
      new THREE.RingGeometry(planet.radius * (inner + width * start), planet.radius * (inner + width * end), 128, 2),
  );
  const geometry = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  const vertices = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < vertices.count; index++) {
    const radius = Math.hypot(vertices.getX(index), vertices.getY(index)) / planet.radius;
    uv.setXY(index, (radius - inner) / width, 0.5);
  }
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingSphere();
  const pixels = new Uint8Array(1024 * 4);
  const colors = planet.colors.map((value) => new THREE.Color(value));
  const color = new THREE.Color();
  for (let index = 0; index < 1024; index++) {
    const distance = index / 1023;
    const band = Math.sin(distance * 83) * 0.13 + Math.sin(distance * 317) * 0.05 + lattice(index, 3, 1) * 0.03;
    paintColor(colors, 0.72 + band, color).convertLinearToSRGB();
    pixels[index * 4] = Math.round(color.r * 255);
    pixels[index * 4 + 1] = Math.round(color.g * 255);
    pixels[index * 4 + 2] = Math.round(color.b * 255);
    pixels[index * 4 + 3] = Math.round(
      (0.62 + Math.sin(distance * 131) * 0.1) * smooth(0, 0.035, distance) * (1 - smooth(0.94, 1, distance)) * 255,
    );
  }
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: texture(pixels, 1024, 1, `${planet.name} radial ring bands`, true),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      forceSinglePass: true,
      fog: false,
      toneMapped: false,
    }),
  );
}

/** Seven fixed world-space bodies. Bounded local textures, no shadows or per-frame surface allocations. */
export function createWorldPlanets(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'Seven distant planets';
  scene.add(group);
  const atmosphereGeometry = new THREE.SphereGeometry(1, 40, 28);
  const atmosphereMaterial = new THREE.MeshBasicMaterial({
    color: '#9FDDE8',
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const weather: { mesh: THREE.Mesh; spin: number }[] = [];
  const bodies = WORLD_PLANETS.map((planet, index) => {
    const system = new THREE.Group();
    system.name = planet.name;
    system.position.set(...planet.position);
    system.rotation.set(0.14, index * 0.7, planet.tilt);
    group.add(system);
    const surface = createSurface(planet);
    const material = new THREE.MeshStandardMaterial({
      map: surface.albedo,
      bumpMap: surface.relief,
      bumpScale: planet.radius * (planet.surface === 'craters' ? 0.16 : planet.surface === 'lava' ? 0.08 : 0.018),
      roughnessMap: surface.relief,
      roughness: 1,
      metalness: planet.surface === 'crystal' ? 0.28 : 0.035,
      emissive: surface.glow ? '#FFFFFF' : planet.colors[0],
      emissiveMap: surface.glow,
      emissiveIntensity: surface.glow ? 0.9 : 0.04,
      flatShading: ['lava', 'ice', 'crystal'].includes(planet.surface),
      fog: false,
      toneMapped: true,
    });
    const body = new THREE.Mesh(createBodyGeometry(planet), material);
    body.name = `${planet.name} body`;
    body.rotation.y = index * 0.8;
    system.add(body);
    if (planet.ring) {
      const rings = createRings(planet);
      rings.name = `${planet.name} rings`;
      system.add(rings);
    }
    if (planet.surface === 'ocean' || planet.surface === 'violet') {
      const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
      atmosphere.name = `${planet.name} atmosphere`;
      atmosphere.scale.set(
        planet.radius * 1.035,
        planet.radius * (planet.surface === 'violet' ? 0.89 : 1.035),
        planet.radius * 1.035,
      );
      system.add(atmosphere);
    }
    if (surface.clouds) {
      const clouds = new THREE.Mesh(
        atmosphereGeometry,
        new THREE.MeshStandardMaterial({
          map: surface.clouds,
          color: '#f1f7f5',
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          roughness: 1,
          emissive: '#a1bdc5',
          emissiveIntensity: 0.1,
          fog: false,
          toneMapped: false,
        }),
      );
      clouds.name = `${planet.name} cloud layer`;
      clouds.rotation.y = body.rotation.y;
      clouds.scale.setScalar(planet.radius * 1.012);
      system.add(clouds);
      weather.push({ mesh: clouds, spin: planet.spin * 0.8 });
    }
    return body;
  });
  let disposed = false;
  return {
    group,
    animate(_time: number, delta: number, reducedMotion = false) {
      if (disposed || reducedMotion || !Number.isFinite(delta) || delta <= 0) return;
      const step = Math.min(delta, 0.05);
      bodies.forEach((body, index) => {
        body.rotation.y += step * WORLD_PLANETS[index].spin;
      });
      weather.forEach((layer) => {
        layer.mesh.rotation.y += step * layer.spin;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeObject(group);
    },
  };
}

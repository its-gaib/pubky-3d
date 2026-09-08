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

function paintColor(colors: THREE.Color[], value: number, output: THREE.Color) {
  const position = THREE.MathUtils.clamp(value, 0, 1) * (colors.length - 1);
  const index = Math.floor(position);
  return output.copy(colors[index]).lerp(colors[Math.min(index + 1, colors.length - 1)], position - index);
}

function createBodyGeometry(planet: (typeof WORLD_PLANETS)[number]) {
  const faceted = ['lava', 'ice', 'crystal'].includes(planet.surface);
  const geometry =
    planet.surface === 'crystal'
      ? new THREE.DodecahedronGeometry(1, 0)
      : faceted
        ? new THREE.IcosahedronGeometry(1, planet.surface === 'lava' ? 3 : 1)
        : new THREE.SphereGeometry(1, 40, 28);
  const vertices = geometry.getAttribute('position');
  const colors = new Float32Array(vertices.count * 3);
  const palette = planet.colors.map((color) => new THREE.Color(color));
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  for (let index = 0; index < vertices.count; index++) {
    point.fromBufferAttribute(vertices, index).normalize();
    const { x, y, z } = point;
    let radius = 1;
    let pole = 1;
    let shade = 0.5;
    if (planet.surface === 'bands' || planet.surface === 'violet') {
      shade = 0.5 + Math.sin(y * 22 + Math.sin(x * 4 + z * 2)) * 0.3 + Math.sin(y * 49) * 0.15;
      pole = planet.surface === 'bands' ? 0.92 : 0.85;
    } else if (planet.surface === 'ocean') {
      const land = Math.sin(x * 8 + Math.sin(z * 5)) * Math.cos(y * 7) + Math.cos(z * 9 + x * 3) * 0.5;
      shade = land > 0.35 ? 0.62 + land * 0.13 : 0.15 + (land + 1.5) * 0.1;
      if (Math.abs(y) > 0.86) shade = 0.95;
    } else if (planet.surface === 'lava') {
      shade = Math.pow(1 - Math.abs(Math.sin(x * 6 + z * 3 + Math.sin(y * 7))), 4);
      radius += Math.sin(x * 10 + y * 7) * Math.cos(z * 8) * 0.065;
    } else if (planet.surface === 'craters') {
      let dent = 0;
      for (const crater of craterCenters) {
        const distance = point.distanceTo(crater);
        dent += 0.14 * Math.exp(-((distance / 0.19) ** 2));
        radius += 0.024 * Math.exp(-(((distance - 0.25) / 0.045) ** 2));
      }
      radius -= dent;
      shade = 0.64 + Math.sin(x * 17 + y * 11) * Math.cos(z * 13) * 0.09 - dent * 2.5;
    } else {
      pole = planet.surface === 'crystal' ? 1.18 : 1.12;
      shade = 0.45 + y * 0.25 + Math.sin(x * 8 + z * 5) * 0.22;
    }
    vertices.setXYZ(index, x * radius * planet.radius, y * radius * pole * planet.radius, z * radius * planet.radius);
    paintColor(palette, shade, color).toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createRingGeometry(radius: number, outer: number, palette: readonly string[]) {
  const inner = 1.28;
  const width = outer - inner;
  const parts = [
    [0, 0.42],
    [0.48, 0.78],
    [0.84, 1],
  ].map(
    ([start, end]) => new THREE.RingGeometry(radius * (inner + width * start), radius * (inner + width * end), 80, 2),
  );
  const geometry = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  const vertices = geometry.getAttribute('position');
  const colors = new Float32Array(vertices.count * 3);
  const color = new THREE.Color();
  const choices = palette.map((value) => new THREE.Color(value));
  for (let index = 0; index < vertices.count; index++) {
    const distance = Math.hypot(vertices.getX(index), vertices.getY(index)) / radius;
    paintColor(choices, 0.6 + Math.sin(distance * 65) * 0.3, color).toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.rotateX(Math.PI / 2);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Seven fixed world-space bodies. No camera-relative spawning, assets, shadows or per-frame allocations. */
export function createWorldPlanets(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'Seven distant planets';
  scene.add(group);
  const atmosphereGeometry = new THREE.SphereGeometry(1, 24, 16);
  const atmosphereMaterial = new THREE.MeshBasicMaterial({
    color: '#9FDDE8',
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const bodies = WORLD_PLANETS.map((planet, index) => {
    const system = new THREE.Group();
    system.name = planet.name;
    system.position.set(...planet.position);
    system.rotation.set(0.14, index * 0.7, planet.tilt);
    group.add(system);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.87,
      metalness: 0.04,
      emissive: planet.colors[0],
      emissiveIntensity: 0.2,
      flatShading: ['lava', 'ice', 'crystal'].includes(planet.surface),
      fog: false,
      toneMapped: false,
    });
    const body = new THREE.Mesh(createBodyGeometry(planet), material);
    body.name = `${planet.name} body`;
    body.rotation.y = index * 0.8;
    system.add(body);
    if (planet.ring) {
      const ring = new THREE.Mesh(
        createRingGeometry(planet.radius, planet.ring, planet.colors),
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          forceSinglePass: true,
          fog: false,
          toneMapped: false,
        }),
      );
      ring.name = `${planet.name} rings`;
      system.add(ring);
    }
    if (planet.surface === 'ocean' || planet.surface === 'violet') {
      const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
      atmosphere.name = `${planet.name} atmosphere`;
      atmosphere.scale.setScalar(planet.radius * 1.045);
      system.add(atmosphere);
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
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeObject(group);
    },
  };
}

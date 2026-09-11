import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Surface = 'stone' | 'metal' | 'wood' | 'foliage' | 'glow';
type Point = readonly [number, number, number];

const SURFACES: Record<Surface, THREE.MeshStandardMaterialParameters> = {
  stone: { roughness: 0.92, metalness: 0.04 },
  metal: { roughness: 0.4, metalness: 0.65 },
  wood: { roughness: 0.94, metalness: 0 },
  foliage: { roughness: 0.96, metalness: 0 },
  glow: { roughness: 0.5, metalness: 0.12, emissive: '#FFFFFF', emissiveIntensity: 0.35 },
};

/** Static construction detail, batched by surface; add() takes ownership of its geometry. */
export function worldDetail(parent: THREE.Object3D, name: string) {
  const group = new THREE.Group();
  group.name = name;
  parent.add(group);
  const batches = new Map<Surface, THREE.BufferGeometry[]>();
  const tint = new THREE.Color();

  return {
    group,
    add(
      geometry: THREE.BufferGeometry,
      color: string,
      surface: Surface = 'stone',
      position: Point = [0, 0, 0],
      rotation: Point = [0, 0, 0],
    ) {
      geometry
        .rotateX(rotation[0])
        .rotateY(rotation[1])
        .rotateZ(rotation[2])
        .translate(...position);
      geometry.deleteAttribute('uv');
      tint.set(color);
      if (!geometry.hasAttribute('color')) {
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let index = 0; index < colors.length; index += 3) tint.toArray(colors, index);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      const triangles = geometry.index ? geometry.toNonIndexed() : geometry;
      if (triangles !== geometry) geometry.dispose();
      const values = batches.get(surface);
      if (values) values.push(triangles);
      else batches.set(surface, [triangles]);
    },
    finish() {
      for (const [surface, parts] of batches) {
        const geometry = mergeGeometries(parts)!;
        const material = new THREE.MeshStandardMaterial({ ...SURFACES[surface], vertexColors: true });
        const object = new THREE.Mesh(geometry, material);
        object.name = `${name} · ${surface}`;
        object.castShadow = surface !== 'glow';
        object.receiveShadow = surface !== 'glow';
        group.add(object);
        parts.forEach((part) => part.dispose());
      }
      batches.clear();
      return group;
    },
  };
}

/** Bounded, local surface grain. No image downloads or per-frame texture updates. */
export function worldGrainTexture(kind: 'soil' | 'stone' | 'paving' | 'water' = 'stone') {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 24691;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = Math.imul(seed, 1664525) + 1013904223;
      const noise = (seed >>> 24) / 255;
      const seam = kind === 'paving' && (y % 32 < 1 || (x + (Math.floor(y / 32) % 2) * 32) % 64 < 1);
      const wave =
        Math.sin((x / size) * Math.PI * 8 + Math.sin((y / size) * Math.PI * 4) * 0.9) +
        Math.sin(((x * 3 + y * 7) / size) * Math.PI * 2) * 0.35;
      const grain =
        kind === 'water' ? 128 + wave * 40 + noise * 8 : seam ? 154 : 211 + noise * (kind === 'soil' ? 38 : 29);
      const index = (y * size + x) * 4;
      pixels[index] = grain;
      pixels[index + 1] = grain;
      pixels[index + 2] = grain;
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = `Local ${kind} grain`;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Horizontal paving reads in world units instead of stretching with a district's radius. */
export function worldPlanarUv(geometry: THREE.BufferGeometry, repeatEvery = 8) {
  const positions = geometry.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  for (let index = 0; index < positions.count; index++) {
    uv[index * 2] = positions.getX(index) / repeatEvery;
    uv[index * 2 + 1] = positions.getZ(index) / repeatEvery;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

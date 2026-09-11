import * as THREE from 'three';
import { WORLD_DIMENSIONS } from '@/libs/world/world-layout';

/** The same field shapes the painted ground and its planted tufts. */
export function worldMeadowDensity(x: number, z: number) {
  const broad = Math.sin(x * 0.049 + Math.sin(z * 0.031) * 2.6) * Math.cos(z * 0.052 - x * 0.014);
  const detail = Math.sin(x * 0.14 + z * 0.09) * Math.cos(z * 0.13 - x * 0.04) * 0.24;
  const plaza = THREE.MathUtils.smoothstep(Math.hypot(x, z - 8), 27, 44);
  const shore =
    1 - THREE.MathUtils.smoothstep(Math.hypot(x, z), WORLD_DIMENSIONS.landRadius - 15, WORLD_DIMENSIONS.landRadius + 1);
  return THREE.MathUtils.smoothstep(broad + detail, -0.23, 0.45) * plaza * shore;
}

/** A bounded local color map adds meadow islands without transparent ground layers. */
export function worldTerrainTexture() {
  const size = 1024;
  const diameter = WORLD_DIMENSIONS.landRadius * 2;
  const pixels = new Uint8Array(size * size * 4);
  const soil = new THREE.Color('#33393A');
  const grass = new THREE.Color('#53614F');
  const dry = new THREE.Color('#656448');
  const rock = new THREE.Color('#555550');
  const tint = new THREE.Color();
  let seed = 7117;
  for (let row = 0; row < size; row++) {
    const z = (row / (size - 1) - 0.5) * diameter;
    for (let column = 0; column < size; column++) {
      const x = (column / (size - 1) - 0.5) * diameter;
      seed = Math.imul(seed, 1664525) + 1013904223;
      const grain = (seed >>> 24) / 255;
      const density = worldMeadowDensity(x, z);
      const dryPatch = THREE.MathUtils.smoothstep(Math.sin(x * 0.1 - z * 0.06), 0.35, 0.92);
      tint
        .copy(grass)
        .lerp(dry, dryPatch * 0.5)
        .lerp(soil, 1 - density * 0.8);
      tint.lerp(
        rock,
        THREE.MathUtils.smoothstep(Math.hypot(x, z), WORLD_DIMENSIONS.landRadius - 12, WORLD_DIMENSIONS.landRadius) *
          0.6,
      );
      tint.multiplyScalar(0.9 + grain * 0.2).convertLinearToSRGB();
      const index = (row * size + column) * 4;
      pixels[index] = Math.round(tint.r * 255);
      pixels[index + 1] = Math.round(tint.g * 255);
      pixels[index + 2] = Math.round(tint.b * 255);
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'Locally painted coastal meadows';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

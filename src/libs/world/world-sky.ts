import * as THREE from 'three';

/** A quiet, stationary star field leaves the island and its planets in the foreground. */
export function createWorldStars(scene: THREE.Scene) {
  const count = 420;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tint = new THREE.Color();
  for (let index = 0; index < count; index++) {
    const azimuth = index * 2.399963;
    const height = -0.34 + ((Math.sin(index * 73.17) + 1) / 2) * 1.3;
    const horizontal = Math.sqrt(1 - height * height);
    const radius = 610 + (index % 7) * 14;
    positions.set(
      [Math.cos(azimuth) * horizontal * radius, height * radius, Math.sin(azimuth) * horizontal * radius],
      index * 3,
    );
    tint.set(index % 7 === 0 ? '#BCCCF4' : index % 5 === 0 ? '#EBDDBD' : '#DCE5E7');
    tint.multiplyScalar(0.4 + (index % 5) * 0.12).toArray(colors, index * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const index = (y * size + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
      pixels[index + 3] = Math.round(Math.max(0, 1 - distance) ** 2 * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.name = 'Local soft star';
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const material = new THREE.PointsMaterial({
    map: texture,
    size: 1.75,
    vertexColors: true,
    transparent: true,
    opacity: 0.44,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'Distant stationary stars';
  scene.add(stars);
  return {
    setNight(value: boolean) {
      material.opacity = value ? 0.85 : 0.44;
    },
  };
}

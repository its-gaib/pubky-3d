import * as THREE from 'three';

export type Point3 = [number, number, number];

/** Pubky's canonical neutral surfaces and acid-lime brand accent. */
export const WORLD_PALETTE = {
  background: '#05050A',
  surface: '#1D1D20',
  border: '#303034',
  neutral: '#454549',
  text: '#EEEEF6',
  lime: '#C8FF03',
} as const;

export function material(color: string, emissive = false) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.12,
    flatShading: true,
    ...(emissive ? { emissive: color, emissiveIntensity: 0.72 } : {}),
  });
}

export function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  color: string | THREE.Material,
  position: Point3 = [0, 0, 0],
) {
  const object = new THREE.Mesh(geometry, typeof color === 'string' ? material(color) : color);
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

export function box(parent: THREE.Object3D, size: Point3, color: string, position: Point3 = [0, 0, 0]) {
  return mesh(parent, new THREE.BoxGeometry(...size), color, position);
}

export function cylinder(
  parent: THREE.Object3D,
  top: number,
  bottom: number,
  height: number,
  color: string,
  position: Point3 = [0, 0, 0],
  segments = 24,
) {
  return mesh(parent, new THREE.CylinderGeometry(top, bottom, height, segments), color, position);
}

export function sphere(parent: THREE.Object3D, radius: number, color: string, position: Point3 = [0, 0, 0]) {
  return mesh(parent, new THREE.IcosahedronGeometry(radius, 1), color, position);
}

/** Locally generated text textures: network text is never interpreted as HTML or SVG. */
export function label(
  parent: THREE.Object3D,
  text: string,
  position: Point3,
  width = 8,
  foreground: string = WORLD_PALETTE.text,
  background: string = WORLD_PALETTE.surface,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 208;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = background;
    context.beginPath();
    context.roundRect(6, 6, 1012, 196, 32);
    context.fill();
    context.strokeStyle = WORLD_PALETTE.neutral;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = foreground;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '600 64px sans-serif';
    context.fillText(text.slice(0, 32), 512, 108, 928);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, fog: false, toneMapped: false }),
  );
  sprite.position.set(...position);
  sprite.scale.set(width, width / 5, 1);
  sprite.renderOrder = 5;
  parent.add(sprite);
  return sprite;
}

export function ring(parent: THREE.Object3D, radius: number, tube: number, color: string, position: Point3) {
  const surface = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.12 });
  const object = mesh(parent, new THREE.TorusGeometry(radius, tube, 10, 96), surface, position);
  object.rotation.x = Math.PI / 2;
  return object;
}

/** Also releases canvas textures and extruded assets when navigating away / hot reloading. */
export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)
      geometries.add(object.geometry);
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite
    ) {
      const values: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
      values.forEach((value) => {
        materials.add(value);
        // PBR detail uses shared bump/roughness maps as well as color textures.
        // Collect each attached texture once, even when several surfaces reuse it.
        for (const property of Object.values(value)) {
          if (property instanceof THREE.Texture) textures.add(property);
        }
      });
    }
  });
  textures.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  geometries.forEach((value) => value.dispose());
  root.removeFromParent();
}

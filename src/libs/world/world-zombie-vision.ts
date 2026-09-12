import * as THREE from 'three';

function isPerson(object: THREE.Object3D) {
  for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
    if (parent.userData.worldPerson || parent.userData.worldPlayer || parent.userData.worldCrowd) return true;
  }
  return false;
}

/** Infection is permanent for this scene. Original resources keep their existing disposal owner. */
export function applyWorldZombieVision(scene: THREE.Scene) {
  scene.background = new THREE.Color('#010301');
  if (scene.fog) scene.fog.color.set('#010301');
  scene.environmentIntensity = 0;
  const changed = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (isPerson(object)) return;
    if (object instanceof THREE.Light && !(object instanceof THREE.HemisphereLight)) object.intensity = 0;
    if (
      !(object instanceof THREE.Mesh) &&
      !(object instanceof THREE.Sprite) &&
      !(object instanceof THREE.Points) &&
      !(object instanceof THREE.Line)
    )
      return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (changed.has(material)) continue;
      changed.add(material);
      if (material instanceof THREE.ShaderMaterial) {
        // Sky glows and shader overlays cannot bypass the loss of normal sight.
        material.visible = false;
        continue;
      }
      if ('color' in material && material.color instanceof THREE.Color) material.color.setRGB(0.003, 0.005, 0.003);
      if ('emissive' in material && material.emissive instanceof THREE.Color) material.emissive.set(0);
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveIntensity = 0;
        material.envMapIntensity = 0;
        material.metalness = 0;
        material.roughness = 1;
      }
      if (material instanceof THREE.SpriteMaterial) material.opacity = 0.04;
    }
  });
}

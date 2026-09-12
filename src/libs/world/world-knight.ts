import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The parked suit and the mounted explorer use the same locally built armor. */
export function createWorldKnightEquipment() {
  const chest = new THREE.Group();
  const helmet = new THREE.Group();
  const leftShoulder = new THREE.Group();
  const rightShoulder = new THREE.Group();
  const leftShin = new THREE.Group();
  const rightShin = new THREE.Group();
  const sword = new THREE.Group();
  const shield = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#ADBCC7', roughness: 0.36, metalness: 0.68 });
  const dark = new THREE.MeshStandardMaterial({ color: '#273039', roughness: 0.72, metalness: 0.32 });
  const gold = new THREE.MeshStandardMaterial({ color: '#BCA260', roughness: 0.42, metalness: 0.7 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#843C43', roughness: 0.96 });
  const batches = new Map<THREE.Group, Map<THREE.Material, THREE.BufferGeometry[]>>();
  const add = (group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const surfaces = batches.get(group) ?? new Map<THREE.Material, THREE.BufferGeometry[]>();
    const pieces = surfaces.get(material) ?? [];
    const piece = geometry.index ? geometry.toNonIndexed() : geometry;
    if (piece !== geometry) geometry.dispose();
    pieces.push(piece);
    surfaces.set(material, pieces);
    batches.set(group, surfaces);
  };
  const oval = (
    group: THREE.Group,
    material: THREE.Material,
    size: [number, number, number],
    position: [number, number, number],
  ) => add(group, new THREE.SphereGeometry(1, 20, 12).scale(...size).translate(...position), material);
  const block = (
    group: THREE.Group,
    material: THREE.Material,
    size: [number, number, number],
    position: [number, number, number],
  ) => add(group, new THREE.BoxGeometry(...size).translate(...position), material);

  oval(chest, steel, [0.54, 0.53, 0.4], [0, 0.3, 0.035]);
  oval(chest, dark, [0.46, 0.29, 0.32], [0, -0.1, 0]);
  for (let band = 0; band < 3; band++)
    add(
      chest,
      new THREE.CylinderGeometry(0.48, 0.49, 0.06, 20).scale(1, 1, 0.79).translate(0, 0.02 - band * 0.09, 0),
      gold,
    );
  block(chest, cloth, [0.18, 0.81, 0.033], [0, 0.32, 0.421]);
  block(chest, gold, [0.055, 0.36, 0.023], [0, 0.46, 0.447]);
  block(chest, gold, [0.24, 0.055, 0.023], [0, 0.5, 0.448]);
  for (const side of [-1, 1])
    for (const y of [0.11, 0.31, 0.51]) oval(chest, gold, [0.022, 0.022, 0.015], [side * 0.38, y, 0.33]);

  oval(helmet, steel, [0.475, 0.57, 0.48], [0, 0.28, 0.035]);
  block(helmet, dark, [0.63, 0.14, 0.034], [0, 0.35, 0.512]);
  block(helmet, steel, [0.052, 0.37, 0.025], [0, 0.26, 0.548]);
  for (let slot = -3; slot <= 3; slot++) block(helmet, dark, [0.019, 0.087, 0.028], [slot * 0.067, 0.095, 0.509]);
  for (const side of [-1, 1]) oval(helmet, gold, [0.03, 0.03, 0.02], [side * 0.325, 0.35, 0.407]);
  add(helmet, new THREE.CapsuleGeometry(0.09, 0.37, 4, 10).rotateX(0.32).translate(0, 0.96, -0.06), cloth);

  for (const shoulder of [leftShoulder, rightShoulder]) {
    oval(shoulder, steel, [0.27, 0.22, 0.3], [0, 0.055, 0]);
    for (let plate = 0; plate < 3; plate++)
      oval(
        shoulder,
        plate % 2 ? gold : steel,
        [0.232 - plate * 0.022, 0.12, 0.263 - plate * 0.019],
        [0, -0.04 - plate * 0.1, 0],
      );
  }
  for (const shin of [leftShin, rightShin]) {
    oval(shin, steel, [0.172, 0.31, 0.195], [0, -0.13, 0.017]);
    oval(shin, gold, [0.181, 0.12, 0.055], [0, 0, 0.177]);
    block(shin, dark, [0.022, 0.33, 0.014], [0, -0.18, 0.213]);
  }

  add(sword, new THREE.CylinderGeometry(0.045, 0.045, 0.23, 8).translate(0, -0.04, 0), dark);
  oval(sword, gold, [0.074, 0.066, 0.066], [0, 0.105, 0]);
  block(sword, gold, [0.38, 0.06, 0.07], [0, -0.19, 0]);
  const blade = new THREE.Shape();
  blade.moveTo(-0.064, -0.22);
  blade.lineTo(0.064, -0.22);
  blade.lineTo(0.046, -1.24);
  blade.lineTo(0, -1.47);
  blade.lineTo(-0.046, -1.24);
  blade.closePath();
  add(sword, new THREE.ExtrudeGeometry(blade, { depth: 0.032, bevelEnabled: false }).translate(0, 0, -0.016), steel);
  block(sword, gold, [0.014, 0.88, 0.035], [0, -0.7, 0]);
  oval(shield, gold, [0.36, 0.44, 0.068], [0, 0, 0]);
  oval(shield, cloth, [0.325, 0.4, 0.07], [0, 0, 0.025]);
  block(shield, gold, [0.052, 0.53, 0.02], [0, 0, 0.098]);
  block(shield, gold, [0.36, 0.052, 0.02], [0, 0.06, 0.1]);

  const equipment = { chest, helmet, leftShoulder, rightShoulder, leftShin, rightShin, sword, shield };
  for (const [name, group] of Object.entries(equipment)) {
    group.name = `knight-${name}`;
    for (const [material, pieces] of batches.get(group) ?? []) {
      const geometry = mergeGeometries(pieces);
      pieces.forEach((piece) => piece.dispose());
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  return equipment;
}

/** A suit resting beside the horse remains a single discoverable/burnable prop. */
export function createWorldKnightArmorStand() {
  const group = new THREE.Group();
  group.name = 'horse-knight-armor';
  const equipment = createWorldKnightEquipment();
  equipment.chest.position.y = 1.06;
  equipment.helmet.position.y = 1.99;
  equipment.leftShoulder.position.set(-0.55, 1.725, 0);
  equipment.rightShoulder.position.set(0.55, 1.725, 0);
  equipment.leftShin.position.set(-0.23, 0.55, 0);
  equipment.rightShin.position.set(0.23, 0.55, 0);
  equipment.sword.position.set(0.9, 1.7, 0.15);
  equipment.sword.rotation.z = -0.16;
  equipment.shield.position.set(-0.78, 1.05, 0.23);
  group.add(...Object.values(equipment));
  const wood = new THREE.MeshStandardMaterial({ color: '#49352D', roughness: 0.95 });
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.7, 8).translate(0, 1.35, 0), wood));
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.77, 0.12, 16).translate(0, 0.06, 0), wood));
  return group;
}

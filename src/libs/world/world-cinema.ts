import * as THREE from 'three';
import { label, mesh } from '@/libs/world/world-geometry';
import { CINEMA_YAW, WORLD_ANCHORS } from '@/libs/world/world-layout';
import type { WorldObstacle } from '@/libs/world/world-motion';
import { worldDetail } from '@/libs/world/world-surfaces';
import type { WorldInteraction } from '@/libs/world/world-types';

const CINEMA_SCALE = 2;
export const CINEMA_DIMENSIONS = { halfWidth: 25, back: 31, front: 7.1, height: 38.1 } as const;
export const CINEMA_SCREEN = { width: 36, height: 20.25 } as const;

export function cinemaCollisionObstacles(anchor: readonly [number, number] = WORLD_ANCHORS.cinema): WorldObstacle[] {
  return [
    [0, -7.5, 7],
    [-8, -6.2, 4.4],
    [8, -6.2, 4.4],
  ].map(([x, z, radius]) => ({
    x: anchor[0] + (x * Math.cos(CINEMA_YAW) + z * Math.sin(CINEMA_YAW)) * CINEMA_SCALE,
    z: anchor[1] + (-x * Math.sin(CINEMA_YAW) + z * Math.cos(CINEMA_YAW)) * CINEMA_SCALE,
    radius: radius * CINEMA_SCALE,
  }));
}

/** Original Art Deco movie house. A separate DOM projection supplies the live screen. */
export function createCinema(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
) {
  const cinema = new THREE.Group();
  cinema.name = 'midnight-cinema';
  cinema.position.set(WORLD_ANCHORS.cinema[0], 0, WORLD_ANCHORS.cinema[1]);
  cinema.rotation.y = CINEMA_YAW;
  scene.add(cinema);
  // Keep the screen frame in world units while scaling all local architecture,
  // backing artwork and the marquee together. CSS projection uses that frame.
  const building = new THREE.Group();
  building.name = 'Midnight Cinema building';
  building.scale.setScalar(CINEMA_SCALE);
  cinema.add(building);
  const construction = worldDetail(building, 'Cinema Art Deco construction');
  const block = (
    size: [number, number, number],
    color: string,
    position: [number, number, number],
    surface: 'stone' | 'metal' | 'wood' | 'glow' = 'stone',
    rotation: [number, number, number] = [0, 0, 0],
  ) => construction.add(new THREE.BoxGeometry(...size), color, surface, position, rotation);
  const rod = (from: [number, number, number], to: [number, number, number], radius: number, color: string) => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const cylinder = new THREE.CylinderGeometry(radius, radius, direction.length(), 12);
    cylinder.applyMatrix4(
      new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
      ),
    );
    construction.add(
      cylinder,
      color,
      'metal',
      start.add(end).multiplyScalar(0.5).toArray() as [number, number, number],
    );
  };
  const gold = '#BC9A65';
  const brightGold = '#E0C291';
  const darkGold = '#766349';
  const crimson = '#722E43';
  block([25, 0.45, 18], '#3F343A', [0, 0.23, -6.5]);
  block([24.5, 0.08, 17.6], '#646064', [0, 0.495, -6.5]);
  // Thick side wings and a recessed lobby make the doors read as openings.
  block([22, 8.5, 0.8], '#302A32', [0, 4.7, -13.1]);
  for (const side of [-1, 1]) {
    block([0.72, 8.5, 12.8], '#302B34', [side * 10.64, 4.7, -6.7]);
    block([8.35, 8.5, 1.25], '#352933', [side * 6.605, 4.7, -0.82]);
    block([0.16, 4.55, 1.12], '#61535A', [side * 2.414, 2.82, -0.86]);
    block([0.075, 4.42, 0.14], gold, [side * 2.492, 2.82, -0.241], 'metal');
    for (let bay = 0; bay < 4; bay++) {
      const z = -2.75 - bay * 3.12;
      block([0.035, 5.75, 2.27], '#181D25', [side * 11.016, 4.74, z], 'metal');
      for (const offset of [-0.91, 0.91])
        block([0.075, 5.96, 0.061], darkGold, [side * 11.05, 4.74, z + offset], 'metal');
      for (let rib = 0; rib < 5; rib++)
        block(
          [0.075, 5.56, 0.069],
          bay % 2 ? '#64574D' : '#534B4C',
          [side * 11.058, 4.74, z - 0.67 + rib * 0.335],
          'metal',
        );
      block([0.12, 0.18, 2.59], gold, [side * 11.09, 1.706, z], 'metal');
      block([0.12, 0.135, 2.59], '#85705A', [side * 11.09, 7.83, z], 'metal');
      if (bay < 3) block([0.2, 7.9, 0.23], '#67404D', [side * 11.06, 4.67, z - 1.56]);
    }
    for (let joint = 0; joint < 12; joint++)
      block([0.027, 0.024, 12.52], '#48434A', [side * 11.007, 0.95 + joint * 0.67, -6.75]);
  }
  block([5, 3.63, 1.25], '#3A2D37', [0, 7.13, -0.82]);
  block([4.74, 4.68, 0.17], '#111720', [0, 2.85, -1.49], 'metal');
  block([4.9, 0.105, 1.5], '#5D464E', [0, 0.61, -0.51]);
  for (const [width, height, depth, y, color] of [
    [22.55, 0.18, 13.68, 8.87, '#6D4552'],
    [23, 0.33, 14, 9.125, '#3F323F'],
    [23.35, 0.09, 14.33, 9.338, '#A48660'],
    [22.7, 0.11, 13.69, 9.432, '#55414C'],
  ] as const)
    block([width, height, depth], color, [0, y, -7]);
  for (const x of [-9.6, 9.6]) {
    block([2.5, 10.6, 2.6], crimson, [x, 5.6, -1.5]);
    block([1.82, 11.25, 1.84], '#8B3E54', [x, 5.94, -1.1]);
    block([1.25, 11.5, 1.37], '#613146', [x, 6, -0.86]);
    for (let flute = 0; flute < 7; flute++) {
      block([0.046, 10.65, 0.08], flute % 2 ? gold : '#AA855B', [x - 0.57 + flute * 0.19, 5.88, -0.126], 'metal');
    }
    block([2.8, 0.19, 3], gold, [x, 11.06, -1.5], 'metal');
    block([2.36, 0.12, 2.53], '#9E5C69', [x, 11.226, -1.43]);
    block([1.81, 0.12, 2.02], darkGold, [x, 11.362, -1.27], 'metal');
    block([2.72, 0.21, 2.96], '#5B4449', [x, 0.682, -1.5]);
  }
  // A stepped, ribbed marquee with individual metal sockets; all its warm
  // bulbs share one emissive draw instead of a material and draw per bulb.
  block([18.5, 1.51, 4.8], crimson, [0, 6.3, 0.8]);
  block([17.98, 1.1, 0.11], '#431F32', [0, 6.3, 3.244]);
  for (const y of [5.55, 7.05]) {
    block([19, 0.14, 5], gold, [0, y, 0.8], 'metal');
    block([18.63, 0.065, 4.83], brightGold, [0, y + (y < 6 ? 0.117 : -0.117), 0.8], 'metal');
  }
  for (let rib = 0; rib < 26; rib++) block([0.048, 1.1, 0.078], '#9F6F60', [-8.63 + rib * 0.69, 6.3, 3.275], 'metal');
  const bulb = (position: [number, number, number], yaw = 0) => {
    construction.add(new THREE.CylinderGeometry(0.119, 0.142, 0.047, 12), '#AE8D58', 'metal', position, [
      Math.PI / 2,
      0,
      yaw,
    ]);
    construction.add(new THREE.SphereGeometry(0.085, 12, 8), '#F9DB9F', 'glow', [
      position[0],
      position[1],
      position[2] + 0.041,
    ]);
  };
  for (let index = 0; index < 20; index++) for (const y of [5.691, 6.909]) bulb([-8.56 + index * 0.901, y, 3.327]);
  for (const side of [-1, 1])
    for (let index = 0; index < 5; index++) {
      construction.add(
        new THREE.CylinderGeometry(0.118, 0.14, 0.044, 12),
        gold,
        'metal',
        [side * 9.298, 5.687, -1.3 + index * 0.96],
        [0, 0, Math.PI / 2],
      );
      construction.add(new THREE.SphereGeometry(0.077, 12, 8), '#F5CC83', 'glow', [
        side * 9.33,
        5.687,
        -1.3 + index * 0.96,
      ]);
    }
  for (const z of [-0.85, 0.1, 1.05, 2]) block([17.6, 0.055, 0.073], '#46333D', [0, 5.517, z], 'metal');
  for (const x of [-5.8, 0, 5.8]) block([1.03, 0.045, 0.48], '#E5C18C', [x, 5.492, 1.35], 'glow');
  label(building, 'MIDNIGHT CINEMA', [0, 6.32, 3.55], 14.5, '#F8DCA3', '#5B2036');

  for (const x of [-1.19, 1.19]) {
    block([2.17, 3.95, 0.16], '#80715C', [x, 2.625, -1.268], 'metal');
    block([1.99, 3.75, 0.049], '#101C26', [x, 2.625, -1.164], 'metal');
    for (const offset of [-0.78, 0, 0.78]) block([0.037, 3.57, 0.047], gold, [x + offset, 2.625, -1.13], 'metal');
    for (const y of [1.003, 1.659, 3.0, 4.228]) block([1.83, 0.036, 0.046], gold, [x, y, -1.126], 'metal');
    for (const side of [-1, 1]) rod([x + side * 0.69, 4.143, -1.087], [x, 3.731, -1.087], 0.016, gold);
    const handleX = x + (x < 0 ? 0.715 : -0.715);
    rod([handleX, 2.084, -0.956], [handleX, 2.826, -0.956], 0.038, brightGold);
    for (const y of [2.1, 2.81]) rod([handleX, y, -1.129], [handleX, y, -0.948], 0.024, gold);
    block([1.84, 0.16, 0.025], '#84735E', [x, 0.873, -1.11], 'metal');
  }
  block([4.39, 0.29, 0.055], '#35252D', [0, 4.797, -1.199]);
  for (const side of [-1, 1])
    for (let ray = 0; ray < 4; ray++)
      rod([side * 0.08, 4.652, -1.135], [side * (0.33 + ray * 0.48), 4.935, -1.135], 0.017, gold);
  block([5.1, 0.08, 3.6], '#873247', [0, 0.577, 1.7], 'wood');
  for (const x of [-2.41, 2.41]) block([0.033, 0.008, 3.42], gold, [x, 0.622, 1.7], 'metal');
  for (const z of [0.24, 0.36, 3.04, 3.16]) block([4.91, 0.009, 0.028], '#AA695C', [0, 0.624, z], 'wood');
  // Framed original poster reliefs flank the entrance without new interactions.
  for (const x of [-6.2, 6.2]) {
    block([3.39, 4.39, 0.25], '#564542', [x, 2.89, -0.36]);
    block([3.23, 4.21, 0.1], gold, [x, 2.89, -0.191], 'metal');
    block([2.95, 3.93, 0.047], x < 0 ? '#294B53' : '#66334A', [x, 2.89, -0.112]);
    for (const y of [0.829, 4.951]) block([3.32, 0.061, 0.12], brightGold, [x, y, -0.169], 'metal');
    construction.add(new THREE.CircleGeometry(0.626, 48), '#D4B679', 'metal', [x, 3.65, -0.074]);
    for (let ray = 0; ray < 9; ray++) {
      const angle = (ray / 8) * Math.PI;
      rod(
        [x + Math.cos(angle) * 0.764, 3.65 + Math.sin(angle) * 0.764, -0.061],
        [x + Math.cos(angle) * 0.946, 3.65 + Math.sin(angle) * 0.946, -0.061],
        0.013,
        '#C6AB79',
      );
    }
    const mountain = new THREE.Shape();
    mountain.moveTo(-1.36, 0);
    mountain.lineTo(-0.45, 0.69);
    mountain.lineTo(0.015, 0.255);
    mountain.lineTo(0.645, 0.905);
    mountain.lineTo(1.36, 0);
    mountain.closePath();
    construction.add(new THREE.ShapeGeometry(mountain), x < 0 ? '#557D78' : '#994F68', 'stone', [x, 2.7, -0.049]);
    for (let line = 0; line < 3; line++)
      block([2.14 - line * 0.28, 0.06, 0.025], '#D1B78B', [x, 2.01 - line * 0.3, -0.059], 'metal');
    block([2.24, 0.024, 0.02], '#9C865F', [x, 0.991, -0.058], 'metal');
  }
  // A small glazed ticket booth gives the entrance a useful human-scale detail.
  const boothX = 3.83;
  block([1.74, 0.145, 1.44], '#6A4B50', [boothX, 0.663, 1.37]);
  block([1.52, 1.365, 1.24], '#743144', [boothX, 1.417, 1.37], 'wood');
  for (let flute = 0; flute < 9; flute++)
    block([0.047, 1.145, 0.057], flute % 2 ? '#9B5660' : gold, [boothX - 0.628 + flute * 0.157, 1.42, 2.011], 'metal');
  block([1.75, 0.12, 1.5], gold, [boothX, 2.145, 1.39], 'metal');
  block([1.56, 1.0, 0.06], '#17232A', [boothX, 2.725, 1.961], 'metal');
  for (const side of [-1, 1]) {
    block([0.047, 1.05, 0.05], brightGold, [boothX + side * 0.721, 2.734, 2.002], 'metal');
    block([0.051, 1.0, 1.05], '#27333A', [boothX + side * 0.728, 2.731, 1.414], 'metal');
  }
  block([1.84, 0.16, 1.55], '#9D666C', [boothX, 3.318, 1.38]);
  block([1.91, 0.04, 1.63], brightGold, [boothX, 3.421, 1.38], 'metal');
  for (let grille = 0; grille < 5; grille++)
    rod(
      [boothX - 0.232 + grille * 0.116, 2.585, 2.009],
      [boothX - 0.232 + grille * 0.116, 2.93, 2.009],
      0.01,
      '#BCA274',
    );
  block([0.493, 0.093, 0.025], '#0E151E', [boothX, 2.375, 2.007], 'metal');
  block([0.582, 0.027, 0.22], gold, [boothX, 2.322, 2.085], 'metal');
  for (let ticket = 0; ticket < 3; ticket++)
    block([0.151, 0.008, 0.124], '#CEC6A0', [boothX + 0.42, 2.213 + ticket * 0.009, 1.815], 'wood');

  // The movie rectangle is unchanged; every new molding and curtain fold is
  // outside its opening, so the CSS3D program keeps its full 36 × 20.25 area.
  block([19, 11.1, 0.65], '#17191F', [0, 13.5, -0.25]);
  block([18.66, 10.79, 0.13], '#695243', [0, 13.5, 0.13], 'metal');
  block([18.35, 10.5, 0.05], '#C4A575', [0, 13.5, 0.213], 'metal');
  const backing = mesh(
    building,
    new THREE.BoxGeometry(18, 10.125, 0.04),
    new THREE.MeshStandardMaterial({ color: '#352330', roughness: 0.94, metalness: 0 }),
    [0, 13.5, 0.225],
  );
  backing.name = 'Midnight Cinema backing screen';
  const play = new THREE.Shape();
  play.moveTo(-0.8, -1.2);
  play.lineTo(1.15, 0);
  play.lineTo(-0.8, 1.2);
  play.closePath();
  construction.add(new THREE.ShapeGeometry(play), '#D8B77F', 'metal', [0, 13.5, 0.25]);
  for (const side of [-1, 1]) {
    for (let fin = 0; fin < 3; fin++) {
      const top = 18.5 - fin * 0.72;
      const x = side * (9.83 + fin * 0.35);
      block([0.35, top - 8.85, 0.75], fin % 2 ? '#813D50' : '#6A3045', [x, (top + 8.85) / 2, -0.35 - fin * 0.25]);
      block([0.048, top - 9.12, 0.027], gold, [x, (top + 8.94) / 2, 0.045 - fin * 0.25], 'metal');
      block([0.374, 0.09, 0.83], '#B58D67', [x, top + 0.046, -0.35 - fin * 0.25], 'metal');
    }
    for (let fold = 0; fold < 3; fold++)
      construction.add(
        new THREE.CylinderGeometry(0.072, 0.076, 10.08, 12).scale(1, 1, 0.66),
        fold % 2 ? '#5D263C' : '#8B3C52',
        'wood',
        [side * (9.147 + fold * 0.15), 13.5, 0.199],
      );
    for (let inset = 0; inset < 8; inset++)
      block(
        [0.169, 0.504, 0.062],
        inset % 2 ? '#BB8B65' : '#A85862',
        [side * 9.363, 9.25 + inset * 1.227, 0.253],
        'metal',
      );
  }
  for (const y of [8.323, 18.681]) {
    block([18.81, 0.133, 0.184], '#705242', [0, y, 0.175], 'metal');
    block([18.7, 0.029, 0.027], brightGold, [0, y + (y < 13 ? 0.091 : -0.091), 0.278], 'metal');
  }
  block([19.31, 0.091, 0.802], '#A5855D', [0, 18.932, -0.193], 'metal');
  block([18.87, 0.073, 0.927], '#533848', [0, 19.011, -0.198]);
  for (const side of [-1, 1])
    for (let ray = 0; ray < 4; ray++)
      rod([side * 0.032, 18.749, 0.291], [side * (0.186 + ray * 0.153), 18.875, 0.291], 0.01, brightGold);
  const screenFrame = new THREE.Object3D();
  screenFrame.name = 'Midnight Cinema screen plane';
  screenFrame.position.set(0, 13.5 * CINEMA_SCALE, 0.28 * CINEMA_SCALE);
  cinema.add(screenFrame);

  // The rooftop projector keeps its playful silhouette with real reel rims,
  // focus rings, vent slots, controls and film guides instead of plain blocks.
  block([3.4, 2, 2], '#6F7473', [-5.6, 10.55, -8], 'metal');
  block([3.17, 1.67, 0.091], '#92958B', [-5.6, 10.58, -6.951], 'metal');
  for (const x of [-6.79, -4.41]) block([0.395, 0.19, 1.31], '#2A333A', [x, 9.512, -8], 'metal');
  for (let slot = 0; slot < 9; slot++)
    block([0.107, 0.741, 0.022], '#2B3439', [-6.867 + slot * 0.306, 10.578, -6.887], 'metal');
  construction.add(
    new THREE.CylinderGeometry(0.62, 0.8, 1.5, 32),
    '#AC9B79',
    'metal',
    [-5.6, 10.65, -6.4],
    [Math.PI / 2, 0, 0],
  );
  for (const z of [-6.825, -6.551, -6.145, -5.75])
    construction.add(new THREE.TorusGeometry(0.661, 0.041, 8, 32), z < -6 ? darkGold : brightGold, 'metal', [
      -5.6,
      10.65,
      z,
    ]);
  construction.add(new THREE.CircleGeometry(0.599, 40), '#14343B', 'metal', [-5.6, 10.65, -5.628]);
  construction.add(new THREE.CircleGeometry(0.482, 40), '#38656A', 'metal', [-5.6, 10.65, -5.616]);
  for (const x of [-6.7, -4.5]) {
    construction.add(new THREE.TorusGeometry(0.953, 0.143, 8, 40), '#A2A49C', 'metal', [x, 12.25, -8]);
    construction.add(new THREE.TorusGeometry(0.837, 0.044, 6, 36), '#59676A', 'metal', [x, 12.25, -7.897]);
    for (let spoke = 0; spoke < 6; spoke++)
      rod(
        [x + Math.sin((spoke / 6) * Math.PI * 2) * 0.129, 12.25 + Math.cos((spoke / 6) * Math.PI * 2) * 0.129, -7.945],
        [x + Math.sin((spoke / 6) * Math.PI * 2) * 0.82, 12.25 + Math.cos((spoke / 6) * Math.PI * 2) * 0.82, -7.945],
        0.055,
        '#C2BEA5',
      );
    construction.add(
      new THREE.CylinderGeometry(0.168, 0.168, 0.24, 20),
      '#817255',
      'metal',
      [x, 12.25, -7.941],
      [Math.PI / 2, 0, 0],
    );
    rod([x, 11.472, -8], [x, 10.97, -8], 0.067, '#454D52');
  }
  const filmPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-6.37, 11.421, -7.784),
    new THREE.Vector3(-6.0, 11.07, -7.784),
    new THREE.Vector3(-5.23, 10.948, -7.784),
    new THREE.Vector3(-4.8, 11.46, -7.784),
  ]);
  construction.add(new THREE.TubeGeometry(filmPath, 20, 0.025, 6, false), '#29343A', 'metal');
  for (const x of [-6.768, -4.34])
    construction.add(
      new THREE.CylinderGeometry(0.127, 0.127, 0.113, 16),
      gold,
      'metal',
      [x, 11.224, -6.825],
      [Math.PI / 2, 0, 0],
    );
  const architecture = construction.finish();
  for (const object of architecture.children)
    if (
      object instanceof THREE.Mesh &&
      object.material instanceof THREE.MeshStandardMaterial &&
      object.name.endsWith(' · glow')
    ) {
      object.material.emissive.set('#F7BD70');
      object.material.emissiveIntensity = 0.65;
    }
  register(cinema, { kind: 'zone', id: 'cinema' }, 'Watch a film at Midnight Cinema');
  cinemaCollisionObstacles().forEach(({ x, z, radius }) => obstacle(x, z, radius));
  return { group: cinema, screenFrame };
}

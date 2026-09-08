import * as THREE from 'three';
import { box, cylinder, label, material, mesh, sphere } from '@/libs/world/world-geometry';
import { CINEMA_YAW, WORLD_ANCHORS } from '@/libs/world/world-layout';
import type { WorldObstacle } from '@/libs/world/world-motion';
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
  box(building, [25, 0.45, 18], '#3E2A32', [0, 0.23, -6.5]);
  box(building, [22, 8.5, 13], '#251B25', [0, 4.7, -7]);
  box(building, [23, 0.55, 14], '#3B2737', [0, 9.1, -7]);
  for (const x of [-9.6, 9.6]) {
    box(building, [2.5, 10.6, 2.6], '#70273E', [x, 5.6, -1.5]);
    box(building, [1.7, 11.5, 1.8], '#89354F', [x, 6, -1.1]);
    for (const offset of [-0.5, 0, 0.5]) box(building, [0.12, 10.7, 0.13], '#C5A779', [x + offset, 5.9, -0.15]);
    box(building, [2.8, 0.3, 3], '#C5A779', [x, 11.05, -1.5]);
  }
  // Warm, low marquee bulbs distinguish this from the open-air lime theater.
  box(building, [18.5, 1.6, 4.8], '#70273E', [0, 6.3, 0.8]);
  for (const y of [5.55, 7.05]) box(building, [19, 0.14, 5], '#DBBA86', [0, y, 0.8]);
  for (let index = 0; index < 16; index++) {
    for (const y of [5.65, 6.95])
      mesh(building, new THREE.IcosahedronGeometry(0.1, 0), material('#F7CE83', true), [-8.5 + index * 1.13, y, 3.35]);
  }
  label(building, 'MIDNIGHT CINEMA', [0, 6.32, 3.55], 14.5, '#F8DCA3', '#5B2036');
  for (const x of [-1.2, 1.2]) {
    box(building, [2.2, 3.9, 0.22], '#111017', [x, 2.5, -0.2]);
    box(building, [0.07, 0.7, 0.14], '#D3B582', [x + (x < 0 ? 0.72 : -0.72), 2.3, -0.03]);
  }
  box(building, [5.1, 0.08, 3.6], '#9F3F53', [0, 0.51, 1.7]);
  for (const x of [-6.2, 6.2]) {
    box(building, [3.3, 4.3, 0.25], '#CAA779', [x, 2.8, -0.35]);
    box(building, [2.9, 3.9, 0.18], x < 0 ? '#365358' : '#6F354D', [x, 2.8, -0.17]);
    sphere(building, 0.7, '#E7C894', [x, 3.5, 0]).scale.z = 0.12;
    for (let line = 0; line < 3; line++)
      box(building, [2 - line * 0.3, 0.08, 0.14], '#E7C894', [x, 2.3 - line * 0.35, 0]);
  }
  box(building, [19, 11.1, 0.65], '#17121C', [0, 13.5, -0.25]);
  box(building, [18.35, 10.5, 0.13], '#D8B77F', [0, 13.5, 0.13]);
  const backing = box(building, [18, 10.125, 0.04], '#352330', [0, 13.5, 0.225]);
  backing.name = 'Midnight Cinema backing screen';
  const play = new THREE.Shape();
  play.moveTo(-0.8, -1.2);
  play.lineTo(1.15, 0);
  play.lineTo(-0.8, 1.2);
  play.closePath();
  mesh(building, new THREE.ShapeGeometry(play), '#D8B77F', [0, 13.5, 0.25]);
  for (const x of [-9.28, 9.28])
    for (let y = 0; y < 8; y++) box(building, [0.2, 0.58, 0.12], '#6A3B43', [x, 9.2 + y * 1.23, 0.25]);
  const screenFrame = new THREE.Object3D();
  screenFrame.name = 'Midnight Cinema screen plane';
  screenFrame.position.set(0, 13.5 * CINEMA_SCALE, 0.28 * CINEMA_SCALE);
  cinema.add(screenFrame);
  // A giant toy projector on the roof makes the silhouette readable from above.
  box(building, [3.4, 2, 2], '#A29382', [-5.6, 10.55, -8]);
  const lens = cylinder(building, 0.62, 0.8, 1.5, '#D5BA8B', [-5.6, 10.65, -6.4], 12);
  lens.rotation.x = Math.PI / 2;
  for (const x of [-6.7, -4.5]) {
    const reel = mesh(building, new THREE.TorusGeometry(0.95, 0.2, 6, 16), '#7E717A', [x, 12.25, -8]);
    for (let spoke = 0; spoke < 3; spoke++) {
      const bar = box(reel, [1.5, 0.14, 0.12], '#C7B9A7');
      bar.rotation.z = (spoke / 3) * Math.PI;
    }
  }
  register(cinema, { kind: 'zone', id: 'cinema' }, 'Watch a film at Midnight Cinema');
  cinemaCollisionObstacles().forEach(({ x, z, radius }) => obstacle(x, z, radius));
  return { group: cinema, screenFrame };
}

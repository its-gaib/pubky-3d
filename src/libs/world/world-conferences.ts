import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD_CONFERENCES, type WorldConference } from '@/libs/world/world-conference-catalog';
import { disposeObject, type Point3, WORLD_PALETTE } from '@/libs/world/world-geometry';
import type { WorldInteraction } from '@/libs/world/world-types';

export const CONFERENCE_DECK = {
  width: 24,
  depth: 18,
  radius: 15,
  displaySpacing: 8,
  hoverHeight: 1.8,
  hoverAmount: 0.14,
} as const;

/** Static dioramas are merged by material, rather than drawing every tiny window separately. */
function batch(parent: THREE.Object3D, materials: Map<string, THREE.MeshStandardMaterial>) {
  const parts = new Map<string, THREE.BufferGeometry[]>();
  const add = (geometry: THREE.BufferGeometry, color: string, position: Point3, rotation: Point3 = [0, 0, 0]) => {
    geometry
      .rotateX(rotation[0])
      .rotateY(rotation[1])
      .rotateZ(rotation[2])
      .translate(...position);
    const bucket = parts.get(color) ?? [];
    bucket.push(geometry);
    parts.set(color, bucket);
  };
  return {
    add,
    box(size: Point3, color: string, position: Point3, rotation?: Point3) {
      add(new THREE.BoxGeometry(...size), color, position, rotation);
    },
    cone(radius: number, height: number, color: string, position: Point3, sides = 5) {
      add(new THREE.ConeGeometry(radius, height, sides), color, position);
    },
    finish() {
      for (const [color, pieces] of parts) {
        const triangles = pieces.map((piece) => (piece.index ? piece.toNonIndexed() : piece));
        const geometry = mergeGeometries(triangles)!;
        new Set([...pieces, ...triangles]).forEach((piece) => piece.dispose());
        let material = materials.get(color);
        if (!material) {
          material = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.08, flatShading: true });
          materials.set(color, material);
        }
        const object = new THREE.Mesh(geometry, material);
        object.castShadow = true;
        object.receiveShadow = true;
        parent.add(object);
      }
    },
  };
}

type Diorama = ReturnType<typeof batch>;

function prague(city: Diorama) {
  city.box([6.5, 0.12, 1.1], '#2C6687', [0, 0.23, 0.95]);
  city.box([6, 0.18, 0.56], '#D5C0A9', [0, 0.58, 0.95]);
  for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) {
    city.box([0.2, 0.36, 0.56], '#D5C0A9', [x, 0.34, 0.95]);
    city.box([0.2, 0.32, 0.16], '#69527B', [x, 0.82, 1.15]);
  }
  for (const [x, height] of [
    [-2.4, 1.1],
    [-1.5, 1.5],
    [1.5, 1.2],
    [2.45, 1.55],
  ]) {
    city.box([0.8, height, 0.95], '#D5C0A9', [x, 0.3 + height / 2, -0.9]);
    city.cone(0.69, 0.75, '#69527B', [x, height + 0.65, -0.9], 4);
    city.box([0.19, 0.38, 0.035], '#FFD393', [x, height * 0.65, -0.4]);
  }
  city.box([2.1, 1.5, 1.15], '#746773', [0, 1, -0.7]);
  for (const x of [-0.7, 0.7]) {
    city.box([0.62, 2.2, 0.75], '#D5C0A9', [x, 1.38, -0.5]);
    city.cone(0.52, 1.25, '#69527B', [x, 3.1, -0.5]);
    city.box([0.15, 0.58, 0.04], '#FFD393', [x, 1.9, -0.1]);
    city.add(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 12), '#FFD393', [x, 1.2, -0.095], [Math.PI / 2, 0, 0]);
  }
}

function lugano(city: Diorama) {
  city.add(new THREE.CylinderGeometry(1, 1, 0.1, 28).scale(3, 1, 1.9), '#2C6687', [0, 0.24, 0]);
  for (const [x, height, radius] of [
    [-1.85, 2.2, 1.1],
    [-0.1, 3.35, 1.35],
    [1.9, 2.6, 1.1],
  ]) {
    city.cone(radius, height, '#668785', [x, height / 2 + 0.2, -0.8], 4);
    city.cone(radius * 0.36, height * 0.36, '#E0E7E5', [x, height * 0.82 + 0.2, -0.8], 4);
  }
  for (const x of [-2, -1.25, 1.7, 2.45]) {
    city.box([0.5, 0.65, 0.55], '#D5C0A9', [x, 0.6, 1.35]);
    city.cone(0.45, 0.4, '#B16C55', [x, 1.12, 1.35], 4);
  }
  city.box([0.85, 0.15, 0.35], '#D5C0A9', [0.25, 0.35, 1.15]);
  city.box([0.045, 1.15, 0.045], '#D5C0A9', [0.25, 0.97, 1.15]);
  const sail = new THREE.Shape();
  sail.moveTo(0, 0);
  sail.lineTo(0.57, 0);
  sail.lineTo(0, 0.95);
  sail.closePath();
  city.add(new THREE.ExtrudeGeometry(sail, { depth: 0.04, bevelEnabled: false }), '#E0E7E5', [0.29, 0.52, 1.13]);
}

function salvador(city: Diorama) {
  city.box([6.5, 0.12, 1.4], '#2C6687', [0, 0.22, 1.6]);
  for (const [x, height, radius] of [
    [-1.3, 2.45, 1.4],
    [1.45, 3.15, 1.35],
  ]) {
    city.add(new THREE.CylinderGeometry(radius * 0.16, radius, height, 7), '#4F8268', [x, height / 2 + 0.2, -0.75]);
    city.add(
      new THREE.TorusGeometry(radius * 0.16, 0.06, 5, 16),
      '#FFB477',
      [x, height + 0.22, -0.75],
      [Math.PI / 2, 0, 0],
    );
    city.add(new THREE.CylinderGeometry(radius * 0.12, radius * 0.12, 0.02, 12), '#25342F', [x, height + 0.21, -0.75]);
  }
  for (const x of [-2.65, 2.6]) {
    city.add(new THREE.CylinderGeometry(0.07, 0.12, 1.45, 5), '#D5C0A9', [x, 0.97, 0.8], [0, 0, x * 0.045]);
    for (let leaf = 0; leaf < 5; leaf++) {
      const angle = (leaf * Math.PI * 2) / 5;
      city.box(
        [0.8, 0.065, 0.2],
        '#4F8268',
        [x + Math.cos(angle) * 0.3, 1.75, 0.8 + Math.sin(angle) * 0.3],
        [0, -angle, 0.12],
      );
    }
  }
  for (const x of [-1.8, 0, 1.8]) city.box([1, 0.04, 0.08], '#E0E7E5', [x, 0.3, 2], [0, 0.1, 0]);
}

function textPlane(
  parent: THREE.Object3D,
  size: [number, number],
  position: Point3,
  paint: (context: CanvasRenderingContext2D) => void,
  pixels: [number, number] = [768, 448],
) {
  const canvas = document.createElement('canvas');
  canvas.width = pixels[0];
  canvas.height = pixels[1];
  const context = canvas.getContext('2d');
  if (context) paint(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(size[0], size[1]),
    new THREE.MeshBasicMaterial({ map: texture, fog: false, toneMapped: false }),
  );
  plane.position.set(...position);
  parent.add(plane);
  return plane;
}

function ticket(context: CanvasRenderingContext2D, conference: WorldConference, index: number) {
  context.fillStyle = '#12131C';
  context.fillRect(0, 0, 768, 448);
  context.fillStyle = conference.color;
  context.fillRect(0, 0, 768, 14);
  context.font = '700 25px sans-serif';
  context.fillText('PUBKY ON TOUR', 34, 62);
  context.textAlign = 'right';
  context.fillText(['PRG', 'LUG', 'SAL'][index], 730, 62);
  context.textAlign = 'left';
  context.fillStyle = '#EEEEF6';
  context.font = '900 66px sans-serif';
  context.fillText(conference.city, 34, 158, 700);
  context.font = '500 29px sans-serif';
  context.fillText(conference.name, 36, 210, 690);
  context.font = '400 25px sans-serif';
  context.fillStyle = '#B2B2C0';
  context.fillText(conference.country, 36, 252, 690);
  context.strokeStyle = '#535362';
  context.lineWidth = 2;
  context.setLineDash([9, 8]);
  context.beginPath();
  context.moveTo(30, 282);
  context.lineTo(738, 282);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = conference.color;
  context.font = '700 34px sans-serif';
  context.fillText(conference.dateLabel, 36, 340, 690);
  context.fillStyle = '#EEEEF6';
  context.font = '500 23px sans-serif';
  context.fillText('Explore the official event', 36, 404);
}

/** A local departure deck: three independently selectable tickets, no booking or network behavior. */
export function createConferences(
  scene: THREE.Scene,
  anchor: readonly [number, number],
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle?: (x: number, z: number, radius: number) => void,
) {
  const group = new THREE.Group();
  group.name = 'Next Stop: Pubky';
  group.position.set(anchor[0], 0, anchor[1]);
  scene.add(group);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const deck = batch(group, materials);
  deck.box([24, 0.35, 18], WORLD_PALETTE.surface, [0, 0.2, 0]);
  deck.box([23.4, 0.06, 17.4], '#30303A', [0, 0.41, 0]);
  deck.box([23.2, 0.05, 0.12], WORLD_PALETTE.lime, [0, 0.47, 8.4]);
  for (const x of [-10.5, 10.5]) deck.box([0.32, 12.3, 0.32], '#535362', [x, 6.5, -4.5]);
  deck.box([22, 4.1, 0.45], '#535362', [0, 12.15, -4.5]);
  for (const z of [5.2, 6.5, 7.8]) {
    for (const side of [-1, 1])
      deck.box([0.9, 0.045, 0.12], '#C8FF03', [side * 0.3, 0.48, z], [0, (side * Math.PI) / 4, 0]);
  }
  deck.finish();
  const board = textPlane(
    group,
    [21.5, 3.65],
    [0, 12.15, -4.24],
    (context) => {
      context.fillStyle = '#10111A';
      context.fillRect(0, 0, 1024, 174);
      context.textAlign = 'center';
      context.fillStyle = WORLD_PALETTE.lime;
      context.font = '900 56px sans-serif';
      context.fillText('NEXT STOP: PUBKY', 512, 67, 960);
      context.fillStyle = '#EEEEF6';
      context.font = '700 24px sans-serif';
      context.fillText('PRAGUE  ·  LUGANO  ·  SAN SALVADOR', 512, 118, 960);
      context.fillStyle = '#B2B2C0';
      context.font = '500 17px sans-serif';
      context.fillText('3 stops. Bring your curiosity.', 512, 153, 960);
    },
    [1024, 174],
  );
  board.name = 'Pubky departure board';
  const displays = WORLD_CONFERENCES.map((conference, index) => {
    const display = new THREE.Group();
    display.name = `${conference.city} boarding pass`;
    display.position.set((index - 1) * CONFERENCE_DECK.displaySpacing, CONFERENCE_DECK.hoverHeight, 0);
    group.add(display);
    const city = batch(display, materials);
    city.box([7.2, 0.22, 5.3], '#535362', [0, 0, 0]);
    city.box([6.85, 0.12, 4.95], '#25342F', [0, 0.17, 0]);
    city.box([7.15, 4.9, 0.3], conference.color, [0, 5.3, -2.55]);
    if (index === 0) prague(city);
    else if (index === 1) lugano(city);
    else salvador(city);
    city.finish();
    const pass = textPlane(display, [6.83, 4.54], [0, 5.3, -2.37], (context) => ticket(context, conference, index));
    pass.name = `${conference.city} official event dates`;
    register(display, { kind: 'conference', index }, `Next stop: ${conference.city}`);
    obstacle?.(anchor[0] + display.position.x, anchor[1], 3);
    return display;
  });
  let elapsed = 0;
  let disposed = false;
  return {
    group,
    animate(_time: number, delta: number, reducedMotion = false) {
      if (disposed || reducedMotion || !Number.isFinite(delta) || delta <= 0) return;
      elapsed += Math.min(delta, 0.05);
      displays.forEach((display, index) => {
        display.position.y =
          CONFERENCE_DECK.hoverHeight + Math.sin(elapsed * 0.7 + index * 2) * CONFERENCE_DECK.hoverAmount;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeObject(group);
    },
  };
}

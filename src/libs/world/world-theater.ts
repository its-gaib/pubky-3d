import * as THREE from 'three';
import { box, cylinder, label, mesh, WORLD_PALETTE } from '@/libs/world/world-geometry';
import type { WorldData, WorldInteraction, WorldPost } from '@/libs/world/world-types';

const SLIDE_SECONDS = 20;

/** Draw plain text only: public post content never becomes markup or a remote texture. */
function screenText(value: string, length: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, length);
}

function wrapText(context: CanvasRenderingContext2D, value: string, width: number, maximum: number) {
  const words = screenText(value, 900).split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > width) {
      lines.push(line);
      line = word;
      if (lines.length === maximum) break;
    } else line = next;
  }
  if (lines.length < maximum && line) lines.push(line);
  if (lines.join(' ').length < screenText(value, 900).length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:]$/, '')}…`;
  }
  return lines;
}

/** An outdoor cinema whose program stays in the public feed's ranking order. */
export function createTheater(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
  initialData: WorldData,
) {
  const theater = new THREE.Group();
  theater.position.set(-35, 0, -15);
  scene.add(theater);
  box(theater, [18, 0.4, 14], WORLD_PALETTE.border, [0, 0.2, 1]);
  box(theater, [17.3, 0.16, 3.2], WORLD_PALETTE.neutral, [0, 0.48, -4]);
  for (const x of [-7.1, 7.1]) {
    box(theater, [0.6, 10.2, 0.8], '#656570', [x, 5.5, -4.45]);
    cylinder(theater, 0.7, 1, 0.6, WORLD_PALETTE.surface, [x, 0.7, -4.45]);
    obstacle(-35 + x, -19.45, 0.8);
  }
  box(theater, [16.4, 9.5, 0.65], WORLD_PALETTE.background, [0, 7.3, -4.05]);
  for (const y of [2.65, 11.95]) box(theater, [16.6, 0.14, 0.2], WORLD_PALETTE.lime, [0, y, -3.63]);
  for (const x of [-8.18, 8.18]) box(theater, [0.14, 9.45, 0.2], WORLD_PALETTE.lime, [x, 7.3, -3.63]);

  // Split benches leave a central aisle and gaps to walk between each row.
  for (let row = 0; row < 3; row++) {
    const z = row * 2.5 + 1;
    const y = row * 0.25;
    for (const x of [-4.2, 4.2]) {
      box(theater, [6.2, 0.38, 1.2], row % 2 ? '#595961' : '#454549', [x, y + 0.85, z]);
      box(theater, [6.2, 1.05, 0.25], '#303034', [x, y + 1.45, z + 0.58]);
      for (const side of [-2.45, 2.45]) box(theater, [0.24, 0.7, 0.8], '#797985', [x + side, y + 0.4, z]);
      box(theater, [5.4, 0.06, 0.1], WORLD_PALETTE.lime, [x, y + 1.99, z + 0.44]);
      obstacle(-35 + x, -15 + z, 1.45);
    }
  }
  label(theater, 'Trending Theater', [0, 14.1, -3.8], 12);
  register(theater, { kind: 'zone', id: 'theater' }, 'Read the Trending Theater program');

  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 864;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = mesh(
    theater,
    new THREE.PlaneGeometry(15.6, 8.775),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    [0, 7.3, -3.7],
  );
  screen.castShadow = false;
  let posts: WorldPost[] = initialData.trendingPosts.slice(0, 8);
  let source = initialData.source;
  let index = 0;
  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let elapsed = 0;

  function paint() {
    if (!context) return;
    context.fillStyle = WORLD_PALETTE.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = WORLD_PALETTE.lime;
    context.fillRect(68, 70, 12, 46);
    context.font = '700 36px sans-serif';
    context.fillText('PUBKY / TRENDING THEATER', 105, 107);
    context.font = '500 23px sans-serif';
    context.fillStyle = '#BABAC1';
    context.fillText(
      source === 'demo' ? 'EXAMPLE WORLD · FICTIONAL PROGRAM' : 'PUBLIC STAGING · RANKED BY TOTAL ENGAGEMENT',
      70,
      160,
      1350,
    );
    const post = posts[index];
    context.fillStyle = WORLD_PALETTE.text;
    context.font = '600 51px sans-serif';
    const lines = wrapText(context, post?.text || 'The screen is quiet. No public posts are available yet.', 1360, 6);
    lines.forEach((line, row) => context.fillText(line, 76, 285 + row * 69, 1360));
    context.fillStyle = WORLD_PALETTE.lime;
    context.font = '600 31px sans-serif';
    context.fillText(post ? screenText(post.author, 52) : 'Intermission', 76, 755, 1060);
    context.fillStyle = '#89898F';
    context.font = '500 24px sans-serif';
    context.fillText(post ? `${index + 1} / ${posts.length}  ·  ${paused ? 'PAUSED' : 'ON AIR'}` : 'NO POSTS', 76, 808);
    texture.needsUpdate = true;
  }
  paint();

  return {
    getStatus: () => ({ theaterIndex: index, theaterPaused: paused }),
    setPaused(value: boolean) {
      paused = value;
      elapsed = 0;
      paint();
    },
    step(delta: number) {
      if (!Number.isFinite(delta) || !posts.length) return;
      index = (((index + Math.trunc(delta)) % posts.length) + posts.length) % posts.length;
      elapsed = 0;
      paint();
    },
    tick(delta: number) {
      if (paused || posts.length < 2) return false;
      elapsed += delta;
      if (elapsed < SLIDE_SECONDS) return false;
      index = (index + 1) % posts.length;
      elapsed %= SLIDE_SECONDS;
      paint();
      return true;
    },
    updateData(data: WorldData) {
      posts = data.trendingPosts.slice(0, 8);
      source = data.source;
      index = 0;
      elapsed = 0;
      paint();
    },
  };
}

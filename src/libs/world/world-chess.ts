import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ChesskySnapshot } from '@/libs/chessky/chessky.types';
import { disposeObject, label, mesh } from '@/libs/world/world-geometry';
import type { WorldObstacle } from '@/libs/world/world-motion';

export const CHESS_DIMENSIONS = { square: 3.2, boardSize: 25.6, halfExtent: 14, entranceZ: 16 } as const;
export type ChessPieceKind = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type ChessSide = 'obsidian' | 'silver';
const BACK_RANK: ChessPieceKind[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
const PIECE_KINDS: Record<ChesskySnapshot['pieces'][number]['type'], ChessPieceKind> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
};

/** A complete starting position: queens occupy their own-colored squares. */
export const CHESS_PIECES = (['silver', 'obsidian'] as const).flatMap((side) =>
  [0, 1].flatMap((row) =>
    Array.from({ length: 8 }, (_, file) => {
      const rank = side === 'silver' ? row : 7 - row;
      return {
        side,
        kind: row ? ('pawn' as const) : BACK_RANK[file],
        file,
        rank,
        x: (file - 3.5) * CHESS_DIMENSIONS.square,
        z: (3.5 - rank) * CHESS_DIMENSIONS.square,
      };
    }),
  ),
);

export function chessCollisionObstacles(anchor: readonly [number, number]): WorldObstacle[] {
  return CHESS_PIECES.map((piece) => ({ x: anchor[0] + piece.x, z: anchor[1] + piece.z, radius: 0.92 }));
}

function savedPieces(game: ChesskySnapshot) {
  const squares = new Set<string>();
  if (!game.pieces.length || game.pieces.length > 32) return null;
  const pieces: (typeof CHESS_PIECES)[number][] = [];
  for (const piece of game.pieces) {
    if (
      !/^[a-h][1-8]$/.test(piece.square) ||
      squares.has(piece.square) ||
      !Object.hasOwn(PIECE_KINDS, piece.type) ||
      !['w', 'b'].includes(piece.color)
    )
      return null;
    squares.add(piece.square);
    const file = piece.square.charCodeAt(0) - 97;
    const rank = Number(piece.square[1]) - 1;
    pieces.push({
      side: piece.color === 'w' ? 'silver' : 'obsidian',
      kind: PIECE_KINDS[piece.type],
      file,
      rank,
      x: (file - 3.5) * CHESS_DIMENSIONS.square,
      z: (3.5 - rank) * CHESS_DIMENSIONS.square,
    });
  }
  return pieces;
}

function combine(parts: THREE.BufferGeometry[]) {
  const nonIndexed = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const combined = mergeGeometries(nonIndexed)!;
  new Set([...parts, ...nonIndexed]).forEach((part) => part.dispose());
  return combined;
}

function lathe(points: [number, number][]) {
  return new THREE.LatheGeometry(
    points.map(([radius, y]) => new THREE.Vector2(radius, y)),
    16,
  );
}

function pieceGeometry(kind: ChessPieceKind) {
  const shoulder = { pawn: 2.6, rook: 3.3, knight: 2.55, bishop: 3.35, queen: 3.9, king: 4.05 }[kind];
  const body: THREE.BufferGeometry[] = [
    lathe([
      [0, 0],
      [0.86, 0],
      [0.92, 0.12],
      [0.92, 0.35],
      [0.8, 0.52],
      [0.67, 0.65],
      [0.65, 0.84],
      [0.49, 1.05],
      [0.35, shoulder - 0.5],
      [0.57, shoulder - 0.2],
      [0.6, shoulder],
      [0, shoulder],
    ]),
  ];
  const trim: THREE.BufferGeometry[] = [
    new THREE.TorusGeometry(0.79, 0.055, 5, 20).rotateX(Math.PI / 2).translate(0, 0.53, 0),
    new THREE.TorusGeometry(0.6, 0.065, 5, 20).rotateX(Math.PI / 2).translate(0, shoulder - 0.12, 0),
  ];
  if (kind === 'pawn') {
    body.push(new THREE.IcosahedronGeometry(0.72, 1).translate(0, 3.34, 0));
    trim.push(new THREE.CylinderGeometry(0.53, 0.65, 0.17, 16).translate(0, 2.73, 0));
  } else if (kind === 'rook') {
    body.push(new THREE.CylinderGeometry(0.83, 0.65, 0.95, 12).translate(0, 3.8, 0));
    for (let index = 0; index < 6; index++) {
      const angle = (index * Math.PI) / 3;
      body.push(
        new THREE.BoxGeometry(0.46, 0.65, 0.46)
          .rotateY(angle)
          .translate(Math.sin(angle) * 0.61, 4.5, Math.cos(angle) * 0.61),
      );
    }
    trim.push(new THREE.TorusGeometry(0.8, 0.07, 5, 24).rotateX(Math.PI / 2).translate(0, 4.17, 0));
  } else if (kind === 'knight') {
    // Original angular horse profile; a deep extrusion makes the silhouette legible from every side.
    const profile = new THREE.Shape();
    const points = [
      [-0.62, 2.45],
      [-0.75, 3.3],
      [-0.4, 4.65],
      [0, 5.25],
      [0.28, 5.55],
      [0.44, 5.15],
      [1.04, 4.43],
      [1.11, 3.92],
      [0.48, 3.96],
      [0.33, 3.47],
      [0.35, 2.45],
    ];
    points.forEach(([z, y], index) => (index ? profile.lineTo(-z, y) : profile.moveTo(-z, y)));
    profile.closePath();
    body.push(
      new THREE.ExtrudeGeometry(profile, {
        depth: 0.78,
        bevelEnabled: true,
        bevelThickness: 0.035,
        bevelSize: 0.035,
        bevelSegments: 1,
        curveSegments: 1,
      })
        .rotateY(Math.PI / 2)
        .translate(-0.39, 0, 0),
    );
    for (const x of [-0.42, 0.42]) trim.push(new THREE.IcosahedronGeometry(0.09, 0).translate(x, 4.42, 0.65));
    trim.push(new THREE.BoxGeometry(0.09, 1.5, 0.22).rotateX(-0.26).translate(0, 4.05, -0.63));
  } else if (kind === 'bishop') {
    body.push(
      lathe([
        [0, 3.4],
        [0.48, 3.5],
        [0.74, 4.2],
        [0.63, 4.9],
        [0, 5.7],
      ]),
    );
    trim.push(new THREE.BoxGeometry(0.14, 1.1, 0.12).rotateZ(-0.48).translate(0.12, 4.67, 0.61));
    trim.push(new THREE.IcosahedronGeometry(0.16, 0).translate(0, 5.7, 0));
  } else if (kind === 'queen') {
    body.push(new THREE.CylinderGeometry(0.82, 0.55, 0.8, 12).translate(0, 4.36, 0));
    for (let index = 0; index < 7; index++) {
      const angle = (index * Math.PI * 2) / 7;
      const x = Math.sin(angle) * 0.67;
      const z = Math.cos(angle) * 0.67;
      body.push(new THREE.ConeGeometry(0.18, 0.87, 4).translate(x, 5.1, z));
      trim.push(new THREE.IcosahedronGeometry(0.13, 0).translate(x, 5.55, z));
    }
    trim.push(new THREE.IcosahedronGeometry(0.27, 1).translate(0, 5.96, 0));
  } else {
    body.push(new THREE.CylinderGeometry(0.73, 0.55, 0.7, 12).translate(0, 4.4, 0));
    body.push(new THREE.ConeGeometry(0.63, 0.72, 8).translate(0, 5.1, 0));
    trim.push(new THREE.BoxGeometry(0.28, 1.25, 0.3).translate(0, 5.98, 0));
    trim.push(new THREE.BoxGeometry(1.02, 0.27, 0.3).translate(0, 6.15, 0));
  }
  return { body: combine(body), trim: combine(trim) };
}

/** Reused sculptural pieces can replay the owner's saved position without rebuilding the island. */
export function createChess(
  scene: THREE.Scene,
  anchor: readonly [number, number],
  obstacle?: (x: number, z: number, radius: number) => void,
) {
  const group = new THREE.Group();
  group.name = 'Giant chessboard';
  group.position.set(anchor[0], 0, anchor[1]);
  scene.add(group);
  const stone = new THREE.MeshStandardMaterial({ color: '#25252D', roughness: 0.55, metalness: 0.25 });
  mesh(group, new THREE.BoxGeometry(28, 0.65, 28), stone, [0, -0.295, 0]);
  const tiles: THREE.BufferGeometry[][] = [[], []];
  for (let rank = 0; rank < 8; rank++)
    for (let file = 0; file < 8; file++) {
      tiles[(rank + file) % 2].push(
        new THREE.BoxGeometry(3.18, 0.065, 3.18).translate((file - 3.5) * 3.2, 0.045, (3.5 - rank) * 3.2),
      );
    }
  ['#0D0D15', '#727B8A'].forEach((color, index) =>
    mesh(group, combine(tiles[index]), new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.2 })),
  );
  const silver = new THREE.MeshStandardMaterial({
    color: '#BEC9D8',
    roughness: 0.26,
    metalness: 0.55,
    flatShading: true,
  });
  const obsidian = new THREE.MeshStandardMaterial({
    color: '#171721',
    roughness: 0.24,
    metalness: 0.58,
    flatShading: true,
  });
  const silverTrim = new THREE.MeshStandardMaterial({
    color: '#E4E9FF',
    emissive: '#617590',
    emissiveIntensity: 0.13,
    metalness: 0.5,
    roughness: 0.25,
  });
  const goldTrim = new THREE.MeshStandardMaterial({
    color: '#C4AD6A',
    emissive: '#766D2C',
    emissiveIntensity: 0.13,
    metalness: 0.62,
    roughness: 0.25,
  });
  const geometries = new Map(
    [...new Set(CHESS_PIECES.map((piece) => piece.kind))].map((kind) => [kind, pieceGeometry(kind)]),
  );
  const pieces: THREE.Group[] = [];
  for (const descriptor of CHESS_PIECES) {
    const piece = new THREE.Group();
    piece.name = `${descriptor.side} ${descriptor.kind}`;
    piece.userData.chessPiece = descriptor;
    piece.position.set(descriptor.x, 0.08, descriptor.z);
    piece.rotation.y = descriptor.side === 'silver' ? Math.PI : 0;
    const geometry = geometries.get(descriptor.kind)!;
    mesh(piece, geometry.body, descriptor.side === 'silver' ? silver : obsidian);
    mesh(piece, geometry.trim, descriptor.side === 'silver' ? silverTrim : goldTrim);
    group.add(piece);
    pieces.push(piece);
  }
  const brackets: THREE.BufferGeometry[] = [];
  for (const x of [-13.45, 13.45])
    for (const z of [-13.45, 13.45]) {
      brackets.push(new THREE.BoxGeometry(0.32, 0.15, 0.85).translate(x, 0.08, z));
      brackets.push(new THREE.BoxGeometry(0.85, 0.15, 0.32).translate(x, 0.08, z));
    }
  mesh(group, combine(brackets), goldTrim);
  const entrance = new THREE.Group();
  entrance.name = 'Chessboard entrance';
  entrance.position.z = CHESS_DIMENSIONS.entranceZ;
  group.add(entrance);
  label(group, 'SILVER', [0, 0.2, 13.25], 3.5, '#D2DCEF');
  label(group, 'OBSIDIAN', [0, 0.2, -13.25], 3.5, '#C4AD6A');
  const match = label(group, '', [0, 4.8, 15.2], 14);
  match.name = 'Saved Chessky opponents';
  match.scale.y = 3.5;
  match.material.depthTest = true;
  match.visible = false;
  const matchTexture = match.material.map!;
  const matchCanvas = matchTexture.image as HTMLCanvasElement;
  matchCanvas.height = 180;
  const matchContext = matchCanvas.getContext('2d');
  const obstacles = chessCollisionObstacles(anchor);
  obstacles.forEach(({ x, z, radius }) => obstacle?.(x, z, radius));

  return {
    group,
    entrance,
    // These same objects remain in the scene's static obstacle prefix; captured pieces disable their slot.
    obstacles,
    setGame(game: ChesskySnapshot | null) {
      const descriptors = game ? savedPieces(game) : CHESS_PIECES;
      const accepted = game && descriptors ? game : null;
      const position = descriptors ?? CHESS_PIECES;
      pieces.forEach((piece, index) => {
        const descriptor = position[index];
        piece.visible = !!descriptor;
        obstacles[index].enabled = !!descriptor;
        if (!descriptor) return;
        piece.name = `${descriptor.side} ${descriptor.kind}`;
        piece.userData.chessPiece = descriptor;
        piece.position.set(descriptor.x, 0.08, descriptor.z);
        piece.rotation.y = descriptor.side === 'silver' ? Math.PI : 0;
        const geometry = geometries.get(descriptor.kind)!;
        const body = piece.children[0] as THREE.Mesh;
        const trim = piece.children[1] as THREE.Mesh;
        body.geometry = geometry.body;
        trim.geometry = geometry.trim;
        body.material = descriptor.side === 'silver' ? silver : obsidian;
        trim.material = descriptor.side === 'silver' ? silverTrim : goldTrim;
        Object.assign(obstacles[index], { x: anchor[0] + descriptor.x, z: anchor[1] + descriptor.z });
      });
      match.visible = !!accepted;
      if (accepted && matchContext) {
        matchContext.clearRect(0, 0, 640, 180);
        matchContext.fillStyle = '#101016';
        matchContext.beginPath();
        matchContext.roundRect(4, 4, 632, 172, 18);
        matchContext.fill();
        matchContext.textAlign = 'center';
        matchContext.textBaseline = 'middle';
        matchContext.font = '600 32px sans-serif';
        const name = (value: string) => value.slice(0, 48).replace(/[\p{Cc}\p{Cf}]/gu, ' ');
        matchContext.fillStyle = '#E4E9FF';
        matchContext.fillText(`White · ${name(accepted.white.name)}`, 320, 44, 600);
        matchContext.fillStyle = '#9D9DA8';
        matchContext.font = '500 24px sans-serif';
        matchContext.fillText('versus', 320, 90, 600);
        matchContext.fillStyle = '#C4AD6A';
        matchContext.font = '600 32px sans-serif';
        matchContext.fillText(`Black · ${name(accepted.black.name)}`, 320, 138, 600);
        matchTexture.needsUpdate = true;
      }
    },
    dispose() {
      // Promotions can leave a shared shape unused by every mesh; release those shapes too.
      const attached = new Set<THREE.BufferGeometry>();
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) attached.add(object.geometry);
      });
      disposeObject(group);
      geometries.forEach(({ body, trim }) => {
        for (const geometry of [body, trim]) if (!attached.has(geometry)) geometry.dispose();
      });
    },
  };
}

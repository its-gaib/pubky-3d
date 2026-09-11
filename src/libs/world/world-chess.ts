import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ChesskySnapshot } from '@/libs/chessky/chessky.types';
import { disposeObject, label, mesh } from '@/libs/world/world-geometry';
import { landmarkAnnulus } from '@/libs/world/world-landmark-details';
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
  nonIndexed.forEach((part) => {
    if (!part.hasAttribute('color'))
      part.setAttribute(
        'color',
        new THREE.BufferAttribute(new Float32Array(part.getAttribute('position').count * 3).fill(1), 3),
      );
  });
  const combined = mergeGeometries(nonIndexed)!;
  new Set([...parts, ...nonIndexed]).forEach((part) => part.dispose());
  return combined;
}

function lathe(points: [number, number][]) {
  return new THREE.LatheGeometry(
    points.map(([radius, y]) => new THREE.Vector2(radius, y)),
    40,
  );
}

function shaded(geometry: THREE.BufferGeometry, color: string) {
  const tint = new THREE.Color(color);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let vertex = 0; vertex < colors.length; vertex += 3) tint.toArray(colors, vertex);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function bead(radius: number, tube: number, y: number) {
  return new THREE.TorusGeometry(radius, tube, 6, 48).rotateX(Math.PI / 2).translate(0, y, 0);
}

function pieceGeometry(kind: ChessPieceKind) {
  const shoulder = { pawn: 2.6, rook: 3.3, knight: 2.55, bishop: 3.35, queen: 3.9, king: 4.05 }[kind];
  const body: THREE.BufferGeometry[] = [
    lathe([
      [0, 0],
      [0.79, 0],
      [0.86, 0.035],
      [0.911, 0.095],
      [0.92, 0.16],
      [0.914, 0.22],
      [0.865, 0.26],
      [0.855, 0.38],
      [0.83, 0.44],
      [0.75, 0.51],
      [0.716, 0.57],
      [0.688, 0.7],
      [0.645, 0.78],
      [0.632, 0.84],
      [0.55, 0.91],
      [0.49, 1.08],
      [0.435, 1.26],
      [0.385, shoulder - 1],
      [0.33, shoulder - 0.62],
      [0.365, shoulder - 0.4],
      [0.43, shoulder - 0.3],
      [0.56, shoulder - 0.21],
      [0.62, shoulder - 0.11],
      [0.62, shoulder - 0.01],
      [0.58, shoulder + 0.07],
      [0, shoulder + 0.07],
    ]),
  ];
  const trim: THREE.BufferGeometry[] = [
    bead(0.89, 0.018, 0.2),
    bead(0.753, 0.035, 0.51),
    bead(0.615, 0.035, shoulder - 0.08),
  ];
  if (kind === 'pawn') {
    body.push(new THREE.SphereGeometry(0.72, 32, 20).translate(0, 3.34, 0));
    trim.push(
      lathe([
        [0.44, 2.66],
        [0.55, 2.68],
        [0.59, 2.73],
        [0.54, 2.79],
        [0.43, 2.8],
      ]),
    );
  } else if (kind === 'rook') {
    body.push(
      lathe([
        [0, 3.31],
        [0.6, 3.31],
        [0.68, 3.42],
        [0.81, 3.64],
        [0.85, 4.14],
        [0.85, 4.26],
        [0.59, 4.26],
        [0.59, 3.92],
        [0, 3.92],
      ]),
    );
    for (let tower = 0; tower < 6; tower++) {
      body.push(
        landmarkAnnulus(0.595, 0.875, 0.56, (tower * Math.PI) / 3 + 0.15, Math.PI / 3 - 0.3, 0.022).translate(
          0,
          4.25,
          0,
        ),
      );
    }
    trim.push(bead(0.82, 0.035, 4.12), bead(0.754, 0.025, 3.58));
  } else if (kind === 'knight') {
    // A curved, beveled horse profile, with sculpted cheeks and two separate ears.
    const profile = new THREE.Shape();
    profile.moveTo(0.62, 2.47);
    profile.quadraticCurveTo(0.83, 3.04, 0.68, 3.8);
    profile.bezierCurveTo(0.61, 4.46, 0.43, 4.87, 0.05, 5.12);
    profile.quadraticCurveTo(-0.11, 5.24, -0.3, 5.12);
    profile.quadraticCurveTo(-0.55, 4.94, -0.83, 4.65);
    profile.quadraticCurveTo(-1.15, 4.46, -1.17, 4.22);
    profile.quadraticCurveTo(-1.11, 4.04, -0.93, 4.02);
    profile.lineTo(-0.42, 4.05);
    profile.quadraticCurveTo(-0.18, 3.92, -0.25, 3.61);
    profile.quadraticCurveTo(-0.51, 3.05, -0.44, 2.47);
    profile.closePath();
    body.push(
      new THREE.ExtrudeGeometry(profile, {
        depth: 0.65,
        bevelEnabled: true,
        bevelThickness: 0.105,
        bevelSize: 0.075,
        bevelSegments: 3,
        curveSegments: 7,
      })
        .rotateY(Math.PI / 2)
        .translate(-0.325, 0, 0),
    );
    for (const side of [-1, 1]) {
      body.push(
        new THREE.ConeGeometry(0.15, 0.68, 16)
          .scale(0.66, 1, 1)
          .rotateX(-0.12)
          .translate(side * 0.235, 5.3, -0.04),
      );
      body.push(new THREE.SphereGeometry(1, 20, 14).scale(0.083, 0.33, 0.37).translate(side * 0.405, 4.03, 0.26));
      body.push(
        shaded(
          new THREE.SphereGeometry(1, 12, 10).scale(0.038, 0.067, 0.055).translate(side * 0.434, 4.72, 0.48),
          '#1D2830',
        ),
      );
      body.push(
        shaded(
          new THREE.SphereGeometry(1, 12, 8).scale(0.03, 0.035, 0.065).translate(side * 0.43, 4.27, 1.02),
          '#253139',
        ),
      );
      const bridle = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.441, 4.76, 0.21),
        new THREE.Vector3(side * 0.446, 4.4, 0.64),
        new THREE.Vector3(side * 0.431, 4.17, 0.98),
      ]);
      trim.push(new THREE.TubeGeometry(bridle, 12, 0.024, 6, false));
      const mouth = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.432, 4.075, 0.77),
        new THREE.Vector3(side * 0.432, 4.09, 0.96),
        new THREE.Vector3(side * 0.43, 4.145, 1.13),
      ]);
      body.push(shaded(new THREE.TubeGeometry(mouth, 10, 0.015, 5, false), '#35424B'));
    }
    for (let ridge = 0; ridge < 7; ridge++) {
      const y = 3.33 + ridge * 0.21;
      const z = -0.733 + Math.max(0, ridge - 2) * 0.052;
      trim.push(new RoundedBoxGeometry(0.54, 0.085, 0.19, 1, 0.025).rotateX(-0.25).translate(0, y, z));
    }
  } else if (kind === 'bishop') {
    body.push(
      lathe([
        [0, 3.39],
        [0.36, 3.46],
        [0.53, 3.67],
        [0.66, 4.03],
        [0.67, 4.3],
        [0.6, 4.65],
        [0.43, 5.06],
        [0.13, 5.52],
        [0, 5.65],
      ]),
    );
    for (const side of [-1, 1]) {
      const incision = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.3, 4.6, side * 0.531),
        new THREE.Vector3(0.01, 4.98, side * 0.461),
        new THREE.Vector3(0.17, 5.17, side * 0.306),
      ]);
      body.push(shaded(new THREE.TubeGeometry(incision, 16, 0.048, 6, false), '#202C37'));
    }
    trim.push(new THREE.SphereGeometry(0.15, 20, 12).translate(0, 5.68, 0), bead(0.427, 0.025, 3.54));
  } else if (kind === 'queen') {
    body.push(
      lathe([
        [0.5, 3.94],
        [0.57, 4.06],
        [0.72, 4.48],
        [0.79, 4.65],
        [0.65, 4.65],
        [0.5, 4.15],
      ]),
    );
    for (let prong = 0; prong < 7; prong++) {
      const angle = (prong * Math.PI * 2) / 7;
      const petal = new THREE.Shape();
      petal.moveTo(-0.145, 4.52);
      petal.quadraticCurveTo(-0.18, 4.97, -0.1, 5.34);
      petal.lineTo(0, 5.55);
      petal.lineTo(0.1, 5.34);
      petal.quadraticCurveTo(0.18, 4.97, 0.145, 4.52);
      petal.closePath();
      body.push(
        new THREE.ExtrudeGeometry(petal, {
          depth: 0.15,
          bevelEnabled: true,
          bevelSize: 0.023,
          bevelThickness: 0.023,
          bevelSegments: 2,
          curveSegments: 5,
        })
          .translate(0, 0, 0.565)
          .rotateY(angle),
      );
      trim.push(new THREE.SphereGeometry(0.12, 16, 12).translate(Math.sin(angle) * 0.64, 5.52, Math.cos(angle) * 0.64));
    }
    body.push(new THREE.CylinderGeometry(0.08, 0.13, 0.94, 20).translate(0, 5.3, 0));
    trim.push(bead(0.775, 0.032, 4.64), new THREE.SphereGeometry(0.27, 24, 16).translate(0, 5.96, 0));
  } else {
    body.push(
      lathe([
        [0.55, 4.05],
        [0.68, 4.2],
        [0.76, 4.47],
        [0.71, 4.67],
        [0.51, 4.87],
        [0.31, 5.05],
        [0.24, 5.32],
        [0.22, 5.38],
        [0, 5.38],
      ]),
    );
    trim.push(bead(0.723, 0.035, 4.58), bead(0.288, 0.03, 5.13));
    trim.push(new RoundedBoxGeometry(0.28, 1.25, 0.3, 2, 0.045).translate(0, 5.98, 0));
    trim.push(new RoundedBoxGeometry(1.02, 0.27, 0.3, 2, 0.045).translate(0, 6.15, 0));
    body.push(shaded(new THREE.SphereGeometry(0.068, 16, 10).scale(1, 1, 0.45).translate(0, 6.15, 0.159), '#2D3E47'));
  }
  return { body: combine(body), trim: combine(trim) };
}

/** Small engraved coordinate strokes remain sharp without another texture or draw. */
function coordinateGeometry(character: string) {
  const glyphs: Record<string, number[][][]> = {
    A: [
      [
        [0, 0],
        [0.5, 1],
        [1, 0],
      ],
      [
        [0.22, 0.43],
        [0.78, 0.43],
      ],
    ],
    B: [
      [
        [0, 0],
        [0, 1],
        [0.67, 1],
        [1, 0.83],
        [1, 0.67],
        [0.67, 0.5],
        [0, 0.5],
      ],
      [
        [0.67, 0.5],
        [1, 0.33],
        [1, 0.17],
        [0.67, 0],
        [0, 0],
      ],
    ],
    C: [
      [
        [1, 0.84],
        [0.75, 1],
        [0.25, 1],
        [0, 0.75],
        [0, 0.25],
        [0.25, 0],
        [0.75, 0],
        [1, 0.16],
      ],
    ],
    D: [
      [
        [0, 0],
        [0, 1],
        [0.64, 1],
        [1, 0.75],
        [1, 0.25],
        [0.64, 0],
        [0, 0],
      ],
    ],
    E: [
      [
        [1, 1],
        [0, 1],
        [0, 0],
        [1, 0],
      ],
      [
        [0, 0.5],
        [0.82, 0.5],
      ],
    ],
    F: [
      [
        [1, 1],
        [0, 1],
        [0, 0],
      ],
      [
        [0, 0.5],
        [0.82, 0.5],
      ],
    ],
    G: [
      [
        [1, 0.84],
        [0.75, 1],
        [0.25, 1],
        [0, 0.75],
        [0, 0.25],
        [0.25, 0],
        [1, 0],
        [1, 0.45],
        [0.55, 0.45],
      ],
    ],
    H: [
      [
        [0, 0],
        [0, 1],
      ],
      [
        [1, 0],
        [1, 1],
      ],
      [
        [0, 0.5],
        [1, 0.5],
      ],
    ],
    '1': [
      [
        [0.12, 0.72],
        [0.5, 1],
        [0.5, 0],
      ],
      [
        [0.1, 0],
        [0.9, 0],
      ],
    ],
    '2': [
      [
        [0, 0.8],
        [0.25, 1],
        [0.75, 1],
        [1, 0.8],
        [1, 0.64],
        [0, 0],
        [1, 0],
      ],
    ],
    '3': [
      [
        [0, 0.87],
        [0.2, 1],
        [0.77, 1],
        [1, 0.78],
        [0.7, 0.5],
        [0.25, 0.5],
      ],
      [
        [0.7, 0.5],
        [1, 0.26],
        [0.77, 0],
        [0.2, 0],
        [0, 0.13],
      ],
    ],
    '4': [
      [
        [0.8, 0],
        [0.8, 1],
        [0, 0.32],
        [1, 0.32],
      ],
    ],
    '5': [
      [
        [1, 1],
        [0, 1],
        [0, 0.53],
        [0.72, 0.53],
        [1, 0.34],
        [1, 0.2],
        [0.75, 0],
        [0.2, 0],
        [0, 0.15],
      ],
    ],
    '6': [
      [
        [0.92, 0.9],
        [0.68, 1],
        [0.22, 1],
        [0, 0.73],
        [0, 0.22],
        [0.23, 0],
        [0.76, 0],
        [1, 0.22],
        [1, 0.4],
        [0.75, 0.6],
        [0, 0.6],
      ],
    ],
    '7': [
      [
        [0, 1],
        [1, 1],
        [0.25, 0],
      ],
    ],
    '8': [
      [
        [0.23, 0.5],
        [0, 0.73],
        [0.22, 1],
        [0.78, 1],
        [1, 0.73],
        [0.77, 0.5],
        [0.23, 0.5],
        [0, 0.24],
        [0.22, 0],
        [0.78, 0],
        [1, 0.24],
        [0.77, 0.5],
      ],
    ],
  };
  const strokes: THREE.BufferGeometry[] = [];
  for (const path of glyphs[character]) {
    for (let point = 1; point < path.length; point++) {
      const from = path[point - 1];
      const to = path[point];
      const dx = (to[0] - from[0]) * 0.3;
      const dz = (from[1] - to[1]) * 0.44;
      strokes.push(
        new THREE.BoxGeometry(Math.hypot(dx, dz), 0.016, 0.026)
          .rotateY(-Math.atan2(dz, dx))
          .translate(((from[0] + to[0]) / 2 - 0.5) * 0.3, 0.044, (0.5 - (from[1] + to[1]) / 2) * 0.44),
      );
    }
  }
  return combine(strokes);
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
  mesh(group, new RoundedBoxGeometry(28, 0.65, 28, 2, 0.1), stone, [0, -0.295, 0]).name = 'chess-board-foundation';
  const tiles: THREE.BufferGeometry[][] = [[], []];
  for (let rank = 0; rank < 8; rank++)
    for (let file = 0; file < 8; file++) {
      tiles[(rank + file) % 2].push(
        new RoundedBoxGeometry(3.18, 0.065, 3.18, 1, 0.018).translate((file - 3.5) * 3.2, 0.045, (3.5 - rank) * 3.2),
      );
    }
  ['#111B24', '#788693'].forEach((color, index) => {
    mesh(
      group,
      combine(tiles[index]),
      new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.2 }),
    ).name = `chess-board-${index ? 'light' : 'dark'}-squares`;
  });
  const silver = new THREE.MeshStandardMaterial({
    color: '#CCD4DF',
    roughness: 0.26,
    metalness: 0.55,
    vertexColors: true,
  });
  const obsidian = new THREE.MeshStandardMaterial({
    color: '#1C2631',
    roughness: 0.29,
    metalness: 0.62,
    vertexColors: true,
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
    group.add(piece);
    pieces.push(piece);
  }
  // A 32-slot capacity per kind also covers a saved board with many promotions.
  // Logical piece groups retain their names/positions; visible forms share draws.
  const batches = new Map<string, { body: THREE.InstancedMesh; trim: THREE.InstancedMesh; count: number }>();
  for (const side of ['silver', 'obsidian'] as const) {
    for (const [kind, geometry] of geometries) {
      const body = new THREE.InstancedMesh(geometry.body, side === 'silver' ? silver : obsidian, 32);
      const trim = new THREE.InstancedMesh(geometry.trim, side === 'silver' ? silverTrim : goldTrim, 32);
      for (const [surface, object] of [
        ['body', body],
        ['trim', trim],
      ] as const) {
        object.name = `chess-${side}-${kind}-${surface}`;
        object.userData.chessBatch = { side, kind, surface };
        object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        object.count = 0;
        object.visible = false;
        object.castShadow = true;
        object.receiveShadow = true;
        group.add(object);
      }
      batches.set(`${side}:${kind}`, { body, trim, count: 0 });
    }
  }
  const brackets: THREE.BufferGeometry[] = [];
  for (const x of [-13.45, 13.45])
    for (const z of [-13.45, 13.45]) {
      brackets.push(new RoundedBoxGeometry(0.32, 0.15, 0.85, 1, 0.025).translate(x, 0.08, z));
      brackets.push(new RoundedBoxGeometry(0.85, 0.15, 0.32, 1, 0.025).translate(x, 0.08, z));
    }
  for (const side of [-1, 1]) {
    for (const edge of [12.89, 13.86]) {
      brackets.push(new THREE.BoxGeometry(0.025, 0.021, edge * 2).translate(side * edge, 0.044, 0));
      brackets.push(new THREE.BoxGeometry(edge * 2, 0.021, 0.025).translate(0, 0.044, side * edge));
    }
    for (let coordinate = 0; coordinate < 8; coordinate++) {
      const offset = (coordinate - 3.5) * CHESS_DIMENSIONS.square;
      brackets.push(
        coordinateGeometry('ABCDEFGH'[coordinate])
          .rotateY(side < 0 ? Math.PI : 0)
          .translate(offset, 0, side * 13.36),
      );
      brackets.push(
        coordinateGeometry(String(coordinate + 1))
          .rotateY((side * Math.PI) / 2)
          .translate(side * 13.36, 0, -offset),
      );
    }
  }
  mesh(group, combine(brackets), goldTrim).name = 'chess-board-inlays-and-coordinates';
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

  function renderPosition(position: (typeof CHESS_PIECES)[number][]) {
    batches.forEach((batch) => {
      batch.count = 0;
    });
    pieces.forEach((piece, index) => {
      const descriptor = position[index];
      piece.visible = !!descriptor;
      obstacles[index].enabled = !!descriptor;
      if (!descriptor) return;
      piece.name = `${descriptor.side} ${descriptor.kind}`;
      piece.userData.chessPiece = descriptor;
      piece.position.set(descriptor.x, 0.08, descriptor.z);
      piece.rotation.y = descriptor.side === 'silver' ? Math.PI : 0;
      piece.updateMatrix();
      const batch = batches.get(`${descriptor.side}:${descriptor.kind}`)!;
      piece.userData.chessInstance = batch.count;
      batch.body.setMatrixAt(batch.count, piece.matrix);
      batch.trim.setMatrixAt(batch.count, piece.matrix);
      batch.count++;
      Object.assign(obstacles[index], { x: anchor[0] + descriptor.x, z: anchor[1] + descriptor.z });
    });
    batches.forEach((batch) => {
      for (const object of [batch.body, batch.trim]) {
        object.count = batch.count;
        object.visible = batch.count > 0;
        object.instanceMatrix.needsUpdate = true;
        if (batch.count) {
          object.computeBoundingSphere();
          object.computeBoundingBox();
        }
      }
    });
  }
  renderPosition(CHESS_PIECES);

  return {
    group,
    entrance,
    // These same objects remain in the scene's static obstacle prefix; captured pieces disable their slot.
    obstacles,
    setGame(game: ChesskySnapshot | null) {
      const descriptors = game ? savedPieces(game) : CHESS_PIECES;
      const accepted = game && descriptors ? game : null;
      const position = descriptors ?? CHESS_PIECES;
      renderPosition(position);
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
      batches.forEach(({ body, trim }) => {
        body.dispose();
        trim.dispose();
      });
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

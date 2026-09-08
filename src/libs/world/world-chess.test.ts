import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChesskySnapshot } from '@/libs/chessky/chessky.types';
import { CHESS_DIMENSIONS, CHESS_PIECES, chessCollisionObstacles, createChess } from '@/libs/world/world-chess';
import { disposeObject } from '@/libs/world/world-geometry';
import { resolvePosition } from '@/libs/world/world-motion';
import { asOpaque } from '@/test-utils/type-assertions';

describe('giant chessboard', () => {
  afterEach(() => vi.restoreAllMocks());

  const savedGame: ChesskySnapshot = {
    id: 'saved-game',
    updatedAt: '2026-09-08T12:00:00.000Z',
    white: { id: 'y'.repeat(52), name: 'Avery' },
    black: { id: 'b'.repeat(52), name: 'Bo' },
    result: '*',
    pieces: [
      { square: 'e1', type: 'k', color: 'w' },
      { square: 'e8', type: 'k', color: 'b' },
      { square: 'e4', type: 'p', color: 'w' },
    ],
  };

  it('moves meshes and stable collision slots together, including captures, promotions and logout', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const scene = new THREE.Scene();
    const chess = createChess(scene, [0, 0]);
    const slots = [...chess.obstacles];
    chess.setGame(savedGame);
    const activePieces = () => chess.group.children.filter((child) => child.visible && child.userData.chessPiece);
    expect(activePieces()).toHaveLength(3);
    expect(chess.obstacles.filter((item) => item.enabled)).toHaveLength(3);
    chess.obstacles.forEach((item, index) => expect(item).toBe(slots[index]));
    // The pawn has left e2 for e4, so its old square is walkable and the new one is solid.
    expect(resolvePosition(1.6, 8, chess.obstacles)).toEqual({ x: 1.6, z: 8 });
    expect(resolvePosition(1.6, 1.6, chess.obstacles)).not.toEqual({ x: 1.6, z: 1.6 });
    expect(chess.group.getObjectByName('Saved Chessky opponents')?.visible).toBe(true);

    chess.setGame({
      ...savedGame,
      pieces: [...savedGame.pieces.slice(0, 2), { square: 'a8', type: 'q', color: 'w' }],
    });
    const promoted = activePieces().find((piece) => piece.userData.chessPiece.kind === 'queen')!;
    expect(promoted.name).toBe('silver queen');
    expect(promoted.position.x).toBeCloseTo(-11.2);
    expect(promoted.position.z).toBeCloseTo(-11.2);
    expect(resolvePosition(1.6, 1.6, chess.obstacles)).toEqual({ x: 1.6, z: 1.6 });
    expect(resolvePosition(-11.2, -11.2, chess.obstacles)).not.toEqual({ x: -11.2, z: -11.2 });

    chess.setGame(null);
    expect(activePieces()).toHaveLength(32);
    expect(chess.obstacles.filter((item) => item.enabled)).toHaveLength(32);
    expect(chess.group.getObjectByName('Saved Chessky opponents')?.visible).toBe(false);
    expect(resolvePosition(1.6, 8, chess.obstacles)).not.toEqual({ x: 1.6, z: 8 });
    chess.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('renders the opponents as bounded plain canvas text and rejects malformed board coordinates', () => {
    const context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      textAlign: '',
      textBaseline: '',
      font: '',
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(asOpaque<CanvasRenderingContext2D>(context));
    const scene = new THREE.Scene();
    const chess = createChess(scene, [0, 0]);
    chess.setGame(savedGame);
    expect(context.fillText).toHaveBeenCalledWith('Silver · Avery', 320, 44, 600);
    expect(context.fillText).toHaveBeenCalledWith('Obsidian · Bo', 320, 138, 600);
    chess.setGame({ ...savedGame, pieces: [{ square: '../a8', type: 'q', color: 'w' }] });
    expect(chess.group.getObjectByName('Saved Chessky opponents')?.visible).toBe(false);
    expect(chess.obstacles.filter((item) => item.enabled)).toHaveLength(32);
    chess.dispose();
  });

  it('places every piece of two complete armies on a unique legal starting square', () => {
    expect(CHESS_PIECES).toHaveLength(32);
    expect(new Set(CHESS_PIECES.map(({ file, rank }) => `${file}:${rank}`)).size).toBe(32);
    for (const side of ['silver', 'obsidian']) {
      const army = CHESS_PIECES.filter((piece) => piece.side === side);
      const counts = Object.fromEntries(
        ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'].map((kind) => [
          kind,
          army.filter((piece) => piece.kind === kind).length,
        ]),
      );
      expect(counts).toEqual({ pawn: 8, rook: 2, knight: 2, bishop: 2, queen: 1, king: 1 });
      const queen = army.find((piece) => piece.kind === 'queen')!;
      expect((queen.file + queen.rank) % 2).toBe(side === 'silver' ? 1 : 0);
    }
  });

  it('blocks giant piece bases while leaving the middle and gaps between files walkable', () => {
    const obstacles = chessCollisionObstacles([0, 0]);
    for (let x = -13; x <= 13; x += 0.5)
      for (const z of [-5, 0, 5]) expect(resolvePosition(x, z, obstacles)).toEqual({ x, z });
    for (let file = 0; file < 7; file++) {
      const x = (file - 3) * CHESS_DIMENSIONS.square;
      for (const z of [-11.2, -8, 8, 11.2]) expect(resolvePosition(x, z, obstacles)).toEqual({ x, z });
    }
    for (const piece of CHESS_PIECES)
      expect(resolvePosition(piece.x, piece.z, obstacles)).not.toEqual({ x: piece.x, z: piece.z });
    expect(chessCollisionObstacles([40, -50])).toEqual(
      obstacles.map(({ x, z, radius }) => ({ x: x + 40, z: z - 50, radius })),
    );
  });

  it('builds genuinely towering sculptural pieces with shared geometry inside the reserved footprint', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const scene = new THREE.Scene();
    const obstacle = vi.fn();
    const chess = createChess(scene, [0, 0], obstacle);
    const pieces = chess.group.children.filter((child) => child.userData.chessPiece);
    expect(pieces).toHaveLength(32);
    for (const piece of pieces) {
      const height = new THREE.Box3().setFromObject(piece).getSize(new THREE.Vector3()).y;
      expect(height).toBeGreaterThan(3.9);
      if (piece.userData.chessPiece.kind === 'king') expect(height).toBeGreaterThan(6.5);
    }
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const footprint = new THREE.Box3();
    scene.updateMatrixWorld(true);
    chess.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((surface) =>
        materials.add(surface),
      );
      object.geometry.computeBoundingBox();
      footprint.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
    });
    expect(geometries.size).toBeLessThanOrEqual(16);
    expect(materials.size).toBeLessThanOrEqual(7);
    expect(footprint.min.x).toBeGreaterThanOrEqual(-CHESS_DIMENSIONS.halfExtent);
    expect(footprint.max.x).toBeLessThanOrEqual(CHESS_DIMENSIONS.halfExtent);
    expect(footprint.min.z).toBeGreaterThanOrEqual(-CHESS_DIMENSIONS.halfExtent);
    expect(footprint.max.z).toBeLessThanOrEqual(CHESS_DIMENSIONS.halfExtent);
    expect(chess.entrance.position.z).toBeGreaterThan(CHESS_DIMENSIONS.halfExtent);
    expect(obstacle).toHaveBeenCalledTimes(32);
    const releases = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    disposeObject(scene);
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
  });
});

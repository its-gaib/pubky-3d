import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChesskySnapshot } from '@/libs/chessky/chessky.types';
import { CHESS_DIMENSIONS, CHESS_PIECES, chessCollisionObstacles, createChess } from '@/libs/world/world-chess';
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
    const promotedBody = chess.group.getObjectByName('chess-silver-queen-body') as THREE.InstancedMesh;
    const promotedMatrix = new THREE.Matrix4();
    promotedBody.getMatrixAt(promoted.userData.chessInstance, promotedMatrix);
    expect(promotedBody.count).toBe(1);
    expect(new THREE.Vector3().setFromMatrixPosition(promotedMatrix).distanceTo(promoted.position)).toBeLessThan(
      0.00001,
    );
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
    expect(context.fillText).toHaveBeenCalledWith('White · Avery', 320, 44, 600);
    expect(context.fillText).toHaveBeenCalledWith('Black · Bo', 320, 138, 600);
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
      const descriptor = piece.userData.chessPiece;
      const bounds = new THREE.Box3();
      for (const surface of ['body', 'trim']) {
        const batch = chess.group.getObjectByName(
          `chess-${descriptor.side}-${descriptor.kind}-${surface}`,
        ) as THREE.InstancedMesh;
        batch.geometry.computeBoundingBox();
        bounds.union(batch.geometry.boundingBox!);
      }
      const height = bounds.getSize(new THREE.Vector3()).y;
      expect(height).toBeGreaterThan(3.9);
      if (piece.userData.chessPiece.kind === 'king') expect(height).toBeGreaterThan(6.5);
      expect(bounds.min.x).toBeGreaterThan(-CHESS_DIMENSIONS.square / 2);
      expect(bounds.max.x).toBeLessThan(CHESS_DIMENSIONS.square / 2);
      expect(bounds.min.z).toBeGreaterThan(-CHESS_DIMENSIONS.square / 2);
      expect(bounds.max.z).toBeLessThan(CHESS_DIMENSIONS.square / 2);
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
      if (object instanceof THREE.InstancedMesh) {
        object.computeBoundingBox();
        footprint.union(object.boundingBox!.clone().applyMatrix4(object.matrixWorld));
      } else footprint.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
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
    const instanceReleases = chess.group.children
      .filter((object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh)
      .map((object) => vi.spyOn(object, 'dispose'));
    chess.dispose();
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
    instanceReleases.forEach((release) => expect(release).toHaveBeenCalledOnce());
  });

  it('keeps square heights and supports a fully promoted saved army within fixed instance buffers', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const scene = new THREE.Scene();
    const chess = createChess(scene, [0, 0]);
    const batches = chess.group.children.filter(
      (object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh,
    );
    expect(batches).toHaveLength(24);
    expect(batches.reduce((total, batch) => total + batch.count, 0)).toBe(64);
    const attributes = batches.map((batch) => batch.instanceMatrix);
    const ray = new THREE.Raycaster(new THREE.Vector3(1.6, 1, 1.6), new THREE.Vector3(0, -1, 0));
    scene.updateMatrixWorld(true);
    const squares = chess.group.children.filter((object) => object.name.endsWith('-squares'));
    const top = ray.intersectObjects(squares, false)[0];
    expect(top.point.y).toBeCloseTo(0.0775, 5);
    chess.setGame({
      ...savedGame,
      pieces: Array.from({ length: 32 }, (_, index) => ({
        square: `${'abcdefgh'[index % 8]}${Math.floor(index / 8) + 1}`,
        type: 'q' as const,
        color: 'w' as const,
      })),
    });
    expect((chess.group.getObjectByName('chess-silver-queen-body') as THREE.InstancedMesh).count).toBe(32);
    expect(batches.reduce((total, batch) => total + batch.count, 0)).toBe(64);
    expect(chess.obstacles.filter((item) => item.enabled)).toHaveLength(32);
    chess.setGame(savedGame);
    expect(batches.reduce((total, batch) => total + batch.count, 0)).toBe(6);
    chess.setGame(null);
    expect(batches.map((batch) => batch.instanceMatrix)).toEqual(attributes);
    expect(batches.every((batch) => batch.instanceMatrix.count === 32)).toBe(true);
    expect(chess.group.children.filter((object) => object instanceof THREE.Mesh && object.visible)).toHaveLength(28);
    chess.dispose();
  });
});

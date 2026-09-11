import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHESS_DIMENSIONS, createChess } from '@/libs/world/world-chess';
import { disposeObject } from '@/libs/world/world-geometry';
import { SOCIAL_PLAZA_RADIUS } from '@/libs/world/world-social-layout';
import { createZoneGround } from './world-zone-ground';

/** Ignore the armies and labels so the ray checks the actual floor under every square. */
function floorMeshes(scene: THREE.Scene) {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    let ancestor: THREE.Object3D | null = object;
    while (ancestor) {
      if (ancestor.userData.chessPiece || ancestor.userData.chessBatch) return;
      ancestor = ancestor.parent;
    }
    meshes.push(object);
  });
  return meshes;
}

function floorAt(scene: THREE.Scene, x: number, z: number) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
  return ray.intersectObjects(floorMeshes(scene), false)[0];
}

describe('shared zone ground and landmark surfaces', () => {
  afterEach(() => vi.restoreAllMocks());

  it('leaves all 64 alternating chess tiles exposed when shared district ground is assembled', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const scene = new THREE.Scene();
    const anchor = [43, -36] as const;
    createChess(scene, anchor, vi.fn());
    scene.updateMatrixWorld(true);
    try {
      const squares = Array.from({ length: 64 }, (_, index) => {
        const rank = Math.floor(index / 8);
        const file = index % 8;
        const x = anchor[0] + (file - 3.5) * CHESS_DIMENSIONS.square;
        const z = anchor[1] + (3.5 - rank) * CHESS_DIMENSIONS.square;
        return { x, z, tile: floorAt(scene, x, z) };
      });
      // The baseline really sees the two checker materials, even beneath the armies.
      expect(new Set(squares.map((square) => square.tile.object)).size).toBe(2);
      for (const square of squares) expect(square.tile.point.y).toBeCloseTo(0.0775, 5);

      createZoneGround(scene, { id: 'chess', position: [anchor[0], anchor[1]] });
      scene.updateMatrixWorld(true);
      for (const square of squares) {
        const visible = floorAt(scene, square.x, square.z);
        expect(visible.point.y).toBeCloseTo(square.tile.point.y, 5);
        expect(visible.object).toBe(square.tile.object);
      }
    } finally {
      disposeObject(scene);
    }
  });

  it.each(['plaza', 'forest'] as const)('preserves the raised %s disk, including its edge, height and color', (id) => {
    const scene = new THREE.Scene();
    const radius = id === 'plaza' ? SOCIAL_PLAZA_RADIUS : 10;
    const ground = createZoneGround(scene, { id, position: [12, -9] })!;
    scene.updateMatrixWorld(true);
    try {
      expect(ground.position.toArray()).toEqual([12, 0.04, -9]);
      expect((ground.geometry as THREE.CylinderGeometry).parameters).toMatchObject({
        radiusTop: radius,
        radiusBottom: radius,
        height: 0.16,
        radialSegments: 48,
      });
      expect((ground.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(
        id === 'plaza' ? '3b3b42' : '2a2a30',
      );
      expect(floorAt(scene, 12, -9).point.y).toBeCloseTo(0.12);
      expect(floorAt(scene, 12 + radius - 0.5, -9).object).toBe(ground);
      expect(floorAt(scene, 12 + radius + 0.5, -9)).toBeUndefined();
    } finally {
      disposeObject(scene);
    }
  });
});

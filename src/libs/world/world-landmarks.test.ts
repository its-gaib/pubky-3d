import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disposeObject } from '@/libs/world/world-geometry';
import { createLandmarks } from '@/libs/world/world-landmarks';
import { WORLD_ANCHORS, WORLD_PORTALS } from '@/libs/world/world-layout';

function resources(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let meshes = 0;
  let triangles = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((surface) => materials.add(surface));
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
  });
  return { geometries, materials, meshes, triangles };
}

describe('crafted world landmarks', () => {
  const scenes: THREE.Scene[] = [];
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });
  afterEach(() => {
    scenes.splice(0).forEach(disposeObject);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function create() {
    const scene = new THREE.Scene();
    scenes.push(scene);
    const register = vi.fn();
    const obstacle = vi.fn();
    const landmarks = createLandmarks(scene, register, obstacle);
    return { scene, register, obstacle, landmarks };
  }

  it('preserves every landmark interaction and the existing collision footprints', () => {
    const { scene, register, obstacle, landmarks } = create();
    expect(register.mock.calls.map(([, interaction]) => interaction)).toEqual([
      { kind: 'zone', id: 'university' },
      { kind: 'zone', id: 'github' },
      { kind: 'zone', id: 'bitkit' },
      { kind: 'fun', id: 'duck' },
      { kind: 'fun', id: 'trampoline' },
      ...WORLD_PORTALS.map((_, index) => ({ kind: 'portal', index })),
    ]);
    for (const [object, interaction] of register.mock.calls) {
      if (interaction.kind === 'portal') continue;
      const anchor = WORLD_ANCHORS[interaction.id as keyof typeof WORLD_ANCHORS];
      expect(object.position.toArray()).toEqual([anchor[0], 0, anchor[1]]);
    }
    const [ux, uz] = WORLD_ANCHORS.university;
    const [gx, gz] = WORLD_ANCHORS.github;
    const [bx, bz] = WORLD_ANCHORS.bitkit;
    expect(obstacle.mock.calls).toEqual([
      [ux, uz - 1.2, 4.7],
      [gx - 5, gz - 1, 2.2],
      [gx, gz - 3, 2.2],
      [gx + 5, gz - 1, 2.2],
      [bx, bz, 3.8],
    ]);
    expect(scene.getObjectByName('yard-forklift')).toBeDefined();
    landmarks.dispose();
  });

  it('batches the detailed island props into fewer draws and bounds their geometry cost', () => {
    const { scene, landmarks } = create();
    const before = resources(scene);
    // The original unloaded module used 123 meshes. Static construction and
    // repeated detail now share buffers, including independently moving props.
    expect(before.meshes).toBeLessThanOrEqual(60);
    expect(before.triangles).toBeLessThan(185_000);
    expect(before.materials.size).toBeLessThanOrEqual(14);
    for (const geometry of before.geometries) {
      geometry.computeBoundingSphere();
      expect(Number.isFinite(geometry.boundingSphere!.radius)).toBe(true);
      expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
    }
    for (let frame = 0; frame < 180; frame++) landmarks.animate(frame / 60, 1 / 60);
    const after = resources(scene);
    expect(after.geometries).toEqual(before.geometries);
    expect(after.materials).toEqual(before.materials);
    expect(after.meshes).toBe(before.meshes);
    expect(scene.getObjectByName('university-mortarboard')!.rotation.y).toBeGreaterThan(0);
    landmarks.dispose();
  });

  it('preserves the official Bitkit asset, inward orientation, and readable fallback lifecycle', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => readFileSync('public/world/bitkit-logo.svg', 'utf8'),
    } as Response);
    const { scene, landmarks } = create();
    await vi.waitFor(() => expect(scene.getObjectByName('bitkit-bundled-extrusion')).toBeDefined());
    const logo = scene.getObjectByName('bitkit-official-logo')!;
    expect(logo.rotation.y).toBe(Math.PI - 0.16);
    expect(logo.position.toArray()).toEqual([0, 7.3, 0]);
    const extrusion = scene.getObjectByName('bitkit-bundled-extrusion')!;
    expect(extrusion.scale.toArray()).toEqual([0.086, -0.086, 0.086]);
    expect(extrusion.position.toArray()).toEqual([-7.03, 2.06, 0]);
    expect(extrusion.children).toHaveLength(3);
    expect(resources(scene).meshes).toBeLessThanOrEqual(63);
    expect(resources(scene).triangles).toBeLessThan(205_000);
    for (const object of extrusion.children as THREE.Mesh<THREE.ExtrudeGeometry>[]) {
      expect(object.receiveShadow).toBe(false);
      const normals = object.geometry.getAttribute('normal');
      for (const group of object.geometry.groups.filter((part) => part.materialIndex === 0)) {
        for (let vertex = group.start; vertex < group.start + group.count; vertex++) {
          expect(Math.abs(normals.getX(vertex))).toBeLessThan(0.0001);
          expect(Math.abs(normals.getY(vertex))).toBeLessThan(0.0001);
          expect(Math.abs(normals.getZ(vertex))).toBeCloseTo(1);
        }
      }
    }
    expect(logo.children.filter((object) => object instanceof THREE.Sprite).every((object) => !object.visible)).toBe(
      true,
    );
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/world/bitkit-logo.svg', {
      credentials: 'omit',
      signal: expect.any(AbortSignal),
    });
    for (const portal of scene.children.filter((object) => object.name.startsWith('Portal '))) {
      expect(portal.children.some((object) => object instanceof THREE.Sprite)).toBe(false);
    }
    const requestSignal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    landmarks.dispose();
    expect(requestSignal.aborted).toBe(true);
  });

  it('does not attach late SVG geometry after the landmark scene is disposed', async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { scene, landmarks } = create();
    landmarks.dispose();
    finish({ ok: true, text: async () => readFileSync('public/world/bitkit-logo.svg', 'utf8') } as Response);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scene.getObjectByName('bitkit-bundled-extrusion')).toBeUndefined();
    expect(scene.getObjectByName('bitkit-official-logo')!.children[0].visible).toBe(true);
  });
});

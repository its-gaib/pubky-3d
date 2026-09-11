import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeObject } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import { createTether } from '@/libs/world/world-tether';

describe('Tether metal monument', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retains the official wordmark, placement and interaction with bounded static batches', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => readFileSync('public/images/tether-text.svg', 'utf8') }),
    );
    const scene = new THREE.Scene();
    const register = vi.fn();
    const obstacle = vi.fn();
    const tether = createTether(scene, register, obstacle);
    await vi.waitFor(() => expect(scene.getObjectByName('official-tether-extrusion')).toBeDefined());
    const monument = scene.getObjectByName('tether-monument')!;
    expect(monument.position.toArray()).toEqual([WORLD_ANCHORS.tether[0], 0, WORLD_ANCHORS.tether[1]]);
    expect(monument.rotation.y).toBe(0);
    const lettering = scene.getObjectByName('official-tether-extrusion')!;
    expect(lettering.scale.toArray()).toEqual([0.36, -0.36, 0.36]);
    expect(lettering.position.toArray()).toEqual([-7.2, 8.35, 0]);
    expect(lettering.children).toHaveLength(1);
    expect((lettering.children[0] as THREE.Mesh).receiveShadow).toBe(false);
    const wordmark = lettering.children[0] as THREE.Mesh<THREE.ExtrudeGeometry>;
    const normals = wordmark.geometry.getAttribute('normal');
    for (const cap of wordmark.geometry.groups.filter((part) => part.materialIndex === 0)) {
      for (let vertex = cap.start; vertex < cap.start + cap.count; vertex++) {
        expect(Math.abs(normals.getX(vertex)) + Math.abs(normals.getY(vertex))).toBe(0);
        expect(Math.abs(normals.getZ(vertex))).toBe(1);
      }
    }
    expect(register).toHaveBeenCalledExactlyOnceWith(
      monument,
      { kind: 'fun', id: 'tether' },
      'Read about Tether Ventures',
    );
    expect(obstacle).toHaveBeenCalledExactlyOnceWith(WORLD_ANCHORS.tether[0], WORLD_ANCHORS.tether[1], 5.2);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/images/tether-text.svg', {
      credentials: 'omit',
      signal: expect.any(AbortSignal),
    });
    expect(
      monument.children.filter((object) => object instanceof THREE.Sprite).every((object) => !object.visible),
    ).toBe(true);
    let draws = 0;
    monument.traverse((object) => {
      if (object instanceof THREE.Mesh) draws++;
    });
    expect(draws).toBeLessThanOrEqual(4);
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    tether.dispose();
    expect(signal.aborted).toBe(true);
    disposeObject(scene);
  });

  it('keeps the local fallback and never attaches a late asset after teardown', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
      ),
    );
    const scene = new THREE.Scene();
    const tether = createTether(scene, vi.fn(), vi.fn());
    tether.dispose();
    finish({ ok: true, text: async () => readFileSync('public/images/tether-text.svg', 'utf8') } as Response);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scene.getObjectByName('official-tether-extrusion')).toBeUndefined();
    expect(
      scene
        .getObjectByName('tether-monument')!
        .children.some((object) => object instanceof THREE.Sprite && object.visible),
    ).toBe(true);
    disposeObject(scene);
  });
});

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObject } from '@/libs/world/world-geometry';
import { createWorldKnightArmorStand } from '@/libs/world/world-knight';

describe('knight armor', () => {
  it('builds a complete local suit and sword with shared, disposable metal materials', () => {
    const armor = createWorldKnightArmorStand();
    expect(armor.getObjectByName('knight-helmet')).toBeDefined();
    expect(armor.getObjectByName('knight-chest')).toBeDefined();
    expect(armor.getObjectByName('knight-sword')).toBeDefined();
    expect(armor.getObjectByName('knight-shield')).toBeDefined();
    const materials = new Set<THREE.Material>();
    let meshCount = 0;
    armor.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshCount++;
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(material);
      expect(object.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);
    });
    expect(meshCount).toBeLessThan(30);
    expect(materials.size).toBe(5);
    const bounds = new THREE.Box3().setFromObject(armor);
    expect(bounds.max.y).toBeGreaterThan(3);
    expect(bounds.max.y).toBeLessThan(3.5);
    const dispose = [...materials].map((material) => vi.spyOn(material, 'dispose'));
    disposeObject(armor);
    dispose.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
});

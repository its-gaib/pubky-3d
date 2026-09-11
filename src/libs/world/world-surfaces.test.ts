import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObject } from './world-geometry';
import { worldGrainTexture } from './world-surfaces';

describe('local world surface resources', () => {
  it('releases shared physical surface maps exactly once with their scene', () => {
    const group = new THREE.Group();
    const grain = worldGrainTexture();
    const ink = new THREE.Texture();
    const grainDisposal = vi.spyOn(grain, 'dispose');
    const inkDisposal = vi.spyOn(ink, 'dispose');
    const first = new THREE.MeshStandardMaterial({ bumpMap: grain, roughnessMap: grain });
    const second = new THREE.MeshStandardMaterial({ map: ink, roughnessMap: grain });
    const geometry = new THREE.BoxGeometry();
    const geometryDisposal = vi.spyOn(geometry, 'dispose');
    group.add(new THREE.Mesh(geometry, first), new THREE.Mesh(geometry, second));
    const wireGeometry = new THREE.BufferGeometry();
    const wire = new THREE.LineBasicMaterial();
    const wireDisposal = vi.spyOn(wire, 'dispose');
    const wireGeometryDisposal = vi.spyOn(wireGeometry, 'dispose');
    const dust = new THREE.PointsMaterial({ map: grain });
    const dustDisposal = vi.spyOn(dust, 'dispose');
    group.add(new THREE.LineSegments(wireGeometry, wire), new THREE.Points(wireGeometry, dust));
    disposeObject(group);
    expect(grainDisposal).toHaveBeenCalledTimes(1);
    expect(inkDisposal).toHaveBeenCalledTimes(1);
    expect(geometryDisposal).toHaveBeenCalledTimes(1);
    expect(wireGeometryDisposal).toHaveBeenCalledTimes(1);
    expect(wireDisposal).toHaveBeenCalledTimes(1);
    expect(dustDisposal).toHaveBeenCalledTimes(1);
  });
});

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANK_BILL_COUNT, BANK_BILL_LIFETIME, bankBillFrame, createBank } from './world-bank';

describe('bank bill life cycles', () => {
  it('keeps the reusable pool staggered instead of fading every bill together', () => {
    expect(BANK_BILL_COUNT).toBe(150);
    const frames = Array.from({ length: BANK_BILL_COUNT }, (_, index) => bankBillFrame(0, index));
    expect(frames.some((frame) => frame.opacity === 1)).toBe(true);
    expect(frames.some((frame) => frame.opacity > 0 && frame.opacity < 0.3)).toBe(true);
    expect(frames.some((frame) => frame.scale < 0.3)).toBe(true);
    expect(new Set(frames.map((frame) => frame.position[1])).size).toBeGreaterThan(10);
  });

  it('fades and shrinks an individual bill before recycling its own launch position', () => {
    const fresh = bankBillFrame(1, 0);
    const evaporating = bankBillFrame(6.8, 0);
    expect(fresh.opacity).toBe(1);
    expect(evaporating.opacity).toBeLessThan(0.05);
    expect(evaporating.scale).toBeLessThan(0.2);
    const recycled = bankBillFrame(BANK_BILL_LIFETIME + 1, 0);
    expect(recycled.opacity).toBeCloseTo(fresh.opacity);
    recycled.position.forEach((value, index) => expect(value).toBeCloseTo(fresh.position[index]));
  });

  it('lets some individual bills settle on the ground while others remain airborne', () => {
    const landed = bankBillFrame(4.2, 0);
    const resting = bankBillFrame(5, 0);
    const drifting = bankBillFrame(4.2, 2);
    expect(BANK_BILL_LIFETIME).toBe(7);
    expect(landed.settled).toBe(true);
    expect(resting.settled).toBe(true);
    expect(landed.position[1]).toBeCloseTo(0.24);
    expect(resting.position).toEqual(landed.position);
    expect(resting.opacity).toBe(1);
    expect(drifting.settled).toBe(false);
    expect(drifting.position[1]).toBeGreaterThan(1);
    expect(Math.hypot(landed.position[0] - 1.8, landed.position[2] + 0.4)).toBeGreaterThan(10);
  });

  it('lays settled notes flat at every heading instead of tilting them through the floor', () => {
    let checked = 0;
    for (const time of [0, 1.4, 4.2, 6]) {
      for (let index = 0; index < BANK_BILL_COUNT; index++) {
        const frame = bankBillFrame(time, index);
        if (!frame.settled) continue;
        const normal = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...frame.rotation, 'XYZ'));
        expect(Math.abs(normal.y)).toBeCloseTo(1, 9);
        expect(normal.x).toBeCloseTo(0, 9);
        expect(normal.z).toBeCloseTo(0, 9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('stays finite, translucent and local during a long session', () => {
    for (const time of [0, 0.1, 35, 3600, 86400]) {
      for (let index = 0; index < BANK_BILL_COUNT; index++) {
        const frame = bankBillFrame(time, index);
        expect(frame.position.every(Number.isFinite)).toBe(true);
        expect(frame.rotation.every(Number.isFinite)).toBe(true);
        expect(frame.opacity).toBeGreaterThanOrEqual(0);
        expect(frame.opacity).toBeLessThanOrEqual(1);
        expect(frame.scale).toBeGreaterThanOrEqual(0.15);
        expect(Math.hypot(frame.position[0] - 1.8, frame.position[2] + 0.4)).toBeLessThan(22);
      }
    }
  });
});

describe('bank printer renderer', () => {
  afterEach(() => vi.restoreAllMocks());

  function build() {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const scene = new THREE.Scene();
    const bank = createBank(scene, vi.fn(), vi.fn());
    const bills = scene.getObjectByName('bank-recycled-money') as THREE.InstancedMesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >;
    return { scene, bank, bills };
  }

  it('keeps the detailed bank in five mesh draws inside its original steps and foundation', () => {
    const { scene, bank, bills } = build();
    const structure = scene.getObjectByName('Bank stonework and metalwork')!;
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(structure);
    bounds.min.sub(structure.parent!.position);
    bounds.max.sub(structure.parent!.position);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-5.01);
    expect(bounds.max.x).toBeLessThanOrEqual(5.01);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-3.76);
    expect(bounds.max.z).toBeLessThanOrEqual(4.01);
    expect(bounds.max.y).toBeLessThan(7.15);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    expect(meshes).toHaveLength(5);
    const sign = scene.getObjectByName('bank-facade-brrr')!;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(structure.parent!.position.x, 4.2, structure.parent!.position.z + 12),
      new THREE.Vector3(0, 0, -1),
    );
    expect(ray.intersectObjects(meshes.filter((object) => object !== bills))[0].object).toBe(sign);
    expect(bills.material.map!.image.width).toBe(768);
    expect(bills.material.map!.image.height).toBe(384);
    bank.dispose();
  });

  it('renders half as many notes in one fixed draw with ten-times-faster seven-second lives', () => {
    const { bank, bills } = build();
    expect(bills.count).toBe(150);
    expect(bills.count / BANK_BILL_LIFETIME).toBeCloseTo((300 / 70) * 5);
    expect(bills.frustumCulled).toBe(false);
    expect(bills.material.forceSinglePass).toBe(true);
    const opacity = bills.geometry.getAttribute('billOpacity');
    expect(opacity.count).toBe(150);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    bank.animate(6.8, false);
    for (const index of [0, 1, 29, 99, 149]) {
      const frame = bankBillFrame(6.8, index);
      bills.getMatrixAt(index, matrix);
      position.setFromMatrixPosition(matrix);
      position.toArray().forEach((value, axis) => expect(value).toBeCloseTo(frame.position[axis], 5));
      expect(opacity.getX(index)).toBeCloseTo(frame.opacity, 6);
    }
    expect(opacity.getX(0)).toBeLessThan(0.05);
    const shader = { ...THREE.ShaderLib.basic } as Parameters<typeof bills.material.onBeforeCompile>[0];
    bills.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('attribute float billOpacity;');
    expect(shader.vertexShader).toContain('vBillOpacity = billOpacity;');
    expect(shader.fragmentShader).toContain('diffuseColor.a *= vBillOpacity;');
    bank.dispose();
  });

  it('vibrates BRRR at three times the original frequency without increasing its displacement, and supports reduced motion', () => {
    const { scene, bank, bills } = build();
    const sign = scene.getObjectByName('bank-facade-brrr')!;
    for (const time of [0.017, 0.13, 0.57, 1.2]) {
      bank.animate(time, false);
      const accelerated = time * 3;
      expect(sign.position.x).toBeCloseTo(Math.sin(accelerated * 31) * 0.035);
      expect(sign.rotation.z).toBeCloseTo(Math.sin(accelerated * 28) * 0.025 + Math.sin(accelerated * 43) * 0.012);
      expect(Math.abs(sign.position.x)).toBeLessThanOrEqual(0.035);
      expect(Math.abs(sign.rotation.z)).toBeLessThanOrEqual(0.037);
    }
    bank.animate(1, true);
    const frozen = Array.from(bills.instanceMatrix.array);
    const frozenVersion = bills.instanceMatrix.version;
    const frozenOpacityVersion = (bills.geometry.getAttribute('billOpacity') as THREE.InstancedBufferAttribute).version;
    bank.animate(100, true);
    expect(bills.instanceMatrix.version).toBe(frozenVersion);
    expect((bills.geometry.getAttribute('billOpacity') as THREE.InstancedBufferAttribute).version).toBe(
      frozenOpacityVersion,
    );
    expect(Array.from(bills.instanceMatrix.array)).toEqual(frozen);
    expect(sign.position.x).toBe(0);
    expect(sign.rotation.z).toBe(0);
    bank.dispose();
  });

  it('recycles a single resource pool and explicitly releases its instance attributes and texture', () => {
    const { scene, bank, bills } = build();
    const geometry = bills.geometry;
    const material = bills.material;
    const releases = [
      vi.spyOn(bills, 'dispose'),
      vi.spyOn(geometry, 'dispose'),
      vi.spyOn(material, 'dispose'),
      vi.spyOn(material.map!, 'dispose'),
    ];
    for (const time of [0, 70, 700, 7_000, 70_000]) bank.animate(time, false);
    expect(scene.getObjectByName('bank-recycled-money')).toBe(bills);
    expect(bills.geometry).toBe(geometry);
    expect(bills.material).toBe(material);
    expect(bills.count).toBe(150);
    bank.dispose();
    bank.dispose();
    bank.animate(100_000, false);
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
    expect(scene.children).toEqual([]);
  });
});

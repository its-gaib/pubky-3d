import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorldFireEffects } from '@/libs/world/world-fire-effects';

function activeParticles(scene: THREE.Scene, kind = 'flame') {
  const mesh = scene.getObjectByName(`world-fire-${kind}-particles`) as THREE.InstancedMesh;
  const points: THREE.Vector3[] = [];
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  for (let index = 0; index < mesh.count; index++) {
    mesh.getMatrixAt(index, matrix);
    scale.setFromMatrixScale(matrix);
    if (scale.x > 0 && scale.y > 0) points.push(new THREE.Vector3().setFromMatrixPosition(matrix));
  }
  return points;
}

function camera() {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(18, 10, 12);
  camera.lookAt(0, 3, 12);
  camera.updateMatrixWorld(true);
  return camera;
}

function fragmentMatrices(scene: THREE.Scene) {
  const mesh = scene.getObjectByName('world-fire-debris-particles') as THREE.InstancedMesh;
  const matrices: THREE.Matrix4[] = [];
  const scale = new THREE.Vector3();
  for (let index = 0; index < mesh.count; index++) {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    scale.setFromMatrixScale(matrix);
    if (scale.x > 0 && scale.y > 0) matrices.push(matrix);
  }
  return matrices;
}

describe('bounded world fire effects', () => {
  const effects: ReturnType<typeof createWorldFireEffects>[] = [];
  const create = () => {
    const scene = new THREE.Scene();
    const fire = createWorldFireEffects(scene);
    effects.push(fire);
    return { scene, fire, view: camera() };
  };

  afterEach(() => {
    effects.splice(0).forEach((fire) => fire.dispose());
    vi.restoreAllMocks();
  });

  it('copies the moving nozzle pose, fills a continuous weapon cone and ends after firing stops', () => {
    const { scene, fire, view } = create();
    const origin = new THREE.Vector3(0, 2, 0);
    const direction = new THREE.Vector3(0, 0, 1);
    fire.emitStream(origin, direction, 1, 'weapon');
    origin.set(1000, 1000, 1000);
    direction.set(1, 0, 0);
    fire.tick(0.05, 0.05, view);
    let points = activeParticles(scene);
    expect(points.length).toBeGreaterThan(8);
    expect(Math.max(...points.map((point) => point.z))).toBeGreaterThan(10);
    expect(Math.max(...points.map((point) => Math.abs(point.x)))).toBeLessThan(2);
    origin.set(0, 2, 0);
    direction.set(0, 0, 1);
    for (let frame = 1; frame <= 20; frame++) {
      fire.emitStream(origin, direction, 1, 'weapon');
      fire.tick(0.05, frame * 0.05, view);
    }
    points = activeParticles(scene);
    expect(Math.max(...points.map((point) => point.z))).toBeGreaterThan(19);
    expect(Math.max(...points.map((point) => point.z))).toBeLessThanOrEqual(22.01);
    expect(scene.getObjectByName('world-fire-effects')!.visible).toBe(true);
    for (let frame = 21; frame <= 81; frame++) fire.tick(0.05, frame * 0.05, view);
    expect(activeParticles(scene)).toHaveLength(0);
    expect(activeParticles(scene, 'smoke')).toHaveLength(0);
    expect(activeParticles(scene, 'ember')).toHaveLength(0);
    expect(scene.getObjectByName('world-fire-effects')!.visible).toBe(false);
  });

  it('gives dragon breath its longer reach and covers a building-sized target with rising fire and soot', () => {
    const { scene, fire, view } = create();
    const origin = new THREE.Vector3(0, 2, 0);
    const direction = new THREE.Vector3(0, 0, 1);
    for (let frame = 0; frame < 24; frame++) {
      fire.emitStream(origin, direction, 1, 'dragon');
      fire.tick(0.05, frame * 0.05, view);
    }
    expect(Math.max(...activeParticles(scene).map((point) => point.z))).toBeGreaterThan(28);
    expect(Math.max(...activeParticles(scene).map((point) => point.z))).toBeLessThanOrEqual(32.01);
    const box = new THREE.Box3(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 35, 4));
    fire.ignite('building', box);
    box.translate(new THREE.Vector3(1000, 1000, 1000));
    for (let frame = 24; frame < 104; frame++) fire.tick(0.05, frame * 0.05, view);
    const points = activeParticles(scene);
    expect(points.length).toBeGreaterThan(25);
    expect(Math.max(...points.map((point) => point.y))).toBeGreaterThan(25);
    expect(Math.max(...points.map((point) => Math.abs(point.x)))).toBeLessThan(10);
    expect(activeParticles(scene, 'smoke').length).toBeGreaterThan(5);
    expect(activeParticles(scene, 'ember').length).toBeGreaterThan(5);
    fire.remove('building');
    for (let frame = 104; frame < 166; frame++) fire.tick(0.05, frame * 0.05, view);
    expect(scene.getObjectByName('world-fire-effects')!.visible).toBe(false);
  });

  it('caps simultaneous emitters and particle buffers while rejecting invalid geometry', () => {
    const { scene, fire, view } = create();
    fire.emitStream(new THREE.Vector3(), new THREE.Vector3(), 1, 'weapon');
    fire.emitStream(new THREE.Vector3(Number.NaN, 0, 0), new THREE.Vector3(0, 0, 1), 1, 'dragon');
    fire.ignite('empty', new THREE.Box3());
    fire.tick(0.05, 0, view);
    expect(scene.getObjectByName('world-fire-effects')!.visible).toBe(false);
    const box = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 3, 1));
    for (let index = 0; index < 32; index++) fire.ignite(`near-${index}`, box);
    const far = new THREE.Box3(new THREE.Vector3(1000, 0, 1000), new THREE.Vector3(1002, 3, 1002));
    for (let index = 0; index < 100; index++) fire.ignite(`over-budget-${index}`, far);
    for (let frame = 0; frame < 80; frame++) fire.tick(0.05, frame * 0.05, view, true);
    const meshes = scene.getObjectByName('world-fire-effects')!.children as THREE.InstancedMesh[];
    expect(meshes).toHaveLength(4);
    expect(meshes.reduce((count, mesh) => count + mesh.count, 0)).toBe(768);
    for (const mesh of meshes) {
      expect(mesh.instanceMatrix.array.every(Number.isFinite)).toBe(true);
      expect(mesh.instanceColor!.array.every(Number.isFinite)).toBe(true);
    }
    expect(Math.max(...activeParticles(scene).map((point) => Math.abs(point.x)))).toBeLessThan(10);
    fire.tick(Number.POSITIVE_INFINITY, Number.NaN, view);
    expect(meshes.every((mesh) => mesh.instanceMatrix.array.every(Number.isFinite))).toBe(true);
  });

  it('immediately explodes into radial fire, sparks and tumbling solid fragments, then ends the target fire', () => {
    const { scene, fire, view } = create();
    const box = new THREE.Box3(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 12, 4));
    fire.ignite('building', box);
    for (let frame = 0; frame < 15; frame++) fire.tick(0.05, frame * 0.05, view);
    fire.explode('building', box);
    fire.explode('building', box);
    box.translate(new THREE.Vector3(1000, 0, 1000));
    fire.tick(0, 0.75, view);

    const start = fragmentMatrices(scene);
    expect(start).toHaveLength(48);
    expect(activeParticles(scene).length).toBeGreaterThan(80);
    expect(activeParticles(scene, 'smoke').length).toBeGreaterThan(15);
    const sparks = activeParticles(scene, 'ember');
    expect(sparks.some((point) => point.x < -2)).toBe(true);
    expect(sparks.some((point) => point.x > 2)).toBe(true);
    expect(sparks.some((point) => point.z < -2)).toBe(true);
    expect(sparks.some((point) => point.z > 2)).toBe(true);
    expect(Math.max(...sparks.map((point) => Math.abs(point.x)))).toBeLessThan(20);
    const flameMesh = scene.getObjectByName('world-fire-flame-particles') as THREE.InstancedMesh;
    expect(
      Array.from(flameMesh.geometry.getAttribute('fireOpacity').array).filter((opacity) => opacity === 1).length,
    ).toBeGreaterThan(80);

    for (let frame = 0; frame < 6; frame++) fire.tick(0.05, 0.8 + frame * 0.05, view);
    const flying = fragmentMatrices(scene);
    expect(flying).toHaveLength(start.length);
    for (let index = 0; index < start.length; index++) {
      const before = new THREE.Vector3().setFromMatrixPosition(start[index]);
      const after = new THREE.Vector3().setFromMatrixPosition(flying[index]);
      expect(after.x * after.x + after.z * after.z).toBeGreaterThan(before.x * before.x + before.z * before.z);
      const beforeScale = new THREE.Vector3().setFromMatrixScale(start[index]);
      const afterScale = new THREE.Vector3().setFromMatrixScale(flying[index]);
      expect(afterScale.x).toBeCloseTo(beforeScale.x, 5);
      expect(afterScale.y).toBeCloseTo(beforeScale.y, 5);
      expect(afterScale.z).toBeCloseTo(beforeScale.z, 5);
    }
    const initialRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(start[0]));
    const flightRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(flying[0]));
    expect(initialRotation.angleTo(flightRotation)).toBeGreaterThan(0.2);
    for (let frame = 0; frame < 80; frame++) fire.tick(0.05, 1.1 + frame * 0.05, view);
    expect(scene.getObjectByName('world-fire-effects')!.visible).toBe(false);
    expect(fragmentMatrices(scene)).toHaveLength(0);
  });

  it('caps queued explosions and reuses the same finite particle and fragment buffers', () => {
    const { scene, fire, view } = create();
    const root = scene.getObjectByName('world-fire-effects')!;
    const meshes = root.children.slice() as THREE.InstancedMesh[];
    const buffers = meshes.map((mesh) => mesh.instanceMatrix.array);
    fire.explode('empty', new THREE.Box3());
    fire.explode('non-finite', new THREE.Box3(new THREE.Vector3(Number.NaN, 0, 0), new THREE.Vector3(1, 1, 1)));
    fire.explode('too-large', new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(501, 1, 1)));
    fire.explode(
      'overflow',
      new THREE.Box3(new THREE.Vector3().setScalar(Number.MAX_VALUE), new THREE.Vector3().setScalar(Number.MAX_VALUE)),
    );
    fire.tick(0, 0, view);
    expect(root.visible).toBe(false);

    const box = new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 5, 2));
    for (let index = 0; index < 32; index++) fire.explode(`near-${index}`, box);
    const far = box.clone().translate(new THREE.Vector3(1000, 0, 1000));
    for (let index = 0; index < 100; index++) fire.explode(`over-budget-${index}`, far);
    fire.tick(0, 0, view);
    expect(fragmentMatrices(scene)).toHaveLength(96);
    expect(activeParticles(scene)).toHaveLength(384);
    expect(activeParticles(scene, 'smoke')).toHaveLength(96);
    expect(activeParticles(scene, 'ember')).toHaveLength(192);
    expect(Math.max(...activeParticles(scene).map((point) => Math.abs(point.x)))).toBeLessThan(10);
    const firstFragments = fragmentMatrices(scene).map((matrix) => matrix.toArray());
    fire.explode('near-0', far);
    fire.tick(0, 0, view);
    expect(fragmentMatrices(scene).map((matrix) => matrix.toArray())).toEqual(firstFragments);
    for (let frame = 0; frame < 80; frame++) fire.tick(0.05, frame * 0.05, view);
    fire.explode('fresh', box);
    fire.tick(Number.POSITIVE_INFINITY, Number.NaN, view);
    expect(root.visible).toBe(true);
    expect(root.children).toEqual(meshes);
    meshes.forEach((mesh, index) => {
      expect(mesh.instanceMatrix.array).toBe(buffers[index]);
      expect(mesh.instanceMatrix.array.every(Number.isFinite)).toBe(true);
      expect(mesh.instanceColor!.array.every(Number.isFinite)).toBe(true);
      expect(mesh.geometry.getAttribute('fireOpacity').array.every(Number.isFinite)).toBe(true);
    });
  });

  it('keeps a readable completion burst without travelling, spinning or flickering in reduced motion', () => {
    const { scene, fire, view } = create();
    const box = new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 8, 3));
    fire.explode('building', box);
    fire.tick(0, 0, view, true);
    const start = fragmentMatrices(scene).map((matrix) => matrix.toArray());
    const points = ['flame', 'smoke', 'ember'].map((kind) =>
      activeParticles(scene, kind).map((point) => point.toArray()),
    );
    expect(start.length).toBeGreaterThan(20);
    expect(points.every((kind) => kind.length > 0)).toBe(true);
    for (let frame = 0; frame < 8; frame++) fire.tick(0.05, 100 + frame, view, true);
    expect(fragmentMatrices(scene).map((matrix) => matrix.toArray())).toEqual(start);
    ['flame', 'smoke', 'ember'].forEach((kind, index) => {
      expect(activeParticles(scene, kind).map((point) => point.toArray())).toEqual(points[index]);
    });
    for (let frame = 0; frame < 45; frame++) fire.tick(0.05, 108 + frame, view, true);
    expect(scene.getObjectByName('world-fire-effects')!.visible).toBe(false);
  });

  it('follows moving people without resetting their flame intensity or creating extra emitters', () => {
    const moving = create();
    const stationary = create();
    const bounds = new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, 3, 0.4));
    moving.fire.follow('missing', bounds);
    moving.fire.tick(0.05, 0, moving.view);
    expect(moving.scene.getObjectByName('world-fire-effects')!.visible).toBe(false);
    for (const { fire } of [moving, stationary]) fire.ignite('person', bounds);
    for (let frame = 0; frame < 20; frame++) {
      moving.fire.tick(0.05, frame * 0.05, moving.view);
      stationary.fire.tick(0.05, frame * 0.05, stationary.view);
    }
    const translated = bounds.clone().translate(new THREE.Vector3(20, 0, 0));
    for (let frame = 20; frame < 80; frame++) {
      moving.fire.follow('person', translated);
      moving.fire.follow('person', new THREE.Box3());
      moving.fire.tick(0.05, frame * 0.05, moving.view);
      stationary.fire.tick(0.05, frame * 0.05, stationary.view);
    }
    const movingFlames = activeParticles(moving.scene);
    const stationaryFlames = activeParticles(stationary.scene);
    expect(movingFlames.length).toBeGreaterThan(40);
    expect(movingFlames).toHaveLength(stationaryFlames.length);
    movingFlames.forEach((point, index) => {
      expect(point.x - stationaryFlames[index].x).toBeCloseTo(20, 4);
      expect(point.y).toBe(stationaryFlames[index].y);
      expect(point.z).toBe(stationaryFlames[index].z);
    });
  });

  it('owns four shared materials and disposes their procedural textures and geometry exactly once', () => {
    const { scene, fire, view } = create();
    const root = scene.getObjectByName('world-fire-effects')!;
    const disposers = root.children.flatMap((object) => {
      const mesh = object as THREE.InstancedMesh;
      const material = mesh.material as THREE.MeshBasicMaterial;
      if (mesh.name === 'world-fire-debris-particles') expect(material.map).toBeNull();
      else expect(material.map).toBeInstanceOf(THREE.DataTexture);
      expect(material.depthWrite).toBe(false);
      return [
        vi.spyOn(mesh.geometry, 'dispose'),
        vi.spyOn(material, 'dispose'),
        ...(material.map ? [vi.spyOn(material.map, 'dispose')] : []),
      ];
    });
    fire.dispose();
    fire.dispose();
    fire.emitStream(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 1, 'dragon');
    fire.ignite('disposed', new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 2, 1)));
    fire.explode('disposed', new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 2, 1)));
    fire.follow('disposed', new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 2, 1)));
    fire.tick(0.05, 0, view);
    expect(scene.getObjectByName('world-fire-effects')).toBeUndefined();
    disposers.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});

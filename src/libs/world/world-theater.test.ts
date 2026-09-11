import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { disposeObject } from './world-geometry';
import { WORLD_ANCHORS } from './world-layout';
import { createTheater } from './world-theater';
import type { WorldData, WorldPost } from './world-types';

const posts: WorldPost[] = [
  { id: 'first', author: 'First author', text: 'First ranked post', tags: [] },
  { id: 'second', author: 'Second author', text: 'Second ranked post', tags: [] },
  { id: 'third', author: 'Third author', text: 'Third ranked post', tags: [] },
];
const data: WorldData = { source: 'demo', tags: [], people: [], relationships: [], trendingPosts: posts };

describe('Trending Theater program', () => {
  let scene: THREE.Scene;
  const fillText = vi.fn();

  beforeEach(() => {
    scene = new THREE.Scene();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      asOpaque<CanvasRenderingContext2D>({
        fillText,
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        measureText: (text: string) => ({ width: text.length * 20 }),
      }),
    );
  });

  afterEach(() => {
    disposeObject(scene);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fillText.mockClear();
  });

  function mount(value = data) {
    return createTheater(scene, vi.fn(), vi.fn(), value);
  }

  it('retains eight distinct seated extras with shared materials, bounded draws and complete disposal', () => {
    mount();
    const spectators: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object.name === 'theater-decorative-spectator') spectators.push(object);
    });
    expect(spectators).toHaveLength(8);
    expect(spectators.filter((spectator) => spectator.position.y === 0)).toHaveLength(4);
    expect(spectators.filter((spectator) => spectator.position.y === 0.5)).toHaveLength(4);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    let draws = 0;
    let triangles = 0;
    for (const spectator of spectators) {
      const bounds = new THREE.Box3().setFromObject(spectator);
      expect(bounds.min.y).toBeGreaterThan(0.39);
      expect(bounds.max.y).toBeLessThan(3.7);
      expect(bounds.max.x - bounds.min.x).toBeLessThan(1.4);
      spectator.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        draws++;
        geometries.add(object.geometry);
        triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
        for (const surface of Array.isArray(object.material) ? object.material : [object.material])
          materials.add(surface);
      });
    }
    expect(draws).toBeLessThanOrEqual(24);
    expect(triangles).toBeLessThan(130000);
    expect(materials.size).toBe(3);
    const releases = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
    disposeObject(scene);
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
  });

  it('stands spectators up and moves their arms and legs while retaining their existing meshes and clothing', () => {
    const theater = mount();
    expect(theater.spectators).toHaveLength(8);
    const spectator = theater.spectators[0];
    const meshes = spectator.group.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
    const resources = meshes.map((object) => ({ geometry: object.geometry, material: object.material }));
    const seated = new THREE.Box3().setFromObject(spectator.group);
    const structure = scene.getObjectByName('Theater stage and seating')!;
    const stageBounds = new THREE.Box3().setFromObject(structure);
    const frame = { position: new THREE.Vector3(), yaw: 0, stride: 0, falling: false };
    const fabric = meshes[0].geometry;
    const joints = fabric.getAttribute('escapeJoint');
    let legVertex = -1;
    for (let index = 0; index < joints.count; index++) {
      if (joints.getX(index) !== 1) continue;
      legVertex = index;
      break;
    }
    expect(legVertex).toBeGreaterThanOrEqual(0);
    spectator.setEscapePose(frame, false);
    const standing = new THREE.Box3().setFromObject(spectator.group);
    expect(standing.min.y).toBeLessThan(seated.min.y - 0.2);
    expect(standing.min.y).toBeGreaterThan(-0.06);
    expect(standing.max.y).toBeGreaterThan(seated.max.y);
    const front = new THREE.Vector3();
    const back = new THREE.Vector3();
    for (const stride of [-1, 0, 1]) {
      spectator.setEscapePose({ ...frame, stride }, false);
      if (stride === -1) front.fromBufferAttribute(fabric.getAttribute('position'), legVertex);
      if (stride === 1) back.fromBufferAttribute(fabric.getAttribute('position'), legVertex);
      const bounds = new THREE.Box3().setFromObject(spectator.group);
      expect(bounds.max.y - bounds.min.y).toBeLessThan(3.1);
      expect(bounds.max.x - bounds.min.x).toBeLessThan(1.8);
      meshes.forEach((object, index) => {
        expect(object.geometry).toBe(resources[index].geometry);
        expect(object.material).toBe(resources[index].material);
        expect(object.geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);
        expect(object.geometry.getAttribute('normal').array.every(Number.isFinite)).toBe(true);
        expect(object.geometry.boundingSphere!.radius).toBeLessThan(2);
      });
    }
    expect(front.distanceTo(back)).toBeGreaterThan(0.1);
    expect(spectator.group.children.filter((object) => object instanceof THREE.Mesh)).toHaveLength(3);
    expect(new THREE.Box3().setFromObject(structure)).toEqual(stageBounds);
  });

  it('keeps moving figure bounds current after separation and holds a steady running pose for reduced motion', () => {
    const theater = mount();
    scene.updateMatrixWorld(true);
    const spectator = theater.spectators[5];
    const stage = scene.getObjectByName('Theater stage and seating')!;
    const stageBounds = new THREE.Box3().setFromObject(stage);
    scene.attach(spectator.group);
    spectator.group.position.set(100, 0.15, -80);
    spectator.group.rotation.y = 0;
    const frame = { position: spectator.group.position.clone(), yaw: 0, stride: 1, falling: false };
    spectator.setEscapePose(frame, true);
    const meshes = spectator.group.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
    const versions = meshes.map(
      (object) => (object.geometry.getAttribute('position') as THREE.BufferAttribute).version,
    );
    const bounds = new THREE.Box3().setFromObject(spectator.group);
    expect(bounds.min.x).toBeGreaterThan(99);
    expect(bounds.max.x).toBeLessThan(101);
    expect(bounds.min.y).toBeLessThan(0.3);
    expect(bounds.max.y).toBeGreaterThan(2.7);
    spectator.setEscapePose({ ...frame, stride: -1 }, true);
    expect(new THREE.Box3().setFromObject(spectator.group)).toEqual(bounds);
    meshes.forEach((object, index) => {
      expect((object.geometry.getAttribute('position') as THREE.BufferAttribute).version).toBe(versions[index]);
    });
    spectator.group.position.y = -12;
    spectator.setEscapePose({ ...frame, stride: 0, falling: true }, false);
    const falling = new THREE.Box3().setFromObject(spectator.group);
    expect(falling.max.y).toBeLessThan(-8);
    expect(falling.min.y).toBeGreaterThan(-13);
    expect(new THREE.Box3().setFromObject(stage)).toEqual(stageBounds);
  });

  it('batches the stage and seating while preserving its collision anchors and open center aisle', () => {
    const obstacle = vi.fn();
    createTheater(scene, vi.fn(), obstacle, data);
    expect(obstacle).toHaveBeenCalledTimes(8);
    for (const x of [-7.1, 7.1])
      expect(obstacle).toHaveBeenCalledWith(WORLD_ANCHORS.theater[0] + x, WORLD_ANCHORS.theater[1] - 4.45, 0.8);
    for (let row = 0; row < 3; row++)
      for (const x of [-4.2, 4.2])
        expect(obstacle).toHaveBeenCalledWith(
          WORLD_ANCHORS.theater[0] + x,
          WORLD_ANCHORS.theater[1] + row * 2.5 + 1,
          1.45,
        );
    const structure = scene.getObjectByName('Theater stage and seating')!;
    const meshes: THREE.Mesh[] = [];
    structure.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    expect(meshes).toHaveLength(4);
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(structure);
    bounds.min.sub(structure.parent!.position);
    bounds.max.sub(structure.parent!.position);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-9.01);
    expect(bounds.max.x).toBeLessThanOrEqual(9.01);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-6.01);
    expect(bounds.max.z).toBeLessThanOrEqual(8.01);
    const ray = new THREE.Raycaster();
    for (const x of [-0.6, 0, 0.6])
      for (const y of [0.8, 1.5]) {
        ray.set(
          new THREE.Vector3(WORLD_ANCHORS.theater[0] + x, y, WORLD_ANCHORS.theater[1] + 7.5),
          new THREE.Vector3(0, 0, -1),
        );
        ray.far = 9.3;
        expect(ray.intersectObjects(meshes)).toHaveLength(0);
      }
  });

  it('shows the supplied rank order and rotates only when a full reading interval passes', () => {
    const theater = mount();
    expect(fillText).toHaveBeenCalledWith('First ranked post', 76, 285, 1360);
    expect(theater.tick(19)).toBe(false);
    expect(theater.getStatus().theaterIndex).toBe(0);
    expect(theater.tick(1)).toBe(true);
    expect(theater.getStatus().theaterIndex).toBe(1);
    expect(fillText).toHaveBeenCalledWith('Second ranked post', 76, 285, 1360);
  });

  it('keeps a paused reader steady, permits manual wraparound, and resumes with a fresh interval', () => {
    const theater = mount();
    theater.tick(17);
    theater.setPaused(true);
    expect(theater.tick(60)).toBe(false);
    expect(theater.getStatus()).toEqual({ theaterIndex: 0, theaterPaused: true });
    theater.step(-1);
    expect(theater.getStatus().theaterIndex).toBe(2);
    theater.step(1);
    expect(theater.getStatus().theaterIndex).toBe(0);
    theater.setPaused(false);
    expect(theater.tick(19)).toBe(false);
    expect(theater.tick(1)).toBe(true);
    expect(theater.getStatus()).toEqual({ theaterIndex: 1, theaterPaused: false });
  });

  it('starts with a stable screen for reduced motion while preserving manual control', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const theater = mount();
    expect(theater.tick(100)).toBe(false);
    expect(theater.getStatus().theaterPaused).toBe(true);
    theater.step(1);
    expect(theater.getStatus().theaterIndex).toBe(1);
  });

  it('replaces stale program content when the data source changes and handles an empty feed', () => {
    const theater = mount();
    theater.step(2);
    theater.updateData({ ...data, source: 'production', trendingPosts: [posts[1]] });
    expect(theater.getStatus().theaterIndex).toBe(0);
    expect(fillText).toHaveBeenCalledWith('PUBLIC PRODUCTION · RANKED BY TOTAL ENGAGEMENT', 70, 160, 1350);
    expect(theater.tick(80)).toBe(false);
    theater.updateData({ ...data, trendingPosts: [] });
    theater.step(-1);
    expect(theater.getStatus().theaterIndex).toBe(0);
    expect(fillText).toHaveBeenCalledWith('NO POSTS', 76, 808);
  });

  it('hides pending program content and holds playback until the new ranked program is ready', () => {
    const theater = mount();
    theater.tick(18);
    fillText.mockClear();
    theater.setLoading(true);
    expect(fillText).toHaveBeenCalledWith('Loading the next show…', 238, 424, 1200);
    expect(fillText.mock.calls.map(([text]) => text).join(' ')).not.toMatch(/ranked post|author|ON AIR|PAUSED|1 \/ 3/);

    fillText.mockClear();
    expect(theater.tick(120)).toBe(false);
    theater.step(1);
    theater.setLoading(true);
    expect(theater.getStatus()).toEqual({ theaterIndex: 0, theaterPaused: false });
    expect(fillText).not.toHaveBeenCalled();

    theater.updateData({ ...data, source: 'production', trendingPosts: [posts[2], posts[0]] });
    expect(fillText.mock.calls.map(([text]) => text).join(' ')).not.toMatch(/ranked post|author|ON AIR|PAUSED|1 \/ 2/);
    fillText.mockClear();
    theater.setLoading(false);
    expect(fillText).toHaveBeenCalledWith('Third ranked post', 76, 285, 1360);
    expect(theater.tick(19)).toBe(false);
    expect(theater.tick(1)).toBe(true);
    expect(fillText).toHaveBeenCalledWith('First ranked post', 76, 285, 1360);
  });

  it('restores the existing program after a failed load without changing pause intent', () => {
    const theater = mount();
    theater.step(1);
    theater.setPaused(true);
    theater.setLoading(true);
    fillText.mockClear();
    theater.setLoading(false);
    expect(fillText).toHaveBeenCalledWith('Second ranked post', 76, 285, 1360);
    expect(theater.getStatus()).toEqual({ theaterIndex: 1, theaterPaused: true });
    expect(theater.tick(120)).toBe(false);
    theater.setPaused(false);
    expect(theater.tick(20)).toBe(true);
    expect(theater.getStatus()).toEqual({ theaterIndex: 2, theaterPaused: false });
  });

  it('renders hostile-looking post content as canvas text without creating markup', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    mount({ ...data, trendingPosts: [{ ...posts[0], text: hostile }] });
    expect(fillText).toHaveBeenCalledWith(hostile, 76, 285, 1360);
    expect(document.querySelector('img[onerror]')).toBeNull();
  });
});

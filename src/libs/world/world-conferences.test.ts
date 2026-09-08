import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORLD_CONFERENCES } from '@/libs/world/world-conference-catalog';
import { resolvePosition, type WorldObstacle } from '@/libs/world/world-motion';
import { asOpaque } from '@/test-utils/type-assertions';
import { CONFERENCE_DECK, createConferences } from './world-conferences';

function objects(group: THREE.Group) {
  const result: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) result.push(object);
  });
  return result;
}

describe('Next Stop: Pubky conference deck', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists the three official destinations in upcoming date order with complete ISO ranges', () => {
    expect(WORLD_CONFERENCES).toHaveLength(3);
    expect(WORLD_CONFERENCES.map((event) => event.url)).toEqual([
      'https://dark.events/events/prague/',
      'https://planb.lugano.ch/',
      'https://planb.sv/',
    ]);
    const verifiedOn = Date.parse('2026-09-08');
    let previous = verifiedOn;
    for (const event of WORLD_CONFERENCES) {
      expect(event.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Date.parse(event.startDate)).toBeGreaterThan(previous);
      expect(Date.parse(event.endDate)).toBeGreaterThanOrEqual(Date.parse(event.startDate));
      expect(event.dateLabel).toContain(event.startDate.slice(0, 4));
      previous = Date.parse(event.startDate);
    }
  });

  it('keeps each ticket independently accessible within the reserved footprint and batches tiny city details', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const scene = new THREE.Scene();
    const register = vi.fn();
    const obstacles: WorldObstacle[] = [];
    const anchor = [0, -101] as const;
    const conferences = createConferences(scene, anchor, register, (x, z, radius) => obstacles.push({ x, z, radius }));
    expect(conferences.group.position.toArray()).toEqual([0, 0, -101]);
    expect(register).toHaveBeenCalledTimes(3);
    register.mock.calls.forEach(([display, action], index) => {
      expect(action).toEqual({ kind: 'conference', index });
      expect(display.name).toContain(WORLD_CONFERENCES[index].city);
      expect(display.position.x).toBe((index - 1) * CONFERENCE_DECK.displaySpacing);
      const front = { x: anchor[0] + display.position.x, z: anchor[1] + 4 };
      expect(resolvePosition(front.x, front.z, obstacles)).toEqual(front);
      expect(Math.hypot(front.x - anchor[0] - display.position.x, front.z - anchor[1])).toBeLessThan(7);
    });
    expect(obstacles).toHaveLength(3);
    conferences.group.updateMatrixWorld(true);
    const meshes = objects(conferences.group);
    expect(meshes.length).toBeLessThanOrEqual(36);
    expect(meshes.reduce((count, mesh) => count + mesh.geometry.getAttribute('position').count, 0)).toBeLessThan(
      40_000,
    );
    const point = new THREE.Vector3();
    for (const mesh of meshes) {
      const vertices = mesh.geometry.getAttribute('position');
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        point.fromBufferAttribute(vertices, vertex).applyMatrix4(mesh.matrixWorld);
        expect(Math.abs(point.x - anchor[0])).toBeLessThanOrEqual(CONFERENCE_DECK.width / 2 + 0.001);
        expect(Math.abs(point.z - anchor[1])).toBeLessThanOrEqual(CONFERENCE_DECK.depth / 2 + 0.001);
        expect(Math.hypot(point.x - anchor[0], point.z - anchor[1])).toBeLessThanOrEqual(
          CONFERENCE_DECK.radius + 0.001,
        );
      }
    }
    conferences.dispose();
  });

  it('renders the real event names and dates as local canvas text without fetching assets', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const fillText = vi.fn();
    const context = asOpaque<CanvasRenderingContext2D>({
      fillText,
      fillRect: vi.fn(),
      setLineDash: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    const conferences = createConferences(new THREE.Scene(), [0, 0], vi.fn());
    const text = fillText.mock.calls.map(([value]) => value);
    expect(text).toContain('NEXT STOP: PUBKY');
    for (const event of WORLD_CONFERENCES) {
      expect(text).toContain(event.name);
      expect(text).toContain(event.city);
      expect(text).toContain(event.dateLabel);
    }
    const textures = objects(conferences.group).flatMap((object) =>
      'map' in object.material && object.material.map instanceof THREE.CanvasTexture ? [object.material.map] : [],
    );
    expect(textures).toHaveLength(4);
    expect(fetchSpy).not.toHaveBeenCalled();
    conferences.dispose();
  });

  it('freezes reduced motion, resumes without time jumps and keeps GPU resources fixed until teardown', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const scene = new THREE.Scene();
    const actual = createConferences(scene, [0, 0], vi.fn());
    const control = createConferences(new THREE.Scene(), [0, 0], vi.fn());
    const positions = (group: THREE.Group) => group.children.map((child) => child.position.toArray());
    const initial = objects(actual.group).map((mesh) => [mesh, mesh.geometry, mesh.material]);
    actual.animate(1, 0.02);
    control.animate(10_000, 0.02);
    expect(positions(actual.group)).toEqual(positions(control.group));
    const frozen = positions(actual.group);
    actual.animate(30_000, 100, true);
    actual.animate(40_000, Number.NaN);
    expect(positions(actual.group)).toEqual(frozen);
    actual.animate(50_000, 100);
    control.animate(2, 0.05);
    expect(positions(actual.group)).toEqual(positions(control.group));
    expect(objects(actual.group).map((mesh) => [mesh, mesh.geometry, mesh.material])).toEqual(initial);
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    for (const object of objects(actual.group)) {
      resources.add(object.geometry);
      resources.add(object.material);
      if ('map' in object.material && object.material.map instanceof THREE.Texture) resources.add(object.material.map);
    }
    const releases = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
    actual.dispose();
    actual.dispose();
    actual.animate(100_000, 0.05);
    expect(scene.children).toEqual([]);
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
    control.dispose();
  });
});

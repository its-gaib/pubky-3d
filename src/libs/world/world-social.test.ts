import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { createSocialPlaza } from './world-social';
import { SOCIAL_PAGE_SIZE, socialSector } from './world-social-layout';
import type { WorldData, WorldPerson } from './world-types';

function person(id: string, degree: 1 | 2 = 1, parentIds: string[] = []): WorldPerson {
  return { id, name: id, degree, parentIds, color: '#C8FF03', position: [0, 0], bio: '' };
}
function graph(people: WorldPerson[]): WorldData {
  return {
    source: 'staging',
    people,
    tags: [],
    trendingPosts: [],
    relationships: people
      .filter((entry) => entry.degree === 1)
      .map((entry) => ({ from: 'viewer', to: entry.id, label: 'follows' })),
  };
}

describe('bounded social plaza renderer', () => {
  let scene: THREE.Scene;
  let social: ReturnType<typeof createSocialPlaza>;
  beforeEach(() => {
    scene = new THREE.Scene();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      asOpaque<CanvasRenderingContext2D>({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
      }),
    );
  });
  afterEach(() => {
    social?.dispose();
    vi.restoreAllMocks();
  });

  function body() {
    const value = scene.getObjectByName('social-body');
    if (!(value instanceof THREE.InstancedMesh)) throw new Error('The social body batch is missing');
    return value;
  }
  function bodyScale(index = 0) {
    const matrix = new THREE.Matrix4();
    body().getMatrixAt(index, matrix);
    const scale = new THREE.Vector3();
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    return scale.x;
  }

  it('uses count clusters for large networks and can select the last ID without growing its render pool', () => {
    const people = Array.from({ length: 2000 }, (_, index) => person(`person-${index}`));
    social = createSocialPlaza(scene, graph(people));
    expect(body().count).toBe(0);
    expect(scene.getObjectByName(`social-sector-${socialSector(people[0].id)}`)?.visible).toBe(true);
    const initialChildren = scene.getObjectByName('world-social')?.children.length;
    const destination = social.findPerson(people.at(-1)!.id);
    expect(destination?.person.id).toBe(people.at(-1)!.id);
    if (!destination) return;
    const location = new THREE.Vector3(destination.position[0], 0.2, destination.position[1]);
    social.tick(0.1, location, true, false);
    expect(body().count).toBeGreaterThan(0);
    expect(body().count).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
    expect(social.nearest(location.x, location.z)?.action).toEqual({ kind: 'person', id: destination.person.id });
    for (let page = 0; page < 8; page++) social.setView({ sector: socialSector(people[0].id), page });
    social.tick(0.1, location, true, false);
    expect(body().count).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
    expect(scene.getObjectByName('world-social')?.children.length).toBe(initialChildren);
  });

  it('tweens a live demotion and applies reduced-motion changes immediately', () => {
    social = createSocialPlaza(scene, graph([person('friend')]));
    expect(bodyScale()).toBeCloseTo(1.15);
    social.updateData(graph([person('friend', 2)]));
    social.tick(0.05, new THREE.Vector3(), false, false);
    expect(bodyScale()).toBeGreaterThan(0.5);
    expect(bodyScale()).toBeLessThan(1.15);
    social.tick(0.05, new THREE.Vector3(), true, false);
    expect(bodyScale()).toBeCloseTo(0.5);
    social.updateData(graph([person('friend')]));
    social.tick(0.05, new THREE.Vector3(), true, false);
    expect(bodyScale()).toBeCloseTo(1.15);
  });

  it('maps instance ray hits to the correct public profile instead of the shared mesh', () => {
    social = createSocialPlaza(scene, graph([person('first'), person('second')]));
    const destination = social.findPerson('second');
    expect(destination).not.toBeNull();
    if (!destination) return;
    social.tick(0.1, new THREE.Vector3(), true, false);
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(destination.position[0], 8, destination.position[1]),
      new THREE.Vector3(0, -1, 0),
    );
    expect(social.pick(ray)?.action).toEqual({ kind: 'person', id: 'second' });
  });

  it('draws only supplied relationships and narrows them to the focused person', () => {
    const value = graph([person('friend'), person('discovery', 2, ['friend'])]);
    value.relationships.push({ from: 'friend', to: 'discovery', label: 'follows' });
    social = createSocialPlaza(scene, value);
    const lines = scene.getObjectByName('social-follow-lines');
    if (!(lines instanceof THREE.LineSegments)) throw new Error('Follow line buffer missing');
    expect(lines.geometry.drawRange.count).toBe(48);
    social.setFocus('discovery');
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(lines.geometry.drawRange.count).toBe(24);
    social.updateData({ ...value, relationships: [] });
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(lines.geometry.drawRange.count).toBe(0);
  });

  it('releases instance and line buffers when the world closes', () => {
    social = createSocialPlaza(scene, graph([person('friend')]));
    const geometry = body().geometry;
    const disposed = vi.spyOn(geometry, 'dispose');
    social.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(scene.getObjectByName('world-social')).toBeUndefined();
  });
});

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { createSocialPlaza } from './world-social';
import { SOCIAL_PAGE_SIZE, socialSectors } from './world-social-layout';
import type { WorldData, WorldPerson } from './world-types';

function person(id: string, degree: 1 | 2 = 1, parentIds: string[] = []): WorldPerson {
  return { id, name: id, degree, parentIds, color: '#C8FF03', position: [0, 0], bio: '' };
}
function graph(people: WorldPerson[]): WorldData {
  return {
    source: 'production',
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
    expect(scene.getObjectByName(`social-sector-${socialSectors(people)[0].sector}`)?.visible).toBe(true);
    const initialChildren = scene.getObjectByName('world-social')?.children.length;
    const destination = social.findPerson(people.at(-1)!.id);
    expect(destination?.person.id).toBe(people.at(-1)!.id);
    if (!destination) return;
    const location = new THREE.Vector3(destination.position[0], 0.2, destination.position[1]);
    social.tick(0.1, location, true, false);
    expect(body().count).toBeGreaterThan(0);
    expect(body().count).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
    expect(social.nearest(location.x, location.z)?.action).toEqual({ kind: 'person', id: destination.person.id });
    for (let page = 0; page < 8; page++) social.setView({ sector: socialSectors(people)[0].sector, page });
    social.tick(0.1, location, true, false);
    expect(body().count).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
    expect(scene.getObjectByName('world-social')?.children.length).toBe(initialChildren);
  });

  it('previews real names and exact counts in existing sector textures as profiles change', () => {
    const fillText = vi.fn();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      asOpaque<CanvasRenderingContext2D>({ clearRect: vi.fn(), fillRect: vi.fn(), fillText }),
    );
    const people = Array.from({ length: 160 }, (_, index) => ({
      ...person(index.toString(36).padStart(52, '0')),
      name: `Friend ${index}`,
      profileLoaded: true,
      profileTags: [{ label: 'synonym', count: 32 }],
      profileTagsStatus: 'loaded' as const,
    }));
    const sector = socialSectors(people)[0].sector;
    const members = [...people].sort((a, b) => a.id.localeCompare(b.id));
    members[0].name = 'Avery';
    members[1].name = 'Bo';
    social = createSocialPlaza(scene, graph(people));
    expect(fillText).toHaveBeenCalledWith('Synonym', 320, 51, 594);
    expect(fillText).toHaveBeenCalledWith('Includes Avery · Bo', 320, 132, 594);
    expect(fillText).toHaveBeenCalledWith(`${members.length} people · ${members.length} following`, 320, 219, 594);
    const textures: (THREE.Texture | null)[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Sprite) textures.push(object.material.map);
    });
    const cluster = scene.getObjectByName(`social-sector-${sector}`)!;
    expect(social.nearest(cluster.position.x, cluster.position.z)?.title).toContain('Preview Synonym');
    expect(social.nearest(cluster.position.x, cluster.position.z)?.action).toEqual({
      kind: 'social-cluster',
      sector,
      sectorKey: 'tag:synonym',
    });
    social.updateData(
      graph(people.map((person) => (person.id === members[0].id ? { ...person, name: 'Avery updated' } : person))),
    );
    expect(fillText).toHaveBeenCalledWith('Includes Avery updated · Bo', 320, 132, 594);
    const nextTextures: (THREE.Texture | null)[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Sprite) nextTextures.push(object.material.map);
    });
    expect(nextTextures).toEqual(textures);
    expect(body().count).toBe(0);
  });

  it('retains fixed resources and a selected tag when loaded metadata adds or removes neighborhoods', () => {
    const people = Array.from({ length: 140 }, (_, index) => ({
      ...person(index.toString(36).padStart(52, '0')),
      profileTags: [{ label: 'synonym', count: 32 }],
      profileTagsStatus: 'loaded' as const,
    }));
    social = createSocialPlaza(scene, graph(people));
    const resources = scene.getObjectByName('world-social')!.children.length;
    social.setView({ sector: 0, sectorKey: 'tag:synonym', page: 1 });
    expect(body().count).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
    const art = {
      ...person('z'.repeat(52)),
      profileTags: [{ label: 'art', count: 3 }],
      profileTagsStatus: 'loaded' as const,
    };
    social.updateData(graph([...people, art]));
    const target = social.findPerson(people.at(-1)!.id);
    expect(target?.sectorKey).toBe('tag:synonym');
    expect(target?.sector).toBe(1);
    expect(scene.getObjectByName('world-social')!.children.length).toBe(resources);
    social.updateData(graph(people.map((entry) => ({ ...entry, profileTags: [{ label: 'bitcoin', count: 2 }] }))));
    expect(body().count).toBe(0);
    expect(scene.getObjectByName('social-sector-0')?.visible).toBe(true);
    expect(scene.getObjectByName('world-social')!.children.length).toBe(resources);
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

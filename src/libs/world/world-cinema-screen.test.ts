import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CINEMA_SCREEN } from '@/libs/world/world-cinema';
import { WORLD_FILMS, worldCinemaAmbientUrl, type WorldFilm } from '@/libs/world/world-cinema-program';
import { createCinemaScreen, createCinemaVisibility } from '@/libs/world/world-cinema-screen';
import { disposeObject } from '@/libs/world/world-geometry';
import { asInvalid } from '@/test-utils/type-assertions';

const loader = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock('@/libs/world/world-cinema-youtube', () => ({ acquireCinemaYouTubeApi: loader.acquire }));

function setup() {
  const world = new THREE.Scene();
  const frame = new THREE.Object3D();
  frame.position.y = 5;
  world.add(frame);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  camera.position.set(0, 5, 30);
  camera.lookAt(0, 5, 0);
  camera.updateMatrixWorld(true);
  world.updateMatrixWorld(true);
  return { world, frame, camera };
}

describe('in-world cinema projection', () => {
  beforeEach(() => {
    loader.acquire.mockReturnValue({ ready: new Promise(() => {}), release: vi.fn() });
  });
  afterEach(() => document.body.replaceChildren());

  it('only autoplays a fixed reel with muted controls and the exact host origin for the official API', () => {
    const origin = 'https://world.example';
    const url = new URL(worldCinemaAmbientUrl(WORLD_FILMS[0], origin)!);
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${WORLD_FILMS[0]}`);
    expect(url.searchParams.has('playlist')).toBe(false);
    for (const parameter of ['autoplay', 'mute', 'playsinline', 'disablekb', 'enablejsapi'])
      expect(url.searchParams.get(parameter)).toBe('1');
    expect(url.searchParams.get('controls')).toBe('0');
    expect(url.searchParams.get('origin')).toBe(origin);
    expect(worldCinemaAmbientUrl(asInvalid<WorldFilm>('https://unexpected.invalid/'), origin)).toBeNull();
    for (const invalid of [
      'null',
      'file:///world',
      'https://world.example/private',
      'https://user:password@world.example',
    ])
      expect(worldCinemaAmbientUrl(WORLD_FILMS[0], invalid)).toBeNull();
  });

  it('hides back-facing, offscreen and geometry-blocked projections while ignoring scenery behind the screen', () => {
    const { world, frame, camera } = setup();
    const visible = createCinemaVisibility(world, frame);
    expect(visible(camera)).toBe(true);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 0.3), new THREE.MeshBasicMaterial());
    wall.position.set(0, 5, -1);
    world.add(wall);
    world.updateMatrixWorld(true);
    expect(visible(camera)).toBe(true);
    wall.position.z = 10;
    world.updateMatrixWorld(true);
    expect(visible(camera)).toBe(false);
    wall.visible = false;
    camera.position.z = -30;
    camera.lookAt(0, 5, 0);
    expect(visible(camera)).toBe(false);
    camera.position.z = 30;
    camera.lookAt(100, 5, 0);
    expect(visible(camera)).toBe(false);
    disposeObject(world);
  });

  it('conservatively hides the whole video when a corner sample is blocked even if its center is clear', () => {
    const { world, frame, camera } = setup();
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.5), new THREE.MeshBasicMaterial());
    blocker.position.set(CINEMA_SCREEN.width * 0.24, 5 + CINEMA_SCREEN.height * 0.24, 15);
    world.add(blocker);
    world.updateMatrixWorld(true);
    expect(createCinemaVisibility(world, frame)(camera)).toBe(false);
    disposeObject(world);
  });

  it('keeps one noninteractive sandboxed iframe while the camera moves and fully removes it on world exit', () => {
    const { world, frame, camera } = setup();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const cinema = createCinemaScreen(container, world, frame);
    const iframe = cinema.iframe;
    const url = iframe.src;
    cinema.resize(640, 480);
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation');
    expect(iframe.getAttribute('allow')).toBe('autoplay; encrypted-media; picture-in-picture');
    expect(iframe.referrerPolicy).toBe('strict-origin');
    expect(iframe.tabIndex).toBe(-1);
    expect(iframe.style.pointerEvents).toBe('none');
    expect(iframe.parentElement!.style.pointerEvents).toBe('none');
    cinema.render(camera, 0);
    const transform = iframe
      .parentElement!.style.transform.match(/matrix3d\(([^)]+)\)/)![1]
      .split(',')
      .map(Number);
    expect(Math.abs(transform[0]) * Number(iframe.width)).toBeCloseTo(CINEMA_SCREEN.width);
    expect(Math.abs(transform[5]) * Number(iframe.height)).toBeCloseTo(CINEMA_SCREEN.height);
    for (let index = 0; index < 50; index++) {
      camera.position.x = Math.sin(index) * 2;
      camera.lookAt(0, 5, 0);
      cinema.render(camera, index / 20);
    }
    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    expect(container.querySelector('iframe')).toBe(iframe);
    expect(iframe.src).toBe(url);
    iframe.dispatchEvent(new Event('load'));
    expect(iframe.parentElement!.dataset.embedState).toBe('loading');
    expect(iframe.style.opacity).toBe('0');
    expect(container.textContent).not.toContain('playing');
    cinema.dispose();
    cinema.dispose();
    expect(container.children).toHaveLength(0);
    expect(iframe.hasAttribute('src')).toBe(false);
    disposeObject(world);
  });
});

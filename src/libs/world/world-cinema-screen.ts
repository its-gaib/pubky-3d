import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { CINEMA_SCREEN } from '@/libs/world/world-cinema';
import { shuffleWorldFilms, worldCinemaUrl, type WorldFilm } from '@/libs/world/world-cinema-program';

/** One fixed-host, muted native playlist; no scripting bridge or account data is attached. */
export function worldCinemaAmbientUrl(program: readonly WorldFilm[]): string | null {
  const validated = worldCinemaUrl(program);
  if (!validated) return null;
  const url = new URL(validated);
  url.searchParams.set('mute', '1');
  url.searchParams.set('controls', '0');
  url.searchParams.set('disablekb', '1');
  url.searchParams.set('fs', '0');
  return url.toString();
}

const SAMPLES = [-0.48, 0, 0.48].flatMap((x) =>
  [-0.48, 0, 0.48].map((y) => new THREE.Vector3(x * CINEMA_SCREEN.width, y * CINEMA_SCREEN.height, 0)),
);

/**
 * CSS cannot share WebGL's depth buffer. Conservatively hide the entire rectangle
 * when any of nine screen samples is blocked; this is not per-pixel occlusion.
 */
export function createCinemaVisibility(world: THREE.Scene, screenFrame: THREE.Object3D) {
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const projected = SAMPLES.map(() => new THREE.Vector3());
  const occluders: THREE.Mesh[] = [];
  const ray = new THREE.Raycaster();
  const hits: THREE.Intersection[] = [];

  return (camera: THREE.PerspectiveCamera) => {
    screenFrame.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(cameraPosition);
    screenFrame.getWorldPosition(position);
    normal.set(0, 0, 1).transformDirection(screenFrame.matrixWorld);
    if (direction.subVectors(cameraPosition, position).dot(normal) <= 0.05) return false;
    SAMPLES.forEach((point, index) =>
      projected[index].copy(point).applyMatrix4(screenFrame.matrixWorld).project(camera),
    );
    if (projected.some((point) => point.z < -1 || point.z > 1)) return false;
    if (
      projected.every((point) => point.x < -1) ||
      projected.every((point) => point.x > 1) ||
      projected.every((point) => point.y < -1) ||
      projected.every((point) => point.y > 1)
    )
      return false;
    occluders.length = 0;
    world.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const surfaces = Array.isArray(object.material) ? object.material : [object.material];
      if (surfaces.some((surface) => surface.visible && !surface.transparent && surface.opacity > 0.9))
        occluders.push(object);
    });
    for (const point of SAMPLES) {
      sample.copy(point).applyMatrix4(screenFrame.matrixWorld);
      direction.subVectors(sample, cameraPosition);
      const distance = direction.length();
      ray.set(cameraPosition, direction.normalize());
      ray.near = 0;
      ray.far = distance - 0.08;
      hits.length = 0;
      ray.intersectObjects(occluders, false, hits);
      if (hits.length) return false;
    }
    return true;
  };
}

/** A single persistent iframe is projected using the exact WebGL camera. */
export function createCinemaScreen(container: HTMLElement, world: THREE.Scene, screenFrame: THREE.Object3D) {
  const renderer = new CSS3DRenderer();
  const overlay = renderer.domElement;
  overlay.dataset.worldCinemaOverlay = '';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1' });
  container.appendChild(overlay);
  const element = document.createElement('div');
  Object.assign(element.style, {
    width: '1600px',
    height: '900px',
    background: '#17121C',
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  });
  const fallback = document.createElement('div');
  fallback.textContent = 'MIDNIGHT CINEMA · Loading the muted screening…';
  Object.assign(fallback.style, {
    position: 'absolute',
    inset: '0',
    display: 'grid',
    placeItems: 'center',
    color: '#F4D49E',
    font: '40px sans-serif',
  });
  element.appendChild(fallback);
  const iframe = document.createElement('iframe');
  iframe.title = 'Midnight Cinema — automatic muted YouTube program';
  iframe.width = '1600';
  iframe.height = '900';
  iframe.tabIndex = -1;
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  iframe.referrerPolicy = 'strict-origin';
  iframe.loading = 'eager';
  Object.assign(iframe.style, {
    position: 'absolute',
    inset: '0',
    border: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  });
  const url = worldCinemaAmbientUrl(shuffleWorldFilms());
  if (url) iframe.src = url;
  element.appendChild(iframe);
  // A load event only means the cross-origin document loaded, not that autoplay succeeded.
  const loaded = () => {
    element.dataset.embedState = 'loaded';
    fallback.style.display = 'none';
  };
  iframe.addEventListener('load', loaded);
  element.dataset.embedState = 'loading';
  const object = new CSS3DObject(element);
  element.style.pointerEvents = 'none';
  const cssScene = new THREE.Scene();
  cssScene.add(object);
  const worldScale = new THREE.Vector3();
  const visible = createCinemaVisibility(world, screenFrame);
  let lastVisibilityCheck = -Infinity;
  let disposed = false;
  let showing = false;
  overlay.style.visibility = 'hidden';

  return {
    iframe,
    resize(width: number, height: number) {
      if (!disposed) renderer.setSize(Math.max(1, width), Math.max(1, height));
    },
    render(camera: THREE.PerspectiveCamera, time: number) {
      if (disposed) return;
      screenFrame.updateWorldMatrix(true, false);
      screenFrame.matrixWorld.decompose(object.position, object.quaternion, worldScale);
      object.scale.copy(worldScale).multiplyScalar(CINEMA_SCREEN.width / 1600);
      if (time - lastVisibilityCheck >= 0.12 || time < lastVisibilityCheck) {
        showing = visible(camera);
        lastVisibilityCheck = time;
      }
      overlay.style.visibility = showing ? 'visible' : 'hidden';
      renderer.render(cssScene, camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      iframe.removeEventListener('load', loaded);
      iframe.removeAttribute('src');
      iframe.remove();
      object.removeFromParent();
      overlay.remove();
    },
  };
}

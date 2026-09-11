import * as THREE from 'three';
import { createWorldGroupBurnTarget, type WorldBurnTarget } from '@/libs/world/world-burning';
import { WORLD_DIMENSIONS } from '@/libs/world/world-layout';

export const WORLD_BURN_ESCAPE = {
  edgeRadius: WORLD_DIMENSIONS.coastRadius + 2,
  runSpeed: 16,
  fallSeconds: 1.8,
} as const;

export interface WorldBurnEscapeFrame {
  position: THREE.Vector3;
  yaw: number;
  stride: number;
  falling: boolean;
}

/** One random heading per ignition; bounded motion continues beyond the shore. */
export function createWorldBurnEscape(start: THREE.Vector3, random: () => number = Math.random) {
  const origin = new THREE.Vector3(
    Number.isFinite(start.x) ? start.x : 0,
    Number.isFinite(start.y) ? start.y : 0.15,
    Number.isFinite(start.z) ? start.z : 0,
  );
  const value = random();
  const choice = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0.5;
  const radius = Math.hypot(origin.x, origin.z);
  // Different outward headings prevent a crowd from taking the same route,
  // while avoiding a needlessly long trip through the centre of the island.
  const yaw = radius > 1 ? Math.atan2(origin.x, origin.z) + (choice - 0.5) * Math.PI * 0.94 : choice * Math.PI * 2;
  const direction = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const along = origin.x * direction.x + origin.z * direction.z;
  const distance =
    radius >= WORLD_BURN_ESCAPE.edgeRadius
      ? 0
      : Math.max(0, -along + Math.sqrt(along * along + WORLD_BURN_ESCAPE.edgeRadius ** 2 - radius ** 2));
  const runSeconds = distance / WORLD_BURN_ESCAPE.runSpeed;
  const duration = runSeconds + WORLD_BURN_ESCAPE.fallSeconds;
  const frame: WorldBurnEscapeFrame = { position: origin.clone(), yaw, stride: 0, falling: false };

  return {
    duration,
    sample(progress: number, reducedMotion = false) {
      const time = (Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0) * duration;
      const fallTime = Math.max(0, time - runSeconds);
      frame.falling = time >= runSeconds;
      frame.stride = reducedMotion || frame.falling ? 0 : Math.sin(time * 16);
      frame.position.copy(origin).addScaledVector(direction, Math.min(time, runSeconds) * WORLD_BURN_ESCAPE.runSpeed);
      frame.position.y = THREE.MathUtils.lerp(origin.y, 0.15, Math.min(1, time / 0.65));
      if (frame.falling) {
        frame.position.addScaledVector(direction, fallTime * 6);
        frame.position.y -= 10 * fallTime * fallTime;
      } else if (!reducedMotion) frame.position.y += Math.abs(frame.stride) * 0.14;
      return frame;
    },
  };
}

/** A human separates from its scenery so the scenery's explosion cannot hide it. */
export function createWorldHumanBurnTarget(
  id: string,
  figure: THREE.Object3D,
  scene: THREE.Scene,
  onPose?: (frame: WorldBurnEscapeFrame, reducedMotion: boolean) => void,
): WorldBurnTarget {
  let escape: ReturnType<typeof createWorldBurnEscape> | null = null;
  const position = new THREE.Vector3();
  const target = createWorldGroupBurnTarget(id, [figure]);
  return {
    ...target,
    completion: 'fall',
    onIgnite() {
      if (escape) return;
      figure.getWorldPosition(position);
      escape = createWorldBurnEscape(position);
      scene.attach(figure);
      figure.userData.worldBurnPending = true;
      figure.traverse((object) => {
        if (object instanceof THREE.Sprite) object.visible = false;
      });
    },
    getDuration: () => escape?.duration ?? 15,
    applyProgress(progress, reducedMotion = false) {
      if (!escape) return;
      const frame = escape.sample(progress, reducedMotion);
      figure.position.copy(frame.position);
      figure.rotation.set(frame.falling && !reducedMotion ? 0.65 : 0, frame.yaw, 0);
      onPose?.(frame, reducedMotion);
      figure.updateMatrixWorld(true);
    },
  };
}

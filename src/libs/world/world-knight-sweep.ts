import * as THREE from 'three';

export const WORLD_KNIGHT_SWEEP = {
  windupSeconds: 0.14,
  circleSeconds: 0.66,
  recoverySeconds: 0.25,
  durationSeconds: 1.05,
} as const;

const CIRCLE = Math.PI * 2;
const START_YAW = -1.08;
const TRAIL_SEGMENTS = 32;
const TRAIL_TURNS = 0.38;

interface KnightSweepRig {
  body: THREE.Group;
  head: THREE.Group;
  rightArm: THREE.Group;
  rightElbow: THREE.Object3D;
  sword: THREE.Group;
}

/** One complete cavalry cleave. Its reusable ribbon stays in the rider's visual rig. */
export function createWorldKnightSweep({ body, head, rightArm, rightElbow, sword }: KnightSweepRig) {
  const positions = new THREE.Float32BufferAttribute((TRAIL_SEGMENTS + 1) * 2 * 3, 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const colors = new THREE.Float32BufferAttribute((TRAIL_SEGMENTS + 1) * 2 * 3, 3);
  const indices: number[] = [];
  for (let segment = 0; segment <= TRAIL_SEGMENTS; segment++) {
    const brightness = (segment / TRAIL_SEGMENTS) ** 1.6;
    colors.setXYZ(segment * 2, brightness, brightness, brightness);
    colors.setXYZ(segment * 2 + 1, brightness * 0.08, brightness * 0.08, brightness * 0.08);
    if (segment < TRAIL_SEGMENTS) {
      const start = segment * 2;
      indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  geometry.setAttribute('color', colors);
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    color: '#FFD978',
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexColors: true,
    toneMapped: false,
  });
  const ribbon = new THREE.Mesh(geometry, material);
  ribbon.name = 'knight-sword-sweep-trail';
  ribbon.visible = false;
  ribbon.frustumCulled = false;
  body.add(ribbon);

  const armEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const elbowEuler = new THREE.Euler(-0.12, 0, 0);
  const quaternion = new THREE.Quaternion();
  const armMatrix = new THREE.Matrix4();
  const elbowMatrix = new THREE.Matrix4();
  const bladeMatrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  let startedAt: number | null = null;
  let queued = false;

  const cancel = () => {
    startedAt = null;
    queued = false;
    ribbon.visible = false;
  };

  const drawRibbon = (end: number, fade: number, stationary = false) => {
    const start = Math.max(0, end - TRAIL_TURNS);
    sword.updateMatrix();
    elbowMatrix.compose(rightElbow.position, quaternion.setFromEuler(elbowEuler), rightElbow.scale);
    for (let segment = 0; segment <= TRAIL_SEGMENTS; segment++) {
      const turn = THREE.MathUtils.lerp(start, end, segment / TRAIL_SEGMENTS);
      armEuler.set(-0.18, START_YAW - turn * CIRCLE, 1.24, 'YXZ');
      armMatrix.compose(rightArm.position, quaternion.setFromEuler(armEuler), rightArm.scale);
      bladeMatrix.multiplyMatrices(armMatrix, elbowMatrix).multiply(sword.matrix);
      point.set(0, -1.47, 0).applyMatrix4(bladeMatrix);
      positions.setXYZ(segment * 2, point.x, point.y, point.z);
      point.set(0, stationary ? -1.3 : -0.98, 0).applyMatrix4(bladeMatrix);
      positions.setXYZ(segment * 2 + 1, point.x, point.y, point.z);
    }
    positions.needsUpdate = true;
    material.opacity = (stationary ? 0.3 : 0.82) * fade;
    ribbon.visible = end > 0 && fade > 0;
  };

  return {
    /** Consecutive victims can request one follow-up without interrupting the current full circle. */
    trigger(seconds: number) {
      if (!Number.isFinite(seconds) || seconds < 0) return false;
      if (startedAt !== null && seconds >= startedAt && seconds < startedAt + WORLD_KNIGHT_SWEEP.durationSeconds) {
        queued = true;
        return false;
      }
      startedAt = seconds;
      queued = false;
      return true;
    },
    cancel,
    update(seconds: number, reducedMotion: boolean) {
      if (startedAt === null) return;
      if (!Number.isFinite(seconds) || seconds < startedAt) {
        cancel();
        return;
      }
      let elapsed = seconds - startedAt;
      if (elapsed >= WORLD_KNIGHT_SWEEP.durationSeconds) {
        // A hidden tab must not replay a long backlog of attacks when it becomes visible again.
        if (!queued || elapsed >= WORLD_KNIGHT_SWEEP.durationSeconds * 2) {
          cancel();
          return;
        }
        startedAt += WORLD_KNIGHT_SWEEP.durationSeconds;
        elapsed = seconds - startedAt;
        queued = false;
      }
      if (reducedMotion) {
        // Keep the mounted guard still; a stationary gold impact arc fades without a spin or flash.
        drawRibbon(0.32, 1 - elapsed / WORLD_KNIGHT_SWEEP.durationSeconds, true);
        return;
      }

      const { windupSeconds, circleSeconds, recoverySeconds } = WORLD_KNIGHT_SWEEP;
      const circleProgress = THREE.MathUtils.smoothstep(elapsed - windupSeconds, 0, circleSeconds);
      const recovery = THREE.MathUtils.smoothstep(elapsed - windupSeconds - circleSeconds, 0, recoverySeconds);
      const windup = THREE.MathUtils.smoothstep(elapsed, 0, windupSeconds);
      const extension = windup * (1 - recovery);
      rightArm.rotation.set(
        THREE.MathUtils.lerp(-1.07, -0.18, extension),
        START_YAW * extension - circleProgress * CIRCLE,
        THREE.MathUtils.lerp(0.35, 1.24, extension),
        'YXZ',
      );
      rightElbow.rotation.set(THREE.MathUtils.lerp(-0.25, -0.12, extension), 0, 0);
      const followThrough = Math.sin(circleProgress * CIRCLE) * extension;
      body.rotation.y -= followThrough * 0.22;
      body.rotation.x += Math.sin(circleProgress * Math.PI) * 0.075;
      body.rotation.z -= followThrough * 0.055;
      head.rotation.y += followThrough * 0.12;
      drawRibbon(circleProgress, 1 - recovery);
    },
  };
}

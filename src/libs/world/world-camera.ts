/** Walking can look above the horizon without orbiting underneath the island. */
export function clampWorldPitch(value: number, overview: boolean) {
  const fallback = overview ? 0.72 : 0.26;
  return Math.max(overview ? 0.16 : -0.55, Math.min(1.25, Number.isFinite(value) ? value : fallback));
}

export function worldCameraVertical(pitch: number, distance: number, targetHeight: number) {
  return {
    height: Math.max(2.2, targetHeight + Math.sin(Math.max(0, pitch)) * distance),
    lookLift: Math.max(0, -Math.sin(pitch) * distance),
  };
}

interface WorldCameraFollowStep {
  yaw: number;
  deltaX: number;
  deltaZ: number;
  seconds: number;
  enabled: boolean;
}

/** Gradually look along travel, without turning a held movement key into a circle. */
export function createWorldCameraFollow() {
  let inputYaw: number | null = null;
  let previousX = 0;
  let previousZ = 0;
  let movingTime = 0;
  let manualGrace = 0;
  const finite = (value: number) => (Number.isFinite(value) ? value : 0);

  return {
    /** New directions are camera-relative; an unchanged hold keeps its world heading. */
    movementYaw(yaw: number, x: number, z: number) {
      const length = Math.hypot(finite(x), finite(z));
      if (length < 0.001) {
        inputYaw = null;
        previousX = previousZ = 0;
        return finite(yaw);
      }
      const nextX = finite(x) / length;
      const nextZ = finite(z) / length;
      if (inputYaw === null || Math.hypot(nextX - previousX, nextZ - previousZ) > 0.001) inputYaw = finite(yaw);
      previousX = nextX;
      previousZ = nextZ;
      return inputYaw;
    },
    /** Manual orbit still steers a held direction and gets two seconds of priority. */
    orbit(deltaYaw = 0) {
      if (inputYaw !== null) inputYaw += finite(deltaYaw);
      manualGrace = 2;
      movingTime = 0;
    },
    reset() {
      inputYaw = null;
      previousX = previousZ = movingTime = manualGrace = 0;
    },
    step({ yaw, deltaX, deltaZ, seconds, enabled }: WorldCameraFollowStep) {
      const currentYaw = finite(yaw);
      const dt = Math.min(0.05, Math.max(0, finite(seconds)));
      if (dt === 0) return currentYaw;
      manualGrace = Math.max(0, manualGrace - dt);
      const distance = Math.hypot(finite(deltaX), finite(deltaZ));
      // Ignore stopped movement and discontinuities such as a portal or dismount.
      if (
        !enabled ||
        manualGrace > 0 ||
        !Number.isFinite(deltaX) ||
        !Number.isFinite(deltaZ) ||
        distance / dt < 0.25 ||
        distance / dt > 60
      ) {
        movingTime = 0;
        return currentYaw;
      }
      movingTime += dt;
      const ramp = Math.min(1, Math.max(0, (movingTime - 0.3) / 1.2));
      const strength = ramp * ramp * (3 - 2 * ramp);
      const targetYaw = Math.atan2(-deltaX, -deltaZ);
      const difference = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
      const turn = difference * (1 - Math.exp(-dt * 1.3 * strength));
      const maxTurn = dt * 0.72 * strength;
      return currentYaw + Math.max(-maxTurn, Math.min(maxTurn, turn));
    },
  };
}

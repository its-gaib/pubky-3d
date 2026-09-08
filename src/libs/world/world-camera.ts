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

import { PERSONA_RADIUS, WORLD_RADIUS, type WorldObstacle } from '@/libs/world/world-motion';
import { WORLD_KEY_COUNT } from '@/libs/world/world-transport-unlocks';

interface KeyPosition {
  x: number;
  z: number;
}

const SPAWN: KeyPosition = { x: 0, z: 24 };
const GRID_STEP = 4;
const GRID_WIDTH = Math.floor((WORLD_RADIUS * 2) / GRID_STEP) + 1;
const SHORE_MARGIN = 7;
const SPAWN_CLEARANCE = 32;
const KEY_SEPARATION = 20;
const TAU = Math.PI * 2;

/** Random discoveries on the same connected walking ground as the plaza spawn. */
export function createWorldKeyPositions(obstacles: readonly WorldObstacle[], random = Math.random): KeyPosition[] {
  // Match ground movement: burnt props and panels with walking space beneath them do not block a path.
  const solid = obstacles
    .filter((obstacle) => obstacle.enabled !== false && (obstacle.minHeight ?? 0) <= 0)
    .map(({ x, z, radius }) => ({ x, z, radius: radius + PERSONA_RADIUS + 0.15 }));
  const nextRandom = () => {
    const value = random();
    return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0.5;
  };
  const pointAt = (index: number): KeyPosition => ({
    x: (index % GRID_WIDTH) * GRID_STEP - WORLD_RADIUS,
    z: Math.floor(index / GRID_WIDTH) * GRID_STEP - WORLD_RADIUS,
  });
  const pointIsClear = ({ x, z }: KeyPosition) =>
    x * x + z * z <= (WORLD_RADIUS - SHORE_MARGIN) ** 2 &&
    solid.every((obstacle) => (x - obstacle.x) ** 2 + (z - obstacle.z) ** 2 >= obstacle.radius ** 2);
  const pathIsClear = (from: KeyPosition, to: KeyPosition) => {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthSquared = dx * dx + dz * dz;
    return solid.every((obstacle) => {
      const along =
        lengthSquared > 0
          ? Math.max(0, Math.min(1, ((obstacle.x - from.x) * dx + (obstacle.z - from.z) * dz) / lengthSquared))
          : 0;
      return (from.x + dx * along - obstacle.x) ** 2 + (from.z + dz * along - obstacle.z) ** 2 >= obstacle.radius ** 2;
    });
  };

  // Check each full connecting segment, so small props between grid points cannot create a false passage.
  const clear = new Uint8Array(GRID_WIDTH * GRID_WIDTH);
  for (let index = 0; index < clear.length; index++) clear[index] = pointIsClear(pointAt(index)) ? 1 : 0;
  const spawnIndex =
    Math.round((SPAWN.z + WORLD_RADIUS) / GRID_STEP) * GRID_WIDTH + Math.round((SPAWN.x + WORLD_RADIUS) / GRID_STEP);
  const visited = new Uint8Array(clear.length);
  const queue = clear[spawnIndex] ? [spawnIndex] : [];
  visited[spawnIndex] = 1;
  const candidates: KeyPosition[] = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const point = pointAt(index);
    if (Math.hypot(point.x - SPAWN.x, point.z - SPAWN.z) >= SPAWN_CLEARANCE + GRID_STEP) candidates.push(point);
    const column = index % GRID_WIDTH;
    for (const neighbor of [
      column > 0 ? index - 1 : -1,
      column + 1 < GRID_WIDTH ? index + 1 : -1,
      index - GRID_WIDTH,
      index + GRID_WIDTH,
    ]) {
      if (neighbor < 0 || neighbor >= clear.length || visited[neighbor] || !clear[neighbor]) continue;
      if (!pathIsClear(point, pointAt(neighbor))) continue;
      visited[neighbor] = 1;
      queue.push(neighbor);
    }
  }

  for (let index = candidates.length - 1; index > 0; index--) {
    const swap = Math.floor(nextRandom() * (index + 1));
    [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
  }
  const rotation = nextRandom() * TAU;
  const sectors = Array.from({ length: WORLD_KEY_COUNT }, () => [] as KeyPosition[]);
  for (const point of candidates) {
    const angle = (Math.atan2(point.z, point.x) + TAU + rotation) % TAU;
    sectors[Math.floor((angle / TAU) * WORLD_KEY_COUNT)].push(point);
  }

  const positions: KeyPosition[] = [];
  const separated = (point: KeyPosition) =>
    positions.every((other) => Math.hypot(point.x - other.x, point.z - other.z) >= KEY_SEPARATION);
  const choose = (choices: readonly KeyPosition[]) => {
    for (const point of choices) {
      const jittered = {
        x: point.x + (nextRandom() - 0.5) * GRID_STEP * 0.8,
        z: point.z + (nextRandom() - 0.5) * GRID_STEP * 0.8,
      };
      if (pointIsClear(jittered) && separated(jittered) && pathIsClear(point, jittered)) {
        positions.push(jittered);
        return;
      }
      if (separated(point)) {
        positions.push(point);
        return;
      }
    }
  };
  // A random sector rotation spreads discoveries around the island without revealing a repeated route.
  sectors.forEach(choose);
  while (positions.length < WORLD_KEY_COUNT) {
    const previousCount = positions.length;
    choose(candidates);
    if (positions.length === previousCount) break;
  }
  return positions;
}

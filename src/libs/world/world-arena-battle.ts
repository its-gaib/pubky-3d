import * as THREE from 'three';
import { ARENA_DIMENSIONS, type createArena } from '@/libs/world/world-arena';
import { animateWorldHorse } from '@/libs/world/world-horse';

export const WORLD_ARENA_BATTLE = {
  fightSeconds: 8,
  victorySeconds: 4,
  respawnSeconds: 15,
  victoryChance: 0.6,
  gladiatorFallGapSeconds: 3,
  defeatKillChance: 0.5,
} as const;

export interface WorldArenaBattleStatus {
  phase: 'fighting' | 'victory' | 'defeat';
  remaining: number;
}

interface WorldArenaBattleOptions {
  arena: Pick<ReturnType<typeof createArena>, 'group' | 'gladiators'>;
  player: THREE.Group;
  random?: () => number;
}

const visibleInScene = (object: THREE.Object3D) => {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible || current.userData.worldBurnPending) return false;
  }
  return true;
};

/** A local, absolute-time encounter. The scene owns mounting, controls and the full respawn reset. */
export function createWorldArenaBattle({ arena, player, random = Math.random }: WorldArenaBattleOptions) {
  const fighterParents = arena.gladiators.map(({ group }) => group.parent);
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  const playerArenaPosition = new THREE.Vector3();
  const startPosition = new THREE.Vector3();
  const startFighterPositions = arena.gladiators.map(({ group }) => group.position.clone());
  const fallenFighterPoses: ({ position: THREE.Vector3; yaw: number } | null)[] = arena.gladiators.map(() => null);
  const bounds = new THREE.Box3();
  const partBounds = new THREE.Box3();
  const path = new THREE.CatmullRomCurve3(
    [
      [0, 0, 4.3],
      [-2.7, 0, 1.7],
      [-2.1, 0, -2.8],
      [1.5, 0, -0.2],
      [3.8, 0, 1.2],
      [3.6, 0, -2.2],
      [0.7, 0, -2.8],
      [-1.6, 0, 0.5],
      [0, 0, 2.3],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  const effects = new THREE.Group();
  effects.name = 'arena-battle-effects';
  effects.visible = false;
  arena.group.add(effects);
  const sparks = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.065, 0),
    new THREE.MeshBasicMaterial({ color: '#FFD987', toneMapped: false }),
    28,
  );
  sparks.name = 'arena-sword-clash-sparks';
  sparks.frustumCulled = false;
  effects.add(sparks);
  const dust = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1, 32),
    new THREE.MeshBasicMaterial({ color: '#D7C29A', transparent: true, opacity: 0.3, depthWrite: false }),
  );
  dust.name = 'arena-hoof-dust';
  dust.rotation.x = -Math.PI / 2;
  effects.add(dust);
  const sparkPose = new THREE.Object3D();
  let status: WorldArenaBattleStatus | null = null;
  let outcome: 'victory' | 'defeat' | null = null;
  let started = false;
  let startedAt = 0;
  let lastTime = 0;
  let won = false;
  let defeatKillsGladiator = false;
  let respawnReady = false;
  let respawnConsumed = false;
  let horse: THREE.Object3D | undefined;
  let rightShoulder: THREE.Object3D | undefined;
  let rightElbow: THREE.Object3D | undefined;
  let leftShoulder: THREE.Object3D | undefined;
  let torso: THREE.Object3D | undefined;
  let riderPivot: THREE.Object3D | undefined;

  const canStart = () => {
    if (started || !arena.group.parent || !player.parent || !visibleInScene(arena.group)) return false;
    if (
      arena.gladiators.length !== 2 ||
      arena.gladiators.some(
        ({ group }, index) =>
          !fighterParents[index] ||
          group.parent !== fighterParents[index] ||
          !visibleInScene(group) ||
          group.userData.worldZombie ||
          group.userData.worldArenaCombat ||
          group.userData.worldArenaDead,
      )
    )
      return false;
    player.getWorldPosition(point);
    arena.group.worldToLocal(point);
    return (
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z) &&
      Math.abs(point.y) < 1 &&
      (point.x / (ARENA_DIMENSIONS.floorHalfWidth - 1.2)) ** 2 +
        (point.z / (ARENA_DIMENSIONS.floorHalfDepth - 1.2)) ** 2 <
        1
    );
  };

  const placePlayer = (x: number, z: number, yaw: number) => {
    playerArenaPosition.set(x, 0.15, z);
    worldPoint.copy(playerArenaPosition);
    arena.group.localToWorld(worldPoint);
    player.parent?.worldToLocal(worldPoint);
    player.position.copy(worldPoint);
    player.rotation.set(0, arena.group.rotation.y + yaw, 0);
  };

  const placeFighter = (index: number, x: number, z: number, yaw: number) => {
    const fighter = arena.gladiators[index].group;
    worldPoint.set(x, 0.17, z);
    arena.group.localToWorld(worldPoint);
    fighter.parent?.worldToLocal(worldPoint);
    fighter.position.copy(worldPoint);
    fighter.rotation.set(0, yaw, 0);
  };

  const fighterPositionAt = (index: number, elapsed: number, reducedMotion: boolean) =>
    point.set(
      (index ? 1 : -1) * (1.55 + (reducedMotion ? 0 : Math.sin(elapsed * 2.3) * 0.3)),
      0,
      -0.7 + (reducedMotion ? 0 : Math.cos(elapsed * 2.3 + index) * 0.45),
    );

  // Hidden armor stands, labels and sprites must not lift the fallen bodies off the sand.
  const restOnSand = (object: THREE.Object3D) => {
    bounds.makeEmpty();
    object.updateWorldMatrix(true, true);
    object.traverse((part) => {
      if (!(part instanceof THREE.Mesh) || !visibleInScene(part)) return;
      if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
      if (part.geometry.boundingBox)
        bounds.union(partBounds.copy(part.geometry.boundingBox).applyMatrix4(part.matrixWorld));
    });
    if (bounds.isEmpty()) return;
    point.set(0, 0.17, 0);
    arena.group.localToWorld(point);
    worldPoint.set(0, point.y - bounds.min.y, 0);
    if (object.parent) {
      object.parent.getWorldScale(point);
      worldPoint.y /= point.y;
    }
    object.position.y += worldPoint.y;
    object.updateWorldMatrix(true, true);
  };

  const poseKnight = (elapsed: number, reducedMotion: boolean, victory = false) => {
    const swing = reducedMotion ? 0.5 : (Math.sin(elapsed * 6.4) + 1) / 2;
    if (riderPivot) riderPivot.rotation.set(0, 0, 0);
    if (rightShoulder)
      rightShoulder.rotation.set(victory ? -2.8 : -1.8 + swing * 1.3, victory ? 0 : -0.45 + swing * 0.95, 0.55);
    if (rightElbow) rightElbow.rotation.x = victory ? -0.2 : -0.25 - swing * 0.3;
    if (leftShoulder) leftShoulder.rotation.set(-1.22, 0, -0.18);
    if (torso) torso.rotation.set(victory ? 0 : 0.18, 0, victory ? 0 : -0.15 * swing);
    if (horse) animateWorldHorse(horse, { mounted: true, speed: victory ? 0 : 14, time: elapsed, reducedMotion });
  };

  const poseFallenFighters = (elapsed: number, reducedMotion: boolean) => {
    arena.gladiators.forEach((fighter, index) => {
      const fallStarts =
        index === 0 && (won || defeatKillsGladiator)
          ? WORLD_ARENA_BATTLE.fightSeconds - WORLD_ARENA_BATTLE.gladiatorFallGapSeconds
          : index === 1 && won
            ? WORLD_ARENA_BATTLE.fightSeconds
            : null;
      if (fallStarts === null || elapsed < fallStarts) return;
      let pose = fallenFighterPoses[index];
      if (!pose) {
        // Evaluate the scheduled strike even when a hidden tab skips its frame.
        // Keeping this anchor prevents the corpse moving during the surviving fighter's attack.
        fighterPositionAt(index, fallStarts, reducedMotion);
        placeFighter(index, point.x, point.z, index ? -0.45 : 0.45);
        pose = { position: fighter.group.position.clone(), yaw: fighter.group.rotation.y };
        fallenFighterPoses[index] = pose;
        fighter.group.userData.worldArenaDead = true;
      }
      fighter.group.position.copy(pose.position);
      fighter.group.rotation.set(0, pose.yaw, 0);
      fighter.setFallenPose(
        reducedMotion ? 1 : THREE.MathUtils.smoothstep(elapsed - fallStarts, 0, 0.9),
        index ? 1 : -1,
      );
      restOnSand(fighter.group);
    });
  };

  const animateEffects = (elapsed: number, reducedMotion: boolean, celebration = false) => {
    effects.visible = !reducedMotion;
    if (reducedMotion) return;
    const beat = celebration ? elapsed / 1.2 : (elapsed * 1.4) % 1;
    sparks.visible = celebration ? elapsed < 1.2 : beat < 0.48;
    const burst = celebration ? Math.min(1, beat) : beat / 0.48;
    if (celebration) point.copy(playerArenaPosition);
    else {
      const preferred = Math.floor(elapsed * 1.4) % 2;
      const target =
        arena.gladiators[arena.gladiators[preferred].group.userData.worldArenaDead ? 1 - preferred : preferred].group;
      if (target.userData.worldArenaDead) sparks.visible = false;
      target.getWorldPosition(point);
      arena.group.worldToLocal(point);
    }
    for (let index = 0; index < sparks.count; index++) {
      const angle = index * 2.399963;
      const radius = burst * (0.7 + (index % 5) * 0.28) * (celebration ? 2.2 : 1);
      sparkPose.position.set(
        point.x + Math.cos(angle) * radius,
        (celebration ? 3 : 1.8) + Math.sin(index * 1.7) * radius + burst * (1 - burst),
        point.z + Math.sin(angle) * radius,
      );
      sparkPose.rotation.set(angle, angle * 0.7, elapsed + index);
      sparkPose.scale.setScalar(Math.max(0, 1 - burst) * (celebration ? 1.7 : 1));
      sparkPose.updateMatrix();
      sparks.setMatrixAt(index, sparkPose.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
    dust.visible = !celebration;
    dust.position.set(playerArenaPosition.x, 0.19, playerArenaPosition.z);
    const dustBeat = (elapsed * 2.2) % 1;
    dust.scale.setScalar(0.8 + dustBeat * 1.5);
    dust.material.opacity = (1 - dustBeat) * 0.25;
  };

  const poseFight = (elapsed: number, reducedMotion: boolean) => {
    if (reducedMotion) placePlayer(0, 2.3, Math.PI);
    else if (elapsed < 1) {
      const approach = THREE.MathUtils.smoothstep(elapsed, 0, 1);
      placePlayer(
        THREE.MathUtils.lerp(startPosition.x, 0, approach),
        THREE.MathUtils.lerp(startPosition.z, 4.3, approach),
        Math.PI,
      );
    } else {
      const progress = THREE.MathUtils.clamp((elapsed - 1) / 6.4, 0, 1);
      path.getPointAt(progress, point);
      path.getTangentAt(progress, tangent);
      placePlayer(point.x, point.z, Math.atan2(tangent.x, tangent.z));
    }
    poseKnight(elapsed, reducedMotion);
    for (let index = 0; index < arena.gladiators.length; index++) {
      if (arena.gladiators[index].group.userData.worldArenaDead) continue;
      const stride = reducedMotion ? 0 : Math.sin(elapsed * 10 + index * Math.PI);
      const strike = reducedMotion ? 0.55 : Math.max(0, Math.sin(elapsed * 6.4 + index * Math.PI));
      const { x, z } = fighterPositionAt(index, elapsed, reducedMotion);
      const yaw = Math.atan2(playerArenaPosition.x - x, playerArenaPosition.z - z);
      placeFighter(index, x, z, yaw);
      if (elapsed < 1 && !reducedMotion)
        arena.gladiators[index].group.position.lerp(
          startFighterPositions[index],
          1 - THREE.MathUtils.smoothstep(elapsed, 0, 1),
        );
      arena.gladiators[index].setCombatPose({ stride, strike, guard: 1 - strike });
    }
    animateEffects(elapsed, reducedMotion);
  };

  const poseOutcome = (elapsed: number, reducedMotion: boolean) => {
    placePlayer(0, 2.3, won ? Math.PI / 7 : -Math.PI / 7);
    if (won) {
      poseKnight(elapsed, reducedMotion, true);
      animateEffects(elapsed, reducedMotion, true);
    } else {
      effects.visible = false;
      const fall = reducedMotion ? 1 : THREE.MathUtils.smoothstep(elapsed, 0, 1.1);
      if (riderPivot) riderPivot.rotation.set(0, 0, 0);
      if (torso) torso.rotation.set(0, 0, 0);
      if (rightShoulder) rightShoulder.rotation.set(-0.25, 0, -0.35);
      if (rightElbow) rightElbow.rotation.x = -0.25;
      if (leftShoulder) leftShoulder.rotation.set(-0.15, 0, -0.4);
      if (horse) {
        animateWorldHorse(horse, { mounted: true, speed: 0, time: 0, reducedMotion: true });
        const head = horse.getObjectByName('horse-head');
        if (head) head.rotation.x = 0.22 * fall;
      }
      player.rotation.z = (-Math.PI / 2) * fall;
      restOnSand(player);
      arena.gladiators.forEach((fighter, index) => {
        if (fighter.group.userData.worldArenaDead) return;
        placeFighter(index, index ? 2.5 : -2, -1.7, index ? -0.4 : 0.5);
        fighter.setCombatPose({ stride: 0, strike: 0, guard: 0.35 });
      });
    }
  };

  return {
    canStart,
    start(nowSeconds: number) {
      if (!Number.isFinite(nowSeconds) || !canStart()) return false;
      started = true;
      startedAt = nowSeconds;
      lastTime = nowSeconds;
      won = random() < WORLD_ARENA_BATTLE.victoryChance;
      defeatKillsGladiator = !won && random() < WORLD_ARENA_BATTLE.defeatKillChance;
      player.getWorldPosition(startPosition);
      arena.group.worldToLocal(startPosition);
      horse = player.getObjectByName('transport-horse');
      rightShoulder = player.getObjectByName('right-shoulder');
      rightElbow = player.getObjectByName('right-elbow');
      leftShoulder = player.getObjectByName('left-shoulder');
      torso = player.getObjectByName('hoodie-torso');
      riderPivot = player.getObjectByName('explorer-rider-pivot');
      player.userData.worldArenaCombat = true;
      arena.gladiators.forEach((fighter, index) => {
        startFighterPositions[index].copy(fighter.group.position);
        fighter.setCombatOwned(true);
      });
      status = { phase: 'fighting', remaining: WORLD_ARENA_BATTLE.fightSeconds };
      return true;
    },
    update(nowSeconds: number, reducedMotion: boolean) {
      if (!status || !Number.isFinite(nowSeconds)) return;
      lastTime = Math.max(lastTime, nowSeconds);
      const elapsed = lastTime - startedAt;
      poseFallenFighters(elapsed, reducedMotion);
      if (elapsed < WORLD_ARENA_BATTLE.fightSeconds) {
        status = { phase: 'fighting', remaining: Math.ceil(WORLD_ARENA_BATTLE.fightSeconds - elapsed) };
        poseFight(elapsed, reducedMotion);
        return;
      }
      if (status.phase === 'fighting') {
        outcome = won ? 'victory' : 'defeat';
        if (!won) player.userData.worldArenaDead = true;
      }
      const afterFight = elapsed - WORLD_ARENA_BATTLE.fightSeconds;
      const remaining = Math.max(
        0,
        Math.ceil((won ? WORLD_ARENA_BATTLE.victorySeconds : WORLD_ARENA_BATTLE.respawnSeconds) - afterFight),
      );
      status = { phase: won ? 'victory' : 'defeat', remaining };
      poseOutcome(afterFight, reducedMotion);
      if (remaining === 0 && won) {
        status = null;
        effects.visible = false;
        player.userData.worldArenaCombat = false;
      } else if (remaining === 0 && !respawnConsumed) respawnReady = true;
    },
    getStatus: () => (status ? { ...status } : null),
    /** The result survives the temporary banner, including a frame that skips the celebration. */
    getOutcome: () => outcome,
    isLocked: () => status !== null,
    consumeRespawn() {
      if (!respawnReady) return false;
      respawnReady = false;
      respawnConsumed = true;
      return true;
    },
  };
}

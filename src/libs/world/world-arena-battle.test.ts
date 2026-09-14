import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorldArenaBattle, WORLD_ARENA_BATTLE } from '@/libs/world/world-arena-battle';
import { disposeObject } from '@/libs/world/world-geometry';

const scenes: THREE.Scene[] = [];
const fixture = (roll = 0.5, defeatRoll = 0.8) => {
  const scene = new THREE.Scene();
  scenes.push(scene);
  const group = new THREE.Group();
  group.position.set(55, 0, 48);
  scene.add(group);
  const duel = new THREE.Group();
  duel.position.set(0, 0.17, -1.4);
  group.add(duel);
  const gladiators = [-1, 1].map((side) => {
    const fighter = new THREE.Group();
    fighter.position.x = side;
    duel.add(fighter);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), new THREE.MeshBasicMaterial());
    body.position.y = 0.9;
    fighter.add(body);
    return {
      group: fighter,
      setCombatOwned: vi.fn((owned: boolean) => (fighter.userData.worldArenaCombat = owned)),
      setCombatPose: vi.fn(),
      setFallenPose: vi.fn((progress: number) => {
        fighter.rotation.x = (-Math.PI / 2) * progress;
      }),
      setZombiePose: vi.fn(),
      setEscapePose: vi.fn(),
    };
  });
  const player = new THREE.Group();
  player.position.set(55, 0.15, 52);
  scene.add(player);
  const horse = new THREE.Group();
  horse.name = 'transport-horse';
  const horseBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 2.8), new THREE.MeshBasicMaterial());
  horseBody.position.y = 1.4;
  horse.add(horseBody);
  player.add(horse);
  const armor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.7), new THREE.MeshBasicMaterial());
  armor.name = 'knight-chest';
  armor.position.y = 3.3;
  player.add(armor);
  const hiddenStand = armor.clone();
  hiddenStand.visible = false;
  hiddenStand.position.x = 20;
  horse.add(hiddenStand);
  const random = vi.fn(() => defeatRoll).mockReturnValueOnce(roll);
  const battle = createWorldArenaBattle({ arena: { group, gladiators }, player, random });
  return { scene, group, gladiators, player, horse, armor, horseBody, random, battle };
};

afterEach(() => {
  scenes.splice(0).forEach(disposeObject);
  vi.restoreAllMocks();
});

describe('mounted arena battle', () => {
  it('only accepts a finite start time on the arena sand with both living fighters', () => {
    const { battle, player, group, gladiators, random } = fixture();
    player.position.z = 65;
    expect(battle.canStart()).toBe(false);
    expect(battle.start(0)).toBe(false);
    player.position.z = 52;
    expect(battle.start(Number.NaN)).toBe(false);
    for (const unavailable of ['worldBurnPending', 'worldZombie', 'worldArenaDead', 'worldArenaCombat']) {
      gladiators[0].group.userData[unavailable] = true;
      expect(battle.start(0)).toBe(false);
      delete gladiators[0].group.userData[unavailable];
    }
    group.visible = false;
    expect(battle.start(0)).toBe(false);
    group.visible = true;
    gladiators[1].group.visible = false;
    expect(battle.start(0)).toBe(false);
    gladiators[1].group.visible = true;
    expect(random).not.toHaveBeenCalled();
    expect(battle.canStart()).toBe(true);
    expect(battle.start(20)).toBe(true);
    expect(random).toHaveBeenCalledOnce();
    expect(battle.start(20)).toBe(false);
    expect(random).toHaveBeenCalledOnce();
    expect(gladiators.every(({ group: fighter }) => fighter.userData.worldArenaCombat)).toBe(true);
  });

  it('rejects a fighter removed by fire before entering', () => {
    const { battle, gladiators, scene } = fixture();
    scene.attach(gladiators[0].group);
    expect(battle.canStart()).toBe(false);
  });

  it.each([
    [0, 'victory'],
    [0.599999, 'victory'],
    [0.6, 'defeat'],
    [0.999999, 'defeat'],
  ] as const)('resolves roll %s as %s at the 60 percent boundary, exactly once', (roll, outcome) => {
    const { battle, random } = fixture(roll);
    battle.start(10);
    battle.update(17.999, false);
    expect(battle.getStatus()?.phase).toBe('fighting');
    battle.update(18, false);
    expect(battle.getStatus()?.phase).toBe(outcome);
    for (let time = 18; time < 19; time += 0.05) battle.update(time, false);
    expect(random).toHaveBeenCalledTimes(outcome === 'victory' ? 1 : 2);
  });

  it.each([false, true])(
    'defeats the gladiators three seconds apart with reduced motion set to %s',
    (reducedMotion) => {
      const { battle, gladiators } = fixture();
      battle.start(10);
      battle.update(14.999, reducedMotion);
      expect(gladiators.every(({ group }) => !group.userData.worldArenaDead)).toBe(true);
      const firstCombatCalls = gladiators[0].setCombatPose.mock.calls.length;
      battle.update(15, reducedMotion);
      expect(gladiators[0].group.userData.worldArenaDead).toBe(true);
      expect(gladiators[1].group.userData.worldArenaDead).not.toBe(true);
      expect(battle.getStatus()).toEqual({ phase: 'fighting', remaining: 3 });
      battle.update(15.9, reducedMotion);
      const firstCorpse = [...gladiators[0].group.position.toArray(), ...gladiators[0].group.quaternion.toArray()];
      battle.update(17.999, reducedMotion);
      expect(gladiators[1].group.userData.worldArenaDead).not.toBe(true);
      expect([...gladiators[0].group.position.toArray(), ...gladiators[0].group.quaternion.toArray()]).toEqual(
        firstCorpse,
      );
      battle.update(18, reducedMotion);
      expect(gladiators[1].group.userData.worldArenaDead).toBe(true);
      expect(battle.getStatus()).toEqual({ phase: 'victory', remaining: 4 });
      expect(gladiators[0].setCombatPose).toHaveBeenCalledTimes(firstCombatCalls);
      expect([...gladiators[0].group.position.toArray(), ...gladiators[0].group.quaternion.toArray()]).toEqual(
        firstCorpse,
      );
    },
  );

  it.each([
    [0, true],
    [0.499999, true],
    [0.5, false],
    [0.999999, false],
  ] as const)('uses an independent defeat roll %s for a prior gladiator casualty (%s)', (defeatRoll, hasCasualty) => {
    const { battle, gladiators, player, random } = fixture(0.6, defeatRoll);
    battle.start(0);
    battle.update(4.999, false);
    expect(gladiators.every(({ group }) => !group.userData.worldArenaDead)).toBe(true);
    battle.update(5, false);
    expect(Boolean(gladiators[0].group.userData.worldArenaDead)).toBe(hasCasualty);
    expect(gladiators[1].group.userData.worldArenaDead).not.toBe(true);
    expect(player.userData.worldArenaDead).not.toBe(true);
    battle.update(6, false);
    const firstCorpse = [...gladiators[0].group.position.toArray(), ...gladiators[0].group.quaternion.toArray()];
    const firstCombatCalls = gladiators[0].setCombatPose.mock.calls.length;
    battle.update(8, false);
    expect(battle.getStatus()).toEqual({ phase: 'defeat', remaining: 15 });
    expect(player.userData.worldArenaDead).toBe(true);
    expect(gladiators.filter(({ group }) => group.userData.worldArenaDead)).toHaveLength(hasCasualty ? 1 : 0);
    battle.update(22.999, false);
    expect(battle.consumeRespawn()).toBe(false);
    if (hasCasualty) {
      expect([...gladiators[0].group.position.toArray(), ...gladiators[0].group.quaternion.toArray()]).toEqual(
        firstCorpse,
      );
      expect(gladiators[0].setCombatPose).toHaveBeenCalledTimes(firstCombatCalls);
    }
    battle.update(23, false);
    expect(battle.consumeRespawn()).toBe(true);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('aims sword clash effects only at the surviving gladiator after the first one falls', () => {
    const { battle, gladiators, group } = fixture();
    battle.start(0);
    battle.update(5.9, false);
    const deadPosition = vi.spyOn(gladiators[0].group, 'getWorldPosition');
    const livingPosition = vi.spyOn(gladiators[1].group, 'getWorldPosition');
    battle.update(6, false);
    expect(group.getObjectByName('arena-sword-clash-sparks')?.visible).toBe(true);
    expect(deadPosition).not.toHaveBeenCalled();
    expect(livingPosition).toHaveBeenCalledOnce();
  });

  it('keeps both visible gladiators fallen after victory and releases the upright rider', () => {
    const { battle, gladiators, player, armor, horse } = fixture();
    battle.start(0);
    battle.update(8, false);
    expect(battle.getStatus()).toEqual({ phase: 'victory', remaining: 4 });
    expect(battle.isLocked()).toBe(true);
    battle.update(10, false);
    for (const { group } of gladiators) {
      expect(group.userData.worldArenaDead).toBe(true);
      expect(group.visible).toBe(true);
      expect(group.rotation.x).toBeCloseTo(-Math.PI / 2);
      expect(new THREE.Box3().setFromObject(group).min.y).toBeCloseTo(0.17);
    }
    battle.update(12, false);
    const corpses = gladiators.map(({ group }) => [...group.position.toArray(), ...group.rotation.toArray()]);
    battle.update(100, false);
    expect(gladiators.map(({ group }) => [...group.position.toArray(), ...group.rotation.toArray()])).toEqual(corpses);
    expect(battle.getStatus()).toBeNull();
    expect(battle.isLocked()).toBe(false);
    expect(player.rotation.z).toBe(0);
    expect(player.userData.worldArenaCombat).toBe(false);
    expect(armor.visible).toBe(true);
    expect(horse.parent).toBe(player);
    expect(battle.start(100)).toBe(false);
    expect(battle.consumeRespawn()).toBe(false);
  });

  it('shows the armored rider and horse on the floor for a full 15 seconds then requests one reset', () => {
    const { battle, player, horse, horseBody, armor, gladiators } = fixture(0.8);
    battle.start(100);
    battle.update(108, false);
    expect(battle.getStatus()).toEqual({ phase: 'defeat', remaining: 15 });
    expect(player.userData.worldArenaDead).toBe(true);
    battle.update(109.2, false);
    expect(battle.getStatus()?.remaining).toBe(14);
    expect(player.rotation.z).toBeCloseTo(-Math.PI / 2);
    expect(horse.parent).toBe(player);
    expect(armor.visible).toBe(true);
    const visibleBounds = new THREE.Box3().setFromObject(horseBody).union(new THREE.Box3().setFromObject(armor));
    expect(visibleBounds.min.y).toBeCloseTo(0.17);
    expect(visibleBounds.max.y).toBeLessThan(1.5);
    expect(gladiators.every(({ group }) => !group.userData.worldArenaDead)).toBe(true);
    battle.update(122.999, false);
    expect(battle.getStatus()?.remaining).toBe(1);
    expect(battle.consumeRespawn()).toBe(false);
    battle.update(123, false);
    expect(battle.getStatus()?.remaining).toBe(0);
    expect(battle.isLocked()).toBe(true);
    expect(battle.consumeRespawn()).toBe(true);
    expect(battle.consumeRespawn()).toBe(false);
    battle.update(150, false);
    expect(battle.consumeRespawn()).toBe(false);
  });

  it('preserves the outcome and countdown across paused frames, invalid times and a clock rollback', () => {
    const { battle, random } = fixture(0.9);
    battle.start(20);
    battle.update(40, false);
    expect(battle.getStatus()).toEqual({ phase: 'defeat', remaining: 3 });
    battle.update(21, false);
    battle.update(Number.NaN, false);
    expect(battle.getStatus()).toEqual({ phase: 'defeat', remaining: 3 });
    battle.update(500, false);
    expect(battle.consumeRespawn()).toBe(true);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('retains a victory for achievements when a suspended frame skips the whole celebration', () => {
    const { battle, gladiators } = fixture();
    battle.start(0);
    expect(battle.getOutcome()).toBeNull();
    battle.update(30, false);
    expect(battle.getStatus()).toBeNull();
    expect(battle.getOutcome()).toBe('victory');
    expect(battle.isLocked()).toBe(false);
    expect(gladiators.every(({ group }) => group.userData.worldArenaDead)).toBe(true);
    expect(gladiators.every(({ group }) => Math.abs(group.rotation.x + Math.PI / 2) < 1e-8)).toBe(true);
  });

  it.each([false, true])(
    'restores the earlier casualty and player defeat when a hidden frame skips the encounter (%s)',
    (reducedMotion) => {
      const { battle, gladiators, player } = fixture(0.8, 0.2);
      battle.start(0);
      battle.update(30, reducedMotion);
      expect(battle.getOutcome()).toBe('defeat');
      expect(battle.getStatus()).toEqual({ phase: 'defeat', remaining: 0 });
      expect(gladiators[0].group.userData.worldArenaDead).toBe(true);
      expect(gladiators[0].group.rotation.x).toBeCloseTo(-Math.PI / 2);
      expect(gladiators[1].group.userData.worldArenaDead).not.toBe(true);
      expect(player.rotation.z).toBeCloseTo(-Math.PI / 2);
      expect(battle.consumeRespawn()).toBe(true);
    },
  );

  it('uses still combat and fallen poses under reduced motion with identical encounter timing', () => {
    const { battle, player, group, gladiators } = fixture(0.8);
    battle.start(0);
    battle.update(1, true);
    const pose = [...player.position.toArray(), ...player.quaternion.toArray()];
    const fighterPoses = gladiators.map(({ group }) => [...group.position.toArray(), ...group.quaternion.toArray()]);
    battle.update(7, true);
    expect([...player.position.toArray(), ...player.quaternion.toArray()]).toEqual(pose);
    expect(gladiators.map(({ group }) => [...group.position.toArray(), ...group.quaternion.toArray()])).toEqual(
      fighterPoses,
    );
    expect(group.getObjectByName('arena-battle-effects')?.visible).toBe(false);
    battle.update(WORLD_ARENA_BATTLE.fightSeconds, true);
    expect(player.rotation.z).toBeCloseTo(-Math.PI / 2);
    expect(battle.getStatus()).toEqual({ phase: 'defeat', remaining: 15 });
  });
});

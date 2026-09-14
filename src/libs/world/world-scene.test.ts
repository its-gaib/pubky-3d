import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORLD_INFECTION } from '@/libs/world/world-infection';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import { createWorld } from '@/libs/world/world-scene';
import { WORLD_KEY_COUNT, WORLD_UNLOCK_COSTS } from '@/libs/world/world-transport-unlocks';
import type { WorldController, WorldStatus } from '@/libs/world/world-types';
import { asOpaque } from '@/test-utils/type-assertions';

const harness = vi.hoisted(() => ({
  renderers: [] as {
    loop: ((timestamp: number) => void) | null;
    scene: import('three').Scene | null;
    domElement: HTMLCanvasElement;
  }[],
  players: [] as ReturnType<typeof import('@/libs/world/world-persona').createPersona>[],
  transports: [] as ReturnType<typeof import('@/libs/world/world-transports').createWorldTransports>[],
  tools: [] as ReturnType<typeof import('@/libs/world/world-flamethrower').createWorldFlamethrower>[],
  battles: [] as ReturnType<typeof import('@/libs/world/world-arena-battle').createWorldArenaBattle>[],
  glories: [] as ReturnType<typeof import('@/libs/world/world-arena-glory').createWorldArenaGlory>[],
  crowds: [] as ReturnType<typeof import('@/libs/world/world-crowd').createWorldCrowd>[],
  battleRoll: 0.5,
}));

// Keep scene construction, geometry, physics, interactions and encounters real;
// replace the unavailable GPU and record its frame callback for deterministic time.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      shadowMap = { enabled: false, type: 0 };
      loop: ((timestamp: number) => void) | null = null;
      scene: import('three').Scene | null = null;
      constructor() {
        harness.renderers.push(this);
      }
      setPixelRatio() {}
      setSize() {}
      setAnimationLoop(loop: ((timestamp: number) => void) | null) {
        this.loop = loop;
      }
      render(scene: import('three').Scene, camera: import('three').Camera) {
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        this.scene = scene;
      }
      dispose() {}
      forceContextLoss() {}
    },
    PMREMGenerator: class {
      fromScene() {
        return { texture: new actual.Texture(), dispose() {} };
      }
      dispose() {}
    },
  };
});

vi.mock('@/libs/world/world-persona', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/world/world-persona')>();
  return {
    ...actual,
    createPersona(...args: Parameters<typeof actual.createPersona>) {
      const player = actual.createPersona(...args);
      harness.players.push(player);
      return player;
    },
  };
});

vi.mock('@/libs/world/world-transports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/world/world-transports')>();
  return {
    ...actual,
    createWorldTransports(...args: Parameters<typeof actual.createWorldTransports>) {
      const transports = actual.createWorldTransports(...args);
      harness.transports.push(transports);
      return transports;
    },
  };
});

vi.mock('@/libs/world/world-arena-battle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/world/world-arena-battle')>();
  return {
    ...actual,
    createWorldArenaBattle(options: Parameters<typeof actual.createWorldArenaBattle>[0]) {
      const battle = actual.createWorldArenaBattle({ ...options, random: () => harness.battleRoll });
      harness.battles.push(battle);
      return battle;
    },
  };
});

vi.mock('@/libs/world/world-flamethrower', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/world/world-flamethrower')>();
  return {
    ...actual,
    createWorldFlamethrower(...args: Parameters<typeof actual.createWorldFlamethrower>) {
      const tool = actual.createWorldFlamethrower(...args);
      harness.tools.push(tool);
      return tool;
    },
  };
});

vi.mock('@/libs/world/world-arena-glory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/world/world-arena-glory')>();
  return {
    ...actual,
    createWorldArenaGlory(...args: Parameters<typeof actual.createWorldArenaGlory>) {
      const glory = actual.createWorldArenaGlory(...args);
      harness.glories.push(glory);
      return glory;
    },
  };
});

vi.mock('@/libs/world/world-crowd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/world/world-crowd')>();
  return {
    ...actual,
    createWorldCrowd(...args: Parameters<typeof actual.createWorldCrowd>) {
      const crowd = actual.createWorldCrowd(...args);
      harness.crowds.push(crowd);
      return crowd;
    },
  };
});

const controllers: WorldController[] = [];

function visibleBounds(root: THREE.Object3D) {
  const bounds = new THREE.Box3();
  const partBounds = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((part) => {
    if (!(part instanceof THREE.Mesh)) return;
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox)
      bounds.union(partBounds.copy(part.geometry.boundingBox).applyMatrix4(part.matrixWorld));
  });
  return bounds;
}

beforeEach(() => {
  harness.battleRoll = 0.5;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => asOpaque<MediaQueryList>({ matches: true })),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  let seed = 174;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  });
});

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  harness.renderers.length = harness.players.length = harness.transports.length = harness.battles.length = 0;
  harness.tools.length = 0;
  harness.glories.length = 0;
  harness.crowds.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const container = document.createElement('div');
  document.body.append(container);
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1200, 800));
  const onStatus = vi.fn<(status: WorldStatus) => void>();
  const onRespawn = vi.fn();
  const controller = createWorld(container, {
    data: { source: 'production', tags: [], trendingPosts: [], people: [], relationships: [] },
    onInteract: vi.fn(),
    onReady: vi.fn(),
    onStatus,
    onRespawn,
  });
  controllers.push(controller);
  const renderer = harness.renderers.at(-1)!;
  const player = harness.players.at(-1)!;
  const transports = harness.transports.at(-1)!;
  const battle = harness.battles.at(-1)!;
  const tool = harness.tools.at(-1)!;
  const glory = harness.glories.at(-1)!;
  let timestamp = 1000;
  const frame = (at = timestamp + 50) => {
    timestamp = at;
    renderer.loop?.(timestamp);
  };
  const refresh = () => {
    for (let count = 0; count < 5; count++) frame();
  };
  controller.setOverview(false);
  frame();
  const scene = renderer.scene!;
  const keys = scene.children.filter((object) => object.name === 'Collectible explorer key');
  const status = () => onStatus.mock.calls.at(-1)![0];
  const approachHorse = () => {
    player.group.position.copy(transports.getModel('horse')!.getWorldPosition(new THREE.Vector3())).setY(0.15);
    refresh();
  };
  const collect = (index = 0) => {
    player.group.position.copy(keys[index].position).setY(0.15);
    frame();
  };
  const mountHorse = () => {
    for (let index = 0; index < WORLD_UNLOCK_COSTS.horse; index++) collect(index);
    approachHorse();
    controller.interact();
    refresh();
    expect(transports.active?.id).toBe('horse');
  };
  const enterArena = () => {
    transports.transfer(WORLD_ANCHORS.arena[0], WORLD_ANCHORS.arena[1] + 4, Math.PI);
    frame();
    expect(battle.getStatus()?.phase).toBe('fighting');
    return timestamp;
  };
  return {
    controller,
    scene,
    player,
    transports,
    battle,
    tool,
    glory,
    keys,
    status,
    frame,
    refresh,
    approachHorse,
    collect,
    mountHorse,
    enterArena,
    onRespawn,
  };
}

describe('world gameplay integration', () => {
  it('counts living zombies and susceptible humans, including the player but excluding immune social identities', () => {
    const world = fixture();
    expect(world.status().population).toEqual({ zombies: 1, livingPeople: 113 });
    const person = {
      id: 'visitor',
      name: 'Visitor',
      degree: 1 as const,
      color: '#C8FF03',
      position: [0, 0] as [number, number],
      bio: '',
    };
    world.controller.updateData({
      source: 'production',
      tags: [],
      trendingPosts: [],
      relationships: [],
      people: [person, person],
    });
    world.refresh();
    expect(world.status().population).toEqual({ zombies: 1, livingPeople: 113 });
    // Advance only the real crowd's bite cooldown before presenting the player as prey.
    const crowd = harness.crowds.at(-1)!;
    for (let frame = 0; frame < WORLD_INFECTION.biteCooldown / 0.05 + 1; frame++) {
      crowd.tick(0.05, frame * 0.05, {
        position: new THREE.Vector3(0, 100, 0),
        zombie: false,
        canBeBitten: false,
        bite: false,
      });
    }
    world.scene.getObjectByName('crowd-zombie-0')!.position.copy(world.player.group.position);
    world.frame();
    expect(world.status().infection?.bitten).toBe(true);
    expect(world.status().population).toEqual({ zombies: 2, livingPeople: 113 });
    world.player.group.userData.worldArenaDead = true;
    world.refresh();
    expect(world.status().population).toEqual({ zombies: 1, livingPeople: 112 });
  }, 45_000);

  it('spawns the full key budget and charges three keys only on the first successful horse mount', () => {
    const world = fixture();
    expect(world.keys).toHaveLength(WORLD_KEY_COUNT);
    expect(world.status().keys).toEqual({ available: 0, total: WORLD_KEY_COUNT, unlocked: 0 });
    world.approachHorse();
    world.controller.interact();
    world.refresh();
    expect(world.transports.active).toBeNull();
    expect(world.status().nearby).toContain('Find 3 keys to unlock');
    world.collect(0);
    world.collect(1);
    world.approachHorse();
    world.controller.interact();
    world.refresh();
    expect(world.transports.active).toBeNull();
    expect(world.status().keys?.available).toBe(2);
    expect(world.status().nearby).toContain('Find 1 key to unlock');
    world.mountHorse();
    expect(world.keys[0].visible).toBe(false);
    expect(world.status().keys).toEqual({ available: 0, total: WORLD_KEY_COUNT, unlocked: 1 });
    expect(world.transports.getModel('horse')?.getObjectByName('transport-lock-horse')?.visible).toBe(false);
    world.controller.interact();
    world.refresh();
    expect(world.transports.active).toBeNull();
    world.approachHorse();
    world.controller.interact();
    world.refresh();
    expect(world.transports.active?.id).toBe('horse');
    expect(world.status().keys?.available).toBe(0);
  }, 45_000);

  it('triggers one knight sweep for an actual zombie knockdown and never strikes living people', () => {
    const world = fixture();
    const sweep = vi.spyOn(world.player, 'triggerKnightSweep');
    world.mountHorse();
    world.transports.transfer(0, 24, 0);
    world.frame();
    expect(sweep).not.toHaveBeenCalled();
    const zombie = world.scene.getObjectByName('crowd-zombie-0')!;
    const human = world.scene.getObjectByName('crowd-human-0')!;
    expect(world.status().population).toEqual({ zombies: 1, livingPeople: 113 });
    zombie.position.set(0.8, 0.15, 24.2);
    human.position.set(-0.8, 0.15, 24.2);
    world.frame();
    expect(sweep).toHaveBeenCalledOnce();
    expect(sweep).toHaveBeenCalledWith(expect.any(Number));
    expect(zombie.userData.worldZombieFallen).toBe(true);
    expect(human.userData.worldZombieFallen).toBeUndefined();
    world.refresh();
    expect(sweep).toHaveBeenCalledOnce();
    expect(world.status().achievementProgress?.['zombie-jouster']).toBe(1);
    expect(world.status().population).toEqual({ zombies: 0, livingPeople: 112 });
  }, 45_000);

  it('charges two keys for a successful flamethrower pickup, including a pending pickup, and re-equips for free', () => {
    const world = fixture();
    const approach = () => {
      world.player.group.position.copy(world.tool.model.getWorldPosition(new THREE.Vector3())).setY(0.15);
      world.refresh();
    };
    approach();
    world.controller.interact();
    world.refresh();
    expect(world.tool.equipped).toBe(false);
    expect(world.status().nearby).toContain('Find 2 keys to unlock flamethrower');
    world.collect(0);
    approach();
    world.controller.interact();
    world.refresh();
    expect(world.tool.equipped).toBe(false);
    expect(world.status().keys?.available).toBe(1);
    world.collect(1);
    approach();
    const unavailable = vi.spyOn(world.tool, 'equip').mockReturnValue(false);
    world.controller.interact();
    world.refresh();
    expect(world.status().keys?.available).toBe(2);
    expect(world.tool.equipped).toBe(false);
    unavailable.mockRestore();
    world.refresh();
    expect(world.tool.equipped).toBe(true);
    expect(world.status().keys).toEqual({ available: 0, total: WORLD_KEY_COUNT, unlocked: 0 });
    expect(world.status().tool?.id).toBe('flamethrower');
    expect(world.tool.model.getObjectByName('tool-lock-flamethrower')?.visible).toBe(false);
    world.player.group.position.set(0, 0.15, 24);
    world.controller.interact();
    world.refresh();
    expect(world.tool.equipped).toBe(false);
    approach();
    world.controller.interact();
    world.refresh();
    expect(world.tool.equipped).toBe(true);
    expect(world.status().keys?.available).toBe(0);
  }, 45_000);

  it('starts only for the mounted knight and leaves both visible corpses after victory and resumed movement', () => {
    const world = fixture();
    const celebrate = vi.spyOn(world.glory, 'celebrateVictory');
    const setIdentity = vi.spyOn(world.glory, 'setIdentity');
    const viewer = { id: 'y'.repeat(52), avatarUrl: `https://nexus.pubky.app/static/avatar/${'y'.repeat(52)}` };
    world.controller.setAvatarIdentities(viewer, []);
    expect(setIdentity).toHaveBeenLastCalledWith(viewer);
    world.player.group.position.set(WORLD_ANCHORS.arena[0], 0.15, WORLD_ANCHORS.arena[1] + 4);
    world.frame();
    expect(world.battle.getStatus()).toBeNull();
    world.mountHorse();
    const population = world.status().population!;
    const began = world.enterArena();
    expect(world.status().population).toEqual(population);
    world.frame(began + 5_000);
    world.refresh();
    expect(world.status().population).toEqual({ ...population, livingPeople: population.livingPeople - 1 });
    world.frame(began + 10_000);
    expect(world.battle.getStatus()?.phase).toBe('victory');
    expect(world.status().population).toEqual({ ...population, livingPeople: population.livingPeople - 2 });
    expect(celebrate).toHaveBeenCalledOnce();
    world.frame(began + 12_000);
    expect(world.battle.isLocked()).toBe(false);
    const fighters = ['arena-gladiator-crimson', 'arena-gladiator-teal'].map(
      (name) => world.scene.getObjectByName(name)!,
    );
    const corpses = fighters.map((fighter) => [...fighter.position.toArray(), ...fighter.rotation.toArray()]);
    expect(fighters.every((fighter) => fighter.visible && fighter.userData.worldArenaDead)).toBe(true);
    const before = world.player.group.position.clone();
    world.controller.setMove(1, 0);
    world.refresh();
    expect(world.player.group.position.distanceTo(before)).toBeGreaterThan(0.05);
    expect(fighters.map((fighter) => [...fighter.position.toArray(), ...fighter.rotation.toArray()])).toEqual(corpses);
    expect(world.player.group.rotation.z).toBe(0);
    expect(celebrate).toHaveBeenCalledOnce();
    world.controller.setAvatarIdentities(null, []);
    expect(setIdentity).toHaveBeenLastCalledWith(null);
    expect(world.onRespawn).not.toHaveBeenCalled();
  }, 45_000);

  it('records distinct dance locations and counts a dragon roll only after its animation completes', () => {
    const world = fixture();
    for (const zone of ['plaza', 'forest', 'university'] as const) {
      world.controller.travelTo(zone);
      world.controller.dance();
      world.frame();
    }
    expect(world.status().achievementProgress?.['dance-break']).toBe(3);
    world.controller.travelTo('forest');
    world.controller.dance();
    world.frame();
    expect(world.status().achievementProgress?.['dance-break']).toBe(3);

    world.collect();
    const dragon = world.transports.getModel('dragon')!;
    world.player.group.position.copy(dragon.getWorldPosition(new THREE.Vector3())).setY(0.15);
    world.refresh();
    world.controller.interact();
    world.frame();
    expect(world.transports.active?.id).toBe('dragon');
    // Position the real autonomous ride in clear air, then use its normal stunt state machine.
    world.transports.active!.altitude = 14;
    world.frame();
    world.controller.stunt();
    expect(world.transports.active!.stuntProgress).not.toBeNull();
    world.refresh();
    expect(world.status().achievementProgress?.['through-the-fire'] ?? 0).toBe(0);
    // Complete the real transport animation between scene observations, avoiding
    // repeated fire raycasts over unrelated procedural landmarks in this test.
    for (let count = 0; count < 25; count++) world.transports.step(0.05, { x: 0, z: 0, yaw: 0, lift: 0, brake: false });
    world.refresh();
    expect(world.status().achievementProgress?.['through-the-fire']).toBe(1);
    expect(world.status().achievementProgress?.['stunt-collector']).toBe(1);
  }, 45_000);

  it('holds the armored rider and horse dead through controls, teleport and pause until one respawn after 15 seconds', () => {
    harness.battleRoll = 0.8;
    const world = fixture();
    world.mountHorse();
    const population = world.status().population!;
    const began = world.enterArena();
    world.frame(began + 8_000);
    expect(world.battle.getStatus()).toEqual({ phase: 'defeat', remaining: 15 });
    expect(world.status().achievementProgress?.['glorious-end']).toBe(1);
    const fallen = world.player.group.position.clone();
    const horse = world.transports.getModel('horse')!;
    const armor = world.player.group.getObjectByName('knight-chest')!;
    expect(horse.visible).toBe(true);
    expect(armor.visible).toBe(true);
    expect(visibleBounds(horse).min.y).toBeLessThan(0.65);
    expect(visibleBounds(world.player.group.getObjectByName('explorer-riding-figure')!).min.y).toBeLessThan(0.65);
    expect(world.player.group.rotation.z).toBeCloseTo(-Math.PI / 2);
    expect(world.player.group.userData.worldArenaDead).toBe(true);
    expect(world.status().population).toEqual({ ...population, livingPeople: population.livingPeople - 1 });
    for (const code of ['KeyE', 'KeyR', 'KeyW', 'Space']) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    world.controller.interact();
    world.controller.travelTo('plaza');
    world.controller.setOverview(true);
    world.controller.setPaused(true);
    world.controller.setMove(1, 1);
    world.controller.jump();
    world.frame(began + 22_000);
    expect(world.player.group.position.distanceTo(fallen)).toBeLessThan(0.00001);
    expect(world.transports.active?.id).toBe('horse');
    expect(armor.visible).toBe(true);
    expect(world.battle.getStatus()?.remaining).toBe(1);
    expect(world.onRespawn).not.toHaveBeenCalled();
    world.frame(began + 23_000);
    expect(world.onRespawn).toHaveBeenCalledOnce();
    world.refresh();
    expect(world.onRespawn).toHaveBeenCalledOnce();
    const respawn = fixture();
    expect(respawn.keys.every((key) => key.visible)).toBe(true);
    expect(respawn.status().keys).toEqual({ available: 0, total: WORLD_KEY_COUNT, unlocked: 0 });
    expect(respawn.keys.map((key) => [key.position.x, key.position.z])).not.toEqual(
      world.keys.map((key) => [key.position.x, key.position.z]),
    );
    expect(respawn.transports.active).toBeNull();
    expect(respawn.battle.getStatus()).toBeNull();
    expect(respawn.player.group.userData.worldArenaDead).toBeUndefined();
    expect(respawn.status().population).toEqual({ zombies: 1, livingPeople: 113 });
  }, 45_000);

  it('publishes the defeat badge before respawn when a frame skips the whole outcome countdown', () => {
    harness.battleRoll = 0.8;
    const world = fixture();
    world.mountHorse();
    const began = world.enterArena();
    world.onRespawn.mockImplementation(() => {
      expect(world.status().achievementProgress?.['glorious-end']).toBe(1);
    });
    world.frame(began + 30_000);
    expect(world.onRespawn).toHaveBeenCalledOnce();
  }, 45_000);
});

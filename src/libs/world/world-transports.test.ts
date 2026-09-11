import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Dragon from '@/libs/world/world-dragon';
import { disposeObject } from '@/libs/world/world-geometry';
import type { WorldObstacle } from '@/libs/world/world-motion';
import type { createPersona } from '@/libs/world/world-persona';
import { rideDefinition, WORLD_RIDEABLES } from '@/libs/world/world-transport-motion';
import { createWorldTransports, type WorldTransportAction } from '@/libs/world/world-transports';
import type { WorldRideableId } from '@/libs/world/world-types';
import { asOpaque } from '@/test-utils/type-assertions';

describe('world transport ownership and animation', () => {
  const fixtures: { scene: THREE.Scene; transports: ReturnType<typeof createWorldTransports> }[] = [];

  function create(existing: WorldObstacle[] = []) {
    const scene = new THREE.Scene();
    const obstacles = [...existing];
    const initialSlots = obstacles.length;
    // The controller consumes only the scene anchor and pose boundary; the real
    // rider's articulation and contact solver have their own geometry tests.
    const player = {
      group: new THREE.Group(),
      transportMount: new THREE.Group(),
      setRidePose: vi.fn<ReturnType<typeof createPersona>['setRidePose']>(),
    } satisfies Pick<ReturnType<typeof createPersona>, 'group' | 'transportMount' | 'setRidePose'>;
    player.group.add(player.transportMount);
    scene.add(player.group);
    const models = new Map<WorldRideableId, THREE.Object3D>();
    const register = vi.fn<(object: THREE.Object3D, action: WorldTransportAction, title: string) => void>(
      (object, action) => {
        models.set(action.id, object);
      },
    );
    const transports = createWorldTransports(
      scene,
      obstacles,
      register,
      asOpaque<ReturnType<typeof createPersona>>(player),
    );
    fixtures.push({ scene, transports });
    const model = (kind: WorldRideableId) => models.get(kind)!;
    const slot = (kind: WorldRideableId) =>
      obstacles[initialSlots + WORLD_RIDEABLES.findIndex(({ id }) => id === kind)];
    const mount = (kind: WorldRideableId) => {
      player.group.position.copy(model(kind).position);
      return transports.mount(kind);
    };
    return { scene, obstacles, player, register, models, transports, model, slot, mount };
  }

  afterEach(() => {
    for (const { scene, transports } of fixtures.splice(0)) {
      transports.dispose();
      disposeObject(scene);
    }
    vi.restoreAllMocks();
  });

  it('registers all six discoverable models and adds persistent obstacle slots without replacing existing obstacles', () => {
    const existing: WorldObstacle = { x: -65, z: -37, radius: 2, height: 2 };
    const { scene, obstacles, register, model, slot } = create([existing]);
    expect(obstacles).toHaveLength(7);
    expect(obstacles[0]).toBe(existing);
    expect(register.mock.calls.map(([, action, title]) => ({ action, title }))).toEqual(
      WORLD_RIDEABLES.map(({ id, name }) => ({ action: { kind: 'transport', id }, title: `Ride ${name}` })),
    );
    for (const { id } of WORLD_RIDEABLES) {
      const object = model(id);
      expect(object.parent).toBe(scene);
      expect(object.position.y).toBe(0.15);
      expect(slot(id).x).toBe(object.position.x);
      expect(slot(id).z).toBe(object.position.z);
      expect(slot(id).radius).toBeGreaterThan(0);
      expect(slot(id).enabled).not.toBe(false);
      const bounds = new THREE.Box3().setFromObject(object);
      expect(slot(id).height).toBeGreaterThanOrEqual(bounds.max.y - 1e-6);
    }
    expect(
      Math.hypot(model('skateboard').position.x - existing.x, model('skateboard').position.z - existing.z),
    ).toBeGreaterThan(existing.radius + rideDefinition('skateboard').radius);
  });

  it('mounts one nearby grounded vehicle and moves its existing model under the player mount', () => {
    const { scene, player, transports, model, slot, mount } = create();
    expect(transports.mount('kart')).toBe(false);
    expect(transports.isAvailable('kart')).toBe(false);
    player.group.position.copy(model('kart').position);
    player.group.position.y = 2;
    expect(transports.mount('kart')).toBe(false);
    expect(mount('kart')).toBe(true);
    expect(model('kart').parent).toBe(player.transportMount);
    expect(model('kart').position.toArray()).toEqual([0, 0, 0]);
    expect(model('kart').rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(player.group.rotation.y).toBe(rideDefinition('kart').rotation);
    expect(slot('kart').enabled).toBe(false);
    expect(transports.active?.id).toBe('kart');
    expect(transports.mount('bmx')).toBe(false);
    expect(transports.isAvailable('kart')).toBe(false);
    expect(model('bmx').parent).toBe(scene);
    expect(transports.getStatus()).toMatchObject({ id: 'kart', speed: 0, altitude: 0, grounded: true, stunt: null });
  });

  it('refuses blocked or airborne dismounts, then parks at the ridden position and steps onto clear ground', () => {
    const { scene, obstacles, player, transports, model, slot, mount } = create();
    expect(mount('kart')).toBe(true);
    const motion = transports.active!;
    const blocker: WorldObstacle = { x: motion.x, z: motion.z, radius: 10 };
    obstacles.push(blocker);
    expect(transports.dismount()).toBe(false);
    expect(model('kart').parent).toBe(player.transportMount);
    obstacles.pop();
    expect(transports.jump()).toBe(true);
    transports.step(1 / 60, { x: 0, z: 0, yaw: 0, lift: 0 });
    expect(transports.dismount()).toBe(false);
    for (let tick = 0; tick < 90; tick++) {
      transports.step(1 / 60, { x: 0, z: 1, yaw: 0, lift: 0 });
    }
    const parkedAt = { x: motion.x, z: motion.z, rotation: motion.rotation };
    expect(transports.dismount()).toBe(true);
    expect(transports.active).toBeNull();
    expect(transports.getStatus()).toBeNull();
    expect(model('kart').parent).toBe(scene);
    expect(model('kart').position.toArray()).toEqual([parkedAt.x, 0.15, parkedAt.z]);
    expect(model('kart').rotation.y).toBe(parkedAt.rotation);
    expect(slot('kart')).toMatchObject({ x: parkedAt.x, z: parkedAt.z, enabled: true });
    expect(player.setRidePose).toHaveBeenLastCalledWith(null);
    expect(player.group.position.y).toBe(0.15);
    for (const obstacle of obstacles) {
      if (obstacle.enabled === false) continue;
      expect(
        Math.hypot(player.group.position.x - obstacle.x, player.group.position.z - obstacle.z),
      ).toBeGreaterThanOrEqual(obstacle.radius + 0.65 - 1e-6);
    }
  });

  it('reuses the same models and obstacle slots through repeated mount and park cycles', () => {
    const { obstacles, models, transports, model, slot, mount } = create();
    const originalSlots = [...obstacles];
    const originalModels = [...models.values()];
    for (let cycle = 0; cycle < 8; cycle++) {
      const kind = WORLD_RIDEABLES[cycle % WORLD_RIDEABLES.length].id;
      expect(mount(kind)).toBe(true);
      transports.step(1 / 60, { x: 1, z: 0, yaw: 0, lift: 0 });
      if (kind === 'dragon') {
        expect(transports.dismount()).toBe(false);
        for (let tick = 0; tick < 600 && transports.active; tick++) {
          transports.step(1 / 60, { x: 0, z: 0, yaw: 0, lift: 0 });
        }
        expect(transports.active).toBeNull();
      } else expect(transports.dismount()).toBe(true);
      expect(obstacles).toHaveLength(6);
      obstacles.forEach((obstacle, index) => expect(obstacle).toBe(originalSlots[index]));
      [...models.values()].forEach((object, index) => expect(object).toBe(originalModels[index]));
      expect(slot(kind).x).toBe(model(kind).position.x);
      expect(slot(kind).z).toBe(model(kind).position.z);
      expect(slot(kind).enabled).toBe(true);
    }
  });

  it('resets a mounted model to a clear home position while preserving the scene-owned collision slot', () => {
    const { scene, obstacles, player, transports, model, slot, mount } = create();
    const home = model('skateboard').position.clone();
    const originalSlot = slot('skateboard');
    expect(mount('skateboard')).toBe(true);
    for (let tick = 0; tick < 60; tick++) {
      transports.step(1 / 60, { x: 1, z: 0, yaw: 0, lift: 0 });
    }
    const movedObstacle: WorldObstacle = { x: home.x, z: home.z, radius: 2 };
    obstacles.push(movedObstacle);
    transports.reset();
    expect(transports.active).toBeNull();
    expect(model('skateboard').parent).toBe(scene);
    expect(model('skateboard').rotation.y).toBe(rideDefinition('skateboard').rotation);
    expect(slot('skateboard')).toBe(originalSlot);
    expect(originalSlot.enabled).toBe(true);
    expect(Math.hypot(originalSlot.x - home.x, originalSlot.z - home.z)).toBeGreaterThanOrEqual(
      movedObstacle.radius + rideDefinition('skateboard').radius,
    );
    expect(player.setRidePose).toHaveBeenLastCalledWith(null);
    const parked = model('skateboard').position.clone();
    transports.reset();
    expect(model('skateboard').position).toEqual(parked);
  });

  it('shares the BMX crank phase with the rider and keeps pedal platforms level while the wheels turn', () => {
    const { player, transports, model, mount } = create();
    expect(mount('bmx')).toBe(true);
    expect(model('bmx').getObjectByName('kickstand')!.visible).toBe(false);
    transports.active!.velocityZ = 5;
    const crank = model('bmx').getObjectByName('pedal-crank')!;
    const wheel = model('bmx').getObjectByName('wheel-front')!;
    const axle = wheel.position.clone();
    transports.animate(0.1, 4);
    const pose = player.setRidePose.mock.lastCall![0]!;
    expect(pose).toMatchObject({ kind: 'bmx', speed: 5, airborne: false, stuntProgress: null });
    expect(crank.rotation.x).toBe(pose.pedalPhase);
    expect(crank.rotation.x).toBeGreaterThan(0);
    expect(wheel.rotation.x).toBeGreaterThan(0);
    expect(wheel.position).toEqual(axle);
    for (const name of ['pedal-left', 'pedal-right']) {
      const pedal = model('bmx').getObjectByName(name)!;
      expect(pedal.rotation.x).toBe(-crank.rotation.x);
      player.group.updateMatrixWorld(true);
      const up = new THREE.Vector3(0, 1, 0).transformDirection(pedal.matrixWorld);
      expect(up.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-8);
    }
    const phase = crank.rotation.x;
    const wheelAngle = wheel.rotation.x;
    transports.animate(0.1, 8, true);
    expect(crank.rotation.x).not.toBe(phase);
    expect(wheel.rotation.x).not.toBe(wheelAngle);
    expect(player.setRidePose.mock.lastCall![0]?.pedalPhase).toBe(crank.rotation.x);
    expect(transports.dismount()).toBe(true);
    expect(model('bmx').getObjectByName('kickstand')!.visible).toBe(true);
    const parkedAngle = wheel.rotation.x;
    transports.animate(1, 5);
    expect(wheel.rotation.x).toBe(parkedAngle);
    expect(player.setRidePose).toHaveBeenLastCalledWith(null);
  });

  it('spins both hoverboard fans only while mounted and emits jet exhaust only during flight', () => {
    const { transports, model, mount } = create();
    const front = model('hoverboard').getObjectByName('rotor-front')!;
    const rear = model('hoverboard').getObjectByName('rotor-rear')!;
    transports.animate(0.1, 1);
    expect(front.rotation.y).toBe(0);
    expect(mount('hoverboard')).toBe(true);
    transports.animate(0.1, 2);
    expect(front.rotation.y).toBeGreaterThan(0);
    expect(rear.rotation.y).toBe(front.rotation.y);
    const fanAngle = front.rotation.y;
    transports.animate(0.1, 20, true);
    expect(front.rotation.y).toBe(fanAngle);
    expect(rear.rotation.y).toBe(fanAngle);
    expect(transports.dismount()).toBe(true);
    expect(mount('jetpack')).toBe(true);
    expect(model('jetpack').position.toArray()).toEqual([0, 1.08, -0.5]);
    const exhausts = ['exhaust-left', 'exhaust-right'].map((name) => model('jetpack').getObjectByName(name)!);
    transports.animate(0.1, 3);
    exhausts.forEach((object) => expect(object.visible).toBe(false));
    transports.step(0.05, { x: 0, z: 0, yaw: 0, lift: 1 });
    transports.animate(0.05, 3.05);
    exhausts.forEach((object) => {
      expect(object.visible).toBe(true);
      expect(object.scale.y).toBeGreaterThan(0);
    });
    transports.animate(0.05, 123, true);
    const lengths = exhausts.map((object) => object.scale.y);
    transports.animate(0.05, 456, true);
    exhausts.forEach((object, index) => {
      expect(object.visible).toBe(true);
      expect(object.scale.y).toBe(lengths[index]);
    });
    transports.active!.altitude = 8;
    transports.active!.velocityY = 0;
    transports.animate(0.05, 500, true);
    const hoverLengths = exhausts.map((object) => object.scale.y);
    transports.active!.velocityY = 6;
    transports.animate(0.05, 501, true);
    exhausts.forEach((object, index) => expect(object.scale.y).toBeGreaterThan(hoverLengths[index]));
    transports.active!.altitude = 0.01;
    transports.animate(0.05, 502, true);
    exhausts.forEach((object) => {
      expect(object.visible).toBe(true);
      expect(object.scale.y * Number(object.userData.exhaustLength)).toBeLessThanOrEqual(0.01 + 1.247 - 0.08);
    });
    transports.reset();
    exhausts.forEach((object) => expect(object.visible).toBe(false));
  });

  it('wakes and flies the dragon without movement input, then lands and steps the passenger off automatically', () => {
    const animate = vi.spyOn(Dragon, 'animateWorldDragon');
    const { scene, player, transports, model, slot } = create();
    const dragon = model('dragon');
    transports.animate(0.1, 1);
    expect(animate).toHaveBeenLastCalledWith(dragon, {
      mounted: false,
      airborne: false,
      speed: 0,
      seconds: 0.1,
      time: 1,
      reducedMotion: false,
      breathingFire: false,
    });
    player.group.position.copy(dragon.position);
    player.group.position.x += slot('dragon').radius + 0.8;
    expect(transports.isAvailable('dragon')).toBe(true);
    expect(transports.mount('dragon')).toBe(true);
    expect(dragon.parent).toBe(player.transportMount);
    expect(dragon.position.toArray()).toEqual([0, 0, 0]);
    expect(slot('dragon').enabled).toBe(false);
    expect(transports.jump()).toBe(false);
    for (let tick = 0; tick < 60; tick++) {
      transports.step(1 / 60, { x: 0, z: 0, yaw: 0, lift: 0 });
    }
    transports.animate(0.1, 2, true);
    expect(animate).toHaveBeenLastCalledWith(dragon, {
      mounted: true,
      airborne: true,
      speed: 0,
      seconds: 0.1,
      time: 2,
      reducedMotion: true,
      breathingFire: false,
    });
    expect(player.setRidePose).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'dragon', airborne: true, stuntProgress: null }),
    );
    expect(transports.dismount()).toBe(false);
    expect(transports.getStatus()).toMatchObject({ id: 'dragon', landing: true });
    expect(dragon.parent).toBe(player.transportMount);
    for (let tick = 0; tick < 1800 && transports.active; tick++) {
      transports.step(1 / 60, { x: 1, z: 1, yaw: 2, lift: 1 });
    }
    expect(transports.active).toBeNull();
    expect(transports.getStatus()).toBeNull();
    expect(dragon.parent).toBe(scene);
    expect(slot('dragon').enabled).toBe(true);
    expect(animate).toHaveBeenLastCalledWith(dragon, {
      mounted: false,
      airborne: false,
      speed: 0,
      seconds: 0,
      time: 0,
      reducedMotion: true,
    });
    expect(
      Math.hypot(player.group.position.x - dragon.position.x, player.group.position.z - dragon.position.z),
    ).toBeGreaterThan(slot('dragon').radius + 0.65);
    transports.animate(0.1, 3, true);
    expect(animate).toHaveBeenLastCalledWith(dragon, expect.objectContaining({ mounted: false, reducedMotion: true }));
    expect(player.setRidePose).toHaveBeenLastCalledWith(null);
  });

  it('finishes an airborne dragon roll before landing and ignores repeated landing requests', () => {
    const { scene, player, transports, model, slot, mount } = create();
    expect(mount('dragon')).toBe(true);
    for (let tick = 0; tick < 600; tick++) {
      transports.step(1 / 60, { x: 0, z: 0, yaw: 0, lift: 0 });
    }
    expect(transports.stunt()).toBe(true);
    const motion = transports.active!;
    const altitude = motion.altitude;
    expect(transports.dismount()).toBe(false);
    const target = motion.autopilot!.target;
    expect(transports.dismount()).toBe(false);
    expect(motion.autopilot!.target).toBe(target);
    for (let tick = 0; tick < 30; tick++) {
      transports.step(1 / 60, { x: 0, z: 0, yaw: 0, lift: 0 });
    }
    expect(motion.stuntProgress).not.toBeNull();
    expect(motion.altitude).toBeGreaterThan(altitude - 1);
    expect(transports.getStatus()).toMatchObject({ id: 'dragon', landing: true, stunt: 'Fire roll' });
    expect(transports.stunt()).toBe(false);
    for (let tick = 0; tick < 2400 && transports.active; tick++) {
      transports.step(1 / 60, { x: 0, z: 0, yaw: 0, lift: 0 });
    }
    expect(transports.active).toBeNull();
    expect(model('dragon').parent).toBe(scene);
    expect(model('dragon').userData.dragonSleeping).toBe(true);
    expect(slot('dragon').enabled).toBe(true);
    expect(player.transportMount.children).toHaveLength(0);
    expect(player.group.position.y).toBe(0.15);
  });

  it('clears horizontal input while retaining a ground vehicle jump and stopping all flying rides', () => {
    const { transports, mount } = create();
    expect(mount('skateboard')).toBe(true);
    expect(transports.jump()).toBe(true);
    transports.step(1 / 60, { x: 1, z: 1, yaw: 0, lift: 0 });
    const jumpVelocity = transports.active!.velocityY;
    transports.clearInput();
    expect(transports.active).toMatchObject({ velocityX: 0, velocityZ: 0, velocityY: jumpVelocity });
    expect(jumpVelocity).toBeGreaterThan(0);
    transports.reset();
    for (const id of ['jetpack', 'dragon'] as const) {
      expect(mount(id)).toBe(true);
      transports.step(0.05, { x: 1, z: 1, yaw: 0, lift: 1 });
      expect(transports.active!.velocityY).toBeGreaterThan(0);
      transports.clearInput();
      expect(transports.active).toMatchObject({ velocityX: 0, velocityZ: 0, velocityY: 0 });
      transports.reset();
    }
  });

  it('transfers an active ride without cloning the model and detaches it before scene disposal', () => {
    const { scene, obstacles, player, transports, model, slot, mount } = create();
    expect(mount('kart')).toBe(true);
    transports.jump();
    transports.step(0.05, { x: 1, z: 0, yaw: 0, lift: 0 });
    transports.transfer(4, 7, 1.2);
    expect(transports.active).toMatchObject({
      id: 'kart',
      x: 4,
      z: 7,
      rotation: 1.2,
      altitude: 0,
      velocityX: 0,
      velocityY: 0,
      velocityZ: 0,
    });
    expect(model('kart').parent).toBe(player.transportMount);
    expect(slot('kart').enabled).toBe(false);
    transports.step(0, { x: 0, z: 0, yaw: 0, lift: 0 });
    expect(player.group.position.toArray()).toEqual([4, 0.15, 7]);
    expect(player.group.rotation.y).toBe(1.2);
    transports.dispose();
    expect(transports.active).toBeNull();
    expect(model('kart').parent).toBe(scene);
    expect(player.transportMount.children).toHaveLength(0);
    expect(slot('kart')).toMatchObject({ enabled: true, x: 4, z: 7 });
    expect(obstacles).toHaveLength(6);
    expect(player.setRidePose).toHaveBeenLastCalledWith(null);
    transports.dispose();
    expect(model('kart').parent).toBe(scene);
  });

  it('exposes stable burn targets and refuses to mount a burned parked ride', () => {
    const { player, transports, model, slot, mount } = create();
    expect(transports.burnEntries).toHaveLength(6);
    for (const entry of transports.burnEntries) {
      expect(entry.model).toBe(model(entry.id));
      expect(entry.obstacle).toBe(slot(entry.id));
      expect(transports.getModel(entry.id)).toBe(entry.model);
    }
    const entries = transports.burnEntries;
    model('bmx').visible = false;
    transports.setAvailable('bmx', false);
    player.group.position.copy(model('bmx').position);
    expect(transports.isAvailable('bmx')).toBe(false);
    expect(transports.mount('bmx')).toBe(false);
    expect(slot('bmx').enabled).toBe(false);
    transports.reset();
    expect(model('bmx').visible).toBe(false);
    expect(slot('bmx').enabled).toBe(false);
    expect(mount('kart')).toBe(true);
    expect(transports.getModel('kart')!.parent).toBe(player.transportMount);
    expect(transports.burnEntries).toBe(entries);
    expect(transports.getModel('bmx')!.visible).toBe(false);
  });

  it('preserves disabled collision and hidden visuals through transfer, dismount, reset and disposal', () => {
    for (const exit of ['dismount', 'reset', 'dispose'] as const) {
      const { scene, transports, model, slot, mount } = create();
      expect(mount('kart')).toBe(true);
      transports.setAvailable('kart', false);
      model('kart').visible = false;
      transports.transfer(4, 7, 1.2);
      expect(slot('kart').enabled).toBe(false);
      if (exit === 'dismount') expect(transports.dismount()).toBe(true);
      else transports[exit]();
      expect(transports.active).toBeNull();
      expect(model('kart').parent).toBe(scene);
      expect(model('kart').visible).toBe(false);
      expect(slot('kart').enabled).toBe(false);
      transports.setAvailable('kart', true);
      expect(slot('kart').enabled).toBe(true);
      // Restoring burn visuals belongs to the burn registry, not availability.
      expect(model('kart').visible).toBe(false);
    }
  });

  it('opens the dragon fire breath only inside the active stunt window and leaves burned models alone', () => {
    const animate = vi.spyOn(Dragon, 'animateWorldDragon');
    const { transports, model, slot, mount } = create();
    expect(mount('dragon')).toBe(true);
    transports.active!.altitude = 12;
    for (const [progress, expected] of [
      [null, false],
      [0, false],
      [0.08, true],
      [0.5, true],
      [0.85, true],
      [0.851, false],
    ] as const) {
      transports.active!.stuntProgress = progress;
      transports.animate(1 / 60, 1, true);
      expect(animate).toHaveBeenLastCalledWith(
        model('dragon'),
        expect.objectContaining({ mounted: true, breathingFire: expected }),
      );
    }
    const calls = animate.mock.calls.length;
    transports.setAvailable('dragon', false);
    model('dragon').visible = false;
    transports.animate(1 / 60, 2);
    expect(animate).toHaveBeenCalledTimes(calls);
    transports.reset();
    expect(slot('dragon').enabled).toBe(false);
    expect(model('dragon').visible).toBe(false);
  });
});

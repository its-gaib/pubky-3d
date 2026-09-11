import * as THREE from 'three';
import { animateWorldDragon } from '@/libs/world/world-dragon';
import type { WorldObstacle } from '@/libs/world/world-motion';
import type { createPersona } from '@/libs/world/world-persona';
import { createWorldTransportModel } from '@/libs/world/world-transport-models';
import {
  canMountRide,
  createRideMotion,
  jumpRide,
  requestAutonomousRideLanding,
  resolveRidePosition,
  rideDismountPosition,
  type RideInput,
  type RideMotion,
  rideStatus,
  startRideStunt,
  stepRide,
  WORLD_RIDEABLES,
  worldRideCanFly,
  worldRideIsAutonomous,
} from '@/libs/world/world-transport-motion';
import type { WorldRideableId } from '@/libs/world/world-types';

export interface WorldTransportAction {
  kind: 'transport';
  id: WorldRideableId;
}

/** Physical discoveries and at most one active ride. All resources belong to the scene. */
export function createWorldTransports(
  scene: THREE.Scene,
  obstacles: WorldObstacle[],
  register: (object: THREE.Object3D, action: WorldTransportAction, title: string) => void,
  player: ReturnType<typeof createPersona>,
) {
  const items = WORLD_RIDEABLES.map((definition) => {
    const model = createWorldTransportModel(definition.id);
    const home = resolveRidePosition(...definition.position, definition.radius + 0.3, obstacles);
    model.position.set(home.x, 0.15, home.z);
    model.rotation.y = definition.rotation;
    scene.add(model);
    const obstacle: WorldObstacle = {
      x: home.x,
      z: home.z,
      radius: definition.parkedRadius ?? definition.radius * 0.8,
      height: new THREE.Box3().setFromObject(model).max.y,
    };
    obstacles.push(obstacle);
    register(model, { kind: 'transport', id: definition.id }, `Ride ${definition.name}`);
    const animated: THREE.Object3D[] = [];
    model.traverse((object) => {
      if (object.userData.transportAnimation) animated.push(object);
    });
    return { definition, model, home, obstacle, animated, available: true };
  });
  const burnEntries = items.map(({ definition, model, obstacle }) => ({ id: definition.id, model, obstacle }));
  let active: RideMotion | null = null;
  let pedalPhase = 0;

  const park = (x: number, z: number, rotation: number) => {
    if (!active) return;
    const item = items.find((item) => item.definition.id === active?.id)!;
    scene.add(item.model);
    item.model.position.set(x, 0.15, z);
    item.model.rotation.set(0, rotation, 0);
    const kickstand = item.model.getObjectByName('kickstand');
    if (kickstand && item.available) kickstand.visible = true;
    item.obstacle.x = x;
    item.obstacle.z = z;
    item.obstacle.enabled = item.available;
    active = null;
    player.setRidePose(null);
    item.animated.forEach((object) => {
      if (object.userData.transportAnimation === 'exhaust') object.visible = false;
    });
    if (item.definition.id === 'dragon' && item.available)
      animateWorldDragon(item.model, {
        mounted: false,
        airborne: false,
        speed: 0,
        seconds: 0,
        time: 0,
        reducedMotion: true,
      });
  };

  return {
    burnEntries,
    get active() {
      return active;
    },
    getModel(id: WorldRideableId) {
      return items.find((item) => item.definition.id === id)?.model ?? null;
    },
    setAvailable(id: WorldRideableId, available: boolean) {
      const item = items.find((item) => item.definition.id === id);
      if (!item) return;
      item.available = available;
      item.obstacle.enabled = available && active?.id !== id;
    },
    isAvailable(id: WorldRideableId) {
      const item = items.find((item) => item.definition.id === id);
      return !active && !!item?.available && canMountRide(player.group.position, item.model.position, id);
    },
    mount(id: WorldRideableId) {
      const item = items.find((item) => item.definition.id === id);
      if (active || !item?.available || !canMountRide(player.group.position, item.model.position, id)) return false;
      item.obstacle.enabled = false;
      active = createRideMotion(id, item.model.position.x, item.model.position.z, item.model.rotation.y);
      player.group.position.set(active.x, 0.15, active.z);
      player.group.rotation.y = active.rotation;
      player.transportMount.add(item.model);
      item.model.position.set(0, id === 'jetpack' ? 1.08 : 0, id === 'jetpack' ? -0.5 : 0);
      item.model.rotation.set(0, 0, 0);
      const kickstand = item.model.getObjectByName('kickstand');
      if (kickstand) kickstand.visible = false;
      pedalPhase = 0;
      return true;
    },
    dismount() {
      if (!active) return false;
      if (worldRideIsAutonomous(active.id)) {
        requestAutonomousRideLanding(active, obstacles);
        return false;
      }
      const destination = rideDismountPosition(active, obstacles);
      if (!destination) return false;
      park(active.x, active.z, active.rotation);
      player.group.position.set(destination.x, 0.15, destination.z);
      return true;
    },
    reset() {
      if (!active) return;
      const item = items.find((item) => item.definition.id === active?.id)!;
      const home = resolveRidePosition(item.home.x, item.home.z, item.definition.radius + 0.3, obstacles);
      park(home.x, home.z, item.definition.rotation);
    },
    clearInput() {
      if (!active) return;
      active.velocityX = 0;
      active.velocityZ = 0;
      if (worldRideCanFly(active.id)) active.velocityY = 0;
    },
    jump() {
      return active ? jumpRide(active) : false;
    },
    stunt() {
      return active ? startRideStunt(active, obstacles) : false;
    },
    step(seconds: number, input: RideInput) {
      if (!active) return;
      stepRide(active, input, seconds, obstacles);
      player.group.position.set(active.x, 0.15 + active.altitude, active.z);
      player.group.rotation.y = active.rotation;
      if (
        active.autopilot?.phase === 'descending' &&
        active.altitude === 0 &&
        active.stuntProgress === null &&
        Math.hypot(active.velocityX, active.velocityZ) < 0.8
      ) {
        const destination = rideDismountPosition(active, obstacles);
        if (destination) {
          park(active.x, active.z, active.rotation);
          player.group.position.set(destination.x, 0.15, destination.z);
        }
      }
    },
    transfer(x: number, z: number, rotation: number) {
      if (!active) return;
      active = createRideMotion(active.id, x, z, rotation);
    },
    animate(seconds: number, time: number, reducedMotion = false) {
      for (const item of items) {
        if (item.definition.id !== 'dragon' || !item.available) continue;
        const dragon = active?.id === item.definition.id ? active : null;
        const breathingFire =
          !!dragon && dragon.stuntProgress !== null && dragon.stuntProgress >= 0.08 && dragon.stuntProgress <= 0.85;
        animateWorldDragon(item.model, {
          mounted: !!dragon,
          airborne: !!dragon && dragon.altitude > 0.12,
          speed: dragon ? Math.hypot(dragon.velocityX, dragon.velocityZ) : 0,
          seconds,
          time,
          reducedMotion,
          breathingFire,
        });
      }
      if (!active) {
        player.setRidePose(null);
        return;
      }
      const speed = Math.hypot(active.velocityX, active.velocityZ);
      const item = items.find((item) => item.definition.id === active?.id)!;
      pedalPhase = (pedalPhase + (seconds * speed) / 0.55) % (Math.PI * 2);
      for (const object of item.animated) {
        const animation = object.userData.transportAnimation;
        const axis: unknown = object.userData.rotationAxis;
        if (object.name === 'pedal-crank') object.rotation.x = pedalPhase;
        else if (animation === 'pedal-platform') object.rotation.x = -pedalPhase;
        else if (animation === 'wheel' && (axis === 'x' || axis === 'y' || axis === 'z')) {
          const radius = Math.max(0.05, Number(object.userData.wheelRadius) || 0.3);
          object.rotation[axis] = (object.rotation[axis] + (seconds * speed) / radius) % (Math.PI * 2);
        } else if (animation === 'rotor' && !reducedMotion)
          object.rotation.y = (object.rotation.y + seconds * 28) % (Math.PI * 2);
        else if (animation === 'exhaust') {
          object.visible = active.altitude > 0.05 || active.velocityY > 0;
          const baseLength = Math.max(0.1, Number(object.userData.exhaustLength) || 0.3);
          // The mounted nozzle sits 1.247m above ground before flight altitude.
          const groundClearance = Math.max(0, active.altitude + 1.247 - 0.08);
          const thrust = 1.05 + Math.max(0, active.velocityY) * 0.1 + Math.min(1, speed / 22) * 0.18;
          object.scale.y = Math.min(
            groundClearance / baseLength,
            thrust + (reducedMotion ? 0 : Math.sin(time * 25) * 0.04),
          );
        }
      }
      player.setRidePose({
        kind: active.id,
        speed,
        airborne: active.altitude > 0.12,
        lean: active.lean,
        stuntProgress: active.stuntProgress,
        pedalPhase,
      });
    },
    getStatus() {
      return active ? rideStatus(active) : null;
    },
    /** Detach mounted resources so scene disposal still sees every vehicle. */
    dispose() {
      if (active) park(active.x, active.z, active.rotation);
    },
  };
}

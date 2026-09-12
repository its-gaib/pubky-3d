import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAMETHROWER_GRIPS } from '@/libs/world/world-flamethrower';
import { disposeObject } from '@/libs/world/world-geometry';
import { createPersona, PERSONA_DIMENSIONS, type WorldPersonaRidePose } from '@/libs/world/world-persona';

describe('articulated Pubky explorer', () => {
  const figures: ReturnType<typeof createPersona>[] = [];
  const create = (color?: string) => {
    const figure = createPersona(color);
    figures.push(figure);
    return figure;
  };
  it('changes the explorer into a green, hunched zombie with slow asymmetric steps', () => {
    const figure = create();
    figure.setZombie();
    figure.animate(0.3, 'walk');
    expect(figure.group.userData.worldZombie).toBe(true);
    expect(figure.accent.color.getHexString()).toBe('7ea552');
    expect(figure.body.rotation.x).toBeCloseTo(0.22);
    expect(figure.leftArm.rotation.x).toBeLessThan(-1.2);
    expect(figure.rightArm.rotation.x).toBeLessThan(-1);
    expect(Math.abs(figure.leftLeg.rotation.x)).toBeLessThan(0.26);
    figure.animate(1, 'dance', true);
    const leftArm = figure.leftArm.rotation.toArray();
    figure.animate(20, 'walk', true);
    expect(figure.leftArm.rotation.toArray()).toEqual(leftArm);
    expect(figure.group.getObjectByName('explorer-profile-portrait')!.visible).toBe(false);
  });
  const rideKinds = ['skateboard', 'jetpack', 'kart', 'bmx', 'hoverboard', 'dragon'] as const;
  it('wears knight armor on horseback, swings the sword automatically and removes the gear on infection', () => {
    const figure = create();
    figure.setRidePose({ kind: 'horse', speed: 8, airborne: false, lean: 0, stuntProgress: null });
    figure.animate(0, 'walk');
    const sword = figure.group.getObjectByName('knight-sword')!;
    const helmet = figure.group.getObjectByName('knight-helmet')!;
    expect(sword.visible).toBe(true);
    expect(helmet.visible).toBe(true);
    const first = figure.rightArm.rotation.toArray();
    figure.animate(0.3, 'walk');
    expect(figure.rightArm.rotation.toArray()).not.toEqual(first);
    figure.animate(1, 'walk', true);
    const still = figure.rightArm.rotation.toArray();
    figure.animate(10, 'walk', true);
    expect(figure.rightArm.rotation.toArray()).toEqual(still);
    figure.setRidePose(null);
    expect(sword.visible).toBe(false);
    expect(helmet.visible).toBe(false);
    figure.setRidePose({ kind: 'horse', speed: 0, airborne: false, lean: 0, stuntProgress: null });
    figure.animate(0, 'idle');
    figure.setZombie();
    expect(sword.visible).toBe(false);
    expect(helmet.visible).toBe(false);
  });
  const ride = (kind: WorldPersonaRidePose['kind'], overrides: Partial<WorldPersonaRidePose> = {}) => ({
    kind,
    speed: 8,
    airborne: false,
    lean: 0,
    stuntProgress: null,
    pedalPhase: 0,
    ...overrides,
  });
  const transforms = (figure: ReturnType<typeof createPersona>) => {
    figure.group.updateMatrixWorld(true);
    const matrices: number[][] = [];
    figure.group.traverse((object) => matrices.push(object.matrixWorld.toArray()));
    return matrices;
  };
  const vehiclePoint = (
    figure: ReturnType<typeof createPersona>,
    joint: THREE.Object3D,
    point: [number, number, number],
  ) => {
    figure.group.updateMatrixWorld(true);
    return figure.transportMount.worldToLocal(joint.localToWorld(new THREE.Vector3(...point)));
  };
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });
  afterEach(() => {
    for (const figure of figures) {
      figure.dispose();
      disposeObject(figure.group);
    }
    figures.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the explorer grounded within the original camera and collision proportions', () => {
    const figure = create();
    const bounds = new THREE.Box3().setFromObject(figure.group);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeGreaterThanOrEqual(PERSONA_DIMENSIONS.sole - 0.02);
    expect(bounds.min.y).toBeLessThan(0.07);
    expect(bounds.max.y).toBeLessThan(PERSONA_DIMENSIONS.height + 0.04);
    expect(size.y).toBeGreaterThan(2.65);
    expect(size.x).toBeLessThan(PERSONA_DIMENSIONS.shoulderWidth + 0.1);
    expect(size.z).toBeLessThan(1.05);
  });

  it('bends knees and elbows at their joints while retaining external position and heading ownership', () => {
    const figure = create();
    figure.group.position.set(8, 1.2, -4);
    figure.group.rotation.y = 1.7;
    figure.animate(Math.PI / 23, 'walk');
    expect(figure.leftKnee.parent).toBe(figure.leftLeg);
    expect(figure.leftFoot.parent).toBe(figure.leftKnee);
    expect(figure.rightElbow.parent).toBe(figure.rightArm);
    expect(figure.leftLeg.rotation.x).toBeGreaterThan(0.4);
    expect(figure.rightLeg.rotation.x).toBeLessThan(-0.4);
    expect(figure.leftKnee.rotation.x).toBeGreaterThan(0.5);
    expect(figure.rightKnee.rotation.x).toBe(0);
    expect(figure.rightElbow.rotation.x).toBeLessThan(-0.3);
    expect(figure.group.position.toArray()).toEqual([8, 1.2, -4]);
    expect(figure.group.rotation.y).toBe(1.7);

    figure.animate(2, 'jump');
    expect(figure.leftKnee.rotation.x).toBeGreaterThan(0.6);
    expect(figure.rightKnee.rotation.x).toBeGreaterThan(0.4);
    figure.animate(2, 'idle', true);
    expect(figure.leftKnee.rotation.x).toBe(0);
    expect(figure.rightKnee.rotation.x).toBe(0);
    expect(figure.leftFoot.rotation.x).toBe(0);
  });

  it('holds a still grounded pose for reduced motion across walking, dancing and long timestamps', () => {
    const figure = create();
    const transforms = () => {
      figure.group.updateMatrixWorld(true);
      const matrices: number[][] = [];
      figure.group.traverse((object) => matrices.push(object.matrixWorld.toArray()));
      return matrices;
    };
    figure.animate(1, 'walk', true);
    const initial = transforms();
    for (const seconds of [0, 100, 86400, Number.NaN, Number.POSITIVE_INFINITY]) {
      figure.animate(seconds, 'dance', true);
      expect(transforms()).toEqual(initial);
    }
  });

  it('keeps the vehicle floor aligned and confines every riding stunt to the inner visual pivot', () => {
    const figure = create();
    const pivot = figure.transportMount.parent!;
    expect(pivot.parent).toBe(figure.group);
    expect(pivot.position.toArray()).toEqual([0, 1, 0]);
    expect(figure.transportMount.position.toArray()).toEqual([0, -1, 0]);
    expect(figure.body.parent?.parent).toBe(pivot);
    figure.group.position.set(12, 3.5, -8);
    figure.group.rotation.y = 1.7;
    figure.group.updateMatrix();
    const rootMatrix = figure.group.matrix.toArray();
    for (const kind of rideKinds) {
      figure.setRidePose(ride(kind));
      figure.animate(2, 'walk', true);
      figure.group.updateMatrixWorld(true);
      const mountOrigin = figure.transportMount.getWorldPosition(new THREE.Vector3());
      expect(mountOrigin.distanceTo(figure.group.position)).toBeLessThan(1e-8);
      const neutral = transforms(figure);
      for (const progress of [0, 1]) {
        figure.setRidePose(ride(kind, { stuntProgress: progress }));
        figure.animate(2, 'walk', true);
        expect(transforms(figure)).toEqual(neutral);
      }
      figure.setRidePose(ride(kind, { airborne: true, stuntProgress: 0.5 }));
      figure.animate(2, 'walk', true);
      expect(transforms(figure)).not.toEqual(neutral);
      expect(figure.group.matrix.toArray()).toEqual(rootMatrix);
      if (kind === 'skateboard') {
        expect(Math.abs(pivot.rotation.x) + Math.abs(pivot.rotation.y) + Math.abs(pivot.rotation.z)).toBe(0);
        expect(figure.transportMount.rotation.z).toBeCloseTo(Math.PI);
      } else {
        expect(figure.transportMount.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
        const axis = kind === 'bmx' ? 'x' : kind === 'hoverboard' ? 'y' : 'z';
        expect(Math.abs(pivot.rotation[axis])).toBeCloseTo(Math.PI);
      }
    }
  });

  it('plants the sneakers on each board deck while retaining a bent balanced stance', () => {
    const figure = create();
    for (const kind of ['skateboard', 'hoverboard'] as const) {
      figure.setRidePose(ride(kind));
      figure.animate(2, 'walk', true);
      for (const [foot, side] of [
        [figure.leftFoot, -1],
        [figure.rightFoot, 1],
      ] as const) {
        const contact = vehiclePoint(figure, foot, [0, -0.161, 0.09]);
        expect(contact.y).toBeCloseTo(kind === 'skateboard' ? 0.285 : 0.218, 6);
        if (kind === 'hoverboard') {
          expect(contact.x).toBeCloseTo(side * 0.183, 6);
          expect(contact.z).toBeCloseTo(0, 6);
        }
      }
      expect(figure.leftKnee.rotation.x).toBeGreaterThan(0.2);
      expect(figure.rightKnee.rotation.x).toBeGreaterThan(0.2);
    }
  });

  it('keeps both hands on the kart wheel, BMX bars and dragon grips in vehicle coordinates', () => {
    const figure = create();
    for (const [kind, halfWidth, height, z] of [
      ['kart', 0.184, 1.04, 0.353],
      ['bmx', 0.325, 1.6, 0.516],
      ['dragon', 0.3, 2.05, 0.5],
    ] as const) {
      figure.setRidePose(ride(kind, { lean: 0.6 }));
      figure.animate(3, 'walk', true);
      for (const [elbow, side] of [
        [figure.leftElbow, -1],
        [figure.rightElbow, 1],
      ] as const) {
        const hand = vehiclePoint(figure, elbow, [0, -0.426, 0.012]);
        expect(hand.x).toBeCloseTo(side * halfWidth, 6);
        expect(hand.y).toBeCloseTo(height, 6);
        expect(hand.z).toBeCloseTo(z, 6);
      }
      if (kind === 'kart' || kind === 'dragon') {
        const [footX, footY, footZ] = kind === 'kart' ? [0.165, 0.36, 0.44] : [0.57, 1.22, 0.18];
        for (const [foot, side] of [
          [figure.leftFoot, -1],
          [figure.rightFoot, 1],
        ] as const) {
          const contact = vehiclePoint(figure, foot, [0, -0.161, 0.09]);
          expect(contact.x).toBeCloseTo(side * footX, 6);
          expect(contact.y).toBeCloseTo(footY, 6);
          expect(contact.z).toBeCloseTo(footZ, 6);
        }
      }
    }
  });

  it('follows the shared BMX crank phase instead of estimating pedal rotation from the current speed', () => {
    const figure = create();
    for (const phase of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      figure.setRidePose(ride('bmx', { pedalPhase: phase, speed: phase ? 12 : 0 }));
      figure.animate(1234, 'walk', true);
      const leftPedal = new THREE.Vector3(-0.207, -0.075, -0.12)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), phase)
        .add(new THREE.Vector3(0, 0.525, -0.117));
      const rightPedal = new THREE.Vector3(0.207, 0.075, 0.12)
        .applyAxisAngle(new THREE.Vector3(1, 0, 0), phase)
        .add(new THREE.Vector3(0, 0.525, -0.117));
      for (const [foot, pedal] of [
        [figure.leftFoot, leftPedal],
        [figure.rightFoot, rightPedal],
      ] as const) {
        const contact = vehiclePoint(figure, foot, [0, -0.161, 0.09]);
        pedal.y += 0.0235;
        expect(contact.distanceTo(pedal)).toBeLessThan(1e-6);
      }
    }
  });

  it('restores the walking figure immediately on dismount, including joint rotation order and offsets', () => {
    const figure = create();
    figure.animate(0.12, 'walk');
    const walking = transforms(figure);
    for (const kind of rideKinds) {
      figure.setRidePose(ride(kind, { lean: 0.7, stuntProgress: 0.4 }));
      figure.animate(0.12, 'walk');
      figure.setRidePose(null);
      expect(transforms(figure)).toEqual(walking);
      expect(figure.leftArm.rotation.order).toBe('XYZ');
      expect(figure.rightArm.rotation.order).toBe('XYZ');
    }
  });

  it('keeps both hands on the fixed flamethrower grips while aiming and walking without moving the player root', () => {
    const figure = create();
    figure.group.position.set(8, 0.15, -5);
    figure.group.rotation.y = 1.3;
    figure.group.updateMatrix();
    const originalRoot = figure.group.matrix.toArray();
    for (const pitch of [-0.65, -0.4, 0, 0.5, 0.8]) {
      figure.setToolPose(pitch);
      for (const animation of ['idle', 'walk'] as const) {
        for (const time of [0, 0.12, 0.27]) {
          figure.animate(time, animation);
          figure.group.updateMatrixWorld(true);
          for (const [elbow, target] of [
            [figure.leftElbow, FLAMETHROWER_GRIPS.left],
            [figure.rightElbow, FLAMETHROWER_GRIPS.right],
          ] as const) {
            const hand = figure.toolMount.worldToLocal(elbow.localToWorld(new THREE.Vector3(0, -0.426, 0.012)));
            expect(hand.distanceTo(new THREE.Vector3(...target))).toBeLessThan(1e-6);
          }
          expect(figure.group.matrix.toArray()).toEqual(originalRoot);
        }
      }
    }
  });

  it('restores walking hands, head and the floor tool anchor immediately when the held tool is dropped', () => {
    const figure = create();
    figure.animate(0.12, 'walk');
    const walking = transforms(figure);
    for (const pitch of [-0.4, 0, 0.5]) {
      figure.setToolPose(pitch);
      figure.animate(0.12, 'walk');
      expect(transforms(figure)).not.toEqual(walking);
      figure.setToolPose(null);
      expect(transforms(figure)).toEqual(walking);
      expect(figure.toolMount.position.toArray()).toEqual([0, 0, 0]);
      expect(figure.toolMount.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      expect(figure.leftArm.rotation.order).toBe('XYZ');
      expect(figure.rightArm.rotation.order).toBe('XYZ');
    }
  });

  it('bounds tool aim and treats non-finite pitch as a released tool', () => {
    const figure = create();
    figure.animate(0.12, 'walk', true);
    const standing = transforms(figure);
    for (const [pitch, bounded] of [
      [-10, -0.65],
      [10, 0.8],
    ] as const) {
      figure.setToolPose(pitch);
      figure.animate(0.12, 'walk', true);
      expect(figure.toolMount.rotation.x).toBe(bounded);
      expect(transforms(figure).flat().every(Number.isFinite)).toBe(true);
    }
    for (const pitch of [Number.NaN, Number.POSITIVE_INFINITY]) {
      figure.setToolPose(0.5);
      figure.animate(0.12, 'walk', true);
      figure.setToolPose(pitch);
      expect(transforms(figure)).toEqual(standing);
    }
  });

  it('removes decorative riding motion while preserving requested stunts and bounded transforms', () => {
    const figure = create();
    for (const kind of rideKinds) {
      figure.setRidePose(ride(kind, { pedalPhase: 0.4 }));
      figure.animate(1, 'walk', true);
      const still = transforms(figure);
      figure.animate(1000, 'dance', true);
      expect(transforms(figure)).toEqual(still);
      figure.setRidePose(ride(kind, { stuntProgress: 0.5 }));
      figure.animate(1000, 'dance', true);
      expect(transforms(figure)).not.toEqual(still);
      figure.setRidePose(
        ride(kind, {
          speed: Number.POSITIVE_INFINITY,
          lean: Number.NaN,
          stuntProgress: Number.POSITIVE_INFINITY,
          pedalPhase: Number.NaN,
        }),
      );
      for (const time of [Number.NaN, Number.POSITIVE_INFINITY, 86400]) {
        figure.animate(time, 'jump', true);
        expect(transforms(figure).flat().every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('reuses paired geometry and keeps a bounded render budget through animation', () => {
    const figure = create();
    const objects: THREE.Object3D[] = [];
    const meshes: THREE.Mesh[] = [];
    const materials = new Set<THREE.Material>();
    let triangles = 0;
    figure.group.traverse((object) => {
      objects.push(object);
      if (!(object instanceof THREE.Mesh)) return;
      meshes.push(object);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) =>
        materials.add(material),
      );
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    });
    expect(meshes.length).toBeLessThanOrEqual(60);
    expect(materials.size).toBeLessThanOrEqual(18);
    expect(triangles).toBeLessThan(50000);
    const leftSleeve = figure.leftArm.children.find((object) => object instanceof THREE.Mesh) as THREE.Mesh;
    const rightSleeve = figure.rightArm.children.find((object) => object instanceof THREE.Mesh) as THREE.Mesh;
    expect(leftSleeve.geometry).toBe(rightSleeve.geometry);
    expect(leftSleeve.material).toBe(rightSleeve.material);
    const animations = ['idle', 'walk', 'jump', 'dance'] as const;
    for (let frame = 0; frame < 2000; frame++) figure.animate(frame / 60, animations[Math.floor(frame / 500)]);
    const finalObjects: THREE.Object3D[] = [];
    figure.group.traverse((object) => {
      finalObjects.push(object);
      expect(
        [...object.position, ...object.rotation.toArray().slice(0, 3), ...object.scale].every(Number.isFinite),
      ).toBe(true);
    });
    expect(finalObjects).toEqual(objects);
  });

  it('applies the configurable accent only to sneaker material', () => {
    const figure = create('#AC77FF');
    expect(figure.accent.color.getHexString()).toBe('ac77ff');
    figure.accent.color.set('#FC8F3A');
    const accents: THREE.Mesh[] = [];
    figure.group.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material === figure.accent) accents.push(object);
    });
    expect(accents).toHaveLength(2);
    expect(accents.every((mesh) => mesh.parent === figure.leftFoot || mesh.parent === figure.rightFoot)).toBe(true);
    expect(create('url(https://example.invalid)').accent.color.getHexString()).toBe('c8ff03');
  });

  it('loads the official front and back wordmarks with omitted credentials and shares their geometry', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H109V36H0Z" fill="white"/></svg>',
    } as Response);
    const figure = create();
    await vi.waitFor(() => expect(figure.group.getObjectByName('official-pubky-hoodie-logo')).toBeDefined());
    expect(fetch).toHaveBeenCalledWith('/pubky-logo.svg', { credentials: 'omit', signal: expect.any(AbortSignal) });
    const front = figure.group.getObjectByName('official-pubky-hoodie-logo')!;
    const back = figure.group.getObjectByName('official-pubky-hoodie-back-logo')!;
    expect(front.parent).toBe(figure.body);
    expect(back.parent).toBe(figure.body);
    expect(back.rotation.y).toBe(Math.PI);
    expect((front.children[0] as THREE.Mesh).geometry).toBe((back.children[0] as THREE.Mesh).geometry);
  });

  it('aborts disposal and ignores a bundled-logo response completed after teardown', async () => {
    let finish!: (source: string) => void;
    const source = new Promise<string>((resolve) => {
      finish = resolve;
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true, text: () => source } as Response);
    const figure = create();
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await Promise.resolve();
    figure.dispose();
    expect(signal?.aborted).toBe(true);
    finish('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H109V36H0Z" fill="white"/></svg>');
    await source;
    await Promise.resolve();
    await Promise.resolve();
    expect(figure.group.getObjectByName('official-pubky-hoodie-logo')).toBeUndefined();
  });
});

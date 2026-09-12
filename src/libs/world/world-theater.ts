import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldBurnEscapeFrame } from '@/libs/world/world-burn-escape';
import { label, mesh, WORLD_PALETTE } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import { worldDetail } from '@/libs/world/world-surfaces';
import type { WorldData, WorldInteraction, WorldPost } from '@/libs/world/world-types';

const SLIDE_SECONDS = 20;

/** Draw plain text only: public post content never becomes markup or a remote texture. */
function screenText(value: string, length: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, length);
}

function wrapText(context: CanvasRenderingContext2D, value: string, width: number, maximum: number) {
  const words = screenText(value, 900).split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > width) {
      lines.push(line);
      line = word;
      if (lines.length === maximum) break;
    } else line = next;
  }
  if (lines.length < maximum && line) lines.push(line);
  if (lines.join(' ').length < screenText(value, 900).length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:]$/, '')}…`;
  }
  return lines;
}

/** Eight individually dressed local extras, built once and merged by surface. */
function createSpectators(theater: THREE.Group, construction: ReturnType<typeof worldDetail>) {
  const fabric = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
  const spectators: {
    group: THREE.Group;
    setEscapePose: (frame: WorldBurnEscapeFrame, reducedMotion: boolean) => void;
    setZombiePose: (stride: number, reducedMotion: boolean) => void;
  }[] = [];
  const wardrobes = [
    {
      complexion: '#D6A07B',
      hair: '#292320',
      coat: '#545169',
      shirt: '#D3C9B9',
      trousers: '#292D3B',
      accent: '#9EAE92',
    },
    {
      complexion: '#86563E',
      hair: '#241E1C',
      coat: '#677953',
      shirt: '#BDA678',
      trousers: '#292F2F',
      accent: '#C8AC77',
    },
    {
      complexion: '#E8BC99',
      hair: '#69452D',
      coat: '#927762',
      shirt: '#DAD1BF',
      trousers: '#343547',
      accent: '#D0B997',
    },
    {
      complexion: '#BD825A',
      hair: '#2B2527',
      coat: '#466A6B',
      shirt: '#CBC4AB',
      trousers: '#293940',
      accent: '#C2CCC4',
    },
    {
      complexion: '#6E4839',
      hair: '#201D20',
      coat: '#676477',
      shirt: '#B5A6AC',
      trousers: '#242C36',
      accent: '#B29FBD',
    },
    {
      complexion: '#D9AE87',
      hair: '#372D2B',
      coat: '#7D8059',
      shirt: '#D0B58C',
      trousers: '#3C3C39',
      accent: '#B69465',
    },
    {
      complexion: '#B57D59',
      hair: '#653522',
      coat: '#7E665A',
      shirt: '#C7C4B3',
      trousers: '#2A3543',
      accent: '#ABBEBC',
    },
    {
      complexion: '#966A51',
      hair: '#282324',
      coat: '#55777E',
      shirt: '#C6C6C0',
      trousers: '#31313E',
      accent: '#9AB7A1',
    },
  ];
  for (let index = 0; index < wardrobes.length; index++) {
    const row = index < 4 ? 0 : 2;
    const outfit = wardrobes[index];
    const spectator = new THREE.Group();
    spectator.name = 'theater-decorative-spectator';
    spectator.position.set([-5.7, -3.3, 3.3, 5.7][index % 4], row * 0.25, row * 2.5 + 1);
    spectator.rotation.y = Math.PI;
    spectator.updateMatrix();
    theater.add(spectator);
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    let activeJoint = 0;
    let fixedFurniture = false;
    const limbs: {
      joint: number;
      side: number;
      hip: THREE.Vector3;
      knee: THREE.Vector3;
      ankle: THREE.Vector3;
      shoulder: THREE.Vector3;
      elbow: THREE.Vector3;
      wrist: THREE.Vector3;
    }[] = [];
    const add = (
      geometry: THREE.BufferGeometry,
      surface: THREE.Material,
      color: string,
      position: [number, number, number] = [0, 0, 0],
    ) => {
      geometry.translate(...position);
      if (fixedFurniture) {
        construction.add(geometry.applyMatrix4(spectator.matrix), color, 'metal');
        return;
      }
      const tint = new THREE.Color(color);
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let vertex = 0; vertex < colors.length; vertex += 3) tint.toArray(colors, vertex);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute(
        'escapeJoint',
        new THREE.Uint8BufferAttribute(new Uint8Array(geometry.getAttribute('position').count).fill(activeJoint), 1),
      );
      const parts = batches.get(surface) ?? [];
      parts.push(geometry);
      batches.set(surface, parts);
    };
    const oval = (
      surface: THREE.Material,
      color: string,
      size: [number, number, number],
      position: [number, number, number],
    ) => add(new THREE.SphereGeometry(1, 14, 10).scale(...size), surface, color, position);
    const segment = (
      surface: THREE.Material,
      color: string,
      radius: number,
      from: [number, number, number],
      to: [number, number, number],
    ) => {
      const start = new THREE.Vector3(...from);
      const end = new THREE.Vector3(...to);
      const direction = end.clone().sub(start);
      const geometry = new THREE.CapsuleGeometry(radius, direction.length(), 4, 12);
      geometry.applyMatrix4(
        new THREE.Matrix4().makeRotationFromQuaternion(
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
        ),
      );
      add(geometry, surface, color, start.add(end).multiplyScalar(0.5).toArray() as [number, number, number]);
    };
    const stripe = (color: string, size: [number, number, number], position: [number, number, number]) =>
      add(new THREE.BoxGeometry(...size), trim, color, position);
    const width = [1, 0.94, 0.93, 1.07, 1.04, 0.98, 1.06, 0.94][index];
    const headY = 2.255 + [0.005, -0.035, 0.015, 0, -0.015, 0.035, 0.015, -0.015][index];
    // Hips rest on the bench. Soft shoulders, a waist and bent trouser knees
    // preserve a recognisable seated silhouette even when viewed from behind.
    add(
      new THREE.LatheGeometry(
        [
          [0, 1.055],
          [0.3, 1.055],
          [0.35, 1.2],
          [0.335, 1.42],
          [0.4, 1.73],
          [0.385, 1.83],
          [0.155, 1.94],
          [0, 1.94],
        ].map(([radius, y]) => new THREE.Vector2(radius, y)),
        20,
      ).scale(width, 1, 0.64),
      fabric,
      outfit.coat,
      [0, 0, -0.035],
    );
    oval(fabric, outfit.trousers, [0.34 * width, 0.145, 0.255], [0, 1.11, 0.035]);
    if (index % 2) {
      const shirt = new THREE.PlaneGeometry(1, 1, 1, 8);
      const vertices = shirt.getAttribute('position');
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        const y = 1.748 + vertices.getY(vertex) * 0.308;
        const x = vertices.getX(vertex) * 2 * (0.064 + ((y - 1.594) / 0.308) * 0.031);
        const radius =
          y >= 1.83
            ? 0.385 - ((y - 1.83) / 0.11) * 0.23
            : y >= 1.73
              ? 0.4 - ((y - 1.73) / 0.1) * 0.015
              : 0.335 + ((y - 1.42) / 0.31) * 0.065;
        vertices.setXYZ(vertex, x, y, Math.sqrt(radius * radius - (x / width) ** 2) * 0.64 - 0.028);
      }
      shirt.computeVertexNormals();
      add(shirt, fabric, outfit.shirt);
      for (const side of [-1, 1]) {
        segment(fabric, outfit.coat, 0.023, [side * 0.101, 1.904, 0.131], [side * 0.095, 1.808, 0.219]);
        segment(fabric, outfit.coat, 0.021, [side * 0.095, 1.808, 0.219], [side * 0.064, 1.59, 0.219]);
      }
    } else {
      // Tonal seam and hood cords belong to the sweater fabric, so the torso
      // reads as clothing instead of a repeated raised chest medallion.
      for (const side of [-1, 1]) {
        segment(fabric, outfit.coat, 0.014, [side * 0.145, 1.878, 0.167], [side * 0.196, 1.761, 0.196]);
        segment(fabric, '#A0A5A0', 0.006, [side * 0.065, 1.915, 0.127], [side * 0.072, 1.762, 0.226]);
      }
    }
    stripe('#596063', [0.019, 0.55, 0.017], [0, 1.41, 0.206]);
    stripe(outfit.accent, [0.034, 0.07, 0.022], [0, 1.671, 0.242]);
    add(
      new THREE.TorusGeometry(0.32 * width, 0.021, 5, 24).rotateX(Math.PI / 2).scale(1, 1, 0.69),
      fabric,
      outfit.accent,
      [0, 1.115, -0.026],
    );
    segment(skin, outfit.complexion, 0.108, [0, 1.88, -0.028], [0, 2.05, -0.028]);
    add(
      new THREE.TorusGeometry(0.142, 0.021, 6, 24).rotateX(Math.PI / 2).scale(1, 1, 0.81),
      fabric,
      outfit.coat,
      [0, 1.934, -0.032],
    );
    if (index % 2 === 0) {
      oval(fabric, outfit.coat, [0.238, 0.165, 0.12], [0, 1.875, -0.205]);
      oval(fabric, '#383E42', [0.185, 0.084, 0.033], [0, 1.946, -0.249]);
    }
    if (index === 1 || index === 5) {
      add(
        new THREE.TorusGeometry(0.172, 0.047, 6, 24).rotateX(Math.PI / 2).scale(1, 1, 0.86),
        fabric,
        outfit.shirt,
        [0, 1.985, -0.025],
      );
      segment(fabric, outfit.accent, 0.066, [-0.1, 1.94, 0.18], [-0.12, 1.49, 0.245]);
      for (let stitch = 0; stitch < 3; stitch++)
        stripe(outfit.shirt, [0.105, 0.014, 0.014], [-0.12, 1.48 + stitch * 0.038, 0.284]);
    }
    for (const side of [-1, 1]) {
      const joint = side < 0 ? 1 : 5;
      activeJoint = joint;
      const hip = side * (0.21 + (index % 3) * 0.014);
      const knee = hip + side * 0.035;
      const toe = 0.655 + ((index + (side > 0 ? 1 : 0)) % 3) * 0.035;
      segment(fabric, outfit.trousers, 0.144, [hip, 1.145, 0.04], [knee, 1.09, 0.59]);
      oval(fabric, outfit.trousers, [0.151, 0.134, 0.138], [knee, 1.065, 0.595]);
      activeJoint = joint + 1;
      segment(fabric, outfit.trousers, 0.111, [knee, 1.065, 0.59], [knee, 0.565, toe]);
      stripe('#4F545D', [0.016, 0.315, 0.015], [knee + side * 0.102, 0.829, toe + 0.014]);
      add(new THREE.TorusGeometry(0.105, 0.018, 4, 16).rotateX(Math.PI / 2), fabric, '#4A5057', [knee, 0.593, toe]);
      oval(fabric, '#20272D', [0.14, 0.048, 0.246], [knee, 0.465, toe + 0.107]);
      oval(fabric, '#CCCFC5', [0.141, 0.051, 0.241], [knee, 0.493, toe + 0.107]);
      oval(fabric, outfit.accent, [0.125, 0.088, 0.213], [knee, 0.547, toe + 0.11]);
      oval(fabric, outfit.trousers, [0.107, 0.082, 0.083], [knee, 0.555, toe - 0.025]);
      oval(fabric, '#DEE0D4', [0.119, 0.027, 0.073], [knee, 0.536, toe + 0.285]);
      for (let lace = 0; lace < 3; lace++)
        stripe('#E0E4D8', [0.101, 0.012, 0.016], [knee, 0.626 - lace * 0.008, toe + 0.055 + lace * 0.037]);
      const shoulder = side * 0.377 * width;
      const elbow = side * 0.422 * width;
      const wrist = side * (0.235 + (index % 2) * 0.025);
      limbs.push({
        joint,
        side,
        hip: new THREE.Vector3(hip, 1.145, 0.04),
        knee: new THREE.Vector3(knee, 1.065, 0.59),
        ankle: new THREE.Vector3(knee, 0.565, toe),
        shoulder: new THREE.Vector3(shoulder, 1.78, -0.025),
        elbow: new THREE.Vector3(elbow, 1.415, 0.15),
        wrist: new THREE.Vector3(wrist, 1.278, 0.449),
      });
      activeJoint = joint + 2;
      segment(fabric, outfit.coat, 0.131, [shoulder, 1.78, -0.025], [elbow, 1.416, 0.147]);
      oval(fabric, outfit.coat, [0.125, 0.124, 0.118], [elbow, 1.414, 0.147]);
      activeJoint = joint + 3;
      segment(fabric, outfit.coat, 0.106, [elbow, 1.415, 0.15], [wrist, 1.278, 0.449]);
      segment(fabric, outfit.coat, 0.088, [wrist + side * 0.025, 1.294, 0.41], [wrist, 1.279, 0.454]);
      oval(skin, outfit.complexion, [0.086, 0.055, 0.112], [wrist - side * 0.023, 1.247, 0.494]);
      oval(skin, outfit.complexion, [0.035, 0.04, 0.06], [wrist - side * 0.094, 1.265, 0.475]);
      for (let finger = 0; finger < 3; finger++) {
        add(new THREE.BoxGeometry(0.008, 0.007, 0.09), skin, outfit.coat, [
          wrist - 0.037 + finger * 0.024,
          1.297,
          0.529,
        ]);
      }
      activeJoint = 0;
      oval(fabric, outfit.coat, [0.118, 0.081, 0.021], [side * 0.209, 1.312, 0.202]);
      stripe(outfit.accent, [0.154, 0.016, 0.017], [side * 0.209, 1.375, 0.221]);
    }
    // Young adult faces have a defined jaw and a composed, focused expression.
    // Hair silhouettes and garments are deterministic.
    const face = new THREE.SplineCurve(
      [
        [0, -0.309],
        [0.14, -0.29],
        [0.212, -0.235],
        [0.249, -0.1],
        [0.263, 0.045],
        [0.232, 0.198],
        [0.136, 0.289],
        [0, 0.317],
      ].map(([radius, y]) => new THREE.Vector2(radius, y)),
    );
    add(new THREE.LatheGeometry(face.getPoints(30), 24).scale(1, 1, 0.915), skin, outfit.complexion, [
      0,
      headY,
      -0.015,
    ]);
    for (const side of [-1, 1]) {
      oval(skin, outfit.complexion, [0.053, 0.087, 0.04], [side * 0.26, headY - 0.005, -0.02]);
      oval(skin, '#D4CEBE', [0.039, 0.013, 0.01], [side * 0.092, headY + 0.022, 0.214]);
      oval(skin, '#27282A', [0.0165, 0.012, 0.009], [side * 0.092, headY + 0.022, 0.224]);
      oval(skin, '#DAD2BD', [0.0028, 0.0028, 0.0025], [side * 0.092 - 0.005, headY + 0.026, 0.232]);
      add(new THREE.BoxGeometry(0.081, 0.021, 0.014).rotateZ(side * 0.16), skin, outfit.hair, [
        side * 0.091,
        headY + 0.052,
        0.222,
      ]);
    }
    oval(skin, outfit.complexion, [0.038, 0.058, 0.055], [0, headY - 0.014, 0.23]);
    add(new THREE.BoxGeometry(0.087, 0.01, 0.013), skin, '#805846', [0, headY - 0.137, 0.213]);
    const hairColor = index === 3 ? '#C0B69A' : outfit.hair;
    add(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, 1.44).scale(0.281, 0.302, 0.279), fabric, hairColor, [
      0,
      headY + 0.055,
      -0.008,
    ]);
    if (index === 2 || index === 5) {
      oval(fabric, outfit.hair, [0.248, 0.292, 0.11], [0, headY - 0.027, -0.177]);
      for (const side of [-1, 1]) oval(fabric, outfit.hair, [0.079, 0.21, 0.13], [side * 0.226, headY - 0.072, -0.073]);
      if (index === 5) oval(fabric, outfit.hair, [0.117, 0.13, 0.104], [0.043, headY + 0.171, -0.276]);
    } else if (index === 1 || index === 7) {
      for (let lock = 0; lock < 9; lock++) {
        const angle = (lock / 9) * Math.PI * 2;
        oval(
          fabric,
          outfit.hair,
          [0.102, 0.091, 0.094],
          [Math.cos(angle) * 0.191, headY + 0.219 + (lock % 2) * 0.035, Math.sin(angle) * 0.164 - 0.034],
        );
      }
      oval(fabric, outfit.hair, [0.152, 0.074, 0.135], [0, headY + 0.32, -0.04]);
    } else if (index === 3) {
      add(new THREE.TorusGeometry(0.257, 0.033, 6, 28).rotateX(Math.PI / 2).scale(1, 1, 0.88), fabric, '#A69A7F', [
        0,
        headY + 0.118,
        -0.033,
      ]);
      stripe('#504F49', [0.086, 0.064, 0.014], [0.116, headY + 0.15, 0.209]);
    } else {
      for (let lock = 0; lock < 4; lock++)
        add(new THREE.SphereGeometry(1, 12, 8).scale(0.076, 0.047, 0.185).rotateZ(-0.25), fabric, outfit.hair, [
          (lock - 1.5) * 0.106,
          headY + 0.299 - Math.abs(lock - 1.5) * 0.032,
          -0.026,
        ]);
    }
    if (index === 6) {
      for (const side of [-1, 1]) {
        add(new THREE.TorusGeometry(0.049, 0.008, 4, 16).scale(1, 0.52, 1), trim, '#394441', [
          side * 0.092,
          headY + 0.022,
          0.235,
        ]);
        stripe('#394441', [0.069, 0.012, 0.011], [side * 0.159, headY + 0.03, 0.221]);
      }
      stripe('#394441', [0.075, 0.011, 0.011], [0, headY + 0.026, 0.241]);
    }
    // Raised rear benches get a small grounded foot rail so their occupants'
    // feet are visibly supported instead of floating half a metre above deck.
    fixedFurniture = true;
    if (row > 0) {
      segment(trim, '#757A7A', 0.031, [-0.47, 0.414, 0.77], [0.47, 0.414, 0.77]);
      for (const side of [-1, 1]) segment(trim, '#4C5559', 0.028, [side * 0.4, -0.07, 0.69], [side * 0.4, 0.415, 0.77]);
    }
    const animatedMeshes: {
      mesh: THREE.Mesh;
      positions: Float32Array;
      normals: Float32Array;
      joints: THREE.BufferAttribute;
    }[] = [];
    for (const [surface, parts] of batches) {
      const geometry = mergeGeometries(parts);
      parts.forEach((part) => part.dispose());
      if (geometry) {
        (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
        (geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
        animatedMeshes.push({
          mesh: mesh(spectator, geometry, surface),
          positions: Float32Array.from(geometry.getAttribute('position').array),
          normals: Float32Array.from(geometry.getAttribute('normal').array),
          joints: geometry.getAttribute('escapeJoint') as THREE.BufferAttribute,
        });
      }
    }
    const matrices = Array.from({ length: 9 }, () => new THREE.Matrix4());
    const restDirection = new THREE.Vector3();
    const poseDirection = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const offset = new THREE.Matrix4();
    const hip = new THREE.Vector3();
    const knee = new THREE.Vector3();
    const ankle = new THREE.Vector3();
    const shoulder = new THREE.Vector3();
    const elbow = new THREE.Vector3();
    const wrist = new THREE.Vector3();
    let previousStride: number | undefined;
    let previousFalling = false;
    let zombiePose = false;
    const zombieFrame: WorldBurnEscapeFrame = { position: spectator.position, yaw: 0, stride: 0, falling: false };
    const align = (
      matrix: THREE.Matrix4,
      restFrom: THREE.Vector3,
      restTo: THREE.Vector3,
      poseFrom: THREE.Vector3,
      poseTo: THREE.Vector3,
    ) => {
      restDirection.subVectors(restTo, restFrom).normalize();
      poseDirection.subVectors(poseTo, poseFrom).normalize();
      rotation.setFromUnitVectors(restDirection, poseDirection);
      matrix.makeRotationFromQuaternion(rotation).setPosition(poseFrom);
      matrix.multiply(offset.makeTranslation(-restFrom.x, -restFrom.y, -restFrom.z));
    };
    spectators.push({
      group: spectator,
      setZombiePose(stride, reducedMotion) {
        if (!zombiePose) previousStride = undefined;
        zombiePose = true;
        zombieFrame.stride = stride * 0.3;
        this.setEscapePose(zombieFrame, reducedMotion);
      },
      setEscapePose(frame, reducedMotion) {
        const stride = reducedMotion || !Number.isFinite(frame.stride) ? 0 : THREE.MathUtils.clamp(frame.stride, -1, 1);
        if (stride === previousStride && frame.falling === previousFalling) return;
        previousStride = stride;
        previousFalling = frame.falling;
        const lift = 0.08;
        matrices[0].makeTranslation(0, lift, 0);
        for (const limb of limbs) {
          const step = stride * limb.side;
          const thighAngle = step * 0.62;
          const shinAngle = thighAngle + Math.max(0, step) * 0.85;
          const thighLength = limb.hip.distanceTo(limb.knee);
          const shinLength = limb.knee.distanceTo(limb.ankle);
          hip.copy(limb.hip);
          hip.y += lift;
          poseDirection
            .set(limb.side * 0.035, -Math.cos(thighAngle) * thighLength, -Math.sin(thighAngle) * thighLength)
            .normalize();
          knee.copy(hip).addScaledVector(poseDirection, thighLength);
          ankle.set(knee.x, knee.y - Math.cos(shinAngle) * shinLength, knee.z - Math.sin(shinAngle) * shinLength);
          align(matrices[limb.joint], limb.hip, limb.knee, hip, knee);
          align(matrices[limb.joint + 1], limb.knee, limb.ankle, knee, ankle);
          shoulder.copy(limb.shoulder);
          shoulder.y += lift;
          poseDirection
            .set(
              limb.side * 0.09,
              zombiePose ? -0.06 : frame.falling ? 0.06 : -0.28,
              zombiePose ? 0.6 : 0.12 - step * 0.2,
            )
            .normalize();
          elbow.copy(shoulder).addScaledVector(poseDirection, limb.shoulder.distanceTo(limb.elbow));
          poseDirection
            .set(
              -limb.side * 0.05,
              zombiePose ? -0.04 : frame.falling ? 0.32 : 0.16,
              zombiePose ? 0.65 : 0.32 + step * 0.15,
            )
            .normalize();
          wrist.copy(elbow).addScaledVector(poseDirection, limb.elbow.distanceTo(limb.wrist));
          align(matrices[limb.joint + 2], limb.shoulder, limb.elbow, shoulder, elbow);
          align(matrices[limb.joint + 3], limb.elbow, limb.wrist, elbow, wrist);
        }
        // Deform only the existing batches. Running adds no draw calls or disposable rig resources.
        for (const part of animatedMeshes) {
          const positions = part.mesh.geometry.getAttribute('position');
          const normals = part.mesh.geometry.getAttribute('normal');
          for (let vertex = 0; vertex < positions.count; vertex++) {
            const matrix = matrices[part.joints.getX(vertex)].elements;
            const at = vertex * 3;
            const x = part.positions[at];
            const y = part.positions[at + 1];
            const z = part.positions[at + 2];
            positions.setXYZ(
              vertex,
              matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
              matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
              matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
            );
            const nx = part.normals[at];
            const ny = part.normals[at + 1];
            const nz = part.normals[at + 2];
            normals.setXYZ(
              vertex,
              matrix[0] * nx + matrix[4] * ny + matrix[8] * nz,
              matrix[1] * nx + matrix[5] * ny + matrix[9] * nz,
              matrix[2] * nx + matrix[6] * ny + matrix[10] * nz,
            );
          }
          positions.needsUpdate = true;
          normals.needsUpdate = true;
          part.mesh.geometry.computeBoundingBox();
          part.mesh.geometry.computeBoundingSphere();
        }
      },
    });
  }
  return spectators;
}

/** An outdoor cinema whose program stays in the public feed's ranking order. */
export function createTheater(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
  initialData: WorldData,
) {
  const theater = new THREE.Group();
  theater.name = 'trending-theater';
  theater.position.set(WORLD_ANCHORS.theater[0], 0, WORLD_ANCHORS.theater[1]);
  scene.add(theater);
  const construction = worldDetail(theater, 'Theater stage and seating');
  const block = (
    size: [number, number, number],
    color: string,
    position: [number, number, number],
    surface: 'stone' | 'metal' | 'wood' | 'glow' = 'stone',
    rotation: [number, number, number] = [0, 0, 0],
  ) => construction.add(new THREE.BoxGeometry(...size), color, surface, position, rotation);
  const rod = (from: [number, number, number], to: [number, number, number], radius: number, color = '#7F8B8C') => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 10);
    geometry.applyMatrix4(
      new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
      ),
    );
    construction.add(
      geometry,
      color,
      'metal',
      start.add(end).multiplyScalar(0.5).toArray() as [number, number, number],
    );
  };
  block([18, 0.4, 14], '#30353C', [0, 0.2, 1]);
  block([17.75, 0.034, 13.72], '#474B50', [0, 0.417, 1]);
  for (const x of [-8.72, 8.72]) block([0.079, 0.017, 13.5], '#727C79', [x, 0.441, 1], 'metal');
  for (const z of [-5.71, 7.71]) block([17.51, 0.017, 0.079], '#727C79', [0, 0.441, z], 'metal');
  // The stage fascia and floor are built from real slats, with a dark joint
  // beneath each board rather than a single featureless platform slab.
  block([17.3, 0.16, 3.2], '#353C43', [0, 0.48, -4]);
  for (let plank = 0; plank < 16; plank++)
    block([1.052, 0.04, 3.03], plank % 3 ? '#535854' : '#62655B', [-8.082 + plank * 1.077, 0.58, -4], 'wood');
  for (let panel = 0; panel < 12; panel++) {
    block([1.357, 0.198, 0.077], panel % 2 ? '#49504D' : '#535B56', [-7.82 + panel * 1.422, 0.437, -2.368], 'wood');
    block([0.024, 0.183, 0.027], '#929C8B', [-8.499 + panel * 1.422, 0.445, -2.316], 'metal');
  }
  block([17.35, 0.049, 0.123], '#899583', [0, 0.579, -2.402], 'metal');
  // Two square lattice masts keep their original collision anchors. Braces
  // continue above and behind the screen into a full lighting truss.
  for (const x of [-7.1, 7.1]) {
    construction.add(new THREE.CylinderGeometry(0.72, 0.92, 0.23, 20), '#2B3339', 'metal', [x, 0.55, -4.45]);
    block([1.12, 0.094, 1.08], '#596663', [x, 0.705, -4.45], 'metal');
    for (const dx of [-0.226, 0.226])
      for (const dz of [-0.287, 0.287]) rod([x + dx, 0.75, -4.45 + dz], [x + dx, 12.49, -4.45 + dz], 0.046, '#657778');
    for (let level = 0; level < 10; level++) {
      const y = 0.82 + level * 1.15;
      for (const dz of [-0.287, 0.287]) {
        rod([x - 0.226, y, -4.45 + dz], [x + 0.226, y, -4.45 + dz], 0.035);
        rod([x - 0.226, y, -4.45 + dz], [x + 0.226, y + 1.13, -4.45 + dz], 0.025, '#849494');
      }
      for (const dx of [-0.226, 0.226]) {
        rod([x + dx, y, -4.737], [x + dx, y, -4.163], 0.035);
        rod([x + dx, y, -4.737], [x + dx, y + 1.13, -4.163], 0.025, '#849494');
      }
    }
    block([0.76, 0.95, 0.65], '#17252C', [x, 1.201, -4.185], 'metal');
    construction.add(new THREE.CircleGeometry(0.236, 32), '#3D5055', 'metal', [x, 1.25, -3.844]);
    construction.add(new THREE.CircleGeometry(0.107, 24), '#111D26', 'metal', [x, 1.25, -3.83]);
    for (const dx of [-0.28, 0.28])
      for (const y of [0.84, 1.558])
        construction.add(new THREE.SphereGeometry(0.02, 8, 6), '#8D9C96', 'metal', [x + dx, y, -3.845]);
    obstacle(theater.position.x + x, theater.position.z - 4.45, 0.8);
  }
  for (const y of [12.01, 12.51]) for (const z of [-4.748, -4.165]) rod([-8.66, y, z], [8.66, y, z], 0.054, '#899998');
  for (let bay = 0; bay < 15; bay++) {
    const x = -8.63 + bay * 1.151;
    for (const z of [-4.748, -4.165]) {
      rod([x, 12.01, z], [x + 1.13, 12.51, z], 0.029, '#A2AAA1');
      rod([x, 12.01, z], [x, 12.51, z], 0.034);
    }
    for (const y of [12.01, 12.51]) rod([x, y, -4.748], [x + 1.13, y, -4.165], 0.026);
  }
  for (const x of [-5.4, -1.8, 1.8, 5.4]) {
    block([0.52, 0.049, 0.2], '#7C8A83', [x, 12.18, -4.232], 'metal');
    for (const dx of [-0.222, 0.222]) block([0.029, 0.379, 0.147], '#53615F', [x + dx, 12.02, -4.218], 'metal');
    construction.add(
      new THREE.CylinderGeometry(0.191, 0.221, 0.387, 16),
      '#202E34',
      'metal',
      [x, 11.997, -4.183],
      [Math.PI / 2 + 0.4, 0, 0],
    );
    construction.add(new THREE.CircleGeometry(0.159, 24), '#D3E3AD', 'glow', [x, 11.91, -3.99], [-0.4, 0, 0]);
  }
  block([16.74, 9.79, 0.36], '#596760', [0, 7.3, -4.13], 'metal');
  block([16.49, 9.56, 0.32], '#171F27', [0, 7.3, -3.984], 'metal');
  block([16.17, 9.22, 0.055], '#38433F', [0, 7.3, -3.79], 'metal');
  for (const y of [2.795, 11.805]) {
    block([16.32, 0.129, 0.147], '#7D887B', [0, y, -3.734], 'metal');
    block([16.23, 0.027, 0.027], WORLD_PALETTE.lime, [0, y, -3.643], 'glow');
  }
  for (const x of [-8.108, 8.108]) {
    block([0.135, 9.085, 0.145], '#66756C', [x, 7.3, -3.733], 'metal');
    block([0.027, 8.993, 0.026], WORLD_PALETTE.lime, [x, 7.3, -3.642], 'glow');
  }
  for (const side of [-1, 1]) {
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 7.22, 0.679, -4.965),
      new THREE.Vector3(side * 6.94, 0.625, -5.305),
      new THREE.Vector3(side * 3.82, 0.625, -5.393),
      new THREE.Vector3(side * 0.62, 0.693, -5.206),
    ]);
    construction.add(new THREE.TubeGeometry(cable, 22, 0.021, 6, false), '#1B252A', 'metal');
  }
  block([1.39, 0.63, 0.61], '#3C4A46', [0, 0.95, -5.148], 'metal');
  for (let slot = 0; slot < 9; slot++)
    block([0.077, 0.342, 0.017], '#19232A', [-0.501 + slot * 0.125, 0.949, -4.833], 'metal');

  // Each bench keeps its original seat height/footprint, central aisle and row
  // gap. Slats, stretcher rails and grounded supports replace the solid boxes.
  for (let row = 0; row < 3; row++) {
    const z = row * 2.5 + 1;
    const y = row * 0.25;
    for (const x of [-4.2, 4.2]) {
      block([6.14, 0.104, 1.115], '#28383D', [x, y + 0.844, z], 'metal');
      for (let slat = 0; slat < 5; slat++)
        block(
          [6.12, 0.131, 0.205],
          (row + slat) % 3 ? '#687167' : '#778073',
          [x, y + 0.974, z - 0.465 + slat * 0.233],
          'wood',
        );
      for (let slat = 0; slat < 5; slat++)
        block(
          [6.07, 0.143, 0.139],
          (row + slat) % 3 ? '#4A5952' : '#5C6860',
          [x, y + 1.249 + slat * 0.165, z + 0.59],
          'wood',
        );
      block([6.19, 0.109, 0.215], '#738074', [x, y + 2.001, z + 0.59], 'wood');
      block([5.4, 0.03, 0.022], WORLD_PALETTE.lime, [x, y + 1.993, z + 0.472], 'glow');
      for (const offset of [-2.45, 2.45]) {
        for (const side of [-1, 1]) {
          rod([x + offset, 0.451, z + side * 0.48], [x + offset, y + 0.837, z + side * 0.305], 0.047, '#6C7B75');
          block([0.296, 0.048, 0.267], '#3E4D4A', [x + offset, 0.464, z + side * 0.48], 'metal');
        }
        rod([x + offset, y + 0.817, z + 0.508], [x + offset, y + 1.986, z + 0.656], 0.041, '#65746C');
        for (const screwY of [1.278, 1.76])
          construction.add(
            new THREE.CylinderGeometry(0.027, 0.027, 0.022, 6),
            '#A8AE97',
            'metal',
            [x + offset, y + screwY, z + 0.667],
            [Math.PI / 2, 0, 0],
          );
      }
      rod([x - 2.47, y + 0.766, z], [x + 2.47, y + 0.766, z], 0.044, '#526760');
      for (const side of [-1, 1]) {
        const end = x + side * 2.821;
        rod([end, y + 0.866, z - 0.36], [end, y + 1.369, z - 0.36], 0.035, '#718177');
        block([0.135, 0.073, 0.793], '#6E7C6E', [end, y + 1.431, z + 0.008], 'wood');
      }
      obstacle(theater.position.x + x, theater.position.z + z, 1.45);
    }
  }
  // Flush lamps mark the two edges of the open aisle, without adding obstacles.
  for (const z of [-0.29, 2.56, 5.06, 7.25])
    for (const side of [-1, 1]) {
      block([0.184, 0.057, 0.411], '#202F35', [side * 0.827, 0.455, z], 'metal');
      block([0.067, 0.013, 0.272], '#AFD85E', [side * 0.827, 0.49, z], 'glow');
    }
  // These seated spectators are scenery, never an assertion that a profile is online.
  const spectators = createSpectators(theater, construction);
  construction.finish();
  label(theater, 'Trending Theater', [0, 14.1, -3.8], 12);
  register(theater, { kind: 'zone', id: 'theater' }, 'Read the Trending Theater program');

  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 864;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = mesh(
    theater,
    new THREE.PlaneGeometry(15.6, 8.775),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    [0, 7.3, -3.7],
  );
  screen.name = 'Trending Theater program screen';
  screen.castShadow = false;
  let posts: WorldPost[] = initialData.trendingPosts.slice(0, 8);
  let source = initialData.source;
  let index = 0;
  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let loading = false;
  let elapsed = 0;

  function paint() {
    if (!context) return;
    context.fillStyle = WORLD_PALETTE.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#11161C';
    context.fillRect(50, 202, 1436, 499);
    context.fillStyle = '#34433B';
    for (const x of [50, 1484]) context.fillRect(x, 202, 2, 499);
    for (const y of [202, 699]) context.fillRect(50, y, 1436, 2);
    context.fillStyle = '#73836A';
    for (const x of [50, 1454]) for (const y of [202, 699]) context.fillRect(x, y, 32, 2);
    context.fillStyle = WORLD_PALETTE.lime;
    context.fillRect(68, 70, 12, 46);
    context.font = '700 36px sans-serif';
    context.fillText('PUBKY / TRENDING THEATER', 105, 107);

    if (loading) {
      context.fillStyle = '#BABAC1';
      context.font = '500 23px sans-serif';
      context.fillText('PREPARING THE PROGRAM', 70, 160, 1350);
      // A static segmented indicator stays readable without motion or redraws.
      for (let segment = 0; segment < 8; segment++) {
        const angle = (segment / 8) * Math.PI * 2;
        context.fillStyle = segment < 3 ? WORLD_PALETTE.lime : WORLD_PALETTE.border;
        context.fillRect(132 + Math.cos(angle) * 43, 397 + Math.sin(angle) * 43, 18, 18);
      }
      context.fillStyle = WORLD_PALETTE.text;
      context.font = '600 60px sans-serif';
      context.fillText('Loading the next show…', 238, 424, 1200);
      context.fillStyle = '#BABAC1';
      context.font = '500 31px sans-serif';
      context.fillText('Gathering posts. Getting the screen ready.', 238, 485, 1200);
      context.fillStyle = WORLD_PALETTE.border;
      context.fillRect(76, 613, 1300, 15);
      context.fillRect(76, 655, 1020, 15);
      texture.needsUpdate = true;
      return;
    }

    context.font = '500 23px sans-serif';
    context.fillStyle = '#BABAC1';
    context.fillText(
      source === 'demo' ? 'EXAMPLE WORLD · FICTIONAL PROGRAM' : 'PUBLIC PRODUCTION · RANKED BY TOTAL ENGAGEMENT',
      70,
      160,
      1350,
    );
    const post = posts[index];
    context.fillStyle = WORLD_PALETTE.text;
    context.font = '600 51px sans-serif';
    const lines = wrapText(context, post?.text || 'The screen is quiet. No public posts are available yet.', 1360, 6);
    lines.forEach((line, row) => context.fillText(line, 76, 285 + row * 69, 1360));
    context.fillStyle = WORLD_PALETTE.lime;
    context.font = '600 31px sans-serif';
    context.fillText(post ? screenText(post.author, 52) : 'Intermission', 76, 755, 1060);
    context.fillStyle = '#89898F';
    context.font = '500 24px sans-serif';
    context.fillText(post ? `${index + 1} / ${posts.length}  ·  ${paused ? 'PAUSED' : 'ON AIR'}` : 'NO POSTS', 76, 808);
    for (let slot = 0; slot < posts.length; slot++) {
      context.fillStyle = slot === index ? WORLD_PALETTE.lime : '#3A4740';
      context.fillRect(1460 - (posts.length - slot) * 34, 800, 23, 5);
    }
    texture.needsUpdate = true;
  }
  paint();

  return {
    spectators,
    getStatus: () => ({ theaterIndex: index, theaterPaused: paused }),
    setLoading(value: boolean) {
      if (loading === value) return;
      loading = value;
      elapsed = 0;
      paint();
    },
    setPaused(value: boolean) {
      paused = value;
      elapsed = 0;
      paint();
    },
    step(delta: number) {
      if (loading || !Number.isFinite(delta) || !posts.length) return;
      index = (((index + Math.trunc(delta)) % posts.length) + posts.length) % posts.length;
      elapsed = 0;
      paint();
    },
    tick(delta: number) {
      if (loading || paused || posts.length < 2) return false;
      elapsed += delta;
      if (elapsed < SLIDE_SECONDS) return false;
      index = (index + 1) % posts.length;
      elapsed %= SLIDE_SECONDS;
      paint();
      return true;
    },
    updateData(data: WorldData) {
      posts = data.trendingPosts.slice(0, 8);
      source = data.source;
      index = 0;
      elapsed = 0;
      paint();
    },
  };
}

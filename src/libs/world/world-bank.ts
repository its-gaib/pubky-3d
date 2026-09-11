import * as THREE from 'three';
import { disposeObject, mesh, WORLD_PALETTE } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import { worldDetail } from '@/libs/world/world-surfaces';
import type { WorldInteraction } from '@/libs/world/world-types';

export const BANK_POSITION = WORLD_ANCHORS.bank;
export const BANK_BILL_COUNT = 150;
export const BANK_BILL_LIFETIME = 7;

type BankBillFrame = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  opacity: number;
  settled: boolean;
};

function writeBankBillFrame(time: number, index: number, frame: BankBillFrame) {
  const age = (((time / BANK_BILL_LIFETIME + index / BANK_BILL_COUNT) % 1) + 1) % 1;
  const angle = index * 2.39996;
  const lands = index % 3 !== 2;
  const flight = lands ? 0.48 + (index % 4) * 0.035 : 1;
  const progress = Math.min(1, age / flight);
  const spread = 0.4 + progress * (12 + (index % 5) * 2.2);
  const fade = THREE.MathUtils.smoothstep(age, 0.78, 1);
  const landing = lands ? THREE.MathUtils.smoothstep(progress, 0.86, 1) : 0;
  frame.position[0] = 1.8 + Math.cos(angle) * spread;
  frame.position[1] = lands
    ? 0.24 + 5.56 * (1 - progress) + Math.sin(progress * Math.PI) * 7
    : 5.8 + Math.sin(age * Math.PI) * 7 - age * 3.7;
  frame.position[2] = -0.4 + Math.sin(angle) * spread;
  frame.rotation[0] = Math.sin(age * 8 + index) * 0.5 * (1 - landing) - (landing * Math.PI) / 2;
  frame.rotation[1] = (angle + progress * 4) * (1 - landing);
  frame.rotation[2] = Math.sin(age * 12 + index) * 0.7 * (1 - landing) + (angle + progress * 4) * landing;
  frame.scale = 1 - fade * 0.85;
  frame.opacity = Math.min(1, age / 0.015) * (1 - fade);
  frame.settled = lands && progress === 1;
  return frame;
}

/** Each bill owns an offset life: launch, drift, then independently evaporate. */
export function bankBillFrame(time: number, index: number) {
  return writeBankBillFrame(time, index, {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
    opacity: 1,
    settled: false,
  });
}

/** Original local joke prop. The bank has no account, currency, or network behavior. */
export function createBank(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
) {
  const bank = new THREE.Group();
  bank.name = 'brrr-bank';
  bank.position.set(BANK_POSITION[0], 0, BANK_POSITION[1]);
  scene.add(bank);
  const construction = worldDetail(bank, 'Bank stonework and metalwork');
  const block = (
    size: [number, number, number],
    color: string,
    position: [number, number, number],
    surface: 'stone' | 'metal' | 'glow' = 'stone',
    rotation: [number, number, number] = [0, 0, 0],
  ) => construction.add(new THREE.BoxGeometry(...size), color, surface, position, rotation);
  const column = (
    top: number,
    bottom: number,
    height: number,
    color: string,
    position: [number, number, number],
    surface: 'stone' | 'metal' = 'stone',
  ) => construction.add(new THREE.CylinderGeometry(top, bottom, height, 32), color, surface, position);
  const ring = (radius: number, tube: number, color: string, position: [number, number, number], vertical = false) =>
    construction.add(new THREE.TorusGeometry(radius, tube, 8, 48), color, 'metal', position, [
      vertical ? 0 : Math.PI / 2,
      0,
      0,
    ]);
  const lightStone = '#A5A49F';
  const darkStone = '#414448';
  const brass = '#AF9A67';
  block([10, 0.35, 7.5], '#363A3F', [0, 0.17, 0]);
  block([9.55, 0.13, 7.05], '#8B8C89', [0, 0.405, 0]);
  block([8.7, 0.29, 6.4], '#55595E', [0, 0.59, 0]);
  block([8.85, 0.07, 6.48], '#858985', [0, 0.76, 0]);
  // Side wings and deep reveals leave an actual recessed vault entrance.
  for (const side of [-1, 1]) {
    block([2.55, 4.16, 3.3], '#383D42', [side * 2.525, 2.85, -0.7]);
    block([0.25, 4.14, 3.47], darkStone, [side * 3.765, 2.85, -0.7]);
    block([0.22, 3.48, 1.18], '#7D817E', [side * 1.315, 2.535, 0.46]);
    block([0.13, 3.35, 0.11], brass, [side * 1.167, 2.535, 1.042], 'metal');
    for (let course = 0; course < 8; course++) {
      block([2.56, 0.025, 0.03], '#5E6666', [side * 2.525, 0.985 + course * 0.475, 0.965]);
      block([0.038, 0.435, 0.036], '#596164', [side * (course % 2 ? 2.09 : 2.73), 1.2 + course * 0.475, 0.966]);
    }
    for (let course = 0; course < 6; course++) {
      block([course % 2 ? 0.47 : 0.66, 0.4, 0.13], course % 2 ? '#737773' : '#858983', [
        side * 3.51,
        1.12 + course * 0.625,
        1.011,
      ]);
      block([0.14, 0.4, course % 2 ? 0.47 : 0.68], '#707671', [side * 3.89, 1.12 + course * 0.625, 0.64]);
    }
    // Bronze-grilled side windows sit inside broad, chamfer-like stone reveals.
    block([1.3, 2.05, 0.16], '#8D928A', [side * 2.55, 2.68, 1.023]);
    block([1.11, 1.84, 0.08], '#151E24', [side * 2.55, 2.68, 1.112], 'metal');
    for (const offset of [-0.34, 0, 0.34])
      block([0.035, 1.72, 0.055], brass, [side * 2.55 + offset, 2.68, 1.168], 'metal');
    for (const y of [1.93, 2.31, 2.7, 3.08, 3.44])
      block([1.0, 0.027, 0.057], '#8D7D54', [side * 2.55, y, 1.171], 'metal');
    block([1.52, 0.115, 0.3], lightStone, [side * 2.55, 1.61, 1.045]);
  }
  block([7.6, 4.16, 0.3], '#343A3F', [0, 2.85, -2.22]);
  block([2.54, 0.65, 3.3], '#40474B', [0, 4.6, -0.7]);
  block([2.52, 0.1, 1.5], '#8F9289', [0, 4.285, 0.32]);
  block([2.58, 0.11, 2.1], '#2B333A', [0, 0.847, 0.15]);
  block([2.44, 3.48, 0.12], '#151E25', [0, 2.58, -0.255]);
  // The inset steel door has a proper bezel, radial bolts and a handwheel.
  construction.add(
    new THREE.CylinderGeometry(1.096, 1.096, 0.15, 64),
    '#84928D',
    'metal',
    [0, 2.36, -0.095],
    [Math.PI / 2, 0, 0],
  );
  construction.add(
    new THREE.CylinderGeometry(0.982, 0.982, 0.11, 64),
    '#35454D',
    'metal',
    [0, 2.36, 0.016],
    [Math.PI / 2, 0, 0],
  );
  ring(1.037, 0.044, '#B1BDB1', [0, 2.36, 0.086], true);
  ring(0.926, 0.016, '#6D8585', [0, 2.36, 0.084], true);
  for (let index = 0; index < 12; index++) {
    const angle = (index / 12) * Math.PI * 2;
    construction.add(
      new THREE.CylinderGeometry(0.036, 0.036, 0.029, 6),
      brass,
      'metal',
      [Math.sin(angle) * 1.034, 2.36 + Math.cos(angle) * 1.034, 0.123],
      [Math.PI / 2, 0, angle],
    );
    if (index % 2 === 0)
      block([0.113, 0.235, 0.056], '#768A8C', [Math.sin(angle) * 0.81, 2.36 + Math.cos(angle) * 0.81, 0.122], 'metal', [
        0,
        0,
        -angle,
      ]);
  }
  ring(0.338, 0.035, brass, [0, 2.36, 0.278], true);
  for (let spoke = 0; spoke < 5; spoke++)
    block(
      [0.029, 0.326, 0.036],
      '#BDB492',
      [Math.sin((spoke / 5) * Math.PI * 2) * 0.162, 2.36 + Math.cos((spoke / 5) * Math.PI * 2) * 0.162, 0.27],
      'metal',
      [0, 0, -(spoke / 5) * Math.PI * 2],
    );
  construction.add(
    new THREE.CylinderGeometry(0.096, 0.096, 0.13, 16),
    '#C4C8B4',
    'metal',
    [0, 2.36, 0.286],
    [Math.PI / 2, 0, 0],
  );
  for (const y of [1.65, 3.04]) block([0.27, 0.19, 0.28], '#899C99', [0.958, y, 0.074], 'metal');

  const shaft = new THREE.CylinderGeometry(1, 1, 3.66, 96, 10);
  const shaftVertices = shaft.getAttribute('position');
  for (let vertex = 0; vertex < shaftVertices.count; vertex++) {
    const x = shaftVertices.getX(vertex);
    const z = shaftVertices.getZ(vertex);
    if (x === 0 && z === 0) continue;
    const t = (shaftVertices.getY(vertex) + 1.83) / 3.66;
    const angle = Math.atan2(z, x);
    const radius = 0.332 + (1 - t) * 0.033 + Math.sin(t * Math.PI) * 0.018 - (0.5 + Math.cos(angle * 16) * 0.5) * 0.021;
    shaftVertices.setX(vertex, Math.cos(angle) * radius);
    shaftVertices.setZ(vertex, Math.sin(angle) * radius);
  }
  shaft.computeVertexNormals();
  for (const x of [-3.4, -1.8, 1.8, 3.4]) {
    block([0.92, 0.125, 0.92], '#777D79', [x, 0.84, 2]);
    block([0.81, 0.09, 0.81], '#A0A49B', [x, 0.943, 2]);
    column(0.395, 0.434, 0.14, '#8C938A', [x, 1.044, 2]);
    ring(0.372, 0.035, '#B4BAB0', [x, 1.126, 2]);
    construction.add(shaft.clone(), '#9DA397', 'stone', [x, 2.975, 2]);
    ring(0.339, 0.024, '#BBC0B1', [x, 4.69, 2]);
    column(0.474, 0.326, 0.184, '#9FA69A', [x, 4.78, 2]);
    column(0.465, 0.465, 0.066, '#C1C3B4', [x, 4.9, 2]);
    block([0.98, 0.135, 0.98], '#999F93', [x, 4.983, 2]);
  }
  shaft.dispose();
  for (const [width, height, depth, y, color] of [
    [8.95, 0.14, 5.37, 5.05, '#5A635E'],
    [9.08, 0.12, 5.48, 5.18, '#9CA598'],
    [9.34, 0.15, 5.66, 5.335, '#5E6860'],
    [9.55, 0.085, 5.78, 5.454, '#AEB7A7'],
  ] as const)
    block([width, height, depth], color, [0, y, 0]);
  for (let tooth = 0; tooth < 24; tooth++) block([0.185, 0.16, 0.19], '#B2BAAC', [-4.27 + tooth * 0.371, 5.304, 2.813]);
  const pediment = new THREE.Shape();
  pediment.moveTo(-4.7, 0);
  pediment.lineTo(4.7, 0);
  pediment.lineTo(0, 1.7);
  pediment.closePath();
  construction.add(
    new THREE.ExtrudeGeometry(pediment, { depth: 5.3, bevelEnabled: false }),
    '#3B4440',
    'stone',
    [0, 5.42, -2.65],
  );
  const rake = new THREE.Shape();
  rake.moveTo(-4.79, 0);
  rake.lineTo(4.79, 0);
  rake.lineTo(0, 1.76);
  rake.closePath();
  const opening = new THREE.Path();
  opening.moveTo(-4.04, 0.15);
  opening.lineTo(0, 1.52);
  opening.lineTo(4.04, 0.15);
  opening.closePath();
  rake.holes.push(opening);
  construction.add(
    new THREE.ExtrudeGeometry(rake, {
      depth: 0.15,
      bevelEnabled: true,
      bevelSize: 0.013,
      bevelThickness: 0.013,
      bevelSegments: 2,
    }),
    '#9BA58F',
    'stone',
    [0, 5.345, 2.701],
  );
  const relief = new THREE.Shape();
  relief.moveTo(-3.79, 0);
  relief.lineTo(3.79, 0);
  relief.lineTo(0, 1.235);
  relief.closePath();
  construction.add(new THREE.ShapeGeometry(relief), '#596253', 'stone', [0, 5.58, 2.718]);
  ring(0.281, 0.025, brass, [0, 6.055, 2.754], true);
  for (let leaf = 0; leaf < 12; leaf++)
    construction.add(
      new THREE.SphereGeometry(1, 8, 6).scale(0.036, 0.102, 0.014).rotateZ(-(leaf / 12) * Math.PI * 2),
      '#ADAF91',
      'stone',
      [Math.sin((leaf / 12) * Math.PI * 2) * 0.18, 6.055 + Math.cos((leaf / 12) * Math.PI * 2) * 0.18, 2.773],
    );
  block([9.25, 0.033, 0.11], WORLD_PALETTE.lime, [0, 5.407, 2.886], 'glow');
  for (let step = 0; step < 3; step++) {
    block([3.6, 0.2, 0.8], '#555F58', [0, 0.2 + step * 0.16, 3.6 - step * 0.65]);
    block([3.65, 0.033, 0.16], '#9CA694', [0, 0.309 + step * 0.16, 3.915 - step * 0.65]);
  }
  // Printer casing, cooling louvers and a bronze-edged paper outlet stay on the roof.
  block([1.8, 1.1, 1.8], '#69746D', [1.8, 5.95, -0.4], 'metal');
  block([1.86, 0.14, 1.86], '#A2AB98', [1.8, 6.514, -0.4], 'metal');
  block([1.4, 0.06, 0.7], '#17221F', [1.8, 6.615, -0.4], 'metal');
  for (const z of [-0.85, 0.05]) block([1.54, 0.073, 0.095], brass, [1.8, 6.63, z], 'metal');
  for (let vent = 0; vent < 7; vent++)
    block([0.105, 0.51, 0.027], '#242F2B', [1.24 + vent * 0.186, 6.05, 0.515], 'metal');
  block([6.7, 1.94, 0.19], '#858D7F', [0, 4.2, 2.475], 'metal');
  block([6.54, 1.77, 0.012], '#1E2B27', [0, 4.2, 2.573], 'metal');
  for (const x of [-3.24, 3.24])
    for (const y of [3.335, 5.065])
      construction.add(
        new THREE.CylinderGeometry(0.034, 0.034, 0.03, 6),
        brass,
        'metal',
        [x, y, 2.608],
        [Math.PI / 2, 0, 0],
      );
  construction.finish();
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 1280;
  signCanvas.height = 320;
  const signContext = signCanvas.getContext('2d');
  if (signContext) {
    signContext.scale(2, 2);
    signContext.fillStyle = WORLD_PALETTE.surface;
    signContext.fillRect(0, 0, 640, 160);
    signContext.fillStyle = WORLD_PALETTE.lime;
    signContext.font = '900 116px sans-serif';
    signContext.textAlign = 'center';
    signContext.textBaseline = 'middle';
    signContext.fillText('BRRR', 320, 88, 580);
  }
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const sign = mesh(
    bank,
    new THREE.PlaneGeometry(6.35, 1.58),
    new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false }),
    [0, 4.2, 2.59],
  );
  sign.name = 'bank-facade-brrr';
  sign.castShadow = false;
  register(bank, { kind: 'fun', id: 'bank' }, 'Visit the bank that goes BRRR');
  obstacle(BANK_POSITION[0], BANK_POSITION[1] - 0.6, 3.7);

  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  if (context) {
    context.scale(4, 4);
    context.fillStyle = '#DCE7BB';
    context.fillRect(0, 0, 192, 96);
    context.strokeStyle = '#657B42';
    context.lineWidth = 0.35;
    // Fine, fixed guilloche gives the notes a printed surface at close range.
    for (let line = 0; line < 20; line++) {
      context.beginPath();
      for (let x = 10; x <= 182; x += 2) {
        const y = 13 + line * 3.6 + Math.sin(x * 0.09 + line * 0.43) * 2;
        if (x === 10) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.lineWidth = 1.5;
    context.strokeStyle = '#45602E';
    context.strokeRect(5, 5, 182, 86);
    context.lineWidth = 0.6;
    context.strokeRect(8, 8, 176, 80);
    context.fillStyle = '#DCE7BB';
    context.beginPath();
    context.ellipse(96, 48, 33, 36, 0, 0, Math.PI * 2);
    context.fill();
    for (let ring = 0; ring < 4; ring++) {
      context.beginPath();
      for (let point = 0; point <= 180; point++) {
        const angle = (point / 180) * Math.PI * 2;
        const ripple = Math.sin(angle * 14) * 1.15;
        const x = 96 + Math.cos(angle) * (29 + ring * 1.25 + ripple);
        const y = 48 + Math.sin(angle) * (32 + ring * 0.9 + ripple);
        if (point === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.fillStyle = '#304D26';
    context.font = '700 48px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('$', 96, 49);
    context.font = '700 6px sans-serif';
    context.fillText('BANK OF BRRR', 96, 10.5);
    context.fillText('PLAY MONEY', 96, 86);
    for (const [x, y] of [
      [23, 24],
      [169, 24],
      [23, 71],
      [169, 71],
    ]) {
      context.fillStyle = '#DCE7BB';
      context.fillRect(x - 8, y - 10, 16, 20);
      context.fillStyle = '#304D26';
      context.font = '700 22px Georgia, serif';
      context.fillText('1', x, y);
    }
    context.font = '5px monospace';
    context.fillText('PW 000001', 44, 49);
    context.fillText('SERIES 21', 148, 49);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(1.24, 0.62);
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(BANK_BILL_COUNT), 1);
  opacity.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('billOpacity', opacity);
  const billMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
  });
  // One draw retains each note's individual fade without hundreds of materials.
  billMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float billOpacity;\nvarying float vBillOpacity;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvBillOpacity = billOpacity;',
    );
    shader.fragmentShader = `varying float vBillOpacity;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.a *= vBillOpacity;',
    );
  };
  billMaterial.customProgramCacheKey = () => 'world-bank-individual-opacity-v1';
  const bills = new THREE.InstancedMesh(geometry, billMaterial, BANK_BILL_COUNT);
  bills.name = 'bank-recycled-money';
  bills.castShadow = false;
  bills.receiveShadow = false;
  bills.frustumCulled = false;
  bills.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bank.add(bills);
  const transform = new THREE.Object3D();
  let disposed = false;
  let wasReduced = false;
  const currentFrame = bankBillFrame(0, 0);

  function animate(time: number, reducedMotion: boolean) {
    if (disposed || !Number.isFinite(time) || (reducedMotion && wasReduced)) return;
    wasReduced = reducedMotion;
    sign.rotation.z = reducedMotion ? 0 : Math.sin(time * 84) * 0.025 + Math.sin(time * 129) * 0.012;
    sign.position.x = reducedMotion ? 0 : Math.sin(time * 93) * 0.035;
    for (let index = 0; index < BANK_BILL_COUNT; index++) {
      const frame = writeBankBillFrame(reducedMotion ? 0 : time, index, currentFrame);
      transform.position.set(...frame.position);
      transform.rotation.set(...frame.rotation);
      transform.scale.setScalar(frame.scale);
      transform.updateMatrix();
      bills.setMatrixAt(index, transform.matrix);
      opacity.setX(index, frame.opacity);
    }
    bills.instanceMatrix.needsUpdate = true;
    opacity.needsUpdate = true;
  }
  animate(0, true);
  return {
    animate,
    dispose() {
      if (disposed) return;
      disposed = true;
      bills.dispose();
      disposeObject(bank);
    },
  };
}

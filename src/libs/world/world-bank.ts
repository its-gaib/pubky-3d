import * as THREE from 'three';
import { box, cylinder, mesh, WORLD_PALETTE } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import type { WorldInteraction } from '@/libs/world/world-types';

export const BANK_POSITION = WORLD_ANCHORS.bank;
export const BANK_BILL_COUNT = 30;
export const BANK_BILL_LIFETIME = 70;

/** Each bill owns an offset life: launch, drift, then independently evaporate. */
export function bankBillFrame(time: number, index: number) {
  const age = (((time / BANK_BILL_LIFETIME + index / BANK_BILL_COUNT) % 1) + 1) % 1;
  const angle = index * 2.39996;
  const lands = index % 3 !== 2;
  const flight = lands ? 0.48 + (index % 4) * 0.035 : 1;
  const progress = Math.min(1, age / flight);
  const spread = 0.4 + progress * (12 + (index % 5) * 2.2);
  const fade = THREE.MathUtils.smoothstep(age, 0.78, 1);
  const landing = lands ? THREE.MathUtils.smoothstep(progress, 0.86, 1) : 0;
  const y = lands
    ? 0.24 + 5.56 * (1 - progress) + Math.sin(progress * Math.PI) * 7
    : 5.8 + Math.sin(age * Math.PI) * 7 - age * 3.7;
  return {
    position: [1.8 + Math.cos(angle) * spread, y, -0.4 + Math.sin(angle) * spread] as [number, number, number],
    rotation: [
      Math.sin(age * 8 + index) * 0.5 * (1 - landing) - (landing * Math.PI) / 2,
      (angle + progress * 4) * (1 - landing),
      Math.sin(age * 12 + index) * 0.7 * (1 - landing) + (angle + progress * 4) * landing,
    ] as [number, number, number],
    scale: 1 - fade * 0.85,
    opacity: Math.min(1, age / 0.015) * (1 - fade),
    settled: lands && progress === 1,
  };
}

/** Original local joke prop. The bank has no account, currency, or network behavior. */
export function createBank(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
) {
  const bank = new THREE.Group();
  bank.position.set(BANK_POSITION[0], 0, BANK_POSITION[1]);
  scene.add(bank);
  box(bank, [10, 0.35, 7.5], WORLD_PALETTE.border, [0, 0.17, 0]);
  box(bank, [8.7, 0.35, 6.4], '#5E5E67', [0, 0.5, 0]);
  box(bank, [7.6, 4.3, 3.3], WORLD_PALETTE.surface, [0, 2.8, -0.7]);
  box(bank, [2.2, 3, 0.16], WORLD_PALETTE.background, [0, 2.3, 1]);
  for (const x of [-3.4, -1.8, 1.8, 3.4]) {
    cylinder(bank, 0.32, 0.4, 4.3, '#858590', [x, 2.8, 2], 10);
    box(bank, [0.95, 0.22, 0.95], WORLD_PALETTE.neutral, [x, 0.8, 2]);
    box(bank, [0.95, 0.24, 0.95], '#BABAC1', [x, 4.95, 2]);
  }
  box(bank, [9.2, 0.35, 5.5], WORLD_PALETTE.neutral, [0, 5.25, 0]);
  const pediment = new THREE.Shape();
  pediment.moveTo(-4.7, 0);
  pediment.lineTo(4.7, 0);
  pediment.lineTo(0, 1.7);
  pediment.closePath();
  mesh(bank, new THREE.ExtrudeGeometry(pediment, { depth: 5.3, bevelEnabled: false }), '#303034', [0, 5.42, -2.65]);
  box(bank, [9.25, 0.1, 0.13], WORLD_PALETTE.lime, [0, 5.4, 2.8]);
  for (let step = 0; step < 3; step++) box(bank, [3.6, 0.2, 0.8], '#454549', [0, 0.2 + step * 0.16, 3.6 - step * 0.65]);

  // A deliberately oversize printer exhaust gives the paper an obvious origin.
  box(bank, [1.8, 1.1, 1.8], '#71717A', [1.8, 5.95, -0.4]);
  box(bank, [1.4, 0.12, 0.7], WORLD_PALETTE.background, [1.8, 6.55, -0.4]);
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 640;
  signCanvas.height = 160;
  const signContext = signCanvas.getContext('2d');
  if (signContext) {
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
  box(bank, [6.7, 1.75, 0.18], '#858590', [0, 4.2, 2.48]);
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
  canvas.width = 192;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#C8FF03';
    context.fillRect(0, 0, 192, 96);
    context.strokeStyle = '#354411';
    context.lineWidth = 4;
    context.strokeRect(7, 7, 178, 82);
    context.beginPath();
    context.ellipse(96, 48, 31, 36, 0, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#26310A';
    context.font = '700 56px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('$', 96, 50);
    context.font = '700 22px sans-serif';
    context.fillText('1', 29, 28);
    context.fillText('1', 162, 69);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(1.24, 0.62);
  const bills = Array.from({ length: BANK_BILL_COUNT }, () => {
    const bill = mesh(
      bank,
      geometry,
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    bill.castShadow = false;
    bill.receiveShadow = false;
    return bill;
  });

  function animate(time: number, reducedMotion: boolean) {
    sign.rotation.z = reducedMotion ? 0 : Math.sin(time * 28) * 0.025 + Math.sin(time * 43) * 0.012;
    sign.position.x = reducedMotion ? 0 : Math.sin(time * 31) * 0.035;
    bills.forEach((bill, index) => {
      const frame = bankBillFrame(reducedMotion ? 0 : time, index);
      bill.position.set(...frame.position);
      bill.rotation.set(...frame.rotation);
      bill.scale.setScalar(frame.scale);
      bill.material.opacity = frame.opacity;
    });
  }
  animate(0, true);
  return { animate };
}

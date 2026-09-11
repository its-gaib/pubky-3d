import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { label, mesh, type Point3 } from '@/libs/world/world-geometry';
import { createLandmarkBuilder, landmarkAnnulus, type LandmarkBuilder } from '@/libs/world/world-landmark-details';
import { WORLD_ANCHORS, WORLD_PORTALS } from '@/libs/world/world-layout';
import type { WorldInteraction } from '@/libs/world/world-types';

const STONE = '#A9A9B2';
const INK = '#15171C';
const LIME = '#C8FF03';

function universityArchitecture(university: THREE.Group, detail: LandmarkBuilder) {
  const { add, box, cylinder, torus, beam, oval } = detail;
  box(university, [13, 0.4, 10], 'stone', '#303034', [0, 0.2, 0], 0.08);
  box(university, [12.6, 0.25, 9.6], 'stone', '#74747F', [0, 0.525, 0], 0.045);
  box(university, [12, 0.3, 9.1], 'stone', STONE, [0, 0.8, 0], 0.045);
  // The front wall is built around the doorway, giving the doors a real reveal.
  box(university, [10.4, 5.4, 5.4], 'stone', '#454549', [0, 3.7, -1.3]);
  for (const side of [-1, 1]) {
    box(university, [4.02, 5.4, 0.6], 'stone', '#515157', [side * 3.19, 3.7, 1.7]);
    box(university, [0.16, 5.3, 0.16], 'stone', '#696973', [side * 5.15, 3.65, 2.04]);
    box(university, [0.24, 3.85, 0.32], 'stone', '#92939F', [side * 1.22, 2.925, 2.06]);
    box(university, [0.12, 3.7, 0.15], 'stone', STONE, [side * 1.39, 2.94, 2.21]);
    box(university, [1.04, 3.54, 0.16], 'paint', '#252930', [side * 0.54, 2.74, 1.49], 0.035);
    for (const y of [1.78, 3.1]) {
      box(university, [0.79, 1.04, 0.07], 'metal', '#414851', [side * 0.54, y, 1.593], 0.025);
      box(university, [0.62, 0.88, 0.04], 'paint', '#20252C', [side * 0.54, y, 1.64], 0.015);
    }
    beam(university, [side * 0.15, 2.35, 1.76], [side * 0.15, 2.78, 1.76], 0.035, 'metal', '#C8CCB1');
    box(university, [0.58, 0.13, 0.44], 'metal', '#424950', [side * 1.76, 3.52, 2.23], 0.025);
    box(university, [0.32, 0.57, 0.24], 'light:#C8FF03', '#E1EDBA', [side * 1.76, 3.88, 2.24], 0.055);
    box(university, [0.5, 0.11, 0.35], 'metal', '#41464E', [side * 1.76, 4.22, 2.23], 0.025);
  }
  box(university, [2.36, 1.42, 0.6], 'stone', '#515157', [0, 5.69, 1.7]);
  box(university, [2.95, 0.25, 0.44], 'stone', STONE, [0, 4.97, 2.08], 0.035);
  box(university, [2.6, 0.35, 0.09], 'glass', '#526471', [0, 4.56, 1.61]);
  for (const x of [-0.78, -0.39, 0, 0.39, 0.78])
    box(university, [0.04, 0.37, 0.09], 'metal', '#8E958F', [x, 4.56, 1.68]);

  const window = (x: number, y: number, z: number, yaw = 0) => {
    const bay = new THREE.Group();
    bay.position.set(x, y, z);
    bay.rotation.y = yaw;
    const parts: [Point3, string, Point3][] = [
      [[1.42, 2.53, 0.08], INK, [0, 0, 0]],
      [[1.16, 2.25, 0.1], '#344B59', [0, 0, 0.045]],
      [[0.13, 2.61, 0.24], STONE, [-0.74, 0, 0.08]],
      [[0.13, 2.61, 0.24], STONE, [0.74, 0, 0.08]],
      [[1.63, 0.17, 0.37], '#B1B1BA', [0, -1.33, 0.15]],
      [[1.63, 0.15, 0.28], STONE, [0, 1.32, 0.09]],
      [[0.065, 2.3, 0.16], '#8C959B', [0, 0, 0.14]],
      [[1.18, 0.065, 0.16], '#8C959B', [0, 0.13, 0.14]],
      [[0.036, 2.17, 0.014], '#7B929E', [-0.43, 0, 0.105]],
    ];
    bay.updateMatrix();
    for (const [size, color, position] of parts) {
      add(
        university,
        new THREE.BoxGeometry(...size).translate(...position).applyMatrix4(bay.matrix),
        color === '#344B59' ? 'glass' : 'stone',
        color,
      );
    }
  };
  for (const x of [-3.61, 3.61]) window(x, 3.54, 2.05);
  for (const side of [-1, 1]) {
    for (const z of [-2.55, 0.18]) window(side * 5.22, 3.54, z, (side * Math.PI) / 2);
  }
  for (let course = 0; course < 7; course++) {
    for (const side of [-1, 1]) {
      box(university, [3.95, 0.035, 0.025], 'stone', '#64646A', [side * 3.2, 1.38 + course * 0.67, 2.019]);
      box(university, [0.025, 0.035, 5.94], 'stone', '#626269', [side * 5.21, 1.38 + course * 0.67, -1]);
    }
  }
  for (const x of [-4.7, -2.9, 2.9, 4.7]) {
    box(university, [1.13, 0.22, 1.13], 'stone', '#72737D', [x, 1.05, 3.1], 0.035);
    box(university, [1.02, 0.16, 1.02], 'stone', STONE, [x, 1.24, 3.1], 0.025);
    torus(university, 0.44, 0.072, 'stone', '#B5B6BD', [x, 1.39, 3.1]);
    const column = new THREE.CylinderGeometry(0.365, 0.43, 4.35, 112, 8, false);
    const positions = column.getAttribute('position');
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const px = positions.getX(vertex);
      const pz = positions.getZ(vertex);
      const angle = Math.atan2(pz, px);
      const height = (positions.getY(vertex) + 2.175) / 4.35;
      const radius = Math.hypot(px, pz);
      if (radius < 0.01) continue;
      const fluting = 1 - 0.06 * (0.5 + 0.5 * Math.cos(angle * 16));
      const entasis = Math.sin(height * Math.PI) * 0.022;
      positions.setXYZ(
        vertex,
        (px / radius) * (radius * fluting + entasis),
        positions.getY(vertex),
        (pz / radius) * (radius * fluting + entasis),
      );
    }
    column.computeVertexNormals();
    add(university, column, 'stone', '#B3B4BC', [x, 3.65, 3.1]);
    torus(university, 0.367, 0.06, 'stone', '#C0C0C6', [x, 5.82, 3.1]);
    cylinder(university, 0.55, 0.37, 0.21, 'stone', '#A6A7B1', [x, 5.98, 3.1]);
    box(university, [1.13, 0.21, 1.13], 'stone', '#C0C0C7', [x, 6.15, 3.1], 0.03);
    for (const side of [-1, 1]) {
      torus(university, 0.115, 0.045, 'stone', '#BCBDC5', [x + side * 0.38, 5.96, 3.57], [0, 0, 0]);
      cylinder(university, 0.057, 0.057, 0.025, 'stone', '#747680', [x + side * 0.38, 5.96, 3.616], 20, [
        Math.PI / 2,
        0,
        0,
      ]);
    }
  }
  box(university, [12.5, 0.44, 8.8], 'stone', '#8E8F99', [0, 6.44, 0], 0.035);
  box(university, [12.88, 0.15, 9.13], 'stone', '#C0C0C8', [0, 6.72, 0], 0.025);
  box(university, [12.24, 0.12, 8.64], 'stone', '#656772', [0, 6.13, 0]);
  for (let index = 0; index < 31; index++) {
    const x = -6 + index * 0.4;
    for (const z of [-4.39, 4.39]) box(university, [0.18, 0.17, 0.19], 'stone', '#C1C2C9', [x, 6.49, z]);
  }
  const roof = new THREE.Shape();
  roof.moveTo(-6.5, 0);
  roof.lineTo(6.5, 0);
  roof.lineTo(0, 2.6);
  roof.closePath();
  add(
    university,
    new THREE.ExtrudeGeometry(roof, {
      depth: 8.6,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 1,
    }),
    'paint',
    '#665080',
    [0, 6.8, -4.3],
  );
  const tympanum = new THREE.Shape();
  tympanum.moveTo(-5.57, 0);
  tympanum.lineTo(5.57, 0);
  tympanum.lineTo(0, 2.22);
  tympanum.closePath();
  add(
    university,
    new THREE.ExtrudeGeometry(tympanum, { depth: 0.07, bevelEnabled: false }),
    'stone',
    '#42404E',
    [0, 6.98, 4.34],
  );
  for (const side of [-1, 1]) {
    beam(university, [side * 6.51, 6.82, 4.42], [0, 9.43, 4.42], 0.105, 'stone', '#B7B6C1');
    beam(university, [side * 6.51, 6.82, -4.42], [0, 9.43, -4.42], 0.105, 'stone', '#B7B6C1');
    for (let seam = 0; seam < 17; seam++) {
      const z = -4.19 + seam * 0.524;
      beam(
        university,
        [side * 0.08, 9.41, z],
        [side * 6.42, 6.88, z],
        0.035,
        'paint',
        seam % 2 ? '#79658F' : '#8D789F',
      );
    }
    for (const x of [1.7, 3.3, 4.9])
      box(university, [0.065, 0.045, 8.63], 'paint', '#43374F', [side * x, 9.45 - x * 0.4, 0]);
  }
  beam(university, [0, 9.45, -4.42], [0, 9.45, 4.42], 0.1, 'metal', '#96949E');
  cylinder(university, 0.62, 0.62, 0.12, 'metal', '#8A907A', [0, 7.79, 4.48], 48, [Math.PI / 2, 0, 0]);
  torus(university, 0.57, 0.034, 'metal', '#D7DCC2', [0, 7.79, 4.57], [0, 0, 0]);
  box(university, [0.69, 0.4, 0.07], 'stone', '#C7CCB3', [0, 7.73, 4.58], 0.025);
  box(university, [0.035, 0.42, 0.08], 'light:#C8FF03', LIME, [0, 7.73, 4.63]);
  for (const x of [-5.48, 5.48]) {
    cylinder(university, 0.46, 0.34, 0.6, 'stone', '#535860', [x, 1.24, 4.04], 32);
    torus(university, 0.44, 0.045, 'stone', '#9EA39F', [x, 1.55, 4.04]);
    cylinder(university, 0.38, 0.38, 0.025, 'stone', '#252C25', [x, 1.55, 4.04], 28);
    for (let stem = 0; stem < 7; stem++) {
      const angle = stem * 2.4;
      beam(
        university,
        [x, 1.56, 4.04],
        [x + Math.cos(angle) * 0.35, 2.11 + (stem % 3) * 0.13, 4.04 + Math.sin(angle) * 0.3],
        0.045,
        'paint',
        stem % 2 ? '#7A9872' : '#506F57',
      );
    }
  }
  const cap = new THREE.Group();
  cap.name = 'university-mortarboard';
  cap.position.y = 11.7;
  university.add(cap);
  cylinder(cap, 1.15, 1.05, 0.7, 'rubber', '#292B34', [0, 0, 0], 64);
  torus(cap, 1.07, 0.045, 'rubber', '#11141C', [0, -0.32, 0]);
  box(cap, [4.2, 0.19, 4.2], 'rubber', '#181B23', [0, 0.42, 0], 0.06, [0, Math.PI / 4, 0]);
  box(cap, [4.05, 0.035, 4.05], 'rubber', '#363A45', [0, 0.535, 0], 0.02, [0, Math.PI / 4, 0]);
  oval(cap, [0.15, 0.075, 0.15], 'metal', '#778059', [0, 0.61, 0]);
  beam(cap, [0, 0.65, 0], [2, 0.6, 1], 0.054, 'paint', LIME);
  beam(cap, [2, 0.6, 1], [2, -0.53, 1], 0.05, 'paint', LIME);
  cylinder(cap, 0.11, 0.17, 0.4, 'paint', '#A4C73B', [2, -0.69, 1], 24);
  for (let thread = 0; thread < 8; thread++) {
    const angle = (thread / 8) * Math.PI * 2;
    beam(
      cap,
      [2 + Math.sin(angle) * 0.1, -0.55, 1 + Math.cos(angle) * 0.1],
      [2 + Math.sin(angle) * 0.17, -0.94, 1 + Math.cos(angle) * 0.17],
      0.015,
      'paint',
      '#C5E968',
    );
  }
  return cap;
}

function workshopYard(yard: THREE.Group, detail: LandmarkBuilder) {
  const { box, cylinder, torus, beam, oval } = detail;
  box(yard, [15, 0.25, 11], 'stone', '#303034', [0, 0.12, 0], 0.08);
  for (let x = -7; x <= 7; x++) box(yard, [0.025, 0.012, 10.4], 'stone', '#4B4D54', [x, 0.253, 0]);
  for (const z of [-4, -2, 0, 2, 4]) box(yard, [14.5, 0.012, 0.025], 'stone', '#4B4D54', [0, 0.253, z]);
  const workshops = [
    { x: -5, z: -1, color: '#664C36', edge: '#AB8E6C', name: 'APP' },
    { x: 0, z: -3, color: '#4F4264', edge: '#9583AD', name: 'NEXUS' },
    { x: 5, z: -1, color: '#31564F', edge: '#81AAA0', name: 'HOMESERVER' },
  ];
  for (const [index, workshop] of workshops.entries()) {
    const { x, z, color, edge } = workshop;
    box(yard, [3.72, 0.3, 3.44], 'stone', '#53555D', [x, 0.4, z], 0.035);
    box(yard, [3.6, 3.08, 3.3], 'paint', color, [x, 2.09, z], 0.045);
    box(yard, [3.95, 0.18, 3.65], 'metal', '#A1A4AE', [x, 3.72, z], 0.04);
    box(yard, [3.76, 0.12, 3.46], 'paint', '#282D36', [x, 3.865, z], 0.025);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) box(yard, [0.11, 3.08, 0.11], 'metal', edge, [x + side * 1.76, 2.09, z + end * 1.64]);
      box(yard, [0.07, 0.22, 3.47], 'metal', '#737B82', [x + side * 1.9, 3.91, z]);
      for (let course = 0; course < 7; course++)
        box(yard, [0.025, 0.035, 3.17], 'paint', edge, [x + side * 1.808, 0.82 + course * 0.4, z]);
    }
    box(yard, [3.65, 0.22, 0.07], 'metal', '#737B82', [x, 3.91, z - 1.77]);
    for (const offset of [-1.35, -0.45, 0.45, 1.35])
      box(yard, [0.07, 0.055, 3.3], 'metal', '#525B65', [x + offset, 3.94, z]);
    box(yard, [2.85, 2.52, 0.12], 'metal', '#171C24', [x, 1.92, z + 1.7]);
    for (const offset of [-1.43, 1.43]) box(yard, [0.12, 2.65, 0.26], 'metal', edge, [x + offset, 1.96, z + 1.78]);
    box(yard, [2.98, 0.13, 0.3], 'metal', edge, [x, 3.29, z + 1.8]);
    box(yard, [2.98, 0.12, 0.37], 'metal', '#80898B', [x, 0.64, z + 1.84]);
    beam(yard, [x - 1.62, 0.55, z + 1.81], [x - 1.62, 3.38, z + 1.81], 0.04, 'metal', '#B7B8B1');
    beam(yard, [x - 1.62, 3.38, z + 1.81], [x + 1.59, 3.38, z + 1.81], 0.04, 'metal', '#B7B8B1');
    box(yard, [0.32, 0.4, 0.13], 'metal', '#5A6367', [x - 1.62, 1.22, z + 1.87], 0.025);
    cylinder(yard, 0.041, 0.041, 0.036, 'light:#C8FF03', LIME, [x - 1.62, 1.3, z + 1.96], 16, [Math.PI / 2, 0, 0]);
    if (index === 0) {
      box(yard, [0.91, 2.24, 0.1], 'glass', '#365568', [x - 0.88, 1.86, z + 1.81]);
      box(yard, [1.65, 2.24, 0.1], 'glass', '#435B67', [x + 0.51, 1.86, z + 1.81]);
      box(yard, [0.09, 2.4, 0.18], 'metal', edge, [x - 0.33, 1.91, z + 1.92]);
      box(yard, [1.67, 0.09, 0.17], 'metal', edge, [x + 0.51, 1.58, z + 1.92]);
      beam(yard, [x - 0.53, 1.47, z + 2.03], [x - 0.53, 1.83, z + 2.03], 0.027, 'metal', '#D0D2BC');
      for (const offset of [0, 0.42, 0.84])
        box(yard, [0.08, 1.05, 0.014], 'glass', '#789198', [x + offset, 2.32, z + 1.871]);
      // The APP workshop has an electronics bench, laptop and small hand tools.
      box(yard, [1.85, 0.14, 0.77], 'stone', '#968778', [x - 0.4, 1.08, z + 3.2], 0.035);
      for (const side of [-1, 1])
        box(yard, [0.12, 0.77, 0.57], 'metal', '#656E74', [x - 0.4 + side * 0.72, 0.63, z + 3.2]);
      box(yard, [0.63, 0.07, 0.48], 'metal', '#414B58', [x - 0.2, 1.18, z + 3.17], 0.025);
      box(yard, [0.62, 0.45, 0.06], 'metal', '#7D8790', [x - 0.2, 1.44, z + 2.975], 0.025, [-0.14, 0, 0]);
      box(yard, [0.52, 0.32, 0.016], 'light:#C8FF03', '#526F40', [x - 0.2, 1.44, z + 3.019], 0.005, [-0.14, 0, 0]);
      box(yard, [0.36, 0.045, 0.26], 'paint', '#4E8561', [x - 0.94, 1.178, z + 3.12]);
      for (const dx of [-0.08, 0.08])
        box(yard, [0.07, 0.055, 0.1], 'metal', '#BEC2AF', [x - 0.94 + dx, 1.217, z + 3.12]);
      beam(yard, [x + 0.2, 1.17, z + 3.31], [x + 0.58, 1.17, z + 3.25], 0.023, 'metal', '#B4B9BF');
      beam(yard, [x + 0.57, 1.17, z + 3.25], [x + 0.73, 1.17, z + 3.22], 0.043, 'paint', LIME);
    } else {
      for (let rack = 0; rack < 3; rack++) {
        const rx = x - 0.91 + rack * 0.91;
        box(yard, [0.79, 2.23, 0.17], 'metal', '#29333B', [rx, 1.85, z + 1.83], 0.025);
        for (let unit = 0; unit < 5; unit++) {
          const y = 0.99 + unit * 0.43;
          box(yard, [0.65, 0.33, 0.06], 'metal', index === 1 ? '#4A4F67' : '#355854', [rx, y, z + 1.95], 0.014);
          for (let slot = 0; slot < 4; slot++)
            box(yard, [0.28, 0.018, 0.01], 'rubber', '#111B22', [rx - 0.12, y - 0.075 + slot * 0.05, z + 1.986]);
          for (const offset of [-0.065, 0.065])
            oval(yard, [0.025, 0.025, 0.012], 'light:#C8FF03', unit % 2 ? '#8DAD6E' : LIME, [
              rx + 0.23,
              y + offset,
              z + 1.997,
            ]);
        }
      }
      if (index === 1) {
        for (const side of [-1, 1]) {
          cylinder(yard, 0.38, 0.43, 0.2, 'metal', '#72808D', [x + side * 0.88, 4.04, z], 32);
          torus(yard, 0.29, 0.038, 'metal', '#3C4754', [x + side * 0.88, 4.16, z]);
          for (const angle of [0, Math.PI / 3, -Math.PI / 3])
            box(yard, [0.57, 0.04, 0.06], 'metal', '#A0A9AC', [x + side * 0.88, 4.16, z], 0, [0, angle, 0]);
        }
      } else {
        box(yard, [1.1, 0.48, 1.18], 'metal', '#525F60', [x + 0.45, 4.13, z - 0.42], 0.045);
        for (let louver = 0; louver < 6; louver++)
          box(yard, [0.9, 0.03, 0.04], 'metal', '#A1B0A7', [x + 0.45, 3.97 + louver * 0.066, z + 0.19]);
        beam(yard, [x - 0.88, 3.93, z - 0.6], [x - 0.88, 4.87, z - 0.6], 0.04, 'metal', '#9EB5AD');
        for (const y of [4.61, 4.82])
          beam(yard, [x - 1.21, y, z - 0.6], [x - 0.55, y, z - 0.6], 0.025, 'metal', '#AEC4BB');
      }
    }
    label(yard, workshop.name, [x, 4.8, z + 0.5], 4.5);
  }
  // The original git-branch silhouette is retained as a built metal sculpture.
  const branchX = 1.2;
  const branchZ = 3.7;
  cylinder(yard, 0.8, 0.96, 0.24, 'metal', '#657077', [branchX, 0.4, branchZ], 48);
  beam(yard, [branchX, 0.5, branchZ], [branchX, 7.4, branchZ], 0.23, 'metal', '#9CA7AC');
  beam(yard, [branchX, 3.3, branchZ], [branchX + 3, 5.1, branchZ], 0.23, 'metal', '#9CA7AC');
  beam(yard, [branchX + 3, 5.1, branchZ], [branchX + 3, 7.4, branchZ], 0.23, 'metal', '#9CA7AC');
  for (const [x, y, color] of [
    [0, 1, LIME],
    [0, 4.3, '#9A7DCD'],
    [0, 7.4, '#67B79A'],
    [3, 7.4, LIME],
  ] as const) {
    oval(yard, [0.62, 0.62, 0.62], 'paint', color, [branchX + x, y, branchZ]);
    torus(yard, 0.595, 0.05, 'metal', '#434F59', [branchX + x, y, branchZ], [0, 0, 0]);
    cylinder(yard, 0.21, 0.21, 0.08, 'metal', '#D0D5C2', [branchX + x, y, branchZ + 0.62], 28, [Math.PI / 2, 0, 0]);
  }
  for (const x of [-5, 0, 5]) {
    beam(yard, [x, 0.28, 0.99], [x, 0.28, 1.25], 0.027, 'paint', '#7F9270');
    beam(yard, [x, 0.28, 1.25], [0.35, 0.28, 1.25], 0.027, 'paint', '#7F9270');
  }
  for (const x of [6.1, 7])
    cylinder(yard, 0.47, 0.47, 0.08, 'stone', '#8D806F', [x, 0.82, 2.15], 36, [0, 0, Math.PI / 2]);
  cylinder(yard, 0.35, 0.35, 0.88, 'rubber', '#242C32', [6.55, 0.82, 2.15], 36, [0, 0, Math.PI / 2]);
  for (let loop = 0; loop < 8; loop++)
    torus(yard, 0.353, 0.022, 'rubber', '#455255', [6.18 + loop * 0.106, 0.82, 2.15], [0, Math.PI / 2, 0]);
  box(yard, [1.18, 0.84, 1.08], 'stone', '#6D624F', [6.23, 0.7, 3.79], 0.025);
  for (const x of [5.79, 6.67]) box(yard, [0.13, 0.91, 1.13], 'stone', '#A18F72', [x, 0.7, 3.79]);
  for (const z of [3.27, 4.31]) box(yard, [1.16, 0.12, 0.08], 'stone', '#A18F72', [6.23, 1.02, z]);
  forkliftAssembly(yard, detail);
  return workshops;
}

function forkliftAssembly(yard: THREE.Group, detail: LandmarkBuilder) {
  const { box, cylinder, torus, beam, oval } = detail;
  const forklift = new THREE.Group();
  forklift.name = 'yard-forklift';
  forklift.position.set(-4.3, 0, 3.8);
  yard.add(forklift);
  box(forklift, [1.78, 0.48, 2.39], 'metal', '#343C40', [0, 0.85, 0], 0.085);
  box(forklift, [1.94, 1.05, 0.83], 'paint', '#AACD32', [0, 1.22, -0.86], 0.17);
  box(forklift, [1.86, 0.37, 1.31], 'paint', LIME, [0, 1.13, 0.13], 0.09);
  box(forklift, [1.49, 0.07, 1.47], 'rubber', '#252D33', [0, 1.37, -0.08], 0.025);
  box(forklift, [0.78, 0.23, 0.75], 'rubber', '#151D24', [0, 1.79, -0.36], 0.11);
  box(forklift, [0.8, 0.73, 0.2], 'rubber', '#263039', [0, 2.08, -0.71], 0.08, [-0.08, 0, 0]);
  box(forklift, [0.6, 0.4, 0.035], 'rubber', '#3A454D', [0, 2.11, -0.576], 0.04);
  box(forklift, [0.57, 0.47, 0.59], 'metal', '#545D5D', [0, 1.48, -0.35], 0.035);
  for (const side of [-1, 1]) {
    for (const z of [-0.98, 0.46])
      box(forklift, [0.105, 1.71, 0.105], 'metal', '#4A575C', [side * 0.79, 2.34, z], 0.025);
    box(forklift, [0.16, 0.1, 1.38], 'metal', '#6B777A', [side * 0.79, 3.17, -0.27], 0.025);
    box(forklift, [0.17, 0.07, 0.67], 'metal', '#9BABA0', [side * 1.04, 0.86, -0.1], 0.025);
    beam(forklift, [side * 0.74, 1.39, 0.43], [side * 0.74, 2.07, 0.43], 0.025, 'metal', '#B2BDAB');
  }
  box(forklift, [1.91, 0.14, 1.72], 'paint', '#A2B785', [0, 3.26, -0.28], 0.065);
  for (const x of [-0.62, -0.3, 0, 0.3, 0.62])
    box(forklift, [0.095, 0.035, 1.5], 'metal', '#485555', [x, 3.35, -0.28], 0.012);
  cylinder(forklift, 0.15, 0.17, 0.09, 'metal', '#566166', [0.56, 3.41, -0.69], 24);
  oval(forklift, [0.115, 0.15, 0.115], 'light:#FFAA62', '#FFBD61', [0.56, 3.54, -0.69]);
  for (const side of [-1, 1]) {
    for (const z of [-0.83, 0.83]) {
      const x = side * 0.98;
      cylinder(forklift, 0.395, 0.395, 0.35, 'rubber', '#101921', [x, 0.55, z], 40, [0, 0, Math.PI / 2]);
      torus(forklift, 0.335, 0.126, 'rubber', '#202930', [x, 0.55, z], [0, Math.PI / 2, 0]);
      for (let tread = 0; tread < 18; tread++) {
        const angle = (tread / 18) * Math.PI * 2;
        box(
          forklift,
          [0.32, 0.05, 0.092],
          'rubber',
          '#2C363C',
          [x, 0.55 + Math.cos(angle) * 0.451, z + Math.sin(angle) * 0.451],
          0,
          [angle, 0, 0],
        );
      }
      cylinder(forklift, 0.205, 0.205, 0.39, 'metal', '#ADB5B6', [x, 0.55, z], 36, [0, 0, Math.PI / 2]);
      cylinder(forklift, 0.087, 0.087, 0.41, 'metal', '#4E5B61', [x, 0.55, z], 24, [0, 0, Math.PI / 2]);
      for (let bolt = 0; bolt < 5; bolt++) {
        const angle = (bolt / 5) * Math.PI * 2;
        cylinder(
          forklift,
          0.024,
          0.024,
          0.018,
          'metal',
          '#DBDED2',
          [x + side * 0.207, 0.55 + Math.sin(angle) * 0.145, z + Math.cos(angle) * 0.145],
          6,
          [0, 0, Math.PI / 2],
        );
      }
    }
    box(forklift, [0.19, 3.02, 0.29], 'metal', '#222D35', [side * 0.62, 1.92, 1.37], 0.025);
    box(forklift, [0.062, 2.88, 0.035], 'metal', '#A0AEB2', [side * 0.61, 1.91, 1.54]);
    cylinder(forklift, 0.085, 0.085, 1.19, 'metal', '#65797D', [side * 0.4, 1.12, 1.11], 28);
    cylinder(forklift, 0.036, 0.036, 1.51, 'metal', '#D0D7CB', [side * 0.4, 1.97, 1.11], 24);
    box(forklift, [0.21, 0.13, 1.8], 'metal', '#899899', [side * 0.6, 0.5, 2.2], 0.025);
    box(forklift, [0.22, 0.72, 0.13], 'metal', '#899899', [side * 0.6, 0.86, 1.4], 0.025);
    box(forklift, [0.34, 0.26, 0.15], 'metal', '#39464D', [side * 0.69, 1.37, 1.04], 0.045);
    box(forklift, [0.24, 0.17, 0.03], 'ceramic', '#E9E9C4', [side * 0.69, 1.39, 1.137], 0.035);
  }
  for (const y of [0.94, 1.35, 3.26]) box(forklift, [1.34, 0.17, 0.2], 'metal', '#576B73', [0, y, 1.38], 0.022);
  for (let link = 0; link < 12; link++)
    torus(
      forklift,
      0.037,
      0.012,
      'metal',
      '#A0AAA4',
      [0, 1.47 + link * 0.135, 1.54],
      [0, link % 2 ? Math.PI / 2 : 0, 0],
    );
  beam(forklift, [0, 1.46, 0.25], [0, 2.17, 0.16], 0.037, 'metal', '#B3C0B3');
  torus(forklift, 0.22, 0.035, 'rubber', '#17232B', [0, 2.19, 0.16], [0.62, 0, 0]);
  beam(forklift, [-0.15, 2.17, 0.17], [0.15, 2.17, 0.17], 0.018, 'metal', '#657778');
  box(forklift, [0.95, 0.19, 0.28], 'metal', '#3A4B50', [0, 1.98, 0.46], 0.03, [-0.18, 0, 0]);
  for (const side of [-1, 1]) {
    beam(forklift, [side * 0.48, 1.72, 0.18], [side * 0.46, 2.05, 0.14], 0.018, 'metal', '#ADB7AE');
    oval(forklift, [0.045, 0.06, 0.045], 'rubber', '#141F28', [side * 0.46, 2.06, 0.14]);
  }
  for (let vent = 0; vent < 5; vent++)
    box(forklift, [1.29, 0.035, 0.019], 'rubber', '#334334', [0, 0.99 + vent * 0.13, -1.289]);
}

function bitkitPlinth(bitkit: THREE.Group, detail: LandmarkBuilder) {
  const { box, cylinder, torus, beam } = detail;
  cylinder(bitkit, 6.2, 6.5, 0.45, 'stone', '#303034', [0, 0.22, 0], 96);
  cylinder(bitkit, 5.08, 5.8, 1.1, 'paint', '#BD481F', [0, 1, 0], 96);
  cylinder(bitkit, 3.8, 4.8, 0.7, 'paint', '#E46532', [0, 1.9, 0], 96);
  torus(bitkit, 5.31, 0.055, 'metal', '#E59967', [0, 1.25, 0]);
  torus(bitkit, 4.68, 0.05, 'metal', '#732F23', [0, 1.62, 0]);
  torus(bitkit, 3.89, 0.045, 'light:#FFAA62', '#FFAF72', [0, 2.19, 0]);
  cylinder(bitkit, 3.74, 3.74, 0.08, 'metal', '#3E4244', [0, 2.285, 0], 96);
  for (let segment = 0; segment < 16; segment++) {
    const angle = (segment * Math.PI) / 8;
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    box(bitkit, [0.065, 0.43, 0.065], 'metal', '#8D402B', [x * 5.46, 0.91, z * 5.46], 0.01, [0, angle, 0]);
    cylinder(bitkit, 0.088, 0.088, 0.055, 'metal', '#D7A68C', [x * 5.92, 0.455, z * 5.92], 6);
    beam(bitkit, [x * 4.1, 2.18, z * 4.1], [x * 4.61, 1.71, z * 4.61], 0.018, 'metal', '#F6A775');
  }
  const support = new THREE.Group();
  support.rotation.y = Math.PI - 0.16;
  bitkit.add(support);
  for (const side of [-1, 1]) {
    box(support, [0.75, 0.2, 0.95], 'metal', '#646061', [side * 3.02, 2.4, -0.22], 0.04);
    box(support, [0.27, 3.29, 0.4], 'metal', '#5B5151', [side * 3.02, 4.1, -0.22], 0.045);
    box(support, [0.095, 3.27, 0.42], 'paint', '#FC6B30', [side * 3.02, 4.1, -0.23], 0.025);
    beam(support, [side * 2.05, 2.46, -0.22], [side * 3.02, 4.88, -0.22], 0.09, 'metal', '#A97662');
    beam(support, [side * 3.02, 4.64, -0.22], [side * 4.32, 5.67, -0.22], 0.08, 'metal', '#9B6859');
    box(support, [0.54, 0.27, 0.6], 'metal', '#A77960', [side * 4.32, 5.6, -0.22], 0.055);
    for (const dx of [-0.22, 0.22])
      cylinder(support, 0.055, 0.055, 0.07, 'metal', '#BDB5A9', [side * 3.02 + dx, 2.53, -0.22], 6);
  }
  box(support, [9.22, 0.18, 0.34], 'metal', '#484B50', [0, 5.52, -0.23], 0.035);
}

function duckPond(pond: THREE.Group, detail: LandmarkBuilder) {
  const { add, oval, beam } = detail;
  add(pond, new THREE.CylinderGeometry(5.45, 5.7, 0.18, 96).scale(1, 1, 0.8), 'stone', '#343D42', [0, 0.08, 0]);
  for (let stone = 0; stone < 28; stone++) {
    const start = (stone * Math.PI) / 14;
    add(
      pond,
      landmarkAnnulus(4.9, 5.57, 0.22, start + 0.01, Math.PI / 14 - 0.02, 0.035).scale(1, 1, 0.8),
      'stone',
      ['#7C8381', '#939894', '#696F71', '#A0A39A'][stone % 4],
      [0, 0.1 + (stone % 3) * 0.007, 0],
    );
  }
  const water = mesh(
    pond,
    new THREE.CircleGeometry(4.93, 96),
    new THREE.MeshStandardMaterial({
      color: '#285D68',
      metalness: 0.48,
      roughness: 0.22,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
    [0, 0.235, 0],
  );
  water.name = 'duck-pond-water';
  water.rotation.x = -Math.PI / 2;
  water.scale.y = 0.8;
  water.castShadow = false;
  for (const [radius, angle, color] of [
    [2.75, 0.32, '#5B8F96'],
    [3.53, 2.52, '#427B84'],
    [4.32, 0.42, '#477A80'],
  ] as const) {
    const ripple = new THREE.TorusGeometry(radius, 0.018, 5, 72, 2.5)
      .rotateZ(angle)
      .rotateX(-Math.PI / 2)
      .scale(1, 1, 0.8);
    add(pond, ripple, 'glass', color, [0, 0.247, 0]);
  }
  for (const [x, z, size] of [
    [-3.37, -2.38, 1],
    [3.58, -2.36, 0.87],
    [4.56, 0.76, 0.7],
  ] as const) {
    for (let stem = 0; stem < 7; stem++) {
      const angle = stem * 2.4;
      const dx = Math.sin(angle) * 0.21;
      const dz = Math.cos(angle) * 0.21;
      const height = (1.02 + (stem % 3) * 0.24) * size;
      beam(
        pond,
        [x + dx, 0.25, z + dz],
        [x + dx * 2.25, height, z + dz * 2.25],
        0.025,
        'paint',
        stem % 2 ? '#536F48' : '#6B8754',
      );
      for (const side of [-1, 1]) {
        const leaf = new THREE.Shape();
        leaf.moveTo(0, 0);
        leaf.quadraticCurveTo(side * 0.19, height * 0.39, side * 0.34, height * 0.55);
        leaf.quadraticCurveTo(side * 0.09, height * 0.48, 0, 0);
        add(
          pond,
          new THREE.ExtrudeGeometry(leaf, { depth: 0.014, bevelEnabled: false, curveSegments: 4 }),
          'paint',
          '#7A955E',
          [x + dx, 0.4, z + dz],
          [0, angle, 0],
        );
      }
      if (stem % 3 === 0)
        add(pond, new THREE.CapsuleGeometry(0.064, 0.25, 3, 12), 'rubber', '#73553D', [
          x + dx * 2.25,
          height + 0.1,
          z + dz * 2.25,
        ]);
    }
  }
  for (const [x, z, radius] of [
    [-3.56, 1.4, 0.4],
    [-3.02, 1.63, 0.3],
    [2.78, -1.9, 0.34],
  ] as const) {
    add(
      pond,
      new THREE.CircleGeometry(radius, 32, 0.18, Math.PI * 2 - 0.35).rotateX(-Math.PI / 2),
      'paint',
      '#72916B',
      [x, 0.262, z],
    );
    beam(pond, [x, 0.27, z], [x - radius * 0.73, 0.27, z], 0.009, 'paint', '#A8B886');
  }
  for (let petal = 0; petal < 6; petal++) {
    const angle = (petal * Math.PI) / 3;
    oval(pond, [0.093, 0.046, 0.075], 'ceramic', '#D9C9C2', [
      -3.56 + Math.sin(angle) * 0.075,
      0.32,
      1.4 + Math.cos(angle) * 0.075,
    ]);
  }
  oval(pond, [0.065, 0.055, 0.065], 'ceramic', '#D9B46A', [-3.56, 0.35, 1.4]);
  const duck = new THREE.Group();
  duck.name = 'pond-sculpted-duck';
  duck.position.y = 1.1;
  pond.add(duck);
  oval(duck, [2.34, 1.51, 1.97], 'ceramic', '#EDBE35', [0, 0.08, -0.04]);
  oval(duck, [1.14, 1.34, 1.11], 'ceramic', '#F7CB40', [0, 0.94, 0.99]);
  oval(duck, [1.3, 1.29, 1.26], 'ceramic', '#FFDA51', [0, 1.87, 1.06]);
  add(
    duck,
    new THREE.SphereGeometry(1, 32, 20).scale(0.73, 0.35, 0.92).rotateX(-0.36),
    'ceramic',
    '#F1C342',
    [0, 0.56, -1.83],
  );
  for (const side of [-1, 1]) {
    add(duck, new THREE.SphereGeometry(1, 28, 20).scale(0.35, 0.65, 1.29).rotateX(0.15), 'ceramic', '#FFCF48', [
      side * 1.99,
      0.35,
      -0.09,
    ]);
    for (let feather = 0; feather < 3; feather++) {
      const points = [
        new THREE.Vector3(side * 2.31, 0.61 - feather * 0.13, -0.49),
        new THREE.Vector3(side * 2.28, 0.39 - feather * 0.13, -0.22),
        new THREE.Vector3(side * 2.18, 0.14 - feather * 0.1, 0.39),
      ];
      add(duck, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, 0.018, 5, false), 'ceramic', '#DCA630');
    }
    oval(duck, [0.21, 0.256, 0.13], 'ceramic', '#EDB739', [side * 0.76, 2.165, 2.055]);
    oval(duck, [0.139, 0.179, 0.113], 'ceramic', '#18252A', [side * 0.778, 2.187, 2.137]);
    oval(duck, [0.038, 0.047, 0.026], 'ceramic', '#F2F5DC', [side * 0.754, 2.252, 2.235]);
    oval(duck, [0.018, 0.022, 0.017], 'ceramic', '#B9CDCC', [side * 0.807, 2.143, 2.245]);
  }
  oval(duck, [0.87, 0.28, 0.88], 'ceramic', '#F49446', [0, 1.66, 2.26]);
  oval(duck, [0.79, 0.151, 0.76], 'ceramic', '#D87933', [0, 1.462, 2.29]);
  const smile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.71, 1.535, 2.56),
    new THREE.Vector3(-0.43, 1.525, 2.94),
    new THREE.Vector3(0, 1.528, 3.085),
    new THREE.Vector3(0.43, 1.525, 2.94),
    new THREE.Vector3(0.71, 1.535, 2.56),
  ]);
  add(duck, new THREE.TubeGeometry(smile, 28, 0.018, 6, false), 'ceramic', '#9D512E');
  for (const side of [-1, 1]) oval(duck, [0.052, 0.021, 0.076], 'ceramic', '#9C542D', [side * 0.287, 1.909, 2.505]);
  return duck;
}

function trampolineFrame(trampoline: THREE.Group, detail: LandmarkBuilder) {
  const { add, box, cylinder, torus, beam } = detail;
  cylinder(trampoline, 2.43, 2.43, 0.1, 'rubber', '#161F27', [0, 0.84, 0], 96);
  torus(trampoline, 2.42, 0.045, 'rubber', '#68755B', [0, 0.9, 0]);
  torus(trampoline, 1.4, 0.035, 'rubber', '#72864D', [0, 0.898, 0]);
  torus(trampoline, 2.95, 0.082, 'metal', '#869396', [0, 0.66, 0]);
  torus(trampoline, 3.13, 0.07, 'rubber', '#313E2B', [0, 0.83, 0]);
  for (let pad = 0; pad < 16; pad++) {
    const start = (pad * Math.PI) / 8;
    add(
      trampoline,
      landmarkAnnulus(2.76, 3.17, 0.2, start + 0.012, Math.PI / 8 - 0.024, 0.035),
      'rubber',
      pad % 4 ? '#A9D829' : '#C8EE4C',
      [0, 0.79, 0],
    );
    const angle = start + Math.PI / 16;
    box(
      trampoline,
      [0.075, 0.012, 0.22],
      'rubber',
      '#728C30',
      [Math.sin(angle) * 2.965, 1.037, Math.cos(angle) * 2.965],
      0.007,
      [0, angle, 0],
    );
  }
  for (let spring = 0; spring < 32; spring++) {
    const angle = (spring * Math.PI) / 16;
    const points: THREE.Vector3[] = [];
    for (let point = 0; point <= 30; point++) {
      const amount = point / 30;
      const radius = 2.44 + amount * 0.33;
      const turn = amount * Math.PI * 6;
      const tangent = Math.cos(turn) * 0.035;
      points.push(
        new THREE.Vector3(
          Math.sin(angle) * radius + Math.cos(angle) * tangent,
          0.856 + Math.sin(turn) * 0.035,
          Math.cos(angle) * radius - Math.sin(angle) * tangent,
        ),
      );
    }
    add(
      trampoline,
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 30, 0.011, 5, false),
      'metal',
      '#A7B3AA',
    );
  }
  for (let leg = 0; leg < 6; leg++) {
    const angle = (leg * Math.PI) / 3;
    const x = Math.sin(angle) * 2.8;
    const z = Math.cos(angle) * 2.8;
    beam(trampoline, [x, 0.67, z], [x * 1.04, 0.17, z * 1.04], 0.075, 'metal', '#8B999B');
    cylinder(trampoline, 0.12, 0.14, 0.12, 'rubber', '#253339', [x * 1.04, 0.12, z * 1.04], 20);
    if (leg % 2 === 0) {
      const next = angle + Math.PI / 3;
      beam(
        trampoline,
        [x * 1.04, 0.17, z * 1.04],
        [Math.sin(next) * 2.912, 0.17, Math.cos(next) * 2.912],
        0.075,
        'metal',
        '#75888E',
      );
    }
  }
}

function gatewayArchitecture(portal: THREE.Group, color: string, detail: LandmarkBuilder) {
  const { add, box, cylinder, torus, beam } = detail;
  cylinder(portal, 4.3, 4.8, 0.4, 'stone', '#303034', [0, 0.2, 0], 96);
  cylinder(portal, 4.19, 4.25, 0.1, 'metal', '#4D5660', [0, 0.45, 0], 96);
  for (let panel = 0; panel < 12; panel++)
    add(
      portal,
      landmarkAnnulus(3.29, 4.1, 0.028, (panel * Math.PI) / 6 + 0.018, Math.PI / 6 - 0.036),
      'stone',
      panel % 2 ? '#5C6268' : '#484F58',
      [0, 0.51, 0],
    );
  torus(portal, 3.16, 0.425, 'metal', '#323C47', [0, 4, 0], [0, 0, 0]);
  torus(portal, 3.17, 0.12, 'metal', '#97A3AD', [0, 4, 0.39], [0, 0, 0]);
  torus(portal, 3.17, 0.1, 'metal', '#667B86', [0, 4, -0.39], [0, 0, 0]);
  torus(portal, 3.42, 0.078, 'paint', '#232F3B', [0, 4, 0.14], [0, 0, 0]);
  torus(portal, 2.79, 0.083, 'metal', '#B3BEC5', [0, 4, 0.15], [0, 0, 0]);
  for (const side of [-1, 1]) {
    box(portal, [0.91, 0.22, 1.59], 'metal', '#77828B', [side * 2.64, 0.65, 0], 0.06);
    box(portal, [0.67, 1.11, 0.88], 'metal', '#4A5964', [side * 2.64, 1.19, 0], 0.065, [0, 0, side * 0.23]);
    beam(portal, [side * 3.54, 0.62, 0], [side * 2.6, 1.75, 0], 0.098, 'metal', '#A8B2B4');
    for (const z of [-0.52, 0.52]) cylinder(portal, 0.074, 0.074, 0.06, 'metal', '#D1D5C8', [side * 2.91, 0.802, z], 6);
    box(portal, [0.11, 0.57, 0.036], `light:${color}`, color, [side * 2.63, 1.18, 0.51], 0.025, [0, 0, side * 0.23]);
  }
  for (let rune = 0; rune < 8; rune++) {
    const angle = (rune * Math.PI) / 4;
    const x = Math.sin(angle) * 3.17;
    const y = 4 + Math.cos(angle) * 3.17;
    box(portal, [0.49, 0.67, 0.22], 'paint', '#1F2A37', [x, y, 0.48], 0.06, [0, 0, -angle]);
    box(portal, [0.22, 0.36, 0.04], 'ceramic', '#D9E2DB', [x, y, 0.615], 0.03, [0, 0, -angle]);
    for (const offset of [-0.25, 0.25])
      cylinder(
        portal,
        0.04,
        0.04,
        0.027,
        'metal',
        '#899FA7',
        [x + Math.sin(angle) * offset, y + Math.cos(angle) * offset, 0.615],
        6,
        [Math.PI / 2, 0, 0],
      );
  }
  const portalRing = new THREE.Group();
  portalRing.name = 'portal-energy-track';
  portalRing.position.y = 4;
  portal.add(portalRing);
  torus(portalRing, 2.735, 0.068, `light:${color}`, color, [0, 0, 0.16], [0, 0, 0]);
  for (let segment = 0; segment < 16; segment++)
    torus(portalRing, 3.18, 0.035, `light:${color}`, color, [0, 0, 0.525], [0, 0, (segment * Math.PI) / 8], 0.17);
  const veil = mesh(
    portal,
    new THREE.CircleGeometry(2.72, 80),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
      forceSinglePass: true,
      fog: false,
      toneMapped: false,
    }),
    [0, 4, 0],
  );
  veil.name = 'portal-veil';
  veil.castShadow = false;
  veil.receiveShadow = false;
  return { portalRing, veil };
}

/** Detailed local miniatures. Only the fixed, bundled Bitkit asset is parsed as SVG. */
export function createLandmarks(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, label: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
): { animate: (time: number, delta: number) => void; dispose: () => void } {
  const abort = new AbortController();
  const detail = createLandmarkBuilder();
  function group(name: string, x: number, z: number) {
    const object = new THREE.Group();
    object.name = name;
    object.position.set(x, 0, z);
    scene.add(object);
    return object;
  }

  const university = group('Pubky University', ...WORLD_ANCHORS.university);
  const cap = universityArchitecture(university, detail);
  label(university, 'Pubky University', [0, 15, 0], 12);
  label(university, 'KEEP YOUR KEYS. GET A DEGREE.', [0, 2.4, 5.7], 8.4, LIME);
  register(university, { kind: 'zone', id: 'university' }, 'Visit Pubky University');
  obstacle(university.position.x, university.position.z - 1.2, 4.7);

  const yard = group('Open Source Yard', ...WORLD_ANCHORS.github);
  const workshops = workshopYard(yard, detail);
  workshops.forEach((workshop) => obstacle(yard.position.x + workshop.x, yard.position.z + workshop.z, 2.2));
  label(yard, 'Open Source Yard', [0, 10.1, 0], 12);
  register(yard, { kind: 'zone', id: 'github' }, 'Explore the GitHub workshops');

  const bitkit = group('Bitkit Beacon', ...WORLD_ANCHORS.bitkit);
  bitkitPlinth(bitkit, detail);
  const logo = new THREE.Group();
  logo.name = 'bitkit-official-logo';
  logo.position.set(0, 7.3, 0);
  logo.rotation.y = Math.PI - 0.16;
  bitkit.add(logo);
  const fallback = label(logo, 'BITKIT', [0, 0, 0], 13, '#ffffff', '#ff4400');
  void fetch('/world/bitkit-logo.svg', { signal: abort.signal, credentials: 'omit' })
    .then((response) => (response.ok ? response.text() : null))
    .then((source) => {
      if (!source || abort.signal.aborted) return;
      const parsed = new SVGLoader().parse(source);
      const extrusion = new THREE.Group();
      extrusion.name = 'bitkit-bundled-extrusion';
      for (const [index, path] of parsed.paths.entries()) {
        const shapes = path.toShapes();
        const geometry = new THREE.ExtrudeGeometry(shapes, {
          depth: 4,
          bevelEnabled: true,
          bevelThickness: 0.55,
          bevelSize: 0.45,
          bevelSegments: 3,
          curveSegments: 18,
        });
        const surface = new THREE.MeshStandardMaterial({
          color: path.color,
          roughness: 0.3,
          metalness: 0.24,
          side: THREE.DoubleSide,
        });
        // The source contains a few coincident contour points. Keep cap normals
        // exactly planar even for the resulting zero-area triangulation edges.
        const positions = geometry.getAttribute('position');
        const normals = geometry.getAttribute('normal');
        for (const cap of geometry.groups.filter((part) => part.materialIndex === 0)) {
          for (let vertex = cap.start; vertex < cap.start + cap.count; vertex++) {
            normals.setXYZ(vertex, 0, 0, positions.getZ(vertex) < 2 ? -1 : 1);
          }
        }
        const object = mesh(extrusion, geometry, surface, [0, 0, index * 1.5]);
        // These overlapping, closely spaced printed layers cast the
        // landmark's silhouette but need no self-shadow projection on their
        // flat faces; grazing shadow-map samples would stripe the wordmark.
        object.receiveShadow = false;
      }
      extrusion.scale.set(0.086, -0.086, 0.086);
      extrusion.position.set(-7.03, 2.06, 0);
      logo.add(extrusion);
      fallback.visible = false;
    })
    .catch(() => {
      /* A readable local fallback remains if the bundled asset cannot load. */
    });
  register(bitkit, { kind: 'zone', id: 'bitkit' }, 'Visit the Bitkit Beacon');
  obstacle(bitkit.position.x, bitkit.position.z, 3.8);

  const pond = group('Department of Quack', ...WORLD_ANCHORS.duck);
  const duck = duckPond(pond, detail);
  label(pond, 'Department of Quack', [0, 6.4, 0], 10.5);
  register(pond, { kind: 'fun', id: 'duck' }, 'Consult the giant duck');

  const trampoline = group('Proof of Bounce', ...WORLD_ANCHORS.trampoline);
  trampolineFrame(trampoline, detail);
  label(trampoline, 'Proof of Bounce', [0, 4, 0], 9);
  register(trampoline, { kind: 'fun', id: 'trampoline' }, 'Bounce on the trampoline');

  const portals = WORLD_PORTALS.map((gateway, index) => {
    const portal = group(`Portal ${index + 1}: ${gateway.name}`, gateway.position[0], gateway.position[1]);
    portal.rotation.y = gateway.yaw;
    const animated = gatewayArchitecture(portal, gateway.color, detail);
    register(portal, { kind: 'portal', index }, `Walk through ${gateway.name}`);
    return animated;
  });
  detail.flush();

  return {
    animate(time, delta) {
      cap.position.y = 11.7 + Math.sin(time * 1.1) * 0.25;
      cap.rotation.y += delta * 0.18;
      duck.position.y = 1.1 + Math.sin(time * 1.4) * 0.13;
      duck.rotation.y = Math.sin(time * 0.35) * 0.15;
      logo.position.y = 7.3 + Math.sin(time * 0.8) * 0.16;
      portals.forEach(({ portalRing, veil }, index) => {
        portalRing.rotation.z += delta * (0.08 + index * 0.02);
        veil.scale.setScalar(1 + Math.sin(time * 1.8 + index * 2) * 0.045);
      });
    },
    dispose() {
      abort.abort();
    },
  };
}

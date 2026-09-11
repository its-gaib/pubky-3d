import * as THREE from 'three';
import { mesh } from '@/libs/world/world-geometry';
import { worldDetail } from '@/libs/world/world-surfaces';

function metal(color: string, roughness = 0.34) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.66 });
}

function connectingRod(from: THREE.Vector3, to: THREE.Vector3, radius: number) {
  const direction = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 12);
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
  );
  return geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
}

/** A kinetic orbital instrument on an engineered plinth. */
export function createGraphSculpture(scene: THREE.Scene, anchor: readonly [number, number]) {
  const group = new THREE.Group();
  group.name = 'Pubky graph observatory';
  group.position.set(anchor[0], 0, anchor[1]);
  scene.add(group);
  const detail = worldDetail(group, 'Graph plinth and satellite nodes');
  detail.add(new THREE.CylinderGeometry(3.24, 3.4, 0.22, 64), '#343A3E', 'stone', [0, 0.22, 0]);
  detail.add(new THREE.CylinderGeometry(2.86, 3.02, 0.46, 64), '#555D61', 'metal', [0, 0.53, 0]);
  detail.add(new THREE.CylinderGeometry(2.72, 2.87, 0.13, 64), '#242B2E', 'stone', [0, 0.82, 0]);
  detail.add(new THREE.TorusGeometry(2.93, 0.035, 8, 96).rotateX(Math.PI / 2), '#B3B89A', 'metal', [0, 0.61, 0]);
  for (let index = 0; index < 24; index++) {
    const angle = (index / 24) * Math.PI * 2;
    detail.add(
      new THREE.BoxGeometry(0.045, 0.12, index % 6 === 0 ? 0.25 : 0.13),
      index % 6 === 0 ? '#C4D97A' : '#808C8A',
      'metal',
      [Math.sin(angle) * 2.6, 0.87, Math.cos(angle) * 2.6],
      [0, angle, 0],
    );
  }
  for (let index = 0; index < 3; index++) {
    const angle = (index / 3) * Math.PI * 2;
    const root = new THREE.Vector3(Math.sin(angle) * 1.55, 0.84, Math.cos(angle) * 1.55);
    const top = new THREE.Vector3(Math.sin(angle) * 0.7, 2.55, Math.cos(angle) * 0.7);
    detail.add(connectingRod(root, top, 0.065), '#828E8A', 'metal');
    detail.add(new THREE.SphereGeometry(0.125, 12, 8), '#C6D0A3', 'metal', top.toArray());
  }
  const center = new THREE.Vector3(0, 4.6, 0);
  for (let index = 0; index < 6; index++) {
    const angle = (index / 6) * Math.PI * 2;
    const node = new THREE.Vector3(Math.cos(angle) * 2.7, 4.6 + Math.sin(angle * 2) * 1.2, Math.sin(angle) * 2.7);
    detail.add(connectingRod(center, node, 0.035), '#A6B4B4', 'metal');
    detail.add(new THREE.SphereGeometry(0.26, 20, 12), index % 2 ? '#A99CD1' : '#BBD977', 'metal', node.toArray());
    detail.add(new THREE.TorusGeometry(0.285, 0.028, 8, 28), '#D7E1CA', 'metal', node.toArray(), [
      Math.PI / 2,
      angle,
      0,
    ]);
  }
  detail.finish();
  const core = mesh(group, new THREE.IcosahedronGeometry(0.76, 3), metal('#DBE4DB', 0.25), [0, 4.6, 0]);
  core.name = 'Graph instrument core';
  const cageShape = new THREE.IcosahedronGeometry(0.91, 1);
  const cage = new THREE.LineSegments(
    new THREE.WireframeGeometry(cageShape),
    new THREE.LineBasicMaterial({ color: '#AFBFAB', transparent: true, opacity: 0.42 }),
  );
  cageShape.dispose();
  cage.position.copy(center);
  group.add(cage);

  const orbitMaterial = new THREE.MeshStandardMaterial({
    color: '#BBD951',
    metalness: 0.6,
    roughness: 0.3,
    emissive: '#536422',
    emissiveIntensity: 0.25,
  });
  const orbitA = mesh(group, new THREE.TorusGeometry(2.1, 0.065, 10, 112), orbitMaterial, [0, 4.6, 0]);
  orbitA.rotation.x = 0.8;
  const orbitB = mesh(group, new THREE.TorusGeometry(2.5, 0.048, 10, 128), metal('#AAB6C5'), [0, 4.6, 0]);
  orbitB.rotation.x = -0.8;
  return { group, orbitA, orbitB };
}

/** Twelve fabric gores, four suspension ropes and a woven wicker basket. */
export function createWorldBalloon(scene: THREE.Scene, anchor: readonly [number, number]) {
  const group = new THREE.Group();
  group.name = 'Graphite expedition balloon';
  group.position.set(anchor[0], 18, anchor[1]);
  scene.add(group);
  const profile = new THREE.SplineCurve([
    new THREE.Vector2(0.35, -0.5),
    new THREE.Vector2(0.95, 0.2),
    new THREE.Vector2(1.8, 1.25),
    new THREE.Vector2(2.8, 2.65),
    new THREE.Vector2(3.1, 4),
    new THREE.Vector2(2.75, 5.45),
    new THREE.Vector2(1.7, 6.55),
    new THREE.Vector2(0.7, 6.95),
    new THREE.Vector2(0, 7.05),
  ]).getPoints(48);
  const indexedEnvelope = new THREE.LatheGeometry(profile, 72);
  const envelope = indexedEnvelope.toNonIndexed();
  indexedEnvelope.dispose();
  const vertices = envelope.getAttribute('position');
  const colors = new Float32Array(vertices.count * 3);
  const tint = new THREE.Color();
  for (let index = 0; index < vertices.count; index++) {
    // Each six-column panel owns its edge colors; shared vertices produced
    // triangular color bleed along the stitching when viewed close up.
    const column = Math.floor(index / ((profile.length - 1) * 6));
    const gore = Math.floor(column / 6) % 12;
    tint.set(gore % 6 === 0 ? '#BBC55D' : gore % 2 ? '#5D6462' : '#303A3D');
    tint.toArray(colors, index * 3);
  }
  envelope.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const fabric = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.02 });
  mesh(group, envelope, fabric).name = 'Stitched balloon envelope';
  const detail = worldDetail(group, 'Balloon seams rigging and basket');
  for (let gore = 0; gore < 12; gore++) {
    const angle = (gore / 12) * Math.PI * 2;
    const seam = new THREE.CatmullRomCurve3(
      profile
        .slice(0, -1)
        .map(
          (point) =>
            new THREE.Vector3(Math.sin(angle) * (point.x + 0.014), point.y, Math.cos(angle) * (point.x + 0.014)),
        ),
    );
    detail.add(new THREE.TubeGeometry(seam, 40, 0.016, 5, false), '#858B79', 'wood');
  }
  detail.add(new THREE.CylinderGeometry(0.37, 0.4, 0.1, 32), '#414A46', 'metal', [0, -0.48, 0]);
  detail.add(new THREE.BoxGeometry(1.52, 0.12, 1.36), '#705840', 'wood', [0, -2.48, 0]);
  for (const side of [-1, 1]) {
    for (let row = 0; row < 8; row++) {
      const y = -2.37 + row * 0.115;
      const shade = row % 2 ? '#927654' : '#7D6347';
      detail.add(new THREE.BoxGeometry(1.48, 0.075, 0.07), shade, 'wood', [0, y, side * 0.65]);
      detail.add(new THREE.BoxGeometry(0.07, 0.075, 1.3), shade, 'wood', [side * 0.73, y, 0]);
    }
    for (let column = 0; column < 7; column++) {
      const position = -0.6 + column * 0.2;
      detail.add(new THREE.BoxGeometry(0.045, 0.88, 0.03), '#AC9068', 'wood', [position, -1.99, side * 0.69]);
      detail.add(new THREE.BoxGeometry(0.03, 0.88, 0.045), '#AC9068', 'wood', [side * 0.77, -1.99, position]);
    }
    detail.add(new THREE.BoxGeometry(1.62, 0.095, 0.13), '#AE926C', 'wood', [0, -1.49, side * 0.68]);
    detail.add(new THREE.BoxGeometry(0.13, 0.095, 1.38), '#AE926C', 'wood', [side * 0.74, -1.49, 0]);
    for (const other of [-1, 1]) {
      detail.add(
        connectingRod(
          new THREE.Vector3(side * 0.65, -1.5, other * 0.56),
          new THREE.Vector3(side * 0.8, 0.12, other * 0.69),
          0.025,
        ),
        '#B7BAA3',
        'wood',
      );
      detail.add(new THREE.CylinderGeometry(0.052, 0.052, 0.19, 8), '#8B9690', 'metal', [
        side * 0.65,
        -1.47,
        other * 0.56,
      ]);
    }
  }
  detail.add(new THREE.CylinderGeometry(0.18, 0.22, 0.32, 12), '#77817B', 'metal', [0, -1.12, 0]);
  detail.finish();
  const flame = mesh(
    group,
    new THREE.SphereGeometry(0.12, 12, 8).scale(1, 2.4, 1),
    new THREE.MeshBasicMaterial({ color: '#F4BC6B' }),
    [0, -0.81, 0],
  );
  flame.castShadow = false;
  return group;
}

/** A beveled brass key with a lime inlay; still a purely local collectible. */
export function createWorldKey() {
  const group = new THREE.Group();
  group.name = 'Collectible explorer key';
  const bow = new THREE.Shape();
  bow.absarc(0, 0.4, 0.44, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0.4, 0.28, 0, Math.PI * 2, true);
  bow.holes.push(hole);
  const shaft = new THREE.Shape();
  shaft.moveTo(-0.085, 0.09);
  shaft.lineTo(0.085, 0.09);
  shaft.lineTo(0.085, -0.4);
  shaft.lineTo(0.32, -0.4);
  shaft.lineTo(0.32, -0.54);
  shaft.lineTo(0.18, -0.54);
  shaft.lineTo(0.18, -0.63);
  shaft.lineTo(0.34, -0.63);
  shaft.lineTo(0.34, -0.77);
  shaft.lineTo(-0.085, -0.77);
  shaft.closePath();
  const detail = worldDetail(group, 'Beveled key and inlay');
  detail.add(
    new THREE.ExtrudeGeometry([bow, shaft], {
      depth: 0.095,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.018,
      bevelSegments: 2,
      curveSegments: 28,
    }),
    '#C1CC83',
    'metal',
  );
  detail.add(new THREE.TorusGeometry(0.362, 0.027, 6, 48), '#C8EF66', 'metal', [0, 0.4, 0.125]);
  detail.add(new THREE.BoxGeometry(0.026, 0.46, 0.009), '#8A9C4F', 'metal', [0, -0.22, 0.12]);
  detail.finish();
  return group;
}

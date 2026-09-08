import type * as THREE from 'three';
import { cylinder } from '@/libs/world/world-geometry';
import { SOCIAL_PLAZA_RADIUS } from '@/libs/world/world-social-layout';
import type { WorldZone } from '@/libs/world/world-types';

/** Chess supplies its own square foundation; a raised disk would cover its checker tiles. */
export function createZoneGround(parent: THREE.Object3D, zone: Pick<WorldZone, 'id' | 'position'>) {
  if (zone.id === 'chess') return null;
  const plaza = zone.id === 'plaza';
  const radius = plaza ? SOCIAL_PLAZA_RADIUS : 10;
  return cylinder(
    parent,
    radius,
    radius,
    0.16,
    plaza ? '#3B3B42' : '#2A2A30',
    [zone.position[0], 0.04, zone.position[1]],
    48,
  );
}

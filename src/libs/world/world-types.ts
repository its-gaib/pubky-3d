/** Serializable world state, independent of rendering or a future presence transport. */
export type WorldZoneId = 'plaza' | 'forest' | 'arena' | 'university' | 'github' | 'bitkit';

export interface WorldZone {
  id: WorldZoneId;
  name: string;
  subtitle: string;
  description: string;
  color: string;
  position: [number, number];
}

export interface WorldPost {
  id: string;
  author: string;
  text: string;
  tags: string[];
  url?: string;
}

export interface WorldTag {
  label: string;
  count: number;
  posts: WorldPost[];
}

export interface WorldPerson {
  id: string;
  name: string;
  color: string;
  bio: string;
  position: [number, number];
}

export interface WorldRelationship {
  from: string;
  to: string;
  label: string;
}

export interface WorldData {
  source: 'demo' | 'staging';
  tags: WorldTag[];
  people: WorldPerson[];
  relationships: WorldRelationship[];
}

export interface WorldArticle {
  title: string;
  description: string;
  url: string;
}

export type WorldInteraction =
  | { kind: 'zone'; id: WorldZoneId }
  | { kind: 'tag'; index: number }
  | { kind: 'post'; tagIndex: number; postIndex: number }
  | { kind: 'person'; id: string }
  | { kind: 'fun'; id: 'duck' | 'trampoline' | 'portal' };

export interface PersonaState {
  position: [number, number, number];
  rotation: number;
  animation: 'idle' | 'walk' | 'jump' | 'dance';
}

export interface WorldStatus {
  zone: WorldZoneId;
  position: [number, number];
  nearby: string | null;
  collected: number;
}

export interface WorldOptions {
  data: WorldData;
  onInteract: (interaction: WorldInteraction) => void;
  onStatus: (status: WorldStatus) => void;
  onReady: () => void;
  onExplore?: () => void;
}

export interface WorldController {
  dispose: () => void;
  travelTo: (zone: WorldZoneId) => void;
  setOverview: (overview: boolean) => void;
  setPaused: (paused: boolean) => void;
  setNight: (night: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
  setPersonaColor: (color: string) => void;
  setMove: (x: number, z: number) => void;
  jump: () => void;
  dance: () => void;
  interact: () => void;
  updateData: (data: WorldData) => void;
  getPersonaState: () => PersonaState;
}

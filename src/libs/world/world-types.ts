/** Serializable world state, independent of rendering or a future presence transport. */
export type WorldZoneId =
  | 'plaza'
  | 'forest'
  | 'arena'
  | 'university'
  | 'github'
  | 'bitkit'
  | 'theater'
  | 'cinema'
  | 'conferences'
  | 'chess';

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
  /** Canonical Pubky CDN URL, derived from the validated profile ID. */
  avatarUrl?: string;
  /** One is followed by the viewer; two is a quieter one-hop discovery. */
  degree?: 1 | 2;
  /** Known direct follows introducing this person; never invented relationships. */
  parentIds?: string[];
  profileLoaded?: boolean;
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
  source: 'demo' | 'production';
  tags: WorldTag[];
  /** Public Hot feed order (total engagement), with no date-window filter. */
  trendingPosts: WorldPost[];
  people: WorldPerson[];
  relationships: WorldRelationship[];
}

export interface WorldArticle {
  title: string;
  description: string;
  url: string;
}

export type WorldInteraction =
  | { kind: 'conference'; index: number }
  | { kind: 'portal'; index: number }
  | { kind: 'zone'; id: WorldZoneId }
  | { kind: 'tag'; index: number }
  | { kind: 'post'; tagIndex: number; postIndex: number }
  | { kind: 'person'; id: string }
  | { kind: 'social-cluster'; sector: number }
  | { kind: 'fun'; id: 'duck' | 'trampoline' | 'satoshi' | 'bank' | 'tether' | 'graph' | 'runner' };

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
  theaterIndex: number;
  theaterPaused: boolean;
}

export interface WorldOptions {
  data: WorldData;
  onInteract: (interaction: WorldInteraction) => void;
  onStatus: (status: WorldStatus) => void;
  onReady: () => void;
  onExplore?: () => void;
}

export interface WorldSocialView {
  sector: number | null;
  page: number;
}

export interface WorldController {
  dispose: () => void;
  travelTo: (zone: WorldZoneId, options?: { faceLandmark?: boolean }) => void;
  setSocialView: (view: WorldSocialView) => void;
  setSocialFocus: (personId: string | null) => void;
  travelToPerson: (personId: string) => void;
  setOverview: (overview: boolean) => void;
  setPaused: (paused: boolean) => void;
  setNight: (night: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
  setTheaterPaused: (paused: boolean) => void;
  setTheaterLoading: (loading: boolean) => void;
  stepTheater: (delta: number) => void;
  setPersonaColor: (color: string) => void;
  setMove: (x: number, z: number) => void;
  jump: () => void;
  dance: () => void;
  interact: () => void;
  capturePhoto: () => Promise<Blob | null>;
  updateData: (data: WorldData) => void;
  getPersonaState: () => PersonaState;
}

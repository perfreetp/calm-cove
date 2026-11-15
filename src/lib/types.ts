export type Vec = { x: number; y: number };

export type LayerId =
  | 'depth'
  | 'shore'
  | 'grid'
  | 'lanes'
  | 'buoys'
  | 'docks'
  | 'tracks'
  | 'labels';

export type LayerState = Record<LayerId, boolean>;

export type BuoyKind = 'gate' | 'lane' | 'turn';

export interface Buoy {
  id: string;
  lane: number;
  mark: number; // 0..8, 250 m spacing
  pos: Vec;
  kind: BuoyKind;
  label: string;
}

export interface Lane {
  no: number;
  centerY: number;
  top: number;
  bottom: number;
  startX: number;
  finishX: number;
}

export interface Dock {
  id: string;
  name: string;
  kind: 'pontoon' | 'boathouse' | 'pier' | 'dam';
  points: Vec[];
  labelAt: Vec;
}

export interface TrackPoint {
  x: number;
  y: number;
  t: number;
}

export interface TrackSplit {
  mark: number;
  distance: number;
  t: number;
}

export type FlagKind = 'deviation' | 'falseStart' | 'missedBuoy';

export interface Detection {
  kind: FlagKind;
  severity: 'warn' | 'serious';
  /** human readable explanation */
  detail: string;
  at?: Vec;
  atT?: number;
  value?: number;
  mark?: number;
}

export interface Run {
  id: string;
  sessionId: string;
  boatId: string;
  lane: number;
  startMark: number;
  endMark: number;
  gunAt: number; // epoch ms of the start signal
  durationSec: number;
  distanceM: number;
  splits: TrackSplit[];
  track: TrackPoint[];
  /** max perpendicular offset from lane centre, metres */
  maxDeviation: number;
  meanDeviation: number;
  /** seconds relative to the gun when the bow crossed the start line (negative = early) */
  startOffsetSec: number;
  detections: Detection[];
  snapshot: string;
  status: 'pending' | 'valid' | 'invalid';
  review: Review | null;
  uploadedAt: number;
}

export interface Review {
  by: string;
  at: number;
  verdict: 'valid' | 'invalid';
  reason: string;
  reasonCode: string;
}

export interface WindRange {
  fromDeg: number;
  toDeg: number;
  minMs: number;
  maxMs: number;
}

export type SessionStatus = 'draft' | 'published' | 'closed';

export interface Session {
  id: string;
  code: string;
  subject: string;
  focus: string;
  coachId: string;
  day: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationMin: number;
  lanes: number[];
  startMark: number;
  endMark: number;
  wind: WindRange;
  plannedBoats: number;
  assigned: string[];
  timeLimitMin: number;
  status: SessionStatus;
  version: number;
  note: string;
  createdAt: number;
  publishedAt: number | null;
}

export interface Boat {
  id: string;
  code: string;
  name: string;
  squad: SquadId;
  athletes: string[];
  color: string;
}

export type SquadId = 'M2x' | 'W2x' | 'M1x' | 'W1x' | 'LM2x';

export interface Squad {
  id: SquadId;
  name: string;
  short: string;
  color: string;
}

export interface Coach {
  id: string;
  name: string;
  role: string;
  initials: string;
}

export type RacePhase = 'heat' | 'final';

export interface RaceLane {
  lane: number;
  boatId: string | null;
}

export interface Race {
  id: string;
  name: string;
  phase: RacePhase;
  group: string;
  day: string;
  time: string;
  lanes: RaceLane[];
  status: 'draft' | 'published';
  version: number;
  updatedAt: number;
  updatedBy: string;
}

export type AuditKind =
  | 'session'
  | 'review'
  | 'race'
  | 'upload'
  | 'system';

export interface AuditEvent {
  id: string;
  at: number;
  actor: string;
  actorRole: 'coach' | 'system' | 'athlete';
  kind: AuditKind;
  action: string;
  target: string;
  detail: string;
}

export interface World {
  bounds: { w: number; h: number };
  shoreline: Vec[];
  islands: Vec[][];
  depthBands: { depth: number; points: Vec[]; color: string }[];
  lanes: Lane[];
  buoys: Buoy[];
  docks: Dock[];
  landmarks: { name: string; at: Vec; kind: string }[];
  contours: Vec[][];
  graticule: { step: number };
  startX: number;
  finishX: number;
  markStep: number;
  markCount: number;
}

export interface AppData {
  world: World;
  lanes: Lane[];
  boats: Boat[];
  squads: Squad[];
  coaches: Coach[];
  sessions: Session[];
  runs: Run[];
  races: Race[];
  audit: AuditEvent[];
  liveRunId: string;
}

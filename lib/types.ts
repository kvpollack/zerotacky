// Shared data model for ZeroTacky. Type-only file: no runtime code.
// Shapes are derived from how the original monolith reads and writes state.

export type ScoringType = 'reps' | 'max_weight' | 'time_or_distance' | 'time_or_implements';
export type RunOrderMethod = 'reverse_overall' | 'reverse_previous_event';
export type TiebreakerRule = 'event_wins' | 'final_event';
export type AthleteStatus = 'active' | 'withdrawn';
export type RoleLock = 'admin' | 'judge' | 'pitcrew' | 'spectator';
export type RisingBarStatus = 'pending' | 'good' | 'pass' | 'fail';
export type LoadingPoints = 0 | 1 | 2 | 4;
export type WeightEntryMode = 'total' | 'per_hand';

export interface Station {
  id: string;
  label: string;
}

export interface Meet {
  id: string;
  presetId?: string;
  name: string;
  date: string;
  runOrderMethod: RunOrderMethod;
  tiebreakerRule: TiebreakerRule;
  availablePlates: number[];
  collarWeightPerPair: number;
  adminPin?: string;
  isDemo?: boolean;
  stations?: Station[];
  slug?: string;
}

export interface Division {
  id: string;
  meetId: string;
  name: string;
  flight: string; // Station id (e.g. 'A' | 'B'); station filter also uses 'ALL'
  sortOrder: number;
}

export interface Athlete {
  id: string;
  divisionId: string;
  name: string;
  bodyweight?: number;
  lotNumber: number;
  status: AthleteStatus;
  rackHeights?: Record<string, string>; // keyed by event id
}

export interface PitCrewStat {
  label: string;
  value: string;
}

export interface PitCrewCalloutEntry {
  headline?: string;
  stats?: PitCrewStat[];
}

export interface PitCrewCallout {
  title: string;
  byDivision: Record<string, PitCrewCalloutEntry>;
}

export interface EventDef {
  id: string;
  meetId: string;
  eventNumber: number;
  name: string;
  scoringType: ScoringType;
  maxFormat?: 'rising_bar' | 'none';
  risingBarWeights?: number[];
  timeCapSeconds: number;
  lanes: number; // 1 or 2
  loadingPoints: LoadingPoints;
  weightEntryMode: WeightEntryMode;
  weightIsAddedPlatesOnly?: boolean;
  implementEmptyWeight: number;
  implementCount?: number;
  divisionWeights: Record<string, number>;
  hasTrumpWeight?: boolean;
  divisionLightWeights?: Record<string, number>;
  groundTouchWarning?: boolean;
  hasHeightCallout?: boolean;
  heightLabel?: string;
  divisionDefaultHeights?: Record<string, string>;
  pitCrewCallout?: PitCrewCallout;
  fixedImplementDescription?: string;
}

export interface Result {
  id: string; // `${eventId}_${athleteId}`
  eventId: string;
  athleteId: string;
  tier?: 'heavy' | 'light';
  reps?: number;
  timeSeconds?: number;
  distanceFeet?: number;
  implementsCompleted?: number;
  splitTimeSeconds?: number;
  maxWeightLbs?: number;
  risingBarAttempts?: Record<string, RisingBarStatus>; // keyed by weight
  didNotStart?: boolean;
  locked?: boolean;
  groundTouchWarned?: boolean;
  updatedAt: number;
}

export interface ScoredRow {
  athleteId: string;
  athleteName: string;
  place: number;
  points: number;
  displayScore: string;
  isZero: boolean;
  isTied: boolean;
}

export interface StandingRow {
  athleteId: string;
  athleteName: string;
  divisionId: string;
  status: AthleteStatus;
  totalPoints: number;
  eventWins: number;
  finalEventPoints: number;
  eventBreakdown: Record<string, { points: number; place: number; display: string }>;
  overallPlace: number;
}

export interface RunOrderItem {
  orderIndex: number;
  heatNumber: number;
  lane: number;
  athlete: Athlete;
  currentOverallPoints: number;
  previousEventDisplay?: string;
  heightCallout?: string;
}

export interface PlateStack {
  weight: number;
  count: number;
}

export interface PlateLoad {
  targetInputWeight: number;
  totalSystemWeight: number;
  implementTareWeight: number;
  collarWeightApplied: number;
  loadingPoints: number;
  callOutLabel: string;
  weightPerLoadingPoint: number;
  platesPerPoint: PlateStack[];
  remainderUnloadedTotal: number;
  warningMessage?: string;
}

export interface TransitionRow {
  label: string;
  from: string;
  to: string;
  delta: string;
  changed: boolean;
}

export interface ThemeDef {
  id: string;
  name: string;
  tagline: string;
  surface: string;
  primary: string;
  secondary: string;
}

export interface MeetPreset {
  id: string;
  label: string;
  sublabel: string;
}

export interface AppState {
  meet: Meet;
  divisions: Division[];
  athletes: Athlete[];
  events: EventDef[];
  results: Result[];
}
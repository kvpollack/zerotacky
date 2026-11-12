// Shared data model for ZeroTacky. Type-only file: no runtime code.
// Shapes are derived from how the original monolith reads and writes state.

// 'max_time' (11/11 scoring audit item 2): a hold, the longer time ranks first (Hercules hold, crucifix, hammer hold).
export type ScoringType = 'reps' | 'max_weight' | 'time_or_distance' | 'time_or_implements' | 'max_time';
// 11/11 audit item 1 (Wessels): on a max-weight tie the lift made on an earlier attempt wins. 'none' = ties split.
export type MaxTiebreak = 'none' | 'attempts';
// 'lot_order' (10/21): roster order for every event, never reshuffled; for promoters who publish the order ahead of time.
export type RunOrderMethod = 'reverse_overall' | 'reverse_previous_event' | 'lot_order';
// Overall podium tiebreak (11/10 scoring audit against Iron Podium). 'lookback' = Iron Podium's default: most event
// 1st places, then 2nds, then 3rds; still level = shared place. 'bodyweight' = lighter athlete at weigh-in wins.
// 'event_wins' / 'final_event' are ZeroTacky's older rules, kept as promoter options. 'none' = ties always share.
export type TiebreakerRule = 'lookback' | 'bodyweight' | 'event_wins' | 'final_event' | 'none';
export type AthleteStatus = 'active' | 'withdrawn';
export type RoleLock = 'admin' | 'judge' | 'pitcrew' | 'spectator';
export type RisingBarStatus = 'pending' | 'good' | 'pass' | 'fail';
export type LoadingPoints = 0 | 1 | 2 | 4;
export type WeightEntryMode = 'total' | 'per_hand';
// 054 (11/10): how the promoter organises divisions. 'weight_classes' = standard bodyweight classes in kg (the weigh-in
// desk uses Division.weightCapKg); 'custom' = strength groups, experience levels, anything else (the show page offers
// "Which group fits me?"). Absent = not chosen yet; the public pages fall back to guessing from the division names.
export type DivisionFormat = 'weight_classes' | 'custom';
// 059: the unit system a meet is run in. Every stored weight / distance number in the meet is in this unit (lb + ft, or
// kg + m); the result keys maxWeightLbs / distanceFeet keep their historical names and hold the meet's unit.
export type MeetUnits = 'imperial' | 'metric';

export interface Station {
  id: string;
  label: string;
  // Event ids in the order this station runs them (10/21). Absent = meet order (eventNumber). Every division on the
  // station follows it; the leaderboard keeps Ev 1, 2, 3 columns regardless. Kept valid by lib/engine/eventOrder.ts.
  eventOrder?: string[];
}

export interface Meet {
  id: string;
  presetId?: string;
  name: string;
  date: string;
  runOrderMethod: RunOrderMethod;
  tiebreakerRule: TiebreakerRule;
  availablePlates: number[];
  collarWeightPerPair: number;   // default for new events; each event carries its own (EventDef.collarWeightPerPair)
  adminPin?: string;
  isDemo?: boolean;
  stations?: Station[];
  slug?: string;
  divisionFormat?: DivisionFormat;
  units?: MeetUnits;   // 059: every weight / distance number in this meet is in this unit; absent = imperial (only 'metric' is ever stored on the object)
}

export interface Division {
  id: string;
  meetId: string;
  name: string;
  flight: string; // Station id (e.g. 'A' | 'B'); station filter also uses 'ALL'
  sortOrder: number;
  weightCapKg?: number | null;   // 045/054: bodyweight cap for a standard weight class (20..300 kg); null/absent = none
  teamSize?: number;             // 055: 2..6 = a team division (one roster row per team); absent/1 = individual
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

// Structured event spec (11/4, research brief build 3 "structured event specs", starter): what an athlete or coach
// needs to train for the event, beside the scoring config above. Every field optional; rides in events.config on the
// server like the other extras (no migration). Weights stay in divisionWeights (lb); the website shows kg beside them.
export type ImplementKind =
  | 'log' | 'axle' | 'barbell' | 'circus_dumbbell' | 'viking_press'
  | 'yoke' | 'farmers' | 'frame' | 'husafell' | 'sandbag' | 'keg'
  | 'atlas_stones' | 'natural_stone' | 'loading_medley' | 'car_deadlift'
  | 'truck_pull' | 'arm_over_arm' | 'tire' | 'power_stairs' | 'conans_wheel' | 'duck_walk' | 'other';
export type EquipmentRule = 'tacky' | 'straps' | 'belt' | 'sleeves' | 'wraps' | 'chalk' | 'suit';
export interface EventSpec {
  implement?: ImplementKind;
  implementNote?: string;      // "12 in log", "Rogue axle, 1.9 in" (80 chars)
  courseFeet?: number;         // carry / pull / medley distance in feet
  allowed?: EquipmentRule[];
  notAllowed?: EquipmentRule[];
  videoUrl?: string;           // http(s), 500 chars; a demo or rules video
  notes?: string;              // anything else an athlete should know (280 chars)
}

export interface EventDef {
  id: string;
  meetId: string;
  eventNumber: number;
  name: string;
  scoringType: ScoringType;
  maxFormat?: 'rising_bar' | 'none';
  risingBarWeights?: number[];
  // max_weight only: 'attempts' = Wessels rule, the athlete who made the tied weight on an earlier attempt places higher.
  maxTiebreak?: MaxTiebreak;
  // time_or_distance only: a max-distance event (sandbag toss, carry for distance). Furthest mark wins, there is no finish
  // time and the standings never print "(DNF)". The clock is ignored.
  distanceOnly?: boolean;
  // time_or_implements only: the word the standings and the pad use for one implement ("stones", "bags", "kegs");
  // absent = "impl". 1 to 12 characters, kept by lib/engine/eventKinds normalizeImplementLabel.
  implementLabel?: string;
  timeCapSeconds: number;
  lanes: number; // 1 or 2
  loadingPoints: LoadingPoints;
  weightEntryMode: WeightEntryMode;
  weightIsAddedPlatesOnly?: boolean;
  implementEmptyWeight: number;
  // Collar weight per pair for this event's 2- and 4-point loads (10/26, Kurt 10/21: collars differ per bar, not per
  // meet). Absent on events built before this shipped: the meet-level value is the fallback.
  collarWeightPerPair?: number;
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
  spec?: EventSpec;
  // 053 adopted archive show: the engine does not rescore this event; every result carries importedPoints /
  // importedDisplay as published by the source. importedUnit / importedType describe the raw mark.
  imported?: boolean;
  importedUnit?: string;
  importedType?: string;
}

export interface Result {
  id: string; // `${eventId}_${athleteId}`
  eventId: string;
  athleteId: string;
  tier?: 'heavy' | 'light';
  reps?: number;
  timeSeconds?: number;
  distanceFeet?: number;        // in the meet's distance unit (ft, or m on a metric meet, 059); the name is historical
  implementsCompleted?: number;
  splitTimeSeconds?: number;
  maxWeightLbs?: number;        // in the meet's weight unit (lb, or kg on a metric meet, 059); the name is historical
  // Attempt number (1-based) on which the best good lift was made, typed by the judge when the tape does not have it.
  // Read only when the event's maxTiebreak is 'attempts'; lib/engine/scoring bestLiftAttempt derives it from attemptLog
  // or risingBarAttempts when this is absent.
  maxWeightAttempt?: number;
  risingBarAttempts?: Record<string, RisingBarStatus>; // keyed by weight
  didNotStart?: boolean;
  locked?: boolean;
  groundTouchWarned?: boolean;
  // Phase 4 (11/2): the judge pad's tape, one entry per GOOD / NO LIFT press. Rides in the sync payload; the engine
  // never reads it (components/judge/padModel.ts recomputes the scored fields from it).
  attemptLog?: { kind: 'good' | 'no'; at: number; split?: number; weight?: number }[];
  // 053: published event points and the raw mark as text ("18 reps", "42.3 sec") on an adopted archive show.
  importedPoints?: number;
  importedDisplay?: string;
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
  // Event 1st / 2nd / 3rd place counts (zero-score rows never count), read by the 'lookback' tiebreak.
  placeCounts: [number, number, number];
  bodyweight?: number;
  eventBreakdown: Record<string, { points: number; place: number; display: string }>;
  overallPlace: number;
  isTiedOverall?: boolean; // level after the tiebreak rule: shares overallPlace with the row(s) beside it
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
  light?: boolean;   // light-background theme; the Day/Night toggle swaps between the last light and last dark pick
}

export interface MeetPreset {
  id: string;
  label: string;
  sublabel: string;
  showSlug?: string; // set when the preset is also a public demo show at /shows/<slug>
}

export interface AppState {
  meet: Meet;
  divisions: Division[];
  athletes: Athlete[];
  events: EventDef[];
  results: Result[];
}
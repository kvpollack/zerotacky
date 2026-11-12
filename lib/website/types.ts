// Website-specific types and documented model extensions.
// Does not modify lib/types.ts; reuses Meet, Division, EventDef, Athlete, Result, ScoredRow, StandingRow.

import type { AppState, Athlete, Division, EventDef, Meet, Result, ScoredRow } from '../types';
import type { ZtTheme } from './theme';
import type { MeetSchedule } from './schedule';
import type { MeetSponsor } from './extras';

export type ShowCompetitionStatus =
  | 'upcoming'
  | 'live'
  | 'completed'
  | 'postponed'
  | 'cancelled';

export type ShowRegistrationStatus =
  | 'open'
  | 'closed'
  | 'waitlist'
  | 'day_of_only'
  | 'not_applicable'
  | 'not_provided';

export type ResultsFinalizationStatus =
  | 'not_started'
  | 'in_progress'
  | 'provisional'
  | 'final';

export type DivisionGroupingStyle =
  | 'inclusive_strength_groups'
  | 'traditional_weight_classes'
  | 'mixed';

// 054: the promoter's own answer; undefined = not chosen (grouping style is then inferred from the division names)
import type { DivisionFormat } from '../types';
export type { DivisionFormat };

export interface ShowVenue {
  facilityName?: string;
  streetAddress?: string;
  city: string;
  state: string;
  postalCode?: string;
  country: string;
}

export interface ShowRegistrationInfo {
  status: ShowRegistrationStatus;
  entryFeeDisplay?: string;
  registrationDeadline?: string;
  externalRegistrationUrl?: string;
  weighInNotes?: string;
  promoterContact?: string;
  athleteCap?: number;
}

// Explicit placement row used when official finalized standings include unresolved ties
// (upstream calculateDivisionStandings currently assigns sequential places 1..N on unbroken ties).
export interface SuppliedStandingRow {
  athleteId: string;
  athleteName: string;
  divisionId: string;
  status: 'active' | 'withdrawn';
  overallPlace: number;
  isTiedOverall?: boolean;
  totalPoints: number;
  eventWins: number;
  finalEventPoints: number;
  eventBreakdown: Record<string, { points: number; place: number; display: string; isTied?: boolean }>;
}

export interface DivisionResultsView {
  division: Division;
  athletes: Athlete[];
  standings: SuppliedStandingRow[];
  eventScoreboards: Record<string, ScoredRow[]>;
  isOfficialFinal: boolean;
  hasUnresolvedOverallTie: boolean;
}

export interface PublicShowSummary {
  id: string; // UUID in production; fixture id in demo mode
  slug: string;
  name: string;
  date: string; // YYYY-MM-DD
  venue: ShowVenue;
  federation?: string; // Optional: e.g. 'Unsanctioned', 'Strongman Corporation', 'USS'
  divisionGroupingStyle: DivisionGroupingStyle;
  divisionFormat?: DivisionFormat;   // 054: set by the promoter; drives whether "Which group fits me?" appears
  divisionLabels: string[];
  implementTags: string[];
  competitionStatus: ShowCompetitionStatus;
  registrationStatus: ShowRegistrationStatus;
  resultsStatus: ResultsFinalizationStatus;
  isDemoFixture: boolean;
  liveScoreboardPath?: string; // e.g. `/m/${slug}` when published
  lastUpdatedIso?: string;
  summaryNote?: string;
  hostGymSlug?: string; // 026: directory gym hosting the show; the gym page lists shows by this
  hostGymName?: string;
  theme?: ZtTheme;      // 030: the show's own colours; the show page and the board paint themselves in these
  // 038 external listing (feature 2 MVP): a show registered elsewhere. No show page; the row links out to externalUrl.
  externalUrl?: string;
  externalHost?: string;
  isPublicListed?: boolean;      // 037: false on a show page reached only through the retention rule below
  resultsSubmittedAt?: string;   // 037: ISO; results sent to the federation. The show page stays up when unlisted.
  schedule?: MeetSchedule;       // 044: meet-day timeline; the show page prints it and /shows/<slug>/calendar.ics is built from it
  sponsors?: MeetSponsor[];      // 046 (#14): sponsor strip on the show page and the boards
  livestreamUrl?: string;        // 046 (#17): Watch live link on the show page and the phone board
  importedFrom?: { sourceName: string; credit: string; archiveSlug: string };  // 053: adopted archive show; disclaimer on every surface
}

export interface PublicShowRecord extends PublicShowSummary {
  promoterName?: string;
  scheduleNotes?: string;
  rulesSummary?: string;
  statusBannerNote?: string;
  registration: ShowRegistrationInfo;
  state: AppState; // Uses existing Meet, Division, EventDef, Athlete, Result shapes
  // Explicitly supplied official/provisional placements keyed by divisionId when needed
  suppliedDivisionPlacements?: Record<
    string,
    Array<{ athleteId: string; overallPlace: number; isTiedOverall?: boolean }>
  >;
}

export interface GymEquipmentItem {
  name: string;
  category: string; // e.g. 'Log', 'Axle', 'Yoke', 'Stones', 'Dumbbell', 'Farmers', 'Sandbags', 'Loading'
  details?: string; // e.g. '10" & 12" steel logs', '140–360 lb series'
}

// 058: intro strongman sessions for newcomers.
export type IntroSessions = 'yes' | 'on_request' | 'no' | 'not_provided';

export type DayPassAvailability = 'available' | 'by_appointment' | 'not_available' | 'not_provided';

export interface StrongmanGymListing {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  streetAddress?: string;
  postalCode?: string;
  websiteUrl?: string;
  contactInfo?: string;
  dayPassAvailability: DayPassAvailability;
  // 058 (11/11): does the gym run intro strongman sessions for people new to the sport? Absent = not provided.
  introSessions?: IntroSessions;
  introSessionsNote?: string;
  introSessionsUrl?: string;
  dayPassPriceDisplay?: string;
  dayPassBookingUrl?: string;
  dropInPolicy?: string;
  dropInHours?: string;
  implementTags: string[];
  equipment: GymEquipmentItem[];
  lat?: number; // WGS84; set at save from the address (Census geocoder), zip centroid as fallback
  lng?: number;
  hostedShowSlugs: string[];
  lastUpdatedDate: string; // YYYY-MM-DD
  isDemoListing: boolean;
  // 015 gyms table (10/20): listings collected from the gym's own site start unclaimed; the owner claims later.
  gymType?: 'strongman' | 'powerlifting' | 'mixed';
  claimStatus?: 'unclaimed' | 'claimed';
  sourceUrl?: string;
  confidence?: 'high' | 'medium' | 'low';
  theme?: ZtTheme;      // 030: the gym's own colours (owner-set); the gym page paints itself in these
}

export type CapabilityArea = 'athlete' | 'promoter' | 'gym_owner';

export interface DemoAthleteRegistration {
  entryId: string;
  showSlug: string;
  showName: string;
  showDate: string;
  divisionName: string;
  competitionStatus: ShowCompetitionStatus;
  registrationStatus: 'confirmed' | 'waitlisted';
  equipmentSetupNotes: Array<{
    showEventLabel: string;
    implementContext: string;
    settingValue: string;
  }>;
}

export interface DemoAthleteHistoryEntry {
  entryId: string;
  showSlug: string;
  showName: string;
  showDate: string;
  divisionName: string;
  resultsStatus: ResultsFinalizationStatus;
  overallPlaceDisplay: string;
  totalPoints: number;
}

export interface DemoPromoterShowItem {
  meetId: string;
  slug: string;
  name: string;
  date: string;
  competitionStatus: ShowCompetitionStatus;
  registrationStatus: ShowRegistrationStatus;
  resultsStatus: ResultsFinalizationStatus;
  divisionsCount: number;
  athletesCount: number;
  isPublishedToScoreboard: boolean;
}

export interface DemoPersonaProfile {
  id: string;
  label: string;
  tagline: string;
  capabilities: CapabilityArea[];
  athleteData?: {
    registrations: DemoAthleteRegistration[];
    competitionHistory: DemoAthleteHistoryEntry[];
  };
  promoterData?: {
    managedShows: DemoPromoterShowItem[];
  };
  gymOwnerData?: {
    managedGymSlugs: string[];
  };
}

export interface ShowFilterQuery {
  search?: string;
  competitionStatus?: ShowCompetitionStatus | 'ALL';
  state?: string | 'ALL';
  implementTag?: string | 'ALL';
  federation?: string | 'ALL';
  divisionQuery?: string;
}

export interface GymFilterQuery {
  search?: string;
  state?: string | 'ALL';
  implementTag?: string | 'ALL';
  dayPassOnly?: boolean;
  introOnly?: boolean;   // 058: keep gyms whose introSessions is 'yes' or 'on_request'
  // Zip + radius (Kurt 10/20): when origin is set, gyms without coordinates drop out and results sort by distance.
  origin?: { lat: number; lng: number } | null;
  radiusMiles?: number;
}
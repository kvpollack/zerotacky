// Website-specific types and documented model extensions.
// Does not modify lib/types.ts; reuses Meet, Division, EventDef, Athlete, Result, ScoredRow, StandingRow.

import type { AppState, Athlete, Division, EventDef, Meet, Result, ScoredRow } from '../types';

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
  divisionLabels: string[];
  implementTags: string[];
  competitionStatus: ShowCompetitionStatus;
  registrationStatus: ShowRegistrationStatus;
  resultsStatus: ResultsFinalizationStatus;
  isDemoFixture: boolean;
  liveScoreboardPath?: string; // e.g. `/m/${slug}` when published
  lastUpdatedIso?: string;
  summaryNote?: string;
}

export interface PublicShowRecord extends PublicShowSummary {
  promoterName?: string;
  hostGymSlug?: string;
  hostGymName?: string;
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

export type DayPassAvailability = 'available' | 'by_appointment' | 'not_available' | 'not_provided';

export interface StrongmanGymListing {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  streetAddress?: string;
  websiteUrl?: string;
  contactInfo?: string;
  dayPassAvailability: DayPassAvailability;
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
  // Zip + radius (Kurt 10/20): when origin is set, gyms without coordinates drop out and results sort by distance.
  origin?: { lat: number; lng: number } | null;
  radiusMiles?: number;
}
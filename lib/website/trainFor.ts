// "Train for this show" (build 4, 11/5). A show's events carry a structured spec (lib/events/spec.ts); each implement
// maps to the gym-directory equipment ids a gym can tag itself with. These helpers join the two so /gyms?show=<slug>
// can rank gyms by how much of the show's kit they have. Pure, no I/O; tests in test/trainFor.test.mjs.
import { IMPLEMENTS } from '@/lib/events/spec';
import { GYM_EQUIPMENT } from '@/lib/website/gymEquipment';
import type { EventDef } from '@/lib/types';
import type { StrongmanGymListing } from '@/lib/website/types';

/** One thing an athlete needs to find in a gym: the equipment id, its label, and the events that call for it. */
export interface TrainingNeed {
  equipment: string;        // GYM_EQUIPMENT id, e.g. 'yoke'
  label: string;            // "Yoke"
  events: string[];         // event names that use it, in show order
}

export interface GymCoverage {
  have: TrainingNeed[];
  missing: TrainingNeed[];
  /** 0..1, share of the show's needs the gym covers; 1 when there is nothing to need. */
  share: number;
}

const EQUIPMENT_LABEL: Record<string, string> = Object.fromEntries(GYM_EQUIPMENT.map((e) => [e.id, e.label]));

/** Distinct equipment a show's events need, in event order. Implements with no gym mapping (barbell, duck walk,
 *  "other") and events without a spec contribute nothing: a plain barbell is in every gym, and we do not guess. */
export function showTrainingNeeds(events: ReadonlyArray<Pick<EventDef, 'name' | 'spec'>>): TrainingNeed[] {
  const out = new Map<string, TrainingNeed>();
  for (const ev of events) {
    const kind = ev.spec?.implement;
    if (!kind) continue;
    const imp = IMPLEMENTS.find((i) => i.id === kind);
    if (!imp) continue;
    for (const eq of imp.gymEquipment) {
      const cur = out.get(eq);
      if (cur) { if (!cur.events.includes(ev.name)) cur.events.push(ev.name); continue; }
      out.set(eq, { equipment: eq, label: EQUIPMENT_LABEL[eq] ?? imp.label, events: [ev.name] });
    }
  }
  return [...out.values()];
}

/** What one gym has and lacks against a need list. Tag matching is case-insensitive, like the directory filter. */
export function gymCoverage(gym: Pick<StrongmanGymListing, 'implementTags'>, needs: ReadonlyArray<TrainingNeed>): GymCoverage {
  const tags = new Set(gym.implementTags.map((t) => t.toLowerCase()));
  const have: TrainingNeed[] = [], missing: TrainingNeed[] = [];
  for (const n of needs) (tags.has(n.equipment) ? have : missing).push(n);
  return { have, missing, share: needs.length === 0 ? 1 : have.length / needs.length };
}

export interface RankedGym<G> { gym: G; coverage: GymCoverage }

/** Gyms that have at least one of the show's implements, best coverage first. `tieBreak` orders gyms with the same
 *  coverage (the caller passes distance when a zip is set, otherwise name). With `fullOnly` only complete kits stay. */
export function rankGymsForShow<G extends Pick<StrongmanGymListing, 'implementTags' | 'name'>>(
  gyms: ReadonlyArray<G>,
  needs: ReadonlyArray<TrainingNeed>,
  opts: { fullOnly?: boolean; tieBreak?: (a: G, b: G) => number } = {},
): RankedGym<G>[] {
  if (needs.length === 0) return gyms.map((gym) => ({ gym, coverage: gymCoverage(gym, needs) }));
  const tie = opts.tieBreak ?? ((a: G, b: G) => a.name.localeCompare(b.name));
  return gyms
    .map((gym) => ({ gym, coverage: gymCoverage(gym, needs) }))
    .filter((r) => (opts.fullOnly ? r.coverage.missing.length === 0 : r.coverage.have.length > 0))
    .sort((a, b) => b.coverage.have.length - a.coverage.have.length || tie(a.gym, b.gym));
}

/** "4 of 5 implements" / "Everything the show uses" / "Yoke only", for a gym row. */
export function coverageLabel(c: GymCoverage, total: number): string {
  if (total === 0) return 'No implement list for this show yet';
  if (c.missing.length === 0) return total === 1 ? `Has the ${c.have[0].label.toLowerCase()}` : 'Everything the show uses';
  if (c.have.length === 1 && total > 2) return `${c.have[0].label} only`;
  return `${c.have.length} of ${total} implements`;
}

/** Only a listed show may drive the directory (Astra BR-01, 11/5). `getPublicShowBySlug` also resolves an unlisted meet
 *  whose results were sent to the federation (037: the results link must stay up), but that exception is for the show page;
 *  it must not put the meet's name and events on /gyms. Demo fixtures carry no flag and stay eligible. */
export function trainForEligible(show: { isPublicListed?: boolean }): boolean {
  return show.isPublicListed !== false;
}

/** The /gyms link a show page offers, state pre-set so the first results are local. Null when the show has no mapped
 *  implements (nothing to filter on) or the show is not listed. */
export function trainForShowHref(show: { slug: string; venue: { state?: string }; isPublicListed?: boolean }, needs: ReadonlyArray<TrainingNeed>): string | null {
  if (needs.length === 0 || !trainForEligible(show)) return null;
  const q = new URLSearchParams({ show: show.slug });
  if (show.venue.state) q.set('state', show.venue.state);
  return `/gyms?${q.toString()}`;
}

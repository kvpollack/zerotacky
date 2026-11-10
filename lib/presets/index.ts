import type { AppState, MeetPreset } from '../types';
import { DEMO_SHOW_RECORDS } from '../website/fixtures';
import { getYorkSeedState } from './york';

// Fresh devices open on a fictional demo show (Kurt 10/19). The real-roster preset was removed 11/10: the real meet lives
// on the site as a published show, and demo data is fictional only.
export const DEFAULT_PRESET_ID = 'demo-show-strongfest-2026';

// Builder preset: a hand-built traditional weight-class meet (fictional roster). Stays out of the website demo chooser.
const BUILDER_PRESETS: MeetPreset[] = [
  { id: 'york-iron-2026', label: 'York Iron Classic 2026', sublabel: 'York, PA' },
];

// Website demo shows that double as scorer presets (Kurt 10/19). Four of the five /shows fixtures; the postponed one
// has nothing to score. The preset id is the fixture record id, the show page is /shows/<slug>, and the blurb says what
// a person will see when it opens.
export const DEMO_SHOW_PRESET_BLURBS: Record<string, string> = {
  'demo-show-strongfest-2026':
    'An upcoming show in the inclusive strength-group format. Nothing is scored yet, so this is the one to judge and watch the standings build.',
  'demo-show-keystone-live-2026':
    'A show in progress. Some events are scored, the rest are open, so you can pick up mid-day the way a judge would.',
  'demo-show-iron-valley-summer-2026':
    'A finished show with final results, including a tie for first overall and a division with only two finishers.',
  'demo-show-chesapeake-provisional-2026':
    'A finished show whose results are still provisional, so the standings show but no podium is certified yet.',
};

export const DEMO_SHOW_PRESETS: MeetPreset[] = DEMO_SHOW_RECORDS.filter((r) => r.id in DEMO_SHOW_PRESET_BLURBS).map(
  (r) => ({
    id: r.id,
    label: r.name,
    sublabel: `${r.venue.city}, ${r.venue.state}`,
    showSlug: r.slug,
  }),
);

export const MEET_PRESETS: MeetPreset[] = [...BUILDER_PRESETS, ...DEMO_SHOW_PRESETS];

export function isMeetPresetId(id: unknown): id is string {
  return typeof id === 'string' && MEET_PRESETS.some((p) => p.id === id);
}

function getDemoShowSeedState(presetId: string): AppState | null {
  const record = DEMO_SHOW_RECORDS.find((r) => r.id === presetId);
  if (!record) return null;
  const copy = JSON.parse(JSON.stringify(record.state)) as AppState;
  copy.meet = { ...copy.meet, presetId, isDemo: true };
  return copy;
}

export function getInitialSeedState(presetId: string = DEFAULT_PRESET_ID): AppState {
  if (presetId === 'york-iron-2026') return getYorkSeedState();
  return getDemoShowSeedState(presetId) ?? (getDemoShowSeedState(DEFAULT_PRESET_ID) as AppState);
}

export { getYorkSeedState };

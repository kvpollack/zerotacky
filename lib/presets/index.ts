import type { AppState, MeetPreset } from '../types';
import { getStrongfestSeedState } from './strongfest';
import { getYorkSeedState } from './york';

export const DEFAULT_PRESET_ID = 'strongfest-2026';

export const MEET_PRESETS: MeetPreset[] = [
  { id: 'strongfest-2026', label: 'All Out Strongfest 2026', sublabel: 'The Power Plant Gym' },
  { id: 'york-iron-2026', label: 'York Iron Classic 2026', sublabel: 'York, PA' },
];

export function getInitialSeedState(presetId: string = DEFAULT_PRESET_ID): AppState {
  return presetId === 'york-iron-2026' ? getYorkSeedState() : getStrongfestSeedState();
}

export { getStrongfestSeedState, getYorkSeedState };

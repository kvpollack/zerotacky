// The account page's "about you" draft (Kurt 10/20) and how it follows the saved profile. Pure functions so the
// reconcile rule can be unit tested: AccountClient keeps the React state, this file decides what each member does
// when a fresh profile arrives from the server (own save, another tab's save, a username or visibility RPC).
import { MAX_PRS, cleanProfilePatch, type Profile, type ProfilePR, type ProfileSocials } from './profile';

export interface AboutDraft {
  favorite_lift: string;
  favorite_lift_note: string;
  location: string;
  home_gym_name: string;
  home_gym_id: string | null;
  prs: ProfilePR[];
  is_trainer: boolean;
  trainer_in_person: boolean;
  trainer_online: boolean;
  socials: ProfileSocials;
}

const EMPTY_PR: ProfilePR = { lift: '', value: '' };

export function padPRs(prs: ProfilePR[]): ProfilePR[] {
  const out = prs.slice(0, MAX_PRS).map((pr) => ({ ...pr }));
  while (out.length < MAX_PRS) out.push({ ...EMPTY_PR });
  return out;
}

export function aboutFromProfile(p: Profile): AboutDraft {
  return {
    favorite_lift: p.favorite_lift,
    favorite_lift_note: p.favorite_lift_note,
    location: p.location,
    home_gym_name: p.home_gym_name,
    home_gym_id: p.home_gym_id,
    prs: padPRs(p.prs),
    is_trainer: p.is_trainer,
    trainer_in_person: p.trainer_in_person,
    trainer_online: p.trainer_online,
    socials: { ...p.socials },
  };
}

// Compare what the database would hold after a save, so trailing spaces or an empty PR row do not count as changes.
export function aboutKey(a: AboutDraft): string {
  return JSON.stringify(cleanProfilePatch({ ...a }));
}

type ScalarKey = 'favorite_lift' | 'favorite_lift_note' | 'location' | 'home_gym_name' | 'home_gym_id' | 'is_trainer' | 'trainer_in_person' | 'trainer_online';
const SCALARS: ScalarKey[] = ['favorite_lift', 'favorite_lift_note', 'location', 'home_gym_name', 'home_gym_id', 'is_trainer', 'trainer_in_person', 'trainer_online'];

function samePR(a: ProfilePR | undefined, b: ProfilePR | undefined): boolean {
  return (a?.lift ?? '') === (b?.lift ?? '') && (a?.value ?? '') === (b?.value ?? '');
}

// A member of the draft follows the server only when its own stored value changed between the previous and the
// next profile (Astra AD-M1, retest 2026-10-21). Granularity: each scalar field, each PR row, each social link.
// A member the server did not touch keeps whatever the person typed, saved or not. `cur` null (no draft yet)
// starts from the next profile.
export function reconcileAbout(cur: AboutDraft | null, prev: Profile, next: Profile): AboutDraft {
  const a = aboutFromProfile(prev);
  const b = aboutFromProfile(next);
  if (!cur) return b;
  const out: AboutDraft = { ...cur, prs: cur.prs.map((pr) => ({ ...pr })), socials: { ...cur.socials } };
  for (const k of SCALARS) {
    if (a[k] !== b[k]) (out as unknown as Record<ScalarKey, string | boolean | null>)[k] = b[k];
  }
  out.prs = padPRs(out.prs).map((pr, i) => (samePR(a.prs[i], b.prs[i]) ? pr : { ...b.prs[i] }));
  const socialKeys = new Set<string>([...Object.keys(a.socials), ...Object.keys(b.socials), ...Object.keys(cur.socials)]);
  for (const key of socialKeys) {
    const k = key as keyof ProfileSocials;
    if ((a.socials[k] ?? '') !== (b.socials[k] ?? '')) out.socials[k] = b.socials[k] ?? '';
  }
  return out;
}

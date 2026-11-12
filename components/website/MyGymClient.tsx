'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { GYM_EQUIPMENT } from '@/lib/website/gymEquipment';
import PaintPicker from './PaintPicker';
import { Cap, Key, KeyButton, keyClass, textLink } from './sheet';
import {
  DAY_PASS_OPTIONS, GYM_LIMITS, GYM_SOCIAL_KEYS, GYM_TYPES, INTRO_SESSIONS_OPTIONS, cleanGymPatch, fetchMyClaims, fetchMyGyms, patchFromRow, patchKey,
  geocodeAddress, saveMyGym, addressChanged, type GymPatch, type PinChange, type MyClaimRow, type MyGymRow,
} from '@/lib/website/myGym';

// My Gym (016, 10/20): the owner of a claimed listing edits it here. One card per gym (most owners have one), pending
// claims listed above so someone who just claimed knows where they stand. Saves go straight to `gyms`; the public pages
// pick them up within five minutes (ISR), which the save notice says.
// Hand redraw in the sheet grammar (11/5, sweep item 5): the editor is one ruled block, each fieldset a cell with a
// cap legend; equipment as ruled tiles (pen rule when ticked); pen key to save, line keys for the rest.
const inputCls = 'zt-input';
const labelCls = 'block text-xs tracking-[0.06em] uppercase text-ink-muted mb-1.5';
const primaryBtn = keyClass('pen');
const quietBtn = keyClass('line');
const CELL = 'flex flex-col gap-3 px-5 py-4 sm:px-6';
// a floated legend is not a "rendered legend", so it lays out as a normal block inside the cell
const LEGEND = 'float-left w-full text-[15px] font-bold text-ink';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const PENDING = 'inline-flex items-center border-2 border-dashed border-rule px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-ink-muted whitespace-nowrap';

const STRONGMAN_IDS = GYM_EQUIPMENT.filter((e) => !['comp_bars', 'calibrated_plates', 'monolift', 'combo_rack', 'deadlift_platform'].includes(e.id));
const POWERLIFTING_IDS = GYM_EQUIPMENT.filter((e) => ['comp_bars', 'calibrated_plates', 'monolift', 'combo_rack', 'deadlift_platform'].includes(e.id));

function Notice({ text, tone }: { text: string; tone: 'ok' | 'warn' }) {
  return (
    <div role="status" className={`text-[13px] font-bold border-2 px-3 py-2 ${tone === 'warn' ? 'border-redpen text-redpen' : 'border-rule text-ink'}`}>
      {text}
    </div>
  );
}

function errText(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
}

function GymEditor({ row, onSaved }: { row: MyGymRow; onSaved: (r: MyGymRow) => void }) {
  const [draft, setDraft] = useState<GymPatch>(() => patchFromRow(row));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  useEffect(() => { setDraft(patchFromRow(row)); }, [row]);
  const dirty = patchKey(draft) !== patchKey(patchFromRow(row));
  const patch = (p: Partial<GymPatch>) => setDraft((d) => ({ ...d, ...p }));
  const toggleEquipment = (id: string, on: boolean) => setDraft((d) => ({
    ...d,
    equipment: on ? Array.from(new Set([...d.equipment, id])) : d.equipment.filter((x) => x !== id),
  }));
  const setNote = (id: string, v: string) => setDraft((d) => ({ ...d, equipment_notes: { ...d.equipment_notes, [id]: v } }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const c = cleanGymPatch(draft);
    if (!c.patch) { setNotice({ text: c.problem, tone: 'warn' }); return; }
    const sb = getSupabase();
    if (!sb) { setNotice({ text: 'Accounts are not configured on this build.', tone: 'warn' }); return; }
    setBusy(true);
    try {
      // Re-pin when any address part changed or the listing never had a pin: street-level via the Census geocoder,
      // zip centroid as the fallback (geocodeAddress does both). A changed address that resolves to nothing clears
      // the old pin rather than leaving the gym on its previous city's map spot (Astra G-M5).
      const moved = addressChanged(c.patch, row);
      let pin: PinChange = null;
      let pinNote = '';
      if (moved || row.lat == null) {
        const found = await geocodeAddress(c.patch);
        if (found) pin = found;
        else if (moved) { pin = 'clear'; pinNote = ' We could not place the new address on the map, so it will not show in distance searches until the address or zip is corrected.'; }
        else pinNote = ' We could not place the address on the map; check the street and zip.';
      }
      const saved = await saveMyGym(sb, row.id, c.patch, pin);
      onSaved(saved);
      const base = row.status === 'pending' ? 'Saved. Your listing is still waiting for review.' : 'Saved. The public listing updates within about five minutes.';
      setNotice({ text: base + pinNote, tone: pinNote ? 'warn' : 'ok' });
    } catch (err) {
      setNotice({ text: errText(err), tone: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  const equipmentGroup = (title: string, items: ReadonlyArray<{ id: string; label: string }>) => (
    <div className="flex flex-col gap-2">
      <Cap as="span">{title}</Cap>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((it) => {
          const on = draft.equipment.includes(it.id);
          return (
            <div key={it.id} className={`border-2 px-3 py-2.5 ${on ? 'border-pen' : 'border-rule'}`}>
              <label className={`flex items-center gap-2.5 text-[15px] font-bold cursor-pointer ${on ? 'text-pen' : 'text-ink'}`}>
                <input type="checkbox" checked={on} onChange={(e) => toggleEquipment(it.id, e.target.checked)} className="w-5 h-5 shrink-0" style={{ accentColor: 'var(--pen)' }} />
                {it.label}
              </label>
              {on && (
                <input
                  aria-label={`${it.label} details`}
                  value={draft.equipment_notes[it.id] ?? ''}
                  onChange={(e) => setNote(it.id, e.target.value)}
                  maxLength={GYM_LIMITS.equipment_note}
                  placeholder="Weights, count, anything useful"
                  className="zt-input mt-2 !min-h-10 !py-1.5 text-[13px]"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <form onSubmit={submit} aria-labelledby={`gym-${row.id}`} className="zt-block grid-cols-1">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-1 min-w-0">
          <h2 id={`gym-${row.id}`} className="text-[22px] font-bold leading-tight text-ink flex flex-wrap items-center gap-2.5">
            {row.name}
            {row.status === 'pending' && <span className={PENDING}>Awaiting review</span>}
          </h2>
          <p className={NOTE}>
            {row.status === 'pending'
              ? 'You added this listing. We check new gyms by hand before they show in the directory; you can keep editing meanwhile.'
              : 'Claimed listing. What you save here is what athletes see.'}
          </p>
        </div>
        {row.status !== 'pending' && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/promoter/import?gym=${encodeURIComponent(row.id)}`} className={quietBtn}>Import a past show hosted here</Link>
            <Link href={`/gyms/${row.slug}`} className={quietBtn}>View public page ↗</Link>
          </div>
        )}
      </div>

      <div className={`${CELL} grid grid-cols-1 gap-4`}>
        <div>
          <label htmlFor={`name-${row.id}`} className={labelCls}>Gym name</label>
          <input id={`name-${row.id}`} value={draft.name} onChange={(e) => patch({ name: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.name} required />
        </div>
        <div>
          <div className={labelCls}>What kind of gym</div>
          <div role="group" aria-label="Gym type" className="zt-block grid-cols-1 sm:grid-cols-3">
            {GYM_TYPES.map((t) => (
              <label key={t.id} className={`flex flex-col gap-1 px-4 py-3 cursor-pointer ${draft.gym_type === t.id ? '!bg-pen text-pen-label' : 'text-ink hover:bg-ground'}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold">{t.label}</span>
                  <input type="radio" name={`type-${row.id}`} checked={draft.gym_type === t.id} onChange={() => patch({ gym_type: t.id })} className="w-4 h-4" style={{ accentColor: draft.gym_type === t.id ? 'var(--pen-label)' : 'var(--pen)' }} />
                </span>
                <span className={`text-[12px] leading-snug ${draft.gym_type === t.id ? 'opacity-80' : 'text-ink-muted'}`}>{t.hint}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <fieldset className={CELL}>
        <legend className={LEGEND}>Where</legend>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-6">
            <label htmlFor={`street-${row.id}`} className={labelCls}>Street address</label>
            <input id={`street-${row.id}`} value={draft.street_address} onChange={(e) => patch({ street_address: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.street_address} autoComplete="street-address" />
          </div>
          <div className="md:col-span-3">
            <label htmlFor={`city-${row.id}`} className={labelCls}>City</label>
            <input id={`city-${row.id}`} value={draft.city} onChange={(e) => patch({ city: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.city} required autoComplete="address-level2" />
          </div>
          <div className="md:col-span-1">
            <label htmlFor={`state-${row.id}`} className={labelCls}>State</label>
            <input id={`state-${row.id}`} value={draft.state} onChange={(e) => patch({ state: e.target.value.toUpperCase() })} className={inputCls} maxLength={2} required autoComplete="address-level1" placeholder="PA" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor={`zip-${row.id}`} className={labelCls}>Zip</label>
            <input id={`zip-${row.id}`} value={draft.zip} onChange={(e) => patch({ zip: e.target.value })} className={inputCls} maxLength={10} inputMode="numeric" autoComplete="postal-code" />
          </div>
        </div>
        <p className={NOTE}>We use your address for the map pin and fall back to the zip area when needed. Distance search uses the pin.</p>
      </fieldset>

      <fieldset className={CELL}>
        <legend className={LEGEND}>How to reach you</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`web-${row.id}`} className={labelCls}>Website</label>
            <input id={`web-${row.id}`} value={draft.website_url} onChange={(e) => patch({ website_url: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.website_url} inputMode="url" placeholder="yourgym.com" />
          </div>
          <div>
            <label htmlFor={`phone-${row.id}`} className={labelCls}>Phone</label>
            <input id={`phone-${row.id}`} value={draft.phone} onChange={(e) => patch({ phone: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.phone} inputMode="tel" autoComplete="tel" />
          </div>
          <div>
            <label htmlFor={`ig-${row.id}`} className={labelCls}>Instagram</label>
            <input id={`ig-${row.id}`} value={draft.instagram} onChange={(e) => patch({ instagram: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.instagram} placeholder="yourgym (no @ needed)" />
          </div>
          <div>
            <label htmlFor={`contact-${row.id}`} className={labelCls}>Email or contact note</label>
            <input id={`contact-${row.id}`} value={draft.contact} onChange={(e) => patch({ contact: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.contact} placeholder="info@yourgym.com or “DM us on Instagram”" />
          </div>
          {GYM_SOCIAL_KEYS.map((sk) => (
            <div key={sk.key}>
              <label htmlFor={`${sk.key}-${row.id}`} className={labelCls}>{sk.label}</label>
              <input id={`${sk.key}-${row.id}`} value={draft.socials[sk.key] ?? ''} onChange={(e) => patch({ socials: { ...draft.socials, [sk.key]: e.target.value } })} className={inputCls} maxLength={GYM_LIMITS.social} placeholder={sk.placeholder} />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className={CELL}>
        <legend className={LEGEND}>Day passes and drop-ins</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`pass-${row.id}`} className={labelCls}>Day passes</label>
            <select id={`pass-${row.id}`} value={draft.day_pass_availability} onChange={(e) => patch({ day_pass_availability: e.target.value as GymPatch['day_pass_availability'] })} className={inputCls}>
              {DAY_PASS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`price-${row.id}`} className={labelCls}>Day pass price</label>
            <input id={`price-${row.id}`} value={draft.day_pass_price} onChange={(e) => patch({ day_pass_price: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.day_pass_price} placeholder="$20, or $15 with a USS card" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor={`passurl-${row.id}`} className={labelCls}>Buy or book a pass online (link)</label>
            <input id={`passurl-${row.id}`} value={draft.day_pass_url} onChange={(e) => patch({ day_pass_url: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.day_pass_url} inputMode="url" placeholder="yourgym.com/day-pass" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor={`policy-${row.id}`} className={labelCls}>Drop-in policy</label>
            <textarea id={`policy-${row.id}`} value={draft.drop_in_policy} onChange={(e) => patch({ drop_in_policy: e.target.value })} className="zt-input min-h-[4.5rem]" maxLength={GYM_LIMITS.drop_in_policy} placeholder="Waiver at the desk, 18+, call ahead on weekends, bring your own tacky…" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor={`hours-${row.id}`} className={labelCls}>Hours a visitor can come in</label>
            <input id={`hours-${row.id}`} value={draft.drop_in_hours} onChange={(e) => patch({ drop_in_hours: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.drop_in_hours} placeholder="Staffed hours Mon–Fri 4–8 pm, Sat 9–1" />
          </div>
        </div>
      </fieldset>

      {/* 058: intro sessions for newcomers */}
      <fieldset className={CELL}>
        <legend className={LEGEND}>New to strongman</legend>
        <p className={NOTE}>Beginners search for a gym that will teach them. Say whether you run intro sessions and how to get into one.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label htmlFor={`intro-${row.id}`} className={labelCls}>Intro strongman sessions</label>
            <select id={`intro-${row.id}`} value={draft.intro_sessions} onChange={(e) => patch({ intro_sessions: e.target.value as GymPatch['intro_sessions'] })} className={inputCls}>
              {INTRO_SESSIONS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          {(draft.intro_sessions === 'yes' || draft.intro_sessions === 'on_request') && (
            <>
              <div className="md:col-span-2">
                <label htmlFor={`intronote-${row.id}`} className={labelCls}>When, how much, who to ask</label>
                <textarea id={`intronote-${row.id}`} value={draft.intro_sessions_note} onChange={(e) => patch({ intro_sessions_note: e.target.value })} className="zt-input min-h-[4.5rem]" maxLength={GYM_LIMITS.intro_sessions_note} placeholder="Saturdays 10 am, $20, no experience needed. Email the desk to book a spot." />
              </div>
              <div className="md:col-span-2">
                <label htmlFor={`introurl-${row.id}`} className={labelCls}>Sign-up or info link</label>
                <input id={`introurl-${row.id}`} value={draft.intro_sessions_url} onChange={(e) => patch({ intro_sessions_url: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.intro_sessions_url} inputMode="url" placeholder="yourgym.com/intro-strongman" />
              </div>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className={CELL}>
        <legend className={LEGEND}>Equipment</legend>
        <p className={NOTE}>Tick what you have. A detail line (stone weights, log sizes) is optional and shows on your page.</p>
        {equipmentGroup('Strongman implements', STRONGMAN_IDS)}
        {equipmentGroup('Powerlifting', POWERLIFTING_IDS)}
      </fieldset>

      {/* 030: colour ways */}
      <fieldset className={CELL}>
        <legend className={LEGEND}>Colours</legend>
        <PaintPicker subject="gym" previewName={draft.name} value={draft.theme} onChange={(theme) => patch({ theme })} inputClassName={inputCls} labelClassName={labelCls} />
      </fieldset>

      <div className={CELL}>
        {notice && <Notice {...notice} />}
        <div className="flex flex-wrap items-center gap-2">
          <KeyButton type="submit" variant="pen" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save listing'}</KeyButton>
          {dirty && !busy && (
            <KeyButton variant="line" onClick={() => { setDraft(patchFromRow(row)); setNotice(null); }}>Discard changes</KeyButton>
          )}
        </div>
        {row.status !== 'pending' && (
          <p className={NOTE}>Something wrong you cannot fix here, like the name or the web address slug? <Link href={`/gyms/${row.slug}/claim?mode=report`} className={textLink}>Tell us</Link>.</p>
        )}
      </div>
    </form>
  );
}

export default function MyGymClient() {
  const auth = useAuth();
  const [gyms, setGyms] = useState<MyGymRow[] | null>(null);
  const [claims, setClaims] = useState<MyClaimRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !auth.user) return;
    try {
      const [g, c] = await Promise.all([fetchMyGyms(sb), fetchMyClaims(sb)]);
      setGyms(g);
      setClaims(c);
      setLoadError(null);
    } catch (e) {
      setLoadError(errText(e));
      setGyms([]);
    }
  }, [auth.user]);
  useEffect(() => { void load(); }, [load]);

  const back = (
    <Link href="/website/account" className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-muted hover:text-ink no-underline self-start">
      <span aria-hidden="true">←</span> Account
    </Link>
  );

  if (!auth.enabled) {
    return <section className="zt-block grid-cols-1"><p className="px-5 py-5 text-[15px] text-ink">Accounts are not configured on this build.</p></section>;
  }
  if (auth.loading) {
    return <section className="zt-block grid-cols-1"><p className="px-5 py-5"><Cap as="span">Checking your session…</Cap></p></section>;
  }
  if (!auth.user) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <section className="zt-block grid-cols-1 max-w-xl">
          <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
            <h1 className="text-[22px] font-bold leading-tight text-ink">My Gym</h1>
            <p className="text-[15px] leading-relaxed text-ink">Sign in to edit a gym listing you have claimed.</p>
            <Key href="/website/account" variant="pen" className="self-start">Sign in</Key>
          </div>
        </section>
      </div>
    );
  }

  // A new listing's own claim is not "waiting" from the owner's view: its editor card is already below.
  const ownedIds = new Set((gyms ?? []).map((g) => g.id));
  const pending = claims.filter((c) => c.status === 'pending' && !ownedIds.has(c.gym_id));
  const rejected = claims.filter((c) => c.status === 'rejected' && !ownedIds.has(c.gym_id));

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink">My Gym</h1>
        <p className="text-[15px] leading-relaxed text-ink max-w-2xl">
          Listings you own in the <Link href="/gyms" className={textLink}>Gym Directory</Link>. Travelling athletes read these to decide where to train, so the day-pass and equipment details matter most.
        </p>
      </div>
      {loadError && <Notice text={loadError} tone="warn" />}

      {pending.length > 0 && (
        <section aria-labelledby="pending-heading" className="zt-block grid-cols-1">
          <div className={CELL}>
            <Cap as="h2" id="pending-heading">Claims waiting on us</Cap>
            <ul className="flex flex-col gap-1.5">
              {pending.map((c) => (
                <li key={c.id} className="text-[13px] text-ink flex flex-wrap items-center gap-x-2">
                  <span className={PENDING}>Pending</span>
                  {c.gym ? <Link href={`/gyms/${c.gym.slug}`} className={textLink}>{c.gym.name} ({c.gym.city}, {c.gym.state})</Link> : 'A gym listing'}
                  <span className="text-ink-muted">filed {new Date(c.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
            <p className={NOTE}>We check each claim by hand. Check back here for the result; the listing shows up below once it is yours.</p>
          </div>
        </section>
      )}

      {gyms === null ? (
        <section className="zt-block grid-cols-1"><p className="px-5 py-5"><Cap as="span">Loading your listings…</Cap></p></section>
      ) : gyms.length === 0 ? (
        <section className="zt-block grid-cols-1 max-w-xl">
          <div className={CELL}>
          <h2 className="text-[22px] font-bold leading-tight text-ink">No gym on this account yet</h2>
          <p className="text-[15px] leading-relaxed text-ink">
            Already in the directory? Open your gym&rsquo;s page and use <strong>Claim this gym</strong>. Not listed yet? Add it here and it is yours from the start.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/gyms" className={primaryBtn}>Find my gym</Link>
            <Link href="/website/account/gym/add" className={quietBtn}>Add my gym</Link>
          </div>
          {rejected.length > 0 && (
            <p className={NOTE}>
              {rejected.length === 1 ? 'One earlier claim was not approved.' : `${rejected.length} earlier claims were not approved.`} If that is a mistake, file it again with an email at the gym&rsquo;s own domain.
            </p>
          )}
          </div>
        </section>
      ) : (
        <>
          {gyms.map((g) => (
            <GymEditor key={g.id} row={g} onSaved={(r) => setGyms((list) => (list ?? []).map((x) => (x.id === r.id ? r : x)))} />
          ))}
          <div>
            <Link href="/website/account/gym/add" className={quietBtn}>Add another gym</Link>
          </div>
        </>
      )}
    </div>
  );
}

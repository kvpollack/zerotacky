'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Dumbbell, ExternalLink, MapPin, Plus, Save } from 'lucide-react';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { GYM_EQUIPMENT } from '@/lib/website/gymEquipment';
import {
  DAY_PASS_OPTIONS, GYM_LIMITS, GYM_SOCIAL_KEYS, GYM_TYPES, cleanGymPatch, fetchMyClaims, fetchMyGyms, patchFromRow, patchKey,
  geocodeAddress, saveMyGym, addressChanged, type GymPatch, type PinChange, type MyClaimRow, type MyGymRow,
} from '@/lib/website/myGym';

// My Gym (016, 10/20): the owner of a claimed listing edits it here. One card per gym (most owners have one), pending
// claims listed above so someone who just claimed knows where they stand. Saves go straight to `gyms`; the public pages
// pick them up within five minutes (ISR), which the save notice says.
const inputCls = 'w-full bg-zt-inset border border-zt-border-strong rounded-lg px-3 py-2 text-sm text-zt-text';
const labelCls = 'block text-[10px] font-extrabold uppercase text-zt-muted mb-1';
const primaryBtn = 'px-4 py-2 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-40';
const quietBtn = 'px-3 py-2 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase inline-flex items-center gap-1.5 disabled:opacity-40';

const STRONGMAN_IDS = GYM_EQUIPMENT.filter((e) => !['comp_bars', 'calibrated_plates', 'monolift', 'combo_rack', 'deadlift_platform'].includes(e.id));
const POWERLIFTING_IDS = GYM_EQUIPMENT.filter((e) => ['comp_bars', 'calibrated_plates', 'monolift', 'combo_rack', 'deadlift_platform'].includes(e.id));

function Notice({ text, tone }: { text: string; tone: 'ok' | 'warn' }) {
  return (
    <div role="status" className={`text-xs font-bold rounded-lg px-3 py-2 ${tone === 'warn' ? 'bg-zt-danger/10 text-zt-danger-text border border-zt-danger/50' : 'bg-zt-inset text-zt-text-2 border border-zt-border'}`}>
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
    <div className="space-y-1.5">
      <div className="text-[11px] font-black uppercase text-zt-text-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {items.map((it) => {
          const on = draft.equipment.includes(it.id);
          return (
            <div key={it.id} className={`rounded-lg border px-2.5 py-2 ${on ? 'bg-zt-primary/10 border-zt-primary' : 'bg-zt-inset border-zt-border'}`}>
              <label className="flex items-center gap-2 text-xs font-bold text-zt-text cursor-pointer">
                <input type="checkbox" checked={on} onChange={(e) => toggleEquipment(it.id, e.target.checked)} className="w-4 h-4 accent-[var(--zt-primary)]" />
                {it.label}
              </label>
              {on && (
                <input
                  aria-label={`${it.label} details`}
                  value={draft.equipment_notes[it.id] ?? ''}
                  onChange={(e) => setNote(it.id, e.target.value)}
                  maxLength={GYM_LIMITS.equipment_note}
                  placeholder="Weights, count, anything useful"
                  className={`${inputCls} mt-1.5 py-1.5 text-xs`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <form onSubmit={submit} aria-labelledby={`gym-${row.id}`} className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zt-border pb-3">
        <div>
          <h2 id={`gym-${row.id}`} className="text-base font-black uppercase text-zt-text flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-zt-secondary" aria-hidden="true" /> {row.name}
            {row.status === 'pending' && (
              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">Awaiting review</span>
            )}
          </h2>
          <p className="text-xs text-zt-muted">
            {row.status === 'pending'
              ? 'You added this listing. We check new gyms by hand before they show in the directory; you can keep editing meanwhile.'
              : 'Claimed listing. What you save here is what athletes see.'}
          </p>
        </div>
        {row.status !== 'pending' && (
          <Link href={`/gyms/${row.slug}`} className={quietBtn}>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> View public page
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label htmlFor={`name-${row.id}`} className={labelCls}>Gym name</label>
          <input id={`name-${row.id}`} value={draft.name} onChange={(e) => patch({ name: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.name} required />
        </div>
        <div className="md:col-span-2">
          <div className={labelCls}>What kind of gym</div>
          <div role="group" aria-label="Gym type" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {GYM_TYPES.map((t) => (
              <label key={t.id} className={`p-3 rounded-xl border cursor-pointer ${draft.gym_type === t.id ? 'bg-zt-primary/15 border-zt-primary ring-1 ring-zt-primary' : 'bg-zt-inset border-zt-border'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-zt-text">{t.label}</span>
                  <input type="radio" name={`type-${row.id}`} checked={draft.gym_type === t.id} onChange={() => patch({ gym_type: t.id })} className="w-4 h-4 accent-[var(--zt-primary)]" />
                </div>
                <div className="text-[11px] text-zt-muted mt-0.5">{t.hint}</div>
              </label>
            ))}
          </div>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-black uppercase text-zt-text flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-zt-primary" aria-hidden="true" /> Where</legend>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
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
        <p className="text-[11px] text-zt-muted">We use your address for the map pin and fall back to the zip area when needed. Distance search uses the pin.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-black uppercase text-zt-text">How to reach you</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

      <fieldset className="space-y-3">
        <legend className="text-sm font-black uppercase text-zt-text flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-zt-primary" aria-hidden="true" /> Day passes and drop-ins</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <textarea id={`policy-${row.id}`} value={draft.drop_in_policy} onChange={(e) => patch({ drop_in_policy: e.target.value })} className={`${inputCls} min-h-[4.5rem]`} maxLength={GYM_LIMITS.drop_in_policy} placeholder="Waiver at the desk, 18+, call ahead on weekends, bring your own tacky…" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor={`hours-${row.id}`} className={labelCls}>Hours a visitor can come in</label>
            <input id={`hours-${row.id}`} value={draft.drop_in_hours} onChange={(e) => patch({ drop_in_hours: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.drop_in_hours} placeholder="Staffed hours Mon–Fri 4–8 pm, Sat 9–1" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-black uppercase text-zt-text">Equipment</legend>
        <p className="text-[11px] text-zt-muted">Tick what you have. A detail line (stone weights, log sizes) is optional and shows on your page.</p>
        {equipmentGroup('Strongman implements', STRONGMAN_IDS)}
        {equipmentGroup('Powerlifting', POWERLIFTING_IDS)}
      </fieldset>

      {notice && <Notice {...notice} />}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || !dirty} className={primaryBtn}>
          <Save className="w-3.5 h-3.5" aria-hidden="true" /> {busy ? 'Saving…' : 'Save listing'}
        </button>
        {dirty && !busy && (
          <button type="button" onClick={() => { setDraft(patchFromRow(row)); setNotice(null); }} className={quietBtn}>Discard changes</button>
        )}
        {row.status !== 'pending' && (
          <span className="text-[11px] text-zt-muted">Something wrong you cannot fix here, like the name or the web address slug? <Link href={`/gyms/${row.slug}/claim?mode=report`} className="text-zt-primary font-bold">Tell us</Link>.</span>
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
    <Link href="/website/account" className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-zt-muted hover:text-zt-text">
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Account
    </Link>
  );

  if (!auth.enabled) {
    return <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 text-sm text-zt-text-2">Accounts are not configured on this build.</section>;
  }
  if (auth.loading) {
    return <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 text-xs font-bold uppercase text-zt-muted">Checking your session…</section>;
  }
  if (!auth.user) {
    return (
      <div className="space-y-4">
        {back}
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2 max-w-xl">
          <h1 className="text-xl font-black text-zt-text">My Gym</h1>
          <p className="text-sm text-zt-text-2">Sign in to edit a gym listing you have claimed.</p>
          <Link href="/website/account" className={primaryBtn}>Sign in</Link>
        </section>
      </div>
    );
  }

  // A new listing's own claim is not "waiting" from the owner's view: its editor card is already below.
  const ownedIds = new Set((gyms ?? []).map((g) => g.id));
  const pending = claims.filter((c) => c.status === 'pending' && !ownedIds.has(c.gym_id));
  const rejected = claims.filter((c) => c.status === 'rejected' && !ownedIds.has(c.gym_id));

  return (
    <div className="space-y-6">
      {back}
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-black text-zt-text">My Gym</h1>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-2xl">
          Listings you own in the <Link href="/gyms" className="text-zt-primary font-bold">Gym Directory</Link>. Travelling athletes read these to decide where to train, so the day-pass and equipment details matter most.
        </p>
      </div>
      {loadError && <Notice text={loadError} tone="warn" />}

      {pending.length > 0 && (
        <section aria-labelledby="pending-heading" className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2">
          <h2 id="pending-heading" className="text-sm font-black uppercase text-zt-text">Claims waiting on us</h2>
          <ul className="space-y-1">
            {pending.map((c) => (
              <li key={c.id} className="text-xs text-zt-text-2 flex flex-wrap items-center gap-x-2">
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">Pending</span>
                {c.gym ? <Link href={`/gyms/${c.gym.slug}`} className="font-bold text-zt-text hover:underline">{c.gym.name} ({c.gym.city}, {c.gym.state})</Link> : 'A gym listing'}
                <span className="text-zt-muted">filed {new Date(c.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-zt-muted">We check each claim by hand. Check back here for the result; the listing shows up below once it is yours.</p>
        </section>
      )}

      {gyms === null ? (
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 text-xs font-bold uppercase text-zt-muted">Loading your listings…</section>
      ) : gyms.length === 0 ? (
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-3 max-w-xl">
          <h2 className="text-base font-black text-zt-text">No gym on this account yet</h2>
          <p className="text-sm text-zt-text-2">
            Already in the directory? Open your gym&rsquo;s page and use <strong>Claim this gym</strong>. Not listed yet? Add it here and it is yours from the start.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/gyms" className={primaryBtn}>Find my gym</Link>
            <Link href="/website/account/gym/add" className={quietBtn}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add my gym
            </Link>
          </div>
          {rejected.length > 0 && (
            <p className="text-[11px] text-zt-muted">
              {rejected.length === 1 ? 'One earlier claim was not approved.' : `${rejected.length} earlier claims were not approved.`} If that is a mistake, file it again with an email at the gym&rsquo;s own domain.
            </p>
          )}
        </section>
      ) : (
        <>
          {gyms.map((g) => (
            <GymEditor key={g.id} row={g} onSaved={(r) => setGyms((list) => (list ?? []).map((x) => (x.id === r.id ? r : x)))} />
          ))}
          <div>
            <Link href="/website/account/gym/add" className={quietBtn}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add another gym
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

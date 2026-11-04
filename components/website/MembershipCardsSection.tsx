'use client';
// Federation membership cards on the Account page (035). Photo + expiry per card; promoters of shows you register for
// can see them on their Registrations tab. Nothing here claims verification: the photo is the evidence.
import React, { useEffect, useRef, useState } from 'react';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { todayIsoDate } from '@/lib/promoter/rules';
import {
  CARD_MAX_BYTES, FEDERATIONS, FEDERATION_OTHER_MAX, MAX_CARDS, MEMBER_NUMBER_MAX,
  addCard, cardDraftProblem, cardFileProblem, cardStatus, cardStatusLabel, deleteCard, federationLabel, listMyCards, openCardInNewTab,
  type CardDraft, type MembershipCard,
} from '@/lib/website/membershipCards';

const INPUT = 'zt-input w-full';
const CELL = 'flex flex-col gap-1.5 px-4 py-3 sm:px-5 sm:py-3.5 min-w-0';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const EMPTY: CardDraft = { federation: 'united_states_strongman', federationOther: '', memberNumber: '', expiresOn: '' };

export default function MembershipCardsSection({ userId }: { userId: string }) {
  const sb = getSupabase();
  const [cards, setCards] = useState<MembershipCard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CardDraft>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = todayIsoDate();

  useEffect(() => {
    if (!sb) { setCards([]); return; }
    let live = true;
    listMyCards(sb, userId).then((c) => { if (live) setCards(c); }).catch((e) => { if (live) { setCards([]); setLoadError(e instanceof Error ? e.message : String(e)); } });
    return () => { live = false; };
  }, [sb, userId]);

  if (!sb) return null;

  const reset = () => { setAdding(false); setDraft(EMPTY); setFile(null); setError(null); if (fileRef.current) fileRef.current.value = ''; };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null);
    const problem = cardDraftProblem(draft, today) ?? (file ? cardFileProblem(file) : 'Add a photo of the card.');
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const card = await addCard(sb, userId, draft, file as File, today);
      setCards((prev) => [card, ...(prev ?? [])]);
      setNotice(`${federationLabel(card)} card saved.`);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (card: MembershipCard) => {
    if (!window.confirm(`Remove your ${federationLabel(card)} card? Promoters will no longer see it.`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await deleteCard(sb, card);
      setCards((prev) => (prev ?? []).filter((c) => c.id !== card.id));
      setNotice('Card removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onView = async (card: MembershipCard) => {
    setError(null);
    try {
      await openCardInNewTab(sb, card.imagePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const list = cards ?? [];
  const atMax = list.length >= MAX_CARDS;

  return (
    <section aria-labelledby="cards-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Cap as="span">Federation cards · up to {MAX_CARDS}</Cap>
        <h2 id="cards-heading" className="text-[22px] font-bold leading-tight text-ink">Federation memberships</h2>
        <p className={`${NOTE} max-w-2xl`}>
          Keep a photo of each membership card here with its expiry date. Promoters of shows you register for see the
          federation, the date and the photo on their registration list, so nobody checks paper at weigh-in. The date is
          what you type; ZeroTacky does not verify cards with the federation.
        </p>
      </div>

      {loadError && <p role="alert" className="text-[15px] font-bold text-ink">Could not load your cards ({loadError}).</p>}
      {notice && <p role="status" className="text-[15px] font-bold text-ink">{notice}</p>}
      {error && <p role="alert" className="text-[15px] font-bold text-ink">{error}</p>}

      <div className="zt-block grid-cols-1">
        {cards === null ? (
          <p className={`${CELL} ${NOTE}`}>Loading…</p>
        ) : list.length === 0 && !adding ? (
          <p className={`${CELL} ${NOTE}`}>No cards on file.</p>
        ) : (
          list.map((card) => {
            const status = cardStatus(card.expiresOn, today);
            return (
              <div key={card.id} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex flex-col gap-0.5">
                  <div className="text-[17px] font-bold leading-tight text-ink">{federationLabel(card)}</div>
                  <Cap as="span" className={status === 'expired' || status === 'expiring' ? 'text-pen' : undefined}>
                    {cardStatusLabel(status, card.expiresOn)}{card.memberNumber ? ` · #${card.memberNumber}` : ''}
                  </Cap>
                </div>
                <div className="flex items-center gap-4 text-[13px]">
                  <button type="button" onClick={() => void onView(card)} disabled={busy} className={`${textLink} disabled:opacity-40`}>View</button>
                  <button type="button" onClick={() => void onDelete(card)} disabled={busy} aria-label={`Remove ${federationLabel(card)} card`} className={`${textLink} disabled:opacity-40`}>Remove</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!adding ? (
        <button type="button" onClick={() => { setAdding(true); setNotice(null); }} disabled={busy || atMax || cards === null}
          className={keyClass('line', 'self-start disabled:opacity-40')}>
          + Add a card
        </button>
      ) : (
        <form onSubmit={(e) => void onSave(e)} className="flex flex-col gap-4" aria-label="Add a membership card">
          <div className="zt-block grid-cols-1 sm:grid-cols-2">
            <div className={CELL}>
              <label htmlFor="card-federation"><Cap as="span">Federation</Cap></label>
              <select id="card-federation" value={draft.federation} onChange={(e) => setDraft({ ...draft, federation: e.target.value as CardDraft['federation'] })} className={INPUT} disabled={busy}>
                {FEDERATIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            {draft.federation === 'other' && (
              <div className={CELL}>
                <label htmlFor="card-federation-other"><Cap as="span">Federation name</Cap></label>
                <input id="card-federation-other" value={draft.federationOther} maxLength={FEDERATION_OTHER_MAX} onChange={(e) => setDraft({ ...draft, federationOther: e.target.value })} className={INPUT} disabled={busy} />
              </div>
            )}
            <div className={CELL}>
              <label htmlFor="card-expires"><Cap as="span">Expiry date on the card</Cap></label>
              <input id="card-expires" type="date" value={draft.expiresOn} min={today} onChange={(e) => setDraft({ ...draft, expiresOn: e.target.value })} className={INPUT} disabled={busy} required />
            </div>
            <div className={CELL}>
              <label htmlFor="card-number"><Cap as="span">Member number (optional)</Cap></label>
              <input id="card-number" value={draft.memberNumber} maxLength={MEMBER_NUMBER_MAX} onChange={(e) => setDraft({ ...draft, memberNumber: e.target.value })} className={INPUT} disabled={busy} autoComplete="off" />
            </div>
            <div className={`${CELL} sm:col-span-2`}>
              <label htmlFor="card-photo"><Cap as="span">Photo of the card</Cap></label>
              <input ref={fileRef} id="card-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setError(f ? cardFileProblem(f) : null); }}
                className="block w-full text-[13px] font-bold text-ink file:mr-3 file:px-3 file:py-2 file:border-2 file:border-rule file:bg-sheet file:text-ink file:text-[12px] file:font-bold file:uppercase file:tracking-[0.04em]" />
              <p className={NOTE}>JPG, PNG or WebP under {Math.round(CARD_MAX_BYTES / 1024 / 1024)} MB. Only you and the promoters of shows you register for can open it.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={busy} className={keyClass('pen', 'disabled:opacity-40')}>
              {busy ? 'Saving…' : 'Save card'}
            </button>
            <button type="button" onClick={reset} disabled={busy} className={`text-[13px] ${textLink} disabled:opacity-40`}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {atMax && <p className={NOTE}>Up to {MAX_CARDS} cards. Remove an expired one to add another.</p>}
    </section>
  );
}

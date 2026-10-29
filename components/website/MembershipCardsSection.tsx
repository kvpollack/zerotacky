'use client';
// Federation membership cards on the Account page (035). Photo + expiry per card; promoters of shows you register for
// can see them on their Registrations tab. Nothing here claims verification: the photo is the evidence.
import React, { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Eye, Plus, Trash2 } from 'lucide-react';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { todayIsoDate } from '@/lib/promoter/rules';
import {
  CARD_MAX_BYTES, FEDERATIONS, FEDERATION_OTHER_MAX, MAX_CARDS, MEMBER_NUMBER_MAX,
  addCard, cardDraftProblem, cardFileProblem, cardStatus, cardStatusLabel, deleteCard, federationLabel, listMyCards, openCardInNewTab,
  type CardDraft, type MembershipCard,
} from '@/lib/website/membershipCards';

const INPUT = 'w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-bold text-zt-text';
const LABEL = 'block text-[10px] font-extrabold uppercase text-zt-muted mb-1';
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
    <section aria-labelledby="cards-heading" className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4">
      <div>
        <h2 id="cards-heading" className="text-base font-black uppercase text-zt-text flex items-center gap-2">
          <BadgeCheck className="w-4 h-4 text-zt-primary" aria-hidden="true" /> Federation memberships
        </h2>
        <p className="text-xs font-bold text-zt-text-2 mt-1">
          Keep a photo of each membership card here with its expiry date. Promoters of shows you register for see the
          federation, the date and the photo on their registration list, so nobody checks paper at weigh-in. The date is
          what you type; ZeroTacky does not verify cards with the federation.
        </p>
      </div>

      {loadError && <p role="alert" className="text-xs font-bold text-red-400">Could not load your cards ({loadError}).</p>}
      {notice && <p role="status" className="text-xs font-bold text-emerald-400">{notice}</p>}
      {error && <p role="alert" className="text-xs font-bold text-red-400">{error}</p>}

      {cards === null ? (
        <p className="text-xs font-bold text-zt-muted">Loading…</p>
      ) : list.length === 0 && !adding ? (
        <p className="text-xs font-bold text-zt-muted">No cards on file.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((card) => {
            const status = cardStatus(card.expiresOn, today);
            return (
              <li key={card.id} className="flex flex-wrap items-center justify-between gap-2 bg-zt-inset border border-zt-border rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-black text-zt-text">{federationLabel(card)}</div>
                  <div className={`text-[11px] font-bold ${status === 'expired' ? 'text-red-400' : status === 'expiring' ? 'text-amber-300' : 'text-zt-text-2'}`}>
                    {cardStatusLabel(status, card.expiresOn)}{card.memberNumber ? ` · #${card.memberNumber}` : ''}
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <button type="button" onClick={() => void onView(card)} disabled={busy}
                    className="px-2.5 py-1.5 rounded-lg bg-zt-surface-2 border border-zt-border text-[11px] font-extrabold uppercase text-zt-text inline-flex items-center gap-1 disabled:opacity-40">
                    <Eye className="w-3 h-3" aria-hidden="true" /> View
                  </button>
                  <button type="button" onClick={() => void onDelete(card)} disabled={busy} aria-label={`Remove ${federationLabel(card)} card`}
                    className="px-2.5 py-1.5 rounded-lg bg-zt-surface-2 border border-zt-border text-[11px] font-extrabold uppercase text-red-400 inline-flex items-center gap-1 disabled:opacity-40">
                    <Trash2 className="w-3 h-3" aria-hidden="true" /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!adding ? (
        <button type="button" onClick={() => { setAdding(true); setNotice(null); }} disabled={busy || atMax || cards === null}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zt-primary text-zt-on-primary text-xs font-black uppercase disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add a card
        </button>
      ) : (
        <form onSubmit={(e) => void onSave(e)} className="space-y-3 border-t border-zt-border pt-3" aria-label="Add a membership card">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="card-federation" className={LABEL}>Federation</label>
              <select id="card-federation" value={draft.federation} onChange={(e) => setDraft({ ...draft, federation: e.target.value as CardDraft['federation'] })} className={INPUT} disabled={busy}>
                {FEDERATIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            {draft.federation === 'other' && (
              <div>
                <label htmlFor="card-federation-other" className={LABEL}>Federation name</label>
                <input id="card-federation-other" value={draft.federationOther} maxLength={FEDERATION_OTHER_MAX} onChange={(e) => setDraft({ ...draft, federationOther: e.target.value })} className={INPUT} disabled={busy} />
              </div>
            )}
            <div>
              <label htmlFor="card-expires" className={LABEL}>Expiry date on the card</label>
              <input id="card-expires" type="date" value={draft.expiresOn} min={today} onChange={(e) => setDraft({ ...draft, expiresOn: e.target.value })} className={INPUT} disabled={busy} required />
            </div>
            <div>
              <label htmlFor="card-number" className={LABEL}>Member number (optional)</label>
              <input id="card-number" value={draft.memberNumber} maxLength={MEMBER_NUMBER_MAX} onChange={(e) => setDraft({ ...draft, memberNumber: e.target.value })} className={INPUT} disabled={busy} autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="card-photo" className={LABEL}>Photo of the card</label>
              <input ref={fileRef} id="card-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setError(f ? cardFileProblem(f) : null); }}
                className="block w-full text-xs font-bold text-zt-text-2 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-zt-surface-2 file:text-zt-text file:text-[11px] file:font-extrabold file:uppercase" />
              <p className="text-[10px] text-zt-muted mt-1">JPG, PNG or WebP under {Math.round(CARD_MAX_BYTES / 1024 / 1024)} MB. Only you and the promoters of shows you register for can open it.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-zt-primary text-zt-on-primary text-xs font-black uppercase disabled:opacity-40">
              {busy ? 'Saving…' : 'Save card'}
            </button>
            <button type="button" onClick={reset} disabled={busy} className="px-3 py-2 rounded-xl bg-zt-surface-2 border border-zt-border text-xs font-extrabold uppercase text-zt-text disabled:opacity-40">
              Cancel
            </button>
          </div>
        </form>
      )}
      {atMax && <p className="text-[10px] text-zt-muted">Up to {MAX_CARDS} cards. Remove an expired one to add another.</p>}
    </section>
  );
}

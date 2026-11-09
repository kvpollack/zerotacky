'use client';
// 052 (Kurt 11/9): admin-only "Invite the owner" block on a public gym page. Renders nothing for everyone else, so the
// server-rendered page stays the same for visitors. Kurt is usually on the gym page when he is talking to the gym.
import React, { useEffect, useMemo, useState } from 'react';
import { Cap } from '@/components/website/sheet';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { fetchIsAdmin } from '@/lib/website/myGym';
import InviteLinks from '@/components/website/InviteLinks';

export default function GymInviteAdmin({ gymId, claimed }: { gymId: string; claimed: boolean }) {
  const sb = useMemo(() => (typeof window === 'undefined' ? null : getSupabase()), []);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!sb) return;
    let alive = true;
    sb.auth.getSession().then(async ({ data }) => {
      if (!alive || !data.session) return;
      try { if (await fetchIsAdmin(sb)) setIsAdmin(true); } catch { /* signed in, not admin */ }
    });
    return () => { alive = false; };
  }, [sb]);
  if (!sb || !isAdmin) return null;
  return (
    <section aria-labelledby="gym-invite-heading" className="border-2 border-ink p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Cap as="h2" id="gym-invite-heading">Admin · invite the owner</Cap>
        {claimed && <span className="text-[13px] text-ink-muted">Already claimed; a new owner replaces the current one.</span>}
      </div>
      <InviteLinks sb={sb} kind="gym" targetId={gymId} theme="website" idPrefix="gym-inv" />
    </section>
  );
}

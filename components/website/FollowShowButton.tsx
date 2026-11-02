'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useAuth } from '@/lib/auth/useAuth';
import { usePromoterApi } from '@/lib/promoter/usePromoterApi';
import { keyClass } from './sheet';

// Follow / Following on a show page (010). Signed out: a link to sign in. Demo fixtures: disabled (no server row).
// The follow state is read from listMyAthleteMeets so the button agrees with My Meets.
export default function FollowShowButton({ slug, isDemoFixture }: { slug: string; isDemoFixture: boolean }) {
  const auth = useAuth();
  const api = usePromoterApi();
  const [mounted, setMounted] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted || auth.loading || !auth.user || isDemoFixture) return;
    let cancelled = false;
    (async () => {
      const res = await api.listMyAthleteMeets();
      if (cancelled) return;
      if (res.data) setFollowing(res.data.some((r) => r.following && r.slug === slug));
      else setFollowing(false);
    })();
    return () => { cancelled = true; };
  }, [mounted, auth.loading, auth.user, api, slug, isDemoFixture]);

  // Phase 3 (11/2): drawn as keys. Following = ink key, not following = line key.
  if (!mounted || auth.loading) return null;
  if (isDemoFixture) {
    return (
      <button type="button" disabled className={keyClass('line', 'opacity-50 cursor-not-allowed')}>
        <Heart className="w-3.5 h-3.5" aria-hidden="true" /> Follow (demo show)
      </button>
    );
  }
  if (!auth.user) {
    return (
      <Link href="/website/account" className={keyClass('line')}>
        <Heart className="w-3.5 h-3.5" aria-hidden="true" /> Sign in to follow
      </Link>
    );
  }
  const toggle = async () => {
    if (following === null) return;
    setBusy(true);
    setError(null);
    const res = await api.followShow(slug, !following);
    setBusy(false);
    if (res.error || !res.data) { setError(res.error ?? 'Could not update the follow.'); return; }
    setFollowing(res.data.following);
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy || following === null}
        onClick={toggle}
        aria-pressed={following === true}
        className={keyClass(following ? 'ink' : 'line', 'disabled:opacity-60')}
      >
        <Heart className="w-3.5 h-3.5" aria-hidden="true" fill={following ? 'currentColor' : 'none'} />
        {following === null ? 'Follow' : following ? 'Following' : 'Follow'}
      </button>
      {error && <span className="text-[11px] font-bold text-redpen" role="alert">{error}</span>}
    </span>
  );
}

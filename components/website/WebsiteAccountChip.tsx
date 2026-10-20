'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserCheck } from 'lucide-react';
import { profileLabel } from '@/lib/auth/profile';
import { useAuth } from '@/lib/auth/useAuth';

// Header account chip for `WebsiteShell`. Renders nothing until the session is known on the client
// (so server HTML and initial hydration match with no flash), then links to `/website/account`
// with the signed-in display name; signed out it renders nothing (sign-in lives on the Account tab).
export default function WebsiteAccountChip() {
  const auth = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || auth.loading) {
    return null;
  }

  if (auth.user) {
    const label = profileLabel(auth.profile, auth.user.email);
    return (
      <Link
        href="/website/account"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-extrabold bg-zt-inset text-zt-text border-zt-primary/50 hover:border-zt-primary transition"
      >
        <UserCheck className="w-3.5 h-3.5 text-zt-primary" aria-hidden="true" />
        <span className="max-w-[140px] truncate">{label}</span>
      </Link>
    );
  }

  // Signed out: nothing. The Account nav tab is where sign-in lives (Kurt 10/20).
  return null;
}

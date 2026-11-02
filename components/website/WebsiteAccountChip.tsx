'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserCheck } from 'lucide-react';
import { profileLabel } from '@/lib/auth/profile';
import { useAuth } from '@/lib/auth/useAuth';

// Header account chip for `WebsiteShell`. Renders nothing until the session is known on the client
// (so server HTML and initial hydration match with no flash), then links to `/website/account`
// with the signed-in display name; signed out it renders nothing (sign-in lives on the Account tab).
export default function WebsiteAccountChip({ compact = false }: { compact?: boolean } = {}) {
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
    // compact (MS-13, phone header row): icon only, the name stays in the accessible label
    return (
      <Link
        href="/website/account"
        aria-label={`Account: ${label}`}
        title={label}
        className={`inline-flex items-center gap-1.5 h-14 text-xs font-bold text-pen no-underline hover:text-ink transition ${compact ? 'min-w-[44px] justify-center px-2' : 'pl-3.5 pr-1'}`}
      >
        <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
        {!compact && <span className="max-w-[140px] truncate hidden md:inline">{label}</span>}
      </Link>
    );
  }

  // Signed out: nothing. The Account nav tab is where sign-in lives (Kurt 10/20).
  return null;
}

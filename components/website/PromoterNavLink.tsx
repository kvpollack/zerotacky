'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/useAuth';

// "My Meets" in the website header, only for a signed-in account with the promoter flag. Same mount guard as the
// account chip so server HTML and hydration match. Kurt 10/19: the dashboard link was buried on the account page.
export default function PromoterNavLink({ active = false }: { active?: boolean }) {
  const auth = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || auth.loading || !auth.user || !auth.profile?.is_promoter) return null;
  return (
    <Link
      href="/promoter"
      aria-current={active ? 'page' : undefined}
      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide transition border ${
        active
          ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
          : 'bg-zt-inset text-zt-text-2 border-zt-border hover:border-zt-border-strong'
      }`}
    >
      My Meets
    </Link>
  );
}

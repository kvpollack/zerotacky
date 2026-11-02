'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/useAuth';
import { navClass } from './sheet';

// "My Meets" in the website header for every signed-in account (athlete side: follows/registrations; promoter side: meets they run). Same mount guard as the
// account chip so server HTML and hydration match. Kurt 10/19: the dashboard link was buried on the account page.
export default function PromoterNavLink({ active = false }: { active?: boolean }) {
  const auth = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || auth.loading || !auth.user) return null;
  return (
    <Link
      href="/promoter"
      aria-current={active ? 'page' : undefined}
      className={navClass(active)}
    >
      My Meets
    </Link>
  );
}

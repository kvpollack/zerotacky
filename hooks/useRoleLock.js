'use client';

import { useState, useEffect } from 'react';
import { ROLE_STORAGE_KEY } from '@/lib/constants';

const ROLES = ['admin', 'judge', 'pitcrew', 'spectator'];
const DEFAULT_TAB = { judge: 'judge', pitcrew: 'pitcrew', spectator: 'standings' };

// `verifyPin(pin)` (optional) asks the server when this phone does not hold the meet's PIN locally (a phone that
// joined by code: since 007 the join RPC returns no admin_pin). It resolves true/false, or null when the phone is
// not linked to a server meet, in which case the local default applies.
export function useRoleLock({ meet, setActiveTab, verifyPin }) {
  // Volunteer Phone Role Lock ('admin' | 'judge' | 'pitcrew' | 'spectator')
  // Persisted so a volunteer phone stays locked across refresh / reopen.
  const [roleLock, setRoleLock] = useState(() => {
    try {
      const saved = localStorage.getItem(ROLE_STORAGE_KEY);
      if (saved && ROLES.includes(saved)) return saved;
    } catch (e) {
      // storage unavailable
    }
    return 'admin';
  });

  useEffect(() => {
    try {
      localStorage.setItem(ROLE_STORAGE_KEY, roleLock);
    } catch (e) {
      // ignore
    }
  }, [roleLock]);

  // On first mount, land a locked device on its role's tab (not the admin default).
  useEffect(() => {
    if (DEFAULT_TAB[roleLock]) setActiveTab(DEFAULT_TAB[roleLock]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);   // false | string (the message to show)

  const lockDeviceToRole = (mode) => {
    setRoleLock(mode);
    if (mode === 'judge') setActiveTab('judge');
    if (mode === 'pitcrew') setActiveTab('pitcrew');
    if (mode === 'spectator') setActiveTab('standings');
  };

  const handleUnlockWithPin = async () => {
    let ok;
    let message = 'Wrong PIN';
    if (meet.adminPin) {
      ok = pinInput === meet.adminPin;                 // this phone holds the meet config (built or published here)
    } else {
      let remote = null;
      try {
        remote = verifyPin ? await verifyPin(pinInput) : null;
      } catch (e) {
        remote = false;
        message = e?.message || 'Could not check the PIN. Try again.';
      }
      ok = remote === null ? pinInput === '1050' : remote === true;   // null = no server meet: local default
    }
    if (ok) {
      setRoleLock('admin');
      setPinPromptOpen(false);
      setPinInput('');
      setPinError(false);
    } else {
      setPinError(message);
    }
  };

  return {
    roleLock,
    setRoleLock,
    pinPromptOpen,
    setPinPromptOpen,
    pinInput,
    setPinInput,
    pinError,
    setPinError,
    lockDeviceToRole,
    handleUnlockWithPin,
  };
}

'use client';

import { useState, useEffect } from 'react';
import { ROLE_STORAGE_KEY } from '@/lib/constants';

const ROLES = ['admin', 'judge', 'pitcrew', 'spectator'];
const DEFAULT_TAB = { judge: 'judge', pitcrew: 'pitcrew', spectator: 'standings' };

// `verifyPin(pin)` (optional) asks the server. It resolves true/false when this phone is linked to a server meet, or
// null when it is not (local-only meet), in which case the PIN in local state applies ('1050' when the meet has none).
// R1 (Astra rehearsal 10/17): a linked phone is ALWAYS checked server-side, whatever its local state says. A joined
// phone never receives the PIN (007), and anything in localStorage can be edited, so the local value is not evidence.
// The role lock is a UX lock for volunteer phones; every privileged write is authorised on the server regardless.
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
    let remote = null;
    try {
      remote = verifyPin ? await verifyPin(pinInput) : null;
    } catch (e) {
      remote = false;
      message = e?.message || 'Could not check the PIN. Try again.';
    }
    if (remote === null) ok = pinInput === (meet.adminPin || '1050');   // not linked: this phone's own meet
    else ok = remote === true;                                           // linked: the server decides
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

'use client';

import { useState, useEffect } from 'react';
import { ROLE_STORAGE_KEY } from '@/lib/constants';

const ROLES = ['admin', 'judge', 'pitcrew', 'spectator'];
const DEFAULT_TAB = { judge: 'judge', pitcrew: 'pitcrew', spectator: 'standings' };

export function useRoleLock({ meet, setActiveTab }) {
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
  const [pinError, setPinError] = useState(false);

  const lockDeviceToRole = (mode) => {
    setRoleLock(mode);
    if (mode === 'judge') setActiveTab('judge');
    if (mode === 'pitcrew') setActiveTab('pitcrew');
    if (mode === 'spectator') setActiveTab('standings');
  };

  const handleUnlockWithPin = () => {
    if (pinInput === (meet.adminPin || '1050')) {
      setRoleLock('admin');
      setPinPromptOpen(false);
      setPinInput('');
      setPinError(false);
    } else {
      setPinError(true);
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

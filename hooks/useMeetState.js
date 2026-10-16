'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEY, SNAPSHOT_STORAGE_KEY, SNAPSHOT_LIMIT, SNAPSHOT_MIN_GAP_MS } from '@/lib/constants';
import { getInitialSeedState } from '@/lib/presets';
import {
  normalizeState,
  addStation as mbAddStation,
  updateStation as mbUpdateStation,
  removeStation as mbRemoveStation,
  addDivision as mbAddDivision,
  updateDivision as mbUpdateDivision,
  removeDivision as mbRemoveDivision,
  reorderDivisions as mbReorderDivisions,
  addEvent as mbAddEvent,
  updateEvent as mbUpdateEvent,
  removeEvent as mbRemoveEvent,
  reorderEvents as mbReorderEvents,
  addAthlete as mbAddAthlete,
  bulkAddAthletes as mbBulkAddAthletes,
  updateAthlete as mbUpdateAthlete,
  removeAthlete as mbRemoveAthlete,
  moveAthlete as mbMoveAthlete,
  shuffleLots as mbShuffleLots,
} from '@/lib/meetBuilder';

// Meet data (meet, divisions, athletes, events, results) + localStorage persistence
// + the mutators that only touch meet data.
export function useMeetState() {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return normalizeState(JSON.parse(saved));
    } catch (e) {
      // Fallback to seed state if storage is unavailable
    }
    return normalizeState(getInitialSeedState());
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore storage errors
    }
  }, [state]);

  // Auto-snapshots: ring buffer of recent states, taken when results change (at most one per
  // SNAPSHOT_MIN_GAP_MS) and always right before a destructive replace. Recovery for a stray reset
  // or a dead phone whose storage survived.
  const [snapshots, setSnapshots] = useState(() => {
    try {
      const saved = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
      const v = saved ? JSON.parse(saved) : [];
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
    } catch (e) {
      // Ignore storage errors
    }
  }, [snapshots]);

  const takeSnapshot = useCallback((reason, force = false) => {
    setSnapshots((prev) => {
      const now = Date.now();
      if (!force && prev[0] && now - prev[0].at < SNAPSHOT_MIN_GAP_MS) return prev;
      const snap = { at: now, reason, results: stateRef.current.results.length, state: stateRef.current };
      return [snap, ...prev].slice(0, SNAPSHOT_LIMIT);
    });
  }, []);

  const resultsSig = state.results.length + ':' + state.results.reduce((m, r) => Math.max(m, r.updatedAt || 0), 0);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (stateRef.current.results.length > 0) takeSnapshot('scores changed');
  }, [resultsSig, takeSnapshot]);

  // Replace the whole meet (preset switch, import, snapshot restore, new blank meet). Snapshots first.
  const replaceState = useCallback((next, reason = 'replace') => {
    if (stateRef.current.results.length > 0) takeSnapshot(`before ${reason}`, true);
    setState(normalizeState(next));
  }, [takeSnapshot]);

  // Clear all scores for a built meet while preserving divisions, events, and athletes. Snapshots first.
  const clearResults = useCallback(() => {
    if (stateRef.current.results.length > 0) takeSnapshot('before clear scores', true);
    setState((prev) => ({ ...prev, results: [] }));
  }, [takeSnapshot]);

  const { meet } = state;

  const updateAthleteRackPin = (athleteId, eventId, pinValue) => {
    setState((prev) => ({
      ...prev,
      athletes: prev.athletes.map((a) =>
        a.id === athleteId
          ? { ...a, rackHeights: { ...(a.rackHeights || {}), [eventId]: pinValue } }
          : a
      ),
    }));
  };

  const toggleAthleteWithdrawn = (athlete) => {
    const nextStatus = athlete.status === 'active' ? 'withdrawn' : 'active';
    setState((prev) => ({
      ...prev,
      athletes: prev.athletes.map((a) => (a.id === athlete.id ? { ...a, status: nextStatus } : a)),
    }));
  };

  const updateMeetConfig = (patch) => {
    setState((prev) => ({ ...prev, meet: { ...prev.meet, ...patch } }));
  };

  const toggleGymPlate = (plateWeight) => {
    const exists = meet.availablePlates.includes(plateWeight);
    const nextPlates = exists
      ? meet.availablePlates.filter((p) => p !== plateWeight)
      : [...meet.availablePlates, plateWeight].sort((a, b) => b - a);
    updateMeetConfig({ availablePlates: nextPlates });
  };

  const updateEventDivisionWeight = (eventId, divisionId, newWeight) => {
    setState((prev) => ({
      ...prev,
      events: prev.events.map((ev) =>
        ev.id === eventId
          ? {
              ...ev,
              divisionWeights: { ...ev.divisionWeights, [divisionId]: Number(newWeight) || 0 },
            }
          : ev
      ),
    }));
  };

  // Builder mutators (pure lib/meetBuilder wrappers)
  const addStation = (input) => setState((prev) => mbAddStation(prev, input));
  const updateStation = (stationId, patch) => setState((prev) => mbUpdateStation(prev, stationId, patch));
  const removeStation = (stationId) => setState((prev) => mbRemoveStation(prev, stationId));

  const addDivision = (input) => setState((prev) => mbAddDivision(prev, input));
  const updateDivision = (divisionId, patch) => setState((prev) => mbUpdateDivision(prev, divisionId, patch));
  const removeDivision = (divisionId) => setState((prev) => mbRemoveDivision(prev, divisionId));
  const reorderDivisions = (orderedIds) => setState((prev) => mbReorderDivisions(prev, orderedIds));

  const addEvent = (input) => setState((prev) => mbAddEvent(prev, input));
  const updateEvent = (eventId, patch) => setState((prev) => mbUpdateEvent(prev, eventId, patch));
  const removeEvent = (eventId) => setState((prev) => mbRemoveEvent(prev, eventId));
  const reorderEvents = (orderedIds) => setState((prev) => mbReorderEvents(prev, orderedIds));

  const addAthlete = (input) => setState((prev) => mbAddAthlete(prev, input));
  const bulkAddAthletes = (divisionId, namesText) => setState((prev) => mbBulkAddAthletes(prev, divisionId, namesText));
  const updateAthlete = (athleteId, patch) => setState((prev) => mbUpdateAthlete(prev, athleteId, patch));
  const removeAthlete = (athleteId) => setState((prev) => mbRemoveAthlete(prev, athleteId));
  const moveAthlete = (athleteId, toDivisionId) => setState((prev) => mbMoveAthlete(prev, athleteId, toDivisionId));
  const shuffleLots = (divisionId) => setState((prev) => mbShuffleLots(prev, divisionId));

  return {
    state,
    setState,
    replaceState,
    clearResults,
    snapshots,
    takeSnapshot,
    updateAthleteRackPin,
    toggleAthleteWithdrawn,
    updateMeetConfig,
    toggleGymPlate,
    updateEventDivisionWeight,
    addStation,
    updateStation,
    removeStation,
    addDivision,
    updateDivision,
    removeDivision,
    reorderDivisions,
    addEvent,
    updateEvent,
    removeEvent,
    reorderEvents,
    addAthlete,
    bulkAddAthletes,
    updateAthlete,
    removeAthlete,
    moveAthlete,
    shuffleLots,
  };
}
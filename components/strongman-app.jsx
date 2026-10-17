'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Ban,
  UserMinus,
} from 'lucide-react';
import { DEFAULT_PRESET_ID, getInitialSeedState } from '@/lib/presets';
import {
  calculatePlateLoading,
  scoreSingleEvent,
  calculateDivisionStandings,
  generateEventRunOrder,
  resolveAthleteHeightCallout,
  buildTransitionDeltas,
} from '@/lib/engine';
import { createBlankMeet, normalizeState } from '@/lib/meetBuilder';
import { useMeetState } from '@/hooks/useMeetState';
import { useMeetSync } from '@/hooks/useMeetSync';
import { useTheme } from '@/hooks/useTheme';
import { useStopwatch } from '@/hooks/useStopwatch';
import { useRoleLock } from '@/hooks/useRoleLock';
import useLayoutMode from '@/hooks/useLayoutMode';
import Header from './shell/Header';
import BottomNav from './shell/BottomNav';
import JudgePad from './judge/JudgePad';
import PitCrew from './pitcrew/PitCrew';
import Standings from './standings/Standings';
import MeetSetup from './setup/MeetSetup';
import EmptyMeetNotice from './setup/builder/EmptyMeetNotice';

export default function App() {
  const {
    state,
    setState,
    replaceState,
    clearResults,
    snapshots,
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
  } = useMeetState();

  const { meet, divisions, athletes, events, results } = state;

  const [activeTab, setActiveTab] = useState('judge');
  const [layout, toggleLayout] = useLayoutMode();
  const wideTab = layout === 'tv' && (activeTab === 'standings' || activeTab === 'pitcrew');
  const [stationFlight, setStationFlight] = useState(() => meet.stations?.[0]?.id ?? 'A');
  const [selectedDivisionId, setSelectedDivisionId] = useState(() => state.divisions[0]?.id ?? '');
  const [selectedEventId, setSelectedEventId] = useState(() => state.events[0]?.id ?? '');
  const [selectedAthleteId, setSelectedAthleteId] = useState(
    () => state.athletes.find((a) => a.divisionId === state.divisions[0]?.id)?.id ?? ''
  );
  const [lane2AthleteId, setLane2AthleteId] = useState('');
  const [pendingPresetId, setPendingPresetId] = useState(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [pendingStatusAction, setPendingStatusAction] = useState(null);

  const verifyPinRef = useRef(() => Promise.resolve(null));
  const {
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
  } = useRoleLock({ meet, setActiveTab, verifyPin: (pin) => verifyPinRef.current(pin) });

  const { themeId, isDaylight, selectTheme, toggleDaylight } = useTheme();

  const [pitCrewUseLightTier, setPitCrewUseLightTier] = useState(false);
  const [pitCrewCustomWeight, setPitCrewCustomWeight] = useState('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const {
    timerRunning,
    toggle: toggleTimer,
    stop: stopTimer,
    resetStopwatch,
    getElapsedSeconds,
    subscribe: subscribeClock,
  } = useStopwatch();

  const stationIds = new Set((meet.stations ?? []).map((s) => s.id));
  useEffect(() => {
    if (stationFlight !== 'ALL' && stationIds.size > 0 && !stationIds.has(stationFlight)) {
      setStationFlight('ALL');
    }
  }, [stationFlight, meet.stations]);

  const filteredDivisions =
    stationFlight === 'ALL'
      ? divisions
      : divisions.filter((d) => d.flight === stationFlight);

  const currentDivision =
    filteredDivisions.find((d) => d.id === selectedDivisionId) ||
    filteredDivisions[0] ||
    divisions[0];

  const currentEvent = events.find((e) => e.id === selectedEventId) || events[0];
  const divisionAthletes = currentDivision
    ? athletes.filter((a) => a.divisionId === currentDivision.id)
    : [];

  const runOrder =
    currentEvent && currentDivision
      ? generateEventRunOrder(
          currentEvent,
          currentDivision,
          divisionAthletes,
          events,
          results,
          meet.runOrderMethod
        )
      : [];

  const currentAthlete =
    divisionAthletes.find((a) => a.id === selectedAthleteId) ||
    runOrder[0]?.athlete ||
    divisionAthletes[0];

  const isMeetReadyToRun = Boolean(currentDivision && currentEvent && currentAthlete);

  useEffect(() => {
    if (currentEvent?.lanes === 2 && currentAthlete) {
      const currentOrderItem = runOrder.find((r) => r.athlete.id === currentAthlete.id);
      if (currentOrderItem) {
        const heatMate = runOrder.find(
          (r) => r.heatNumber === currentOrderItem.heatNumber && r.athlete.id !== currentAthlete.id
        );
        setLane2AthleteId(heatMate?.athlete.id || '');
      }
    }
  }, [currentEvent?.id, currentAthlete?.id, currentDivision?.id, runOrder.length]);

  const currentResult =
    currentEvent && currentAthlete
      ? results.find((r) => r.eventId === currentEvent.id && r.athleteId === currentAthlete.id) || {
          id: `${currentEvent.id}_${currentAthlete.id}`,
          eventId: currentEvent.id,
          athleteId: currentAthlete.id,
          tier: 'heavy',
          reps: 0,
          updatedAt: Date.now(),
        }
      : { id: '', eventId: '', athleteId: '', tier: 'heavy', reps: 0, updatedAt: 0 };

  const lane2Athlete = divisionAthletes.find((a) => a.id === lane2AthleteId);
  const lane2Result =
    currentEvent && lane2Athlete
      ? results.find((r) => r.eventId === currentEvent.id && r.athleteId === lane2Athlete.id) || {
          id: `${currentEvent.id}_${lane2Athlete.id}`,
          eventId: currentEvent.id,
          athleteId: lane2Athlete.id,
          updatedAt: Date.now(),
        }
      : null;

  const saveResultPatch = (targetAthleteId, patch) => {
    if (!currentEvent || !targetAthleteId) return;
    setState((prev) => {
      const existing = prev.results.find(
        (r) => r.eventId === currentEvent.id && r.athleteId === targetAthleteId
      );
      const updated = {
        id: `${currentEvent.id}_${targetAthleteId}`,
        eventId: currentEvent.id,
        athleteId: targetAthleteId,
        tier: 'heavy',
        ...existing,
        ...patch,
        updatedAt: Date.now(),
      };
      const otherResults = prev.results.filter((r) => r.id !== updated.id);
      return { ...prev, results: [...otherResults, updated] };
    });
  };

  const applyNewState = (rawFresh, reason) => {
    const fresh = normalizeState(rawFresh);
    const firstDiv = fresh.divisions[0];
    replaceState(fresh, reason);
    setStationFlight(firstDiv?.flight ?? fresh.meet.stations?.[0]?.id ?? 'A');
    setSelectedDivisionId(firstDiv?.id ?? '');
    setSelectedEventId(fresh.events[0]?.id ?? '');
    setSelectedAthleteId(fresh.athletes.find((a) => a.divisionId === firstDiv?.id)?.id ?? '');
    setLane2AthleteId('');
    setPitCrewCustomWeight('');
    setPitCrewUseLightTier(false);
    resetStopwatch();
    setPendingPresetId(null);
    setResetConfirmOpen(false);
  };

  const loadMeetPreset = (presetId) => applyNewState(getInitialSeedState(presetId), 'preset reset');
  const createNewBlankMeet = (name, date) => applyNewState(createBlankMeet(name, date), 'new blank meet');
  const importMeetState = (imported) => applyNewState(imported, 'import');
  const restoreSnapshot = (snap) => applyNewState(snap.state, 'snapshot restore');

  // Live sync (Phase 1). No-op unless NEXT_PUBLIC_SUPABASE_* is set; see hooks/useMeetSync.js.
  // useRoleLock runs before the sync hook, so the PIN verifier reaches it through a ref filled in below.
  const sync = useMeetSync({
    state,
    setState,
    applyNewState,
    roleLock,
    station: stationFlight,
    activeTab,
    live: {
      eventId: currentEvent?.id ?? null,
      divisionId: currentDivision?.id ?? null,
      athleteId: currentAthlete?.id ?? null,
      lane2AthleteId: lane2AthleteId || null,
    },
  });

  verifyPinRef.current = (pin) => (sync.link ? sync.checkAdminPin(pin) : Promise.resolve(null));

  const requestMeetPreset = (presetId) => {
    if (meet.isDemo && presetId === (meet.presetId ?? DEFAULT_PRESET_ID)) return;
    if (results.length > 0 || !meet.isDemo) {
      setPendingPresetId(presetId);
    } else {
      loadMeetPreset(presetId);
    }
  };

  const pitCrewCallout =
    currentEvent && currentDivision
      ? currentEvent.pitCrewCallout?.byDivision?.[currentDivision.id]
      : undefined;
  const isLocked = !!currentResult.locked;

  const selectRunOrderItem = (item) => {
    setSelectedAthleteId(item.athlete.id);
    setStatusMenuOpen(false);
    setPendingStatusAction(null);
    if (currentEvent?.lanes === 2) {
      const mate = runOrder.find(
        (r) => r.heatNumber === item.heatNumber && r.athlete.id !== item.athlete.id
      );
      setLane2AthleteId(mate?.athlete.id || '');
    }
  };

  const currentRunIndex = runOrder.findIndex((r) => r.athlete.id === currentAthlete?.id);
  const nextRunItem =
    currentRunIndex < 0
      ? undefined
      : runOrder
          .slice(currentRunIndex + 1)
          .find(
            (r) =>
              r.athlete.id !== lane2AthleteId &&
              (currentEvent?.lanes !== 2 || r.heatNumber !== runOrder[currentRunIndex].heatNumber)
          );

  const upNowPinHeight =
    currentEvent && currentDivision
      ? resolveAthleteHeightCallout(currentEvent, currentDivision.id, currentAthlete)
      : undefined;
  const onDeckPinHeight =
    currentEvent && currentDivision && nextRunItem
      ? resolveAthleteHeightCallout(currentEvent, currentDivision.id, nextRunItem.athlete)
      : null;

  const lockAndAdvance = () => {
    if (!currentAthlete) return;
    saveResultPatch(currentAthlete.id, { locked: true });
    if (currentEvent?.lanes === 2 && lane2Athlete) {
      saveResultPatch(lane2Athlete.id, { locked: true });
    }
    resetStopwatch();
    if (nextRunItem) selectRunOrderItem(nextRunItem);
  };

  const unlockScore = () => {
    if (!currentAthlete) return;
    saveResultPatch(currentAthlete.id, { locked: false });
    if (currentEvent?.lanes === 2 && lane2Athlete) {
      saveResultPatch(lane2Athlete.id, { locked: false });
    }
  };

  const stopAndStampFinish = () => {
    if (!currentAthlete || !currentEvent) return;
    const ms = stopTimer();
    const secs = Math.round(ms / 10) / 100;
    saveResultPatch(currentAthlete.id, {
      timeSeconds: secs,
      didNotStart: false,
      ...(currentEvent.scoringType === 'time_or_implements'
        ? { implementsCompleted: currentEvent.implementCount || 5 }
        : {}),
    });
  };

  const showStopStamp =
    timerRunning &&
    !isLocked &&
    (currentEvent?.scoringType === 'time_or_distance' ||
      currentEvent?.scoringType === 'time_or_implements');

  const statusActions = currentAthlete
    ? [
        {
          id: 'dns',
          icon: Ban,
          label: currentResult.didNotStart ? 'Clear DNS' : 'Mark DNS',
          run: () => saveResultPatch(currentAthlete.id, { didNotStart: !currentResult.didNotStart }),
        },
        {
          id: 'scratch',
          icon: UserMinus,
          label: currentAthlete.status === 'withdrawn' ? 'Reinstate Athlete' : 'Scratch from Meet',
          run: () => toggleAthleteWithdrawn(currentAthlete),
        },
      ]
    : [];

  const handleStatusAction = (action) => {
    if (pendingStatusAction === action.id) {
      action.run();
      setPendingStatusAction(null);
    } else {
      setPendingStatusAction(action.id);
    }
  };

  const divisionIndex = currentDivision
    ? filteredDivisions.findIndex((d) => d.id === currentDivision.id)
    : -1;
  const nextEventInMeet = currentEvent
    ? events.find((e) => e.eventNumber === currentEvent.eventNumber + 1)
    : undefined;
  const nextSetup =
    currentEvent && divisionIndex >= 0 && divisionIndex < filteredDivisions.length - 1
      ? { event: currentEvent, division: filteredDivisions[divisionIndex + 1] }
      : nextEventInMeet && filteredDivisions[0]
      ? { event: nextEventInMeet, division: filteredDivisions[0] }
      : null;
  const transitionRows =
    currentEvent && currentDivision && nextSetup
      ? buildTransitionDeltas(
          currentEvent,
          currentDivision.id,
          nextSetup.event,
          nextSetup.division.id
        )
      : [];

  const plateLoad =
    currentEvent && currentDivision
      ? calculatePlateLoading(
          currentEvent,
          currentDivision.id,
          meet.availablePlates,
          meet.collarWeightPerPair,
          pitCrewCustomWeight,
          pitCrewUseLightTier
        )
      : null;

  const eventScores =
    currentEvent && currentDivision ? scoreSingleEvent(currentEvent, divisionAthletes, results) : [];
  const overallStandings = currentDivision
    ? calculateDivisionStandings(
        currentDivision,
        divisionAthletes,
        events,
        results,
        meet.tiebreakerRule
      )
    : [];

  return (
    <div
      data-zt-theme={themeId}
      className="min-h-screen bg-zt-bg text-zt-text pb-24 font-sans select-none transition-colors"
    >
      <Header
        sync={sync}
        athletes={athletes}
        currentDivision={currentDivision}
        currentEvent={currentEvent}
        divisions={divisions}
        events={events}
        filteredDivisions={filteredDivisions}
        handleUnlockWithPin={handleUnlockWithPin}
        isDaylight={isDaylight}
        meet={meet}
        pinError={pinError}
        pinInput={pinInput}
        pinPromptOpen={pinPromptOpen}
        roleLock={roleLock}
        setPinError={setPinError}
        setPinInput={setPinInput}
        setPinPromptOpen={setPinPromptOpen}
        setPitCrewCustomWeight={setPitCrewCustomWeight}
        setSelectedAthleteId={setSelectedAthleteId}
        setSelectedDivisionId={setSelectedDivisionId}
        setSelectedEventId={setSelectedEventId}
        setStationFlight={setStationFlight}
        stationFlight={stationFlight}
        toggleDaylight={toggleDaylight}
      />

      <main className={`p-3.5 mx-auto space-y-4 ${wideTab ? 'max-w-[1600px] px-6' : 'max-w-xl'}`}>
        {activeTab !== 'setup' && !isMeetReadyToRun && (
          <EmptyMeetNotice roleLock={roleLock} onGoToSetup={() => setActiveTab('setup')} />
        )}

        {activeTab === 'judge' && isMeetReadyToRun && (
          <JudgePad
            currentAthlete={currentAthlete}
            currentDivision={currentDivision}
            currentEvent={currentEvent}
            currentResult={currentResult}
            divisionAthletes={divisionAthletes}
            getElapsedSeconds={getElapsedSeconds}
            subscribeClock={subscribeClock}
            stopAndStampFinish={stopAndStampFinish}
            handleStatusAction={handleStatusAction}
            isLocked={isLocked}
            lane2Athlete={lane2Athlete}
            lane2AthleteId={lane2AthleteId}
            lane2Result={lane2Result}
            lockAndAdvance={lockAndAdvance}
            meet={meet}
            nextRunItem={nextRunItem}
            pendingStatusAction={pendingStatusAction}
            resetStopwatch={resetStopwatch}
            results={results}
            runOrder={runOrder}
            saveResultPatch={saveResultPatch}
            selectRunOrderItem={selectRunOrderItem}
            setLane2AthleteId={setLane2AthleteId}
            setPendingStatusAction={setPendingStatusAction}
            setPitCrewCustomWeight={setPitCrewCustomWeight}
            setStatusMenuOpen={setStatusMenuOpen}
            toggleTimer={toggleTimer}
            showStopStamp={showStopStamp}
            statusActions={statusActions}
            statusMenuOpen={statusMenuOpen}
            timerRunning={timerRunning}
            unlockScore={unlockScore}
            upNowPinHeight={upNowPinHeight}
          />
        )}

        {activeTab === 'pitcrew' && isMeetReadyToRun && (
          <PitCrew
            layout={layout}
            toggleLayout={toggleLayout}
            currentAthlete={currentAthlete}
            currentDivision={currentDivision}
            currentEvent={currentEvent}
            nextRunItem={nextRunItem}
            nextSetup={nextSetup}
            onDeckPinHeight={onDeckPinHeight}
            pitCrewCallout={pitCrewCallout}
            pitCrewCustomWeight={pitCrewCustomWeight}
            pitCrewUseLightTier={pitCrewUseLightTier}
            plateLoad={plateLoad}
            setPitCrewCustomWeight={setPitCrewCustomWeight}
            setPitCrewUseLightTier={setPitCrewUseLightTier}
            transitionRows={transitionRows}
            upNowPinHeight={upNowPinHeight}
            updateAthleteRackPin={updateAthleteRackPin}
          />
        )}

        {activeTab === 'standings' && isMeetReadyToRun && (
          <Standings
            currentDivision={currentDivision}
            currentEvent={currentEvent}
            eventScores={eventScores}
            events={events}
            meet={meet}
            overallStandings={overallStandings}
            layout={layout}
            toggleLayout={toggleLayout}
          />
        )}

        {activeTab === 'setup' && roleLock === 'admin' && (
          <MeetSetup
            state={state}
            meet={meet}
            divisions={divisions}
            events={events}
            athletes={athletes}
            results={results}
            snapshots={snapshots}
            themeId={themeId}
            selectTheme={selectTheme}
            lockDeviceToRole={lockDeviceToRole}
            updateMeetConfig={updateMeetConfig}
            toggleGymPlate={toggleGymPlate}
            addStation={addStation}
            updateStation={updateStation}
            removeStation={removeStation}
            addDivision={addDivision}
            updateDivision={updateDivision}
            removeDivision={removeDivision}
            reorderDivisions={reorderDivisions}
            addEvent={addEvent}
            updateEvent={updateEvent}
            removeEvent={removeEvent}
            reorderEvents={reorderEvents}
            addAthlete={addAthlete}
            bulkAddAthletes={bulkAddAthletes}
            updateAthlete={updateAthlete}
            removeAthlete={removeAthlete}
            moveAthlete={moveAthlete}
            shuffleLots={shuffleLots}
            toggleAthleteWithdrawn={toggleAthleteWithdrawn}
            createNewBlankMeet={createNewBlankMeet}
            pendingPresetId={pendingPresetId}
            setPendingPresetId={setPendingPresetId}
            requestMeetPreset={requestMeetPreset}
            loadMeetPreset={loadMeetPreset}
            importMeetState={importMeetState}
            restoreSnapshot={restoreSnapshot}
            clearResults={clearResults}
            resetConfirmOpen={resetConfirmOpen}
            setResetConfirmOpen={setResetConfirmOpen}
            sync={sync}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        roleLock={roleLock}
        setActiveTab={setActiveTab}
      />
    </div>
  );
}
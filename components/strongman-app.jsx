'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Ban,
  UserMinus,
} from 'lucide-react';
import { DEFAULT_PRESET_ID, getInitialSeedState, isMeetPresetId } from '@/lib/presets';
import {
  calculatePlateLoading,
  scoreSingleEvent,
  calculateDivisionStandings,
  generateEventRunOrder,
  resolveAthleteHeightCallout,
  buildTransitionDeltas,
  nextEventOnStation,
  stationById,
  stationForDivision,
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
          meet.runOrderMethod,
          meet.stations
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

  // 011 (Astra R-H1): on a joined phone the stored role is a UX lock only; the server refuses score writes without a
  // grant from a correct PIN. A joined phone showing admin or judge with no grant (edited storage, a join from the
  // Sync panel, or a link made before 011) drops to spectator so what it shows matches what it can do.
  const linkRole = sync.link?.role ?? null;
  const linkGrant = sync.link?.grant ?? null;
  useEffect(() => {
    if (linkRole !== 'device' || linkGrant) return;
    if (roleLock === 'admin' || roleLock === 'judge') lockDeviceToRole('spectator');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkRole, linkGrant, roleLock]);
  const syncForPanel = {
    ...sync,
    joinByCode: async (code) => {
      const remote = await sync.joinByCode(code);
      lockDeviceToRole('spectator');
      return remote;
    },
  };

  const requestMeetPreset = (presetId) => {
    if (meet.isDemo && presetId === (meet.presetId ?? DEFAULT_PRESET_ID)) return;
    if (results.length > 0 || !meet.isDemo) {
      setPendingPresetId(presetId);
    } else {
      loadMeetPreset(presetId);
    }
  };

  // /scorer?demo=<presetId> from the website's demo chooser (Kurt 10/19). A demo on the device is replaced outright;
  // a meet someone built themselves gets the usual confirm in Meet Setup step 6 instead. The param is dropped from the
  // URL so a reload does not load it again.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demo');
    if (demo === null) return;
    params.delete('demo');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    if (!isMeetPresetId(demo)) return;
    if (meet.isDemo) {
      if (demo !== (meet.presetId ?? DEFAULT_PRESET_ID)) loadMeetPreset(demo);
      return;
    }
    setPendingPresetId(demo);
    setActiveTab('setup');
  }, []);

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

  // Pit Crew's next setup stays on the current division's station (Astra EO-M1, 10/21). Under "All" the filtered list
  // spans the whole meet, which handed the loader another station's next division and weight; scoping by `flight`
  // keeps changeovers on one floor. Divisions pointing at a removed station share their dead id, so they still pair up.
  const stationDivisions = currentDivision
    ? filteredDivisions.filter((d) => d.flight === currentDivision.flight)
    : [];
  const divisionIndex = currentDivision
    ? stationDivisions.findIndex((d) => d.id === currentDivision.id)
    : -1;
  // Next event follows the station's own order (10/21): the filtered station when one is picked, otherwise the current
  // division's station. With no custom order this is the next eventNumber, as before.
  const nextEventInMeet = currentEvent
    ? nextEventOnStation(
        stationById(meet, stationFlight) ?? stationForDivision(meet, currentDivision),
        events,
        currentEvent.id
      )
    : undefined;
  const nextSetup =
    currentEvent && divisionIndex >= 0 && divisionIndex < stationDivisions.length - 1
      ? { event: currentEvent, division: stationDivisions[divisionIndex + 1] }
      : nextEventInMeet && stationDivisions[0]
      ? { event: nextEventInMeet, division: stationDivisions[0] }
      : null;

  // Last athlete in the group (Kurt, meet day 10/24): the lock button used to land back on the same athlete, so the
  // judge had to pick the next group from the dropdown. Now it follows Pit Crew's nextSetup: next division on this
  // station, or the station's next event from its first division. Clearing the athlete id lets the new run order pick.
  const goToNextSetup = () => {
    if (!nextSetup) return;
    setStatusMenuOpen(false);
    setPendingStatusAction(null);
    if (nextSetup.event.id !== currentEvent?.id) {
      setSelectedEventId(nextSetup.event.id);
      setPitCrewCustomWeight('');
    }
    setSelectedDivisionId(nextSetup.division.id);
    setSelectedAthleteId('');
    setLane2AthleteId('');
  };

  const lockAndAdvance = () => {
    if (!currentAthlete) return;
    saveResultPatch(currentAthlete.id, { locked: true });
    if (currentEvent?.lanes === 2 && lane2Athlete) {
      saveResultPatch(lane2Athlete.id, { locked: true });
    }
    resetStopwatch();
    if (nextRunItem) selectRunOrderItem(nextRunItem);
    else goToNextSetup();
  };
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
    currentEvent && currentDivision ? scoreSingleEvent(currentEvent, divisionAthletes, results, events) : [];
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
        nextSetup={nextSetup}
        goToNextSetup={goToNextSetup}
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
            readOnly={roleLock === 'spectator'}
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
            sync={syncForPanel}
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
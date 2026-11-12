import type { EventDef, MeetUnits, PitCrewStat, TransitionRow } from '../types';
import { weightUnit } from '../units';

export function describeSetup(event: EventDef, divisionId: string, units: MeetUnits = 'imperial'): string {
  const callout = event.pitCrewCallout?.byDivision?.[divisionId];
  if (callout?.headline) return callout.headline;
  if (event.fixedImplementDescription) return event.fixedImplementDescription;
  const w = event.divisionWeights?.[divisionId];
  if (w === undefined) return '—';
  return `${w} ${weightUnit(units)}${event.weightIsAddedPlatesOnly ? ' added plates' : ''}`;
}

export function parseMeasure(value: string): { num: number; unit: string } | null {
  const m = String(value).trim().match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
  return m ? { num: Number(m[1]), unit: m[2] } : null;
}

export function formatSigned(n: number, unit: string): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded}${unit === '"' ? '"' : ` ${unit}`}`.trim();
}

export function buildTransitionDeltas(
  curEvent: EventDef,
  curDivId: string,
  nextEvent: EventDef,
  nextDivId: string,
  units: MeetUnits = 'imperial'   // 059: labels only
): TransitionRow[] {
  const lb = weightUnit(units);
  if (curEvent.id !== nextEvent.id) {
    return [
      {
        label: 'Event Changeover',
        from: describeSetup(curEvent, curDivId, units),
        to: describeSetup(nextEvent, nextDivId, units),
        delta: `Strike Ev ${curEvent.eventNumber} → Build Ev ${nextEvent.eventNumber}`,
        changed: true,
      },
    ];
  }

  const rows: TransitionRow[] = [];
  const curW = curEvent.divisionWeights?.[curDivId];
  const nextW = curEvent.divisionWeights?.[nextDivId];
  if (curEvent.loadingPoints > 0 && curW !== undefined && nextW !== undefined) {
    const diff = nextW - curW;
    const perPoint = Math.round((Math.abs(diff) / curEvent.loadingPoints) * 100) / 100;
    const pointLabel = curEvent.loadingPoints === 2 ? 'side' : 'point';
    rows.push({
      label: curEvent.weightIsAddedPlatesOnly ? 'Added Plates' : 'Implement Weight',
      from: `${curW} ${lb}`,
      to: `${nextW} ${lb}`,
      delta:
        diff === 0
          ? 'No plate change'
          : `${diff > 0 ? 'ADD' : 'REMOVE'} ${perPoint} ${lb} per ${pointLabel} (${Math.abs(diff)} ${lb} total)`,
      changed: diff !== 0,
    });
  }

  const curCallout = curEvent.pitCrewCallout?.byDivision?.[curDivId];
  const nextCallout = curEvent.pitCrewCallout?.byDivision?.[nextDivId];
  const nextStats = nextCallout?.stats ?? [];
  const isNumericStat = (s: PitCrewStat) => parseMeasure(s.value) !== null;

  // Astra DR3-06 (11/3): the headline is the setup itself (Pickup Truck -> Box Truck). It used to be compared only
  // when the callout had no numeric stats, so a vehicle swap with an unchanged 50 ft course read "No change".
  // Now a changed headline is its own row, ahead of the stats, unless a stat already carries the same text (a
  // headline of 46" next to a Yoke Crossbar 46" stat); an unchanged one is only shown when there are no stats to
  // carry the "No change" line.
  const curHead = curCallout?.headline ?? '', nextHead = nextCallout?.headline ?? '';
  const headlineInStats = nextStats.some((s) => s.value === nextHead) || (curCallout?.stats ?? []).some((s) => s.value === curHead);
  const headlineChanged = !!curHead && !!nextHead && curHead !== nextHead && !headlineInStats;
  if (headlineChanged) {
    rows.push({
      label: curEvent.pitCrewCallout!.title,
      from: curHead,
      to: nextHead,
      delta: 'Swap setup',
      changed: true,
    });
  }

  if (nextStats.some(isNumericStat)) {
    nextStats.forEach((stat) => {
      const prev = curCallout?.stats?.find((s) => s.label === stat.label);
      const a = prev ? parseMeasure(prev.value) : null;
      const b = parseMeasure(stat.value);
      if (a && b && a.unit === b.unit) {
        const diff = b.num - a.num;
        rows.push({
          label: stat.label,
          from: prev!.value,
          to: stat.value,
          delta: diff === 0 ? 'No change' : formatSigned(diff, b.unit),
          changed: diff !== 0,
        });
      } else if (prev?.value !== stat.value) {
        rows.push({ label: stat.label, from: prev?.value ?? '—', to: stat.value, delta: 'Change', changed: true });
      }
    });
  } else if (!headlineChanged && curCallout?.headline && nextCallout?.headline) {
    rows.push({
      label: curEvent.pitCrewCallout!.title,
      from: curCallout.headline,
      to: nextCallout.headline,
      delta: 'No change',
      changed: false,
    });
  }

  if (rows.length === 0 && curW !== undefined && nextW !== undefined) {
    const diff = nextW - curW;
    rows.push({
      label: 'Implement',
      from: `${curW} ${lb}`,
      to: `${nextW} ${lb}`,
      delta: diff === 0 ? 'No change' : formatSigned(diff, lb),
      changed: diff !== 0,
    });
  }

  return rows;
}

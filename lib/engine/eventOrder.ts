import type { Division, EventDef, Meet, Station } from '../types';

// Per-station event order (10/21). Strongfest's floor ran basket, keg, truck on one station and keg, basket, truck on
// the other, while the app only knew one global order. A station may carry `eventOrder` (event ids); when it is absent
// or equals the meet order, everything behaves as before. The leaderboard, CSV and show pages keep eventNumber columns.

export function meetEventOrder(events: EventDef[]): EventDef[] {
  return [...events].sort((a, b) => a.eventNumber - b.eventNumber);
}

// Clean a stored order against the current events: unknown ids dropped, duplicates dropped, missing events appended in
// meet order. Returns undefined when the result is just the meet order, so "no override" stays absent in saved data.
export function normalizeEventOrder(order: unknown, events: EventDef[]): string[] | undefined {
  const known = meetEventOrder(events).map((e) => e.id);
  if (known.length === 0) return undefined;
  const raw = Array.isArray(order) ? order.filter((x): x is string => typeof x === 'string') : [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const id of raw) {
    if (known.includes(id) && !seen.has(id)) { seen.add(id); cleaned.push(id); }
  }
  for (const id of known) if (!seen.has(id)) cleaned.push(id);
  return cleaned.every((id, i) => id === known[i]) ? undefined : cleaned;
}

export function stationEvents(station: Station | undefined, events: EventDef[]): EventDef[] {
  const base = meetEventOrder(events);
  const order = normalizeEventOrder(station?.eventOrder, events);
  if (!order) return base;
  const byId = new Map(base.map((e) => [e.id, e]));
  return order.map((id) => byId.get(id)).filter((e): e is EventDef => Boolean(e));
}

export function stationForDivision(meet: Pick<Meet, 'stations'>, division: Division | undefined): Station | undefined {
  if (!division) return undefined;
  return (meet.stations ?? []).find((s) => s.id === division.flight);
}

export function stationById(meet: Pick<Meet, 'stations'>, stationId: string | undefined): Station | undefined {
  if (!stationId || stationId === 'ALL') return undefined;
  return (meet.stations ?? []).find((s) => s.id === stationId);
}

// Events in the order the division's station runs them.
export function eventsForDivision(meet: Pick<Meet, 'stations'>, division: Division | undefined, events: EventDef[]): EventDef[] {
  return stationEvents(stationForDivision(meet, division), events);
}

export function nextEventOnStation(station: Station | undefined, events: EventDef[], currentEventId: string | undefined): EventDef | undefined {
  const ordered = stationEvents(station, events);
  const idx = ordered.findIndex((e) => e.id === currentEventId);
  return idx >= 0 ? ordered[idx + 1] : undefined;
}

// Events that run before `target` on this station (whatever their eventNumber).
export function priorEventsOnStation(station: Station | undefined, events: EventDef[], target: EventDef): EventDef[] {
  const ordered = stationEvents(station, events);
  const idx = ordered.findIndex((e) => e.id === target.id);
  return idx > 0 ? ordered.slice(0, idx) : [];
}

// 1-based position of the event on the station, or 0 when the event is not on it.
export function stationPosition(station: Station | undefined, events: EventDef[], eventId: string): number {
  return stationEvents(station, events).findIndex((e) => e.id === eventId) + 1;
}

export function hasCustomEventOrder(station: Station | undefined, events: EventDef[]): boolean {
  return normalizeEventOrder(station?.eventOrder, events) !== undefined;
}

// Move an event one step within a station's order; returns the new order (undefined when it collapses to meet order).
export function moveEventInOrder(station: Station | undefined, events: EventDef[], eventId: string, direction: -1 | 1): string[] | undefined {
  const order = stationEvents(station, events).map((e) => e.id);
  const i = order.indexOf(eventId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= order.length) return normalizeEventOrder(order, events);
  [order[i], order[j]] = [order[j], order[i]];
  return normalizeEventOrder(order, events);
}

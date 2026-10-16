// Outbound sync queue. Pure functions over a plain array so it can live in localStorage.
// Coalesces by (table,id): a later write to the same row replaces the earlier one.
export interface QueueItem {
  table: 'results' | 'live_state' | 'athletes' | 'divisions' | 'events' | 'meets';
  id: string;             // row id, or `${meet_id}:${station}` for live_state
  row: Record<string, unknown>;
  enqueuedAt: number;
}

export const QUEUE_KEY = 'ZEROTACKY_SYNC_QUEUE_V1';
export const QUEUE_LIMIT = 2000;

export function enqueue(queue: QueueItem[], item: Omit<QueueItem, 'enqueuedAt'>, now = Date.now()): QueueItem[] {
  const next = queue.filter((q) => !(q.table === item.table && q.id === item.id));
  next.push({ ...item, enqueuedAt: now });
  return next.length > QUEUE_LIMIT ? next.slice(next.length - QUEUE_LIMIT) : next;
}

export function groupByTable(queue: QueueItem[]): Record<string, QueueItem[]> {
  const out: Record<string, QueueItem[]> = {};
  for (const q of queue) (out[q.table] ??= []).push(q);
  return out;
}

export function removeFlushed(queue: QueueItem[], flushed: QueueItem[]): QueueItem[] {
  const keys = new Set(flushed.map((f) => `${f.table}|${f.id}|${f.enqueuedAt}`));
  return queue.filter((q) => !keys.has(`${q.table}|${q.id}|${q.enqueuedAt}`));
}

export function readQueue(storage: Pick<Storage, 'getItem'>): QueueItem[] {
  try { const raw = storage.getItem(QUEUE_KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; }
  catch { return []; }
}

export function writeQueue(storage: Pick<Storage, 'setItem'>, queue: QueueItem[]): void {
  try { storage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* storage full or unavailable */ }
}

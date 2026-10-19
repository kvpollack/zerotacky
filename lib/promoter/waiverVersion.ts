import { createHash } from 'node:crypto';

// Server-only (node:crypto). The version identifies the waiver text the athlete saw: the first 12 hex chars of
// sha-256 over the raw legal/WAIVER.md (before placeholder substitution, so one meet's venue or name does not
// change the version). Stored on each registration (Astra C6) so a later waiver edit cannot be mistaken for the
// text an earlier athlete accepted.
export const WAIVER_VERSION_LENGTH = 12;

export function waiverVersionOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, WAIVER_VERSION_LENGTH);
}

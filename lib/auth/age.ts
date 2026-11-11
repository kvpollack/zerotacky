// Account age rule (Kurt 11/11, roadmap set-up item 5, as a precaution): the Terms say 13 or older, so sign-up asks for a
// date of birth and refuses anything younger. Pure; the database (057) keeps the same rule as a check constraint and the
// auth trigger refuses an under-age birth date, so the form is the friendly gate and the server is the real one.
export const MIN_ACCOUNT_AGE = 13;
export const ADULT_AGE = 18;
const MAX_AGE = 120;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' that is a real calendar date, else null. */
export function parseDob(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = ISO_DATE.exec(v.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Whole years between the birth date and `today` (both calendar dates, UTC arithmetic). Negative = not born yet. */
export function ageOn(dob: string, today: Date = new Date()): number {
  const [y, mo, d] = dob.split('-').map(Number);
  const ty = today.getUTCFullYear(), tm = today.getUTCMonth() + 1, td = today.getUTCDate();
  let age = ty - y;
  if (tm < mo || (tm === mo && td < d)) age -= 1;
  return age;
}

/** The latest birth date a sign-up can carry today, for the date input's `max`. */
export function latestAllowedDob(today: Date = new Date()): string {
  const y = today.getUTCFullYear() - MIN_ACCOUNT_AGE;
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** Null when the date is fine, else the sentence the form shows. */
export function dobProblem(v: unknown, today: Date = new Date()): string | null {
  const dob = parseDob(v);
  if (!dob) return 'Enter your date of birth.';
  const age = ageOn(dob, today);
  if (age < 0 || age > MAX_AGE) return 'That date of birth does not look right.';
  if (age < MIN_ACCOUNT_AGE) return `You must be ${MIN_ACCOUNT_AGE} or older to create an account.`;
  return null;
}

export function isMinor(dob: string, today: Date = new Date()): boolean {
  return ageOn(dob, today) < ADULT_AGE;
}

// Calendar maths in the phone's local time zone. Days are identified by their local
// midnight timestamp (ms); ranges are [start of first day, end of last day].

export const DAY_MS = 86_400_000;
/** Longest range one chart or export may cover (Firestore free-tier reads; docs/runbook.md). */
export const MAX_RANGE_DAYS = 7;
/**
 * First day that can be picked. Real readings started in November 2026 (the first station went
 * live on 5 Nov), so earlier days would only ever be empty. Local midnight, 1 Nov 2026.
 */
export const DATA_START_DAY = new Date(2026, 10, 1).getTime();

/** A day can be picked from DATA_START_DAY up to today. */
export function isSelectableDay(day: number, today: number): boolean {
  return day >= DATA_START_DAY && day <= today;
}

/** How the calendar shows a selection: today alone, another single day, or a range. */
export type PickMode = 'today' | 'day' | 'range';

export function pickModeOf(r: DayRange, today: number): PickMode {
  if (r.start !== r.end) return 'range';
  return r.start === today ? 'today' : 'day';
}

/** While choosing the end of a range: the last day allowed (MAX_RANGE_DAYS from the start, never after today). */
export function lastPickableEnd(start: number, today: number): number {
  return Math.min(addDays(start, MAX_RANGE_DAYS - 1), today);
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Last millisecond of the day containing `ms`. */
export function endOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
}

export function addDays(dayMs: number, n: number): number {
  const d = new Date(dayMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

/** Whole days covered by [startDay, endDay], counting both. */
export function daysInRange(startDay: number, endDay: number): number {
  let n = 1;
  for (let d = startDay; d < endDay; d = addDays(d, 1)) n++;
  return n;
}

/** Calendar grid for a month: 6 rows x 7 columns (Sunday first), null = blank cell. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(first.getDay()).fill(null);
  for (let day = 1; day <= days; day++) cells.push(new Date(year, month, day).getTime());
  while (cells.length < 42) cells.push(null);
  return Array.from({ length: 6 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
}

export type DayRange = { start: number; end: number };


export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatRange(r: DayRange): string {
  if (r.start === r.end) return formatDay(r.start);
  const a = new Date(r.start);
  const b = new Date(r.end);
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  return `${left} – ${formatDay(r.end)}`;
}

/** 2026-10-27 14:05:09 in local time, sortable as text (used in exports). */
export function isoLocal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

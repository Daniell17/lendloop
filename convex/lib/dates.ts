const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function utcToday(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function daysBetween(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  return Math.round((endMs - startMs) / 86_400_000);
}

export function formatCalendarDate(iso: string): string {
  const match = DATE_PATTERN.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

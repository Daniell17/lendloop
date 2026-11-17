const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function reminderActivityLabel(createdAt: number, now: number): string {
  const elapsed = Math.max(0, now - createdAt);
  if (elapsed < MINUTE) return "Reminder sent just now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `Reminder sent ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `Reminder sent ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(elapsed / DAY);
  return `Reminder sent ${days} day${days === 1 ? "" : "s"} ago`;
}

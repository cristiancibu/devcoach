export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

export function formatDuration(ms: number): string {
  if (ms < MINUTE) {
    return "less than 1m";
  }

  const totalMinutes = Math.round(ms / MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

export function dayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isLateNight(date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 1 && hour < 5;
}

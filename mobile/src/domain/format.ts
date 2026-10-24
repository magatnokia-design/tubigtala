// Display formatting. Missing values render as an em dash, never as 0.

export const MISSING = '—';

export function formatNumber(value: number | null, decimals: number): string {
  return value === null || !Number.isFinite(value) ? MISSING : value.toFixed(decimals);
}

/** "just now", "45 s ago", "12 min ago", "3 h ago", "2 d ago" */
export function formatAge(ageMs: number): string {
  const s = Math.round(ageMs / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

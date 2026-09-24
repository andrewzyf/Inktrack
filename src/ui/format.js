/** m:ss.mmm race-clock formatting. */
export function formatTime(seconds) {
  if (seconds == null || !isFinite(seconds)) return '--:--.---';
  const neg = seconds < 0;
  let ms = Math.round(Math.abs(seconds) * 1000);
  const m = Math.floor(ms / 60000);
  ms -= m * 60000;
  const s = Math.floor(ms / 1000);
  ms -= s * 1000;
  return `${neg ? '-' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** +1.234 / -0.456 split deltas. */
export function formatDelta(seconds) {
  const sign = seconds <= 0 ? '-' : '+';
  return `${sign}${Math.abs(seconds).toFixed(3)}`;
}

export function formatDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

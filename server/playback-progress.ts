export interface PlaybackProgress {
  highWaterTicks: number;
  lastAdvanceAt: number;
  confirmed: boolean;
}

// Jellyfin can report a stopped playhead cycling through the same few seconds.
// Only progress beyond the recent high-water mark keeps that session alive.
export function updatePlaybackProgress(previous: PlaybackProgress | undefined, positionTicks: number, now: number): PlaybackProgress {
  if (!previous) return { highWaterTicks: positionTicks, lastAdvanceAt: now, confirmed: false };
  const substantialRewind = previous.highWaterTicks - positionTicks > 5 * 10_000_000;
  if (substantialRewind || positionTicks > previous.highWaterTicks) {
    return { highWaterTicks: positionTicks, lastAdvanceAt: now, confirmed: true };
  }
  return previous;
}

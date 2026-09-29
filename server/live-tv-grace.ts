// Channel switches can briefly disappear from Jellyfin's sessions endpoint.
// Any fresh playback takes precedence over the previous channel.
export function holdMissingLiveTv(missingSince: number, now: number, freshActiveCount: number): boolean {
  return freshActiveCount === 0 && now - missingSince < 15_000;
}

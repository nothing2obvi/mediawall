import type { PlaybackSource } from "./types.js";
export function watchesSource(selection: PlaybackSource, source: Exclude<PlaybackSource, "All">): boolean {
  return selection === "All" || selection === source;
}

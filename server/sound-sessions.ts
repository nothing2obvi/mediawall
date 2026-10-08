import type { NowPlayingState, DisplayConfig } from "./types.js";

export function soundSessionIdentity(state: NowPlayingState, displayConfig: DisplayConfig) {
  const user = soundUserIdentity(state);
  if (state.source === "subsonic" && displayConfig.now_playing.sounds.continuous_sessions.subsonic) {
    return `${user}:continuous:subsonic`;
  }
  if ((state.source === "spotify" || state.source === "apple_music" || state.source === "external_music") && displayConfig.now_playing.sounds.continuous_sessions.external_music) {
    return `${user}:continuous:${state.source}:${state.source === "external_music" ? state.externalMusicSource?.trim().toLowerCase() ?? "" : ""}`;
  }
  if (state.source === "jellyfin" && jellyfinContinuousSessionName(state, displayConfig)) {
    return `${user}:continuous:jellyfin:${jellyfinContinuousSessionName(state, displayConfig)}`;
  }
  return `${user}:session:${playbackSessionKey(state)}`;
}

export function soundSessionContinuous(state: NowPlayingState, displayConfig: DisplayConfig) {
  if (state.source === "subsonic") return displayConfig.now_playing.sounds.continuous_sessions.subsonic;
  if (state.source === "spotify" || state.source === "apple_music" || state.source === "external_music") return displayConfig.now_playing.sounds.continuous_sessions.external_music;
  return Boolean(jellyfinContinuousSessionName(state, displayConfig));
}

function jellyfinContinuousSessionName(state: NowPlayingState, displayConfig: DisplayConfig) {
  if (state.source !== "jellyfin") return undefined;
  const continuousLibraries = normalizedNameSet(displayConfig.now_playing.sounds.continuous_sessions.jellyfin_libraries);
  if (state.libraryName && continuousLibraries.has(state.libraryName.toLowerCase())) return state.libraryName.toLowerCase();
  if (state.artwork?.mediaType?.toLowerCase() === "musicvideo") return !state.libraryName && continuousLibraries.has("music videos") ? "music videos" : undefined;
  if (jellyfinMusicLike(state) && continuousLibraries.has("music")) return "music";
  return undefined;
}

function jellyfinMusicLike(state: NowPlayingState) {
  const mediaType = state.artwork?.mediaType?.toLowerCase() ?? "";
  return Boolean(
    state.album
    || state.artist
    || state.albumArtUrl
    || mediaType === "audio"
    || mediaType === "musicartist"
  );
}

export function soundUserIdentity(state: NowPlayingState) {
  return `${state.source}:${state.user ?? state.displayUser ?? state.mediaWallUser ?? "unknown"}`;
}

function normalizedNameSet(names: string[]) {
  return new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean));
}

export function playbackSessionKey(state: NowPlayingState) {
  return [
    state.source,
    state.user,
    state.sessionKey,
    state.itemId,
    state.artistId,
    state.signature,
    state.title
  ].filter(Boolean).join(":");
}


import fs from "node:fs";
import path from "node:path";
import type { ArtworkRef, DisplayConfig, DisplayState, TransitionStyle } from "./types.js";

type StateFile = Record<string, DisplayState>;

const statePath = path.resolve(process.env.MEDIAWALL_STATE ?? "data/state.json");

function key(profile: string, display?: string) {
  return display ? `${profile}/${display}` : profile;
}

function ensureStateDir() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
}

function readAll(): StateFile {
  ensureStateDir();
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8")) as StateFile;
  } catch {
    return {};
  }
}

function writeAll(state: StateFile) {
  ensureStateDir();
  const tmp = `${statePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath);
}

export class StateStore {
  get(profile: string, display: string | undefined, config: DisplayConfig): DisplayState {
    const all = readAll();
    const existing = all[key(profile, display)];
    const existingMediaInfo = existing?.mediaInfo as typeof existing.mediaInfo & { series_episode?: boolean } | undefined;
    const libraryConfigSignature = configLibrarySignature(config.libraries);
    const shuffleLibraries = reconcileShuffleLibraries(existing?.shuffleLibraries, existing?.libraryConfigSignature, libraryConfigSignature, config.libraries);
    return {
      mode: existing?.mode ?? "now-playing",
      current: existing?.current,
      currentSequence: existing?.currentSequence,
      libraryIndexes: existing?.libraryIndexes ?? {},
      backdropIndexes: existing?.backdropIndexes ?? {},
      playing: existing?.playing ?? true,
      nowPlayingCyclePaused: existing?.nowPlayingCyclePaused ?? false,
      shuffle: existing?.shuffle ?? false,
      shuffleLibraries,
      libraryConfigSignature,
      showSongInfo: existing?.showSongInfo ?? true,
      mediaInfo: {
        movie: existingMediaInfo?.movie ?? true,
        music_album: existingMediaInfo?.music_album ?? true,
        music_song_title: existingMediaInfo?.music_song_title ?? true,
        series_episode_info: existingMediaInfo?.series_episode_info ?? existingMediaInfo?.series_episode ?? true,
        series_episode_title: existingMediaInfo?.series_episode_title ?? existingMediaInfo?.series_episode ?? true
      },
      shuffleQueue: existing?.shuffleQueue ?? [],
      shuffleQueueIndex: existing?.shuffleQueueIndex ?? 0,
      showAlbumArt: existing?.showAlbumArt ?? true,
      showLogo: existing?.showLogo ?? true,
      history: existing?.history ?? [],
      favorites: existing?.favorites ?? [],
      lastNowPlayingSignature: existing?.lastNowPlayingSignature,
      lastNowPlayingFallbackAt: existing?.lastNowPlayingFallbackAt,
      transitionIndex: existing?.transitionIndex ?? 0,
      transitionStyle: existing?.transitionStyle ?? config.display.transitions.styles[0]
    };
  }

  update(profile: string, display: string | undefined, config: DisplayConfig, patch: Partial<DisplayState>): DisplayState {
    const all = readAll();
    const current = this.get(profile, display, config);
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter((entry): entry is [string, NonNullable<unknown>] => entry[1] !== undefined)
    ) as Partial<DisplayState>;
    const next = { ...current, libraryConfigSignature: configLibrarySignature(config.libraries), ...cleanPatch };
    all[key(profile, display)] = next;
    writeAll(all);
    return next;
  }

  pushCurrent(
    profile: string,
    display: string | undefined,
    config: DisplayConfig,
    artwork: ArtworkRef,
    extra: Partial<DisplayState> = {}
  ): DisplayState {
    const state = this.get(profile, display, config);
    const history = state.current ? [state.current, ...state.history].slice(0, 30) : state.history;
    const transitionStyle = nextTransitionStyle(config, state);
    return this.update(profile, display, config, {
      current: artwork,
      history,
      transitionStyle,
      transitionIndex: state.transitionIndex + 1,
      ...extra
    });
  }

  advanceTransition(
    profile: string,
    display: string | undefined,
    config: DisplayConfig,
    extra: Partial<DisplayState> = {}
  ): DisplayState {
    const state = this.get(profile, display, config);
    const transitionStyle = nextTransitionStyle(config, state);
    return this.update(profile, display, config, {
      transitionStyle,
      transitionIndex: state.transitionIndex + 1,
      ...extra
    });
  }
}

function reconcileShuffleLibraries(existing: string[] | undefined, existingSignature: string | undefined, currentSignature: string, configured: string[]) {
  const configuredReal = configured.filter((name) => name.toLowerCase() !== "all");
  if (!existing || existingSignature !== currentSignature) return configuredReal;
  const allowed = new Set(configuredReal.map((name) => name.toLowerCase()));
  const existingReal = existing.filter((name) => name !== "Favorites");
  const favorites = existing.includes("Favorites") ? ["Favorites"] : [];
  const kept = existingReal.filter((name) => allowed.has(name.toLowerCase()));
  return [...favorites, ...kept];
}

function configLibrarySignature(libraries: string[]) {
  return libraries.map((name) => name.trim().toLowerCase()).sort().join("|");
}

function nextTransitionStyle(config: DisplayConfig, state: DisplayState) {
  const fallbackStyles: TransitionStyle[] = ["crossfade"];
  const styles = config.display.transitions.styles.length ? config.display.transitions.styles : fallbackStyles;
  if (config.display.transitions.order === "shuffle") {
    const next = styles[Math.floor(Math.random() * styles.length)] ?? "crossfade";
    if (styles.length < 2 || next !== state.transitionStyle) return next;
    return styles.find((style) => style !== state.transitionStyle) ?? next;
  }
  return styles[state.transitionIndex % styles.length] ?? "crossfade";
}

import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, findDisplay, themeNames } from "./config.js";
import { JellyfinClient, fallbackArtwork } from "./jellyfin.js";
import { NavidromeClient } from "./navidrome.js";
import { logger } from "./logger.js";
import { StateStore } from "./state.js";
import type { ArtworkRef, BackdropAnimation, DisplayConfig, DisplaySnapshot, NowPlayingState, PublicConnectionIssue, PublicControlCommand, PublicLibraryScanProgress, PublicNowPlayingState, PublicSoundSession, PublicUiIndicator } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");
const appRoot = path.resolve(__dirname, "../..");
const config = loadConfig();
const jellyfin = new JellyfinClient(config);
const navidrome = new NavidromeClient(config, jellyfin);
const states = new StateStore();
const app = express();
const favoritesShuffleLibrary = "Favorites";
const mediaWallFallbackModes = ["centered", "breathing", "float", "spotlight", "dvd", "minimal"] as const;
const mediaWallFallbackModeOptions = [...mediaWallFallbackModes, "All"] as const;
const backdropAnimations = ["breathe", "pan", "kenburns", "drift", "focus", "zoom"] as const;
const backdropAnimationOptions = [...backdropAnimations, "All"] as const;
type RecentPlaybackRecord = {
  firstSeenAt: number;
  seenAt: number;
  refreshedAt: number;
  activityAt: number;
  playbackPositionTicks?: number;
  progressConfirmed: boolean;
  stalledSince?: number;
  pausedSince?: number;
  active: boolean;
  heldForCycle?: boolean;
  state: NowPlayingState;
};
const recentPlayback = new Map<string, Map<string, RecentPlaybackRecord>>();
const recentPlaybackCycles = new Map<string, { selectedKey?: string; selectedAt: number; newestSeenAt: number }>();
const startupArtworkRefreshes = new Set<string>();
const startupFavoriteRefreshes = new Set<string>();
const libraryScanProgress = new Map<string, PublicLibraryScanProgress>();
const libraryScanClearTimers = new Map<string, NodeJS.Timeout>();
const connectionIssueCache = new Map<string, { checkedAt: number; issues: PublicConnectionIssue[] }>();
const connectionIssueFailures = new Map<string, number>();
const immichKioskStatusCache = new Map<string, { checkedAt: number; available: boolean; reason?: string }>();
type CollectionPresentation = Pick<NowPlayingState, "collectionName" | "collectionTransitionImage" | "collectionTransitionImageSize" | "soundTone">;
const collectionPresentationCache = new Map<string, {
  expiresAt: number;
  resolved?: CollectionPresentation | null;
  pending?: Promise<void>;
}>();
const controlCommands = new Map<string, PublicControlCommand>();
const uiIndicators = new Map<string, PublicUiIndicator>();
const lastLoggedPlaybackBySpace = new Map<string, string>();
type SpaceRuntime = {
  revision: number;
  startedAt: number;
  nextTransitionAt?: number;
  backdropIndex: number;
  shownUserTransitions: Set<string>;
  selectedSessionKey?: string;
  sessionBackdropIndexes: Map<string, number>;
  playbackPolls: number;
  playbackDetectionStartedAt: number;
  userTransitionEvent?: { id: string; sessionKey: string; startedAt: number; expiresAt: number };
};
const spaceRuntimes = new Map<string, SpaceRuntime>();
const shownRuntimeUserTransitions = new Set<string>();
const spaceSubscribers = new Map<string, Set<express.Response>>();
type CachedImageResult = {
  status: number;
  buffer?: Buffer;
  contentType?: string;
  cacheControl?: string;
  createdAt?: number;
};
type WallpaperLibraryGroup = {
  id: string;
  name: string;
  type: string;
  items: ArtworkRef[];
};

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  else {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});
app.use(express.json());
app.use((req, res, next) => {
  if (req.method === "POST" && req.path.startsWith("/api/space/")) {
    res.on("finish", () => {
      if (res.statusCode < 400) {
        const space = req.path.split("/")[3];
        if (space) {
          const runtime = spaceRuntime(space);
          const presentationAction = /\/(next|previous|up|down|playback-next|playback-previous|mode|toggle|select|shuffle)$/.test(req.path);
          if (presentationAction) {
            runtime.startedAt = Date.now();
            runtime.nextTransitionAt = undefined;
            runtime.backdropIndex = 0;
          }
          touchSpace(space);
        }
      }
    });
  }
  next();
});
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, jellyfinConfigured: jellyfin.configured(), navidromeConfigured: navidrome.configured() });
});

app.get("/api/pwa-manifest", (req, res) => {
  const requestedPath = normalizePwaPath(String(req.query.route ?? "/"));
  const launchUrl = normalizePwaLaunch(String(req.query.launch ?? requestedPath), requestedPath);
  const remote = requestedPath.endsWith("-remote");
  const icon = remote ? "/logos/remote.png" : "/logos/logo.png";
  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    id: `mediawall:${remote ? "remote" : "display"}:${requestedPath}`,
    name: remote ? "MediaWall Remote" : "MediaWall",
    short_name: remote ? "MW Remote" : "MediaWall",
    start_url: launchUrl,
    scope: "/",
    display: "standalone",
    orientation: remote ? "any" : "landscape",
    background_color: "#050508",
    theme_color: "#050508",
    icons: [{ src: icon, sizes: "1024x1024", type: "image/png", purpose: "any maskable" }]
  });
});

app.get("/api/space/:space/events", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const subscribers = spaceSubscribers.get(req.params.space) ?? new Set<express.Response>();
  subscribers.add(res);
  spaceSubscribers.set(req.params.space, subscribers);
  res.write(`event: sync\ndata: ${JSON.stringify({ revision: spaceRuntime(req.params.space).revision })}\n\n`);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    subscribers.delete(res);
    if (!subscribers.size) spaceSubscribers.delete(req.params.space);
  });
});

app.use(["/api/jellyfin", "/api/navidrome"], (req, res, next) => {
  if (mediaAssetAllowed(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "Space password required" });
});

app.get("/api/jellyfin/image/:itemId/:type", async (req, res) => {
  await handleImageProxy(req, res);
});

app.get("/api/jellyfin/image/:itemId/:type/:imageIndex", async (req, res) => {
  await handleImageProxy(req, res);
});

app.get("/api/jellyfin/user-image/:userId/Primary", async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const query = safeProxyQuery(req);
    const result = await cachedImage(
      `jellyfin-user:${userId}:Primary:${query}`,
      () => jellyfin.proxyUserImage(userId, query),
      { revalidateAfterMs: 60_000, cacheControl: "no-store", allowStaleOnError: false }
    );
    if (!result.buffer) {
      res.sendStatus(result.status);
      return;
    }
    sendImageResult(res, result);
  } catch (error) {
    logger.error("User image proxy failed", error);
    res.sendStatus(502);
  }
});

app.get("/api/navidrome/cover/:coverArtId", async (req, res) => {
  try {
    const coverArtId = String(req.params.coverArtId);
    const result = await cachedImage(`navidrome-cover:${coverArtId}`, () => navidrome.proxyCoverArt(coverArtId));
    if (!result.buffer) {
      res.sendStatus(result.status);
      return;
    }
    sendImageResult(res, result);
  } catch (error) {
    logger.error("Navidrome cover proxy failed", error);
    res.sendStatus(502);
  }
});

app.get("/api/navidrome/artist-image", async (req, res) => {
  const artistName = typeof req.query.artist === "string" ? req.query.artist : undefined;
  try {
    const imageUrl = String(req.query.url ?? "");
    const result = await cachedImage(
      `navidrome-artist:${imageUrl}`,
      () => navidrome.proxyArtistImage(imageUrl),
      { revalidateAfterMs: 60_000, cacheControl: "no-store", allowStaleOnError: false }
    );
    if (!result.buffer) {
      sendLocalArtistImage(artistName, res, result.status);
      return;
    }
    sendImageResult(res, result);
  } catch (error) {
    logger.error("Navidrome artist image proxy failed", error);
    sendLocalArtistImage(artistName, res, 502);
  }
});

app.get("/api/navidrome/local-artist/:artistName", (req, res) => {
  sendLocalArtistImage(String(req.params.artistName), res, 404);
});

app.get("/api/navidrome/local-artist/:artistName/:imageIndex", (req, res) => {
  sendLocalArtistImage(String(req.params.artistName), res, 404, Number(req.params.imageIndex));
});

app.get("/api/navidrome/local-artist-logo/:artistName", (req, res) => {
  sendLocalArtistLogo(String(req.params.artistName), res, 404);
});

async function handleImageProxy(req: express.Request, res: express.Response) {
  try {
    const itemId = String(req.params.itemId);
    const imageType = String(req.params.type);
    const imageIndex = req.params.imageIndex ? String(req.params.imageIndex) : undefined;
    const query = safeProxyQuery(req);
    const result = await cachedImage(
      `jellyfin:${itemId}:${imageType}:${imageIndex ?? 0}:${query}`,
      () => jellyfin.proxyImage(itemId, imageType, imageIndex, query),
      {
        revalidateAfterMs: imageType === "Backdrop" || imageType === "Logo" ? 0 : 60_000,
        cacheControl: "no-store",
        allowStaleOnError: imageType !== "Backdrop" && imageType !== "Logo"
      }
    );
    if (!result.buffer) {
      res.sendStatus(result.status);
      return;
    }
    sendImageResult(res, result);
  } catch (error) {
    logger.error("Image proxy failed", error);
    res.sendStatus(502);
  }
}

app.get("/api/space/:space/bootstrap", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const { displayConfig } = resolved;
  const state = states.get(req.params.space, undefined, displayConfig);
  const runtime = spaceRuntime(req.params.space);
  const now = Date.now();
  res.json({
    profile: "",
    display: req.params.space,
    config: publicDisplayConfig(displayConfig),
    state,
    mode: state.mode,
    playbackDetectionPending: state.mode === "now-playing",
    soundSessions: [],
    connectionIssues: [],
    activeMediaWallFallbackMode: state.activeMediaWallFallbackMode ?? firstMediaWallFallbackMode(displayConfig),
    presentation: {
      revision: runtime.revision,
      serverNow: now,
      startedAt: runtime.startedAt,
      nextTransitionAt: runtime.nextTransitionAt,
      backdropIndex: runtime.backdropIndex
    }
  } satisfies DisplaySnapshot);
});

app.get("/api/space/:space", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const { displayConfig } = resolved;
  const snapshot = await buildSnapshot(req.params.space, displayConfig);
  res.json(snapshot);
});

app.get("/api/space/:space/immich-kiosk/status", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const parentOrigin = `${req.protocol}://${req.get("host") ?? ""}`;
  res.json(await immichKioskStatus(resolved.displayConfig.now_playing.immich_kiosk.url, parentOrigin));
});

app.get("/api/space/:space/sounds", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  res.json({ sounds: listSoundFiles(resolved.displayConfig) });
});

app.get("/api/space/:space/sounds/:tone", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const soundPath = resolveSoundPath(resolved.displayConfig, req.params.tone);
  if (!soundPath) {
    res.sendStatus(404);
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.sendFile(soundPath);
});

app.get("/api/space/:space/custom-logo", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const imagePath = resolveCustomLogoPath(resolved.displayConfig);
  if (!imagePath) {
    res.sendStatus(404);
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=60");
  res.sendFile(imagePath);
});

app.get("/api/space/:space/collections/:file", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const imagePath = resolveCollectionImagePath(req.params.file);
  if (!imagePath) {
    res.sendStatus(404);
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=60");
  res.sendFile(imagePath);
});

app.post("/api/space/:space/command", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  if (!isLocalRequest(req)) {
    res.status(403).json({ error: "Display commands are only available from the local container or host." });
    return;
  }
  const command = await controlCommandFromRequest(req.body, resolved.displayConfig);
  if (!command.ok) {
    res.status(400).json({ error: command.error });
    return;
  }
  controlCommands.set(req.params.space, command.command);
  res.json({ ok: true, command: command.command });
});

app.post("/api/space/:space/indicator", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const kind = String(req.body?.kind ?? "");
  if (!isUiIndicatorKind(kind)) {
    res.status(400).json({ error: "Invalid indicator kind" });
    return;
  }
  const indicator: PublicUiIndicator = {
    id: crypto.randomUUID(),
    kind,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5000
  };
  uiIndicators.set(req.params.space, indicator);
  res.json({ ok: true, indicator });
});

app.get("/api/spaces", (_req, res) => {
  res.json({ spaces: Object.keys(config.spaces).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })) });
});

app.post("/api/space/:space/next", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const currentState = states.get(req.params.space, undefined, resolved.displayConfig);
  const sequenced = !currentState.shuffle ? nextSequenceArtwork(currentState) : undefined;
  const sequencedSelected = sequenced
    ? await resolveFreshBackdropPolicy(sequenced.artwork, resolved.displayConfig, currentState, false)
    : undefined;
  const shuffled = currentState.shuffle ? await shuffleSelection(resolved.displayConfig, currentState) : undefined;
  const ordered = !currentState.shuffle && !sequencedSelected ? await orderedWallpaperSelection(resolved.displayConfig, currentState) : undefined;
  const random = currentState.shuffle && !shuffled ? await jellyfin.randomArtwork(shuffleDisplayConfig(resolved.displayConfig, currentState)) : undefined;
  const selected = sequencedSelected
    ? { ...sequencedSelected, patch: { ...sequenced?.patch, ...sequencePatchWithArtwork(sequenced?.patch, sequencedSelected.artwork), ...sequencedSelected.patch } }
    : ordered ?? shuffled ?? resolveBackdropPolicy(random ?? fallbackArtwork(), resolved.displayConfig, currentState, false);
  const updatedState = states.pushCurrent(req.params.space, undefined, resolved.displayConfig, selected.artwork, {
    ...selected.patch
  });
  res.json({ state: updatedState });
});

app.post("/api/space/:space/previous", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const state = states.get(req.params.space, undefined, resolved.displayConfig);
  const shuffled = state.shuffle ? await previousShuffleSelection(resolved.displayConfig, state) : undefined;
  const sequenced = !state.shuffle ? previousSequenceArtwork(state) : undefined;
  const sequencedSelected = sequenced
    ? await resolveFreshBackdropPolicy(sequenced.artwork, resolved.displayConfig, state, false)
    : undefined;
  const ordered = !state.shuffle && !sequencedSelected ? await previousWallpaperSelection(resolved.displayConfig, state) : undefined;
  const navigation = shuffled ?? (sequencedSelected ? {
    ...sequencedSelected,
    patch: { ...sequenced?.patch, ...sequencePatchWithArtwork(sequenced?.patch, sequencedSelected.artwork), ...sequencedSelected.patch }
  } : undefined) ?? ordered;
  if (navigation) {
    const selected = navigation;
    const updatedState = states.pushCurrent(req.params.space, undefined, resolved.displayConfig, selected.artwork, {
      ...selected.patch
    });
    res.json({ state: updatedState });
    return;
  }
  const [previous, ...rest] = state.history;
  if (!previous) {
    res.json({ state });
    return;
  }
  const selected = await resolveFreshBackdropPolicy(previous, resolved.displayConfig, state, false);
  if (!selected) {
    res.json({ state: states.update(req.params.space, undefined, resolved.displayConfig, { history: rest }) });
    return;
  }
  const next = states.update(req.params.space, undefined, resolved.displayConfig, {
    current: selected.artwork,
    history: state.current ? [state.current, ...rest].slice(0, 30) : rest,
    ...selected.patch
  });
  res.json({ state: next });
});

app.post("/api/space/:space/up", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const state = states.get(req.params.space, undefined, resolved.displayConfig);
  const selected = state.shuffle ? undefined : await librarySwitchSelection(resolved.displayConfig, state, -1);
  if (!selected) {
    res.json({ state });
    return;
  }
  res.json({
    state: states.pushCurrent(req.params.space, undefined, resolved.displayConfig, selected.artwork, selected.patch),
    libraryName: selected.libraryName
  });
});

app.post("/api/space/:space/down", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const state = states.get(req.params.space, undefined, resolved.displayConfig);
  const selected = state.shuffle ? undefined : await librarySwitchSelection(resolved.displayConfig, state, 1);
  if (!selected) {
    res.json({ state });
    return;
  }
  res.json({
    state: states.pushCurrent(req.params.space, undefined, resolved.displayConfig, selected.artwork, selected.patch),
    libraryName: selected.libraryName
  });
});

app.post("/api/space/:space/playback-previous", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const state = states.get(req.params.space, undefined, resolved.displayConfig);
  const selected = await activePlayback(req.params.space, resolved.displayConfig, state, -1);
  if (!selected) {
    res.json({ state });
    return;
  }
  res.json({
    state: states.advanceTransition(req.params.space, undefined, resolved.displayConfig),
    nowPlaying: publicNowPlaying(selected),
    sessionPosition: selected.sessionPosition,
    sessionCount: selected.sessionCount
  });
});

app.post("/api/space/:space/playback-next", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const state = states.get(req.params.space, undefined, resolved.displayConfig);
  const selected = await activePlayback(req.params.space, resolved.displayConfig, state, 1);
  if (!selected) {
    res.json({ state });
    return;
  }
  res.json({
    state: states.advanceTransition(req.params.space, undefined, resolved.displayConfig),
    nowPlaying: publicNowPlaying(selected),
    sessionPosition: selected.sessionPosition,
    sessionCount: selected.sessionCount
  });
});

app.post("/api/space/:space/playback-toggle", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const state = states.get(req.params.space, undefined, resolved.displayConfig);
  res.json({ state: states.update(req.params.space, undefined, resolved.displayConfig, { nowPlayingCyclePaused: !state.nowPlayingCyclePaused }) });
});

app.post("/api/space/:space/toggle", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const state = states.get(req.params.space, undefined, resolved.displayConfig);
  res.json({ state: states.update(req.params.space, undefined, resolved.displayConfig, { playing: !state.playing }) });
});

app.post("/api/space/:space/mode", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const state = states.get(req.params.space, undefined, resolved.displayConfig);
  const requestedMode = req.body.mode;
  const mode = requestedMode === "screensaver"
    ? "screensaver"
    : requestedMode === "immich-kiosk" && parseHttpUrl(resolved.displayConfig.now_playing.immich_kiosk.url)
      ? "immich-kiosk"
      : "now-playing";
  const resetPatch: Partial<typeof state> = {
    mode,
    currentSequence: emptyArtworkSequence(),
    shuffleQueue: [],
    shuffleQueueIndex: 0
  };
  if (mode === "now-playing" && state.mode !== "now-playing") {
    const runtime = spaceRuntime(req.params.space);
    runtime.playbackPolls = 0;
    runtime.playbackDetectionStartedAt = Date.now();
  }

  if (mode === "screensaver" && state.playing) {
    const selectionState = { ...state, ...resetPatch };
    const selected = state.shuffle
      ? await shuffleSelection(resolved.displayConfig, selectionState)
      : await orderedWallpaperSelection(resolved.displayConfig, selectionState);
    if (selected) {
      res.json({
        state: states.pushCurrent(req.params.space, undefined, resolved.displayConfig, selected.artwork, {
          ...resetPatch,
          ...selected.patch
        })
      });
      return;
    }
  }

  res.json({ state: states.update(req.params.space, undefined, resolved.displayConfig, resetPatch) });
});

app.post("/api/space/:space/shuffle", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const state = states.get(req.params.space, undefined, resolved.displayConfig);
  const requestedEnabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : !state.shuffle;
  const savingSelection = Array.isArray(req.body?.libraries);
  const requestedLibraries = Array.isArray(req.body?.libraries)
    ? req.body.libraries.filter((library: unknown): library is string => typeof library === "string" && library.trim().length > 0)
    : state.shuffleLibraries;
  const preserveCurrent = req.body?.preserveCurrent === true;
  const patch: Partial<typeof state> = {
    shuffle: requestedEnabled,
    shuffleLibraries: requestedLibraries,
    ...(savingSelection ? { currentSequence: emptyArtworkSequence(), shuffleQueue: [], shuffleQueueIndex: 0 } : {}),
    ...(state.shuffle !== requestedEnabled ? { shuffleQueue: [], shuffleQueueIndex: 0 } : {})
  };
  if (savingSelection) {
    const nextState = { ...state, ...patch };
    const selected = preserveCurrent && await currentSatisfiesWallpaperSelection(resolved.displayConfig, nextState)
      ? undefined
      : await firstWallpaperSelection(resolved.displayConfig, nextState);
    if (selected) {
      patch.current = selected.artwork;
      patch.currentSequence = selected.patch.currentSequence;
      patch.backdropIndexes = selected.patch.backdropIndexes;
      patch.mode = "screensaver";
    }
  } else if (requestedEnabled) {
    const selected = await shuffleSelection(resolved.displayConfig, { ...state, ...patch });
    if (selected) {
      patch.current = selected.artwork;
      patch.backdropIndexes = selected.patch.backdropIndexes;
    }
  }
  res.json({
    state: states.update(req.params.space, undefined, resolved.displayConfig, patch)
  });
});

app.post("/api/space/:space/preferences", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const mediaInfo = normalizeMediaInfoPrefs(req.body.mediaInfo);
  const patch = {
    showSongInfo: mediaInfo
      ? Object.values(mediaInfo).some(Boolean)
      : typeof req.body.showSongInfo === "boolean" ? req.body.showSongInfo : undefined,
    mediaInfo,
    showAlbumArt: typeof req.body.showAlbumArt === "boolean" ? req.body.showAlbumArt : undefined,
    showLogo: typeof req.body.showLogo === "boolean" ? req.body.showLogo : undefined
  };
  res.json({ state: states.update(req.params.space, undefined, resolved.displayConfig, patch) });
});

app.post("/api/space/:space/theme", (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  if (resolved.displayConfig.theme !== "All") {
    res.status(409).json({ error: "This space uses a fixed theme." });
    return;
  }
  const theme = String(req.body.theme ?? "");
  if (!themeNames.includes(theme as (typeof themeNames)[number])) {
    res.status(400).json({ error: "Unknown theme." });
    return;
  }
  res.json({ state: states.update(req.params.space, undefined, resolved.displayConfig, { activeTheme: theme }) });
});

function normalizeMediaInfoPrefs(value: unknown): DisplaySnapshot["state"]["mediaInfo"] | undefined {
  if (!isMediaInfoPrefs(value)) return undefined;
  const item = value as DisplaySnapshot["state"]["mediaInfo"] & { series_episode?: boolean };
  return {
    movie: item.movie,
    music_album: item.music_album,
    music_song_title: item.music_song_title,
    series_episode_info: item.series_episode_info ?? item.series_episode ?? false,
    series_episode_title: item.series_episode_title ?? item.series_episode ?? false
  };
}

app.post("/api/space/:space/favorite", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const state = states.get(req.params.space, undefined, resolved.displayConfig);
  const artworks = Array.isArray(req.body.artworks)
    ? req.body.artworks.filter(isArtworkRef)
    : undefined;
  const artwork = (req.body.artwork ?? state.current) as ArtworkRef | undefined;
  const replaceItem = typeof req.body.replaceItem === "string" ? req.body.replaceItem : undefined;
  if (artworks || replaceItem) {
    const existingFavorites = replaceItem
      ? state.favorites.filter((favorite) => backdropPolicyKey(favorite) !== replaceItem)
      : state.favorites;
    const favoriteMap = new Map(existingFavorites.map((favorite) => [artworkKey(favorite), favorite]));
    for (const entry of await normalizeFavoriteArtworks(artworks ?? [])) favoriteMap.set(artworkKey(entry), entry);
    res.json({ state: states.update(req.params.space, undefined, resolved.displayConfig, { favorites: [...favoriteMap.values()].slice(0, 200) }) });
    return;
  }
  if (!artwork) {
    res.status(400).json({ error: "No artwork selected" });
    return;
  }
  const normalized = await normalizeFavoriteArtwork(artwork);
  if (!normalized?.backdropUrl) {
    res.status(400).json({ error: "Selected artwork no longer has an available backdrop" });
    return;
  }
  const id = artworkKey(normalized);
  const exists = state.favorites.some((favorite) => artworkKey(favorite) === id);
  const favorites = exists
    ? state.favorites.filter((favorite) => artworkKey(favorite) !== id)
    : [normalized, ...state.favorites].slice(0, 200);
  res.json({ state: states.update(req.params.space, undefined, resolved.displayConfig, { favorites }) });
});

app.post("/api/space/:space/select", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const artwork = req.body.artwork as ArtworkRef | undefined;
  const itemId = req.body.itemId as string | undefined;
  const imageIndex = Number(req.body.imageIndex ?? 0);
  const rawSelected = artwork ?? (itemId ? await jellyfin.artworkForItem(itemId, imageIndex) : undefined);
  const selected = rawSelected ? await refreshArtwork(rawSelected).catch(() => undefined) : undefined;
  if (!selected?.backdropUrl || !artworkAllowedForWallpaper(selected, resolved.displayConfig)) {
    res.status(400).json({ error: "Unable to resolve selected artwork" });
    return;
  }
  const currentState = states.get(req.params.space, undefined, resolved.displayConfig);
  const sequence = await selectionSequenceForRequest(req.body, resolved.displayConfig, currentState, selected);
  const exactBackdrop = req.body.exactBackdrop === true;
  const displaySelected = resolveBackdropPolicy(selected, resolved.displayConfig, currentState, exactBackdrop);
  const index = sequenceArtworkIndex(sequence.items, displaySelected.artwork);
  logger.info(`Grid selection on /${req.params.space}: ${displaySelected.artwork.source} ${displaySelected.artwork.mediaType} "${displaySelected.artwork.title}"`);
  res.json({
    state: states.pushCurrent(req.params.space, undefined, resolved.displayConfig, displaySelected.artwork, {
      mode: "screensaver",
      currentSequence: {
        libraryId: sequence.libraryId,
        items: sequence.items,
        index: index >= 0 ? index : sequence.index
      },
      ...displaySelected.patch
    })
  });
});

app.get("/api/space/:space/libraries", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  res.json({ libraries: await browseLibraries(resolved.displayConfig) });
});

app.get("/api/space/:space/libraries/:libraryId/items", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  res.json({
    items: (await browseItems(
      resolved.displayConfig,
      req.params.libraryId,
      String(req.query.type ?? "")
    )).filter((item) => item.artwork && artworkAllowedForWallpaper(item.artwork, resolved.displayConfig))
  });
});

app.get("/api/space/:space/items/:itemId/backdrops", async (req, res) => {
  const resolved = resolveDisplay(req.params.space, undefined, res, req.query.password);
  if (!resolved) return;
  const source = String(req.query.source ?? "jellyfin");
  if (source === "navidrome") {
    res.json({ backdrops: navidrome.localArtistArtworks(String(req.query.title ?? req.params.itemId)) });
    return;
  }
  const item = await jellyfin.artworkForItem(req.params.itemId);
  const count = item?.backdropCount ?? 0;
  const backdrops = Array.from({ length: count }, (_, imageIndex) => ({
    ...item,
    imageIndex,
    imageType: "Backdrop",
    backdropUrl: jellyfin.imageUrl(req.params.itemId, "Backdrop", imageIndex, item?.backdropTags?.[imageIndex]),
    thumbUrl: jellyfin.imageUrl(req.params.itemId, "Backdrop", imageIndex, item?.backdropTags?.[imageIndex])
  }));
  res.json({ backdrops });
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

async function buildSnapshot(space: string, displayConfig: DisplayConfig): Promise<DisplaySnapshot> {
  let state = states.get(space, undefined, displayConfig);
  const runtime = spaceRuntime(space);
  const now = Date.now();
  if (state.mode === "screensaver" && state.playing) {
    const intervalMs = Math.max(1, displayConfig.display.cycle_interval_seconds) * 1000;
    runtime.nextTransitionAt ??= now + intervalMs;
    const backdropCount = state.current?.backdropCount ?? 1;
    runtime.backdropIndex = displayConfig.display.multiple_backdrops.mode === "cycle" && backdropCount > 1
      ? Math.min(backdropCount - 1, Math.floor(((now - runtime.startedAt) / intervalMs) * backdropCount))
      : runtime.backdropIndex;
    if (now >= runtime.nextTransitionAt) {
      const selected = state.shuffle
        ? await shuffleSelection(displayConfig, state)
        : await orderedWallpaperSelection(displayConfig, state);
      if (selected) {
        state = states.pushCurrent(space, undefined, displayConfig, selected.artwork, selected.patch);
        runtime.startedAt = now;
        runtime.nextTransitionAt = now + intervalMs;
        runtime.backdropIndex = 0;
        touchSpace(space);
      }
    }
  } else if (state.mode !== "screensaver" || !state.playing) {
    runtime.nextTransitionAt = undefined;
  }
  const connectionIssues = await enabledConnectionIssues(displayConfig);
  const controlCommand = activeControlCommand(space);
  if (!startupFavoriteRefreshes.has(space)) {
    startupFavoriteRefreshes.add(space);
    const refreshedFavorites = await normalizeFavoriteArtworks(state.favorites);
    if (favoritesChanged(state.favorites, refreshedFavorites)) {
      state = states.update(space, undefined, displayConfig, { favorites: refreshedFavorites });
      logger.info(`Startup favorite refresh: /${space} normalized ${refreshedFavorites.length} favorites`);
    }
  }
  const useMediaWallFallback = state.mode === "now-playing" && displayConfig.now_playing.fallback === "mediawall";
  if (
    !useMediaWallFallback
    && state.mode === "screensaver"
    && (state.current?.source === "jellyfin" || state.current?.source === "navidrome")
    && !startupArtworkRefreshes.has(space)
  ) {
    startupArtworkRefreshes.add(space);
    let refreshFailed = false;
    const refreshed = await refreshArtwork(state.current).catch((error) => {
      refreshFailed = true;
      logger.warn(`Startup artwork refresh unavailable for /${space}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    });
    if (refreshed) {
      const selected = resolveBackdropPolicy(refreshed, displayConfig, state, true);
      state = states.update(space, undefined, displayConfig, {
        current: selected.artwork,
        currentSequence: undefined,
        ...selected.patch
      });
      logger.info(`Startup artwork refresh: /${space} refreshed "${selected.artwork.title}"`);
    } else if (refreshFailed) {
      state = states.update(space, undefined, displayConfig, {
        current: fallbackArtwork(),
        currentSequence: { libraryId: "", items: [], index: 0 }
      });
    }
  }
  if (!useMediaWallFallback && (!state.current || state.current.source === "fallback")) {
    const initial = state.mode === "screensaver" && !state.shuffle
      ? await orderedWallpaperSelection(displayConfig, state).catch((error) => {
        logger.error("Initial ordered artwork lookup failed", error);
        return undefined;
      })
      : undefined;
    const random = initial ? undefined : await jellyfin.randomArtwork(shuffleDisplayConfig(displayConfig, state)).catch((error) => {
      logger.error("Initial artwork lookup failed", error);
      return undefined;
    });
    if (initial) {
      state = states.update(space, undefined, displayConfig, { current: initial.artwork, ...initial.patch });
    } else if (random && random.source !== "fallback") {
      const selected = resolveBackdropPolicy(random, displayConfig, state, false);
      state = states.update(space, undefined, displayConfig, { current: selected.artwork, ...selected.patch });
    } else if (!state.current) {
      state = states.update(space, undefined, displayConfig, { current: fallbackArtwork() });
    }
  }

  if (!useMediaWallFallback && state.mode === "screensaver" && state.current && !artworkAllowedForWallpaper(state.current, displayConfig)) {
    const selected = state.shuffle
      ? await shuffleSelection(displayConfig, state).catch((error) => {
        logger.error(`Logo-required shuffle lookup failed for /${space}`, error);
        return undefined;
      })
      : await orderedWallpaperSelection(displayConfig, state).catch((error) => {
        logger.error(`Logo-required ordered lookup failed for /${space}`, error);
        return undefined;
      });
    state = states.update(space, undefined, displayConfig, {
      current: selected?.artwork ?? fallbackArtwork(),
      currentSequence: selected?.patch.currentSequence,
      backdropIndexes: selected?.patch.backdropIndexes ?? state.backdropIndexes
    });
  }

  const playbackDetails = state.mode === "now-playing"
    ? await activePlaybackDetails(space, displayConfig, state).catch((error) => {
      logger.error("Playback poll failed", error);
      return undefined;
    })
    : undefined;
  let nowPlaying = playbackDetails?.selected;
  const playbackDetectionPending = playbackDetails?.detectionPending === true;
  let activeMediaWallFallbackMode = state.activeMediaWallFallbackMode ?? firstMediaWallFallbackMode(displayConfig);

  if (!nowPlaying?.playing && state.mode === "now-playing" && displayConfig.now_playing.fallback === "mediawall" && state.current?.source !== "fallback") {
    state = states.update(space, undefined, displayConfig, { current: fallbackArtwork() });
  }

  if (state.mode === "now-playing" && displayConfig.now_playing.fallback === "mediawall") {
    if (nowPlaying?.playing) {
      if (!state.lastNowPlayingHadSession) {
        state = states.update(space, undefined, displayConfig, { lastNowPlayingHadSession: true });
      }
    } else {
      const selectedFallback = mediaWallFallbackForIdleRound(displayConfig, state, state.lastNowPlayingHadSession === true);
      activeMediaWallFallbackMode = selectedFallback.mode;
      if (
        state.lastNowPlayingHadSession
        || state.mediaWallFallbackIndex !== selectedFallback.index
        || state.activeMediaWallFallbackMode !== selectedFallback.mode
      ) {
        state = states.update(space, undefined, displayConfig, {
          lastNowPlayingHadSession: false,
          mediaWallFallbackIndex: selectedFallback.index,
          activeMediaWallFallbackMode: selectedFallback.mode
        });
      }
    }
  }

  if (!nowPlaying?.playing && state.mode === "now-playing" && displayConfig.now_playing.fallback === "shuffle") {
    const fallbackConfig = { ...displayConfig, libraries: state.shuffleLibraries.length ? state.shuffleLibraries : displayConfig.libraries };
    const intervalMs = Math.max(1, displayConfig.now_playing.fallback_shuffle_interval_seconds) * 1000;
    const due = !state.current || !state.lastNowPlayingFallbackAt || Date.now() - state.lastNowPlayingFallbackAt >= intervalMs;
    if (state.playing && due) {
      const selected = await shuffleSelection(fallbackConfig, state).catch((error) => {
        logger.error(`Now playing fallback shuffle failed for /${space}`, error);
        return undefined;
      });
      if (selected && artworkKey(selected.artwork) !== (state.current ? artworkKey(state.current) : "")) {
        state = states.pushCurrent(space, undefined, displayConfig, selected.artwork, { lastNowPlayingFallbackAt: Date.now(), ...selected.patch });
      } else {
        state = states.update(space, undefined, displayConfig, { lastNowPlayingFallbackAt: Date.now() });
      }
    }
  }

  const mode = state.mode;
  if (mode === "now-playing" && nowPlaying?.signature && state.lastNowPlayingSignature !== nowPlaying.signature) {
    state = states.advanceTransition(space, undefined, displayConfig, { lastNowPlayingSignature: nowPlaying.signature });
  }

  if (mode === "now-playing" && nowPlaying?.playing) {
    const sessionKey = nowPlaying.publicSoundSessionKey ?? nowPlaying.publicSessionId;
    if (sessionKey) {
      const firstSelection = !runtime.selectedSessionKey;
      const selectedChanged = Boolean(runtime.selectedSessionKey && runtime.selectedSessionKey !== sessionKey);
      if (selectedChanged && (nowPlaying.sessionCount ?? 0) > 1) {
        runtime.sessionBackdropIndexes.set(sessionKey, (runtime.sessionBackdropIndexes.get(sessionKey) ?? -1) + 1);
      }
      runtime.selectedSessionKey = sessionKey;
      const playbackCycle = recentPlaybackCycles.get(space);
      runtime.startedAt = playbackCycle?.selectedAt ?? (firstSelection || selectedChanged ? now : runtime.startedAt);
      runtime.nextTransitionAt = state.nowPlayingCyclePaused || (nowPlaying.sessionCount ?? 0) < 2
        ? undefined
        : runtime.startedAt + Math.max(1, displayConfig.now_playing.cycle_interval_seconds) * 1000;
      runtime.backdropIndex = (nowPlaying.sessionCount ?? 0) > 1
        ? runtime.sessionBackdropIndexes.get(sessionKey) ?? 0
        : Math.floor((now - runtime.startedAt) / (Math.max(1, displayConfig.now_playing.multiple_backdrops.interval_seconds) * 1000));
      if (selectedChanged) touchSpace(space);
    }
    if (sessionKey && !shownRuntimeUserTransitions.has(sessionKey)) {
      shownRuntimeUserTransitions.add(sessionKey);
      runtime.shownUserTransitions.add(sessionKey);
      const duration = Math.max(0.5, displayConfig.now_playing.user_transition.duration_seconds) * 1000;
      runtime.userTransitionEvent = {
        id: crypto.randomUUID(),
        sessionKey,
        startedAt: now,
        expiresAt: now + duration
      };
      touchSpace(space);
    }
  }
  if (runtime.userTransitionEvent && runtime.userTransitionEvent.expiresAt <= now) {
    runtime.userTransitionEvent = undefined;
  }

  return {
    profile: "",
    display: space,
    config: publicDisplayConfig(displayConfig),
    state,
    mode,
    nowPlaying: nowPlaying ? publicNowPlaying(nowPlaying) : undefined,
    playbackDetectionPending,
    soundSessions: playbackDetails?.soundSessions ?? [],
    libraryScan: libraryScanProgress.get(space),
    connectionIssues,
    controlCommand,
    uiIndicator: activeUiIndicator(space),
    activeMediaWallFallbackMode: controlCommand?.type === "mediawall" ? controlCommand.mode : activeMediaWallFallbackMode,
    presentation: {
      revision: runtime.revision,
      serverNow: now,
      startedAt: runtime.startedAt,
      nextTransitionAt: runtime.nextTransitionAt,
      backdropIndex: runtime.backdropIndex
    },
    userTransitionEvent: runtime.userTransitionEvent
  };
}

function spaceRuntime(space: string): SpaceRuntime {
  const existing = spaceRuntimes.get(space);
  if (existing) return existing;
  const created: SpaceRuntime = {
    revision: 1,
    startedAt: Date.now(),
    backdropIndex: 0,
    shownUserTransitions: new Set(),
    sessionBackdropIndexes: new Map(),
    playbackPolls: 0,
    playbackDetectionStartedAt: Date.now()
  };
  spaceRuntimes.set(space, created);
  return created;
}

function normalizePwaPath(input: string) {
  try {
    const url = new URL(input, "http://mediawall.local");
    const pathname = `/${url.pathname.split("/").filter(Boolean).join("/")}`;
    return pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  } catch {
    return "/";
  }
}

function normalizePwaLaunch(input: string, fallbackPath: string) {
  try {
    const url = new URL(input, "http://mediawall.local");
    if (normalizePwaPath(url.pathname) !== fallbackPath) return fallbackPath;
    return `${fallbackPath}${url.search}`;
  } catch {
    return fallbackPath;
  }
}

function touchSpace(space: string) {
  const runtime = spaceRuntime(space);
  runtime.revision += 1;
  for (const response of spaceSubscribers.get(space) ?? []) {
    response.write(`event: sync\ndata: ${JSON.stringify({ revision: runtime.revision })}\n\n`);
  }
}

function activeUiIndicator(space: string) {
  const indicator = uiIndicators.get(space);
  if (!indicator) return undefined;
  if (indicator.expiresAt <= Date.now()) {
    uiIndicators.delete(space);
    return undefined;
  }
  return indicator;
}

function isUiIndicatorKind(value: string): value is PublicUiIndicator["kind"] {
  return [
    "sound-on",
    "sound-off",
    "favorite",
    "unfavorite",
    "shuffle-on",
    "shuffle-off",
    "play",
    "pause",
    "mode-now-playing",
    "mode-screensaver"
  ].includes(value);
}

function publicDisplayConfig(displayConfig: DisplayConfig): DisplaySnapshot["config"] {
  const { password: _password, users, ...safeConfig } = displayConfig;
  const { directory: _directory, ...safeSounds } = safeConfig.now_playing.sounds;
  return {
    ...safeConfig,
    now_playing: {
      ...safeConfig.now_playing,
      sounds: {
        ...safeSounds,
        available: listSoundFiles(displayConfig)
      }
    },
    users: users.map((user) => ({ name: user.name, sound: user.sound }))
  };
}

function activeControlCommand(space: string) {
  const command = controlCommands.get(space);
  if (!command) return undefined;
  if (command.expiresAt <= Date.now()) {
    controlCommands.delete(space);
    return undefined;
  }
  return command;
}

function resolveCustomLogoPath(displayConfig: DisplayConfig) {
  const directory = resolveCustomLogoDirectory(displayConfig);
  if (!fs.existsSync(directory)) return undefined;
  const files = fs.readdirSync(directory)
    .filter((filename) => /\.(?:png|svg)$/i.test(filename))
    .sort((left, right) => left.localeCompare(right));
  const first = files[0];
  if (!first) return undefined;
  const candidate = path.resolve(directory, first);
  if (!candidate.startsWith(`${directory}${path.sep}`)) return undefined;
  return candidate;
}

function resolveCustomLogoDirectory(displayConfig: DisplayConfig) {
  const configured = displayConfig.now_playing.custom_logo.directory || "/app/custom_logo";
  if (configured === "/app/custom_logo") return path.resolve(appRoot, "app/custom_logo");
  return path.resolve(configured);
}

function resolveCollectionImagePath(filename: string | undefined) {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("\0")) return undefined;
  const mountedDirectory = path.resolve("/app/collections");
  const bundledDirectory = path.resolve(appRoot, "app/collections");
  const directory = fs.existsSync(mountedDirectory) ? mountedDirectory : bundledDirectory;
  const candidate = path.resolve(directory, filename);
  if (!candidate.startsWith(`${directory}${path.sep}`)) return undefined;
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return undefined;
  if (!/\.(?:png|jpe?g|webp|gif|svg)$/i.test(candidate)) return undefined;
  return candidate;
}

function collectionImageUrl(space: string, filename: string) {
  return `/api/space/${encodeURIComponent(space)}/collections/${encodeURIComponent(filename)}`;
}

function mediaWallFallbackForIdleRound(displayConfig: DisplayConfig, state: DisplaySnapshot["state"], advance: boolean) {
  const modes = expandedMediaWallFallbackModes(displayConfig);
  const currentIndex = Math.max(0, state.mediaWallFallbackIndex ?? 0) % modes.length;
  const index = advance ? (currentIndex + 1) % modes.length : currentIndex;
  return { index, mode: modes[index] ?? firstMediaWallFallbackMode(displayConfig) };
}

function expandedMediaWallFallbackModes(displayConfig: DisplayConfig) {
  const configured = displayConfig.now_playing.mediawall_fallback.modes;
  const baseMode = firstMediaWallFallbackMode(displayConfig);
  const allModes = [baseMode, ...mediaWallFallbackModes.filter((mode) => mode !== baseMode)];
  if (!configured.length || configured.some((mode) => mode.toLowerCase() === "all")) return allModes;
  const modes = configured.filter((mode): mode is typeof mediaWallFallbackModes[number] =>
    mediaWallFallbackModes.includes(mode as typeof mediaWallFallbackModes[number])
  );
  return modes.length ? modes : allModes;
}

function firstMediaWallFallbackMode(displayConfig: DisplayConfig) {
  const mode = displayConfig.now_playing.mediawall_fallback.modes.find((candidate) => candidate !== "All");
  return mediaWallFallbackModes.includes(mode as typeof mediaWallFallbackModes[number])
    ? mode as typeof mediaWallFallbackModes[number]
    : "dvd";
}

async function enabledConnectionIssues(displayConfig: DisplayConfig): Promise<PublicConnectionIssue[]> {
  const now = Date.now();
  const cacheKey = [
    displayConfig.playback_source,
    jellyfin.configured() ? "jellyfin-configured" : "jellyfin-missing",
    config.navidrome.enabled ? "navidrome-enabled" : "navidrome-disabled",
    navidrome.configured() ? "navidrome-configured" : "navidrome-missing"
  ].join(":");
  const cached = connectionIssueCache.get(cacheKey);
  if (cached && now - cached.checkedAt < 15_000) return cached.issues;
  const issues: PublicConnectionIssue[] = [];
  if (displayConfig.playback_source === "jellyfin" || displayConfig.playback_source === "both") {
    if (!jellyfin.configured()) {
      issues.push({ source: "jellyfin", message: "Jellyfin is not configured." });
    } else {
      try {
        await jellyfin.reachable();
        noteConnectionSuccess("jellyfin");
      } catch {
        if (noteConnectionFailure("jellyfin") >= 2) {
          issues.push({ source: "jellyfin", message: "Jellyfin is not connecting." });
        }
      }
    }
  }
  if ((displayConfig.playback_source === "navidrome" || displayConfig.playback_source === "both") && config.navidrome.enabled) {
    try {
      await navidrome.reachable();
      noteConnectionSuccess("navidrome");
    } catch {
      if (noteConnectionFailure("navidrome") >= 2) {
        issues.push({ source: "navidrome", message: "Navidrome is not connecting." });
      }
    }
  }
  connectionIssueCache.set(cacheKey, { checkedAt: now, issues });
  return issues;
}

function noteConnectionFailure(source: "jellyfin" | "navidrome") {
  const count = (connectionIssueFailures.get(source) ?? 0) + 1;
  connectionIssueFailures.set(source, count);
  return count;
}

function noteConnectionSuccess(source: "jellyfin" | "navidrome") {
  connectionIssueFailures.delete(source);
}

async function immichKioskStatus(configuredUrl: string, parentOrigin: string) {
  const target = parseHttpUrl(configuredUrl);
  if (!target) return { available: false, reason: configuredUrl ? "invalid_url" : "missing_url" };
  const cacheKey = `${parentOrigin}|${target.toString()}`;
  const cached = immichKioskStatusCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < 30_000) {
    return { available: cached.available, reason: cached.reason };
  }

  let result: { checkedAt: number; available: boolean; reason?: string };
  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: "text/html", "User-Agent": "MediaWall/0.3 Immich-Kiosk-Probe" }
    });
    void response.body?.cancel();
    const finalUrl = parseHttpUrl(response.url) ?? target;
    const frameReason = blockedFrameReason(response.headers, finalUrl.origin, parentOrigin);
    result = {
      checkedAt: Date.now(),
      available: response.ok && !frameReason,
      reason: !response.ok ? `http_${response.status}` : frameReason
    };
  } catch {
    result = { checkedAt: Date.now(), available: false, reason: "unreachable" };
  }
  immichKioskStatusCache.set(cacheKey, result);
  return { available: result.available, reason: result.reason };
}

function parseHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function blockedFrameReason(headers: Headers, targetOrigin: string, parentOrigin: string) {
  const xFrameOptions = headers.get("x-frame-options")?.toLowerCase();
  if (xFrameOptions?.includes("deny")) return "frame_blocked";
  if (xFrameOptions?.includes("sameorigin") && targetOrigin !== parentOrigin) return "frame_blocked";
  const contentSecurityPolicy = headers.get("content-security-policy")?.toLowerCase();
  const frameAncestors = contentSecurityPolicy
    ?.split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("frame-ancestors"));
  if (!frameAncestors) return undefined;
  const sources = frameAncestors.split(/\s+/).slice(1);
  if (sources.includes("'none'")) return "frame_blocked";
  if (sources.includes("*")) return undefined;
  if (sources.includes("'self'") && targetOrigin === parentOrigin) return undefined;
  if (sources.includes(parentOrigin.toLowerCase())) return undefined;
  return "frame_blocked";
}

function publicNowPlaying(nowPlaying: NowPlayingState): PublicNowPlayingState {
  return {
    source: nowPlaying.source,
    playing: nowPlaying.playing,
    paused: nowPlaying.paused,
    title: nowPlaying.title,
    artist: nowPlaying.artist,
    album: nowPlaying.album,
    year: nowPlaying.year,
    seasonNumber: nowPlaying.seasonNumber,
    episodeNumber: nowPlaying.episodeNumber,
    seriesName: nowPlaying.seriesName,
    logoText: nowPlaying.logoText,
    displayUser: nowPlaying.displayUser,
    displayUserAvatarUrl: nowPlaying.displayUserAvatarUrl,
    mediaWallUser: nowPlaying.mediaWallUser,
    libraryName: nowPlaying.libraryName,
    collectionName: nowPlaying.collectionName,
    collectionTransitionImageUrl: nowPlaying.collectionTransitionImageUrl,
    collectionTransitionImageSize: nowPlaying.collectionTransitionImageSize,
    albumArtUrl: nowPlaying.albumArtUrl,
    artwork: nowPlaying.artwork,
    publicSessionId: nowPlaying.publicSessionId,
    publicMediaKey: nowPlaying.publicMediaKey,
    publicSoundSessionKey: nowPlaying.publicSoundSessionKey,
    soundTone: nowPlaying.soundTone,
    endSoundTone: nowPlaying.endSoundTone,
    sessionPosition: nowPlaying.sessionPosition,
    sessionCount: nowPlaying.sessionCount
  };
}

function shuffleDisplayConfig(displayConfig: DisplayConfig, state: { shuffle: boolean; shuffleLibraries: string[] }): DisplayConfig {
  if (!state.shuffle || state.shuffleLibraries.length === 0) return displayConfig;
  const selectedLibraries = selectedRealLibraries(state.shuffleLibraries);
  if (selectedLibraries.length === 0) return displayConfig;
  return { ...displayConfig, libraries: selectedLibraries };
}

async function orderedWallpaperSelection(displayConfig: DisplayConfig, state: DisplaySnapshot["state"]) {
  return wallpaperSelection(displayConfig, state, "next");
}

async function previousWallpaperSelection(displayConfig: DisplayConfig, state: DisplaySnapshot["state"]) {
  return wallpaperSelection(displayConfig, state, "previous");
}

async function firstWallpaperSelection(displayConfig: DisplayConfig, state: DisplaySnapshot["state"]) {
  return wallpaperSelection(displayConfig, state, "first");
}

async function currentSatisfiesWallpaperSelection(displayConfig: DisplayConfig, state: DisplaySnapshot["state"]) {
  if (!state.current || state.current.source === "fallback") return false;
  const groups = await wallpaperLibraryGroups(displayConfig, state);
  return groups.some((group) => group.items.some((artwork) => sameWallpaperItem(artwork, state.current!)));
}

async function wallpaperSelection(displayConfig: DisplayConfig, state: DisplaySnapshot["state"], direction: "first" | "next" | "previous") {
  const groups = await wallpaperLibraryGroups(displayConfig, state);
  const sequenceItems = groups.flatMap((group) => group.items);
  if (!sequenceItems.length) return undefined;
  const current = state.current;
  const currentIndex = current ? sequenceArtworkIndex(sequenceItems, current) : -1;
  const nextIndex = currentIndex < 0 || direction === "first"
    ? 0
    : direction === "previous"
      ? (currentIndex - 1 + sequenceItems.length) % sequenceItems.length
      : (currentIndex + 1) % sequenceItems.length;
  const nextArtwork = sequenceItems[nextIndex] ?? sequenceItems[0];
  if (!nextArtwork) return undefined;
  const selected = resolveBackdropPolicy(nextArtwork, displayConfig, state, false);
  return {
    artwork: selected.artwork,
    patch: {
      currentSequence: {
        libraryId: groups.find((group) => group.items.some((item) => artworkKey(item) === artworkKey(nextArtwork)))?.id ?? "",
        items: sequenceItems,
        index: nextIndex
      },
      ...selected.patch
    } as Partial<DisplaySnapshot["state"]>
  };
}

async function librarySwitchSelection(displayConfig: DisplayConfig, state: DisplaySnapshot["state"], direction: -1 | 1) {
  const groups = await wallpaperLibraryGroups(displayConfig, state);
  if (groups.length < 2) return undefined;
  const currentGroupIndex = currentLibraryGroupIndex(groups, state);
  const fromGroup = currentGroupIndex >= 0 ? groups[currentGroupIndex] : undefined;
  const libraryIndexes = { ...state.libraryIndexes };

  if (fromGroup && state.current) {
    const currentItemIndex = fromGroup.items.findIndex((artwork) => sameWallpaperItem(artwork, state.current!));
    if (currentItemIndex >= 0) libraryIndexes[fromGroup.id] = (currentItemIndex + 1) % fromGroup.items.length;
  }

  const targetGroupIndex = currentGroupIndex >= 0
    ? (currentGroupIndex + direction + groups.length) % groups.length
    : (direction > 0 ? 0 : groups.length - 1);
  const targetGroup = groups[targetGroupIndex];
  if (!targetGroup?.items.length) return undefined;
  const targetIndex = (libraryIndexes[targetGroup.id] ?? 0) % targetGroup.items.length;
  const targetArtwork = targetGroup.items[targetIndex];
  if (!targetArtwork) return undefined;
  const selected = resolveBackdropPolicy(targetArtwork, displayConfig, { ...state, libraryIndexes }, false);
  return {
    artwork: selected.artwork,
    libraryName: targetGroup.name,
    patch: {
      libraryIndexes,
      currentSequence: {
        libraryId: targetGroup.id,
        items: targetGroup.items,
        index: targetIndex
      },
      ...selected.patch
    } as Partial<DisplaySnapshot["state"]>
  };
}

async function wallpaperLibraryGroups(displayConfig: DisplayConfig, state: Pick<DisplaySnapshot["state"], "shuffleLibraries" | "favorites">) {
  const selectedLibraries = selectedRealLibraries(state.shuffleLibraries);
  const selectionConfig = selectedLibraries.length
    ? { ...displayConfig, libraries: selectedLibraries }
    : displayConfig;
  const libraries = (await browseLibraries(selectionConfig))
    .filter((library) => library.name && library.id)
    .sort((left, right) => String(left.name).localeCompare(String(right.name), undefined, { sensitivity: "base" }));

  const groups: WallpaperLibraryGroup[] = [];
  for (const library of libraries) {
    const type = String(library.type ?? "");
    const items = shuffleUsesFavorites(state.shuffleLibraries)
      ? state.favorites
          .filter((artwork) =>
            artwork.backdropUrl
            && artworkAllowedForWallpaper(artwork, displayConfig)
            && favoriteMatchesLibraryTypes(artwork, new Set([type.toLowerCase()]))
          )
          .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }))
      : (await browseItems(selectionConfig, library.id, type))
          .filter((item) => item.artwork?.backdropUrl && artworkAllowedForWallpaper(item.artwork, displayConfig))
          .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
          .map((item) => item.artwork)
          .filter((artwork): artwork is ArtworkRef => Boolean(artwork));
    if (items.length) groups.push({ id: String(library.id), name: String(library.name), type, items });
  }
  return groups;
}

function currentLibraryGroupIndex(groups: WallpaperLibraryGroup[], state: DisplaySnapshot["state"]) {
  if (state.current) {
    const byCurrent = groups.findIndex((group) => group.items.some((artwork) => sameWallpaperItem(artwork, state.current!)));
    if (byCurrent >= 0) return byCurrent;
  }
  const sequenceLibraryId = state.currentSequence?.libraryId;
  return sequenceLibraryId ? groups.findIndex((group) => group.id === sequenceLibraryId) : -1;
}

async function shuffleSelection(displayConfig: DisplayConfig, state: DisplaySnapshot["state"]) {
  const existingQueue = uniqueArtworkRefs(state.shuffleQueue);
  let queue = existingQueue.length && state.shuffleQueueIndex < existingQueue.length
    ? existingQueue
    : shuffleItems(uniqueArtworkRefs((await wallpaperLibraryGroups(displayConfig, state)).flatMap((group) => group.items)));
  if (!queue.length) return undefined;
  let index = state.shuffleQueue.length && state.shuffleQueueIndex < state.shuffleQueue.length
    ? state.shuffleQueueIndex
    : 0;
  let artwork = queue[index] ? await refreshArtwork(queue[index]!).catch(() => undefined) : undefined;
  if (!artwork?.backdropUrl || !artworkAllowedForWallpaper(artwork, displayConfig)) {
    queue = shuffleItems(uniqueArtworkRefs((await wallpaperLibraryGroups(displayConfig, state)).flatMap((group) => group.items)));
    index = 0;
    artwork = queue[0];
  }
  if (!artwork) return undefined;
  const selected = resolveBackdropPolicy(artwork, displayConfig, state, false);
  return {
    artwork: selected.artwork,
    patch: {
      shuffleQueue: queue,
      shuffleQueueIndex: index + 1,
      ...selected.patch
    } as Partial<DisplaySnapshot["state"]>
  };
}

async function previousShuffleSelection(displayConfig: DisplayConfig, state: DisplaySnapshot["state"]) {
  const existingQueue = uniqueArtworkRefs(state.shuffleQueue);
  let queue = existingQueue.length
    ? existingQueue
    : shuffleItems(uniqueArtworkRefs((await wallpaperLibraryGroups(displayConfig, state)).flatMap((group) => group.items)));
  if (!queue.length) return undefined;
  const currentIndex = state.current ? sequenceArtworkIndex(queue, state.current) : -1;
  const baseIndex = currentIndex >= 0
    ? currentIndex
    : Math.max(0, Math.min(queue.length - 1, state.shuffleQueueIndex - 1));
  let previousIndex = (baseIndex - 1 + queue.length) % queue.length;
  let artwork = queue[previousIndex] ? await refreshArtwork(queue[previousIndex]!).catch(() => undefined) : undefined;
  if (!artwork?.backdropUrl || !artworkAllowedForWallpaper(artwork, displayConfig)) {
    queue = shuffleItems(uniqueArtworkRefs((await wallpaperLibraryGroups(displayConfig, state)).flatMap((group) => group.items)));
    previousIndex = queue.length - 1;
    artwork = queue[previousIndex] ?? queue[0];
  }
  if (!artwork) return undefined;
  const selected = resolveBackdropPolicy(artwork, displayConfig, state, false);
  return {
    artwork: selected.artwork,
    patch: {
      shuffleQueue: queue,
      shuffleQueueIndex: (previousIndex + 1) % queue.length,
      ...selected.patch
    } as Partial<DisplaySnapshot["state"]>
  };
}

function shuffleUsesFavorites(libraries: string[]) {
  return libraries.some((library) => library.toLowerCase() === favoritesShuffleLibrary.toLowerCase());
}

function selectedRealLibraries(libraries: string[]) {
  return libraries.filter((library) => library.toLowerCase() !== favoritesShuffleLibrary.toLowerCase());
}

function shuffleItems<T>(input: T[]) {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex]!, output[index]!];
  }
  return output;
}

function uniqueArtworkRefs(items: ArtworkRef[]) {
  const seen = new Set<string>();
  return items.filter((artwork) => {
    const key = artworkKey(artwork);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function filteredFavorites(
  displayConfig: DisplayConfig,
  state: Pick<DisplaySnapshot["state"], "shuffleLibraries" | "favorites">
) {
  const selectedLibraries = selectedRealLibraries(state.shuffleLibraries);
  if (!selectedLibraries.length) return state.favorites;
  const selectionConfig = { ...displayConfig, libraries: selectedLibraries };
  const selectedTypes = new Set((await browseLibraries(selectionConfig)).map((library) => String(library.type ?? "").toLowerCase()));
  return state.favorites.filter((artwork) => favoriteMatchesLibraryTypes(artwork, selectedTypes));
}

function artworkAllowedForWallpaper(artwork: ArtworkRef, displayConfig: DisplayConfig) {
  if (!displayConfig.display.require_logos) return true;
  if (artwork.source === "fallback") return true;
  return Boolean(artwork.logoUrl);
}

function favoriteMatchesLibraryTypes(artwork: ArtworkRef, libraryTypes: Set<string>) {
  if (libraryTypes.size === 0) return false;
  const mediaType = artwork.mediaType.toLowerCase();
  for (const libraryType of libraryTypes) {
    if (libraryType === "music" && (mediaType.includes("music") || mediaType === "audio")) return true;
    if (libraryType === "movies" && (mediaType.includes("movie") || mediaType === "video")) return true;
    if (libraryType === "tvshows" && (mediaType.includes("series") || mediaType.includes("episode"))) return true;
    if ((libraryType === "boxsets" || libraryType === "mixed") && mediaType) return true;
  }
  return false;
}

function resolveBackdropPolicy(artwork: ArtworkRef, displayConfig: DisplayConfig, state: DisplaySnapshot["state"], explicit: boolean) {
  if (explicit || artwork.imageType !== "Backdrop" || (artwork.backdropCount ?? 0) < 2) {
    return { artwork, patch: {} as Partial<DisplaySnapshot["state"]> };
  }
  const key = backdropPolicyKey(artwork);
  const count = artwork.backdropCount ?? 1;
  let imageIndex = artwork.imageIndex;
  if (displayConfig.display.multiple_backdrops.single_backdrop === "first") {
    imageIndex = 0;
  } else if (displayConfig.display.multiple_backdrops.single_backdrop === "numbered") {
    imageIndex = ((state.backdropIndexes[key] ?? -1) + 1) % count;
  } else {
    imageIndex = Math.floor(Math.random() * count);
  }
  return {
    artwork: artworkWithBackdropIndex(artwork, imageIndex),
    patch: { backdropIndexes: { ...state.backdropIndexes, [key]: imageIndex } }
  };
}

async function resolveFreshBackdropPolicy(artwork: ArtworkRef, displayConfig: DisplayConfig, state: DisplaySnapshot["state"], explicit: boolean) {
  const refreshed = await refreshArtwork(artwork).catch(() => undefined);
  if (!refreshed || !refreshed.backdropUrl || !artworkAllowedForWallpaper(refreshed, displayConfig)) return undefined;
  return resolveBackdropPolicy(refreshed, displayConfig, state, explicit);
}

function artworkWithBackdropIndex(artwork: ArtworkRef, imageIndex: number): ArtworkRef {
  if (artwork.source !== "jellyfin" || artwork.imageType !== "Backdrop") return { ...artwork, imageIndex };
  const tag = artwork.backdropTags?.[imageIndex];
  return {
    ...artwork,
    imageIndex,
    backdropUrl: jellyfin.imageUrl(artwork.itemId, "Backdrop", imageIndex, tag),
    thumbUrl: jellyfin.imageUrl(artwork.itemId, "Backdrop", imageIndex, tag)
  };
}

function sequencePatchWithArtwork(patch: Partial<DisplaySnapshot["state"]> | undefined, artwork: ArtworkRef) {
  const sequence = patch?.currentSequence;
  if (!sequence?.items.length) return {};
  const items = [...sequence.items];
  const index = Math.max(0, Math.min(items.length - 1, sequence.index));
  items[index] = artwork;
  return {
    currentSequence: {
      ...sequence,
      items
    }
  } as Partial<DisplaySnapshot["state"]>;
}

async function refreshArtwork(artwork: ArtworkRef) {
  if (artwork.source === "fallback" || artwork.itemId === "fallback") return artwork;
  if (artwork.source === "jellyfin") {
    return jellyfin.artworkForItem(artwork.itemId, artwork.imageIndex);
  }
  if (artwork.source === "navidrome") {
    const local = navidrome.localArtistArtworks(artwork.itemId);
    return local[artwork.imageIndex] ?? local[0];
  }
  return artwork;
}

async function normalizeFavoriteArtwork(artwork: ArtworkRef) {
  if (artwork.source !== "jellyfin") return refreshArtwork(artwork).catch(() => undefined);
  const byId = await jellyfin.artworkForItem(artwork.itemId, artwork.imageIndex).catch(() => undefined);
  if (byId && (byId.itemId !== artwork.itemId || byId.mediaType !== "Video")) return byId;
  if (artwork.mediaType.toLowerCase() === "video") {
    return await jellyfin.artworkForVideoPartTitle(artwork.title, artwork.imageIndex).catch(() => undefined)
      ?? normalizeOrphanVideoFavorite(byId ?? artwork);
  }
  return byId ?? artwork;
}

async function normalizeFavoriteArtworks(artworks: ArtworkRef[]) {
  const normalized = await Promise.all(artworks.map(normalizeFavoriteArtwork));
  const favoriteMap = new Map<string, ArtworkRef>();
  for (const artwork of normalized) {
    if (!artwork?.backdropUrl) continue;
    favoriteMap.set(artworkKey(artwork), artwork);
  }
  return [...favoriteMap.values()].slice(0, 200);
}

function favoritesChanged(previous: ArtworkRef[], next: ArtworkRef[]) {
  if (previous.length !== next.length) return true;
  return previous.some((favorite, index) => {
    const nextFavorite = next[index];
    return !nextFavorite || artworkKey(favorite) !== artworkKey(nextFavorite) || favorite.title !== nextFavorite.title;
  });
}

function normalizeOrphanVideoFavorite(artwork: ArtworkRef) {
  const title = moviePartFavoriteTitle(artwork.title);
  const groupKey = `movie:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || artwork.itemId}`;
  return {
    ...artwork,
    title,
    mediaType: "Movie",
    groupKey
  };
}

function moviePartFavoriteTitle(name: string) {
  return name
    .replace(/^\s*(?:disc|disk|part|cd|dvd|bd|blu[- ]?ray)?\s*\d+\s*[-_.:) ]+/i, "")
    .replace(/\s+episode\b.*$/i, "")
    .replace(/\s+(?:disc|disk|part|cd|dvd|bd|blu[- ]?ray)\s*\d+\s*$/i, "")
    .trim() || name;
}

function mediaAssetAllowed(req: express.Request) {
  if (isLocalRequest(req)) return true;
  const passwords = configuredSpacePasswords();
  if (!passwords.length) return true;
  return typeof req.query.password === "string" && passwords.includes(req.query.password);
}

function configuredSpacePasswords() {
  return Object.values(config.spaces)
    .map((space) => String(space.password ?? "").trim())
    .filter(Boolean);
}

function isLocalRequest(req: express.Request) {
  const ip = req.ip || req.socket.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function safeProxyQuery(req: express.Request) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === "password" || key === "_mwcb") continue;
    if (Array.isArray(value)) {
      for (const entry of value) if (typeof entry === "string") params.append(key, entry);
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function controlCommandFromRequest(body: unknown, displayConfig: DisplayConfig): Promise<
  | { ok: true; command: PublicControlCommand }
  | { ok: false; error: string }
> {
  const input = body && typeof body === "object" ? body as { type?: unknown; name?: unknown; durationSeconds?: unknown; randomBackdrop?: unknown } : {};
  const type = input.type === "mediawall"
    ? "mediawall"
    : input.type === "sound"
      ? "sound"
      : input.type === "animation"
        ? "animation"
        : input.type === "user_transition"
          ? "user_transition"
          : undefined;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!type || (!name && type !== "user_transition")) return { ok: false, error: "Command must include type and name." };
  const rawDuration = Number(input.durationSeconds ?? (type === "sound" ? 15 : 30));
  const durationSeconds = Math.max(1, Math.min(300, Number.isFinite(rawDuration) ? rawDuration : 30));
  const startedAt = Date.now();
  const expiresAt = Date.now() + durationSeconds * 1000;
  if (type === "user_transition") {
    const firstUser = displayConfig.users[0];
    const username = name || firstUser?.name || displayConfig.playback_user || "MediaWall";
    return {
      ok: true,
      command: {
        id: crypto.randomUUID(),
        type,
        name: username,
        startedAt,
        source: "jellyfin",
        username,
        verb: "started watching",
        expiresAt
      }
    };
  }
  if (type === "sound") {
    if (name.toLowerCase() === "all") {
      const tones = listSoundFiles(displayConfig);
      if (!tones.length) return { ok: false, error: "No sounds are available." };
      const toneDurationSeconds = 2;
      return {
        ok: true,
        command: {
          id: crypto.randomUUID(),
          type,
          name: "All",
          startedAt,
          tones,
          toneDurationSeconds,
          expiresAt: startedAt + tones.length * toneDurationSeconds * 1000
        }
      };
    }
    if (!resolveSoundPath(displayConfig, name)) return { ok: false, error: `Unknown sound "${name}".` };
    return { ok: true, command: { id: crypto.randomUUID(), type, name, startedAt, expiresAt } };
  }
  if (type === "animation") {
    const animationOption = backdropAnimationOptions.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (!animationOption) return { ok: false, error: `Unknown animation "${name}".` };
    const artwork = input.randomBackdrop ? await jellyfin.randomArtwork(displayConfig).catch(() => undefined) : undefined;
    if (animationOption === "All") {
      const animations = [...backdropAnimations] as BackdropAnimation[];
      return {
        ok: true,
        command: {
          id: crypto.randomUUID(),
          type,
          name: "All",
          startedAt,
          animation: animations[0],
          animations,
          animationDurationSeconds: durationSeconds,
          artwork,
          expiresAt: startedAt + animations.length * durationSeconds * 1000
        }
      };
    }
    return {
      ok: true,
      command: {
        id: crypto.randomUUID(),
        type,
        name: animationOption,
        startedAt,
        animation: animationOption,
        artwork,
        expiresAt
      }
    };
  }
  const modeOption = mediaWallFallbackModeOptions.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  if (!modeOption) return { ok: false, error: `Unknown MediaWall fallback mode "${name}".` };
  if (modeOption === "All") {
    const modes = expandedMediaWallFallbackModes(displayConfig);
    const modeDurationSeconds = durationSeconds;
    return {
      ok: true,
      command: {
        id: crypto.randomUUID(),
        type,
        name: "All",
        startedAt,
        mode: modes[0],
        modes,
        modeDurationSeconds,
        expiresAt: startedAt + modes.length * modeDurationSeconds * 1000
      }
    };
  }
  return { ok: true, command: { id: crypto.randomUUID(), type, name: modeOption, startedAt, mode: modeOption, expiresAt } };
}

function backdropPolicyKey(artwork: ArtworkRef) {
  return `${artwork.source}:${artwork.groupKey ?? artwork.itemId}`;
}

function nextSequenceArtwork(state: DisplaySnapshot["state"]) {
  const sequence = state.currentSequence;
  if (!sequence?.items.length) return undefined;
  const currentIndex = state.current ? sequenceArtworkIndex(sequence.items, state.current) : -1;
  const baseIndex = currentIndex >= 0 ? currentIndex : sequence.index;
  const nextIndex = (baseIndex + 1) % sequence.items.length;
  const artwork = sequence.items[nextIndex];
  if (!artwork) return undefined;
  return {
    artwork,
    patch: {
      currentSequence: {
        ...sequence,
        index: nextIndex
      }
    }
  };
}

function emptyArtworkSequence() {
  return { libraryId: "", items: [], index: 0 };
}

function previousSequenceArtwork(state: DisplaySnapshot["state"]) {
  const sequence = state.currentSequence;
  if (!sequence?.items.length) return undefined;
  const currentIndex = state.current ? sequenceArtworkIndex(sequence.items, state.current) : -1;
  const baseIndex = currentIndex >= 0 ? currentIndex : sequence.index;
  const previousIndex = (baseIndex - 1 + sequence.items.length) % sequence.items.length;
  const artwork = sequence.items[previousIndex];
  if (!artwork) return undefined;
  return {
    artwork,
    patch: {
      currentSequence: {
        ...sequence,
        index: previousIndex
      }
    }
  };
}

function readArtworkSequence(raw: unknown, selected: ArtworkRef) {
  const fallback = { libraryId: "", items: [selected], index: 0 };
  if (!raw || typeof raw !== "object") return fallback;
  const input = raw as { libraryId?: unknown; items?: unknown; index?: unknown };
  const items = Array.isArray(input.items)
    ? input.items.filter(isArtworkRef).slice(0, 200)
    : [];
  const index = Number(input.index ?? 0);
  return {
    libraryId: typeof input.libraryId === "string" ? input.libraryId : "",
    items: items.length ? items : [selected],
    index: Number.isInteger(index) && index >= 0 ? index : 0
  };
}

async function selectionSequenceForRequest(
  raw: unknown,
  displayConfig: DisplayConfig,
  state: DisplaySnapshot["state"],
  selected: ArtworkRef
) {
  const input = raw && typeof raw === "object"
    ? raw as { libraryId?: unknown; libraryType?: unknown; favoritesOnly?: unknown; sequence?: unknown }
    : {};
  const libraryId = typeof input.libraryId === "string" ? input.libraryId : "";
  const libraryType = typeof input.libraryType === "string" ? input.libraryType : "";
  if (libraryId) {
    const items = input.favoritesOnly === true
      ? state.favorites
          .filter((artwork) =>
            artwork.backdropUrl
            && artworkAllowedForWallpaper(artwork, displayConfig)
            && favoriteMatchesLibraryTypes(artwork, new Set([libraryType.toLowerCase()]))
          )
      : (await browseItems(displayConfig, libraryId, libraryType))
          .filter((item) => item.artwork?.backdropUrl && artworkAllowedForWallpaper(item.artwork, displayConfig))
          .map((item) => item.artwork)
          .filter((artwork): artwork is ArtworkRef => Boolean(artwork));
    if (items.length) {
      return {
        libraryId,
        items,
        index: Math.max(0, sequenceArtworkIndex(items, selected))
      };
    }
  }
  return readArtworkSequence(input.sequence, selected);
}

function isArtworkRef(value: unknown): value is ArtworkRef {
  if (!value || typeof value !== "object") return false;
  const item = value as ArtworkRef;
  return typeof item.itemId === "string"
    && typeof item.title === "string"
    && typeof item.mediaType === "string"
    && typeof item.source === "string";
}

function isMediaInfoPrefs(value: unknown): value is DisplaySnapshot["state"]["mediaInfo"] {
  if (!value || typeof value !== "object") return false;
  const item = value as DisplaySnapshot["state"]["mediaInfo"] & { series_episode?: boolean };
  return typeof item.movie === "boolean"
    && typeof item.music_album === "boolean"
    && typeof item.music_song_title === "boolean"
    && typeof (item.series_episode_info ?? item.series_episode) === "boolean"
    && typeof (item.series_episode_title ?? item.series_episode) === "boolean";
}

function sendLocalArtistImage(artistName: string | undefined, res: express.Response, fallbackStatus: number, imageIndex = 0) {
  const imagePath = artistName ? navidrome.localArtistImagePaths(artistName)[imageIndex] : undefined;
  if (!imagePath) {
    res.sendStatus(fallbackStatus);
    return;
  }
  res.setHeader("cache-control", "no-store");
  res.sendFile(imagePath);
}

function sendLocalArtistLogo(artistName: string | undefined, res: express.Response, fallbackStatus: number) {
  const imagePath = artistName ? navidrome.localArtistLogoPath(artistName) : undefined;
  if (!imagePath) {
    res.sendStatus(fallbackStatus);
    return;
  }
  res.setHeader("cache-control", "no-store");
  res.sendFile(imagePath);
}

async function cachedImage(
  cacheKey: string,
  fetcher: () => Promise<Response>,
  options: { revalidateAfterMs?: number; cacheControl?: string; allowStaleOnError?: boolean } = {}
): Promise<CachedImageResult> {
  const cached = await readCachedImage(cacheKey);
  if (cached && !cacheNeedsRevalidation(cached, options.revalidateAfterMs)) {
    return options.cacheControl ? { ...cached, cacheControl: options.cacheControl } : cached;
  }

  let response: Response;
  try {
    response = await fetcher();
  } catch (error) {
    if (cached && options.allowStaleOnError !== false) {
      return options.cacheControl ? { ...cached, cacheControl: options.cacheControl } : cached;
    }
    if (cached) await deleteCachedImage(cacheKey);
    throw error;
  }
  if (!response.ok || !response.body) {
    if (response.status >= 400) await deleteCachedImage(cacheKey);
    return { status: response.status };
  }

  const result: CachedImageResult = {
    status: response.status,
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? undefined,
    cacheControl: options.cacheControl ?? response.headers.get("cache-control") ?? "public, max-age=86400",
    createdAt: Date.now()
  };
  await writeCachedImage(cacheKey, result);
  return result;
}

function cacheNeedsRevalidation(cached: CachedImageResult, revalidateAfterMs: number | undefined) {
  if (revalidateAfterMs === undefined) return false;
  if (!cached.createdAt) return true;
  return Date.now() - cached.createdAt >= revalidateAfterMs;
}

async function readCachedImage(cacheKey: string): Promise<CachedImageResult | undefined> {
  if (!config.library_scan.enabled) return undefined;
  const paths = cachePaths(cacheKey);
  try {
    const meta = JSON.parse(await fs.promises.readFile(paths.meta, "utf8")) as Omit<CachedImageResult, "buffer"> & { createdAt: number };
    if (Date.now() - meta.createdAt > config.library_scan.ttl_days * 86_400_000) return undefined;
    return {
      status: meta.status,
      contentType: meta.contentType,
      cacheControl: meta.cacheControl,
      createdAt: meta.createdAt,
      buffer: await fs.promises.readFile(paths.image)
    };
  } catch {
    return undefined;
  }
}

async function writeCachedImage(cacheKey: string, result: CachedImageResult) {
  if (!config.library_scan.enabled || !result.buffer || result.status < 200 || result.status >= 300) return;
  const paths = cachePaths(cacheKey);
  await fs.promises.mkdir(config.library_scan.directory, { recursive: true });
  await fs.promises.writeFile(paths.image, result.buffer);
  await fs.promises.writeFile(paths.meta, JSON.stringify({
    status: result.status,
    contentType: result.contentType,
    cacheControl: result.cacheControl,
    createdAt: result.createdAt ?? Date.now()
  }));
}

async function deleteCachedImage(cacheKey: string) {
  const paths = cachePaths(cacheKey);
  await Promise.all([
    fs.promises.rm(paths.image, { force: true }),
    fs.promises.rm(paths.meta, { force: true })
  ]).catch(() => undefined);
}

function cachePaths(cacheKey: string) {
  const hash = crypto.createHash("sha256").update(cacheKey).digest("hex");
  return {
    image: path.join(config.library_scan.directory, `${hash}.bin`),
    meta: path.join(config.library_scan.directory, `${hash}.json`)
  };
}

function sendImageResult(res: express.Response, result: CachedImageResult) {
  res.status(result.status);
  if (result.contentType) res.setHeader("content-type", result.contentType);
  res.setHeader("cache-control", result.cacheControl ?? "public, max-age=86400");
  res.send(result.buffer);
}

async function browseLibraries(displayConfig: DisplayConfig) {
  const libraries = useNavidromeBrowse(displayConfig)
    ? await navidrome.browseLibraries(displayConfig)
    : await jellyfin.browseLibraries(displayConfig);
  return libraries.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

async function browseItems(displayConfig: DisplayConfig, libraryId: string, libraryType: string) {
  if (useNavidromeBrowse(displayConfig)) return navidrome.browseItems(libraryId);
  return jellyfin.browseItems(libraryId, jellyfin.browseUser(displayConfig), libraryType, displayConfig.display.music_artist_images);
}

async function browseLibrariesForScan(source: "jellyfin" | "navidrome", displayConfig: DisplayConfig) {
  if (source === "navidrome") return navidrome.browseLibraries(displayConfig);
  return jellyfin.browseLibraries(displayConfig);
}

async function browseItemsForScan(source: "jellyfin" | "navidrome", displayConfig: DisplayConfig, libraryId: string, libraryType: string) {
  if (source === "navidrome") return navidrome.browseItems(libraryId);
  return jellyfin.browseItems(libraryId, jellyfin.browseUser(displayConfig), libraryType, displayConfig.display.music_artist_images);
}

function useNavidromeBrowse(displayConfig: DisplayConfig) {
  return displayConfig.playback_source === "navidrome" || (!jellyfin.configured() && navidrome.configured());
}

function startGridCacheScans(port: number) {
  if (!config.library_scan.enabled) return;
  if (config.library_scan.scan_on_startup) {
    setTimeout(() => {
      void runGridCacheScan(port, "startup").catch((error) => logger.error("Library scan startup failed", error));
    }, 1000);
  }
  if (config.library_scan.cron.enabled) {
    scheduleNextLibraryScan(port);
  }
}

async function runGridCacheScan(port: number, reason: string) {
  const startedAt = Date.now();
  let scanned = 0;
  let warmed = 0;
  logger.info(`Library scan ${reason} starting`);

  for (const [space, displayConfig] of Object.entries(config.spaces)) {
    for (const source of scanSources(displayConfig)) {
      const libraries = await browseLibrariesForScan(source, displayConfig);
      const batches: Array<{ library: { id: string; name: string; type?: string }; items: Array<{ artwork?: ArtworkRef; thumbUrl?: string }> }> = [];
      let sourceTotal = 0;
      for (const library of libraries) {
        const items = await browseItemsForScan(source, displayConfig, library.id, library.type ?? "");
        const cacheableItems = items.filter((item) => item.artwork?.backdropUrl ?? item.thumbUrl);
        sourceTotal += cacheableItems.length;
        batches.push({ library, items: cacheableItems });
      }
      setLibraryScanProgress(space, {
        active: true,
        completed: false,
        source,
        percent: sourceTotal > 0 ? 0 : 100,
        scanned: 0,
        total: sourceTotal,
        warmed: 0,
        updatedAt: Date.now()
      });

      let sourceScanned = 0;
      let sourceWarmed = 0;
      for (const { library, items } of batches) {
        let libraryScanned = 0;
        let libraryWarmed = 0;
        logger.info(`Library scan ${reason}: /${space} source=${source} library="${library.name}" grid backdrops starting`);
        for (const item of items) {
          const imageUrl = item.artwork?.backdropUrl ?? item.thumbUrl;
          if (!imageUrl) continue;
          scanned += 1;
          sourceScanned += 1;
          libraryScanned += 1;
          if (await warmGridImage(port, imageUrl)) {
            warmed += 1;
            sourceWarmed += 1;
            libraryWarmed += 1;
          }
          setLibraryScanProgress(space, {
            active: true,
            completed: false,
            source,
            currentLibrary: library.name,
            percent: sourceTotal > 0 ? Math.round((sourceScanned / sourceTotal) * 100) : 100,
            scanned: sourceScanned,
            total: sourceTotal,
            warmed: sourceWarmed,
            updatedAt: Date.now()
          });
        }
        logger.info(`Library scan ${reason}: /${space} source=${source} library="${library.name}" grid backdrops complete ${libraryWarmed}/${libraryScanned}`);
      }
      setLibraryScanProgress(space, {
        active: false,
        completed: true,
        source,
        percent: 100,
        scanned: sourceScanned,
        total: sourceTotal,
        warmed: sourceWarmed,
        updatedAt: Date.now()
      });
      await delay(2000);
    }
    await runLocalAssetScan(space, displayConfig, "sounds");
    await runLocalAssetScan(space, displayConfig, "custom_images");
    scheduleLibraryScanProgressClear(space);
  }

  logger.info(`Library scan ${reason} complete: ${warmed}/${scanned} grid backdrop images available in ${Date.now() - startedAt}ms`);
}

async function runLocalAssetScan(space: string, displayConfig: DisplayConfig, source: "sounds" | "custom_images") {
  const label = source === "sounds" ? "Sounds" : "Custom Logo";
  logger.info(`Library scan: /${space} source=${source} starting`);
  setLibraryScanProgress(space, {
    active: true,
    completed: false,
    source,
    percent: 0,
    scanned: 0,
    total: 1,
    warmed: 0,
    updatedAt: Date.now()
  });
  const count = source === "sounds" ? listSoundFiles(displayConfig).length : (resolveCustomLogoPath(displayConfig) ? 1 : 0);
  setLibraryScanProgress(space, {
    active: false,
    completed: true,
    source,
    currentLibrary: label,
    percent: 100,
    scanned: 1,
    total: 1,
    warmed: count,
    updatedAt: Date.now()
  });
  logger.info(`Library scan: /${space} source=${source} complete ${count} available`);
  await delay(2000);
}

function scanSources(displayConfig: DisplayConfig): Array<"jellyfin" | "navidrome"> {
  const sources: Array<"jellyfin" | "navidrome"> = [];
  if ((displayConfig.playback_source === "jellyfin" || displayConfig.playback_source === "both") && jellyfin.configured()) {
    sources.push("jellyfin");
  }
  if ((displayConfig.playback_source === "navidrome" || displayConfig.playback_source === "both") && navidrome.configured()) {
    sources.push("navidrome");
  }
  return sources;
}

function setLibraryScanProgress(space: string, progress: PublicLibraryScanProgress) {
  const timer = libraryScanClearTimers.get(space);
  if (timer) windowClearTimeout(timer);
  libraryScanClearTimers.delete(space);
  libraryScanProgress.set(space, progress);
}

function scheduleLibraryScanProgressClear(space: string) {
  const timer = setTimeout(() => {
    libraryScanProgress.delete(space);
    libraryScanClearTimers.delete(space);
  }, 2200);
  libraryScanClearTimers.set(space, timer);
}

function windowClearTimeout(timer: NodeJS.Timeout) {
  clearTimeout(timer);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleNextLibraryScan(port: number) {
  const delay = nextCronDelay(config.library_scan.cron.expression);
  logger.info(`Library scan scheduled next run in ${Math.round(delay / 1000)}s using cron "${config.library_scan.cron.expression}"`);
  setTimeout(() => {
    void runGridCacheScan(port, "cron")
      .catch((error) => logger.error("Library scan cron failed", error))
      .finally(() => scheduleNextLibraryScan(port));
  }, delay);
}

function nextCronDelay(expression: string) {
  const [minuteField, hourField, dayField, monthField, weekdayField] = expression.trim().split(/\s+/);
  const minutes = cronValues(minuteField, 0, 59);
  const hours = cronValues(hourField, 0, 23);
  const days = cronValues(dayField, 1, 31);
  const months = cronValues(monthField, 1, 12);
  const weekdays = cronValues(weekdayField, 0, 7).map((day) => day === 7 ? 0 : day);
  const now = new Date();
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);
  const limit = now.getTime() + 366 * 24 * 60 * 60 * 1000;

  while (candidate.getTime() <= limit) {
    const matches =
      minutes.includes(candidate.getMinutes())
      && hours.includes(candidate.getHours())
      && days.includes(candidate.getDate())
      && months.includes(candidate.getMonth() + 1)
      && weekdays.includes(candidate.getDay());
    if (matches) {
      return candidate.getTime() - now.getTime();
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  return 24 * 60 * 60 * 1000;
}

function cronValues(field: string | undefined, min: number, max: number) {
  if (!field || field === "*") return range(min, max);
  const values = field.split(",").flatMap((part) => {
    const [body, stepValue] = part.split("/");
    const step = Math.max(1, Number(stepValue ?? 1));
    if (body === "*") return range(min, max).filter((value) => (value - min) % step === 0);
    if (body.includes("-")) {
      const [start, end] = body.split("-").map(Number);
      if (!Number.isInteger(start) || !Number.isInteger(end)) return [];
      return range(Math.max(min, start), Math.min(max, end)).filter((value) => (value - start) % step === 0);
    }
    const value = Number(body);
    return Number.isInteger(value) && value >= min && value <= max ? [value] : [];
  });
  return values.length ? [...new Set(values)].sort((a, b) => a - b) : range(min, max);
}

function range(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_value, index) => min + index);
}

async function warmGridImage(port: number, imageUrl: string) {
  try {
    const url = new URL(imageUrl, `http://127.0.0.1:${port}`);
    if (url.origin !== `http://127.0.0.1:${port}`) return false;
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function activePlayback(space: string, displayConfig: DisplayConfig, state: DisplaySnapshot["state"], manualDirection?: -1 | 1) {
  const details = await activePlaybackDetails(space, displayConfig, state, manualDirection);
  return details.selected;
}

async function activePlaybackDetails(space: string, displayConfig: DisplayConfig, state: DisplaySnapshot["state"], manualDirection?: -1 | 1) {
  const candidates = await activePlaybackCandidates(displayConfig);
  logger.debug(`Playback poll on /${space}: candidates=${candidates.length}`);
  const selected = updateRecentPlayback(space, candidates, displayConfig, state, manualDirection);
  const runtime = spaceRuntime(space);
  runtime.playbackPolls += 1;
  logPlaybackSelection(space, selected);
  return {
    selected,
    detectionPending: !selected
      && runtime.playbackPolls < 2
      && Date.now() - runtime.playbackDetectionStartedAt < 10_000,
    soundSessions: publicSoundSessions(space, displayConfig)
  };
}

function logPlaybackSelection(space: string, selected: NowPlayingState | undefined) {
  const previous = lastLoggedPlaybackBySpace.get(space);
  if (!selected) {
    if (previous) {
      logger.info(`Playback idle on /${space}`);
      lastLoggedPlaybackBySpace.delete(space);
    }
    return;
  }
  const key = selected.publicSessionId ?? selected.publicMediaKey ?? selected.signature ?? `${selected.source}:${selected.user}:${selected.title}`;
  const message = `Playback active on /${space}: source=${selected.source} user="${selected.displayUser ?? selected.user}" title="${selected.title ?? selected.artwork?.title ?? "unknown"}" session=${selected.sessionPosition ?? 1}/${selected.sessionCount ?? 1}`;
  if (previous !== key) {
    logger.info(message);
    lastLoggedPlaybackBySpace.set(space, key);
  } else {
    logger.debug(message);
  }
}

async function activePlaybackCandidates(displayConfig: DisplayConfig) {
  const candidates: NowPlayingState[] = [];
  for (const user of displayConfig.users) {
    if (displayConfig.playback_source === "jellyfin" || displayConfig.playback_source === "both") {
      try {
        const playbacks = (await jellyfin.activePlaybacks({
          ...displayConfig,
          playback_user: user.jellyfin_user ?? user.name,
          users: [user]
        })).map((playback) => withMediaWallUserSound(playback, user.name, user.sound, user.end_sound));
        candidates.push(...playbacks.map((playback) => applyCollectionPresentation(playback, displayConfig, user.name)));
      } catch (error) {
        logger.warn("Jellyfin playback source poll failed", error);
      }
    }
    if (displayConfig.playback_source === "navidrome" || displayConfig.playback_source === "both") {
      try {
        candidates.push(...(await navidrome.activePlaybacks({
          ...displayConfig,
          playback_user: user.navidrome_user ?? user.name,
          users: [user]
        })).map((playback) => withMediaWallUserSound(playback, user.name, user.sound, user.end_sound)));
      } catch (error) {
        logger.warn("Navidrome playback source poll failed", error);
      }
    }
  }
  return dedupePlaybackCandidates(candidates);
}

function applyCollectionPresentation(state: NowPlayingState, displayConfig: DisplayConfig, mediaWallUser: string): NowPlayingState {
  if (state.source !== "jellyfin" || !displayConfig.now_playing.collections.enabled) return state;
  const itemIds = [state.itemId, state.artwork?.itemId, state.artistId].filter((value): value is string => Boolean(value));
  const cacheKey = `${mediaWallUser}:${itemIds.join(":")}`;
  const cached = collectionPresentationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.resolved ? { ...state, ...cached.resolved } : state;
  }
  const entry = { expiresAt: Date.now() + 5 * 60_000 } as {
    expiresAt: number;
    resolved?: CollectionPresentation | null;
    pending?: Promise<void>;
  };
  entry.pending = jellyfin.collectionMatchForItem(itemIds, displayConfig, mediaWallUser)
    .then((match) => {
      if (!match) {
        entry.resolved = null;
        return;
      }
      const imageFile = match.user_transition_image && resolveCollectionImagePath(match.user_transition_image)
        ? match.user_transition_image
        : undefined;
      if (match.user_transition_image && !imageFile) {
        logger.warn(`Collection transition image "${match.user_transition_image}" was not found in /app/collections`);
      }
      entry.resolved = {
        collectionName: match.collectionName,
        collectionTransitionImage: imageFile,
        collectionTransitionImageSize: match.image_size,
        soundTone: match.sound || state.soundTone
      };
      logger.debug(`Collection match for "${state.title ?? state.artwork?.title ?? "unknown"}": ${match.collectionName}`);
    })
    .catch((error) => {
      entry.resolved = null;
      logger.warn(`Jellyfin collection match failed for "${state.title ?? state.artwork?.title ?? "unknown"}"`, error);
    })
    .finally(() => {
      entry.pending = undefined;
    });
  collectionPresentationCache.set(cacheKey, entry);
  return state;
}

function dedupePlaybackCandidates(candidates: NowPlayingState[]) {
  const seen = new Set<string>();
  const deduped: NowPlayingState[] = [];
  for (const candidate of candidates) {
    const key = [
      candidate.source,
      candidate.user,
      candidate.sessionKey,
      candidate.itemId,
      candidate.artistId,
      candidate.signature
    ].filter(Boolean).join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function updateRecentPlayback(displayKey: string, candidates: NowPlayingState[], displayConfig: DisplayConfig, state: DisplaySnapshot["state"], manualDirection?: -1 | 1) {
  const now = Date.now();
  const idleMs = displayConfig.idle_timeout * 1000;
  const pausedSessionGraceMs = Math.max(0, displayConfig.now_playing.session_cleanup.paused_after_seconds) * 1000;
  const missingSessionGraceMs = Math.max(0, displayConfig.now_playing.session_cleanup.missing_after_seconds) * 1000;
  const records = recentPlayback.get(displayKey) ?? new Map<string, RecentPlaybackRecord>();
  const previouslyActive = new Map([...records.entries()].map(([sessionKey, record]) => [sessionKey, record.active]));
  const seenThisPoll = new Set<string>();
  const replacementKeys = new Set<string>();
  for (const record of records.values()) {
    record.active = false;
    record.heldForCycle = false;
  }

  for (const candidate of candidates.filter((entry) => entry.playing)) {
    const cacheKey = playbackSessionKey(candidate);
    seenThisPoll.add(cacheKey);
    const previous = records.get(cacheKey);
    const signatureChanged = previous?.state.signature !== candidate.signature;
    if (previous?.state.source === "jellyfin" && candidate.source === "jellyfin") {
      logNowPlayingArtworkRefresh(displayKey, previous.state, candidate);
    }
    const tracksPlaybackProgress = candidate.playbackPositionTicks !== undefined;
    const positionChanged = tracksPlaybackProgress
      && !signatureChanged
      && previous?.playbackPositionTicks !== undefined
      && candidate.playbackPositionTicks !== previous.playbackPositionTicks;
    const progressConfirmed = !tracksPlaybackProgress
      || positionChanged
      || (!signatureChanged && previous?.progressConfirmed === true);
    const stalledSince = tracksPlaybackProgress && progressConfirmed && !positionChanged && !candidate.paused && !candidate.stale
      ? previous?.stalledSince ?? now
      : undefined;
    const activityAt = candidate.activityAt
      ?? (signatureChanged ? now : previous?.activityAt)
      ?? previous?.seenAt
      ?? now;
    const pausedSince = candidate.paused
      ? previous?.pausedSince ?? now
      : candidate.stale
        ? previous?.pausedSince ?? candidate.activityAt ?? now
        : undefined;
    const pausedActive = !pausedSince || now - pausedSince < pausedSessionGraceMs;
    const progressActive = !tracksPlaybackProgress
      || (progressConfirmed && (!stalledSince || now - stalledSince < pausedSessionGraceMs));
    const state = { ...candidate, sessionKey: candidate.sessionKey ?? cacheKey, activityAt };
    replacementKeys.add(playbackContinuityKey(state));
    records.set(cacheKey, {
      firstSeenAt: previous?.firstSeenAt ?? now,
      seenAt: signatureChanged ? now : previous?.seenAt ?? now,
      refreshedAt: now,
      activityAt,
      playbackPositionTicks: candidate.playbackPositionTicks,
      progressConfirmed,
      stalledSince,
      pausedSince,
      active: pausedActive && progressActive,
      heldForCycle: false,
      state
    });
  }

  if (missingSessionGraceMs > 0) {
    const cycle = recentPlaybackCycles.get(displayKey);
    const intervalMs = Math.max(1, displayConfig.now_playing.cycle_interval_seconds) * 1000;
    const freshActiveCount = [...records.entries()].filter(([sessionKey, record]) => seenThisPoll.has(sessionKey) && record.active).length;
    for (const [sessionKey, record] of records.entries()) {
      if (seenThisPoll.has(sessionKey) || !previouslyActive.get(sessionKey)) continue;
      const finishVisibleCycle = freshActiveCount > 0
        && cycle?.selectedKey === sessionKey
        && !state.nowPlayingCyclePaused
        && now - cycle.selectedAt < intervalMs;
      if (replacementKeys.has(playbackContinuityKey(record.state))) {
        logger.debug(`Playback superseded held session on /${displayKey}: source=${record.state.source} user="${record.state.displayUser ?? record.state.user}" title="${record.state.title ?? record.state.artwork?.title ?? "unknown"}"`);
        continue;
      }
      if (now - record.refreshedAt < missingSessionGraceMs || finishVisibleCycle) {
        record.active = true;
        record.heldForCycle = finishVisibleCycle && now - record.refreshedAt >= missingSessionGraceMs;
        logger.debug(`Playback holding missing session on /${displayKey}: source=${record.state.source} user="${record.state.displayUser ?? record.state.user}" title="${record.state.title ?? record.state.artwork?.title ?? "unknown"}" heldForCycle=${record.heldForCycle === true}`);
      }
    }
  }

  for (const [sessionKey, record] of records.entries()) {
    if (record.pausedSince && now - record.pausedSince >= pausedSessionGraceMs) records.delete(sessionKey);
    if (record.stalledSince && now - record.stalledSince >= pausedSessionGraceMs) records.delete(sessionKey);
    if (record.state.source === "jellyfin" && record.state.playbackPositionTicks !== undefined && !record.progressConfirmed && now - record.firstSeenAt >= pausedSessionGraceMs) records.delete(sessionKey);
    if (!record.active && now - record.refreshedAt >= idleMs) records.delete(sessionKey);
  }

  if (!records.size) {
    recentPlayback.delete(displayKey);
    recentPlaybackCycles.delete(displayKey);
    return undefined;
  }

  recentPlayback.set(displayKey, records);
  const active = [...records.entries()].filter((entry) => entry[1].active);
  if (!active.length) {
    recentPlaybackCycles.delete(displayKey);
    return undefined;
  }
  const sorted = active.sort((left, right) => comparePlaybackRecords(left[1], right[1]));
  const activeChronological = active
    .slice()
    .sort((left, right) =>
      left[1].firstSeenAt - right[1].firstSeenAt
      || left[1].seenAt - right[1].seenAt
      || left[0].localeCompare(right[0])
    );

  if (manualDirection && activeChronological.length > 1) {
    const cycle = recentPlaybackCycles.get(displayKey);
    const currentKey = cycle?.selectedKey && activeChronological.some(([key]) => key === cycle.selectedKey)
      ? cycle.selectedKey
      : sorted[0]?.[0];
    const currentIndex = activeChronological.findIndex(([key]) => key === currentKey);
    const nextIndex = currentIndex >= 0
      ? (currentIndex + manualDirection + activeChronological.length) % activeChronological.length
      : (manualDirection > 0 ? 0 : activeChronological.length - 1);
    const [selectedKey, selected] = activeChronological[nextIndex]!;
    recentPlaybackCycles.set(displayKey, { selectedKey, selectedAt: now, newestSeenAt: newestSeenAt(activeChronological) });
    return withPlaybackPosition(selected.state, selectedKey, activeChronological, displayConfig, displayKey);
  }

  if (active.length > 1) {
    const intervalMs = Math.max(1, displayConfig.now_playing.cycle_interval_seconds) * 1000;
    const [newestKey, newest] = sorted[0]!;
    const cycle = recentPlaybackCycles.get(displayKey);
    const selectedStillActive = cycle?.selectedKey ? sorted.some(([key]) => key === cycle.selectedKey) : false;
    if (cycle && selectedStillActive && state.nowPlayingCyclePaused) {
      const selected = records.get(cycle.selectedKey!);
      recentPlaybackCycles.set(displayKey, { ...cycle, newestSeenAt: Math.max(cycle.newestSeenAt, newest.seenAt) });
      return withPlaybackPosition(selected?.state ?? newest.state, cycle.selectedKey!, activeChronological, displayConfig, displayKey);
    }
    if (!cycle || !selectedStillActive) {
      const [selectedKey, selected] = activeChronological[0]!;
      recentPlaybackCycles.set(displayKey, { selectedKey, selectedAt: now, newestSeenAt: newestSeenAt(activeChronological) });
      return withPlaybackPosition(selected.state, selectedKey, activeChronological, displayConfig, displayKey);
    }
    if (newest.seenAt > cycle.newestSeenAt) {
      const selected = records.get(cycle.selectedKey!);
      recentPlaybackCycles.set(displayKey, { ...cycle, newestSeenAt: newest.seenAt });
      return withPlaybackPosition(selected?.state ?? activeChronological[0]![1].state, cycle.selectedKey!, activeChronological, displayConfig, displayKey);
    }
    if (now - cycle.selectedAt < intervalMs) {
      const selected = records.get(cycle.selectedKey!);
      return withPlaybackPosition(selected?.state ?? newest.state, cycle.selectedKey!, activeChronological, displayConfig, displayKey);
    }
    const currentIndex = activeChronological.findIndex(([key]) => key === cycle.selectedKey);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % activeChronological.length : 0;
    const [selectedKey, selected] = activeChronological[nextIndex]!;
    recentPlaybackCycles.set(displayKey, { selectedKey, selectedAt: now, newestSeenAt: cycle.newestSeenAt });
    return withPlaybackPosition(selected.state, selectedKey, activeChronological, displayConfig, displayKey);
  }
  recentPlaybackCycles.delete(displayKey);
  const first = sorted[0];
  return first ? withPlaybackPosition(first[1].state, first[0], activeChronological, displayConfig, displayKey) : undefined;
}

function logNowPlayingArtworkRefresh(displayKey: string, previous: NowPlayingState, next: NowPlayingState) {
  const previousArtwork = previous.artwork;
  const nextArtwork = next.artwork;
  if (!previousArtwork || !nextArtwork) return;
  if (previousArtwork.source !== "jellyfin" || nextArtwork.source !== "jellyfin") return;
  if (previousArtwork.itemId !== nextArtwork.itemId) return;
  const previousSignature = artworkImageSignature(previousArtwork);
  const nextSignature = artworkImageSignature(nextArtwork);
  if (previousSignature === nextSignature) return;
  const title = nextArtwork.title ?? next.title ?? "Unknown";
  logger.info(`Now Playing artwork refreshed: /${displayKey} "${title}" backdrops ${previousArtwork.backdropCount ?? 0} -> ${nextArtwork.backdropCount ?? 0}`);
}

function artworkImageSignature(artwork: ArtworkRef) {
  return [
    artwork.itemId,
    artwork.imageType,
    artwork.imageIndex,
    artwork.backdropCount ?? 0,
    ...(artwork.backdropTags ?? []),
    artwork.logoTag ?? "",
    artwork.primaryTag ?? ""
  ].join(":");
}

function withPlaybackPosition(
  state: NowPlayingState,
  selectedKey: string,
  activeChronological: Array<[string, RecentPlaybackRecord]>,
  displayConfig: DisplayConfig,
  space: string
) {
  const sessionCount = activeChronological.length;
  const sessionPosition = activeChronological.findIndex(([key]) => key === selectedKey) + 1;
  return {
    ...state,
    publicSessionId: publicSessionId(selectedKey),
    publicMediaKey: publicMediaKey(state),
    publicSoundSessionKey: hashPublicKey(soundSessionIdentity(state, displayConfig)),
    collectionTransitionImageUrl: state.collectionTransitionImage
      ? collectionImageUrl(space, state.collectionTransitionImage)
      : undefined,
    sessionPosition: sessionPosition > 0 ? sessionPosition : undefined,
    sessionCount: sessionCount || undefined
  };
}

function withMediaWallUserSound(state: NowPlayingState, mediaWallUser: string, tone?: string, endTone?: string): NowPlayingState {
  return {
    ...state,
    mediaWallUser,
    soundTone: tone,
    endSoundTone: endTone
  };
}

function newestSeenAt(records: Array<[string, RecentPlaybackRecord]>) {
  return Math.max(...records.map((entry) => entry[1].seenAt));
}

function comparePlaybackRecords(left: RecentPlaybackRecord, right: RecentPlaybackRecord) {
  return right.seenAt - left.seenAt || right.activityAt - left.activityAt || right.refreshedAt - left.refreshedAt;
}

function playbackContinuityKey(state: NowPlayingState) {
  const parts = state.sessionKey?.split(":") ?? [];
  if (state.source === "jellyfin" && parts[0] === "jellyfin") {
    return [state.source, state.user, ...parts.slice(1, 5)].filter(Boolean).join(":");
  }
  if (state.source === "navidrome" && parts[0] === "navidrome") {
    return [state.source, state.user, ...parts.slice(2, 4)].filter(Boolean).join(":");
  }
  return [state.source, state.user, state.displayUser].filter(Boolean).join(":");
}

function publicSessionId(sessionKey: string) {
  return crypto.createHash("sha256").update(sessionKey).digest("hex").slice(0, 16);
}

function publicSoundSessions(displayKey: string, displayConfig: DisplayConfig): PublicSoundSession[] {
  const records = recentPlayback.get(displayKey);
  if (!records) return [];
  const now = Date.now();
  const pausedSessionGraceMs = Math.max(0, displayConfig.now_playing.session_cleanup.paused_after_seconds) * 1000;
  return [...records.values()]
    .filter((record) =>
      record.state.playing
      && record.active
      && (record.state.source === "jellyfin" || record.state.source === "navidrome")
    )
    .map((record) => {
      const identity = soundSessionIdentity(record.state, displayConfig);
      return {
        key: hashPublicKey(identity),
        source: record.state.source as "jellyfin" | "navidrome",
        userKey: hashPublicKey(soundUserIdentity(record.state)),
        libraryName: record.state.libraryName,
        continuous: soundSessionContinuous(record.state, displayConfig),
        soundTone: record.state.soundTone,
        endSoundTone: record.state.endSoundTone
      };
    });
}

function publicMediaKey(state: NowPlayingState) {
  const mediaKey = [
    state.source,
    state.user,
    state.itemId,
    state.artistId,
    state.signature,
    state.album,
    state.title
  ].filter(Boolean).join(":");
  return crypto.createHash("sha256").update(mediaKey).digest("hex").slice(0, 16);
}

function hashPublicKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function soundSessionIdentity(state: NowPlayingState, displayConfig: DisplayConfig) {
  const user = soundUserIdentity(state);
  if (state.source === "navidrome" && displayConfig.now_playing.sounds.continuous_sessions.navidrome) {
    return `${user}:continuous:navidrome`;
  }
  if (state.source === "jellyfin" && jellyfinContinuousSessionName(state, displayConfig)) {
    return `${user}:continuous:jellyfin:${jellyfinContinuousSessionName(state, displayConfig)}`;
  }
  return `${user}:session:${playbackSessionKey(state)}`;
}

function soundSessionContinuous(state: NowPlayingState, displayConfig: DisplayConfig) {
  if (state.source === "navidrome") return displayConfig.now_playing.sounds.continuous_sessions.navidrome;
  return Boolean(jellyfinContinuousSessionName(state, displayConfig));
}

function jellyfinContinuousSessionName(state: NowPlayingState, displayConfig: DisplayConfig) {
  if (state.source !== "jellyfin") return undefined;
  const continuousLibraries = normalizedNameSet(displayConfig.now_playing.sounds.continuous_sessions.jellyfin_libraries);
  if (state.libraryName && continuousLibraries.has(state.libraryName.toLowerCase())) return state.libraryName.toLowerCase();
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

function soundUserIdentity(state: NowPlayingState) {
  return `${state.source}:${state.user ?? state.displayUser ?? state.mediaWallUser ?? "unknown"}`;
}

function normalizedNameSet(names: string[]) {
  return new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean));
}

function playbackSessionKey(state: NowPlayingState) {
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

const supportedSoundExtensions = new Set([".mp3", ".ogg", ".wav", ".m4a", ".aac", ".flac"]);

function listSoundFiles(displayConfig: DisplayConfig) {
  const files = new Set<string>();
  const directory = soundDirectory(displayConfig);
  try {
    for (const filename of fs.readdirSync(directory)) {
      if (!supportedSoundExtensions.has(path.extname(filename).toLowerCase())) continue;
      const resolved = path.resolve(directory, filename);
      if (resolved.startsWith(`${directory}${path.sep}`) && fs.statSync(resolved).isFile()) files.add(filename);
    }
  } catch {
    return [];
  }
  return [...files].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function resolveSoundPath(displayConfig: DisplayConfig, tone: string) {
  if (!tone || tone.includes("/") || tone.includes("\\") || tone.includes("\0")) return undefined;
  if (!supportedSoundExtensions.has(path.extname(tone).toLowerCase())) return undefined;
  const directory = soundDirectory(displayConfig);
  const resolved = path.resolve(directory, tone);
  if (!resolved.startsWith(`${directory}${path.sep}`)) return undefined;
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : undefined;
}

function soundDirectory(displayConfig: DisplayConfig) {
  const configured = displayConfig.now_playing.sounds.directory || "/app/sounds";
  const resolved = path.resolve(path.isAbsolute(configured) ? configured : path.join(appRoot, configured));
  if (fs.existsSync(resolved)) return resolved;
  if (configured === "/app/sounds") return path.resolve(appRoot, "app/sounds");
  return resolved;
}

function resolveDisplay(profile: string, display: string | undefined, res: express.Response, password?: unknown) {
  const displayConfig = findDisplay(config, profile, display);
  if (!displayConfig) {
    res.status(404).json({ error: `Unknown space ${display ?? profile}` });
    return undefined;
  }
  if (displayConfig.password && password !== displayConfig.password) {
    res.status(401).json({ error: "Space password required" });
    return undefined;
  }
  return { displayConfig };
}

function artworkKey(artwork: ArtworkRef) {
  return `${artwork.source}:${artwork.groupKey ?? artwork.itemId}:${artwork.imageType}:${artwork.imageIndex}`;
}

function sequenceArtworkIndex(items: ArtworkRef[], selected: ArtworkRef) {
  const exactIndex = items.findIndex((artwork) => artworkKey(artwork) === artworkKey(selected));
  if (exactIndex >= 0) return exactIndex;
  return items.findIndex((artwork) => sameWallpaperItem(artwork, selected));
}

function sameWallpaperItem(left: ArtworkRef, right: ArtworkRef) {
  return left.source === right.source && left.itemId === right.itemId;
}

const port = Number(process.env.PORT ?? config.server.port ?? 1221);
app.listen(port, "0.0.0.0", () => {
  logger.info(`MediaWall listening on http://0.0.0.0:${port} logLevel=${logger.level}`);
  startGridCacheScans(port);
});

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Disc3,
  Grid2X2,
  Heart,
  HeartOff,
  Image,
  Info,
  ListFilter,
  Maximize,
  Pause,
  Play,
  Radio,
  Sparkles,
  Shuffle,
  Volume2,
  VolumeX
} from "lucide-react";
import jellyfinLogo from "./logos/jellyfin.svg";
import navidromeLogo from "./logos/navidrome.svg";
import mediaWallBanner from "./logos/banner.png";
import mediaWallBannerWhite from "./logos/banner_white.png";
import packageInfo from "../package.json";
import "./styles.css";

const mediaAssetCacheToken = Date.now().toString(36);
const appVersion = packageInfo.version;

configurePwaIdentity();

function configurePwaIdentity() {
  const normalizedPath = `/${window.location.pathname.split("/").filter(Boolean).join("/")}`;
  const remote = normalizedPath.endsWith("-remote");
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (manifest) manifest.href = `/api/pwa-manifest?route=${encodeURIComponent(normalizedPath)}&launch=${encodeURIComponent(`${normalizedPath}${window.location.search}`)}`;
  const touchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (touchIcon) touchIcon.href = remote ? "/logos/remote.png" : "/logos/logo.png";
}

type ArtworkRef = {
  source: "jellyfin" | "navidrome" | "fallback";
  itemId: string;
  title: string;
  mediaType: string;
  year?: number;
  imageType: "Backdrop" | "Primary";
  imageIndex: number;
  backdropUrl?: string;
  logoUrl?: string;
  thumbUrl?: string;
  backdropCount?: number;
  backdropTags?: string[];
  primaryTag?: string;
  logoTag?: string;
  groupKey?: string;
};

type DisplayState = {
  mode: "now-playing" | "screensaver";
  current?: ArtworkRef;
  currentSequence?: { libraryId: string; items: ArtworkRef[]; index: number };
  libraryIndexes: Record<string, number>;
  playing: boolean;
  nowPlayingCyclePaused: boolean;
  shuffle: boolean;
  shuffleLibraries: string[];
  libraryConfigSignature?: string;
  showSongInfo: boolean;
  mediaInfo: {
    movie: boolean;
    music_album: boolean;
    music_song_title: boolean;
    series_episode_info: boolean;
    series_episode_title: boolean;
  };
  showAlbumArt: boolean;
  showLogo: boolean;
  history: ArtworkRef[];
  favorites: ArtworkRef[];
  lastNowPlayingHadSession?: boolean;
  mediaWallFallbackIndex?: number;
  activeMediaWallFallbackMode?: "centered" | "breathing" | "float" | "spotlight" | "dvd" | "minimal";
  transitionStyle?: TransitionStyle;
};

type MediaWallFallbackMode = "centered" | "breathing" | "float" | "spotlight" | "dvd" | "minimal";
type BackdropAnimation = "breathe" | "pan" | "kenburns" | "drift" | "focus" | "zoom";
const backdropAnimations: BackdropAnimation[] = ["breathe", "pan", "kenburns", "drift", "focus", "zoom"];

type Snapshot = {
  profile: string;
  display: string;
  mode: "now-playing" | "screensaver";
  state: DisplayState;
  libraryScan?: {
    active: boolean;
    completed: boolean;
    source: "jellyfin" | "navidrome" | "sounds" | "custom_images";
    currentLibrary?: string;
    percent: number;
    scanned: number;
    total: number;
    warmed: number;
    updatedAt: number;
  };
  connectionIssues?: Array<{
    source: "jellyfin" | "navidrome";
    message: string;
  }>;
  controlCommand?: {
    id: string;
    type: "sound" | "mediawall" | "animation" | "user_transition";
    name: string;
    startedAt: number;
    source?: "jellyfin" | "navidrome";
    username?: string;
    avatarUrl?: string;
    verb?: string;
    collectionImageUrl?: string;
    collectionImageSize?: number;
    mode?: MediaWallFallbackMode;
    modes?: MediaWallFallbackMode[];
    modeDurationSeconds?: number;
    animation?: BackdropAnimation;
    animations?: BackdropAnimation[];
    animationDurationSeconds?: number;
    artwork?: ArtworkRef;
    tones?: string[];
    toneDurationSeconds?: number;
    expiresAt: number;
  };
  uiIndicator?: {
    id: string;
    kind: ActionIndicatorKind;
    createdAt: number;
    expiresAt: number;
  };
  activeMediaWallFallbackMode?: MediaWallFallbackMode;
  presentation: {
    revision: number;
    serverNow: number;
    startedAt: number;
    nextTransitionAt?: number;
    backdropIndex: number;
  };
  userTransitionEvent?: {
    id: string;
    sessionKey: string;
    startedAt: number;
    expiresAt: number;
  };
  nowPlaying?: {
    source: "jellyfin" | "navidrome";
    playing: boolean;
    paused: boolean;
    user?: string;
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    seasonNumber?: number;
    episodeNumber?: number;
    seriesName?: string;
    logoText?: string;
    displayUser?: string;
    displayUserAvatarUrl?: string;
    mediaWallUser?: string;
    collectionName?: string;
    collectionTransitionImageUrl?: string;
    collectionTransitionImageSize?: number;
    albumArtUrl?: string;
    artwork?: ArtworkRef;
    signature?: string;
    publicSessionId?: string;
    publicMediaKey?: string;
    publicSoundSessionKey?: string;
    soundTone?: string;
    endSoundTone?: string;
    sessionPosition?: number;
    sessionCount?: number;
  };
  soundSessions?: Array<{
    key: string;
    source: "jellyfin" | "navidrome";
    userKey: string;
    libraryName?: string;
    continuous: boolean;
    soundTone?: string;
    endSoundTone?: string;
  }>;
  config: {
    now_playing: {
      fallback: "mediawall" | "shuffle";
      fallback_shuffle_interval_seconds: number;
      cycle_users: boolean;
      cycle_interval_seconds: number;
      session_timer: {
        enabled: boolean;
        size: number;
      };
      session_count: {
        enabled: boolean;
        font_size: number;
      };
      user_transition: {
        enabled: boolean;
        duration_seconds: number;
        background_color: string;
        avatar_size: number;
        username_font_size: number;
        message_font_size: number;
        source_icon_size: number;
      };
      mediawall_fallback: {
        modes: Array<MediaWallFallbackMode | "All">;
        image: "banner" | "banner_white" | "custom";
        background_color: string;
        min_logo_width: number;
        max_logo_width: number;
        sizes: Record<MediaWallFallbackMode, number>;
      };
      custom_logo: {
        directory: string;
      };
      multiple_backdrops: {
        enabled: boolean;
        interval_seconds: number;
      };
      collections: {
        enabled: boolean;
        global: {
          enabled: boolean;
          sound: string;
          user_transition_image: string;
          image_size: number;
        };
        groups: Array<{
          name?: string;
          title_regexes: string[];
          users: string[];
          sound: string;
          user_transition_image: string;
          image_size: number;
        }>;
      };
      sounds: {
        enabled: boolean;
        jellyfin: boolean;
        navidrome: boolean;
        quiet_hours: {
          enabled: boolean;
          start: string;
          end: string;
        };
        continuous_sessions: {
          navidrome: boolean;
          jellyfin_libraries: string[];
        };
        session_start: {
          retrigger_after_inactive_seconds: number;
        };
        session_end: {
          enabled: boolean;
          tone: string;
        };
        trigger: "new_session" | "new_user_session";
        tone: string;
        volume: number;
        available: string[];
      };
    };
    display: {
      ui: { scale: number };
      cycle_interval_seconds: number;
      screensaver_interval: number;
      require_logos: boolean;
      backdrop_background_color: string;
      logo: { max_width: number };
      album_art: { size: number };
      fallback_title: { font_size: number };
      nowplaying_text: {
        enabled: boolean;
        text: string;
        show_text: boolean;
        font_size: number;
        show_source_icon: boolean;
        icon_size: number;
        show_user_avatar: boolean;
        user_avatar_size: number;
        user_avatar_resize: {
          enabled: boolean;
          size: number;
        };
        show_jellyfin_username: boolean;
        show_navidrome_username: boolean;
        user_font_size: number;
      };
      screensaver_text: {
        enabled: boolean;
        text: string;
        font_size: number;
        icon_size: number;
      };
      media_info: {
        font_size: number;
        release_year_font_size: number;
        episode_info_font_size: number;
        episode_title_font_size: number;
        music_album_font_size: number;
        music_song_title_font_size: number;
      };
      multiple_backdrops: {
        mode: "single_backdrop" | "cycle";
        single_backdrop: "first" | "numbered" | "random";
        cycle_order: "numbered" | "shuffle";
      };
      animations: {
        enabled: boolean;
        style: BackdropAnimation | "All";
        scale: number;
        duration_seconds: number;
      };
      backdrop_motion?: {
        enabled: boolean;
        scale: number;
        duration_seconds: number;
      };
      transitions: { duration_ms: number; styles: TransitionStyle[] };
    };
  };
};

type Library = { id: string; name: string; type: string };
type BrowseItem = { id: string; name: string; type: string; thumbUrl?: string; backdropCount: number; artwork?: ArtworkRef };
type TransitionStyle =
  | "crossfade"
  | "fade"
  | "slide_left"
  | "slide_right"
  | "slide_up"
  | "slide_down"
  | "push_left"
  | "push_right"
  | "zoom_fade"
  | "soft_zoom"
  | "blur_fade"
  | "wipe_left"
  | "wipe_right";
type ActionIndicatorKind =
  | "sound-on"
  | "sound-off"
  | "favorite"
  | "unfavorite"
  | "shuffle-on"
  | "shuffle-off"
  | "play"
  | "pause"
  | "mode-now-playing"
  | "mode-screensaver";

const routeMatch = window.location.pathname.match(/^\/([^/?#]+)/);
const rawRouteSpace = routeMatch?.[1] ?? "livingroom";
const remoteRoute = rawRouteSpace.endsWith("-remote");
const route = { space: remoteRoute ? rawRouteSpace.slice(0, -"-remote".length) : rawRouteSpace, remote: remoteRoute };
const passwordParam = rememberedPasswordParam(route.space);
const favoritesShuffleLibrary: Library = { id: "__favorites__", name: "Favorites", type: "favorites" };
const browserScrollPositions = new Map<string, number>();

function spaceApi(path = "") {
  const query = passwordParam ? `?password=${encodeURIComponent(passwordParam)}` : "";
  return `/api/space/${route.space}${path}${query}`;
}

function rememberedPasswordParam(space: string) {
  const key = `mediawall:${space}:password`;
  const queryPassword = new URLSearchParams(window.location.search).get("password");
  try {
    if (queryPassword !== null) {
      if (queryPassword) window.localStorage.setItem(key, queryPassword);
      else window.localStorage.removeItem(key);
      return queryPassword;
    }
    return window.localStorage.getItem(key);
  } catch {
    return queryPassword;
  }
}

function rememberedSoundMuted(space: string) {
  try {
    return window.localStorage.getItem(`mediawall:${space}:sound-muted`) === "true";
  } catch {
    return false;
  }
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [visible, setVisible] = useState(true);
  const [panel, setPanel] = useState<"none" | "browse">("none");
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [activeLibrary, setActiveLibrary] = useState<string>();
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [shuffleOpen, setShuffleOpen] = useState(false);
  const [mediaInfoOpen, setMediaInfoOpen] = useState(false);
  const [favoritePicker, setFavoritePicker] = useState<{ itemKey: string; backdrops: ArtworkRef[] }>();
  const [backdropStep, setBackdropStep] = useState(0);
  const [nowPlayingBackdropStep, setNowPlayingBackdropStep] = useState(0);
  const [toast, setToast] = useState<string>();
  const [toastVisible, setToastVisible] = useState(false);
  const [error, setError] = useState<string>();
  const [commandTick, setCommandTick] = useState(0);
  const [soundUnlockNeeded, setSoundUnlockNeeded] = useState(false);
  const [soundMuted, setSoundMuted] = useState(() => rememberedSoundMuted(route.space));
  const [soundIndicator, setSoundIndicator] = useState<"on" | "muted">();
  const [actionIndicator, setActionIndicator] = useState<ActionIndicatorKind>();
  const [availableSpaces, setAvailableSpaces] = useState<string[]>([]);
  const [userTransition, setUserTransition] = useState<{
    id: string;
    source: "jellyfin" | "navidrome";
    username: string;
    avatarUrl?: string;
    verb: string;
    durationSeconds: number;
    backgroundColor: string;
    avatarSize: number;
    usernameFontSize: number;
    messageFontSize: number;
    sourceIconSize: number;
    collectionImageUrl?: string;
    collectionImageSize?: number;
  }>();
  const [viewportSize, setViewportSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));
  const hideTimer = useRef<number | undefined>(undefined);
  const advanceTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);
  const toastExitTimer = useRef<number | undefined>(undefined);
  const soundsInitialized = useRef(false);
  const soundsUnlocked = useRef(false);
  const soundMutedRef = useRef(soundMuted);
  const pendingSound = useRef<{ tone: string; volume: number } | undefined>(undefined);
  const audioContext = useRef<AudioContext | undefined>(undefined);
  const audioBuffers = useRef(new Map<string, AudioBuffer>());
  const silentSource = useRef<AudioBufferSourceNode | undefined>(undefined);
  const seenSoundSessions = useRef(new Set<string>());
  const seenUserTransitions = useRef(new Set<string>());
  const userTransitionInactiveSince = useRef(new Map<string, number>());
  const seenSoundMedia = useRef(new Set<string>());
  const seenSoundUsers = useRef(new Set<string>());
  const seenControlCommands = useRef(new Set<string>());
  const seenControlCommandSteps = useRef(new Set<string>());
  const quietSuppressedStarts = useRef(new Set<string>());
  const activeSoundSessions = useRef(new Map<string, NonNullable<Snapshot["soundSessions"]>[number]>());
  const continuousInactiveSince = useRef(new Map<string, number>());
  const continuousResumeEligible = useRef(new Map<string, boolean>());
  const lastVisibleNowPlayingKey = useRef<string | undefined>(undefined);
  const nowPlayingBackdropSignatures = useRef(new Map<string, string>());
  const seenVisibleNowPlayingKeys = useRef(new Set<string>());
  const nowPlayingBackdropIndexes = useRef(new Map<string, number>());
  const centerTapTimes = useRef<number[]>([]);
  const centerTapActionTimer = useRef<number | undefined>(undefined);
  const soundIndicatorTimer = useRef<number | undefined>(undefined);
  const actionIndicatorTimer = useRef<number | undefined>(undefined);
  const userTransitionTimer = useRef<number | undefined>(undefined);
  const animationProgress = useRef(new Map<string, number>());
  const activeAnimationRun = useRef<{ key: string; startedAt: number; offset: number; period: number } | undefined>(undefined);

  const displayedArtwork = snapshot?.state.mode === "now-playing"
    ? (snapshot.nowPlaying?.playing ? snapshot.nowPlaying?.artwork : undefined) ?? snapshot.state.current
    : snapshot?.state.current;
  const previewArtwork = snapshot?.controlCommand?.type === "animation" ? snapshot.controlCommand.artwork : undefined;
  const showMediaWallPreview = snapshot?.controlCommand?.type === "mediawall";
  const showMediaWallIdle = showMediaWallPreview || (snapshot?.state.mode === "now-playing"
    && snapshot.config.now_playing.fallback === "mediawall"
    && !snapshot.nowPlaying?.playing);
  const activeAnimation = activeBackdropAnimation(snapshot);
  const viewportAspect = viewportSize.width / Math.max(viewportSize.height, 1);
  const viewportClass = viewportAspect < 1.45 ? "viewport-squareish" : viewportAspect < 1.75 ? "viewport-balanced" : "viewport-wide";
  const animationDurationSeconds = Math.max(
    1,
    snapshot?.config.display.animations?.duration_seconds
      ?? snapshot?.config.display.backdrop_motion?.duration_seconds
      ?? 26
  );
  const resolvedNowPlayingBackdropStep = snapshot?.presentation.backdropIndex ?? 0;
  const cycledArtwork = useMemo(
    () => previewArtwork ?? (snapshot?.state.mode === "now-playing" && snapshot.nowPlaying?.playing
      ? cycleNowPlayingBackdrop(displayedArtwork, snapshot, resolvedNowPlayingBackdropStep)
      : cycleBackdrop(displayedArtwork, snapshot, snapshot?.presentation.backdropIndex ?? backdropStep)),
    [
      previewArtwork,
      displayedArtwork,
      snapshot?.state.mode,
      snapshot?.nowPlaying?.playing,
      snapshot?.nowPlaying?.publicSessionId,
      snapshot?.nowPlaying?.publicMediaKey,
      snapshot?.config.now_playing.multiple_backdrops.enabled,
      snapshot?.config.display.multiple_backdrops.mode,
      snapshot?.config.display.multiple_backdrops.cycle_order,
      backdropStep,
      resolvedNowPlayingBackdropStep
    ]
  );
  const [flash, setFlash] = useState<string>();
  const [animationOffsetSeconds, setAnimationOffsetSeconds] = useState(0);
  const nowPlayingAnimationKey = snapshot?.state.mode === "now-playing"
    && snapshot.nowPlaying?.playing
    && activeAnimation
    && cycledArtwork?.backdropUrl
    ? visibleAnimationKey(cycledArtwork, snapshot.nowPlaying, activeAnimation)
    : undefined;
  const scanWithAlbumArt = Boolean(snapshot?.libraryScan
    && snapshot.state.mode === "now-playing"
    && snapshot.state.showAlbumArt
    && snapshot.nowPlaying?.albumArtUrl
    && isMusicArtwork(snapshot.nowPlaying.artwork ?? snapshot.state.current, snapshot.nowPlaying));

  useEffect(() => {
    const updateViewportAspect = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      setViewportSize({ width, height });
    };
    updateViewportAspect();
    window.addEventListener("resize", updateViewportAspect, { passive: true });
    window.addEventListener("orientationchange", updateViewportAspect, { passive: true });
    window.visualViewport?.addEventListener("resize", updateViewportAspect);
    return () => {
      window.removeEventListener("resize", updateViewportAspect);
      window.removeEventListener("orientationchange", updateViewportAspect);
      window.visualViewport?.removeEventListener("resize", updateViewportAspect);
    };
  }, []);

  useEffect(() => {
    const now = performance.now();
    const current = activeAnimationRun.current;
    if (current && current.key !== nowPlayingAnimationKey) {
      const elapsed = (now - current.startedAt) / 1000;
      animationProgress.current.set(current.key, (current.offset + elapsed) % current.period);
    }
    if (!nowPlayingAnimationKey) {
      activeAnimationRun.current = undefined;
      setAnimationOffsetSeconds(0);
      return;
    }
    if (!current || current.key !== nowPlayingAnimationKey) {
      const period = animationDurationSeconds * 2;
      const offset = animationProgress.current.get(nowPlayingAnimationKey) ?? 0;
      activeAnimationRun.current = { key: nowPlayingAnimationKey, startedAt: now, offset, period };
      setAnimationOffsetSeconds(offset);
      return;
    }
    activeAnimationRun.current = { ...current, period: animationDurationSeconds * 2 };
  }, [nowPlayingAnimationKey, animationDurationSeconds]);

  useEffect(() => {
    return () => {
      const current = activeAnimationRun.current;
      if (!current) return;
      const elapsed = (performance.now() - current.startedAt) / 1000;
      animationProgress.current.set(current.key, (current.offset + elapsed) % current.period);
    };
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 3500);
    const events = new EventSource(spaceApi("/events"));
    events.addEventListener("sync", () => void refresh());
    return () => {
      window.clearInterval(timer);
      events.close();
    };
  }, []);

  useEffect(() => {
    soundMutedRef.current = soundMuted;
    if (soundMuted) {
      pendingSound.current = undefined;
      setSoundUnlockNeeded(false);
    }
  }, [soundMuted]);

  useEffect(() => {
    return () => {
      window.clearTimeout(centerTapActionTimer.current);
      window.clearTimeout(soundIndicatorTimer.current);
      window.clearTimeout(actionIndicatorTimer.current);
      window.clearTimeout(userTransitionTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!snapshot?.libraryScan) return;
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [snapshot?.libraryScan?.source, snapshot?.libraryScan?.active, snapshot?.libraryScan?.completed]);

  useEffect(() => {
    revealControls();
    window.addEventListener("mousemove", revealControls, { passive: true });
    window.addEventListener("pointerdown", revealControls, { passive: true });
    window.addEventListener("touchstart", revealControls, { passive: true });
    return () => {
      window.removeEventListener("mousemove", revealControls);
      window.removeEventListener("pointerdown", revealControls);
      window.removeEventListener("touchstart", revealControls);
    };
  }, []);

  useEffect(() => {
    window.addEventListener("pointerdown", requestSoundUnlock);
    window.addEventListener("touchstart", requestSoundUnlock);
    window.addEventListener("keydown", requestSoundUnlock);
    return () => {
      window.removeEventListener("pointerdown", requestSoundUnlock);
      window.removeEventListener("touchstart", requestSoundUnlock);
      window.removeEventListener("keydown", requestSoundUnlock);
    };
  }, [snapshot?.config.now_playing.sounds.tone, snapshot?.config.now_playing.sounds.available]);

  useEffect(() => {
    if (!snapshot?.config.now_playing.sounds.enabled || soundMuted) {
      setSoundUnlockNeeded(false);
      return;
    }
    if (!soundsUnlocked.current) setSoundUnlockNeeded(true);
  }, [snapshot?.config.now_playing.sounds.enabled, soundMuted]);

  useEffect(() => {
    window.clearTimeout(advanceTimer.current);
    const nextAt = snapshot?.presentation.nextTransitionAt;
    if (!nextAt) return;
    advanceTimer.current = window.setTimeout(() => void refresh(), Math.max(50, nextAt - Date.now() + 25));
    return () => window.clearTimeout(advanceTimer.current);
  }, [snapshot?.presentation.nextTransitionAt]);

  useEffect(() => {
    setBackdropStep(0);
    if (!snapshot || snapshot.config.display.multiple_backdrops.mode !== "cycle") return;
    const count = displayedArtwork?.backdropCount ?? 0;
    if (count < 2 || snapshot.state.mode !== "screensaver") return;
    const intervalMs = Math.max(1200, (snapshot.config.display.cycle_interval_seconds * 1000) / count);
    const timer = window.setInterval(() => setBackdropStep((current) => current + 1), intervalMs);
    return () => window.clearInterval(timer);
  }, [
    snapshot?.state.mode,
    snapshot?.config.display.multiple_backdrops.mode,
    snapshot?.config.display.cycle_interval_seconds,
    displayedArtwork?.itemId,
    displayedArtwork?.imageIndex,
    displayedArtwork?.backdropCount
  ]);

  useEffect(() => {
    const now = snapshot?.nowPlaying;
    const config = snapshot?.config.now_playing.multiple_backdrops;
    const key = now?.publicSessionId ?? now?.publicMediaKey;
    const count = displayedArtwork?.backdropCount ?? 0;
    if (
      !snapshot
      || snapshot.state.mode !== "now-playing"
      || !now?.playing
      || !config?.enabled
      || !key
      || count < 2
      || (now.sessionCount ?? 0) > 1
    ) return;
    const intervalMs = Math.max(1, config.interval_seconds) * 1000;
    const timer = window.setInterval(() => {
      setNowPlayingBackdropStep((tick) => {
        const next = (nowPlayingBackdropIndexes.current.get(key) ?? 0) + 1;
        nowPlayingBackdropIndexes.current.set(key, next);
        return tick + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [
    snapshot?.state.mode,
    snapshot?.nowPlaying?.playing,
    snapshot?.nowPlaying?.publicSessionId,
    snapshot?.nowPlaying?.publicMediaKey,
    snapshot?.nowPlaying?.sessionCount,
    snapshot?.config.now_playing.multiple_backdrops.enabled,
    snapshot?.config.now_playing.multiple_backdrops.interval_seconds,
    displayedArtwork?.itemId,
    displayedArtwork?.backdropCount
  ]);

  function resolveNowPlayingBackdropStep() {
    const now = snapshot?.nowPlaying;
    const config = snapshot?.config.now_playing.multiple_backdrops;
    const key = now?.publicSessionId ?? now?.publicMediaKey;
    const count = displayedArtwork?.backdropCount ?? 0;
    if (!snapshot || snapshot.state.mode !== "now-playing" || !now?.playing || !config?.enabled || !key || count < 2) {
      lastVisibleNowPlayingKey.current = undefined;
      return 0;
    }

    const backdropSignature = nowPlayingBackdropSignature(displayedArtwork);
    const sameVisibleSession = lastVisibleNowPlayingKey.current === key;
    const previousBackdropSignature = nowPlayingBackdropSignatures.current.get(key);
    if (sameVisibleSession && previousBackdropSignature === backdropSignature) {
      return nowPlayingBackdropIndexes.current.get(key) ?? 0;
    }

    nowPlayingBackdropSignatures.current.set(key, backdropSignature);
    const multipleSessions = (now.sessionCount ?? 0) > 1;
    const previous = nowPlayingBackdropIndexes.current.get(key) ?? 0;
    const next = multipleSessions && !sameVisibleSession && seenVisibleNowPlayingKeys.current.has(key)
      ? previous + 1
      : multipleSessions
        ? previous
        : 0;

    lastVisibleNowPlayingKey.current = key;
    seenVisibleNowPlayingKeys.current.add(key);
    nowPlayingBackdropIndexes.current.set(key, next);
    return next;
  }

  useEffect(() => {
    if (panel === "browse") void loadLibraries();
  }, [panel]);

  useEffect(() => {
    if (!libraries.length) return;
    if (!activeLibrary || !libraries.some((library) => library.id === activeLibrary)) {
      setActiveLibrary(libraries[0]?.id);
    }
  }, [libraries, activeLibrary]);

  useEffect(() => {
    if (activeLibrary) void loadItems(activeLibrary);
  }, [activeLibrary, libraries]);

  useEffect(() => {
    const now = snapshot?.nowPlaying;
    const soundConfig = snapshot?.config.now_playing.sounds;
    if (route.remote || !snapshot || !soundConfig?.enabled) {
      activeSoundSessions.current.clear();
      quietSuppressedStarts.current.clear();
      continuousResumeEligible.current.clear();
      return;
    }
    if (snapshot.state.mode !== "now-playing") {
      activeSoundSessions.current.clear();
      quietSuppressedStarts.current.clear();
      continuousResumeEligible.current.clear();
      return;
    }

    const currentTimestamp = Date.now();
    const quiet = quietHoursActive(soundConfig.quiet_hours);
    const activeSessions = (snapshot.soundSessions ?? []).filter((session) => soundSourceAllowed(session.source, soundConfig));
    const activeKeys = new Set(activeSessions.map((session) => session.key));
    const previousSessions = activeSoundSessions.current;

    for (const [key, session] of previousSessions.entries()) {
      if (activeKeys.has(key)) continue;
      previousSessions.delete(key);
      quietSuppressedStarts.current.delete(key);
      continuousResumeEligible.current.delete(key);
      if (session.continuous) continuousInactiveSince.current.set(key, currentTimestamp);
      if (soundsInitialized.current && soundConfig.session_end.enabled && soundSourceAllowed(session.source, soundConfig) && !quiet) {
        const tone = safeToneName(session.endSoundTone, soundConfig.available)
          ?? safeToneName(soundConfig.session_end.tone, soundConfig.available);
        if (tone) void playSound(tone, soundConfig.volume);
      }
    }

    for (const session of activeSessions) {
      if (session.continuous && continuousInactiveSince.current.has(session.key)) {
        const inactiveSince = continuousInactiveSince.current.get(session.key) ?? currentTimestamp;
        const cooldownMs = Math.max(0, soundConfig.session_start.retrigger_after_inactive_seconds) * 1000;
        continuousResumeEligible.current.set(session.key, currentTimestamp - inactiveSince >= cooldownMs);
        continuousInactiveSince.current.delete(session.key);
      }
      previousSessions.set(session.key, session);
    }

    const visibleSession = now?.playing && now.publicSoundSessionKey
      ? activeSessions.find((session) => session.key === now.publicSoundSessionKey)
      : undefined;
    if (!now || !visibleSession) {
      if (!soundsInitialized.current) soundsInitialized.current = true;
      return;
    }

    const mediaKey = visibleSoundMediaKey(now);
    const isNewSoundSession = !seenSoundSessions.current.has(visibleSession.key);
    const wasQuietSuppressed = quietSuppressedStarts.current.has(visibleSession.key);
    const isDuplicateMedia = seenSoundMedia.current.has(mediaKey);
    const isNewUser = !seenSoundUsers.current.has(visibleSession.userKey);
    const resumeEligible = continuousResumeEligible.current.get(visibleSession.key);
    const continuousCooldownAllowsStart = !visibleSession.continuous || resumeEligible !== false;
    const startEligible = visibleSession.continuous
      ? isNewSoundSession || resumeEligible === true
      : isNewSoundSession;

    const transitionEvent = snapshot.userTransitionEvent;
    const eventMatchesVisibleSession = transitionEvent?.sessionKey === visibleSession.key;
    const initialSoundPass = !soundsInitialized.current;
    continuousResumeEligible.current.delete(visibleSession.key);
    seenSoundSessions.current.add(visibleSession.key);
    seenSoundMedia.current.add(mediaKey);
    seenSoundUsers.current.add(visibleSession.userKey);

    if (!soundsInitialized.current) soundsInitialized.current = true;
    if (!eventMatchesVisibleSession) return;
    const localSoundEventKey = `mediawall:${route.space}:sound-event:${transitionEvent.id}`;
    if (window.sessionStorage.getItem(localSoundEventKey)) return;
    window.sessionStorage.setItem(localSoundEventKey, "played");
    if (initialSoundPass && visibleSession.continuous && transitionEvent.startedAt < Date.now() - 10_000) return;
    if (!startEligible) return;
    if (wasQuietSuppressed) return;
    if (!continuousCooldownAllowsStart) return;
    if (!visibleSession.continuous && isDuplicateMedia) return;
    if (soundConfig.trigger === "new_user_session" && !isNewUser) return;
    if (quiet) {
      quietSuppressedStarts.current.add(visibleSession.key);
      return;
    }

    const tone = safeToneName(now.soundTone, soundConfig.available)
      ?? safeToneName(soundConfig.tone, soundConfig.available);
    if (!tone) return;
    if (snapshot.config.now_playing.user_transition.enabled) void playSound(tone, soundConfig.volume);
    else void playVisibleSessionSound(tone, soundConfig.volume, cycledArtwork);
  }, [
    snapshot?.nowPlaying?.publicSoundSessionKey,
    snapshot?.nowPlaying?.publicMediaKey,
    snapshot?.nowPlaying?.playing,
    snapshot?.nowPlaying?.mediaWallUser,
    snapshot?.nowPlaying?.source,
    snapshot?.userTransitionEvent?.id,
    snapshot?.soundSessions?.map((session) => session.key).join("|"),
    cycledArtwork?.backdropUrl
  ]);

  useEffect(() => {
    if (route.remote) return;
    if (!snapshot) return;
    const now = snapshot.nowPlaying;
    const key = now?.publicSoundSessionKey ?? now?.publicSessionId;
    const event = snapshot.userTransitionEvent;
    if (snapshot.state.mode !== "now-playing" || !now?.playing || !key || !event || event.sessionKey !== key) return;
    if (seenUserTransitions.current.has(event.id)) return;
    seenUserTransitions.current.add(event.id);
    startUserTransition(now);
  }, [
    snapshot?.config.now_playing.sounds.enabled,
    snapshot?.state.mode,
    snapshot?.nowPlaying?.publicSoundSessionKey,
    snapshot?.nowPlaying?.publicSessionId,
    snapshot?.nowPlaying?.playing,
    snapshot?.userTransitionEvent?.id
  ]);

  useEffect(() => {
    const command = snapshot?.controlCommand;
    const soundConfig = snapshot?.config.now_playing.sounds;
    if (!command || command.type !== "sound" || !soundConfig) return;
    const activeTone = activeSoundCommandTone(command);
    if (!activeTone) return;
    const stepKey = `${command.id}:${activeTone.index}`;
    if (seenControlCommandSteps.current.has(stepKey)) return;
    seenControlCommandSteps.current.add(stepKey);
    seenControlCommands.current.add(command.id);
    void playSound(activeTone.tone, soundConfig.volume);
  }, [snapshot?.controlCommand?.id, commandTick]);

  useEffect(() => {
    const command = snapshot?.controlCommand;
    if (!command || command.type !== "user_transition") return;
    if (seenControlCommands.current.has(command.id)) return;
    seenControlCommands.current.add(command.id);
    startUserTransition({
      source: command.source ?? "jellyfin",
      playing: true,
      paused: false,
      user: command.username ?? command.name,
      displayUser: command.username ?? command.name,
      displayUserAvatarUrl: command.avatarUrl,
      publicSessionId: command.id,
      publicSoundSessionKey: command.id,
      collectionTransitionImageUrl: command.collectionImageUrl,
      collectionTransitionImageSize: command.collectionImageSize
    });
  }, [snapshot?.controlCommand?.id]);

  useEffect(() => {
    if (!snapshot?.controlCommand) return;
    const timer = window.setInterval(() => setCommandTick((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot?.controlCommand?.id]);

  useEffect(() => {
    if (!route.remote) return;
    fetch("/api/spaces")
      .then((response) => response.ok ? response.json() : undefined)
      .then((body: { spaces?: string[] } | undefined) => setAvailableSpaces(body?.spaces ?? []))
      .catch(() => setAvailableSpaces([]));
  }, []);

  useEffect(() => {
    if (route.remote) return;
    const indicator = snapshot?.uiIndicator;
    if (!indicator) return;
    showActionIndicator(indicator.kind);
  }, [snapshot?.uiIndicator?.id]);

  useEffect(() => {
    const avatarUrl = snapshot?.nowPlaying?.displayUserAvatarUrl;
    if (!avatarUrl) return;
    const image = new window.Image();
    image.decoding = "async";
    image.src = mediaUrl(avatarUrl) ?? avatarUrl;
  }, [snapshot?.nowPlaying?.displayUserAvatarUrl]);

  async function playSound(tone: string, volume: number) {
    if (soundMutedRef.current) {
      pendingSound.current = undefined;
      setSoundUnlockNeeded(false);
      return;
    }
    const safeVolume = Math.max(0, Math.min(1, volume));
    if (soundsUnlocked.current) {
      try {
        const context = await readyAudioContext();
        if (context) {
          const buffer = await soundBuffer(tone, context);
          const source = context.createBufferSource();
          const gain = context.createGain();
          source.buffer = buffer;
          gain.gain.value = safeVolume;
          source.connect(gain);
          gain.connect(context.destination);
          source.start();
          return;
        }
      } catch {
        soundsUnlocked.current = false;
      }
    }
    const audio = new Audio(spaceApi(`/sounds/${encodeURIComponent(tone)}`));
    audio.preload = "auto";
    audio.volume = safeVolume;
    try {
      await audio.play();
      soundsUnlocked.current = true;
    } catch {
      pendingSound.current = { tone, volume };
      soundsUnlocked.current = false;
      setSoundUnlockNeeded(true);
    }
  }

  async function playVisibleSessionSound(tone: string, volume: number, artwork?: ArtworkRef) {
    const url = mediaUrl(artwork?.backdropUrl);
    if (url) await waitForImageLoad(url, 1500);
    await playSound(tone, volume);
  }

  function waitForImageLoad(url: string, timeoutMs: number) {
    return new Promise<void>((resolve) => {
      const image = new window.Image();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const timer = window.setTimeout(finish, timeoutMs);
      image.onload = () => {
        window.clearTimeout(timer);
        finish();
      };
      image.onerror = () => {
        window.clearTimeout(timer);
        finish();
      };
      image.src = url;
    });
  }

  async function requestSoundUnlock() {
    if (soundMutedRef.current) {
      pendingSound.current = undefined;
      setSoundUnlockNeeded(false);
      return;
    }
    if (soundsUnlocked.current) return;
    const unlocked = await unlockAudioContext();
    soundsUnlocked.current = unlocked;
    setSoundUnlockNeeded(!unlocked);
    if (!unlocked) return;
    const pending = pendingSound.current;
    pendingSound.current = undefined;
    if (pending) {
      void playSound(pending.tone, pending.volume);
      return;
    }
    const sounds = snapshot?.config.now_playing.sounds;
    const confirmationTone = sounds ? safeToneName(sounds.tone, sounds.available) : undefined;
    if (confirmationTone && sounds) void playSound(confirmationTone, sounds.volume);
  }

  async function unlockAudioContext() {
    const context = await readyAudioContext();
    if (!context) return false;
    try {
      const buffer = context.createBuffer(1, 1, 22050);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(context.destination);
      source.start();
      silentSource.current?.stop();
      silentSource.current = source;
      return true;
    } catch {
      return context.state === "running";
    }
  }

  async function readyAudioContext() {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return undefined;
    const context = audioContext.current ?? new AudioContextClass();
    audioContext.current = context;
    if (context.state === "suspended") await context.resume();
    return context;
  }

  async function soundBuffer(tone: string, context: AudioContext) {
    const cached = audioBuffers.current.get(tone);
    if (cached) return cached;
    const response = await fetch(spaceApi(`/sounds/${encodeURIComponent(tone)}`));
    if (!response.ok) throw new Error(`Unable to load sound ${tone}`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    audioBuffers.current.set(tone, buffer);
    return buffer;
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!snapshot || shouldIgnoreShortcut(event)) return;
      if (event.key === "Escape" && isFullscreen()) {
        event.preventDefault();
        void exitFullscreen();
        return;
      }
      if (shuffleOpen || mediaInfoOpen || favoritePicker) return;

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        void setMode(snapshot.state.mode === "screensaver" ? "now-playing" : "screensaver");
        return;
      }

      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        toggleSoundMuted();
        return;
      }

      if (snapshot.state.mode === "now-playing") {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          void action("playback-previous");
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          void action("playback-next");
        } else if (event.key === " ") {
          event.preventDefault();
          void action("playback-toggle");
        } else if (event.key.toLowerCase() === "a") {
          event.preventDefault();
          void setPreference({ showAlbumArt: !snapshot.state.showAlbumArt });
        } else if (event.key.toLowerCase() === "l") {
          event.preventDefault();
          void setPreference({ showLogo: !snapshot.state.showLogo });
        } else if (event.key.toLowerCase() === "i") {
          event.preventDefault();
          void toggleContextualMediaInfo();
        }
        return;
      }

      if (snapshot.state.mode !== "screensaver") return;

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          void action("previous");
          break;
        case "ArrowRight":
          event.preventDefault();
          void action("next");
          break;
        case "ArrowUp":
          event.preventDefault();
          void action("up");
          break;
        case "ArrowDown":
          event.preventDefault();
          void action("down");
          break;
        case " ":
          event.preventDefault();
          void action("toggle");
          break;
        default: {
          const key = event.key.toLowerCase();
          if (key === "l") {
            event.preventDefault();
            void setPreference({ showLogo: !snapshot.state.showLogo });
          } else if (key === "i") {
            event.preventDefault();
            void toggleContextualMediaInfo();
          } else if (key === "a") {
            event.preventDefault();
            void setPreference({ showAlbumArt: !snapshot.state.showAlbumArt });
          } else if (key === "s") {
            event.preventDefault();
            void toggleShuffle();
          } else if (key === "g") {
            event.preventDefault();
            showBrowsePanel(panel === "browse" ? "none" : "browse");
          } else if (key === "c") {
            event.preventDefault();
            void openShuffleSettings();
          }
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [snapshot, cycledArtwork, panel, shuffleOpen, mediaInfoOpen, favoritePicker]);

  async function refresh() {
    try {
      const next = await api<Snapshot>(spaceApi());
      setSnapshot(next);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load display");
    }
  }

  function revealControls() {
    setVisible(true);
    document.body.classList.remove("idle");
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setVisible(false);
      closeOverlays();
      document.body.classList.add("idle");
    }, 4200);
  }

  function closeOverlays(keep?: "browse" | "shuffle" | "mediaInfo" | "favoritePicker") {
    if (keep !== "browse") setPanel("none");
    if (keep !== "shuffle") setShuffleOpen(false);
    if (keep !== "mediaInfo") setMediaInfoOpen(false);
    if (keep !== "favoritePicker") setFavoritePicker(undefined);
  }

  function showBrowsePanel(nextPanel: "none" | "browse") {
    if (nextPanel === "browse") {
      closeOverlays("browse");
      setPanel("browse");
      return;
    }
    closeOverlays();
  }

  async function action(name: "next" | "previous" | "toggle" | "up" | "down" | "playback-previous" | "playback-next" | "playback-toggle") {
    flashButton(name);
    if (name === "next" || name === "previous" || name === "up" || name === "down") {
      window.clearTimeout(advanceTimer.current);
    }
    const result = await api<{ state: DisplayState; libraryName?: string; nowPlaying?: Snapshot["nowPlaying"]; sessionPosition?: number; sessionCount?: number }>(spaceApi(`/${name}`), { method: "POST" });
    if (name === "toggle") void emitActionIndicator(result.state.playing ? "play" : "pause");
    if (name === "playback-toggle") void emitActionIndicator(result.state.nowPlayingCyclePaused ? "pause" : "play");
    if ((name === "up" || name === "down") && result.libraryName) showToast(result.libraryName);
    setSnapshot((current) => current ? { ...current, state: result.state, mode: result.state.mode, nowPlaying: result.nowPlaying ?? current.nowPlaying } : current);
  }

  function handleWallPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!snapshot || shouldIgnoreWallPointer(event.target)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const leftEdge = bounds.width * 0.33;
    const rightEdge = bounds.width * 0.67;
    if (x <= leftEdge) {
      centerTapTimes.current = [];
      void action(snapshot.state.mode === "now-playing" ? "playback-previous" : "previous");
      return;
    }
    if (x >= rightEdge) {
      centerTapTimes.current = [];
      void action(snapshot.state.mode === "now-playing" ? "playback-next" : "next");
      return;
    }
    const centerAction = recordCenterTapAction();
    if (centerAction === "sound") {
      toggleSoundMuted();
      return;
    }
    if (centerAction === "fullscreen") {
      void toggleFullscreen();
      return;
    }
    revealControls();
  }

  function recordCenterTapAction() {
    const now = Date.now();
    centerTapTimes.current = [...centerTapTimes.current, now].filter((time) => now - time <= 650);
    if (snapshot?.config.now_playing.sounds.enabled && centerTapTimes.current.length >= 5) {
      window.clearTimeout(centerTapActionTimer.current);
      centerTapTimes.current = [];
      return "sound";
    }
    if (centerTapTimes.current.length >= 3 && centerTapActionTimer.current === undefined) {
      centerTapActionTimer.current = window.setTimeout(() => {
        centerTapActionTimer.current = undefined;
        centerTapTimes.current = [];
        void toggleFullscreen();
      }, 520);
    }
    return undefined;
  }

  function toggleSoundMuted() {
    if (!snapshot?.config.now_playing.sounds.enabled) return;
    setSoundMuted((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(`mediawall:${route.space}:sound-muted`, next ? "true" : "false");
      } catch {
        // Local storage can be unavailable in private or locked-down browser modes.
      }
      if (next) {
        pendingSound.current = undefined;
        setSoundUnlockNeeded(false);
      }
      showSoundIndicator(next ? "muted" : "on");
      void emitActionIndicator(next ? "sound-off" : "sound-on");
      return next;
    });
  }

  function showSoundIndicator(next: "on" | "muted") {
    setSoundIndicator(next);
    window.clearTimeout(soundIndicatorTimer.current);
    soundIndicatorTimer.current = window.setTimeout(() => setSoundIndicator(undefined), 850);
  }

  function showActionIndicator(kind: ActionIndicatorKind) {
    setActionIndicator(kind);
    window.clearTimeout(actionIndicatorTimer.current);
    actionIndicatorTimer.current = window.setTimeout(() => setActionIndicator(undefined), 900);
  }

  async function emitActionIndicator(kind: ActionIndicatorKind) {
    if (!route.remote) showActionIndicator(kind);
    try {
      await api(spaceApi("/indicator"), {
        method: "POST",
        body: JSON.stringify({ kind }),
        headers: { "Content-Type": "application/json" }
      });
    } catch {
      // Indicators are best-effort UI feedback.
    }
  }

  function startUserTransition(now: Snapshot["nowPlaying"]) {
    const config = snapshot?.config.now_playing.user_transition;
    if (!config?.enabled || !now) return false;
    const id = now.publicSoundSessionKey ?? now.publicSessionId ?? now.signature ?? `${now.source}:${Date.now()}`;
    const username = now.source === "navidrome"
      ? now.user ?? now.displayUser ?? now.mediaWallUser ?? "Navidrome"
      : now.displayUser ?? now.user ?? now.mediaWallUser ?? "Jellyfin";
    const verb = now.source === "navidrome" || isMusicArtwork(now.artwork, now)
      ? "started listening to"
      : "started watching";
    const durationSeconds = Math.max(0.5, config.duration_seconds ?? 3);
    window.clearTimeout(userTransitionTimer.current);
    setUserTransition({
      id,
      source: now.source,
      username,
      avatarUrl: now.source === "jellyfin" ? now.displayUserAvatarUrl : undefined,
      verb,
      durationSeconds,
      backgroundColor: config.background_color ?? "#000000",
      avatarSize: config.avatar_size ?? 240,
      usernameFontSize: config.username_font_size ?? 74,
      messageFontSize: config.message_font_size ?? 42,
      sourceIconSize: config.source_icon_size ?? 240,
      collectionImageUrl: now.collectionTransitionImageUrl,
      collectionImageSize: now.collectionTransitionImageSize
    });
    userTransitionTimer.current = window.setTimeout(() => setUserTransition(undefined), durationSeconds * 1000);
    return true;
  }

  async function toggleFullscreen() {
    if (isFullscreen()) {
      await exitFullscreen();
      return;
    }
    const element = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    if (element.requestFullscreen) await element.requestFullscreen();
    else await element.webkitRequestFullscreen?.();
  }

  async function exitFullscreen() {
    const fullscreenDocument = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    if (fullscreenDocument.webkitFullscreenElement) await fullscreenDocument.webkitExitFullscreen?.();
  }

  function isFullscreen() {
    const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element | null };
    return Boolean(document.fullscreenElement || fullscreenDocument.webkitFullscreenElement);
  }

  async function setMode(mode: "now-playing" | "screensaver") {
    flashButton("mode");
    const result = await api<{ state: DisplayState }>(spaceApi("/mode"), {
      method: "POST",
      body: JSON.stringify({ mode }),
      headers: { "Content-Type": "application/json" }
    });
    closeOverlays();
    void emitActionIndicator(mode === "screensaver" ? "mode-screensaver" : "mode-now-playing");
    setSnapshot((current) => current ? { ...current, state: result.state, mode: result.state.mode } : current);
  }

  async function toggleShuffle() {
    if (!snapshot) return;
    const nextShuffle = !snapshot.state.shuffle;
    const result = await api<{ state: DisplayState }>(spaceApi("/shuffle"), {
      method: "POST",
      body: JSON.stringify({ enabled: nextShuffle }),
      headers: { "Content-Type": "application/json" }
    });
    void emitActionIndicator(nextShuffle ? "shuffle-on" : "shuffle-off");
    setSnapshot((current) => current ? { ...current, state: result.state } : current);
  }

  async function saveShuffle(libraryNames: string[], preserveCurrent = false) {
    if (!snapshot) return;
    const result = await api<{ state: DisplayState }>(spaceApi("/shuffle"), {
      method: "POST",
      body: JSON.stringify({ enabled: snapshot.state.shuffle, libraries: libraryNames, preserveCurrent }),
      headers: { "Content-Type": "application/json" }
    });
    setSnapshot((current) => current ? { ...current, state: result.state, mode: result.state.mode } : current);
  }

  async function openShuffleSettings() {
    if (shuffleOpen) {
      closeOverlays();
      return;
    }
    closeOverlays("shuffle");
    if (libraries.length === 0) await loadLibraries();
    setShuffleOpen(true);
  }

  function openMediaInfoSettings() {
    if (mediaInfoOpen) {
      closeOverlays();
      return;
    }
    closeOverlays("mediaInfo");
    setMediaInfoOpen(true);
  }

  async function setPreference(patch: Partial<DisplayState>) {
    const result = await api<{ state: DisplayState }>(spaceApi("/preferences"), {
      method: "POST",
      body: JSON.stringify(patch),
      headers: { "Content-Type": "application/json" }
    });
    setSnapshot((current) => current ? { ...current, state: result.state, mode: result.state.mode } : current);
  }

  async function toggleContextualMediaInfo() {
    if (!snapshot) return;
    const artwork = snapshot.nowPlaying?.artwork ?? cycledArtwork;
    const type = mediaKind(artwork, snapshot.nowPlaying);
    const mediaInfo = { ...snapshot.state.mediaInfo };

    if (type === "movie") {
      mediaInfo.movie = !mediaInfo.movie;
    } else if (type === "episode") {
      const episodeInfo = mediaInfo.series_episode_info;
      const episodeTitle = mediaInfo.series_episode_title;
      if (episodeInfo && !episodeTitle) {
        mediaInfo.series_episode_info = false;
        mediaInfo.series_episode_title = true;
      } else if (!episodeInfo && episodeTitle) {
        mediaInfo.series_episode_info = true;
        mediaInfo.series_episode_title = true;
      } else if (episodeInfo && episodeTitle) {
        mediaInfo.series_episode_info = false;
        mediaInfo.series_episode_title = false;
      } else {
        mediaInfo.series_episode_info = true;
        mediaInfo.series_episode_title = false;
      }
    } else if (type === "music") {
      const album = mediaInfo.music_album;
      const title = mediaInfo.music_song_title;
      if (album && !title) {
        mediaInfo.music_album = false;
        mediaInfo.music_song_title = true;
      } else if (!album && title) {
        mediaInfo.music_album = true;
        mediaInfo.music_song_title = true;
      } else if (album && title) {
        mediaInfo.music_album = false;
        mediaInfo.music_song_title = false;
      } else {
        mediaInfo.music_album = true;
        mediaInfo.music_song_title = false;
      }
    } else {
      return;
    }

    await setPreference({ showSongInfo: true, mediaInfo });
  }

  async function toggleFavorite(artwork?: ArtworkRef) {
    if (!artwork) return;
    if ((artwork.backdropCount ?? 0) > 1) {
      closeOverlays("favoritePicker");
      setFavoritePicker({ itemKey: backdropPolicyKey(artwork), backdrops: await loadBackdrops(artwork) });
      return;
    }
    const result = await api<{ state: DisplayState }>(spaceApi("/favorite"), {
      method: "POST",
      body: JSON.stringify({ artwork }),
      headers: { "Content-Type": "application/json" }
    });
    void emitActionIndicator(favoriteExists(result.state, artwork) ? "favorite" : "unfavorite");
    setSnapshot((current) => current ? { ...current, state: result.state, mode: result.state.mode } : current);
  }

  async function confirmFavorites(artworks: ArtworkRef[]) {
    const result = await api<{ state: DisplayState }>(spaceApi("/favorite"), {
      method: "POST",
      body: JSON.stringify({ artworks, replaceItem: favoritePicker?.itemKey }),
      headers: { "Content-Type": "application/json" }
    });
    setFavoritePicker(undefined);
    setSnapshot((current) => current ? { ...current, state: result.state, mode: result.state.mode } : current);
  }

  async function loadBackdrops(artwork: ArtworkRef) {
    const separator = passwordParam ? "&" : "?";
    const result = await api<{ backdrops: ArtworkRef[] }>(
      `${spaceApi(`/items/${encodeURIComponent(artwork.itemId)}/backdrops`)}${separator}source=${encodeURIComponent(artwork.source)}&title=${encodeURIComponent(artwork.title)}`
    );
    return result.backdrops.length ? result.backdrops : [artwork];
  }

  async function selectItem(item: BrowseItem, sequence: BrowseItem[] = items, exactBackdrop = false, imageIndex = 0) {
    const library = libraries.find((entry) => entry.id === activeLibrary);
    const result = await api<{ state: DisplayState }>(spaceApi("/select"), {
      method: "POST",
      body: JSON.stringify({
        ...(item.artwork ? { artwork: item.artwork } : { itemId: item.id, imageIndex }),
        exactBackdrop,
        libraryId: activeLibrary ?? "",
        libraryType: library?.type ?? "",
        favoritesOnly
      }),
      headers: { "Content-Type": "application/json" }
    });
    setSnapshot((current) => current ? { ...current, state: result.state, mode: result.state.mode } : current);
    setPanel("none");
  }

  async function loadLibraries() {
    const result = await api<{ libraries: Library[] }>(spaceApi("/libraries"));
    setLibraries(result.libraries);
    setActiveLibrary((current) => current ?? result.libraries[0]?.id);
  }

  async function loadItems(libraryId: string) {
    const library = libraries.find((entry) => entry.id === libraryId);
    const separator = passwordParam ? "&" : "?";
    const result = await api<{ items: BrowseItem[] }>(`${spaceApi(`/libraries/${libraryId}/items`)}${separator}type=${encodeURIComponent(library?.type ?? "")}`);
    setItems(result.items);
  }

  function flashButton(name: string) {
    setFlash(name);
    window.setTimeout(() => setFlash((current) => current === name ? undefined : current), 280);
  }

  function showToast(message: string) {
    setToast(message);
    setToastVisible(false);
    window.clearTimeout(toastTimer.current);
    window.clearTimeout(toastExitTimer.current);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setToastVisible(true));
    });
    toastTimer.current = window.setTimeout(() => {
      setToastVisible(false);
      toastExitTimer.current = window.setTimeout(() => setToast(undefined), 240);
    }, 1900);
  }

  const isFavorite = useMemo(() => {
    if (!cycledArtwork || !snapshot) return false;
    const key = artworkKey(cycledArtwork);
    return snapshot.state.favorites.some((favorite) => artworkKey(favorite) === key);
  }, [cycledArtwork, snapshot]);

  if (error) return <div className="error">{error}</div>;

  if (route.remote) {
    return (
      <main
        className="remote-shell"
        style={{
          "--ui-scale": String(snapshot?.config.display.ui.scale ?? 1)
        } as React.CSSProperties}
        onPointerDown={revealControls}
      >
        <RemoteControl
          snapshot={snapshot}
          panel={panel}
          isFavorite={isFavorite}
          soundMuted={soundMuted}
          availableSpaces={availableSpaces}
          previewArtwork={cycledArtwork}
          onMode={setMode}
          onPrevious={() => action(snapshot?.state.mode === "now-playing" ? "playback-previous" : "previous")}
          onToggle={() => action(snapshot?.state.mode === "now-playing" ? "playback-toggle" : "toggle")}
          onNext={() => action(snapshot?.state.mode === "now-playing" ? "playback-next" : "next")}
          onShuffle={toggleShuffle}
          onShuffleSettings={openShuffleSettings}
          onPanel={() => showBrowsePanel(panel === "browse" ? "none" : "browse")}
          onFavorite={() => toggleFavorite(cycledArtwork)}
          onLogo={() => snapshot && setPreference({ showLogo: !snapshot.state.showLogo })}
          onMediaInfo={openMediaInfoSettings}
          onAlbumArt={() => snapshot && setPreference({ showAlbumArt: !snapshot.state.showAlbumArt })}
          onSound={toggleSoundMuted}
          onFullscreen={toggleFullscreen}
        />
        {snapshot && shuffleOpen && (
          <>
            <button className="remote-dismiss" type="button" aria-label="Close dialog" onClick={() => closeOverlays()} />
            <ShuffleDialog
              libraries={libraries}
              selected={snapshot.state.shuffleLibraries}
              onCancel={() => setShuffleOpen(false)}
              onChange={(libraryNames) => void saveShuffle(libraryNames, true)}
              onSave={() => setShuffleOpen(false)}
            />
          </>
        )}
        {snapshot && mediaInfoOpen && (
          <>
            <button className="remote-dismiss" type="button" aria-label="Close dialog" onClick={() => closeOverlays()} />
            <MediaInfoDialog
              state={snapshot.state}
              onCancel={() => setMediaInfoOpen(false)}
              onChange={(patch) => void setPreference(patch)}
              onSave={() => setMediaInfoOpen(false)}
            />
          </>
        )}
        {snapshot && favoritePicker && (
          <>
            <button className="remote-dismiss" type="button" aria-label="Close dialog" onClick={() => closeOverlays()} />
            <BackdropFavoriteDialog
              backdrops={favoritePicker.backdrops}
              favorites={snapshot.state.favorites}
              onCancel={() => setFavoritePicker(undefined)}
              onConfirm={confirmFavorites}
            />
          </>
        )}
        {panel === "browse" && (
          <>
            <button className="remote-dismiss" type="button" aria-label="Close grid" onClick={() => closeOverlays()} />
            <Browser
              libraries={libraries}
              activeLibrary={activeLibrary}
              items={items}
              favorites={snapshot?.state.favorites ?? []}
              favoritesOnly={favoritesOnly}
              onLibrary={setActiveLibrary}
              onFavoritesOnly={() => setFavoritesOnly((current) => !current)}
              onSelect={selectItem}
              onClose={() => closeOverlays()}
            />
          </>
        )}
        {toast && <div className={`toast ${toastVisible ? "visible" : ""}`}>{toast}</div>}
      </main>
    );
  }

  return (
    <main
      className={`wall ${viewportClass} transition-${snapshot?.state.transitionStyle ?? "crossfade"} ${activeAnimation ? `animation-enabled animation-${activeAnimation}` : ""} ${scanWithAlbumArt ? "scan-with-album-art" : ""}`}
      style={{
        "--transition-duration": `${snapshot?.config.display.transitions.duration_ms ?? 1200}ms`,
        "--viewport-width": `${viewportSize.width}px`,
        "--viewport-height": `${viewportSize.height}px`,
        "--backdrop-background": snapshot?.config.display.backdrop_background_color ?? "#050508",
        "--animation-scale": String(snapshot?.config.display.animations?.scale ?? snapshot?.config.display.backdrop_motion?.scale ?? 1.08),
        "--animation-duration": `${animationDurationSeconds}s`,
        "--animation-delay": nowPlayingAnimationKey ? `-${animationOffsetSeconds}s` : "0s",
        "--fallback-background": snapshot?.config.now_playing.mediawall_fallback.background_color ?? "#565954",
        "--fallback-logo-min": `${snapshot?.config.now_playing.mediawall_fallback.min_logo_width ?? 260}px`,
        "--fallback-logo-max": `${snapshot?.config.now_playing.mediawall_fallback.max_logo_width ?? 760}px`,
        "--album-art-size": `${snapshot?.config.display.album_art.size ?? 200}px`,
        "--ui-scale": String(snapshot?.config.display.ui.scale ?? 1)
      } as React.CSSProperties}
      onPointerMove={revealControls}
      onPointerDown={handleWallPointerDown}
    >
      {showMediaWallIdle && snapshot ? <MediaWallIdle snapshot={snapshot} /> : <Backdrop artwork={cycledArtwork} />}
      {userTransition && <UserTransitionIntro intro={userTransition} />}
      {!showMediaWallIdle && <div className="shade" />}
      {!showMediaWallIdle && <Identity snapshot={snapshot} artwork={cycledArtwork} />}
      <SessionTimer snapshot={snapshot} />
      <TopRightBadge snapshot={snapshot} />
      <ConnectionWarning snapshot={snapshot} />
      {soundUnlockNeeded && snapshot?.config.now_playing.sounds.enabled && !soundMuted && (
        <button className="sound-unlock" type="button" onClick={requestSoundUnlock}>
          Tap or click here once to enable sound
        </button>
      )}
      {soundIndicator && (
        <div className="sound-toggle-indicator" aria-live="polite">
          {soundIndicator === "muted" ? <VolumeX /> : <Volume2 />}
        </div>
      )}
      {actionIndicator && <ActionIndicator kind={actionIndicator} />}
      <ControlCommandLabel command={snapshot?.controlCommand} />
      <LibraryScanProgress snapshot={snapshot} />
      {toast && <div className={`toast ${toastVisible ? "visible" : ""}`}>{toast}</div>}
      {visible && (panel !== "none" || shuffleOpen || mediaInfoOpen || favoritePicker) && (
        <button
          className="dismiss-layer"
          type="button"
          aria-label="Close panel"
          onClick={() => closeOverlays()}
        />
      )}
      {visible && snapshot && (
        <ControlBar
          snapshot={snapshot}
          isFavorite={isFavorite}
          panel={panel}
          onPanel={showBrowsePanel}
          onMode={setMode}
          onPrevious={() => action("previous")}
          onToggle={() => action("toggle")}
          onNext={() => action("next")}
          onShuffle={toggleShuffle}
          onShuffleSettings={openShuffleSettings}
          onPlaybackPrevious={() => action("playback-previous")}
          onPlaybackToggle={() => action("playback-toggle")}
          onPlaybackNext={() => action("playback-next")}
          onFavorite={() => toggleFavorite(cycledArtwork)}
          flash={flash}
          onLogo={() => setPreference({ showLogo: !snapshot.state.showLogo })}
          onMediaInfo={openMediaInfoSettings}
          onAlbumArt={() => setPreference({ showAlbumArt: !snapshot.state.showAlbumArt })}
          onFullscreen={toggleFullscreen}
          onSound={toggleSoundMuted}
          soundMuted={soundMuted}
        />
      )}
      {visible && snapshot && shuffleOpen && (
        <ShuffleDialog
          libraries={libraries}
          selected={snapshot.state.shuffleLibraries}
          onCancel={() => setShuffleOpen(false)}
          onChange={(libraryNames) => void saveShuffle(libraryNames, true)}
          onSave={() => setShuffleOpen(false)}
        />
      )}
      {visible && snapshot && mediaInfoOpen && (
        <MediaInfoDialog
          state={snapshot.state}
          onCancel={() => setMediaInfoOpen(false)}
          onChange={(patch) => void setPreference(patch)}
          onSave={() => {
            setMediaInfoOpen(false);
          }}
        />
      )}
      {visible && snapshot && favoritePicker && (
        <BackdropFavoriteDialog
          backdrops={favoritePicker.backdrops}
          favorites={snapshot.state.favorites}
          onCancel={() => setFavoritePicker(undefined)}
          onConfirm={confirmFavorites}
        />
      )}
      {visible && panel === "browse" && (
        <Browser
          libraries={libraries}
          activeLibrary={activeLibrary}
          items={items}
          favorites={snapshot?.state.favorites ?? []}
          favoritesOnly={favoritesOnly}
          onLibrary={setActiveLibrary}
          onFavoritesOnly={() => setFavoritesOnly((current) => !current)}
          onSelect={selectItem}
          onClose={() => closeOverlays()}
        />
      )}
    </main>
  );
}

function Backdrop({ artwork }: { artwork?: ArtworkRef }) {
  const [front, setFront] = useState<string>();
  const [back, setBack] = useState<string>();
  const [flipped, setFlipped] = useState(false);
  const targetUrl = useRef<string | undefined>(undefined);
  const url = mediaUrl(artwork?.backdropUrl);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const activeUrl = flipped ? back : front;
    if (url === activeUrl) return;
    if (url === targetUrl.current) return;
    targetUrl.current = url;
    if (url === front || url === back) {
      setFlipped(url === back);
      return;
    }
    const image = new window.Image();
    image.decoding = "async";
    async function swapAfterDecode() {
      try {
        await image.decode?.();
      } catch {
        // Some browsers reject decode for cached/proxied images even after load.
      }
      if (cancelled) return;
      if (flipped) setFront(url);
      else setBack(url);
      setFlipped((current) => !current);
    }
    image.onload = () => void swapAfterDecode();
    image.onerror = () => {
      if (targetUrl.current === url) targetUrl.current = undefined;
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, front, back, flipped]);

  const active = flipped ? back : front;

  return (
    <>
      <BackdropLayer className="backdrop base" url={active} />
      <BackdropLayer className={`backdrop layer-a ${flipped ? "leaving" : "active"}`} url={front} />
      <BackdropLayer className={`backdrop layer-b ${flipped ? "active" : "leaving"}`} url={back} />
    </>
  );
}

function BackdropLayer({ className, url }: { className: string; url?: string }) {
  return (
    <div className={className}>
      <div className="backdrop-image" style={{ backgroundImage: url ? `url("${url}")` : undefined }} />
    </div>
  );
}

function MediaWallIdle({ snapshot }: { snapshot: Snapshot }) {
  const commandMode = activeMediaWallCommandMode(snapshot.controlCommand);
  const mode = commandMode
    ?? snapshot.activeMediaWallFallbackMode
    ?? firstMediaWallFallbackMode(snapshot.config.now_playing.mediawall_fallback.modes);
  const commandLabel = snapshot.controlCommand?.type === "mediawall" ? mediaWallModeLabel(mode) : undefined;
  const fallbackImage = snapshot.config.now_playing.mediawall_fallback.image;
  const customLogoUrl = fallbackImage === "custom" ? spaceApi("/custom-logo") : fallbackImage === "banner_white" ? mediaWallBannerWhite : mediaWallBanner;
  const modeWidth = snapshot.config.now_playing.mediawall_fallback.sizes?.[mode]
    ?? snapshot.config.now_playing.mediawall_fallback.max_logo_width
    ?? 760;
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (mode !== "dvd") return;
    let frame = 0;
    let last = performance.now();
    let x = 24 + Math.random() * 140;
    let y = 24 + Math.random() * 100;
    let speed = 190 + Math.random() * 85;
    let angle = (Math.PI * 0.18) + Math.random() * (Math.PI * 0.64);
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;

    function randomizeDirection(axis: "x" | "y") {
      speed = 190 + Math.random() * 95;
      if (axis === "x") {
        vx = Math.sign(vx || 1) * (120 + Math.random() * speed);
        vy += (Math.random() - 0.5) * 110;
      } else {
        vy = Math.sign(vy || 1) * (120 + Math.random() * speed);
        vx += (Math.random() - 0.5) * 110;
      }
      const magnitude = Math.hypot(vx, vy) || speed;
      vx = (vx / magnitude) * speed;
      vy = (vy / magnitude) * speed;
    }

    function bounds() {
      const rect = imageRef.current?.getBoundingClientRect();
      const margin = 24;
      return {
        minX: margin,
        minY: margin,
        maxX: Math.max(margin, window.innerWidth - (rect?.width ?? 760) - margin),
        maxY: Math.max(margin, window.innerHeight - (rect?.height ?? 190) - margin)
      };
    }

    function tick(now: number) {
      const elapsed = Math.min(0.05, (now - last) / 1000);
      last = now;
      const area = bounds();
      x += vx * elapsed;
      y += vy * elapsed;

      if (x <= area.minX) {
        x = area.minX;
        vx = Math.abs(vx);
        randomizeDirection("x");
      } else if (x >= area.maxX) {
        x = area.maxX;
        vx = -Math.abs(vx);
        randomizeDirection("x");
      }

      if (y <= area.minY) {
        y = area.minY;
        vy = Math.abs(vy);
        randomizeDirection("y");
      } else if (y >= area.maxY) {
        y = area.maxY;
        vy = -Math.abs(vy);
        randomizeDirection("y");
      }

      const image = imageRef.current;
      image?.style.setProperty("--dvd-x", `${x}px`);
      image?.style.setProperty("--dvd-y", `${y}px`);
      frame = window.requestAnimationFrame(tick);
    }

    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [mode]);

  return (
    <section className={`mediawall-idle mediawall-idle-${mode}`} style={{ "--fallback-logo-mode-width": `${modeWidth}px` } as React.CSSProperties}>
      <div className="mediawall-idle-spotlight" />
      <img ref={imageRef} src={customLogoUrl} alt="MediaWall" onError={(event) => { event.currentTarget.src = mediaWallBanner; }} />
      {commandLabel && <div className="mediawall-command-label">{commandLabel}</div>}
    </section>
  );
}

function UserTransitionIntro({ intro }: {
  intro: {
    source: "jellyfin" | "navidrome";
    username: string;
    avatarUrl?: string;
    verb: string;
    durationSeconds: number;
    backgroundColor: string;
    avatarSize: number;
    usernameFontSize: number;
    messageFontSize: number;
    sourceIconSize: number;
    collectionImageUrl?: string;
    collectionImageSize?: number;
  };
}) {
  const icon = intro.source === "navidrome" ? navidromeLogo : jellyfinLogo;
  return (
    <section
      className="user-transition-intro"
      style={{
        "--user-transition-duration": `${intro.durationSeconds}s`,
        "--user-transition-background": intro.backgroundColor,
        "--user-transition-avatar-size": `${intro.avatarSize}px`,
        "--user-transition-username-size": `${intro.usernameFontSize}px`,
        "--user-transition-message-size": `${intro.messageFontSize}px`,
        "--user-transition-source-icon-size": `${intro.sourceIconSize}px`,
        "--user-transition-collection-image-size": `${intro.collectionImageSize ?? 260}px`
      } as React.CSSProperties}
      aria-live="polite"
    >
      <img className="user-transition-source-icon" src={icon} alt="" />
      <div className="user-transition-card">
        <div className={`user-transition-person ${intro.avatarUrl ? "with-avatar" : "no-avatar"}`}>
          {intro.avatarUrl && <img src={mediaUrl(intro.avatarUrl)} alt="" />}
          <span>{intro.username}</span>
        </div>
        <div className="user-transition-verb">{intro.verb}</div>
        {intro.collectionImageUrl && <img className="user-transition-collection-image" src={mediaUrl(intro.collectionImageUrl)} alt="" />}
      </div>
    </section>
  );
}

function activeMediaWallCommandMode(command?: Snapshot["controlCommand"]): MediaWallFallbackMode | undefined {
  if (!command || command.type !== "mediawall") return undefined;
  const modes = command.modes?.length ? command.modes : command.mode ? [command.mode] : [];
  if (!modes.length) return undefined;
  const elapsedSeconds = Math.max(0, (Date.now() - command.startedAt) / 1000);
  const durationSeconds = Math.max(1, command.modeDurationSeconds ?? 30);
  const index = Math.min(modes.length - 1, Math.floor(elapsedSeconds / durationSeconds));
  return modes[index];
}

function mediaWallModeLabel(mode: MediaWallFallbackMode) {
  return mode.replace(/_/g, " ").toLowerCase();
}

function firstMediaWallFallbackMode(modes: Array<MediaWallFallbackMode | "All">) {
  return modes.find((mode): mode is MediaWallFallbackMode => mode !== "All") ?? "dvd";
}

function activeBackdropAnimation(snapshot?: Snapshot): BackdropAnimation | undefined {
  const command = snapshot?.controlCommand;
  if (command?.type === "animation") return activeAnimationCommand(command)?.animation;
  const config = snapshot?.config.display.animations;
  const legacy = snapshot?.config.display.backdrop_motion;
  if (!(config?.enabled ?? legacy?.enabled ?? true)) return undefined;
  const style = config?.style ?? "kenburns";
  if (style !== "All") return style;
  const elapsedSeconds = Math.max(0, Date.now() / 1000);
  const durationSeconds = Math.max(1, config?.duration_seconds ?? legacy?.duration_seconds ?? 26);
  return backdropAnimations[Math.floor(elapsedSeconds / durationSeconds) % backdropAnimations.length] ?? "kenburns";
}

function activeAnimationCommand(command?: Snapshot["controlCommand"]) {
  if (!command || command.type !== "animation") return undefined;
  const animations = command.animations?.length ? command.animations : command.animation ? [command.animation] : [];
  if (!animations.length) return undefined;
  const elapsedSeconds = Math.max(0, (Date.now() - command.startedAt) / 1000);
  const durationSeconds = Math.max(1, command.animationDurationSeconds ?? 30);
  const index = Math.min(animations.length - 1, Math.floor(elapsedSeconds / durationSeconds));
  const animation = animations[index];
  return animation ? { animation, index } : undefined;
}

function activeSoundCommandTone(command?: Snapshot["controlCommand"]) {
  if (!command || command.type !== "sound") return undefined;
  const tones = command.tones?.length ? command.tones : [command.name];
  const elapsedSeconds = Math.max(0, (Date.now() - command.startedAt) / 1000);
  const durationSeconds = Math.max(1, command.toneDurationSeconds ?? 2);
  const index = Math.min(tones.length - 1, Math.floor(elapsedSeconds / durationSeconds));
  const tone = tones[index];
  return tone ? { tone, index } : undefined;
}

function Identity({ snapshot, artwork }: { snapshot?: Snapshot; artwork?: ArtworkRef }) {
  const state = snapshot?.state;
  const now = snapshot?.nowPlaying;
  const showInfo = state ? mediaInfoEnabled(state) && canRenderMediaInfo(now, artwork, state.mediaInfo) : false;
  const mediaInfoPrefs = state?.mediaInfo;
  const showAlbum = state?.mode === "now-playing" && state?.showAlbumArt && now?.albumArtUrl && isMusicArtwork(now.artwork ?? artwork, now);
  return (
    <>
    <section
      className="identity"
      style={{
        "--logo-max-width": `${snapshot?.config.display.logo.max_width ?? 520}px`,
        "--title-font-size": `${snapshot?.config.display.fallback_title.font_size ?? 86}px`,
        "--media-info-font-size": `${snapshot?.config.display.media_info.font_size ?? 40}px`,
        "--release-year-font-size": `${snapshot?.config.display.media_info.release_year_font_size ?? 40}px`,
        "--episode-info-font-size": `${snapshot?.config.display.media_info.episode_info_font_size ?? 28}px`,
        "--episode-title-font-size": `${snapshot?.config.display.media_info.episode_title_font_size ?? 40}px`,
        "--music-album-font-size": `${snapshot?.config.display.media_info.music_album_font_size ?? 24}px`,
        "--music-song-title-font-size": `${snapshot?.config.display.media_info.music_song_title_font_size ?? 40}px`
      } as React.CSSProperties}
    >
      {state?.showLogo && artwork?.logoUrl && (
        <img className="logo" src={mediaUrl(artwork.logoUrl)} alt={artwork.title} />
      )}
      {state?.showLogo && !artwork?.logoUrl && (
        <div className="text-logo">{now?.logoText ?? artwork?.title ?? "MediaWall"}</div>
      )}
      {showInfo && (
        <div className="now">
          <MediaInfo now={now} artwork={artwork} prefs={mediaInfoPrefs!} />
        </div>
      )}
    </section>
    {showAlbum && <img className="album-art album-art-corner" src={mediaUrl(now.albumArtUrl)} alt="" />}
    </>
  );
}

function SessionTimer({ snapshot }: { snapshot?: Snapshot }) {
  const now = snapshot?.nowPlaying;
  const timerConfig = snapshot?.config.now_playing.session_timer;
  const countConfig = snapshot?.config.now_playing.session_count;
  const interval = snapshot?.config.now_playing.cycle_interval_seconds ?? 15;
  const sessionPosition = now?.sessionPosition;
  const sessionCount = now?.sessionCount;
  const canShow = snapshot?.state.mode === "now-playing"
    && !snapshot.state.nowPlayingCyclePaused
    && (sessionCount ?? 0) > 1;
  const showTimer = Boolean(canShow && timerConfig?.enabled);
  const showCount = Boolean(canShow && countConfig?.enabled && sessionPosition && sessionCount);
  if (!showTimer && !showCount) return null;
  return (
    <div
      key={`${now?.signature ?? "session"}:${now?.sessionPosition ?? 0}:${now?.sessionCount ?? 0}`}
      className="session-status"
      aria-hidden="true"
      style={{
        "--session-timer-size": `${timerConfig?.size ?? 42}px`,
        "--session-timer-count-size": `${countConfig?.font_size ?? 13}px`,
        "--session-timer-duration": `${Math.max(1, interval)}s`
      } as React.CSSProperties}
    >
      {showTimer && (
        <svg className="session-timer" viewBox="0 0 100 100">
          <circle className="session-timer-track" cx="50" cy="50" r="43" pathLength="100" />
          <circle className="session-timer-progress" cx="50" cy="50" r="43" pathLength="100" />
        </svg>
      )}
      {showCount && sessionPosition && sessionCount && (
        <div className="session-timer-count">{formatSessionCount(sessionPosition, sessionCount)}</div>
      )}
    </div>
  );
}

function LibraryScanProgress({ snapshot }: { snapshot?: Snapshot }) {
  const incoming = snapshot?.libraryScan;
  const [display, setDisplay] = useState<Snapshot["libraryScan"]>();
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const swapTimer = useRef<number | undefined>(undefined);
  const now = snapshot?.nowPlaying;
  const albumArtVisible = snapshot?.state.mode === "now-playing"
    && snapshot.state.showAlbumArt
    && now?.albumArtUrl
    && isMusicArtwork(now.artwork ?? snapshot.state.current, now);

  useEffect(() => {
    window.clearTimeout(hideTimer.current);
    window.clearTimeout(swapTimer.current);
    if (incoming) {
      if (display && display.source !== incoming.source) {
        setVisible(false);
        swapTimer.current = window.setTimeout(() => {
          setDisplay(incoming);
          window.requestAnimationFrame(() => setVisible(true));
        }, 260);
        return () => window.clearTimeout(swapTimer.current);
      }
      setDisplay(incoming);
      window.requestAnimationFrame(() => setVisible(true));
      return;
    }
    if (!display) return;
    setVisible(false);
    hideTimer.current = window.setTimeout(() => setDisplay(undefined), 260);
    return () => {
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(swapTimer.current);
    };
  }, [incoming?.source, incoming?.percent, incoming?.scanned, incoming?.total, incoming?.completed, display]);

  if (!display) return null;
  const percent = Math.max(0, Math.min(100, Math.round(display.percent)));
  return (
    <section className={`scan-progress ${visible ? "visible" : ""} ${display.completed ? "complete" : ""} ${albumArtVisible ? "with-album-art" : ""}`}>
      <div className="scan-progress-row">
        <div className="scan-progress-track">
          <div className="scan-progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <span>{percent}%</span>
      </div>
      <div className="scan-progress-label">Scanning: {sourceLabel(display.source)}</div>
    </section>
  );
}

function ConnectionWarning({ snapshot }: { snapshot?: Snapshot }) {
  const issues = snapshot?.connectionIssues ?? [];
  if (!issues.length) return null;
  return (
    <div className="connection-warnings" role="status" aria-live="polite">
      {issues.map((issue) => (
        <aside className="connection-warning" key={issue.source}>
          <AlertTriangle />
          <div>{issue.message}</div>
        </aside>
      ))}
    </div>
  );
}

function ControlCommandLabel({ command }: { command?: Snapshot["controlCommand"] }) {
  if (!command || (command.type !== "sound" && command.type !== "animation")) return null;
  if (command.type === "animation") {
    const active = activeAnimationCommand(command);
    return active ? <div className="mediawall-command-label">{active.animation.toLowerCase()}</div> : null;
  }
  const activeTone = activeSoundCommandTone(command);
  if (!activeTone) return null;
  return <div className="mediawall-command-label">{activeTone.tone.toLowerCase()}</div>;
}

function ActionIndicator({ kind }: { kind: ActionIndicatorKind }) {
  const icon = actionIndicatorIcon(kind);
  return <div className="action-indicator" aria-live="polite">{icon}</div>;
}

function actionIndicatorIcon(kind: ActionIndicatorKind) {
  if (kind === "sound-on") return <Volume2 />;
  if (kind === "sound-off") return <VolumeX />;
  if (kind === "favorite") return <Heart fill="currentColor" />;
  if (kind === "unfavorite") return <HeartOff />;
  if (kind === "shuffle-on") return <Shuffle />;
  if (kind === "shuffle-off") return <Shuffle className="slashed-icon" />;
  if (kind === "play") return <Play />;
  if (kind === "pause") return <Pause />;
  if (kind === "mode-screensaver") return <Image />;
  return <Radio />;
}

function ControlBar(props: {
  snapshot: Snapshot;
  isFavorite: boolean;
  panel: "none" | "browse";
  onPanel: (panel: "none" | "browse") => void;
  onMode: (mode: "now-playing" | "screensaver") => void;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
  onShuffle: () => void;
  onShuffleSettings: () => void;
  onPlaybackPrevious: () => void;
  onPlaybackToggle: () => void;
  onPlaybackNext: () => void;
  onFavorite: () => void;
  flash?: string;
  onLogo: () => void;
  onMediaInfo: () => void;
  onAlbumArt: () => void;
  onFullscreen: () => void;
  onSound: () => void;
  soundMuted: boolean;
}) {
  const { snapshot } = props;
  const wallpaperMode = snapshot.state.mode === "screensaver";
  const showPlaybackControls = !wallpaperMode && (snapshot.nowPlaying?.sessionCount ?? 0) > 1;
  const showAlbumArtButton = !wallpaperMode && isMusicArtwork(snapshot.nowPlaying?.artwork ?? snapshot.state.current, snapshot.nowPlaying);
  return (
    <nav className="controls">
      <button
        className="mode-select"
        onClick={() => props.onMode(wallpaperMode ? "now-playing" : "screensaver")}
        title={wallpaperMode ? "Switch to Now Playing" : "Switch to Wallpaper / Screensaver"}
        aria-label={wallpaperMode ? "Switch to Now Playing" : "Switch to Wallpaper / Screensaver"}
        data-flash={props.flash === "mode" ? "true" : undefined}
      >
        {wallpaperMode ? <Image /> : <Radio />}
        <span>{wallpaperMode ? "Wallpaper/Screensaver" : "Now Playing"}</span>
      </button>
      {(wallpaperMode || !showPlaybackControls) && <span className="divider" />}
      {wallpaperMode && (
        <>
          <IconButton label="Previous" flash={props.flash === "previous"} onClick={props.onPrevious}><ChevronLeft /></IconButton>
          <IconButton label={snapshot.state.playing ? "Pause slideshow" : "Play slideshow"} flash={props.flash === "toggle"} onClick={props.onToggle}>
            {snapshot.state.playing ? <Pause /> : <Play />}
          </IconButton>
          <IconButton label="Next" flash={props.flash === "next"} onClick={props.onNext}><ChevronRight /></IconButton>
          <span className="divider" />
          <IconButton label="Wallpaper selection" onClick={props.onShuffleSettings}><ListFilter /></IconButton>
          <IconButton label="Shuffle" active={snapshot.state.shuffle} onClick={props.onShuffle}><Shuffle /></IconButton>
          <IconButton label="Browse" active={props.panel === "browse"} onClick={() => props.onPanel(props.panel === "browse" ? "none" : "browse")}><Grid2X2 /></IconButton>
        </>
      )}
      {showPlaybackControls && (
        <>
          <IconButton label="Previous session" flash={props.flash === "playback-previous"} onClick={props.onPlaybackPrevious}><ChevronLeft /></IconButton>
          <IconButton
            label={snapshot.state.nowPlayingCyclePaused ? "Resume session cycling" : "Pause session cycling"}
            flash={props.flash === "playback-toggle"}
            onClick={props.onPlaybackToggle}
          >
            {snapshot.state.nowPlayingCyclePaused ? <Play /> : <Pause />}
          </IconButton>
          <IconButton label="Next session" flash={props.flash === "playback-next"} onClick={props.onPlaybackNext}><ChevronRight /></IconButton>
          <span className="divider" />
        </>
      )}
      <IconButton label={props.isFavorite ? "Unfavorite" : "Favorite"} active={props.isFavorite} onClick={props.onFavorite}>
        <Heart fill={props.isFavorite ? "currentColor" : "none"} />
      </IconButton>
      <span className="divider" />
      <IconButton label="Logo" active={snapshot.state.showLogo} onClick={props.onLogo}><Sparkles /></IconButton>
      {showAlbumArtButton && <IconButton label="Album art" active={snapshot.state.showAlbumArt} onClick={props.onAlbumArt}><Disc3 /></IconButton>}
      <IconButton label="Media info" active={mediaInfoEnabled(snapshot.state)} onClick={props.onMediaInfo}><Info /></IconButton>
      <span className="divider" />
      <IconButton label="Toggle fullscreen" onClick={props.onFullscreen}><Maximize /></IconButton>
      {snapshot.config.now_playing.sounds.enabled && (
        <IconButton label="Toggle sound" active={!props.soundMuted} onClick={props.onSound}>
          {props.soundMuted ? <VolumeX /> : <Volume2 />}
        </IconButton>
      )}
      <span className="divider" />
      <a className="control-version" href="https://github.com/nothing2obvi/mediawall" target="_blank" rel="noreferrer">
        v{appVersion}
      </a>
    </nav>
  );
}

function RemoteControl(props: {
  snapshot?: Snapshot;
  panel: "none" | "browse";
  isFavorite: boolean;
  soundMuted: boolean;
  availableSpaces: string[];
  previewArtwork?: ArtworkRef;
  onMode: (mode: "now-playing" | "screensaver") => void;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
  onShuffle: () => void;
  onShuffleSettings: () => void;
  onPanel: () => void;
  onFavorite: () => void;
  onLogo: () => void;
  onMediaInfo: () => void;
  onAlbumArt: () => void;
  onSound: () => void;
  onFullscreen: () => void;
}) {
  const snapshot = props.snapshot;
  const wallpaperMode = snapshot?.state.mode === "screensaver";
  const customLogoUrl = spaceApi("/custom-logo");
  const disabled = !snapshot;
  const currentSpaceIndex = props.availableSpaces.indexOf(route.space);
  const multipleSpaces = props.availableSpaces.length > 1 && currentSpaceIndex >= 0;
  const previewUrl = mediaUrl(props.previewArtwork?.backdropUrl);
  function remoteSpaceHref(offset: number) {
    if (!multipleSpaces) return "#";
    const next = props.availableSpaces[(currentSpaceIndex + offset + props.availableSpaces.length) % props.availableSpaces.length];
    const query = passwordParam ? `?password=${encodeURIComponent(passwordParam)}` : "";
    return `/${next}-remote${query}`;
  }
  return (
    <section className="remote-control">
      <header className="remote-header">
        <img src={customLogoUrl} alt="MediaWall" onError={(event) => { event.currentTarget.src = mediaWallBannerWhite; }} />
        <div className={`remote-space-row ${multipleSpaces ? "" : "single-space"}`}>
          {multipleSpaces && <a href={remoteSpaceHref(-1)} aria-label="Previous remote space">&lt;</a>}
          <strong>{route.space}</strong>
          {multipleSpaces && <a href={remoteSpaceHref(1)} aria-label="Next remote space">&gt;</a>}
        </div>
      </header>
      <div className="remote-status">
        <div>
          <span>{wallpaperMode ? "Wallpaper/Screensaver" : "Now Playing"}</span>
          {snapshot?.nowPlaying?.playing && <strong>{snapshot.nowPlaying.title ?? snapshot.nowPlaying.album ?? "Active session"}</strong>}
        </div>
        {previewUrl && <img src={previewUrl} alt="" />}
      </div>
      <div className="remote-button-grid">
        <button disabled={disabled} onClick={props.onPrevious}>
          <ChevronLeft />
          <span>Previous</span>
        </button>
        <button disabled={disabled || !wallpaperMode} onClick={props.onToggle}>
          {snapshot?.state.playing ? <Pause /> : <Play />}
          <span>{snapshot?.state.playing ? "Pause" : "Play"}</span>
        </button>
        <button disabled={disabled} onClick={props.onNext}>
          <ChevronRight />
          <span>Next</span>
        </button>
        <button disabled={disabled} onClick={() => snapshot && props.onMode(wallpaperMode ? "now-playing" : "screensaver")}>
          <Image />
          <span>Mode</span>
        </button>
        <button disabled={disabled || !wallpaperMode} onClick={props.onShuffleSettings}>
          <ListFilter />
          <span>Selection</span>
        </button>
        <button disabled={disabled || !wallpaperMode} className={snapshot?.state.shuffle ? "active" : ""} onClick={props.onShuffle}>
          <Shuffle />
          <span>Shuffle</span>
        </button>
        <button disabled={disabled || !wallpaperMode} className={props.panel === "browse" ? "active" : ""} onClick={props.onPanel}>
          <Grid2X2 />
          <span>Grid</span>
        </button>
        <button disabled={disabled} className={props.isFavorite ? "active" : ""} onClick={props.onFavorite}>
          <Heart fill={props.isFavorite ? "currentColor" : "none"} />
          <span>Favorite</span>
        </button>
        <button disabled={disabled} className={snapshot?.state.showLogo ? "active" : ""} onClick={props.onLogo}>
          <Sparkles />
          <span>Logo</span>
        </button>
        <button disabled={disabled} className={snapshot && mediaInfoEnabled(snapshot.state) ? "active" : ""} onClick={props.onMediaInfo}>
          <Info />
          <span>Media Info</span>
        </button>
        <button disabled={disabled} onClick={props.onFullscreen}>
          <Maximize />
          <span>Full Screen</span>
        </button>
        {snapshot?.config.now_playing.sounds.enabled && (
          <button disabled={disabled} className={!props.soundMuted ? "active" : ""} onClick={props.onSound}>
            {props.soundMuted ? <VolumeX /> : <Volume2 />}
            <span>Sound</span>
          </button>
        )}
      </div>
      <a className="remote-version" href="https://github.com/nothing2obvi/mediawall" target="_blank" rel="noreferrer">
        MediaWall v{appVersion}
      </a>
    </section>
  );
}

function MediaInfoDialog({ state, onCancel, onChange, onSave }: {
  state: DisplayState;
  onCancel: () => void;
  onChange: (patch: Partial<DisplayState>) => void;
  onSave: () => void;
}) {
  const [prefs, setPrefs] = useState(state.mediaInfo);

  function toggle(key: keyof DisplayState["mediaInfo"]) {
    setPrefs((current) => {
      const next = { ...current, [key]: !current[key] };
      onChange({ showSongInfo: Object.values(next).some(Boolean), mediaInfo: next });
      return next;
    });
  }

  return (
    <aside className="modal" role="dialog" aria-label="Media info settings">
      <div className="modal-title">Media Info</div>
      <div className="check-list">
        <div className="media-info-section">
          <div className="section-label">Series</div>
          <label className="check-row indented">
            <input type="checkbox" checked={prefs.series_episode_info} onChange={() => toggle("series_episode_info")} />
            <span>Episode Info</span>
          </label>
          <label className="check-row indented">
            <input type="checkbox" checked={prefs.series_episode_title} onChange={() => toggle("series_episode_title")} />
            <span>Episode Title</span>
          </label>
        </div>
        <div className="media-info-section">
          <div className="section-label">Movies</div>
          <label className="check-row indented">
            <input type="checkbox" checked={prefs.movie} onChange={() => toggle("movie")} />
            <span>Release Year</span>
          </label>
        </div>
        <div className="media-info-section">
          <div className="section-label">Music</div>
          <label className="check-row indented">
            <input type="checkbox" checked={prefs.music_album} onChange={() => toggle("music_album")} />
            <span>Album</span>
          </label>
          <label className="check-row indented">
            <input type="checkbox" checked={prefs.music_song_title} onChange={() => toggle("music_song_title")} />
            <span>Song Title</span>
          </label>
        </div>
      </div>
      <div className="modal-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={onSave}>
          Save
        </button>
      </div>
    </aside>
  );
}

function ShuffleDialog({ libraries, selected, onCancel, onChange, onSave }: {
  libraries: Library[];
  selected: string[];
  onCancel: () => void;
  onChange: (libraryNames: string[]) => void;
  onSave: () => void;
}) {
  const realLibraries = libraries
    .filter((library) => library.name.toLowerCase() !== "all")
    .sort((left, right) => left.name.localeCompare(right.name));
  const [onlyFavorites, setOnlyFavorites] = useState(() => selected.includes(favoritesShuffleLibrary.name));
  const [checked, setChecked] = useState(() => {
    const selectedLibraries = selected.filter((name) => name !== favoritesShuffleLibrary.name);
    return new Set(selectedLibraries.length ? selectedLibraries : realLibraries.map((library) => library.name));
  });

  useEffect(() => {
    if (realLibraries.length === 0) return;
    setOnlyFavorites(selected.includes(favoritesShuffleLibrary.name));
    setChecked((current) => {
      if (current.size > 0) return current;
      const selectedLibraries = selected.filter((name) => name !== favoritesShuffleLibrary.name);
      return new Set(selectedLibraries.length ? selectedLibraries : realLibraries.map((library) => library.name));
    });
  }, [libraries.length, selected.join("|")]);

  function selectionPayload(nextOnlyFavorites = onlyFavorites, nextChecked = checked) {
    const selectedLibraries = [...nextChecked].filter((name) => realLibraries.some((library) => library.name === name));
    return nextOnlyFavorites ? [favoritesShuffleLibrary.name, ...selectedLibraries] : selectedLibraries;
  }

  function updateSelection(nextOnlyFavorites: boolean, nextChecked: Set<string>) {
    setOnlyFavorites(nextOnlyFavorites);
    setChecked(nextChecked);
    onChange(selectionPayload(nextOnlyFavorites, nextChecked));
  }

  function toggle(name: string) {
    const next = new Set(checked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    updateSelection(onlyFavorites, next);
  }

  function toggleFavoritesOnly() {
    updateSelection(!onlyFavorites, checked);
  }

  return (
    <aside className="modal" role="dialog" aria-label="Shuffle libraries">
      <div className="modal-title">Selection</div>
      <div className="check-list">
        <div className="shuffle-section">
          <div className="section-label">Favorites</div>
          <label className="check-row switch-row indented">
            <span>Only allow favorites</span>
            <input className="switch-input" type="checkbox" checked={onlyFavorites} onChange={toggleFavoritesOnly} />
          </label>
        </div>
        <div className="shuffle-section">
          <div className="section-label">Libraries</div>
          {realLibraries.map((library) => (
            <label key={library.id} className="check-row indented">
              <input
                type="checkbox"
                checked={checked.has(library.name)}
                onChange={() => toggle(library.name)}
              />
              <span>{library.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button onClick={onCancel}>Cancel</button>
        <button
          className="primary"
          onClick={onSave}
          disabled={checked.size === 0}
        >
          Save
        </button>
      </div>
    </aside>
  );
}

function Browser({ libraries, activeLibrary, items, favorites, favoritesOnly, onLibrary, onFavoritesOnly, onSelect, onClose }: {
  libraries: Library[];
  activeLibrary?: string;
  items: BrowseItem[];
  favorites: ArtworkRef[];
  favoritesOnly: boolean;
  onLibrary: (id: string) => void;
  onFavoritesOnly: () => void;
  onSelect: (item: BrowseItem, sequence?: BrowseItem[], exactBackdrop?: boolean, imageIndex?: number) => void;
  onClose: () => void;
}) {
  const [gridBackdropStep, setGridBackdropStep] = useState(0);
  const panelRef = useRef<HTMLElement | null>(null);
  const activeLibraryType = libraries.find((library) => library.id === activeLibrary)?.type ?? "";
  const scrollKey = `${route.space}:${activeLibrary ?? "none"}:${favoritesOnly ? "favorites" : "all"}`;
  const visibleItems = favoritesOnly
    ? favorites.filter((artwork) => favoriteMatchesLibrary(artwork, activeLibraryType)).map(favoriteToBrowseItem)
    : items;

  useEffect(() => {
    setGridBackdropStep(0);
    if (favoritesOnly || !visibleItems.some((item) => (item.artwork?.backdropCount ?? 0) > 1)) return;
    const timer = window.setInterval(() => setGridBackdropStep((current) => current + 1), 2700);
    return () => window.clearInterval(timer);
  }, [activeLibrary, favoritesOnly, visibleItems.map((item) => item.id).join("|")]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const saved = browserScrollPositions.get(scrollKey) ?? 0;
    window.requestAnimationFrame(() => {
      panel.scrollTop = Math.min(saved, Math.max(0, panel.scrollHeight - panel.clientHeight));
    });
  }, [scrollKey, visibleItems.length]);

  function rememberScroll() {
    const panel = panelRef.current;
    if (panel) browserScrollPositions.set(scrollKey, panel.scrollTop);
  }

  function scrollToTop() {
    const panel = panelRef.current;
    if (!panel) return;
    panel.scrollTo({ top: 0, behavior: "smooth" });
    browserScrollPositions.set(scrollKey, 0);
  }

  return (
    <aside ref={panelRef} className="panel" onScroll={rememberScroll}>
      <div className="tabs">
        {libraries.map((library) => (
          <button key={library.id} className={library.id === activeLibrary ? "selected" : ""} onClick={() => { rememberScroll(); onLibrary(library.id); }}>
            {library.name}
          </button>
        ))}
        <button
          className={`icon-tab ${favoritesOnly ? "selected" : ""}`}
          onClick={() => { rememberScroll(); onFavoritesOnly(); }}
          title="Favorites"
          aria-label="Favorites"
        >
          <Heart fill={favoritesOnly ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="grid">
        {visibleItems.map((item) => (
          <button key={item.id} className="tile" onClick={() => { rememberScroll(); onSelect(item, visibleItems, favoritesOnly); }}>
            <TileImage item={item} step={favoritesOnly ? 0 : gridBackdropStep} />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
      <button className="grid-top-button" type="button" onClick={scrollToTop} title="Back to top" aria-label="Back to top">
        <ChevronUp />
      </button>
      <button className="grid-close-button" type="button" onClick={onClose}>
        Cancel
      </button>
    </aside>
  );
}

function TileImage({ item, step }: { item: BrowseItem; step: number }) {
  const artwork = item.artwork && (item.artwork.backdropCount ?? 0) > 1
    ? artworkWithBackdropIndex(item.artwork, step % (item.artwork.backdropCount ?? 1))
    : item.artwork;
  const src = artwork?.backdropUrl ?? item.thumbUrl ?? artwork?.thumbUrl;
  return src ? <img src={mediaUrl(src)} alt="" /> : <Image />;
}

function BackdropFavoriteDialog({ backdrops, favorites, onCancel, onConfirm }: {
  backdrops: ArtworkRef[];
  favorites: ArtworkRef[];
  onCancel: () => void;
  onConfirm: (artworks: ArtworkRef[]) => void;
}) {
  const favoriteKeys = new Set(favorites.map(artworkKey));
  const [selected, setSelected] = useState(() => new Set(backdrops.filter((artwork) => favoriteKeys.has(artworkKey(artwork))).map(artworkKey)));

  function toggle(artwork: ArtworkRef) {
    const key = artworkKey(artwork);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <aside className="modal backdrop-picker" role="dialog" aria-label="Favorite backdrops">
      <div className="modal-title">Favorite Backdrops</div>
      <div className="backdrop-choice-grid">
        {backdrops.map((artwork) => {
          const key = artworkKey(artwork);
          const active = selected.has(key);
          return (
            <button key={key} className={active ? "selected" : ""} onClick={() => toggle(artwork)}>
              {artwork.backdropUrl || artwork.thumbUrl ? <img src={mediaUrl(artwork.backdropUrl ?? artwork.thumbUrl)} alt="" /> : <Image />}
              <span>#{artwork.imageIndex + 1}</span>
              <Heart fill={active ? "currentColor" : "none"} />
            </button>
          );
        })}
      </div>
      <div className="modal-actions">
        <button onClick={onCancel}>Cancel</button>
        <button
          className="primary"
          onClick={() => onConfirm(backdrops.filter((artwork) => selected.has(artworkKey(artwork))))}
        >
          Confirm Favorites
        </button>
      </div>
    </aside>
  );
}

function IconButton({ label, active, flash, onClick, children }: {
  label: string;
  active?: boolean;
  flash?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={active ? "active" : ""} data-flash={flash ? "true" : undefined} onClick={onClick} title={label} aria-label={label}>
      {children}
    </button>
  );
}

function MediaInfo({ now, artwork, prefs }: { now?: Snapshot["nowPlaying"]; artwork?: ArtworkRef; prefs: DisplayState["mediaInfo"] }) {
  const kind = mediaKind(artwork, now);
  if (kind === "movie") {
    if (!prefs.movie) return null;
    const year = now?.year ?? artwork?.year;
    return year ? <div className="release-year">{year}</div> : null;
  }
  if (kind === "music") {
    if ((!prefs.music_album || !now?.album) && (!prefs.music_song_title || !now?.title)) return null;
    return (
      <div className={prefs.music_album && prefs.music_song_title ? "music-info music-info-both" : "music-info"}>
        {prefs.music_album && now?.album && <div className="music-album">{now.album}</div>}
        {prefs.music_song_title && now?.title && <div className="music-song-title">"{now.title}"</div>}
      </div>
    );
  }
  if (kind === "episode") {
    const code = formatEpisodeCode(now);
    const title = now?.title;
    if ((!prefs.series_episode_info || !code) && (!prefs.series_episode_title || !title)) return null;
    return (
      <div className={prefs.series_episode_info && prefs.series_episode_title ? "episode-info episode-info-both" : "episode-info"}>
        {prefs.series_episode_info && code && <div className="episode-code">{code}</div>}
        {prefs.series_episode_title && title && <div className="episode-title">{title}</div>}
      </div>
    );
  }
  return null;
}

function canRenderMediaInfo(now: Snapshot["nowPlaying"] | undefined, artwork: ArtworkRef | undefined, prefs: DisplayState["mediaInfo"]) {
  const kind = mediaKind(artwork, now);
  if (kind === "movie") return prefs.movie && Boolean(now?.year ?? artwork?.year);
  if (kind === "music") return (prefs.music_album && Boolean(now?.album)) || (prefs.music_song_title && Boolean(now?.title));
  if (kind === "episode") return (prefs.series_episode_info && Boolean(formatEpisodeCode(now))) || (prefs.series_episode_title && Boolean(now?.title));
  return false;
}

function formatEpisodeCode(now?: Snapshot["nowPlaying"]) {
  if (!now?.seasonNumber && !now?.episodeNumber) return undefined;
  const season = String(now?.seasonNumber ?? 0).padStart(2, "0");
  const episode = String(now?.episodeNumber ?? 0).padStart(2, "0");
  return `S${season}E${episode}`;
}

function TopRightBadge({ snapshot }: { snapshot?: Snapshot }) {
  if (snapshot?.state.mode === "screensaver") return <ScreensaverBadge snapshot={snapshot} />;
  return <NowPlayingBadge snapshot={snapshot} />;
}

function ScreensaverBadge({ snapshot }: { snapshot?: Snapshot }) {
  const config = snapshot?.config.display.screensaver_text;
  if (!config?.enabled || !snapshot?.state.playing) return null;
  return (
    <aside
      className="now-playing-badge"
      style={{
        "--nowplaying-font-size": `${config.font_size}px`,
        "--nowplaying-icon-size": `${config.icon_size}px`
      } as React.CSSProperties}
    >
      <div className="now-playing-label">
        <span>{config.text}</span>
        <img src={jellyfinLogo} alt="" />
      </div>
    </aside>
  );
}

function NowPlayingBadge({ snapshot }: { snapshot?: Snapshot }) {
  const config = snapshot?.config.display.nowplaying_text;
  const now = snapshot?.nowPlaying;
  if (!config?.enabled || !now) return null;
  const source = now.source;
  const icon = source === "navidrome" ? navidromeLogo : jellyfinLogo;
  const showLabel = config.show_text || config.show_source_icon;
  const showAvatar = config.show_user_avatar && Boolean(now.displayUserAvatarUrl);
  const showUsername = (source === "navidrome" ? config.show_navidrome_username : config.show_jellyfin_username) && Boolean(now.displayUser ?? now.user);
  const showUserRow = showAvatar || showUsername;
  const centerUserUnderIcon = !config.show_text
    && config.show_source_icon
    && Number(Boolean(showAvatar)) + Number(Boolean(showUsername)) === 1;
  if (!showLabel && !showUserRow) return null;
  return (
    <aside
      className={`now-playing-badge ${centerUserUnderIcon ? "icon-centered-user" : ""}`}
      style={{
        "--nowplaying-font-size": `${config.font_size}px`,
        "--nowplaying-icon-size": `${config.icon_size}px`,
        "--nowplaying-user-avatar-size": `${config.user_avatar_size}px`,
        "--nowplaying-user-font-size": `${config.user_font_size}px`
      } as React.CSSProperties}
    >
      {showLabel && (
        <div className="now-playing-label">
          {config.show_text && <span>{config.text}</span>}
          {config.show_source_icon && <img src={icon} alt="" />}
        </div>
      )}
      {showUserRow && (
        <div className="now-playing-user">
          {showAvatar && <img src={mediaUrl(now.displayUserAvatarUrl)} alt="" />}
          {showUsername && <span>{now.displayUser ?? now.user}</span>}
        </div>
      )}
    </aside>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function artworkKey(artwork: ArtworkRef) {
  return `${artwork.source}:${artwork.groupKey ?? artwork.itemId}:${artwork.imageType}:${artwork.imageIndex}`;
}

function favoriteExists(state: DisplayState, artwork: ArtworkRef) {
  const exactKey = artworkKey(artwork);
  const policyKey = backdropPolicyKey(artwork);
  return state.favorites.some((favorite) => artworkKey(favorite) === exactKey || backdropPolicyKey(favorite) === policyKey);
}

function backdropPolicyKey(artwork: ArtworkRef) {
  return `${artwork.source}:${artwork.groupKey ?? artwork.itemId}`;
}

function favoriteToBrowseItem(artwork: ArtworkRef): BrowseItem {
  const suffix = (artwork.backdropCount ?? 0) > 1 ? ` #${artwork.imageIndex + 1}` : "";
  return {
    id: artworkKey(artwork),
    name: `${artwork.title}${suffix}`,
    type: artwork.mediaType,
    thumbUrl: artwork.backdropUrl ?? artwork.thumbUrl,
    backdropCount: artwork.backdropCount ?? 1,
    artwork
  };
}

function favoriteMatchesLibrary(artwork: ArtworkRef, libraryType: string) {
  const normalized = libraryType.toLowerCase();
  const mediaType = artwork.mediaType.toLowerCase();
  if (!normalized || normalized === "boxsets" || normalized === "mixed") return true;
  if (normalized === "music") return mediaType.includes("music") || mediaType === "audio";
  if (normalized === "movies") return mediaType.includes("movie") || mediaType === "video";
  if (normalized === "tvshows") return mediaType.includes("series") || mediaType.includes("episode");
  return true;
}

function cycleBackdrop(artwork: ArtworkRef | undefined, snapshot: Snapshot | undefined, step: number) {
  if (!artwork || !snapshot || snapshot.config.display.multiple_backdrops.mode !== "cycle") return artwork;
  const count = artwork.backdropCount ?? 0;
  if (count < 2 || artwork.imageType !== "Backdrop") return artwork;
  const index = snapshot.config.display.multiple_backdrops.cycle_order === "shuffle"
    ? seededBackdropIndex(artwork, step, count)
    : step % count;
  return artworkWithBackdropIndex(artwork, index);
}

function cycleNowPlayingBackdrop(artwork: ArtworkRef | undefined, snapshot: Snapshot | undefined, step: number) {
  if (!artwork || !snapshot?.config.now_playing.multiple_backdrops.enabled) return artwork;
  const count = artwork.backdropCount ?? 0;
  if (count < 2 || artwork.imageType !== "Backdrop") return artwork;
  return artworkWithBackdropIndex(artwork, step % count);
}

function nowPlayingBackdropSignature(artwork?: ArtworkRef) {
  if (!artwork) return "";
  return [
    artwork.source,
    artwork.itemId,
    artwork.imageType,
    artwork.backdropCount ?? 0,
    ...(artwork.backdropTags ?? [])
  ].join(":");
}

function isMusicArtwork(artwork?: ArtworkRef, now?: Snapshot["nowPlaying"]) {
  const type = artwork?.mediaType?.toLowerCase() ?? "";
  return artwork?.source === "navidrome"
    || type.includes("music")
    || type === "audio"
    || Boolean(now?.album || now?.artist);
}

function mediaInfoEnabled(state: DisplayState) {
  return Object.values(state.mediaInfo).some(Boolean);
}

function mediaKind(artwork?: ArtworkRef, now?: Snapshot["nowPlaying"]): "movie" | "episode" | "music" | "other" {
  const type = artwork?.mediaType?.toLowerCase() ?? "";
  const isMusic = type.includes("music") || type === "audio" || artwork?.source === "navidrome" || Boolean(now?.album || now?.artist);
  const isEpisode = type.includes("episode") || type.includes("series") || Boolean(now?.seasonNumber || now?.episodeNumber || now?.seriesName);
  const isMovie = type.includes("movie") || type === "video";
  if (isMovie) return "movie";
  if (isEpisode) return "episode";
  if (isMusic) return "music";
  return "other";
}

function formatSessionCount(position: number, count: number) {
  return `${position} of ${count}`;
}

function sourceLabel(source: "jellyfin" | "navidrome" | "sounds" | "custom_images") {
  if (source === "jellyfin") return "Jellyfin";
  if (source === "navidrome") return "Navidrome";
  if (source === "sounds") return "Sounds";
  return "Custom Logo";
}

function mediaUrl(url: string | undefined) {
  if (!url || !url.startsWith("/api/")) return url;
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("_mwcb", mediaAssetCacheToken);
  if (passwordParam) params.set("password", passwordParam);
  return `${path}?${params.toString()}`;
}

function safeToneName(tone: string | undefined, available: string[]) {
  if (!tone || tone.includes("/") || tone.includes("\\") || tone.includes("\0")) return undefined;
  return available.includes(tone) ? tone : undefined;
}

function soundSourceAllowed(source: "jellyfin" | "navidrome", sounds: Snapshot["config"]["now_playing"]["sounds"]) {
  if (source === "jellyfin") return sounds.jellyfin;
  return sounds.navidrome;
}

function quietHoursActive(quietHours: Snapshot["config"]["now_playing"]["sounds"]["quiet_hours"]) {
  if (!quietHours.enabled) return false;
  const start = parseClockMinutes(quietHours.start);
  const end = parseClockMinutes(quietHours.end);
  if (start === undefined || end === undefined || start === end) return false;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

function shouldIgnoreWallPointer(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest([
    "button",
    "a",
    "input",
    "textarea",
    "select",
    "[role='dialog']",
    ".controls",
    ".browse",
    ".modal",
    ".dialog",
    ".dismiss-layer",
    ".sound-unlock",
    ".toast"
  ].join(",")));
}

function parseClockMinutes(value: string) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function visibleSoundMediaKey(now: Snapshot["nowPlaying"]) {
  return [
    now?.source,
    now?.mediaWallUser ?? now?.displayUser ?? now?.user ?? "unknown",
    now?.publicMediaKey,
    now?.album,
    now?.title
  ].filter(Boolean).join(":");
}

function visibleAnimationKey(artwork: ArtworkRef, now: Snapshot["nowPlaying"], animation: BackdropAnimation) {
  return [
    now?.publicSessionId,
    now?.publicMediaKey,
    artwork.source,
    artwork.itemId,
    artwork.imageIndex,
    animation
  ].filter(Boolean).join(":");
}

function shouldIgnoreShortcut(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function seededBackdropIndex(artwork: ArtworkRef, step: number, count: number) {
  let seed = 0;
  const input = `${artwork.source}:${artwork.itemId}:${step}`;
  for (const char of input) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  return seed % count;
}

function artworkWithBackdropIndex(artwork: ArtworkRef, imageIndex: number): ArtworkRef {
  if (artwork.source === "jellyfin" && artwork.imageType === "Backdrop") {
    const tag = artwork.backdropTags?.[imageIndex];
    const tagQuery = tag ? `&tag=${encodeURIComponent(tag)}` : "";
    return {
      ...artwork,
      imageIndex,
      backdropUrl: `/api/jellyfin/image/${encodeURIComponent(artwork.itemId)}/Backdrop/${imageIndex}?quality=92${tagQuery}`,
      thumbUrl: `/api/jellyfin/image/${encodeURIComponent(artwork.itemId)}/Backdrop/${imageIndex}?quality=92${tagQuery}`
    };
  }
  if (artwork.source === "navidrome" && artwork.imageType === "Backdrop") {
    return {
      ...artwork,
      imageIndex,
      backdropUrl: `/api/navidrome/local-artist/${encodeURIComponent(artwork.itemId)}/${imageIndex}`,
      thumbUrl: `/api/navidrome/local-artist/${encodeURIComponent(artwork.itemId)}/${imageIndex}`
    };
  }
  return { ...artwork, imageIndex };
}

createRoot(document.getElementById("root")!).render(<App />);

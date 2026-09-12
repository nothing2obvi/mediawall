export type PlaybackSource = "jellyfin" | "navidrome" | "both";

export interface MediaWallUser {
  name: string;
  jellyfin_user?: string;
  navidrome_user?: string;
  navidrome_password?: string;
  sound?: string;
  end_sound?: string;
}

export interface DisplayConfig {
  playback_source: PlaybackSource;
  users: MediaWallUser[];
  playback_user: string;
  libraries: string[];
  idle_timeout: number;
  password?: string;
  now_playing: {
    fallback: "mediawall" | "shuffle";
    ignored_libraries: string[];
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
    mediawall_fallback: {
      mode: "centered" | "breathing" | "float" | "spotlight" | "dvd" | "minimal";
      modes: Array<"centered" | "breathing" | "float" | "spotlight" | "dvd" | "minimal" | "All">;
      background_color: string;
      min_logo_width: number;
      max_logo_width: number;
    };
    custom_logo: {
      directory: string;
    };
    multiple_backdrops: {
      enabled: boolean;
      interval_seconds: number;
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
      directory: string;
      tone: string;
      volume: number;
    };
  };
  display: {
    ui: {
      scale: number;
    };
    music_artist_images: "artists" | "albumartists" | "both";
    cycle_interval_seconds: number;
    screensaver_interval: number;
    require_logos: boolean;
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
    logo: {
      max_width: number;
    };
    album_art: {
      size: number;
    };
    fallback_title: {
      font_size: number;
    };
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
    transitions: {
      duration_ms: number;
      order: "written" | "shuffle";
      styles: TransitionStyle[];
    };
  };
}

export type TransitionStyle =
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

export type BackdropAnimation =
  | "breathe"
  | "pan"
  | "kenburns"
  | "drift"
  | "focus"
  | "zoom";

export interface AppConfig {
  server: {
    port: number;
  };
  library_scan: {
    enabled: boolean;
    directory: string;
    ttl_days: number;
    scan_on_startup: boolean;
    cron: {
      enabled: boolean;
      expression: string;
    };
  };
  jellyfin: {
    url: string;
    api_key: string;
  };
  navidrome: {
    enabled: boolean;
    url: string;
    artwork: {
      jellyfin_fallback: boolean;
      local_files: boolean;
      order: Array<"jellyfin" | "local">;
      path_mappings: Array<{ navidrome: string; mediawall: string; jellyfin?: string }>;
    };
  };
  users: Record<string, MediaWallUser>;
  spaces: Record<string, DisplayConfig>;
}

export interface ArtworkRef {
  source: PlaybackSource | "fallback";
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
}

export interface NowPlayingState {
  source: PlaybackSource;
  user: string;
  playing: boolean;
  paused: boolean;
  stale?: boolean;
  sessionKey?: string;
  activityAt?: number;
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
  itemId?: string;
  artistId?: string;
  artistName?: string;
  libraryName?: string;
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
}

export type PublicNowPlayingState = Pick<
  NowPlayingState,
  | "source"
  | "playing"
  | "paused"
  | "title"
  | "artist"
  | "album"
  | "year"
  | "seasonNumber"
  | "episodeNumber"
  | "seriesName"
  | "logoText"
  | "displayUser"
  | "displayUserAvatarUrl"
  | "mediaWallUser"
  | "libraryName"
  | "albumArtUrl"
  | "artwork"
  | "publicSessionId"
  | "publicMediaKey"
  | "publicSoundSessionKey"
  | "soundTone"
  | "endSoundTone"
  | "sessionPosition"
  | "sessionCount"
>;

export interface PublicSoundSession {
  key: string;
  source: "jellyfin" | "navidrome";
  userKey: string;
  libraryName?: string;
  continuous: boolean;
  soundTone?: string;
  endSoundTone?: string;
}

export interface PublicLibraryScanProgress {
  active: boolean;
  completed: boolean;
  source: "jellyfin" | "navidrome" | "sounds" | "custom_images";
  currentLibrary?: string;
  percent: number;
  scanned: number;
  total: number;
  warmed: number;
  updatedAt: number;
}

export interface PublicConnectionIssue {
  source: "jellyfin" | "navidrome";
  message: string;
}

export interface PublicControlCommand {
  id: string;
  type: "sound" | "mediawall" | "animation";
  name: string;
  startedAt: number;
  mode?: DisplayConfig["now_playing"]["mediawall_fallback"]["mode"];
  modes?: Array<DisplayConfig["now_playing"]["mediawall_fallback"]["mode"]>;
  modeDurationSeconds?: number;
  animation?: BackdropAnimation;
  animations?: BackdropAnimation[];
  animationDurationSeconds?: number;
  artwork?: ArtworkRef;
  tones?: string[];
  toneDurationSeconds?: number;
  expiresAt: number;
}

export interface DisplayState {
  mode: "now-playing" | "screensaver";
  current?: ArtworkRef;
  currentSequence?: {
    libraryId: string;
    items: ArtworkRef[];
    index: number;
  };
  libraryIndexes: Record<string, number>;
  backdropIndexes: Record<string, number>;
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
  shuffleQueue: ArtworkRef[];
  shuffleQueueIndex: number;
  showAlbumArt: boolean;
  showLogo: boolean;
  history: ArtworkRef[];
  favorites: ArtworkRef[];
  lastNowPlayingSignature?: string;
  lastNowPlayingFallbackAt?: number;
  lastNowPlayingHadSession?: boolean;
  mediaWallFallbackIndex?: number;
  activeMediaWallFallbackMode?: DisplayConfig["now_playing"]["mediawall_fallback"]["mode"];
  transitionIndex: number;
  transitionStyle?: TransitionStyle;
}

export interface DisplaySnapshot {
  profile: string;
  display: string;
  config: Omit<DisplayConfig, "password" | "users" | "now_playing"> & {
    users: Array<Pick<MediaWallUser, "name" | "sound">>;
    now_playing: Omit<DisplayConfig["now_playing"], "sounds"> & {
      sounds: Omit<DisplayConfig["now_playing"]["sounds"], "directory"> & { available: string[] };
    };
  };
  state: DisplayState;
  mode: "now-playing" | "screensaver";
  nowPlaying?: PublicNowPlayingState;
  soundSessions?: PublicSoundSession[];
  libraryScan?: PublicLibraryScanProgress;
  connectionIssues?: PublicConnectionIssue[];
  controlCommand?: PublicControlCommand;
  activeMediaWallFallbackMode?: DisplayConfig["now_playing"]["mediawall_fallback"]["mode"];
}

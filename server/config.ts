import { logger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { AppConfig, BackdropAnimation, DisplayConfig, MediaWallUser, TransitionStyle } from "./types.js";

const transitionStyles = [
  "crossfade",
  "fade",
  "slide_left",
  "slide_right",
  "slide_up",
  "slide_down",
  "push_left",
  "push_right",
  "zoom_fade",
  "soft_zoom",
  "blur_fade",
  "wipe_left",
  "wipe_right"
] as const;

const mediaWallFallbackModes = ["centered", "breathing", "float", "spotlight", "dvd", "minimal"] as const;
const mediaWallFallbackModeOptions = [...mediaWallFallbackModes, "All"] as const;
const backdropAnimations = ["breathe", "pan", "kenburns", "drift", "focus", "zoom"] as const;
export const themeNames = [
  "default", "Dracula", "Nord", "Catppuccin Latte", "Catppuccin Mocha", "Gruvbox Dark", "Gruvbox Light",
  "Solarized Dark", "Solarized Light", "Tokyo Night", "One Dark", "Monokai", "Rose Pine", "Everforest",
  "Kanagawa", "Synthwave 84", "Material Palenight", "Night Owl", "Ayu Mirage", "GitHub Light", "Tomorrow Night"
] as const;

const collectionGroupSchema = z.object({
  name: z.string().optional(),
  title_regex: z.string().optional(),
  title_regexes: z.array(z.string()).default([]),
  users: z.array(z.string()).default(["All"]),
  sound: z.string().default("toned.mp3"),
  user_transition_image: z.string().default(""),
  image_size: z.number().min(16).default(260)
}).transform((group) => ({
  name: group.name,
  title_regexes: [...(group.title_regex ? [group.title_regex] : []), ...group.title_regexes],
  users: group.users.length ? group.users : ["All"],
  sound: group.sound,
  user_transition_image: group.user_transition_image,
  image_size: group.image_size
}));

loadDotEnv();

const mediaWallUserSchema = z.object({
  name: z.string().optional(),
  jellyfin_user: z.string().optional(),
  navidrome_user: z.string().optional(),
  navidrome_password: z.string().optional(),
  external_music_token: z.string().optional(),
  sound: z.string().optional(),
  end_sound: z.string().optional()
});

const spaceSchema = z.object({
  playback_source: z.enum(["jellyfin", "navidrome", "external-music", "All"]).default("All"),
  theme: z.enum([...themeNames, "All"]).default("All"),
  users: z.array(z.string()).default([]),
  libraries: z.array(z.string()).default([]),
  idle_timeout: z.number().default(30),
  page_refresh: z.object({
    enabled: z.boolean().default(false),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm (24-hour time)").default("06:00")
  }).default({ enabled: false, time: "06:00" }),
  password: z.string().optional(),
  now_playing: z.object({
    fallback: z.preprocess(
      (value) => value === "default" ? "mediawall" : value,
      z.enum(["mediawall", "shuffle", "immich_kiosk"]).default("mediawall")
    ),
    immich_kiosk: z.object({
      url: z.string().default("")
    }).default({ url: "" }),
    ignored_libraries: z.array(z.string()).default(["Feature Pre-Rolls"]),
    fallback_shuffle_interval_seconds: z.number().default(45),
    cycle_users: z.boolean().default(false),
    cycle_interval_seconds: z.number().default(15),
    session_cleanup: z.object({
      paused_after_seconds: z.number().min(0).default(15),
      missing_after_seconds: z.number().min(0).default(5)
    }).default({ paused_after_seconds: 15, missing_after_seconds: 5 }),
    session_timer: z.object({
      enabled: z.boolean().default(true),
      size: z.number().default(42)
    }).default({ enabled: true, size: 42 }),
    session_count: z.object({
      enabled: z.boolean().default(true),
      font_size: z.number().default(13)
    }).default({ enabled: true, font_size: 13 }),
    user_transition: z.object({
      enabled: z.boolean().default(true),
      duration_seconds: z.number().min(0.5).default(5),
      background_color: z.string().default("#000000"),
      avatar_size: z.number().min(16).default(240),
      username_font_size: z.number().min(8).default(126),
      message_font_size: z.number().min(8).default(71),
      source_icon_size: z.number().min(16).default(150)
    }).default({
      enabled: true,
      duration_seconds: 5,
      background_color: "#000000",
      avatar_size: 240,
      username_font_size: 126,
      message_font_size: 71,
      source_icon_size: 150
    }),
    mediawall_fallback: z.object({
      mode: z.enum(mediaWallFallbackModes).optional(),
      modes: z.array(z.enum(mediaWallFallbackModeOptions)).default(["dvd"]),
      image: z.enum(["banner", "banner_white", "custom"]).default("banner"),
      background_color: z.string().default("#565954"),
      min_logo_width: z.number().default(260),
      max_logo_width: z.number().default(760),
      sizes: z.object({
        centered: z.number().default(760),
        breathing: z.number().default(760),
        float: z.number().default(700),
        spotlight: z.number().default(760),
        dvd: z.number().default(520),
        minimal: z.number().default(300)
      }).default({ centered: 760, breathing: 760, float: 700, spotlight: 760, dvd: 520, minimal: 300 })
    }).transform((fallback) => ({
      modes: fallback.modes.length ? fallback.modes : [fallback.mode ?? "dvd"],
      image: fallback.image,
      background_color: fallback.background_color,
      min_logo_width: fallback.min_logo_width,
      max_logo_width: fallback.max_logo_width,
      sizes: fallback.sizes
    })).default({
      modes: ["dvd"],
      image: "banner",
      background_color: "#565954",
      min_logo_width: 260,
      max_logo_width: 760,
      sizes: { centered: 760, breathing: 760, float: 700, spotlight: 760, dvd: 520, minimal: 300 }
    }),
    custom_logo: z.object({
      directory: z.string().default("/app/custom_logo")
    }).default({ directory: "/app/custom_logo" }),
    multiple_backdrops: z.object({
      enabled: z.boolean().default(true),
      interval_seconds: z.number().min(1).default(15)
    }).default({ enabled: true, interval_seconds: 15 }),
    collections: z.object({
      enabled: z.boolean().default(false),
      global: z.object({
        enabled: z.boolean().default(false),
        sound: z.string().default("toned.mp3"),
        user_transition_image: z.string().default(""),
        image_size: z.number().min(16).default(260)
      }).default({ enabled: false, sound: "toned.mp3", user_transition_image: "", image_size: 260 }),
      groups: z.array(collectionGroupSchema).default([])
    }).default({
      enabled: false,
      global: { enabled: false, sound: "toned.mp3", user_transition_image: "", image_size: 260 },
      groups: []
    }),
    sounds: z.object({
      enabled: z.boolean().default(true),
      jellyfin: z.boolean().default(true),
      navidrome: z.boolean().default(true),
      quiet_hours: z.object({
        enabled: z.boolean().default(false),
        start: z.string().default("23:00"),
        end: z.string().default("08:00")
      }).default({ enabled: false, start: "23:00", end: "08:00" }),
      continuous_sessions: z.object({
        navidrome: z.boolean().default(true),
        jellyfin_libraries: z.array(z.string()).default(["Music"])
      }).default({ navidrome: true, jellyfin_libraries: ["Music"] }),
      session_start: z.object({
        retrigger_after_inactive_seconds: z.number().min(0).default(30)
      }).default({ retrigger_after_inactive_seconds: 30 }),
      session_end: z.object({
        enabled: z.boolean().default(false),
        tone: z.string().default("close.mp3")
      }).default({ enabled: false, tone: "close.mp3" }),
      trigger: z.enum(["new_session", "new_user_session"]).default("new_session"),
      directory: z.string().default("/app/sounds"),
      tone: z.string().default("noted.mp3"),
      volume: z.number().min(0).max(1).default(0.35)
    }).default({
      enabled: true,
      jellyfin: true,
      navidrome: true,
      quiet_hours: { enabled: false, start: "23:00", end: "08:00" },
      continuous_sessions: { navidrome: true, jellyfin_libraries: ["Music"] },
      session_start: { retrigger_after_inactive_seconds: 30 },
      session_end: { enabled: false, tone: "close.mp3" },
      trigger: "new_session",
      directory: "/app/sounds",
      tone: "noted.mp3",
      volume: 0.35
    })
  }).default({
    fallback: "mediawall",
    immich_kiosk: { url: "" },
    ignored_libraries: ["Feature Pre-Rolls"],
    fallback_shuffle_interval_seconds: 45,
    cycle_users: false,
    cycle_interval_seconds: 15,
    session_cleanup: { paused_after_seconds: 15, missing_after_seconds: 5 },
    session_timer: { enabled: true, size: 42 },
    session_count: { enabled: true, font_size: 13 },
    user_transition: {
      enabled: true,
      duration_seconds: 5,
      background_color: "#000000",
      avatar_size: 240,
      username_font_size: 126,
      message_font_size: 71,
      source_icon_size: 150
    },
    mediawall_fallback: {
      modes: ["dvd"],
      image: "banner",
      background_color: "#565954",
      min_logo_width: 260,
      max_logo_width: 760,
      sizes: { centered: 760, breathing: 760, float: 700, spotlight: 760, dvd: 520, minimal: 300 }
    },
    custom_logo: { directory: "/app/custom_logo" },
    multiple_backdrops: { enabled: true, interval_seconds: 15 },
    collections: {
      enabled: false,
      global: { enabled: false, sound: "toned.mp3", user_transition_image: "", image_size: 260 },
      groups: []
    },
    sounds: {
      enabled: true,
      jellyfin: true,
      navidrome: true,
      quiet_hours: { enabled: false, start: "23:00", end: "08:00" },
      continuous_sessions: { navidrome: true, jellyfin_libraries: ["Music"] },
      session_start: { retrigger_after_inactive_seconds: 30 },
      session_end: { enabled: false, tone: "close.mp3" },
      trigger: "new_session",
      directory: "/app/sounds",
      tone: "noted.mp3",
      volume: 0.35
    }
  }),
  display: z.object({
    ui: z.object({
      scale: z.number().min(0.6).max(1.8).default(0.85)
    }).default({ scale: 0.85 }),
    music_artist_images: z.enum(["artists", "albumartists", "both"]).default("albumartists"),
    music_logo_artist: z.enum(["artists", "albumartist"]).default("artists"),
    cycle_interval_seconds: z.number().optional(),
    screensaver_interval: z.number().optional(),
    require_logos: z.boolean().default(true),
    backdrop_background_color: z.string().default("#050508"),
    multiple_backdrops: z.object({
      mode: z.enum(["single_backdrop", "cycle"]).default("single_backdrop"),
      single_backdrop: z.preprocess(
        (value) => value === "next" ? "numbered" : value,
        z.enum(["first", "numbered", "random"]).default("random")
      ),
      cycle_order: z.preprocess(
        (value) => value === "written" ? "numbered" : value,
        z.enum(["numbered", "shuffle"]).default("numbered")
      )
    }).default({ mode: "single_backdrop", single_backdrop: "random", cycle_order: "numbered" }),
    animations: z.object({
      enabled: z.boolean().default(true),
      style: z.enum([...backdropAnimations, "All"]).default("kenburns"),
      scale: z.number().default(1.08),
      duration_seconds: z.number().default(26)
    }).default({ enabled: true, style: "kenburns", scale: 1.08, duration_seconds: 26 }),
    backdrop_motion: z.object({
      enabled: z.boolean().default(true),
      scale: z.number().default(1.08),
      duration_seconds: z.number().default(26)
    }).optional(),
    live_tv: z.object({ channel_image_size: z.number().int().min(32).max(4096).default(713) }).default({channel_image_size: 713}),
    logo: z.object({
      max_width: z.number().default(520)
    }).default({ max_width: 520 }),
    album_art: z.object({
      size: z.number().default(300)
    }).default({ size: 300 }),
    fallback_title: z.object({
      font_size: z.number().default(86)
    }).default({ font_size: 86 }),
    nowplaying_text: z.object({
      enabled: z.boolean().default(false),
      text: z.string().default("Now playing on"),
      show_text: z.boolean().default(true),
      font_size: z.number().default(16),
      show_source_icon: z.boolean().default(true),
      icon_size: z.number().default(24),
      show_user: z.boolean().optional(),
      show_user_avatar: z.boolean().optional(),
      user_avatar_size: z.number().default(24),
      user_avatar_request_size: z.number().min(16).optional(),
      user_avatar_resize: z.object({
        enabled: z.boolean().default(true),
        size: z.number().min(16).default(96)
      }).optional(),
      show_username: z.boolean().optional(),
      show_jellyfin_username: z.boolean().optional(),
      show_navidrome_username: z.boolean().optional(),
      user_font_size: z.number().default(13)
    }).transform((value) => ({
      ...value,
      show_user_avatar: value.show_user_avatar ?? value.show_user ?? false,
      user_avatar_resize: value.user_avatar_resize ?? {
        enabled: true,
        size: value.user_avatar_request_size ?? 96
      },
      show_jellyfin_username: value.show_jellyfin_username ?? value.show_username ?? value.show_user ?? false,
      show_navidrome_username: value.show_navidrome_username ?? value.show_username ?? value.show_user ?? false
    })).default({
      enabled: false,
      text: "Now playing on",
      show_text: true,
      font_size: 16,
      show_source_icon: true,
      icon_size: 24,
      show_user_avatar: false,
      user_avatar_size: 24,
      user_avatar_resize: { enabled: true, size: 96 },
      show_jellyfin_username: false,
      show_navidrome_username: false,
      user_font_size: 13
    }),
    screensaver_text: z.object({
      enabled: z.boolean().default(true),
      text: z.string().default("Featured on MediaWall"),
      font_size: z.number().default(16),
      icon_size: z.number().default(24)
    }).default({
      enabled: true,
      text: "Featured on MediaWall",
      font_size: 16,
      icon_size: 24
    }),
    media_info: z.object({
      font_size: z.number().default(40),
      release_year_font_size: z.number().default(40),
      episode_info_font_size: z.number().default(28),
      episode_title_font_size: z.number().default(40),
      music_album_font_size: z.number().default(24),
      music_song_title_font_size: z.number().default(40)
    }).default({
      font_size: 40,
      release_year_font_size: 40,
      episode_info_font_size: 28,
      episode_title_font_size: 40,
      music_album_font_size: 24,
      music_song_title_font_size: 40
    }),
    transitions: z.object({
      duration_ms: z.number().default(1200),
      order: z.enum(["written", "shuffle"]).default("written"),
      styles: z.preprocess(
        (value) => typeof value === "string" ? [value] : value,
        z.array(z.string()).default(["crossfade"]).transform((styles) => resolveTransitions(styles))
      )
    }).default({
      duration_ms: 1200,
      order: "written",
      styles: ["crossfade"] as TransitionStyle[]
    })
  }).transform((display) => {
    const cycleInterval = display.cycle_interval_seconds ?? display.screensaver_interval ?? 15;
    const animations = display.animations ?? {
      enabled: display.backdrop_motion?.enabled ?? true,
      style: "kenburns" as BackdropAnimation,
      scale: display.backdrop_motion?.scale ?? 1.08,
      duration_seconds: display.backdrop_motion?.duration_seconds ?? 26
    };
    return {
      ...display,
      animations,
      cycle_interval_seconds: cycleInterval,
      screensaver_interval: cycleInterval
    };
  }).default({
    ui: { scale: 0.85 },
    music_artist_images: "albumartists",
    music_logo_artist: "artists",
    cycle_interval_seconds: 15,
    screensaver_interval: 15,
    require_logos: true,
    backdrop_background_color: "#050508",
    multiple_backdrops: { mode: "single_backdrop", single_backdrop: "random", cycle_order: "numbered" },
    animations: { enabled: true, style: "kenburns", scale: 1.08, duration_seconds: 26 },
    logo: { max_width: 520 },
    live_tv: { channel_image_size: 713 },
    album_art: { size: 300 },
    fallback_title: { font_size: 86 },
    nowplaying_text: {
      enabled: false,
      text: "Now playing on",
      show_text: true,
      font_size: 16,
      show_source_icon: true,
      icon_size: 24,
      show_user_avatar: false,
      user_avatar_size: 24,
      user_avatar_resize: { enabled: true, size: 96 },
      show_jellyfin_username: false,
      show_navidrome_username: false,
      user_font_size: 13
    },
    screensaver_text: {
      enabled: true,
      text: "Featured on MediaWall",
      font_size: 16,
      icon_size: 24
    },
    media_info: {
      font_size: 40,
      release_year_font_size: 40,
      episode_info_font_size: 28,
      episode_title_font_size: 40,
      music_album_font_size: 24,
      music_song_title_font_size: 40
    },
    transitions: { duration_ms: 1200, order: "written", styles: ["crossfade"] as TransitionStyle[] }
  })
});

const configSchema = z.object({
  library: z.object({ directory: z.string().default("/library") }).default({directory:"/library"}),
  server: z.object({ port: z.number().default(1221) }).default({ port: 1221 }),
  library_scan: z.object({
    enabled: z.boolean().default(true),
    directory: z.string().default("/app/data/grid-cache"),
    ttl_days: z.number().default(30),
    scan_on_startup: z.boolean().default(true),
    cron: z.object({
      enabled: z.boolean().default(true),
      expression: z.string().default("0 3 * * *")
    }).default({ enabled: true, expression: "0 3 * * *" })
  }).default({
    enabled: true,
    directory: "/app/data/grid-cache",
    ttl_days: 30,
    scan_on_startup: true,
    cron: { enabled: true, expression: "0 3 * * *" }
  }),
  jellyfin: z.object({
    url: z.string().default(""),
    api_key: z.string().default("")
  }).default({ url: "", api_key: "" }),
  navidrome: z.object({
    enabled: z.boolean().default(false),
    url: z.string().default(""),
    artwork: z.object({
      jellyfin_fallback: z.boolean().default(true),
      local_files: z.boolean().default(true),
      order: z.array(z.enum(["jellyfin", "local", "fetched"])).default(["jellyfin", "local"]),
      path_mappings: z.array(z.object({
        navidrome: z.string(),
        mediawall: z.string().optional(),
        jellyfin: z.string().optional()
      }).transform((mapping) => ({
        navidrome: mapping.navidrome,
        mediawall: mapping.mediawall ?? mapping.jellyfin ?? "/navidrome_music",
        jellyfin: mapping.jellyfin
      }))).default([])
    }).default({ jellyfin_fallback: true, local_files: true, order: ["jellyfin", "local"], path_mappings: [] })
  }).default({
    enabled: false,
    url: "",
    artwork: { jellyfin_fallback: true, local_files: true, order: ["jellyfin", "local"], path_mappings: [] }
  }),
  external_music: z.object({
    enabled: z.boolean().default(false),
    session_timeout_seconds: z.number().min(5).default(90),
    track_transition_grace_seconds: z.number().min(0).max(60).default(10),
    artwork: z.object({
      preference: z.enum(["local", "fetched"]).default("local"),
      minimum_backdrop_resolution: z.string().regex(/^\d+x\d+$/i).default("1920x1080"),
      backdrop_count: z.number().int().min(1).max(20).default(3),
      album_cache_directory: z.string().default("/app/data/external-artwork"),
      album_cache_ttl_days: z.number().min(1).default(30)
    }).transform((artwork) => {
      const [width, height] = artwork.minimum_backdrop_resolution.toLowerCase().split("x").map(Number);
      return {
        preference: artwork.preference,
        minimum_backdrop_width: width,
        minimum_backdrop_height: height,
        backdrop_count: artwork.backdrop_count,
        album_cache_directory: artwork.album_cache_directory,
        album_cache_ttl_days: artwork.album_cache_ttl_days
      };
    }).default({
      preference: "local",
      minimum_backdrop_width: 1920,
      minimum_backdrop_height: 1080,
      backdrop_count: 3,
      album_cache_directory: "/app/data/external-artwork",
      album_cache_ttl_days: 30
    }),
    tokens: z.record(z.string(), z.union([
      z.string(),
      z.object({
        user: z.string(),
        source: z.string().optional()
      })
    ])).default({})
  }).transform((externalMusic) => ({
    enabled: externalMusic.enabled,
    session_timeout_seconds: externalMusic.session_timeout_seconds,
    track_transition_grace_seconds: externalMusic.track_transition_grace_seconds,
    artwork: externalMusic.artwork,
    tokens: Object.fromEntries(Object.entries(externalMusic.tokens).map(([token, mapping]) => [
      token,
      typeof mapping === "string" ? { user: mapping } : mapping
    ]))
  })).default({
    enabled: false,
    session_timeout_seconds: 90,
    track_transition_grace_seconds: 10,
    artwork: {
      preference: "local",
      minimum_backdrop_width: 1920,
      minimum_backdrop_height: 1080,
      backdrop_count: 3,
      album_cache_directory: "/app/data/external-artwork",
      album_cache_ttl_days: 30
    },
    tokens: {}
  }),
  image_providers: z.object({
    musicbrainz: z.object({
      enabled: z.boolean().default(true),
      contact: z.string().default("")
    }).default({ enabled: true, contact: "" }),
    fanart: z.object({
      enabled: z.boolean().default(true),
      api_key: z.string().default("")
    }).default({ enabled: true, api_key: "" }),
    theaudiodb: z.object({
      enabled: z.boolean().default(true),
      api_key: z.string().default("")
    }).default({ enabled: true, api_key: "" }),
    cover_art_archive: z.object({
      enabled: z.boolean().default(true)
    }).default({ enabled: true })
  }).default({
    musicbrainz: { enabled: true, contact: "" },
    fanart: { enabled: true, api_key: "" },
    theaudiodb: { enabled: true, api_key: "" },
    cover_art_archive: { enabled: true }
  }),
  aliases: z.object({
    artists: z.record(z.string(), z.array(z.string())).default({})
  }).default({ artists: {} }),
  users: z.record(z.string(), mediaWallUserSchema).default({}),
  spaces: z.record(z.string(), spaceSchema).default({}),

});

export function loadConfig(): AppConfig {
  const configPath = path.resolve(process.env.MEDIAWALL_CONFIG ?? "config.yml");
  const raw = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "{}";
  const expanded = expandEnv(raw);
  const rawConfig = YAML.parse(expanded) ?? {};
  const errors: string[] = [];
  const removed = (present: boolean, message: string) => { if (present) {logger.error(`Configuration migration: ${message}`);errors.push(message);} };
  removed("displays" in rawConfig, "displays is deprecated and removed. Define display routes under spaces instead.");
  removed("grid_cache" in rawConfig, "grid_cache is deprecated and removed. Use library_scan for grid cache settings.");
  const artwork = rawConfig.external_music?.artwork ?? {};
  removed("cache_directory" in artwork, "external_music.artwork.cache_directory is deprecated and removed. Use library.directory (default /library) for artist images and external_music.artwork.album_cache_directory for album covers. Set album_cache_directory to your old cache path to migrate artist images on startup. Mount ./library:/library with write access.");
  removed("cache_ttl_days" in artwork, "external_music.artwork.cache_ttl_days is deprecated and removed. Use album_cache_ttl_days for album covers. Library artist images no longer expire.");
  for (const [name, space] of Object.entries(rawConfig.spaces ?? {}) as [string, any][]) {
    if (!space || typeof space !== "object") continue;
    removed("playback_user" in space, `spaces.${name}.playback_user was removed. Configure top-level users, then users: [primary] or users: [All] in this space.`);
    removed(space.playback_source !== undefined && !["jellyfin", "navidrome", "external-music", "All"].includes(space.playback_source), `spaces.${name}.playback_source: the old both value is deprecated and removed. Choices are jellyfin, navidrome, external-music, All (case-sensitive). Use All to watch every source.`);
    if (space.display?.screensaver_interval !== undefined) logger.warn(`Configuration migration: spaces.${name}.display.screensaver_interval is deprecated. Use cycle_interval_seconds instead.`);
    removed(space.display?.breathing !== undefined, `spaces.${name}.display.breathing was replaced by display.animations. Set enabled: true and style: breathe; other choices are pan, kenburns, drift, focus, zoom, All.`);
    if (space.display?.album_art?.size === undefined) logger.info(`Configuration defaults for ${name}: album_art.size is now 300px. Set display.album_art.size to keep a different size.`);
    if (space.display?.live_tv?.channel_image_size === undefined) logger.info(`Configuration defaults for ${name}: live_tv.channel_image_size is 713px. Set display.live_tv.channel_image_size to override it.`);
  }
  for (const mapping of rawConfig.navidrome?.artwork?.path_mappings ?? []) {
    if (mapping.jellyfin !== undefined) logger.warn("Configuration migration: navidrome.artwork.path_mappings[].jellyfin is deprecated. Rename it to mediawall; keep navidrome as the source path.");
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const parsed = configSchema.parse(rawConfig);
  const users = normalizeUsers(parsed.users);
  const spaces = normalizeSpaces(parsed.spaces, users);
  const appConfig: AppConfig = {
    server: parsed.server,
    library: parsed.library,
    library_scan: parsed.library_scan,
    jellyfin: parsed.jellyfin,
    navidrome: parsed.navidrome,
    external_music: normalizeExternalMusic(parsed.external_music, users),
    image_providers: parsed.image_providers,
    aliases: parsed.aliases,
    users,
    spaces
  };
  return appConfig;
}

export function findDisplay(config: AppConfig, profileOrSpace: string, display?: string): DisplayConfig | undefined {
  return config.spaces[display ? display : profileOrSpace];
}

function normalizeUsers(input: Record<string, z.infer<typeof mediaWallUserSchema>>): Record<string, MediaWallUser> {
  const users: Record<string, MediaWallUser> = {};
  for (const [name, user] of Object.entries(input)) {
    users[name] = {
      name: user.name ?? name,
      jellyfin_user: user.jellyfin_user,
      navidrome_user: user.navidrome_user,
      navidrome_password: user.navidrome_password,
      external_music_token: user.external_music_token,
      sound: user.sound,
      end_sound: user.end_sound
    };
  }
  return users;
}

function normalizeSpaces(input: Record<string, z.infer<typeof spaceSchema>>, users: Record<string, MediaWallUser>) {
  const spaces: Record<string, DisplayConfig> = {};
  for (const [spaceName, raw] of Object.entries(input)) {
    const userNames = raw.users.length ? raw.users : Object.keys(users).slice(0, 1);
    const useAllUsers = userNames.some((name) => name.toLowerCase() === "all");
    const configuredUserNames = Object.keys(users);
    const concreteUserNames = configuredUserNames.filter((name) => name.toLowerCase() !== "all");
    const sourceUsers = useAllUsers ? (concreteUserNames.length ? concreteUserNames : configuredUserNames) : userNames;
    const resolvedUsers = sourceUsers.map((name) => users[name] ?? {
      name,
      jellyfin_user: name,
      navidrome_user: name
    });
    const firstUser = resolvedUsers[0]?.name ?? "default";
    spaces[spaceName] = {
      ...raw,
      users: resolvedUsers,
      source_user: firstUser,
      idle_timeout: raw.idle_timeout,
      libraries: raw.libraries
    };
  }
  return spaces;
}

function normalizeExternalMusic(
  input: z.infer<typeof configSchema>["external_music"],
  users: Record<string, MediaWallUser>
): AppConfig["external_music"] {
  const tokens = { ...input.tokens };
  for (const [userName, user] of Object.entries(users)) {
    if (user.external_music_token && !tokens[user.external_music_token]) {
      tokens[user.external_music_token] = { user: userName };
    }
  }
  for (const mapping of Object.values(tokens)) {
    mapping.user = users[mapping.user]?.name ?? mapping.user;
  }
  return { ...input, tokens };
}

function expandEnv(raw: string) {
  return raw.replace(/\$\{([A-Z0-9_]+)\}/gi, (_match, name: string) => process.env[name] ?? "");
}

function loadDotEnv() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function resolveTransitions(styles: string[]): TransitionStyle[] {
  const normalized = styles.map((style) => style.toLowerCase());
  if (normalized.includes("all")) return [...transitionStyles];
  const selected = normalized.filter((style): style is TransitionStyle =>
    transitionStyles.includes(style as TransitionStyle)
  );
  return selected.length ? selected : ["crossfade"];
}

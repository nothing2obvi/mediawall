import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { AppConfig, DisplayConfig, MediaWallUser, TransitionStyle } from "./types.js";

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

loadDotEnv();

const mediaWallUserSchema = z.object({
  name: z.string().optional(),
  jellyfin_user: z.string().optional(),
  navidrome_user: z.string().optional(),
  navidrome_password: z.string().optional(),
  sound: z.string().optional(),
  end_sound: z.string().optional()
});

const spaceSchema = z.object({
  playback_source: z.enum(["jellyfin", "navidrome", "both"]).default("both"),
  users: z.array(z.string()).default([]),
  playback_user: z.string().optional(),
  libraries: z.array(z.string()).default([]),
  idle_timeout: z.number().default(30),
  password: z.string().optional(),
  now_playing: z.object({
    fallback: z.preprocess(
      (value) => value === "default" ? "mediawall" : value,
      z.enum(["mediawall", "shuffle"]).default("mediawall")
    ),
    ignored_libraries: z.array(z.string()).default(["Feature Pre-Rolls"]),
    fallback_shuffle_interval_seconds: z.number().default(45),
    cycle_users: z.boolean().default(false),
    cycle_interval_seconds: z.number().default(15),
    session_timer: z.object({
      enabled: z.boolean().default(true),
      size: z.number().default(42)
    }).default({ enabled: true, size: 42 }),
    session_count: z.object({
      enabled: z.boolean().default(true),
      font_size: z.number().default(13)
    }).default({ enabled: true, font_size: 13 }),
    mediawall_fallback: z.object({
      mode: z.enum(mediaWallFallbackModes).default("dvd"),
      modes: z.array(z.enum(mediaWallFallbackModeOptions)).default(["All"]),
      color_changes: z.boolean().default(false)
    }).default({ mode: "dvd", modes: ["All"], color_changes: false }),
    custom_logo: z.object({
      directory: z.string().default("/app/custom")
    }).default({ directory: "/app/custom" }),
    multiple_backdrops: z.object({
      enabled: z.boolean().default(true),
      interval_seconds: z.number().min(1).default(10)
    }).default({ enabled: true, interval_seconds: 10 }),
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
        retrigger_after_inactive_seconds: z.number().min(0).default(300)
      }).default({ retrigger_after_inactive_seconds: 300 }),
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
      session_start: { retrigger_after_inactive_seconds: 300 },
      session_end: { enabled: false, tone: "close.mp3" },
      trigger: "new_session",
      directory: "/app/sounds",
      tone: "noted.mp3",
      volume: 0.35
    })
  }).default({
    fallback: "mediawall",
    ignored_libraries: ["Feature Pre-Rolls"],
    fallback_shuffle_interval_seconds: 45,
    cycle_users: false,
    cycle_interval_seconds: 15,
    session_timer: { enabled: true, size: 42 },
    session_count: { enabled: true, font_size: 13 },
    mediawall_fallback: { mode: "dvd", modes: ["All"], color_changes: false },
    custom_logo: { directory: "/app/custom" },
    multiple_backdrops: { enabled: true, interval_seconds: 10 },
    sounds: {
      enabled: true,
      jellyfin: true,
      navidrome: true,
      quiet_hours: { enabled: false, start: "23:00", end: "08:00" },
      continuous_sessions: { navidrome: true, jellyfin_libraries: ["Music"] },
      session_start: { retrigger_after_inactive_seconds: 300 },
      session_end: { enabled: false, tone: "close.mp3" },
      trigger: "new_session",
      directory: "/app/sounds",
      tone: "noted.mp3",
      volume: 0.35
    }
  }),
  display: z.object({
    ui: z.object({
      scale: z.number().min(0.6).max(1.8).default(1)
    }).default({ scale: 1 }),
    music_artist_images: z.enum(["artists", "albumartists", "both"]).default("albumartists"),
    cycle_interval_seconds: z.number().optional(),
    screensaver_interval: z.number().optional(),
    require_logos: z.boolean().default(true),
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
    backdrop_motion: z.object({
      enabled: z.boolean().default(true),
      scale: z.number().default(1.08),
      duration_seconds: z.number().default(24)
    }).default({ enabled: true, scale: 1.08, duration_seconds: 24 }),
    logo: z.object({
      max_width: z.number().default(520)
    }).default({ max_width: 520 }),
    album_art: z.object({
      size: z.number().default(200)
    }).default({ size: 200 }),
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
    return {
      ...display,
      cycle_interval_seconds: cycleInterval,
      screensaver_interval: cycleInterval
    };
  }).default({
    ui: { scale: 1 },
    music_artist_images: "albumartists",
    cycle_interval_seconds: 15,
    screensaver_interval: 15,
    require_logos: true,
    multiple_backdrops: { mode: "single_backdrop", single_backdrop: "random", cycle_order: "numbered" },
    backdrop_motion: { enabled: true, scale: 1.08, duration_seconds: 24 },
    logo: { max_width: 520 },
    album_art: { size: 200 },
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
      order: z.array(z.enum(["jellyfin", "local"])).default(["jellyfin", "local"]),
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
  users: z.record(z.string(), mediaWallUserSchema).default({}),
  spaces: z.record(z.string(), spaceSchema).default({}),
  displays: z.record(z.string(), z.record(z.string(), z.any())).optional(),
  grid_cache: z.any().optional()
});

export function loadConfig(): AppConfig {
  const configPath = path.resolve(process.env.MEDIAWALL_CONFIG ?? "config.yml");
  const raw = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "{}";
  const expanded = expandEnv(raw);
  const parsed = configSchema.parse(YAML.parse(expanded) ?? {});
  const users = normalizeUsers(parsed.users);
  const spaces = normalizeSpaces(parsed.spaces, users);
  const appConfig: AppConfig = {
    server: parsed.server,
    library_scan: parsed.library_scan,
    jellyfin: parsed.jellyfin,
    navidrome: parsed.navidrome,
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
      sound: user.sound,
      end_sound: user.end_sound
    };
  }
  return users;
}

function normalizeSpaces(input: Record<string, z.infer<typeof spaceSchema>>, users: Record<string, MediaWallUser>) {
  const spaces: Record<string, DisplayConfig> = {};
  for (const [spaceName, raw] of Object.entries(input)) {
    const userNames = raw.users.length ? raw.users : (raw.playback_user ? [raw.playback_user] : Object.keys(users).slice(0, 1));
    const useAllUsers = userNames.some((name) => name.toLowerCase() === "all");
    const configuredUserNames = Object.keys(users);
    const concreteUserNames = configuredUserNames.filter((name) => name.toLowerCase() !== "all");
    const sourceUsers = useAllUsers ? (concreteUserNames.length ? concreteUserNames : configuredUserNames) : userNames;
    const resolvedUsers = sourceUsers.map((name) => users[name] ?? {
      name,
      jellyfin_user: name,
      navidrome_user: name
    });
    const firstUser = resolvedUsers[0]?.name ?? raw.playback_user ?? "default";
    spaces[spaceName] = {
      ...raw,
      users: resolvedUsers,
      playback_user: firstUser,
      idle_timeout: raw.idle_timeout,
      libraries: raw.libraries
    };
  }
  return spaces;
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

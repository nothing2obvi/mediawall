# Configuration

MediaWall reads `config.yml` at startup. Optional values may be omitted; MediaWall applies the defaults listed below through its config schema. Secrets should live in `.env` and be referenced from `config.yml` with `${ENV_VAR}`.

## Sections

| Section | Purpose |
| --- | --- |
| `server` | HTTP listener settings. |
| `library_scan` | Startup and scheduled image-cache warming for grid/backdrop artwork. |
| `jellyfin` | Jellyfin connection used for playback sessions, users, libraries, and artwork. |
| `navidrome` | Navidrome connection and artwork fallback/local-file behavior. |
| `users` | MediaWall users that map Jellyfin and/or Navidrome accounts together. |
| `spaces` | Display routes such as `/livingroom`, each with its own users, libraries, Now Playing behavior, and display settings. |

## Reference

### `server`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `port` | Port MediaWall listens on. | `1221` | No | Docker compose should publish the same port. |

### `library_scan`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Enables image-cache warming. | `true` | No | Applies to Jellyfin and Navidrome/local artwork used by the grid, plus local sound/custom image discovery progress. |
| `directory` | Cache directory. | `/app/data/grid-cache` | No | Mount `/app/data` to persist it. |
| `ttl_days` | Cache freshness window. | `30` | No | Stale cached images are refreshed by scans. |
| `scan_on_startup` | Runs a scan after startup. | `true` | No | Useful after container restarts. |
| `cron.enabled` | Enables scheduled scans. | `true` | No | Uses a standard five-field cron expression. |
| `cron.expression` | Scan schedule. | `0 3 * * *` | No | Local container/system time. |

### `jellyfin`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `url` | Jellyfin base URL. | `""` | Required for Jellyfin | Use `${JELLYFIN_URL}`. Jellyfin is recommended for rich artwork. |
| `api_key` | Jellyfin API key. | `""` | Required for Jellyfin | Only one Jellyfin API key is needed, and it must belong to an admin user. Per-user Jellyfin API keys are not required; `users.<name>.jellyfin_user` matches sessions by username. |

### `navidrome`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Enables Navidrome support. | `false` | No | Turn on for Navidrome Now Playing. |
| `url` | Navidrome base URL. | `""` | Required if Navidrome enabled | Use `${NAVIDROME_URL}`. |
| `artwork.jellyfin_fallback` | Lets Navidrome playback use matching Jellyfin artist artwork. | `true` | No | Requires Jellyfin to be configured. |
| `artwork.local_files` | Enables local artist artwork for Navidrome-only setups. | `true` | No | If using Navidrome without Jellyfin, enable this for backdrop/logo-based grids. |
| `artwork.order` | Artwork source priority for Navidrome playback. | `["jellyfin", "local"]` | No | Options are `jellyfin` and `local`. Disabled sources are skipped even if listed. |
| `artwork.path_mappings` | Maps Navidrome paths to paths visible inside the MediaWall container. | `[]` | No | Each entry has `navidrome` and `mediawall`. |
| `artwork.path_mappings[].navidrome` | Navidrome-side path prefix. | unset | Required per mapping | Example: `/music`. |
| `artwork.path_mappings[].mediawall` | MediaWall-container path prefix. | `/navidrome_music` | No | Used for local artist artwork lookup. Older configs using `jellyfin` are still accepted for compatibility. |

### `users.<name>`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `name` | Optional display name override for a MediaWall user. | map key | No | Usually omit this and use the map key. |
| `jellyfin_user` | Jellyfin username mapped to this MediaWall user. | unset | Required for Jellyfin user matching | Use `All` to watch all active Jellyfin users. Can reference `${JELLYFIN_USER}`. |
| `navidrome_user` | Navidrome username mapped to this MediaWall user. | unset | Required for Navidrome user matching | Use `All` to watch all active Navidrome users. |
| `navidrome_password` | Navidrome password for this user. | unset | Required for Navidrome | Navidrome needs real credentials for API access; configure one MediaWall user per Navidrome listener you want to distinguish. |
| `sound` | Per-user session-start tone override. | unset | No | Filename from `now_playing.sounds.directory`. |
| `end_sound` | Per-user session-ended tone override. | unset | No | Filename from `now_playing.sounds.directory`. |

### `spaces.<space>`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `playback_source` | Sources watched for Now Playing. | `both` | No | Options: `jellyfin`, `navidrome`, `both`. |
| `users` | MediaWall users allowed in this space. | `["All"]` | No | Use configured MediaWall user names. Use `All` to allow every configured MediaWall user. If omitted, MediaWall uses all configured users. |
| `playback_user` | Legacy single-user selector. | unset | No | Prefer `users`. |
| `password` | Optional URL password. | unset | No | If omitted or `""`, no `?password=` is required. |
| `libraries` | Libraries shown in grid, selection, shuffle, and Wallpaper/Screensaver. | `[]` | Recommended | Use Jellyfin library names; `All` allows all Jellyfin libraries. |
| `idle_timeout` | Playback record cleanup window in seconds. | `30` | No | Mostly internal display/session housekeeping. |

### `spaces.<space>.now_playing`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `fallback` | What Now Playing shows when nothing is playing. | `mediawall` | No | Options: `mediawall`, `shuffle`. |
| `ignored_libraries` | Jellyfin libraries ignored for Now Playing. | `["Feature Pre-Rolls"]` | No | Exact names, case-insensitive. Good for Cinema Mode intro/trailer/pre-roll libraries. |
| `fallback_shuffle_interval_seconds` | Idle fallback shuffle interval. | `45` | No | Used only when fallback is `shuffle`. |
| `cycle_users` | Cycles active users/sessions. | `false` | No | Multiple concurrent sessions are cycled like multiple users. |
| `cycle_interval_seconds` | Now Playing session cycle interval. | `15` | No | Used for natural session cycling and the timer ring. |
| `session_timer.enabled` | Shows the countdown ring. | `true` | No | Only meaningful when multiple active sessions are cycling. |
| `session_timer.size` | Countdown ring diameter. | `42` | No | Pixels. |
| `session_count.enabled` | Shows `1 of 4` session count. | `true` | No | Independent from the timer ring. |
| `session_count.font_size` | Session count font size. | `13` | No | Pixels. |
| `mediawall_fallback.mode` | MediaWall banner fallback animation. | `dvd` | No | Options: `centered`, `breathing`, `float`, `spotlight`, `dvd`, `minimal`. |
| `mediawall_fallback.modes` | Ordered list of MediaWall banner fallback animations used across separate no-session rounds. | `["All"]` | No | Use `All` to include every mode. If you list specific modes, the next no-session period advances to the next mode in that written order. |
| `mediawall_fallback.color_changes` | Allows DVD mode to change banner colors when it hits an edge. | `false` | No | Turning this off is helpful on older devices where live CSS color filters can lag. |
| `custom_logo.directory` | Directory checked for a custom fallback logo. | `/app/custom` | No | Put one `.png` or `.svg` file here; MediaWall uses the first matching file alphabetically. |
| `multiple_backdrops.enabled` | Enables multiple-backdrop rotation for Now Playing items. | `true` | No | If only one session is active, rotation uses `interval_seconds`; with multiple sessions, the backdrop advances when that session becomes visible again. |
| `multiple_backdrops.interval_seconds` | Single-session Now Playing backdrop interval. | `10` | No | Seconds between backdrop transitions when one active Now Playing item has multiple backdrops. |

### `spaces.<space>.now_playing.sounds`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Master switch for session sounds. | `true` | No | Does not affect visual behavior. |
| `jellyfin` | Allows Jellyfin sounds. | `true` | No | Applies to start and end sounds. |
| `navidrome` | Allows Navidrome sounds. | `true` | No | Applies to start and end sounds. |
| `quiet_hours.enabled` | Suppresses sounds during quiet hours. | `false` | No | Suppresses start and end sounds; no retroactive sounds after quiet hours end. |
| `quiet_hours.start` | Quiet-hours start. | `23:00` | No | `HH:MM`, local system time. |
| `quiet_hours.end` | Quiet-hours end. | `08:00` | No | Cross-midnight ranges are supported. |
| `continuous_sessions.navidrome` | Treats Navidrome item changes as one sound session. | `true` | No | Track changes do not trigger new start sounds. |
| `continuous_sessions.jellyfin_libraries` | Jellyfin libraries treated as continuous for sounds. | `["Music"]` | No | Exact library names, not hardcoded to music. |
| `session_start.retrigger_after_inactive_seconds` | Inactive cooldown before continuous sessions can start-sound again. | `300` | No | Requires uninterrupted inactivity. |
| `session_end.enabled` | Enables session-ended sounds. | `false` | No | Item changes in continuous sessions do not count as endings. |
| `session_end.tone` | Default session-ended tone. | `close.mp3` | No | `close.mp3` is bundled and normalized; user-supplied custom sounds are not normalized. |
| `trigger` | Start sound trigger mode. | `new_session` | No | Options: `new_session`, `new_user_session`. |
| `directory` | Directory scanned for sound files. | `/app/sounds` | No | Browser-friendly formats: `.mp3`, `.ogg`, `.wav`, `.m4a`, `.aac`, `.flac`. |
| `tone` | Default session-start tone. | `noted.mp3` | No | Can be overridden per user with `sound`. |
| `volume` | Sound playback volume. | `0.35` | No | Range `0` to `1`. |

### `spaces.<space>.display`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `ui.scale` | Scales app UI chrome. | `1` | No | Applies to controls, dialogs, grid cards, and toast notifications. |
| `music_artist_images` | Music artist role filter. | `albumartists` | No | Options: `artists`, `albumartists`, `both`. |
| `cycle_interval_seconds` | Wallpaper/Screensaver cycle interval. | `15` | No | When shuffle is off, items go library-by-library and alphabetically. |
| `screensaver_interval` | Legacy alias for cycle interval. | `15` | No | Prefer `cycle_interval_seconds`. |
| `require_logos` | Requires logos for display/grid eligibility. | `true` | No | Navidrome-only items need local logo files. |
| `multiple_backdrops.mode` | Multiple-backdrop behavior. | `single_backdrop` | No | Options: `single_backdrop`, `cycle`. |
| `multiple_backdrops.single_backdrop` | Single-backdrop selection mode. | `random` | No | Options: `first`, `numbered`, `random`. |
| `multiple_backdrops.cycle_order` | Multiple-backdrop cycle order. | `numbered` | No | Options: `numbered`, `shuffle`. |
| `backdrop_motion.enabled` | Enables slow backdrop zoom motion. | `true` | No | Applies globally per space. |
| `backdrop_motion.scale` | Backdrop motion scale. | `1.08` | No | Maximum zoom scale. |
| `backdrop_motion.duration_seconds` | Backdrop motion duration. | `24` | No | Duration of one motion direction before reversing. |
| `logo.max_width` | Logo image maximum width. | `520` | No | Pixels. |
| `album_art.size` | Now Playing album cover size. | `200` | No | Pixels. |
| `fallback_title.font_size` | Fallback title text size. | `86` | No | Used when title text rendering applies. |

### `spaces.<space>.display.nowplaying_text`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Shows the upper-right Now Playing badge. | `false` | No | Master switch for this badge. |
| `text` | Now Playing badge label. | `Now playing on` | No | Text can be customized. |
| `show_text` | Shows badge label text. | `true` | No | Can be disabled while leaving icon/user visible. |
| `font_size` | Badge label font size. | `16` | No | Pixels. |
| `show_source_icon` | Shows Jellyfin/Navidrome icon. | `true` | No | Can be disabled independently. |
| `icon_size` | Source icon size. | `24` | No | Pixels. |
| `show_user_avatar` | Shows Jellyfin avatar. | `false` | No | Navidrome does not provide avatars. |
| `user_avatar_size` | Jellyfin avatar size. | `24` | No | Pixels. |
| `user_avatar_resize.enabled` | Requests resized Jellyfin avatars. | `true` | No | Helpful for animated GIF avatars and older devices such as older iPads. |
| `user_avatar_resize.size` | Requested Jellyfin avatar image size. | `96` | No | Pixels. This affects the image fetched from Jellyfin, not the rendered UI size. |
| `show_jellyfin_username` | Shows Jellyfin username. | `false` | No | Aligns cleanly if avatar/text/icon are disabled. |
| `show_navidrome_username` | Shows Navidrome username. | `false` | No | Useful because Navidrome has no avatars. |
| `user_font_size` | Username font size. | `13` | No | Pixels. |

### `spaces.<space>.display.screensaver_text`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Shows Wallpaper/Screensaver badge. | `true` | No | Hidden when paused as wallpaper. |
| `text` | Wallpaper/Screensaver badge text. | `Featured on MediaWall` | No | Custom display label. |
| `font_size` | Wallpaper/Screensaver badge font size. | `16` | No | Pixels. |
| `icon_size` | Wallpaper/Screensaver badge icon size. | `24` | No | Pixels. |

### `spaces.<space>.display.media_info`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `font_size` | General media info font size. | `40` | No | Used as fallback for specific media info sizes. |
| `release_year_font_size` | Movie release year size. | `40` | No | Applies only to movie-type items. |
| `episode_info_font_size` | Episode code size. | `28` | No | Example: `S02E04`. |
| `episode_title_font_size` | Episode title size. | `40` | No | Separate from episode code. |
| `music_album_font_size` | Music album line size. | `24` | No | Used when album info is enabled. |
| `music_song_title_font_size` | Song title line size. | `40` | No | Used when song title info is enabled. |

### `spaces.<space>.display.transitions`

| Entry | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `duration_ms` | Transition duration. | `1200` | No | Milliseconds. |
| `order` | Transition order mode. | `written` | No | Options: `written`, `shuffle`. |
| `styles` | Transition styles to use. | `["crossfade"]` | No | Options: `crossfade`, `fade`, `slide_left`, `slide_right`, `slide_up`, `slide_down`, `push_left`, `push_right`, `zoom_fade`, `soft_zoom`, `blur_fade`, `wipe_left`, `wipe_right`, `All`. |

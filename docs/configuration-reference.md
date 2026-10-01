# Configuration

MediaWall reads `config.yml` when it starts. Leave out optional settings to use the defaults below. Keep secrets in `.env` and reference them with `${ENV_VAR}`.

For a fuller setup, see [config.yml.example](../config.yml.example). Copy it to `config.yml`, set the referenced variables in your `.env`, and adjust the users, libraries, mounts, and enabled features for your setup. The example uses port `1222`, so match your Compose port mapping.

## Sections

| Section | Purpose |
| --- | --- |
| `server` | HTTP listener settings. |
| Environment variables | Runtime values such as credentials, passwords, and log level. |
| `library` | Folder for MediaWall artist images. |
| `library_scan` | Startup and scheduled artwork scans. |
| `jellyfin` | Jellyfin connection used for playback sessions, users, libraries, and artwork. |
| `navidrome` | Navidrome connection and artwork fallback/local-file behavior. |
| `external_music` | ListenBrainz-compatible receiver settings for external music bridges such as Multi-Scrobbler. |
| `image_providers` | Settings for MediaWall’s image providers. |
| `aliases` | Alternate artist names used to find artwork. |
| `users` | MediaWall users that map Jellyfin and/or Navidrome accounts together. |
| `spaces` | Display routes such as `/livingroom`, each with its own users, libraries, Now Playing behavior, and display settings. |

## Reference

### Environment Variables

Put secrets in `.env` and reference them from `config.yml` using `${VARIABLE_NAME}`. Compose loads `.env` through `env_file`; recreate the container after changes. Variable names for external tokens are chosen by you and must match the YAML reference. For one or multiple music users, follow [External Music](external-music.md).

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `EXTERNAL_MUSIC_BOB_TOKEN` | Example shared secret for bob’s external music. | unset | For that user's external playback | Reference under `users.bob.external_music_token`; enter the same secret in Multi-Scrobbler. Use a different variable and secret for each user. |
| `FANART_API_KEY`, `THEAUDIODB_API_KEY` | Optional artwork provider keys. | unset | No | Reference under `image_providers` in `config.yml`. |
| `LOG_LEVEL` | Controls server log verbosity. | `info` | No | Options: `debug`, `info`, `warn`, `error`, `silent`. Use `debug` when troubleshooting playback/session/artwork behavior. |

### Server

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `port` | Port MediaWall listens on. | `1221` | No | Docker compose should publish the same port. |

### Library

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `directory` | Root folder for MediaWall Library images. | `/library` | No | Mount `./library:/library` with write access. Artist images live in `Artists` inside it. |

Library images are scanned at startup and when files change. Scheduled scans also include them. These images don't expire, and `clear cache` doesn't remove them. See [External Music Images](external-music-images.md).

### Library Scan

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Enables scheduled artwork scans and preloads cached images. | `true` | No | Includes Jellyfin, Navidrome/local artwork, and Library. Library file-change detection still works when this is off. |
| `directory` | Cache directory. | `/app/data/grid-cache` | No | Mount `/app/data` to persist it. |
| `ttl_days` | How long cached images stay fresh. | `30` | No | Stale cached images are refreshed by scans. |
| `scan_on_startup` | Runs a scan after startup. | `true` | No | Useful after container restarts. |
| `cron.enabled` | Enables scheduled scans. | `true` | No | Uses a standard five-field cron expression. |
| `cron.expression` | Scan schedule. | `0 3 * * *` | No | Local container/system time. |

### Jellyfin

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `url` | Jellyfin base URL. | `""` | Required for Jellyfin | Use `${JELLYFIN_URL}`. Jellyfin is recommended for rich artwork. |
| `api_key` | Jellyfin API key. | `""` | Required for Jellyfin | Only one Jellyfin API key is needed, and it must belong to an admin user. Per-user Jellyfin API keys are not required; the configured Jellyfin username matches sessions by username. |

### Navidrome

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Enables Navidrome support. | `false` | No | Turn on for Navidrome Now Playing. |
| `url` | Navidrome base URL. | `""` | Required if Navidrome enabled | Use `${NAVIDROME_URL}`. |
| `artwork.jellyfin_fallback` | Lets Navidrome playback use matching Jellyfin artist artwork. | `true` | No | Requires Jellyfin to be configured. |
| `artwork.local_files` | Enables local artist artwork for Navidrome-only setups. | `true` | No | If using Navidrome without Jellyfin, enable this for backdrop/logo-based grids. |
| `artwork.order` | Artwork source priority for Navidrome playback. | `["jellyfin", "local"]` | No | Options are `jellyfin`, `local`, and `fetched`. The first complete source wins; lower-priority sources may fill a missing logo or backdrop. |
| `artwork.path_mappings` | Maps Navidrome paths to paths visible inside the MediaWall container. | `[]` | No | Each mapping has `navidrome` and `mediawall`. |
| `path_mappings.navidrome` | Navidrome-side path prefix. | unset | Required per mapping | Example: `/music`. |
| `path_mappings.mediawall` | MediaWall-container path prefix. | `/navidrome_music` | No | Used for local artist artwork lookup. Older configs using `jellyfin` are still accepted for compatibility. |

### External Music

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Enables the ListenBrainz-compatible receiver. | `false` | No | Multi-Scrobbler should use the base URL `/apis/listenbrainz`; it appends `/1/submit-listens`. |
| `track_transition_grace_seconds` | Extra time to retain the current external track while waiting for the next update. | `10` | No | Range: `0`–`60` seconds. Avoids brief fallback between tracks. A new track replaces the old one immediately for the same user/service. Stopping playback also delays fallback by this amount, plus the space's missing-session grace. |
| `session_timeout_seconds` | Minimum lifetime for a received `playing_now` event. | `90` | No | Minimum: `5`. If a track duration is supplied, the longer of this timeout and the track duration (capped at 12 hours) is used, plus transition grace. A later update refreshes or replaces it. |
| `artwork.preference` | Chooses whether to prefer Jellyfin/local or Library/provider artwork. | `local` | No | Options: `local`, `fetched`. Other sources fill missing artwork. Jellyfin/local lookups follow the `navidrome.artwork.jellyfin_fallback` and `local_files` switches. |
| `artwork.minimum_backdrop_resolution` | Minimum accepted fetched backdrop dimensions. | `1920x1080` | No | This filters candidates; images are not resized to this value. |
| `artwork.backdrop_count` | Maximum backdrops downloaded for a new artist. | `3` | No | Providers may return fewer usable images. Doesn’t limit images you add yourself. |
| `artwork.album_cache_directory` | Album-cover cache and old artist-cache migration source. | `/app/data/external-artwork` | No | Keep `/app/data` persistent. Replaces `cache_directory`; artist images now live under `library.directory`. |
| `artwork.album_cache_ttl_days` | How long album-cover results stay fresh. | `30` | No | Replaces `cache_ttl_days`. Artist Library images don’t expire. |
| `tokens` | Alternative to each user's `external_music_token` setting. | `{}` | Only when not using per-user tokens | Keys reference secrets from `.env`; values identify users, optionally with a fixed `source`. Prefer the step-by-step per-user setup in [External Music](external-music.md). Do not configure both methods for the same token. |

External sources must send live `playing_now` updates. Playback history alone won’t appear as Now Playing.

Spotify avatars may be placed at `app/avatars/spotify/<username>.png`, `.jpg`, `.jpeg`, or `.webp`. MediaWall uses that file first, then a same-user Jellyfin avatar, then the normal no-avatar fallback. Avatars appear as circles; the original files aren’t changed.

### Image Providers

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `musicbrainz.enabled` | Resolves canonical artist and release MBIDs. | `true` | No | No API key. Set `contact` to an email or project URL for the request user agent. |
| `musicbrainz.contact` | Contact included in MusicBrainz requests. | `""` | Recommended | Use `${MUSICBRAINZ_CONTACT}`. |
| `fanart.enabled` | Enables Fanart.tv artist logos and backdrops. | `true` | No | Skipped when `api_key` is blank. |
| `fanart.api_key` | MediaWall's Fanart.tv API key. | `""` | Required for Fanart.tv | Use `${FANART_API_KEY}`; Jellyfin keys are never reused. |
| `theaudiodb.enabled` | Enables TheAudioDB artist and album images. | `true` | No | Skipped when `api_key` is blank. |
| `theaudiodb.api_key` | MediaWall's TheAudioDB key. | `""` | Required for TheAudioDB | Use `${THEAUDIODB_API_KEY}`. |
| `cover_art_archive.enabled` | Enables MusicBrainz Cover Art Archive album covers. | `true` | No | No API key required. |

### Artist Aliases

Use `aliases.artists` when an artist has alternate names or spellings. Aliases work in both directions, ignore case and surrounding spaces, and support Unicode. They apply to artwork searches across Jellyfin, local files, Library, and providers. The displayed artist name stays unchanged.

```yaml
aliases:
  artists:
    "a子":
      - "ako"
```

### MediaWall Users

Use names like `bob` and `alice` for MediaWall users. Map each one to their service accounts, such as `bob-jellyfin` and `bob-navidrome`, using the fields below.

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `name` | Overrides the name MediaWall uses for this user. | Identifier under `users:` | No | For `bob:`, omit this to use `bob`, or set a different display name with `name`. Spaces and token mappings still reference `bob`. Set `jellyfin_user` and `navidrome_user` explicitly when service usernames differ: the name is also their fallback. |
| `jellyfin_user` | Jellyfin username mapped to this MediaWall user. | unset | Required for Jellyfin user matching | Use `All` to watch all active Jellyfin users. Can reference `${JELLYFIN_BOB_USER}`. |
| `navidrome_user` | Navidrome username mapped to this MediaWall user. | unset | Required for Navidrome user matching | Use `All` to watch all active Navidrome users. |
| `navidrome_password` | Navidrome password for this user. | unset | Required for Navidrome | Navidrome needs real credentials for API access; configure one MediaWall user per Navidrome listener you want to distinguish. |
| `external_music_token` | Secret used by Multi-Scrobbler to send playback for this user. | unset | No | Reference an environment variable, such as `${EXTERNAL_MUSIC_BOB_TOKEN}`. Put the actual secret in `.env` and use the same secret in that user's Multi-Scrobbler ListenBrainz client. See [External Music](external-music.md). |
| `sound` | Per-user session-start tone override. | unset | No | Filename from the sounds directory configured for the space. |
| `end_sound` | Per-user session-ended tone override. | unset | No | Filename from the sounds directory configured for the space. |

Per-user sounds override the global tones for any space where that MediaWall user is allowed. Put the audio file in the configured sounds directory, then set `sound` for that user's session-start tone and `end_sound` for that user's session-ended tone. For example, a user can use `sound: "bob-start.mp3"` and `end_sound: "bob-end.mp3"` while the space still uses the global defaults for everyone else.

### Spaces

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `playback_source` | Sources watched for Now Playing. | `All` | No | Options: `jellyfin`, `navidrome`, `external-music`, `All`. External playback must also be enabled under `external_music`. `All` watches all enabled services. |
| `theme` | UI theme for this space. | `All` | No | Use `All` (or omit the setting) for interactive selection, or lock the space to `default`, `Dracula`, `Nord`, `Catppuccin Latte`, `Catppuccin Mocha`, `Gruvbox Dark`, `Gruvbox Light`, `Solarized Dark`, `Solarized Light`, `Tokyo Night`, `One Dark`, `Monokai`, `Rose Pine`, `Everforest`, `Kanagawa`, `Synthwave 84`, `Material Palenight`, `Night Owl`, `Ayu Mirage`, `GitHub Light`, or `Tomorrow Night`. Fixed themes hide and disable interactive controls. The active interactive theme is synchronized and persisted per space. |
| `users` | MediaWall users allowed in this space. | `[]` | Usually yes | Use the identifiers defined under `users:`, for example `[bob, alice]`. `[All]` includes every configured user. If omitted, the first configured user is used. |
| `password` | Optional URL password. | unset | No | If omitted or `""`, no `?password=` is required. |
| `libraries` | Libraries shown in grid, selection, shuffle, and Wallpaper/Screensaver. | `[]` | Recommended | Use Jellyfin library names; `All` allows all Jellyfin libraries. |
| `idle_timeout` | Playback record cleanup window in seconds. | `30` | No | Mostly internal display/session housekeeping. |

### Space Anonymous Mode

Put `anonymous_mode` under `spaces.<space>`, beside that space's `users` selection. Lists use the user keys from the MediaWall Users section above, not display-name overrides. Matching is case-insensitive. For examples and more details, see [Anonymous Mode](anonymous-mode.md).

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Makes the anonymous rules active for this space. | `false` | No | Omitting the section preserves existing behavior. |
| `shown` | Users who keep their normal identity. | `[]` | No | Accepts user keys such as `bob`, or `All`. Always takes priority over `not_shown`. |
| `not_shown` | Users whose identity is replaced. | `[All]` | No | Use `[bob]` to hide only bob. Users matching neither list stay visible. |
| `anonymous_username` | Replacement name. | `someone` | No | Must not be empty. Doesn't change the actual account identity. |
| `now_playing_info.show_anonymous_username` | Shows the replacement name in the top-right badge. | `true` | No | `false` hides username text for anonymous users. The badge must be enabled. |
| `now_playing_info.show_anonymous_avatar` | Shows the generic avatar in the badge. | `true` | No | Uses the shipped PNG or a custom `anonymous` image. Priority: WebP, JPG, JPEG, PNG. Replacements update automatically. |
| `user_transition_info.show_anonymous_avatar` | Shows the generic avatar during session-start transitions. | `true` | No | Uses the same default/custom avatar; updates even during a transition. Transitions always use `anonymous_username`; no separate name toggle. |

Hidden users never fall back to real names or avatars in these areas. Visible users keep all their existing presentation settings. The normal badge and transition master switches still apply. Anonymous Mode doesn't change playback matching or session identity.

### Scheduled page refresh

Each space can opt into a full daily page reload:

```yaml
spaces:
  livingroom:
    page_refresh:
      enabled: true
      time: "06:00"
```

`page_refresh.enabled` defaults to `false`. `page_refresh.time` defaults to `"06:00"` and accepts 24-hour `HH:mm`. The schedule uses the display browser's local timezone, not the container timezone. It reloads the display page, including an embedded Immich Kiosk, but not the remote control page. The current URL and password query are preserved. A suspended display refreshes when it wakes after a missed deadline. Reloading may interrupt playback presentation and resets temporary iframe navigation. Restart the container after editing configuration.

### Space Now Playing

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `fallback` | What Now Playing shows when nothing is playing. | `mediawall` | No | Options: `mediawall`, `shuffle`, `immich_kiosk`. Immich Kiosk is optional and configured per space; it isn't the default. |
| `immich_kiosk.url` | Full URL handed to Immich Kiosk while this space is idle. | `""` | Required only when fallback is `immich_kiosk` | Prefer an environment reference such as `${HOMELAB_IMMICH_KIOSK_URL}` because Kiosk URLs may contain passwords. |
| `ignored_libraries` | Jellyfin libraries ignored for Now Playing. | `["Feature Pre-Rolls"]` | No | Exact names, case-insensitive. Good for Cinema Mode intro/trailer/pre-roll libraries. |
| `fallback_shuffle_interval_seconds` | Idle fallback shuffle interval. | `45` | No | Used only when fallback is `shuffle`. |
| `cycle_users` | Cycles active users/sessions. | `false` | No | Multiple concurrent sessions are cycled like multiple users. |
| `cycle_interval_seconds` | Now Playing session cycle interval. | `15` | No | Used for natural session cycling and the timer ring. |
| `session_cleanup.paused_after_seconds` | Removes paused, stale, or non-progressing sessions from current Now Playing after this many seconds. | `15` | No | Also handles Jellyfin sessions stuck repeating the same few seconds. Updates may take a little longer than this setting. |
| `session_cleanup.missing_after_seconds` | Keeps sessions visible through short playback gaps. | `5` | No | Prevents flicker to the fallback screen between tracks or episodes. Set to `0` to disable for ordinary sessions. Live TV uses its own short delay to allow channel changes. |
| `session_timer.enabled` | Shows the countdown ring. | `true` | No | Only meaningful when multiple active sessions are cycling. |
| `session_timer.size` | Countdown ring diameter. | `42` | No | Pixels. |
| `session_count.enabled` | Shows `1 of 4` session count. | `true` | No | Independent from the timer ring. |
| `session_count.font_size` | Session count font size. | `13` | No | Pixels. |
| `user_transition.enabled` | Shows a user-intro screen the first time a session becomes visible. | `true` | No | It does not repeat when session cycling comes back to that same session. The sound starts at this same visible-session moment when sounds are enabled and allowed. |
| `user_transition.duration_seconds` | User-intro duration. | `5` | No | Separate from the normal session display interval. |
| `user_transition.background_color` | User-intro background color. | `#000000` | No | Use a hex color. |
| `user_transition.avatar_size` | User-intro Jellyfin avatar size. | `240` | No | Pixels. Navidrome intros do not show avatars. |
| `user_transition.username_font_size` | User-intro username font size. | `126` | No | Pixels. MediaWall constrains it responsively on smaller screens. |
| `user_transition.message_font_size` | User-intro message font size. | `71` | No | Controls the `started watching` / `started listening to` line. MediaWall constrains it responsively on smaller screens. |
| `user_transition.source_icon_size` | User-intro Jellyfin/Navidrome source icon size. | `150` | No | Pixels. MediaWall constrains it responsively on smaller screens. |
| `mediawall_fallback.modes` | Ordered list of MediaWall banner fallback animations used across separate no-session rounds. | `["dvd"]` | No | Options: `centered`, `breathing`, `float`, `spotlight`, `dvd`, `minimal`, `All`. Use `All` to include every mode. If you list specific modes, the next no-session period advances to the next mode in that written order. |
| `mediawall_fallback.image` | Image used by MediaWall fallback animations. | `banner` | No | Options: `banner`, `banner_white`, `custom`. `custom` uses the first image from `custom_logo.directory`. |
| `mediawall_fallback.background_color` | Background color used behind the intentional MediaWall/logo fallback screen. | `#565954` | No | Use a hex color such as `#4f524d`. |
| `mediawall_fallback.min_logo_width` | Minimum logo width for fallback modes where the logo size can change. | `260` | No | Pixels. |
| `mediawall_fallback.max_logo_width` | Maximum logo width for fallback modes where the logo size can change. | `760` | No | Pixels. |
| `mediawall_fallback.sizes.centered` | Fallback image width in centered mode. | `760` | No | Pixels, constrained by min/max and viewport. |
| `mediawall_fallback.sizes.breathing` | Fallback image width in breathing mode. | `760` | No | Pixels, constrained by min/max and viewport. |
| `mediawall_fallback.sizes.float` | Fallback image width in float mode. | `700` | No | Pixels, constrained by min/max and viewport. |
| `mediawall_fallback.sizes.spotlight` | Fallback image width in spotlight mode. | `760` | No | Pixels, constrained by min/max and viewport. |
| `mediawall_fallback.sizes.dvd` | Fallback image width in dvd mode. | `520` | No | Pixels, constrained by min/max and viewport. |
| `mediawall_fallback.sizes.minimal` | Fallback image width in minimal mode. | `300` | No | Pixels, constrained by min/max and viewport. |
| `custom_logo.directory` | Directory checked for a custom fallback logo. | `/app/custom_logo` | No | Put one `.png` or `.svg` file here; MediaWall uses the first matching file alphabetically. |
| `multiple_backdrops.enabled` | Enables multiple-backdrop rotation for Now Playing items. | `true` | No | If only one session is active, rotation uses `interval_seconds`; with multiple sessions, the backdrop advances when that session becomes visible again. |
| `multiple_backdrops.interval_seconds` | Single-session Now Playing backdrop interval. | `15` | No | Seconds between backdrop transitions when one active Now Playing item has multiple backdrops. |
| `collections.enabled` | Enables Jellyfin collection-aware sounds and user-transition images. | `false` | No | Applies only to Jellyfin collections. Put transition images in `/app/collections`. |
| `collections.global.enabled` | Uses one collection sound/image for any matching Jellyfin collection. | `false` | No | When enabled, group rules are ignored. |
| `collections.global.sound` | Session-start tone for any matching collection. | `toned.mp3` | No | Filename from the configured sounds directory. |
| `collections.global.user_transition_image` | Image shown during the user transition for any matching collection. | unset | No | Filename from `/app/collections`. Supports `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, and `.svg`. |
| `collections.global.image_size` | Global collection transition image size. | `260` | No | Pixels, constrained responsively. |
| `collections.groups` | Ordered collection rule list. | `[]` | No | First matching group wins. Keep groups specific if more than one regex could match the same collection. |
| `collections.groups.name` | Optional label for a collection rule group. | unset | No | For config readability only. |
| `collections.groups.title_regexes` | Collection title regexes matched by this group. | `[]` | No | Case-insensitive JavaScript regex strings. A leading `(?i)` is accepted for compatibility and is otherwise redundant because matching is always case-insensitive. |
| `collections.groups.title_regex` | Single collection title regex shorthand. | unset | No | Added to `title_regexes` during config loading. |
| `collections.groups.users` | MediaWall users allowed to use this collection rule. | `["All"]` | No | Use `All` for every MediaWall user, or list user keys from the top-level `users` section. |
| `collections.groups.sound` | Session-start tone for this collection group. | `toned.mp3` | No | Overrides the user's normal start tone when the played item is in a matching collection. |
| `collections.groups.user_transition_image` | Image shown during the user transition for this collection group. | unset | No | Filename from `/app/collections`. |
| `collections.groups.image_size` | Group collection transition image size. | `260` | No | Pixels, constrained responsively. |

Collection rules and memberships update during startup and scheduled Jellyfin scans. Changes won’t take effect until the next scan. If a scan fails, MediaWall keeps the previous results.

For one collection, the first eligible group in written config order wins. If an item belongs to several matching collections, the alphabetically first matching collection supplies the session-start sound. Every matching collection contributes its configured transition image, shown in alphabetical collection order at its configured size. Duplicate references to the same image and size are shown once.

### Space Sounds

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Master switch for session sounds. | `true` | No | Does not affect visual behavior. |
| `jellyfin` | Allows Jellyfin sounds. | `true` | No | Applies to start and end sounds. |
| `navidrome` | Allows Navidrome sounds. | `true` | No | Applies to start and end sounds. |
| `quiet_hours.enabled` | Suppresses sounds during quiet hours. | `false` | No | Suppresses start and end sounds; no retroactive sounds after quiet hours end. |
| `quiet_hours.start` | Quiet-hours start. | `23:00` | No | `HH:MM`, local system time. |
| `quiet_hours.end` | Quiet-hours end. | `08:00` | No | Cross-midnight ranges are supported. |
| `continuous_sessions.navidrome` | Treats Navidrome item changes as one sound session. | `true` | No | Track changes do not trigger new start sounds. |
| `continuous_sessions.jellyfin_libraries` | Jellyfin libraries treated as continuous for sounds. | `["Music"]` | No | Exact library names, not hardcoded to music. |
| `session_start.retrigger_after_inactive_seconds` | Inactive cooldown before continuous sessions can start-sound again. | `30` | No | Requires uninterrupted inactivity. |
| `session_end.enabled` | Enables session-ended sounds. | `false` | No | Item changes in continuous sessions do not count as endings. |
| `session_end.tone` | Default session-ended tone. | `close.mp3` | No | `close.mp3` is bundled and normalized; user-supplied custom sounds are not normalized. |
| `trigger` | Start sound trigger mode. | `new_session` | No | Options: `new_session`, `new_user_session`. |
| `directory` | Directory scanned for sound files. | `/app/sounds` | No | Browser-friendly formats: `.mp3`, `.ogg`, `.wav`, `.m4a`, `.aac`, `.flac`. |
| `tone` | Default session-start tone. | `noted.mp3` | No | Can be overridden per user with `sound`. |
| `volume` | Sound playback volume. | `0.35` | No | Range `0` to `1`. |

**Browser sound note:** most browsers will not allow MediaWall to play audible sounds until the page has received at least one click, tap, or keypress after loading. This is a browser autoplay restriction, not a MediaWall setting.

Refreshing the display doesn’t replay a session-start sound. Restarting MediaWall may play it again for an active session. Browser audio permission and mute settings apply separately to each device.

**Testing sound note:** if you keep testing with the same media item, MediaWall may not play the tone every time. Brief pauses, reconnects, and track changes within continuous sessions don’t normally trigger another sound.

For custom audio, normalize files before adding them. The bundled sounds use MP3 at 44.1 kHz stereo, 128 kbps, with loudness normalized around `I=-18`, `TP=-1.5`, `LRA=11`. One ffmpeg example:

```sh
ffmpeg -i input.mp3 -af loudnorm=I=-18:TP=-1.5:LRA=11 -ar 44100 -ac 2 -b:a 128k output.mp3
```

### Space Display

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `ui.scale` | Scales the interface. | `0.85` | No | Applies to controls, dialogs, grid cards, and toast notifications. Buttons stay large enough to tap. |
| `music_artist_images` | Music artist role filter. | `albumartists` | No | Options: `artists`, `albumartists`, `both`. |
| `music_logo_artist` | Music logo and fallback text artist credit. | `artists` | No | Options: `artists`, `albumartist`. `music_artist_images` controls which artist artwork/backdrops are selected; this setting controls whether the visible logo/text follows the track's credited artists or the album artist. |
| `cycle_interval_seconds` | Wallpaper/Screensaver cycle interval. | `15` | No | When shuffle is off, items go library-by-library and alphabetically. |
| `screensaver_interval` | Legacy alias for cycle interval. | `15` | No | Prefer `cycle_interval_seconds`. |
| `require_logos` | Requires logos for display/grid eligibility. | `true` | No | Navidrome-only items need local logo files. |
| `backdrop_background_color` | Background color behind normal media display when no usable backdrop is available or a backdrop cannot load. | `#050508` | No | Separate from `mediawall_fallback.background_color`, which only controls the intentional MediaWall/logo fallback screen. |
| `multiple_backdrops.mode` | Multiple-backdrop behavior. | `single_backdrop` | No | Options: `single_backdrop`, `cycle`. |
| `multiple_backdrops.single_backdrop` | Single-backdrop selection mode. | `random` | No | Options: `first`, `numbered`, `random`. |
| `multiple_backdrops.cycle_order` | Multiple-backdrop cycle order. | `numbered` | No | Options: `numbered`, `shuffle`. |
| `animations.enabled` | Enables ambient backdrop animations. | `true` | No | Applies globally per space. |
| `animations.style` | Backdrop animation style. | `kenburns` | No | Options: `breathe`, `pan`, `kenburns`, `drift`, `focus`, `zoom`, `All`. |
| `animations.scale` | Animation scale. | `1.08` | No | Used by zooming animations; MediaWall adds enough overscan for moving animations to avoid blank edges. |
| `animations.duration_seconds` | Animation duration. | `26` | No | Duration of one animation direction before it alternates. |
| `logo.max_width` | Logo image maximum width. | `520` | No | Pixels. |
| `live_tv.channel_image_size` | Centered Live TV channel image bounding-box size. | `713` | No | Pixels; integer from `32` to `4096`, constrained to fit the viewport. Preserves aspect ratio and follows display animation settings. Channel name and Live TV label are independently controlled through Media Info. |
| `album_art.size` | Now Playing album cover size. | `300` | No | Pixels. |
| `fallback_title.font_size` | Fallback title text size. | `86` | No | Used when title text rendering applies. |

### Backdrop Animations

These settings live inside Space Display, under `animations`. The old breathing effect is now called `breathe` and is one option in the broader animations system.

| Animation | What It Does | Good Fit |
| --- | --- | --- |
| `breathe` | Slowly pulses the backdrop in and out. | A subtle version of the original MediaWall/Jellyfin-style movement. |
| `pan` | Slowly moves horizontally from side to side. | More square displays, older iPads, or any screen where a 16:9 backdrop is cropped. |
| `kenburns` | Combines slow pan and slow zoom. | Default. Good general-purpose movement across TVs, tablets, and Raspberry Pi displays. |
| `drift` | Moves slowly in a diagonal direction. | Ambient screens where a little more movement is welcome. |
| `focus` | Gently wanders around the starting point. | Very subtle movement, especially for desks or bedroom displays. |
| `zoom` | Makes one long zoom movement before reversing. | When you want motion without much side-to-side travel. |

Older devices may handle motion less smoothly. On something like a 2017 iPad, start with `breathe`, `pan`, or `focus`, and use a longer `duration_seconds`. More active styles such as `kenburns` and `drift` can look better on faster tablets, TVs, and desktop browsers.

Example:

```yaml
display:
  animations:
    enabled: true
    style: kenburns
    scale: 1.08
    duration_seconds: 26
```

### Now Playing Text

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Shows the upper-right Now Playing badge. | `false` | No | Master switch for this badge. |
| `text` | Now Playing badge label. | `Now playing on` | No | Text can be customized. |
| `show_text` | Shows badge label text. | `true` | No | Can be disabled while leaving icon/user visible. |
| `font_size` | Badge label font size. | `16` | No | Pixels. |
| `show_source_icon` | Shows Jellyfin/Navidrome icon. | `true` | No | Can be disabled independently. |
| `icon_size` | Source icon size. | `24` | No | Pixels. |
| `show_user_avatar` | Shows Jellyfin avatar. | `false` | No | Navidrome does not provide avatars. |
| `user_avatar_size` | Jellyfin avatar size. | `24` | No | Pixels. |
| `user_avatar_resize.enabled` | Downloads smaller Jellyfin avatars. | `true` | No | Helpful for animated GIF avatars and older devices such as older iPads. |
| `user_avatar_resize.size` | Requested Jellyfin avatar image size. | `96` | No | Pixels. This affects the image fetched from Jellyfin, not the rendered UI size. |
| `show_jellyfin_username` | Shows Jellyfin username. | `false` | No | Aligns cleanly if avatar/text/icon are disabled. |
| `show_navidrome_username` | Shows Navidrome username. | `false` | No | Useful because Navidrome has no avatars. |
| `user_font_size` | Username font size. | `13` | No | Pixels. |

### Screensaver Text

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `enabled` | Shows Wallpaper/Screensaver badge. | `true` | No | Hidden when paused as wallpaper. |
| `text` | Wallpaper/Screensaver badge text. | `Featured on MediaWall` | No | Custom display label. |
| `font_size` | Wallpaper/Screensaver badge font size. | `16` | No | Pixels. |
| `icon_size` | Wallpaper/Screensaver badge icon size. | `24` | No | Pixels. |

### Media Info

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `font_size` | General media info font size. | `40` | No | Used as fallback for specific media info sizes. |
| `release_year_font_size` | Movie release year size. | `40` | No | Applies only to movie-type items. |
| `episode_info_font_size` | Episode code size. | `28` | No | Example: `S02E04`. |
| `episode_title_font_size` | Episode title size. | `40` | No | Separate from episode code. |
| `music_album_font_size` | Music album line size. | `24` | No | Used when album info is enabled. |
| `music_song_title_font_size` | Song title line size. | `40` | No | Used when song title info is enabled. |

### Transitions

| Setting | Purpose | Default | Required | Notes |
| --- | --- | --- | --- | --- |
| `duration_ms` | Transition duration. | `1200` | No | Milliseconds. |
| `order` | Transition order mode. | `written` | No | Options: `written`, `shuffle`. |
| `styles` | Transition styles to use. | `["crossfade"]` | No | Options: `crossfade`, `fade`, `slide_left`, `slide_right`, `slide_up`, `slide_down`, `push_left`, `push_right`, `zoom_fade`, `soft_zoom`, `blur_fade`, `wipe_left`, `wipe_right`, `All`. |

For older tablets, `crossfade`, `fade`, and `blur_fade` are usually the safest choices. Directional slide, push, wipe, and zoom transitions can look more dynamic, but may feel heavier on older iPads or low-power kiosk devices.

### Artwork source logging

At `LOG_LEVEL=info`, logs tell you where backdrops, logos, and album covers came from, including Library and named providers. They also show how many images were downloaded and why candidates were skipped. Reused images report `downloaded=0`. MusicBrainz identifies artists and albums; it doesn’t supply images. Credentials and full remote image URLs aren’t included in source descriptions.

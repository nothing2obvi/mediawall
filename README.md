<img src="src/logos/banner.png" alt="MediaWall" width="100%">

<p align="center">
  <a href="https://ko-fi.com/yeahnoforsure_">
    <img src="src/logos/ko-fi.png" alt="Support me on Ko-fi" width="360">
  </a>
</p>

<p align="center">
  Also by me: <a href="https://github.com/nothing2obvi/pixelfin">Pixelfin</a>
</p>

# MediaWall

Current version: `v0.1`

⚠️ MediaWall is under active development. There may be breaking changes, which will be highlighted in every release.

Like [Pixelfin](https://github.com/nothing2obvi/pixelfin), this project is vibecoded with Codex. It is built with security in mind, but because it is a vibecoded self-hosted app, I cannot promise it is hardened for hostile public exposure. Prioritize running it locally or behind access controls you trust.

In line with my ongoing obsession with the images and artwork in Jellyfin, as seen through my other project, [Pixelfin](https://github.com/nothing2obvi/pixelfin), I wanted to combine my appreciation for the Jellyfin Android TV screensaver with the fact that I also like being able to glance over and see what people are currently watching or listening to on my Jellyfin and Navidrome servers.

Then I realized I had an old iPad laying around doing absolutely nothing. I wanted something that would work on that or something like a Raspberry Pi. MediaWall was born.

MediaWall is a display app for Jellyfin and Navidrome built around three main features, and it's meant to work well on things like an old iPad, a Raspberry Pi connected to a monitor, or really any device with a browser.

The first, and most prominent, is Now Playing. MediaWall shows what's currently being watched or listened to across your Jellyfin and Navidrome servers, along with artwork, user information, media details, and optional sound notifications when sessions start or end.

The sound system is customizable too. You can use one global sound, assign custom sounds to individual users, and control when sounds should or shouldn't play. This is especially useful with Navidrome or Jellyfin music libraries, where you probably don't want a notification every time the next song starts.

The second feature is Screensaver mode. This is heavily inspired by the Jellyfin Android TV screensaver and cycles through artwork from your Jellyfin libraries, with some additional options for controlling what appears and how it's displayed. The idea is to turn an otherwise unused screen, whether that's an old iPad or a Raspberry Pi display, into a constantly changing showcase for the artwork already sitting in your media collection. I know that many of you have terabytes of media, but it's all just data. MediaWall allows its viewers to passively browse your libraries.

Third is Wallpaper mode. If MediaWall lands on something you particularly like, you can pause on that media item and use it as a static wallpaper. You can also choose favorites and have MediaWall cycle through those instead, essentially creating your own curated rotation of artwork.

So depending on how you use it, MediaWall can be a live window into your Jellyfin and Navidrome servers, a Jellyfin-powered digital art display, or basically a very overengineered way to give an old iPad, Raspberry Pi, or spare screen something useful to do.

## Use Cases

Here are three examples of how MediaWall can be used.

### Now Playing Showcase: "What Are We Listening To?"

Use the `livingroom` space on a TV or tablet in a shared room. Set `playback_source: both`, map the space to one or more MediaWall users, and enable `nowplaying_text.show_user_avatar`, `nowplaying_text.show_jellyfin_username`, and/or `nowplaying_text.show_navidrome_username`. When someone asks what is playing, the display shows the latest active Jellyfin or Navidrome session with backdrop art, logo, source icon, and optional user identity.

### Now Playing Showcase For A Homelab

Use the `homelab` space with a MediaWall user whose `jellyfin_user` is `All`. This makes the display act like a household playback dashboard: newest active session wins, and concurrent active sessions cycle using `now_playing.cycle_interval_seconds`.

### Office Favorites Screensaver

Use the `office` space for ambient artwork. Open the grid, select a library, favorite specific backdrops, then use the Favorites selection option. With `display.screensaver_text.enabled: true`, the display can show a subtle "Featured on MediaWall" label while it rotates through favorite artwork. If the slideshow is paused, the label hides so the screen works as a clean static wallpaper.

## Screenshots

![Jellyfin Now Playing](src/screenshots/jellyfin_1.png)

![Jellyfin Session Cycling](src/screenshots/jellyfin_2.png)

![Navidrome Now Playing](src/screenshots/navidrome_1.png)

![MediaWall UI Controls](src/screenshots/ui_1.png)

![MediaWall Grid](src/screenshots/ui_2.png)

![MediaWall on iPad](src/screenshots/ipad_1.jpg)

## What It Does

- Shows the newest active playback from Jellyfin, Navidrome, or both.
- Supports multiple MediaWall users per space, including Jellyfin `All` users.
- Falls back to a default MediaWall screen or shuffled artwork when nothing is playing.
- Provides a full-screen Wallpaper/Screensaver mode with library browsing, favorites, shuffle, logos, media info, transitions, and subtle backdrop motion.
- Uses Jellyfin backdrops/logos where available.
- Can use Navidrome playback for music-focused setups, and Navidrome can use Jellyfin's images when both services are configured.
- Can use local artist backdrop and logo files for Navidrome-only artwork.
- Caches grid/backdrop images with startup and cron-based library scans.

Jellyfin is recommended because MediaWall can use its rich backdrop, logo, user avatar, movie, series, and artist metadata. Navidrome is not strictly required, and Jellyfin is not strictly required for a music-only wall: Navidrome can drive Now Playing and local artist backdrop files can provide artwork. If both Jellyfin and Navidrome are configured, Navidrome playback can match against Jellyfin artist data so the Now Playing and Wallpaper/Screensaver views still benefit from Jellyfin's images.

## Quick Start

Create a `docker-compose.yml`:

```yaml
services:
  mediawall:
    image: ghcr.io/nothing2obvi/mediawall:latest
    container_name: mediawall
    restart: unless-stopped
    ports:
      - "1221:1221"
    env_file:
      - .env
    volumes:
      - ./config.yml:/app/config.yml:ro
      - ./data:/app/data
      - ./sounds:/app/sounds:ro
      - ./custom:/app/custom:ro
```

Then:

1. Copy `.env.example` to `.env`.
2. Fill in Jellyfin and/or Navidrome connection values.
3. Edit `config.yml` for your spaces and libraries.
4. Start the app:

```sh
docker compose up -d
```

Open a space:

```text
http://localhost:1221/livingroom
http://localhost:1221/office
http://localhost:1221/homelab
```

If a space has a password, pass it in the URL:

```text
http://localhost:1221/livingroom?password=your-password
```

Interactive state is stored in `data/state.json`. Image cache data is stored under the configured `library_scan.directory`, which defaults to `/app/data/grid-cache` inside the container.

## Display Setup

### Apple Devices

Open your MediaWall space in Safari, tap the Share button, then choose **Add to Home Screen**. Launching from the Home Screen runs it like a PWA. If sounds are enabled, tap the MediaWall screen once after opening so Safari allows audio playback.

### Android Devices

Open your MediaWall space in Chrome, open the browser menu, then choose **Add to Home screen** or **Install app** if Chrome offers it. If sounds are enabled, tap the screen once after opening so the browser allows audio playback.

### Raspberry Pi

One common setup is to launch Chromium in kiosk mode after the desktop starts:

```sh
chromium-browser --kiosk --app=http://localhost:1221/livingroom
```

Use the URL for the space you want to display. If the MediaWall container is running on another machine, replace `localhost` with that machine's IP address.

## Docker Commands

Once the container is running, you can test sounds and MediaWall fallback animations from inside the container:

```sh
docker exec mediawall npm run mediawall -- play sound noted.mp3 on livingroom
docker exec mediawall npm run mediawall -- play sounds All on livingroom
docker exec mediawall npm run mediawall -- play mediawall dvd on livingroom
docker exec mediawall npm run mediawall -- play screensaver All on livingroom
```

The MediaWall fallback test displays the selected animation for 30 seconds. `All` previews each configured MediaWall fallback animation for 30 seconds each and labels the current one in the bottom-right corner. `play sounds All` plays each available sound with two seconds between sounds and labels the current sound in the bottom-right corner. The command reads `config.yml`, so it can target password-protected spaces without putting the password in the command.

## Configuration

For a complete table of sections, defaults, required values, and notes, see [CONFIGURATION.md](CONFIGURATION.md).

Secrets should live in `.env`. Display behavior should live in `config.yml`.

See [Configuration](CONFIGURATION.md) for a section summary and a full table of every setting, purpose, default value, requiredness, and notes. Optional settings can be omitted from `config.yml`; MediaWall will use the documented defaults.

### Environment Variables

```env
JELLYFIN_URL=http://jellyfin.example.local:8096
JELLYFIN_API_KEY=replace-with-a-jellyfin-admin-api-key
JELLYFIN_USER=mediawall

NAVIDROME_URL=http://navidrome.example.local:4533
NAVIDROME_USER=mediawall
NAVIDROME_PASSWORD=replace-with-a-navidrome-password

LIVINGROOM_PASSWORD=
HOMELAB_PASSWORD=
```

The Jellyfin API key should belong to a Jellyfin admin user. MediaWall uses it to read sessions, users, libraries, and artwork. Individual Jellyfin display users can still be selected per MediaWall user in `config.yml`, including `All`.

For Navidrome, configure each Navidrome account you want MediaWall to distinguish as its own MediaWall user. Navidrome users are what let MediaWall show unique sessions and user names when more than one person is listening. For example, you can add `NAVIDROME_JON_USER`, `NAVIDROME_JON_PASSWORD`, `NAVIDROME_GUEST_USER`, and `NAVIDROME_GUEST_PASSWORD`, then reference those from separate `users` entries in `config.yml`.

Password environment variables are per space by convention. In addition to `LIVINGROOM_PASSWORD=` and `HOMELAB_PASSWORD=`, you can create any others you need, such as `OFFICE_PASSWORD=` or `KITCHEN_PASSWORD=`, then reference them from the matching space.

### Top-Level Settings

`server.port`

Default: `1221`

The HTTP port MediaWall listens on.

`library_scan.enabled`

Default: `true`

Enables warming and caching of grid backdrop images.

`library_scan.directory`

Default: `/app/data/grid-cache`

Cache directory for warmed images.

`library_scan.ttl_days`

Default: `30`

How long cached images are considered fresh.

`library_scan.scan_on_startup`

Default: `true`

Runs a library image scan shortly after startup.

`library_scan.cron.enabled`

Default: `true`

Enables recurring scheduled library scans.

`library_scan.cron.expression`

Default: `0 3 * * *`

Standard five-field cron expression for scheduled scans.

`jellyfin.url`

Default: empty string

Jellyfin base URL. Environment variables are supported, such as `${JELLYFIN_URL}`.

`jellyfin.api_key`

Default: empty string

Jellyfin API key. An admin user API key is recommended so MediaWall can read sessions, users, libraries, and artwork.

`navidrome.enabled`

Default: `false`

Enables Navidrome playback and music artwork support.

`navidrome.url`

Default: empty string

Navidrome base URL.

`navidrome.artwork.jellyfin_fallback`

Default: `true`

Allows Navidrome music playback to use matching Jellyfin artist artwork when Jellyfin is configured.

`navidrome.artwork.local_files`

Default: `true`

Enables local artist backdrop lookup for Navidrome-only artwork. If you run MediaWall with Navidrome and no Jellyfin, this must be enabled for Wallpaper/Screensaver grids and rotations to have artist backdrop images. Navidrome cover art can still appear for Now Playing album art, but it does not provide the wide backdrop/logo metadata that Jellyfin does.

`navidrome.artwork.order`

Default: `["jellyfin", "local"]`

Controls which artwork source MediaWall tries first for Navidrome playback. Use `["local", "jellyfin"]` if you want local artist backdrops/logos to win before Jellyfin artist artwork. `jellyfin_fallback` and `local_files` still act as enable switches; disabled sources are skipped even if they appear in the order.

`navidrome.artwork.path_mappings`

Default: `[]`

Optional path mappings used when matching Navidrome music paths to paths visible inside the MediaWall container.

Each mapping has a `navidrome` path, which is the path Navidrome reports for tracks, and a `mediawall` path, which is where that same music/artwork tree is mounted inside the MediaWall container. The default `mediawall` value for an entry is `/navidrome_music`.

For Navidrome-only local artwork, MediaWall looks for artist folders under each configured `mediawall` path mapping value. For an artist named `Example Artist`, files should live in:

```text
<mapped path>/Example Artist/
```

Preferred filenames are checked first:

```text
fanart.jpg
fanart.jpeg
fanart.png
fanart.webp
backdrop.jpg
backdrop.jpeg
backdrop.png
backdrop.webp
background.jpg
background.jpeg
background.png
background.webp
landscape.jpg
landscape.jpeg
landscape.png
landscape.webp
banner.jpg
banner.jpeg
banner.png
banner.webp
wallpaper.jpg
wallpaper.jpeg
wallpaper.png
wallpaper.webp
```

MediaWall also accepts additional `.avif`, `.jpg`, `.jpeg`, `.png`, and `.webp` files in that artist folder when the filename contains `backdrop`, `background`, `fanart`, `landscape`, `banner`, or `wallpaper`.

Multiple local backdrops are supported by placing more than one matching image in the same artist folder. For example:

```text
<mapped path>/Example Artist/fanart.jpg
<mapped path>/Example Artist/fanart-02.jpg
<mapped path>/Example Artist/backdrop-live.webp
<mapped path>/Example Artist/wallpaper_3.png
```

Avoid generic names like `image1.jpg` or `photo.png`; MediaWall ignores extra local files unless the filename contains one of the backdrop keywords above.

If `display.require_logos: true` is enabled, Navidrome-only artist items also need a local logo file in the same artist folder. Supported logo filenames include:

```text
logo.png
logo.webp
logo.jpg
logo.jpeg
logo.avif
clearlogo.png
clearlogo.webp
clearlogo.jpg
clearlogo.jpeg
clearlogo.avif
artist-logo.png
artist-logo.webp
artist-logo.jpg
artist-logo.jpeg
artist-logo.avif
```

MediaWall also accepts additional `.avif`, `.jpg`, `.jpeg`, `.png`, and `.webp` logo files when the filename contains `logo`, `clearlogo`, or `artist-logo`.

### Users

`users` maps a MediaWall user name to Jellyfin and/or Navidrome accounts.

```yaml
users:
  primary:
    jellyfin_user: "${JELLYFIN_USER}"
    navidrome_user: "${NAVIDROME_USER}"
    navidrome_password: "${NAVIDROME_PASSWORD}"
  all:
    jellyfin_user: "All"
    navidrome_user: "All"
    navidrome_password: "${NAVIDROME_PASSWORD}"
```

`jellyfin_user`

Default: unset

Jellyfin username for this MediaWall user. Use `All` to watch all Jellyfin users.

`navidrome_user`

Default: unset

Navidrome username for this MediaWall user. Use `All` to watch all active Navidrome users. Navidrome still needs at least one real configured username/password for API access.

`navidrome_password`

Default: unset

Navidrome password for this MediaWall user.

`sound`

Default: unset

Optional tone filename for this MediaWall user. When Now Playing sounds are enabled, this overrides `now_playing.sounds.tone` for sessions matched to this MediaWall user. Put custom sound files in the configured sounds directory, such as `/app/sounds`.

`end_sound`

Default: unset

Optional session-ended tone filename for this MediaWall user. When `now_playing.sounds.session_end.enabled` is true, this overrides `now_playing.sounds.session_end.tone` for sessions matched to this MediaWall user.

### Spaces

Each key under `spaces` becomes a route, such as `/livingroom`.

`spaces.<name>.playback_source`

Default: `both`

Options: `jellyfin`, `navidrome`, `both`

Controls which playback sources are watched for Now Playing.

`spaces.<name>.users`

Default: `["All"]`

MediaWall users allowed in this space.

Use configured MediaWall user names, or use `All` to allow every configured MediaWall user in that space. If omitted, MediaWall uses all configured users.

`spaces.<name>.password`

Default: unset

Optional space password. If omitted or set to `""`, the space does not require `?password=`.

`spaces.<name>.libraries`

Default: `[]`

Library names to show in the grid, selection dialog, shuffle, and Wallpaper/Screensaver rotation. Use `All` to allow all Jellyfin libraries. Grid and rotation entries must have at least one backdrop image.

When shuffle is enabled, MediaWall creates a randomized permutation of all currently eligible media and exhausts that order before reshuffling. Turning shuffle off and back on, changing selection filters, or switching modes clears the current shuffle order.

`spaces.<name>.idle_timeout`

Default: `30`

Reserved display idle timeout value in seconds.

### Now Playing

`now_playing.fallback`

Default: `mediawall`

Options: `mediawall`, `shuffle`

Controls what Now Playing mode shows when nothing is actively playing.

`now_playing.fallback_shuffle_interval_seconds`

Default: `45`

When fallback is `shuffle`, controls how often idle fallback artwork changes.

`now_playing.ignored_libraries`

Default: `["Feature Pre-Rolls"]`

Jellyfin-only list of exact library names to ignore for Now Playing. Matching is case-insensitive. If a Jellyfin item is playing from one of these libraries, MediaWall does not count it as an active session, does not switch the display to it, and does not play a new-session tone. Libraries made for Jellyfin Cinema Mode intros, trailers, or pre-rolls are good candidates to include here.

`now_playing.cycle_users`

Default: `false`

When multiple active users or concurrent sessions are available, cycles among them while prioritizing the newest active playback.

`now_playing.cycle_interval_seconds`

Default: `15`

How long each active playback stays selected before cycling.

`now_playing.session_timer.enabled`

Default: `true`

Shows a hollow top-left countdown ring in Now Playing mode when multiple active sessions are cycling.

`now_playing.session_timer.size`

Default: `42`

Controls the diameter of the Now Playing session countdown ring in pixels.

`now_playing.session_count.enabled`

Default: `true`

Shows centered `1 of 4` style session text in the top-left Now Playing session status area. This can be enabled separately from the countdown ring.

`now_playing.session_count.font_size`

Default: `13`

Controls the session count text size in pixels.

`now_playing.mediawall_fallback.mode`

Default: `dvd`

Options: `centered`, `breathing`, `float`, `spotlight`, `dvd`, `minimal`

Controls the MediaWall banner screen shown when Now Playing mode has nothing playing and `now_playing.fallback` is `mediawall`.

`now_playing.mediawall_fallback.modes`

Default: `["All"]`

Options: `All`, `centered`, `breathing`, `float`, `spotlight`, `dvd`, `minimal`

Controls which MediaWall banner screensavers are used across separate no-session rounds. `All` includes every built-in fallback mode. If you list specific modes, MediaWall advances through them in the written order each time sessions end and the display returns to the MediaWall fallback.

`now_playing.mediawall_fallback.color_changes`

Default: `false`

Allows DVD mode to change the banner color when it hits an edge. Leave this off on older devices if the color shift causes stutter.

`now_playing.custom_logo.directory`

Default: `/app/custom`

Directory checked for a custom fallback logo. Put one `.png` or `.svg` file in this directory, or mount a host folder to `/app/custom`; MediaWall uses the first matching file alphabetically. If no custom image exists, it uses the bundled MediaWall banner.

`now_playing.sounds.enabled`

Default: `true`

Plays a browser audio tone when a Now Playing session appears.

**Browser sound note:** most browsers will not allow MediaWall to play audible sounds until the page has received at least one click, tap, or keypress after loading. This is a browser autoplay restriction, not a MediaWall setting.

Sounds fire when the new session becomes the visible Now Playing session. If the same user on the same source starts a new session for the same media item while MediaWall is already open, MediaWall treats it as already announced and does not play another tone.

`now_playing.sounds.jellyfin`

Default: `true`

Allows tones for Jellyfin Now Playing sessions.

`now_playing.sounds.navidrome`

Default: `true`

Allows tones for Navidrome Now Playing sessions.

`now_playing.sounds.quiet_hours.enabled`

Default: `false`

Suppresses session-start and session-ended tones during quiet hours without changing any visual behavior. Sounds are not played retroactively after quiet hours end.

`now_playing.sounds.quiet_hours.start`

Default: `23:00`

Quiet-hours start time using local system time in `HH:MM` 24-hour format.

`now_playing.sounds.quiet_hours.end`

Default: `08:00`

Quiet-hours end time using local system time in `HH:MM` 24-hour format. Ranges that cross midnight are supported.

`now_playing.sounds.continuous_sessions.navidrome`

Default: `true`

Treats Navidrome item changes as one continuous playback session for sounds. Changing from one track to another does not trigger another session-start tone.

`now_playing.sounds.continuous_sessions.jellyfin_libraries`

Default: `["Music"]`

Jellyfin library names whose item changes should be treated as one continuous playback session for sounds. This is configurable by exact library name and is not hardcoded to music; you can add or remove any Jellyfin library.

`now_playing.sounds.session_start.retrigger_after_inactive_seconds`

Default: `300`

For continuous-session sources or libraries, controls how long there must be no active session before a later playback can trigger another session-start tone. If playback resumes before this uninterrupted inactive window completes, the start tone stays quiet and the inactivity timer resets.

`now_playing.sounds.session_end.enabled`

Default: `false`

Plays a tone when a genuine sound session ends. Item changes inside configured continuous sources or Jellyfin libraries do not count as session endings.

`now_playing.sounds.session_end.tone`

Default: `close.mp3`

Default session-ended tone filename. A MediaWall user can override this with `users.<name>.end_sound`.

`now_playing.sounds.trigger`

Default: `new_session`

Options: `new_session`, `new_user_session`

Controls whether tones play for every newly detected session or only when a new active user appears.

`now_playing.sounds.directory`

Default: `/app/sounds`

Directory scanned for available sound files. MediaWall detects files in this directory at runtime and exposes the filenames for configured tones. Supported browser-friendly formats include `.mp3`, `.ogg`, `.wav`, `.m4a`, `.aac`, and `.flac`; `.mp3`, `.ogg`, and `.wav` are the safest across browsers.

For custom audio, normalize files before adding them. The bundled sounds use MP3 at 44.1 kHz stereo, 128 kbps, with loudness normalized around `I=-18`, `TP=-1.5`, `LRA=11`. One ffmpeg example:

```sh
ffmpeg -i input.mp3 -af loudnorm=I=-18:TP=-1.5:LRA=11 -ar 44100 -ac 2 -b:a 128k output.mp3
```

`now_playing.sounds.tone`

Default: `noted.mp3`

Default tone filename. A MediaWall user can override this with `users.<name>.sound`.

`now_playing.sounds.volume`

Default: `0.35`

Playback volume from `0` to `1`.

### Sound Troubleshooting

MediaWall plays session-start sounds when a qualifying session becomes the visible Now Playing session. It does not play retroactive sounds for sessions that were already visible when the page loaded, and browsers still require one tap/click/key before audible playback.

If `continuous_sessions.navidrome` is enabled, Navidrome track changes are treated as part of one continuous session, so a new song does not trigger another start sound. Jellyfin libraries listed in `continuous_sessions.jellyfin_libraries` work the same way. After a continuous session stops, `session_start.retrigger_after_inactive_seconds` controls how long there must be no active session before a new start sound is eligible again.

For non-continuous sessions, MediaWall also ignores a duplicate session that has the same source, user, and media item during the current page session. This prevents reconnects or duplicate Jellyfin/Navidrome reports for the same thing from repeatedly playing the same tone.

### Display

`display.ui.scale`

Default: `1`

Overall UI scale for controls, selectors, dialogs, grid cards, and toast notifications. Use values below `1`, such as `0.85`, for a smaller UI, or values above `1`, such as `1.2`, for a larger room-display UI.

`display.music_artist_images`

Default: `albumartists`

Options: `artists`, `albumartists`, `both`

Controls which Jellyfin music artist roles are allowed to appear in music grids and artwork rotation.

`display.cycle_interval_seconds`

Default: `15`

Wallpaper/Screensaver image cycle interval. When shuffle is disabled, MediaWall advances library by library in config order, alphabetically within each library.

`display.require_logos`

Default: `true`

Wallpaper/Screensaver and grid browsing. When true, items without logos are skipped. When false, items with backdrops but no logos are allowed and their titles can render as text. Jellyfin items use Jellyfin logo artwork. Navidrome-only items need a supported local logo file in the artist folder. Navidrome playback that successfully falls back to Jellyfin artist artwork uses the Jellyfin logo.

`display.multiple_backdrops.mode`

Default: `single_backdrop`

Options: `single_backdrop`, `cycle`

Controls how items with multiple backdrops behave.

`display.multiple_backdrops.single_backdrop`

Default: `random`

Options: `first`, `numbered`, `random`

Used when `mode` is `single_backdrop`. `numbered` advances through an item's backdrop indexes each time the item appears.

`display.multiple_backdrops.cycle_order`

Default: `numbered`

Options: `numbered`, `shuffle`

Used when `mode` is `cycle`. The item's display time is split among its backdrops.

`display.backdrop_motion.enabled`

Default: `true`

Enables a slow zoom-in/zoom-out motion on backdrop images.

`display.backdrop_motion.scale`

Default: `1.08`

Maximum scale for backdrop motion.

`display.backdrop_motion.duration_seconds`

Default: `24`

Duration of one backdrop motion direction before it reverses.

`display.logo.max_width`

Default: `520`

Maximum logo image width in pixels.

`display.fallback_title.font_size`

Default: `86`

Font size for fallback text title when a logo is unavailable and fallback title rendering applies.

`display.album_art.size`

Default: `200`

Now Playing album cover size in pixels.

`display.nowplaying_text.enabled`

Default: `false`

Shows the configurable Now Playing label in the upper-right corner.

`display.nowplaying_text.text`

Default: `Now playing on`

Now Playing label text.

`display.nowplaying_text.show_text`

Default: `true`

Shows or hides the Now Playing label text. This is separate from the master `enabled` switch.

`display.nowplaying_text.font_size`

Default: `16`

Now Playing label font size.

`display.nowplaying_text.show_source_icon`

Default: `true`

Shows or hides the Jellyfin/Navidrome source icon.

`display.nowplaying_text.icon_size`

Default: `24`

Now Playing source icon size.

`display.nowplaying_text.show_user_avatar`

Default: `false`

Shows the Jellyfin user avatar under the Now Playing label when Jellyfin provides one. Navidrome does not provide avatars.

`display.nowplaying_text.user_avatar_size`

Default: `24`

Now Playing Jellyfin user avatar size in pixels.

`display.nowplaying_text.user_avatar_resize.enabled`

Default: `true`

Requests resized Jellyfin avatars. This is helpful for animated GIF avatars and older devices such as older iPads.

`display.nowplaying_text.user_avatar_resize.size`

Default: `96`

Requested Jellyfin avatar image size in pixels. This affects the image fetched from Jellyfin, not the rendered UI size.

`display.nowplaying_text.show_jellyfin_username`

Default: `false`

Shows the Jellyfin username under the Now Playing label. Avatar and username can be enabled independently; when only one is enabled, it stays aligned to the right edge of the badge.

`display.nowplaying_text.show_navidrome_username`

Default: `false`

Shows the Navidrome username under the Now Playing label. Navidrome does not provide avatars, so this is useful when you want Navidrome sessions to still identify the listener.

`display.nowplaying_text.user_font_size`

Default: `13`

Now Playing user label font size.

`display.screensaver_text.enabled`

Default: `true`

Shows the configurable Wallpaper/Screensaver label in the upper-right corner while the slideshow is playing. It is hidden when paused as a static wallpaper.

`display.screensaver_text.text`

Default: `Featured on MediaWall`

Wallpaper/Screensaver label text.

`display.screensaver_text.font_size`

Default: `16`

Wallpaper/Screensaver label font size.

`display.screensaver_text.icon_size`

Default: `24`

Wallpaper/Screensaver Jellyfin icon size.

`display.media_info.font_size`

Default: `40`

General media info font size.

`display.media_info.release_year_font_size`

Default: `40`

Movie release year font size.

`display.media_info.episode_info_font_size`

Default: `28`

Episode code font size, such as `S02E04`.

`display.media_info.episode_title_font_size`

Default: `40`

Episode title font size.

`display.media_info.music_album_font_size`

Default: `24`

Music album line font size.

`display.media_info.music_song_title_font_size`

Default: `40`

Music song title line font size.

`display.transitions.duration_ms`

Default: `1200`

Transition duration in milliseconds.

`display.transitions.order`

Default: `written`

Options: `written`, `shuffle`

Controls whether transition styles cycle in written order or shuffle.

`display.transitions.styles`

Default: `crossfade`

Options: `crossfade`, `fade`, `slide_left`, `slide_right`, `slide_up`, `slide_down`, `push_left`, `push_right`, `zoom_fade`, `soft_zoom`, `blur_fade`, `wipe_left`, `wipe_right`, `All`

When `styles: All` and `order: written`, transitions run in this order:

```text
crossfade, fade, slide_left, slide_right, slide_up, slide_down, push_left, push_right, zoom_fade, soft_zoom, blur_fade, wipe_left, wipe_right
```

## Jellyfin And Navidrome Notes

Jellyfin gives the best experience because MediaWall can access:

- Now Playing sessions
- user avatars
- movie, series, episode, and music metadata
- backdrops
- logos
- image tags for cache-busting changed artwork

Navidrome can be used for music playback. For artwork, MediaWall can use matching Jellyfin artist data when both services are configured, or local artist backdrop files when running Navidrome-only.

For Navidrome-only installations, enable:

```yaml
navidrome:
  artwork:
    local_files: true
```

Then add at least one `path_mappings` entry whose `mediawall` value points to the local root containing artist folders:

```yaml
navidrome:
  artwork:
    path_mappings:
      - navidrome: "/music"
        mediawall: "/navidrome_music"
```

Older configs using `jellyfin` in a path mapping are still accepted for compatibility, but new configs should use `mediawall`.

## Development

Install dependencies:

```sh
npm install
```

Run checks:

```sh
npm run typecheck
npm run build
```

Run locally:

```sh
npm run dev
```

## Repository And Test Split

The intended workflow is:

- `mediawall`: sanitized source suitable for publishing.
- `mediawall-test`: personal test-running copy with private `.env`, personalized `config.yml`, cache, and state.

Code changes should be made in `mediawall`, synced to `mediawall-test`, and the running container should be built from `mediawall-test`.

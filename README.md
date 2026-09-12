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

Secrets should live in `.env`. Display behavior should live in `config.yml`.

For the complete configuration reference, including every section, option, default, required value, and notes, see [CONFIGURATION.md](CONFIGURATION.md). Optional settings can be omitted from `config.yml`; MediaWall uses the documented defaults.

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

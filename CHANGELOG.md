# Changelog

## 0.5.1 - 2026-10-03

### Changes

- Unified default artwork orders: Subsonic and external music use `jellyfin, local, fetched`; Jellyfin music videos use `jellyfin, fetched`. Missing sections inherit these defaults, disabled sources are skipped, and lower sources fill artwork gaps.
- Added music-video artist artwork and conservative album-cover fallback through MediaWall’s providers, including Cover Art Archive. Existing Jellyfin artist-folder artwork and music-track matching keep priority. Canonical release IDs win; text matching requires the album and artist, and ambiguous matches are skipped.
- Updated the README intro, household walkthrough, artwork reference, and Live TV exclusion guidance.
- Added optional per-space Jellyfin username filters: `spaces.<space>.jellyfin.included_jellyfin_users` and `excluded_jellyfin_users`. They match actual Jellyfin usernames exactly, ignoring case and surrounding whitespace. Exclusions win; omitted or empty lists add no restrictions.
- Filtered Jellyfin sessions never enter the space's playback candidates, so they don't appear anonymously, affect counts/cycling/fallback, or trigger transitions, sounds, or collection presentation. Other spaces and actual Jellyfin playback are unaffected.
- Fixed a literal top-level `All` user mapping being skipped when named users existed. Specific mappings win over the catch-all without duplicate sessions.
- Unified avatars across Jellyfin, Subsonic, and external music: mapped Jellyfin avatar first, custom source avatar second, then no avatar. Anonymous Mode overrides real avatars. Added custom Subsonic avatars alongside existing Spotify support, including cache-busted image URLs.
- Added automatic WebScrobbler, Libre.fm, Last.fm, Icecast, Google Cast/Chromecast, AzuraCast, and LMS icons. Custom external-source icons can use the same small `app/server-icons` mount as Subsonic server icons. Matching uses known aliases rather than arbitrary partial matches.
- Cleaned identifying metadata from the supplied icon files where present without changing their image content. Normalized the LMS filename to `lms.png`; Nextcloud retains its packaged PNG.
- Reworked configuration examples around Bob, Alice, and Jacob, with a detailed privacy-conscious living room and a minimal homelab dashboard. Added a full walkthrough, synchronized YAML example, three-user Multi-Scrobbler routing, and a source compatibility table distinguishing expected support from tested support.

### Upgrade notes and legacy behavior

No existing configuration syntax is removed. The new Jellyfin filters are optional and leave existing space-user selection, Anonymous Mode, and ignored-library rules intact when unused. All legacy Navidrome configuration aliases remain supported.

Review these behavior changes:

- **Changed artwork defaults:** Subsonic now tries fetched art after Jellyfin/local when order is omitted. Use `[jellyfin, local]` to retain its former default. External music defaults to the same three-source order; explicit legacy `preference: local` or `preference: fetched` preserves the previous grouped lookup, and explicit `order` wins.
- **Music-video artwork:** missing art can now be filled from MediaWall’s providers. Set `jellyfin.music_videos.artwork.order: [jellyfin]` to keep Jellyfin-only artwork. No local-files source is supported. Providers use your MediaWall `image_providers` settings, not Jellyfin’s private credentials. Without reliable album metadata or a release ID, no album is guessed.
- A literal top-level `All` mapping now participates in `users: [All]` alongside named mappings. If it maps `jellyfin_user: All`, additional Jellyfin users may now appear. Use an explicit space user list or the new Jellyfin username filters to restrict them.
- Mapped Jellyfin avatars now take priority over custom source avatars. Existing Spotify avatars remain supported. Custom filenames based on an optional display-name override remain a fallback after filenames based on the MediaWall user key.
- The examples now use Bob, Alice, and Jacob environment-variable names. Preserve your own config and `.env`; update both together only if adopting the examples.
- External icon matching is stricter. Known service names, aliases, and supported service URLs still work; arbitrary names containing a service name may use a custom or generic icon instead.

To hide Monica's Jellyfin playback entirely in one space, use `spaces.homelab.jellyfin.excluded_jellyfin_users: [monica]`. Anonymous Mode alone would still show her playback as someone. These filters do not block her Subsonic or external-music sessions.

See [Upgrading](https://github.com/nothing2obvi/mediawall/blob/v0.5.1/docs/upgrading.md) and the [Configuration Reference](https://github.com/nothing2obvi/mediawall/blob/v0.5.1/docs/configuration-reference.md).

### Validation and Docker images

120 automated tests and the production build passed. Tests cover filtering precedence, backward compatibility, catch-all resolution, anonymous identity safety, avatars, collections, source icons, documentation/example synchronization, artwork ordering, legacy preferences, conservative album identification, and Live TV exclusion.

Images for **linux/amd64** and **linux/arm64**:

- `ghcr.io/nothing2obvi/mediawall:v0.5.1`
- `ghcr.io/nothing2obvi/mediawall:latest`

## 0.5.0 - 2026-10-03

## New features

- **Subsonic-compatible music servers:** the existing Navidrome integration now uses Subsonic naming, with configurable server names and icons. Navidrome remains the primary tested server; other implementations aren't claimed as verified.
- **Server icons:** packaged choices include Navidrome, Gonic, Subsonic, Airsonic-Advanced, Ampache, Nextcloud, Funkwhale, and LMS. Custom icons can use the dedicated `./app/server-icons:/app/server-icons:ro` mount. Packaged image metadata was cleaned without changing the visuals.
- **Jellyfin music videos:** use all backdrops and the logo from the artist folder inside the Music Videos library. Album/track text and album-cover controls match music playback, while user transitions say "watching."
- **Music-video album covers:** first search Jellyfin music-type libraries for matching artist/title artwork. Exact titles win across libraries. If needed, trailing parenthetical groups are removed one at a time, so an exact remix beats the plain song. Artist aliases, casing, and whitespace are handled without broad fuzzy matching. Existing artwork providers remain the fallback, and displayed metadata stays unchanged.
- **Consistent music sound controls:** external music now has its own `continuous_sessions.external_music` setting. Jellyfin's default continuous libraries include both `Music` and `Music Videos`.

### Fixes

- Reduced flicker when changing media-info options by keeping older responses from overwriting newer selections.
- Local artist artwork uploads now use Jellyfin-compatible `logo.ext`, `backdrop.ext`, `backdrop1.ext`, and subsequent names. Existing files aren't bulk-renamed. Collision checks and rollback protect existing artwork; audio and video files aren't modified.

### Breaking changes and upgrade notes

No mandatory configuration migration from v0.4.3. Keep your existing config, `.env`, mounted paths, and artwork.

- **Canonical source identity is now `subsonic`.** Custom clients consuming source fields should accept `subsonic` instead of `navidrome`. Existing Navidrome artwork URLs and the legacy health field remain available, and saved artwork selections are normalized automatically.
- **New examples use `SUBSONIC_*` variables.** Existing `NAVIDROME_*` variables still work when your YAML references them. If copying the new examples, update the references and `.env` together.
- **Changed sound defaults:** configs that omit the Jellyfin continuous-library list now include `Music Videos`. Explicit lists are preserved. Set `continuous_sessions.external_music: false` to allow external track changes to start new sound sessions; the default is `true`.
- Music videos may display a different album cover because a matching Jellyfin music track now takes priority. Video artist/title metadata and artist-folder backdrops/logos aren't replaced by that match.
- Music-video cover size inherits `display.album_art.size`; use `display.music_video_album_art.size` for a separate size.
- The combined source guide is now `docs/jellyfin-and-subsonic-notes.md`.

For earlier breaking changes, including the v0.4.2 Library migration and removed v0.3-era settings, see [Upgrading](https://github.com/nothing2obvi/mediawall/blob/v0.5.0/docs/upgrading.md).

### Legacy Navidrome configuration

The following remain supported: `navidrome:`, `playback_source: navidrome`, `navidrome_user`, `navidrome_password`, `path_mappings[].navidrome`, `sounds.navidrome`, `continuous_sessions.navidrome`, and `show_navidrome_username`. New configs should use the equivalent `subsonic` names.

Both forms use the same implementation. If both are supplied, explicit Subsonic values win, including `false`, empty strings, and empty lists; legacy values fill only missing settings. The default server name is `Navidrome` and the default icon is `navidrome`.

### Validation and images

93 automated tests passed, covering artwork matching, legacy settings and precedence, icons, playback states, authentication, and existing artwork behavior. The production build passed. Live Navidrome authentication and Now Playing reads succeeded; there were no active sessions during that check.

Docker images for **linux/amd64** and **linux/arm64**:

- `ghcr.io/nothing2obvi/mediawall:v0.5.0`
- `ghcr.io/nothing2obvi/mediawall:latest`

## 0.4.3 - 2026-10-01

## Fixes

- Fixed Library scanning remaining at 100% after a source request fails. Completed indicators clear automatically, and failed scans no longer leave cache operations blocked.
- The progress indicator switches to the next source before fetching its library list.

## Documentation and examples

- Added a fuller `config.yml.example`, linked from the README and configuration reference, with missing options included at their defaults.
- User examples now use `bob` and `alice`, with distinct source accounts such as `bob-jellyfin` and `alice-navidrome`.
- Clarified that the artist Library migration applies when upgrading from v0.4.1 or earlier to v0.4.2 or later.

## Upgrading

No new runtime configuration breaking changes from v0.4.2. Example environment-variable names have changed for clarity; existing names still work when your own config references them. Keep your existing config and `.env`.

Docker images: `ghcr.io/nothing2obvi/mediawall:v0.4.3` and `ghcr.io/nothing2obvi/mediawall:latest`, for Linux AMD64 and ARM64.

## 0.4.2 - 2026-10-01

- Per-space Anonymous Mode can hide everyone or selected users, with visible-user exceptions, a replacement name, and a replaceable default avatar that updates across displays without a restart.

- Artist artwork now lives in `/library/Artists` with Jellyfin-compatible filenames, live updates, and a browsable Library. Add `./library:/library` to Compose.
- Replace `external_music.artwork.cache_directory` and `cache_ttl_days` with `album_cache_directory` and `album_cache_ttl_days`. Set `library.directory` for artist images. Existing downloads migrate on startup.
- `clear cache` leaves Library images alone. Use `clear library-images` to remove artist images, including manual additions.
- Removed settings now report specific upgrade instructions in the logs.
- Supporting docs have been simplified, with a new External Music Images guide.

## 0.4.1 - 2026-09-30

- Match the Pixelfin-style image editor layout while retaining MediaWall artwork destinations and source colors; add provider/type filters, 30-result pages, supported language filtering, cross-page enlarged previews, and consistent Add/Replace upload actions.

No new configuration breaking changes from v0.4.0.

## 0.4.0 - 2026-09-30

MediaWall v0.4.0 adds external music playback, source-aware artwork editing, and Jellyfin Live TV support. This release includes configuration changes that require attention before upgrading.

## New features since v0.3.1

- **External music through Multi-Scrobbler:** Spotify and other live `playing_now` sources can appear alongside Jellyfin and Navidrome, with separate tokens per MediaWall user. Spotify is tested; the other documented live sources are expected to work. History-only sources do not create live sessions.
- **Artist artwork from multiple sources:** combine Jellyfin/local artist images with Fanart.tv, TheAudioDB, MusicBrainz, and Cover Art Archive lookups. Includes artist aliases, album-artist matching, provider preference, cached images, custom Spotify avatars, and source/provider/download logs.
- **Artwork editor on the display and remote:** Jellyfin-like logo/backdrop search, uploads, ordering, replacement and deletion, colored source buttons, enlarged previews, Left/Right navigation, Enter selection, and Backspace deletion of existing backdrops. Editing pauses MediaWall's presentation, not media playback. Local mutations are restricted to artwork files.
- **Jellyfin Live TV and radio:** centered channel images, configurable size (713px default), ambient effects, independent channel/Live TV text controls, and a fixed 15-second grace period during channel switches.
- **Playback reliability:** external tracks replace older tracks immediately with a handoff grace period. Jellyfin sessions looping over the same 2–5 seconds are treated as stalled after the existing paused-session timeout and do not repeatedly reappear.
- **Per-space scheduled refresh:** optional daily browser refresh, with a default schedule of 06:00 in the display browser's timezone when enabled.
- **More external service logos:** Chromecast, JRiver, Kodi, Mopidy, MPD, Musikcube, Plex, Sonos, Subsonic-compatible services, VLC, Yamaha MusicCast, and Yandex Music use their supplied logos when the incoming service identity matches.
- **Artwork cache controls and reorganized docs:** confirmed CLI cache clearing, display feedback, and a Documentation tree with practical one-user/multiple-user external-music setup.

## Breaking changes and upgrade steps

1. **Replace `playback_source: both` with `playback_source: All`.** The accepted values are now `jellyfin`, `navidrome`, `external-music`, and `All` (case-sensitive). The default is `All`. A specific selector watches only that playback source; use `All` if a space should also display external music. `external_music.enabled: true` is still required for external ingestion.
2. **Remove `playback_user`.** Define users under the top-level `users:` section, then set each space's `users: [bob]` or `users: [All]`. Configurations containing the removed setting fail with a migration message.
3. **Review local artwork mount permissions.** The optional Compose music mount now uses `:rw` to support image editing. Existing read-only mounts remain read-only until you change them; keep them that way if you do not want local artwork writes. MediaWall's editor does not modify audio/video files.
4. **Review changed defaults.** Album artwork defaults to 300px. Live channel image size defaults to 713px. Explicit configured sizes are preserved.
5. **Update documentation bookmarks.** Setup/reference pages now live under `docs/`; Multi-Scrobbler setup is part of External Music, and Live TV details are in Jellyfin and Navidrome Notes.

Existing `.env`, passwords, server URLs, Immich Kiosk URLs, and persistent data should be preserved. Do not replace your configuration wholesale with the example file. The main image editor has no Cancel/undo action: edits save immediately.

## Docker images

`ghcr.io/nothing2obvi/mediawall:v0.4.0` and `ghcr.io/nothing2obvi/mediawall:latest` target **linux/amd64** and **linux/arm64**.

After updating your configuration, pull the image and recreate your container:

```sh
docker compose pull
docker compose up -d
```

For Compose installations using a local `build:` instead of `image:`, rebuild with `docker compose up -d --build`.

## Validation

Production TypeScript/Vite build and 61 automated tests passed. An isolated server test confirmed that stalled Jellyfin sessions disappear and return when playback resumes. No production media was modified during these tests.

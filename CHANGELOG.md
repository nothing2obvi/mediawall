# Changelog

## Unreleased

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
2. **Remove `playback_user`.** Define users under the top-level `users:` section, then set each space's `users: [primary]` or `users: [All]`. Configurations containing the removed setting fail with a migration message.
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

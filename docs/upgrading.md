## Upgrading

### Upgrading from v0.4.3 to v0.5.0

Existing Navidrome configs still work. New examples use `subsonic` keys and `SUBSONIC_*` environment variables. Keep your current variable names if your YAML still references them; don't replace your config wholesale.

All old Navidrome keys remain supported, including credentials, path mappings, sounds, continuous sessions, username display, and `playback_source: navidrome`. Explicit Subsonic settings take priority when both forms are supplied. See [legacy configuration](jellyfin-and-subsonic-notes.md#existing-navidrome-configs).

Custom API clients should accept `source: subsonic`. Old Navidrome artwork URLs and the `navidromeConfigured` health field still work. Saved artwork selections are updated automatically.

The default Jellyfin continuous-library list now includes `Music Videos` as well as `Music`; explicitly configured lists stay unchanged. External music's existing continuous sound behavior is now configurable through `now_playing.sounds.continuous_sessions.external_music` (default `true`).

Music-video album covers now prefer matching tracks in Jellyfin music libraries before existing artwork lookups. Their size still follows `display.album_art.size` unless you set `display.music_video_album_art.size`. Local artwork uploads use Jellyfin-compatible names; existing artwork isn't renamed.

The combined source guide moved to [Jellyfin and Subsonic Notes](jellyfin-and-subsonic-notes.md).

### MediaWall Library images

These changes apply when upgrading from **v0.4.1 or earlier to v0.4.2 or later**. The artist Library was introduced in v0.4.2.

Add `./library:/library` as a writable Compose mount. Replace `external_music.artwork.cache_directory` with `album_cache_directory`, keeping its old path, and rename `cache_ttl_days` to `album_cache_ttl_days`. Use `library.directory` (default `/library`) for artist images. Old names now stop startup with instructions in the log.

Existing artist downloads are copied into named Library folders on startup. Backdrops keep their order, and originals stay in the old location as a backup. See [External Music Images](external-music-images.md#upgrading-existing-artwork) before upgrading.

`clear cache` now leaves artist Library images alone. Use `clear library-images` to delete them, including manually added images. Library images don't expire; album covers still use the cache lifetime.

The old top-level `displays` and `grid_cache` sections are rejected instead of silently ignored. Use `spaces` and `library_scan`. Startup logs also identify removed source/user settings and deprecated aliases.

### Upgrading from v0.3.1 or earlier

1. **Replace `playback_source: both` with `playback_source: All`.** The accepted values are now `jellyfin`, `subsonic`, `external-music`, and `All` (case-sensitive). The default is `All`. A specific selector watches only that playback source; use `All` if a space should also display external music. `external_music.enabled: true` is still required for external ingestion.
2. **Remove `playback_user`.** Define users under the top-level `users:` section, then set each space's `users: [bob]` or `users: [All]`. Configurations containing the removed setting fail with a migration message.
3. **Review local artwork mount permissions.** The optional Compose music mount now uses `:rw` to support image editing. Existing read-only mounts remain read-only until you change them; keep them that way if you do not want local artwork writes. MediaWall's editor does not modify audio/video files.
4. **Review changed defaults.** Album artwork defaults to 300px. Live channel image size defaults to 713px. Explicit configured sizes are preserved.
5. **Update documentation bookmarks.** Setup/reference pages now live under `docs/`; Multi-Scrobbler setup is part of External Music, and Live TV details are in Jellyfin and Subsonic Notes.

Existing `.env`, passwords, server URLs, Immich Kiosk URLs, and persistent data should be preserved. Do not replace your configuration wholesale with the example file. The main image editor has no Cancel/undo action: edits save immediately.

See [the changelog](../CHANGELOG.md) for the release features and image tags.

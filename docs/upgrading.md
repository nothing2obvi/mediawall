## Upgrading

### Upgrading from v0.5.2 to v0.5.3

- Session counters now use `now_playing.session_count.mode: small` or `large`; use YAML `false` to hide them. `small` preserves the old counter exactly. The old `enabled`/`font_size` interface is deprecated but still works, with a configuration-load warning. Explicit `mode` wins; legacy font sizes remain respected. No immediate migration is required.
- Custom avatars can now use `users.<user>.custom_avatar` in the flat `app/avatars` directory. `avatars.prefer_custom_avatars` defaults to `false` (Jellyfin first). Source-specific folders are still supported and are not deprecated. Configured canonical references take precedence over legacy custom files.
- The shared reported-pause/stale cleanup default is now 5 seconds, formerly 15. Explicit `session_cleanup.paused_after_seconds` values remain unchanged; set `15` to retain the former default. This affects sources reporting pause/stale state, including native Jellyfin/Subsonic. ListenBrainz does not carry Spotify pause/stop state, so external expiry remains unchanged.
- First-play events are scoped per space and rearm after the configured continuous-session inactivity. Repeated updates and track changes within the same continuous session remain quiet.


### Upgrading from v0.5.1 to v0.5.2

Use `now_playing.sounds.sources.jellyfin`, `.subsonic`, and `.external_music` for source sound switches. All default to `true`. Existing flat switches (including `navidrome`) remain accepted; explicit `sources` values win. External music can now be muted separately. Continuous-session inactivity still uses `sounds.session_start.retrigger_after_inactive_seconds`, with a configurable default of 30 seconds.

Music-video titles now show `[MV]` by default. Set `display.music_video_indicator.enabled: false` in a space to hide it, or customize `display.music_video_indicator.text`.

### Upgrading from v0.5.0 to v0.5.1

- **Changed artwork defaults:** Subsonic now tries fetched art after Jellyfin/local when order is omitted. Use `[jellyfin, local]` to retain its former default. External music defaults to the same three-source order; explicit legacy `preference: local` or `preference: fetched` preserves the previous grouped lookup, and explicit `order` wins.
- **Music-video artwork:** missing art can now be filled from MediaWall’s providers. Set `jellyfin.music_videos.artwork.order: [jellyfin]` to keep Jellyfin-only artwork. No local-files source is supported. Providers use your MediaWall `image_providers` settings, not Jellyfin’s private credentials. Without reliable album metadata or a release ID, no album is guessed.

Optional per-space `jellyfin.included_jellyfin_users` and `jellyfin.excluded_jellyfin_users` now filter actual Jellyfin usernames before presentation. Empty or omitted lists leave existing behavior unchanged; exclusions win. No configuration paths were removed, and legacy Navidrome aliases still work. See [Jellyfin user filters](configuration-reference.md#space-jellyfin-user-filters).

A literal top-level user named `All` now participates in a space's `users: [All]` selection alongside named users. Previously it was skipped when other mappings existed. If that mapping has `jellyfin_user: All`, other Jellyfin users can now appear; specific mappings still win and sessions aren't duplicated. Use an explicit space user list if you don't want the catch-all.

Mapped Jellyfin avatars now take priority over custom source avatars for Jellyfin, Subsonic, and external playback. Custom Spotify avatars remain supported, and Subsonic custom avatars can go in `app/avatars/subsonic/<mediawall-user>.ext`. Anonymous Mode overrides both. Existing optional display-name filenames remain a fallback for older custom avatars.

The household example and `.env.example` now use Bob, Alice, and Jacob. Keep your existing environment variables and personal config; only change references if you're adopting the new example.

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

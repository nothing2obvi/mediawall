## Upgrading to v0.4.0

1. **Replace `playback_source: both` with `playback_source: All`.** The accepted values are now `jellyfin`, `navidrome`, `external-music`, and `All` (case-sensitive). The default is `All`. A specific selector watches only that playback source; use `All` if a space should also display external music. `external_music.enabled: true` is still required for external ingestion.
2. **Remove `playback_user`.** Define users under the top-level `users:` section, then set each space's `users: [primary]` or `users: [All]`. Configurations containing the removed setting fail with a migration message.
3. **Review local artwork mount permissions.** The optional Compose music mount now uses `:rw` to support image editing. Existing read-only mounts remain read-only until you change them; keep them that way if you do not want local artwork writes. MediaWall's editor does not modify audio/video files.
4. **Review changed defaults.** Album artwork defaults to 300px. Live channel image size defaults to 713px. Explicit configured sizes are preserved.
5. **Update documentation bookmarks.** Setup/reference pages now live under `docs/`; Multi-Scrobbler setup is part of External Music, and Live TV details are in Jellyfin and Navidrome Notes.

Existing `.env`, passwords, server URLs, Immich Kiosk URLs, and persistent data should be preserved. Do not replace your configuration wholesale with the example file. The main image editor has no Cancel/undo action: edits save immediately.


See [the changelog](../CHANGELOG.md) for the release features and image tags.

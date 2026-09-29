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

Then add at least one `path_mappings` mapping whose `mediawall` value points to the local root containing artist folders:

```yaml
navidrome:
  artwork:
    path_mappings:
      - navidrome: "/music"
        mediawall: "/navidrome_music"
```

The optional music mount in the Compose example uses `:rw` so the image editor can save artwork. Enable that mount only when using local files, and ensure the container can write the mapped artist directory. Local mutations require a supported image extension and image signature, stay inside the configured root, and reject symlinks. Audio and video files are never rewritten, renamed, or deleted by artwork editing.

Older configs using `jellyfin` in a path mapping are still accepted for compatibility, but new configs should use `mediawall`.


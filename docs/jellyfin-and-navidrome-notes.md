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

### Live TV and radio channels

Active Jellyfin TV/radio channels appear as Now Playing sessions. MediaWall centers the channel image on the display and uses the channel name as text with “Live TV” beneath it, without a separate title logo. Missing channel images leave the text visible. Set the image bounding-box size per space (pixels; default 713):

```yaml
spaces:
  living_room:
    display:
      live_tv:
        channel_image_size: 713
```

The image retains its aspect ratio, fits smaller screens, and follows the configured backdrop effects (breathing, Ken Burns, pan, drift, focus, and zoom). In Media Info, the Live TV section independently controls Channel and Live TV text; the `i` shortcut cycles channel only, Live TV only, both, and neither. The Live TV label uses the episode-code styling. Live channel sessions use Jellyfin's channel image, including live programs that reference a channel. Recorded movies/episodes keep their normal presentation.

When an active channel disappears from Jellyfin's sessions, MediaWall keeps it visible for up to 15 seconds from the first missing poll. This bridges the gap while changing channels instead of immediately showing the fallback. Fresh active playback takes over immediately. If nothing returns, the configured fallback appears after the grace period. This Live TV grace period is fixed and cannot be configured; `now_playing.session_cleanup.missing_after_seconds` continues to apply to other session types.


### Stopped sessions reported as playing

Some Jellyfin clients keep reporting a playhead cycling through the same 2–5 seconds after playback stops or pauses. MediaWall treats this as stalled rather than active playback. It uses the existing `now_playing.session_cleanup.paused_after_seconds` timeout (15 seconds by default), retains the stalled state across polls, and restores the session when the playhead makes real forward progress. A larger backward seek resets the progress baseline so rewinding normally can continue.

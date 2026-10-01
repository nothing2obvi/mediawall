## Jellyfin And Navidrome Notes

Jellyfin gives the best experience because MediaWall can access:

- Now Playing sessions
- user avatars
- movie, series, episode, and music metadata
- backdrops
- logos
- automatic updates when artwork changes

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

The optional music mount uses `:rw` so the image editor can save artwork. Only enable it if you use local images, and make sure the artist folder is writable. Symbolic links aren’t supported. Editing never changes music or video files.

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

The image fits the screen without stretching and uses your backdrop effects. In Media Info, choose the channel name, the Live TV label, both, or neither. The `i` key cycles these choices. Recorded movies and episodes keep their usual layout.

Changing channels doesn’t immediately send the display to fallback. MediaWall keeps the current channel visible briefly until the next one starts.

### Stopped sessions reported as playing

Some Jellyfin clients keep reporting the same few seconds as playing after you stop or pause. MediaWall treats these sessions as inactive after `now_playing.session_cleanup.paused_after_seconds` (15 seconds by default). They reappear when playback actually continues. Rewinding normally still works.

## Jellyfin Live Channels

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


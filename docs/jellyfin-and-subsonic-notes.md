## Jellyfin And Subsonic Notes

Jellyfin gives the best experience because MediaWall can access:

- Now Playing sessions
- user avatars
- movie, series, episode, and music metadata
- backdrops
- logos
- automatic updates when artwork changes

MediaWall supports Subsonic-compatible music servers and is primarily developed and tested with Navidrome. Other implementations may vary, particularly in how clients report Now Playing. Packaged icons don't imply verified server compatibility. For artwork, MediaWall can use matching Jellyfin artist data when both services are configured, or local artist backdrop files when running Subsonic-only.

For Subsonic-only installations, enable:

```yaml
subsonic:
  artwork:
    local_files: true
```

Then add at least one `path_mappings` mapping whose `mediawall` value points to the local root containing artist folders:

```yaml
subsonic:
  artwork:
    path_mappings:
      - subsonic: "/music"
        mediawall: "/navidrome_music"
```

The optional music mount uses `:rw` so the image editor can save artwork. Only enable it if you use local images, and make sure the artist folder is writable. Symbolic links aren’t supported. Editing never changes music or video files.

Older configs using `jellyfin` in a path mapping are still accepted for compatibility, but new configs should use `mediawall`.

### Server name and icon

Set the server name and icon under `subsonic`. Both default to Navidrome, so existing setups keep their usual appearance:

```yaml
subsonic:
  enabled: true
  url: "${SUBSONIC_URL}"
  name: "Navidrome"
  icon: "navidrome"
users:
  bob:
    subsonic_user: "${SUBSONIC_BOB_USER}"
    subsonic_password: "${SUBSONIC_BOB_PASSWORD}"
```

For Gonic, use `name: "Gonic"` and `icon: "gonic"`. Packaged icon keys are `navidrome`, `gonic`, `subsonic`, `airsonic-advanced`, `ampache`, `nextcloud`, `funkwhale`, and `lms` (use `name: "LMS"`). Keys aren't case-sensitive and don't include an extension.

For custom icons, place `myserver.png` in `./app/server-icons`, set `icon: "myserver"`, and add this Docker volume:

```yaml
volumes:
  - ./app/server-icons:/app/server-icons:ro
```

Custom icons take priority over packaged ones. Supported extensions, in priority order, are `.webp`, `.png`, `.jpg`, `.jpeg`, `.svg`, and `.gif`. A missing icon falls back to Navidrome. Mount only this directory, not the application source directory.

### Existing Navidrome configs

Existing `navidrome` configuration still works without changes. New configs should use `subsonic`. This includes the top-level server section, `playback_source`, user credentials, artwork path mappings, sound and continuous-session switches, and `show_navidrome_username` (now `show_subsonic_username`).

When both forms are supplied, the new setting wins. Legacy settings only fill in missing values. Existing environment-variable names still work when your YAML references them; you don't need to rename your secrets.

Subsonic connections use username/password authentication. Now Playing depends on what your server and playback client report. MediaWall hasn't verified every Subsonic implementation.

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

### Music videos

Jellyfin music videos use the backdrops and logo on their artist folder inside the Music Videos library, including multiple backdrops with the usual cycling settings. Artist artwork from a separate Music library or external providers doesn’t replace this folder artwork. MediaWall reads artist and album details from Jellyfin's metadata, including NFO information imported by Jellyfin. For album covers, MediaWall first searches Jellyfin libraries identified as music libraries for the same artist and song. Exact titles win across all libraries. If there's no exact match, it removes trailing parenthetical groups one at a time, so `Song (Remix) (Video)` prefers `Song (Remix)` before `Song`. Matching ignores casing and extra whitespace and uses configured artist aliases, without fuzzy matching. The video's displayed metadata stays unchanged. If no matching artwork is found, MediaWall uses its existing album lookup and configured image providers. The video's poster isn't treated as an album cover. If no cover is found, playback and artist backdrops still work.

Album and track text use the same styling, font-size settings, and Music info controls as music tracks.

Album covers use the same show/hide button and `a` shortcut as music tracks. Their size follows `display.album_art.size`; set `display.music_video_album_art.size` to override it for music videos.

Session sounds treat the `Music` and `Music Videos` Jellyfin libraries as continuous by default. Adjust `now_playing.sounds.continuous_sessions.jellyfin_libraries` to match your library names. Subsonic and external music each have a separate `continuous_sessions` switch, both enabled by default.

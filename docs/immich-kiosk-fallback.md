## Immich Kiosk Fallback

MediaWall v0.3 adds [Immich Kiosk](https://github.com/damongolding/immich-kiosk) as an optional Now Playing fallback. It isn't the default and is configured independently for each space. When a configured space has no active sessions, MediaWall embeds the existing Immich Kiosk application across the full display and hides its own on-screen controls. Immich Kiosk keeps its own slideshow, menus, touch handling, and other interactions; MediaWall doesn't recreate them.

```yaml
spaces:
  homelab:
    now_playing:
      fallback: immich_kiosk
      immich_kiosk:
        url: "${HOMELAB_IMMICH_KIOSK_URL}"
```

Put the actual URL in `.env`, especially when it contains an Immich Kiosk password:

```env
HOMELAB_IMMICH_KIOSK_URL=https://immich-kiosk.example.com/?password=replace-me
```

MediaWall keeps checking Jellyfin and Navidrome while Kiosk is visible. Playback automatically brings Now Playing back; when playback ends, Kiosk returns. A configured Kiosk also becomes a third display mode alongside Now Playing and Wallpaper/Screensaver.

The URL must be reachable from both the MediaWall container and display browser. MediaWall's controls are hidden during the handoff. Playback restores normal Now Playing; after the final session and missing-session grace period, the handoff returns. An album or link chosen inside Kiosk remains selected across temporary handoffs, but not across a browser/PWA refresh; a container restart loses it only if the display reloads. Put the desired album in this URL to make it persistent. The target and any reverse proxy must permit iframe embedding. Missing, invalid, unreachable, timed-out, or frame-blocked URLs use the ordinary MediaWall idle screen.

Use the matching MediaWall remote when you need controls while Kiosk is on screen.

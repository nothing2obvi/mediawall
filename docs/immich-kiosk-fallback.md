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

If you choose a different album from Immich Kiosk's links, that choice survives temporary MediaWall handoffs but not a browser or PWA refresh. A container restart only loses it when the display page reloads. To make an album permanent, use that album as the main `immich_kiosk.url`.

The Kiosk URL must be reachable from both the MediaWall container and the display browser, and it must allow iframe embedding. If it can't be loaded, MediaWall uses its normal idle screen. Use the matching MediaWall remote when you need controls while Kiosk is on screen.


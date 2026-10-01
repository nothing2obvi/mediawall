## Immich Kiosk Fallback

MediaWall supports [Immich Kiosk](https://github.com/damongolding/immich-kiosk) as an optional Now Playing fallback. It isn't the default and is configured independently for each space. When a configured space has no active sessions, MediaWall embeds the existing Immich Kiosk application across the full display and hides its own on-screen controls. Immich Kiosk keeps its own slideshow, menus, touch handling, and other interactions; MediaWall doesn't recreate them.

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

Playback automatically brings Now Playing back; when playback ends, Kiosk returns. You can also switch to Kiosk as its own mode alongside Now Playing and Wallpaper/Screensaver.

The URL must work from both the MediaWall container and the display's browser. Kiosk and any reverse proxy must allow iframe embedding. If Kiosk can’t load, MediaWall shows its normal idle screen.

An album you choose in Kiosk stays selected when playback temporarily takes over, but a page refresh resets it. Put the album in the Kiosk URL if you want it to stay selected after a refresh.

Use the matching MediaWall remote when you need controls while Kiosk is on screen.

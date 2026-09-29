## External Music

**Spotify**, Plex, Subsonic-compatible servers, Chromecast, Sonos, Kodi, JRiver, Mopidy, MPD, Musikcube, VLC, Yamaha MusicCast, and Yandex Music are expected to work through Multi-Scrobbler. **Only Spotify has been tested with MediaWall so far.**

MediaWall accepts Spotify and other external `playing_now` events through its ListenBrainz-compatible receiver. External sessions map to existing MediaWall users by token, so a separate Spotify user definition is not required.

History-only submissions do not create Now Playing sessions. Apple Music playback history therefore does not provide live playback for this feature.

A new track replaces the previous track immediately for the same user and service, avoiding rotation between the finished and current track. `external_music.track_transition_grace_seconds` defaults to `10` and bridges brief gaps before the next update; stopping playback can delay fallback by this grace period plus normal session cleanup. MediaWall still depends on the bridge delivering a live update.

For setup, see [Multi-Scrobbler Setup](multi-scrobbler-setup.md).

### Artwork And Avatars

`external_music.artwork.preference` may be `local` (the default) or `fetched`. Local preference uses matching Jellyfin/Navidrome artist art first; fetched preference uses MediaWall's provider cache first. Album artist is preferred for artist-level artwork. Cache files live under `/app/data/external-artwork`.

For a custom Spotify avatar, place `app/avatars/spotify/<mediawall-user>.png` (or JPG/JPEG/WebP) in the mounted avatars directory. MediaWall falls back to a same-user Jellyfin avatar when no source file exists.

Artist artwork aliases belong under `aliases.artists`. Each relationship works in both directions for Jellyfin, Navidrome/local, and fetched artwork lookup without changing the artist name shown by MediaWall.

### Image Provider API Keys

To fetch artist logos, backdrops, and album covers, add your Fanart.tv and TheAudioDB API keys to MediaWall's `.env`:

```env
FANART_API_KEY=your-fanart-api-key
THEAUDIODB_API_KEY=your-theaudiodb-api-key
```

Reference them under the top-level `image_providers` section in `config.yml` (already included in the example configuration):

```yaml
image_providers:
  fanart:
    enabled: true
    api_key: "${FANART_API_KEY}"
  theaudiodb:
    enabled: true
    api_key: "${THEAUDIODB_API_KEY}"
```

Merge these settings into your existing configuration, then recreate the container with `docker compose up -d --force-recreate` to load the environment changes. Both providers are optional; MediaWall does not automatically use Jellyfin's provider keys. MusicBrainz and Cover Art Archive require no API keys. Set `external_music.artwork.preference: fetched` to prefer provider artwork, or leave it as `local` to prefer existing library artwork.


### Artwork Logs

Artwork logs identify whether images come from Jellyfin, local files, or the provider cache, and name providers such as Fanart.tv, TheAudioDB, or Cover Art Archive when known. Download summaries include saved image counts, candidate counts, and why fetching stopped, such as reaching the configured backdrop limit or exhausting usable candidates. Rejection messages explain skipped downloads; cache reuse reports no new downloads. Existing Jellyfin images are attributed to Jellyfin when their original provider is unknown.

Use `LOG_LEVEL=debug` for additional playback and artwork troubleshooting. Repeated unchanged selections avoid repeating the same information-level log message.

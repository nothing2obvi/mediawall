## External Music

Connect [Multi-Scrobbler](https://github.com/FoxxMD/multi-scrobbler) to MediaWall using a ListenBrainz client. Multi-Scrobbler watches your music service and sends live playback to MediaWall.

MediaWall needs meaningful live `playing_now` updates with an artist and track title. Completed listening history alone can't drive its live display. Only Spotify has been tested with MediaWall so far; the other entries below describe expected compatibility, not test results.

### Source compatibility

| Multi-Scrobbler source | MediaWall Now Playing | Why |
| --- | --- | --- |
| Spotify | Yes, tested | Live playback/player activity. |
| Subsonic-compatible APIs | Expected | Live Now Playing activity. Prefer MediaWall's native integration. |
| Jellyfin | Expected | Live session activity. Prefer MediaWall's native integration. |
| Plex | Expected | Live player/session activity. |
| Google Cast / Chromecast | Expected | Live Cast player activity. |
| Sonos | Expected | Live player activity. |
| Mopidy | Expected | Live player state. |
| MPD | Expected | Live player state. |
| VLC | Expected | Live playback state. |
| Kodi | Expected | Live player state. |
| JRiver | Expected | Live playback activity. |
| Musikcube | Expected | Live playback activity. |
| Yamaha MusicCast | Expected | Live player activity. |
| Yandex Music | Expected | Activity/player source. |
| MPRIS | Expected, conditional | A Linux player must expose usable live state over MPRIS. |
| AzuraCast | Conditional | Station monitoring must be enabled, with usable artist and track metadata. |
| Icecast | Conditional | Station monitoring must be enabled, with usable artist and track metadata. |
| Last.fm | Conditional | Reads the current `nowplaying` entry when upstream supplies one. |
| Libre.fm | Likely, conditional | Uses the Last.fm-style implementation; needs compatible Now Playing data. |
| ListenBrainz | Conditional | Reads Playing Now data and feeds it into player state. |
| Last.fm Endpoint | Expected, conditional | The sender must supply `track.updateNowPlaying` events. |
| ListenBrainz Endpoint | Expected, conditional | The sender must supply `listen_type: playing_now`. |
| WebScrobbler | Expected, conditional | Needs its `nowplaying` events, not just completed scrobbles. |
| Apple Music | Not properly | Recently played history isn't reliable live Now Playing. |
| Deezer | No via its history source | Polls listening history, not the current player. |
| Koito | No | History-based source without current player state. |
| Maloja | No | History-based source. |
| Rocksky | No | History-based source without live Now Playing. |
| teal.fm | No | History-based source. |
| YouTube Music | No via its history source | Watches history rather than live playback. |

These refer to Multi-Scrobbler's named integrations. A different bridge that sends live playback can behave differently. Jellyfin and Subsonic work best through MediaWall's native connections, which provide richer artwork and playback integration. Conditional sources depend on the upstream service or sender providing current data. The station sources describe what's on air, not proof that a particular person is listening.

See Multi-Scrobbler's [source overview](https://foxxmd.github.io/multi-scrobbler/configuration/sources/) and its [Last.fm](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/sources/LastfmSource.ts) and [ListenBrainz](https://github.com/FoxxMD/multi-scrobbler/blob/master/src/backend/sources/ListenbrainzSource.ts) implementations: some sources labeled history-based also have a separate Now Playing path.

### One user

1. Generate a long random secret, for example with `openssl rand -hex 32`. This is a shared secret you create, not a Spotify API key or a token from the public ListenBrainz website.
2. Put it in MediaWall's `.env` beside your Compose file:

   ```env
   EXTERNAL_MUSIC_BOB_TOKEN=paste-your-random-secret-here
   ```

3. In MediaWall's `config.yml`, enable external music, reference that environment variable under the user, and include that user in the display space:

   ```yaml
   external_music:
     enabled: true

   users:
     bob:
       external_music_token: "${EXTERNAL_MUSIC_BOB_TOKEN}"

   spaces:
     livingroom:
       playback_source: external-music
       users: [bob]
   ```

   Merge these settings into your existing configuration. Use `playback_source: All` if the space should also watch Jellyfin and Subsonic. The environment-variable name is your choice: `MEDIAWALL_LISTENBRAINZ_TOKEN` also works if the YAML references `${MEDIAWALL_LISTENBRAINZ_TOKEN}`. Setting an environment variable alone doesn’t connect it to a user.

4. In Multi-Scrobbler, add a **ListenBrainz client**. Give it a unique ID such as `mediawall-bob`. Set its URL to `http://mediawall-host:1221/apis/listenbrainz` and its token to the same actual secret from `.env`. Replace the hostname and port with values reachable from Multi-Scrobbler. Don’t use `localhost` when that would point to Multi-Scrobbler's own container. Multi-Scrobbler appends `/1/submit-listens` itself.
5. Configure your Spotify account (for example, `spotify-bob`) or other supported source to send to this client ID using its `clients` list, and leave Now Playing enabled. See Multi-Scrobbler's [ListenBrainz client configuration](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/listenbrainz.json.example) for its configuration format. MediaWall's `.env` isn’t automatically available to Multi-Scrobbler; enter the same secret there separately or use Multi-Scrobbler's own environment-variable setup.
6. Apply the Multi-Scrobbler configuration and recreate MediaWall with `docker compose up -d --force-recreate` to load the new environment. Play music and open your MediaWall space.

### Multiple users

Give each MediaWall user a separate secret. This is how MediaWall knows which person an incoming update belongs to.

1. Generate one secret per user and put them in MediaWall's `.env`:

   ```env
   EXTERNAL_MUSIC_BOB_TOKEN=first-users-random-secret
   EXTERNAL_MUSIC_ALICE_TOKEN=alices-different-random-secret
   EXTERNAL_MUSIC_JACOB_TOKEN=jacobs-different-random-secret
   ```

2. Reference each variable under the matching user and choose who appears in the space:

   ```yaml
   external_music:
     enabled: true

   users:
     bob:
       external_music_token: "${EXTERNAL_MUSIC_BOB_TOKEN}"
     alice:
       external_music_token: "${EXTERNAL_MUSIC_ALICE_TOKEN}"
     jacob:
       external_music_token: "${EXTERNAL_MUSIC_JACOB_TOKEN}"

   spaces:
     livingroom:
       playback_source: All
       users: [bob, alice, jacob]
       now_playing:
         cycle_users: true
   ```

   Use `users: [All]` to include every configured MediaWall user, or put each user in a separate space.

3. Create three ListenBrainz clients in Multi-Scrobbler: `mediawall-bob`, `mediawall-alice`, and `mediawall-jacob`. All use the same MediaWall base URL, but each gets that person's secret.
4. Set each Spotify source's `clients` list to only its matching client:

   | Spotify source ID | Client ID | Token from MediaWall's `.env` |
   | --- | --- | --- |
   | `spotify-bob` | `mediawall-bob` | `EXTERNAL_MUSIC_BOB_TOKEN` |
   | `spotify-alice` | `mediawall-alice` | `EXTERNAL_MUSIC_ALICE_TOKEN` |
   | `spotify-jacob` | `mediawall-jacob` | `EXTERNAL_MUSIC_JACOB_TOKEN` |

   For example, the `spotify-bob` source uses `"clients": ["mediawall-bob"]`. Don't route one person's source to all three clients unless you want three identities for the same playback. Source IDs are labels; Spotify's service metadata identifies its logo.

5. Apply both applications' configuration and recreate MediaWall as in the one-user example.

The `external_music_token` field is the recommended setup. The top-level `external_music.tokens` mapping is an alternative for advanced setups, including a fixed source label; you don’t need both methods for the same token. Keep actual secrets in `.env` and out of shared configuration and Git.

### Image provider API keys

MediaWall can use existing Jellyfin or local artist artwork. To also fetch artist logos, backdrops, and album covers, put your provider keys in MediaWall's `.env`:

```env
FANART_API_KEY=your-fanart-api-key
THEAUDIODB_API_KEY=your-theaudiodb-api-key
```

Reference them in `config.yml` (these entries are already in the example configuration):

```yaml
image_providers:
  fanart:
    enabled: true
    api_key: "${FANART_API_KEY}"
  theaudiodb:
    enabled: true
    api_key: "${THEAUDIODB_API_KEY}"
```

Both providers are optional. MediaWall doesn’t automatically use Jellyfin's provider keys. MusicBrainz and Cover Art Archive require no API keys. Recreate MediaWall after changing `.env`.

`external_music.artwork.order` defaults to `[jellyfin, local, fetched]`. Reorder these to change priority; unavailable or disabled sources are skipped and lower sources fill missing artwork. Jellyfin is optional. `preference: local` and `preference: fetched` still preserve their previous behavior, but an explicit `order` wins. Use [Edit images](image-editor.md) to search, upload, or change artwork. Logs show its source and download details.

See [External Music Images](external-music-images.md) for the `./library` mount, artist folders, image names, and clearing commands.

### Source icons and avatars

MediaWall includes icons for Spotify, Apple Music, Jellyfin, Google Cast/Chromecast, JRiver, Kodi, Mopidy, MPD, Musikcube, Plex, Sonos, VLC, Yamaha MusicCast, Yandex Music, WebScrobbler, Libre.fm, Last.fm, Icecast, AzuraCast, and the packaged Subsonic servers including LMS. Matching uses known service names and aliases, not arbitrary partial matches. An icon doesn't imply that the source supplies live playback; Apple Music's icon, for example, doesn't change its history limitation.

To override an icon, put its key and extension, such as `lastfm.png`, in `./app/server-icons` and mount `./app/server-icons:/app/server-icons:ro`. Unknown service `My Server` uses `my-server.png`. Formats are WebP, PNG, JPG, JPEG, SVG, and GIF, in that priority order. See the [icon reference](configuration-reference.md#built-in-and-custom-icons) for every key and fallback.

User avatars are separate from service logos. MediaWall uses the mapped Jellyfin avatar first, then a custom source avatar such as `./app/avatars/spotify/bob.png`, then no avatar. Anonymous Mode overrides both. See [user avatars](configuration-reference.md#user-avatars).

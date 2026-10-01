## External Music

Connect [Multi-Scrobbler](https://github.com/FoxxMD/multi-scrobbler) to MediaWall using a ListenBrainz client. Multi-Scrobbler watches your music service and sends live playback to MediaWall.

**Spotify**, Plex, Subsonic-compatible servers, Chromecast, Sonos, Kodi, JRiver, Mopidy, MPD, Musikcube, VLC, Yamaha MusicCast, and Yandex Music are expected to work. **Only Spotify has been tested with MediaWall so far.** Playback-history-only sources, including Apple Music history, don’t provide the live `playing_now` updates MediaWall needs.

### One user

1. Generate a long random secret, for example with `openssl rand -hex 32`. This is a shared secret you create, not a Spotify API key or a token from the public ListenBrainz website.
2. Put it in MediaWall's `.env` beside your Compose file:

   ```env
   EXTERNAL_MUSIC_PRIMARY_TOKEN=paste-your-random-secret-here
   ```

3. In MediaWall's `config.yml`, enable external music, reference that environment variable under the user, and include that user in the display space:

   ```yaml
   external_music:
     enabled: true

   users:
     primary:
       external_music_token: "${EXTERNAL_MUSIC_PRIMARY_TOKEN}"

   spaces:
     livingroom:
       playback_source: external-music
       users: [primary]
   ```

   Merge these settings into your existing configuration. Use `playback_source: All` if the space should also watch Jellyfin and Navidrome. The environment-variable name is your choice: `MEDIAWALL_LISTENBRAINZ_TOKEN` also works if the YAML references `${MEDIAWALL_LISTENBRAINZ_TOKEN}`. Setting an environment variable alone doesn’t connect it to a user.

4. In Multi-Scrobbler, add a **ListenBrainz client**. Give it a unique ID such as `mediawall-primary`. Set its URL to `http://mediawall-host:1221/apis/listenbrainz` and its token to the same actual secret from `.env`. Replace the hostname and port with values reachable from Multi-Scrobbler. Don’t use `localhost` when that would point to Multi-Scrobbler's own container. Multi-Scrobbler appends `/1/submit-listens` itself.
5. Configure your Spotify or other supported source to send to this client ID using its `clients` list, and leave Now Playing enabled. See Multi-Scrobbler's [ListenBrainz client configuration](https://github.com/FoxxMD/multi-scrobbler/blob/master/config/listenbrainz.json.example) for its configuration format. MediaWall's `.env` isn’t automatically available to Multi-Scrobbler; enter the same secret there separately or use Multi-Scrobbler's own environment-variable setup.
6. Apply the Multi-Scrobbler configuration and recreate MediaWall with `docker compose up -d --force-recreate` to load the new environment. Play music and open your MediaWall space.

### Multiple users

Give each MediaWall user a separate secret. This is how MediaWall knows which person an incoming update belongs to.

1. Generate one secret per user and put them in MediaWall's `.env`:

   ```env
   EXTERNAL_MUSIC_PRIMARY_TOKEN=first-users-random-secret
   EXTERNAL_MUSIC_SECONDARY_TOKEN=second-users-different-random-secret
   ```

2. Reference each variable under the matching user and choose who appears in the space:

   ```yaml
   external_music:
     enabled: true

   users:
     primary:
       external_music_token: "${EXTERNAL_MUSIC_PRIMARY_TOKEN}"
     secondary:
       external_music_token: "${EXTERNAL_MUSIC_SECONDARY_TOKEN}"

   spaces:
     livingroom:
       playback_source: All
       users: [primary, secondary]
       now_playing:
         cycle_users: true
   ```

   Use `users: [All]` to include every configured MediaWall user, or put each user in a separate space.

3. Create a separate ListenBrainz client in Multi-Scrobbler for each user, such as `mediawall-primary` and `mediawall-secondary`. Both use the same MediaWall base URL, but each gets that user's secret.
4. Route each person's music source to the corresponding client ID. Don’t send one person's source to both clients unless you intentionally want it shown for both users.
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

Under `external_music.artwork`, leave `preference: local` to prefer Jellyfin/local artist images, or use `preference: fetched` to prefer Library/provider images. Lower-priority sources fill missing artwork. Use [Edit images](image-editor.md) to search, upload, or change the selected art. MediaWall logs the artwork source, provider when known, download counts, Library image reuse, and reasons downloads are skipped.

See [External Music Images](external-music-images.md) for the `./library` mount, artist folders, image names, and clearing commands.

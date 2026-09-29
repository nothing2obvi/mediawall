## Multi-Scrobbler Setup

Connect [Multi-Scrobbler](https://github.com/FoxxMD/multi-scrobbler) to show live playback from external music sources such as Spotify.

1. In MediaWall's `config.yml`, enable external music and map a token to an existing MediaWall user included in your space:

   ```yaml
   external_music:
     enabled: true
     tokens:
       "${EXTERNAL_MUSIC_TOKEN}":
         user: primary
   ```

   Add `EXTERNAL_MUSIC_TOKEN=your-long-random-token` to MediaWall's `.env`, replace `primary` with your user name, and restart MediaWall. Merge these settings into your existing configuration.

2. In Multi-Scrobbler, create a **ListenBrainz client** with the same token and this base URL, using a host and port reachable from Multi-Scrobbler:

   ```text
   http://mediawall-host:1221/apis/listenbrainz
   ```

   Multi-Scrobbler appends `/1/submit-listens` itself.

3. Configure your Spotify source to send to that client's ID using its `clients` list, and leave **Now Playing** enabled on the client. MediaWall needs live `playing_now` updates; playback-history-only sources won't appear.


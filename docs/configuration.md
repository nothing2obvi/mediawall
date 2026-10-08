## Configuration

Secrets should live in `.env`. Display behavior should live in `config.yml`.

See the [Configuration Reference](configuration-reference.md) for every setting and its default. You can leave out optional settings.

### Environment Variables

```env
JELLYFIN_URL=http://jellyfin.example.local:8096
JELLYFIN_API_KEY=replace-with-a-jellyfin-admin-api-key
JELLYFIN_BOB_USER=bob-jellyfin

SUBSONIC_URL=http://navidrome.example.local:4533
SUBSONIC_BOB_USER=bob-navidrome
SUBSONIC_BOB_PASSWORD=replace-with-a-subsonic-password

LIVINGROOM_PASSWORD=
HOMELAB_PASSWORD=

LOG_LEVEL=info
```

The Jellyfin API key should belong to a Jellyfin admin user. MediaWall uses it to read sessions, users, libraries, and artwork. Choose which Jellyfin users to watch in `config.yml`, or use `All`.

For Subsonic, configure each Subsonic account you want MediaWall to distinguish as its own MediaWall user. For example, you can add `SUBSONIC_BOB_USER`, `SUBSONIC_BOB_PASSWORD`, `SUBSONIC_ALICE_USER`, and `SUBSONIC_ALICE_PASSWORD`, then reference those from separate `users` entries in `config.yml`.

Use a separate password variable for each protected space. In addition to `LIVINGROOM_PASSWORD=` and `HOMELAB_PASSWORD=`, you can create any others you need, such as `OFFICE_PASSWORD=` or `KITCHEN_PASSWORD=`, then reference them from the matching space.

Use `LOG_LEVEL=debug` when troubleshooting playback, session cycling, scans, or artwork behavior. Supported values are `debug`, `info`, `warn`, `error`, and `silent`; the default is `info`.

## Bob, Alice, and Jacob

### General Notes

Bob Jones runs Jellyfin and Navidrome for his wife Alice, their son Jacob, and a few other Jellyfin users. Bob supplies the global Jellyfin admin API key. Nobody's individual Jellyfin password goes into MediaWall; Navidrome credentials belong to each mapped user.

Bob, Alice, and Jacob each have one MediaWall identity across Jellyfin, Navidrome, and Spotify. By default, MediaWall uses the avatar from their mapped Jellyfin account first, then their configured custom avatar. Setting `avatars.prefer_custom_avatars: true` reverses that priority and uses the custom avatar first across all sources.

Their `custom_avatar` entries refer to files such as `app/avatars/bob.png`. See [user avatars](configuration-reference.md#user-avatars) for formats and legacy-supported paths. Service logos are separate; see [icons](configuration-reference.md#built-in-and-custom-icons).

The `All` mapping catches other Jellyfin users; it doesn't add Navidrome or Spotify accounts. Specific family mappings take priority without duplicating sessions. A space's `users: [All]` includes every configured mapping, including the catch-all.

For Spotify, each person has a separate secret. Route `spotify-bob` to `mediawall-bob`, `spotify-alice` to `mediawall-alice`, and `spotify-jacob` to `mediawall-jacob` in Multi-Scrobbler. The [External Music walkthrough](external-music.md#multiple-users) covers the client and token setup.

Per-space Jellyfin filters use actual Jellyfin usernames. A non-empty `included_jellyfin_users` list limits eligibility; `excluded_jellyfin_users` wins if a name appears in both. Matching ignores case and surrounding spaces. Empty or omitted lists add no restriction, and neither filter affects other playback sources.

### Living Room

Bob, Alice, and Jacob appear normally, with avatars when available. Anonymous Mode shows other eligible Jellyfin users as `someone`, using the anonymous avatar instead of their real identity.

The `libraries` list controls Wallpaper/Screensaver browsing, not which active playback sessions can appear.

This screen browses Shows, Anime, Movies, and Music. The separate `now_playing.ignored_libraries: [Fitness]` keeps workouts out of Now Playing, including session counts, transitions, and sounds. When nothing's playing, it opens Immich Kiosk using the private URL in `.env`. The screensaver badge says `Featured on jones-server`.

Bob likes Star Wars, so he supplies `app/sounds/starwars.mp3` and `app/collections/starwars.png`. Matching Jellyfin collections use that sound and transition image. The collection rule's `users: [All]` applies to anyone already eligible for the space; it doesn't add users. The title regex ignores case.

### Homelab

Bob wants his homelab display to show everyone by name, but he excludes Alice's cousin Monica because all she ever watches is **The Great British Bake Off**, and he's tired of seeing it appear on MediaWall. Anonymous Mode would still show her playback as `someone`; `excluded_jellyfin_users` removes her Jellyfin session from the space entirely.

This space doesn't enable Anonymous Mode. It uses MediaWall's DVD fallback and the same Star Wars collection rule. It doesn't inherit the living room's privacy or Fitness filter; each space stands on its own.

The detailed `livingroom` section shows the available settings, mostly at their defaults. `homelab` stays short to show how much you can leave out. Turn off providers you don't use, supply the Star Wars files, and adjust library names and music mounts. Copy [config.yml.example](../config.yml.example) and [.env.example](../.env.example) to get started.

<!-- BEGIN CONFIG EXAMPLE: kept in sync by server/household.test.ts -->
```yaml
# The Jones household: Bob, his wife Alice, and their son Jacob use Jellyfin,
# Navidrome, and Spotify. livingroom keeps guests anonymous; homelab shows identities.
# Copy this file to config.yml and fill in .env.example with your own values.
# livingroom shows the available settings; homelab shows how little you need to write.
# Most livingroom values are defaults. Privacy, identity display, libraries, collections,
# the badge text, and Immich Kiosk are this family's choices.

avatars:
  # false: mapped Jellyfin avatar first, custom avatar as fallback.
  # true: custom first across Jellyfin, Navidrome, Spotify, and other mapped sources.
  prefer_custom_avatars: false
server:
  port: 1221
library:
  directory: /library
library_scan:
  enabled: true
  directory: /app/data/grid-cache
  ttl_days: 30
  scan_on_startup: true
  cron:
    enabled: true
    expression: 0 3 * * *
jellyfin:
  # Bob supplies one admin API key. MediaWall does not need anyone's Jellyfin password.
  url: ${JELLYFIN_URL}
  api_key: ${JELLYFIN_API_KEY}
  # Default music-video artwork order; this block can be omitted.
  music_videos:
    artwork:
      order:
        - jellyfin
        - fetched
subsonic:
  name: Navidrome
  # Packaged icon key. Custom files use ./app/server-icons; no extension here.
  icon: navidrome
  enabled: true
  url: ${SUBSONIC_URL}
  artwork:
    jellyfin_fallback: true
    local_files: true
    # Default order; can be omitted. Unavailable sources are skipped.
    order:
      - jellyfin
      - local
      - fetched
    path_mappings:
      # Optional local art: mount /path/to/music:/navidrome_music:rw for editing.
      - subsonic: /music
        mediawall: /navidrome_music
external_music:
  enabled: true
  session_timeout_seconds: 90
  track_transition_grace_seconds: 10
  artwork:
    # Default order; can be omitted.
    order:
      - jellyfin
      - local
      - fetched
    minimum_backdrop_resolution: 1920x1080
    backdrop_count: 3
    album_cache_directory: /app/data/external-artwork
    album_cache_ttl_days: 30
image_providers:
  musicbrainz:
    enabled: true
    contact: ${MUSICBRAINZ_CONTACT}
  fanart:
    enabled: true
    api_key: ${FANART_API_KEY}
  theaudiodb:
    enabled: true
    api_key: ${THEAUDIODB_API_KEY}
  cover_art_archive:
    enabled: true
aliases:
  artists: {}
users:
  # One identity and resolved avatar per person across sources.
  # Each person has their own Spotify source and token. Route spotify-bob to
  # mediawall-bob, spotify-alice to mediawall-alice, and spotify-jacob to mediawall-jacob.
  bob:
    custom_avatar: bob # ./app/avatars/bob.png (or another supported format)
    jellyfin_user: ${JELLYFIN_BOB_USER}
    subsonic_user: ${SUBSONIC_BOB_USER}
    subsonic_password: ${SUBSONIC_BOB_PASSWORD}
    external_music_token: ${EXTERNAL_MUSIC_BOB_TOKEN}
  alice:
    custom_avatar: alice # ./app/avatars/alice.png (or another supported format)
    jellyfin_user: ${JELLYFIN_ALICE_USER}
    subsonic_user: ${SUBSONIC_ALICE_USER}
    subsonic_password: ${SUBSONIC_ALICE_PASSWORD}
    external_music_token: ${EXTERNAL_MUSIC_ALICE_TOKEN}
  jacob:
    custom_avatar: jacob # ./app/avatars/jacob.png (or another supported format)
    jellyfin_user: ${JELLYFIN_JACOB_USER}
    subsonic_user: ${SUBSONIC_JACOB_USER}
    subsonic_password: ${SUBSONIC_JACOB_PASSWORD}
    external_music_token: ${EXTERNAL_MUSIC_JACOB_TOKEN}
  All:
    # Jellyfin catch-all only. Specific family mappings win; sessions are not duplicated.
    jellyfin_user: All
spaces:
  livingroom:
    # Optional actual Jellyfin username filters; empty lists add no restriction.
    jellyfin:
      included_jellyfin_users: []
      excluded_jellyfin_users: []
    playback_source: All
    theme: All
    users:
      - All
    libraries:
      # Wallpaper/Screensaver and grid libraries, not a Now Playing allowlist.
      - Shows
      - Anime
      - Movies
      - Music
    idle_timeout: 30
    page_refresh:
      enabled: false
      time: 06:00
    now_playing:
      fallback: immich_kiosk
      immich_kiosk:
        url: ${LIVINGROOM_IMMICH_KIOSK_URL}
      ignored_libraries:
        # Fitness playback is excluded from this space, without stopping Jellyfin playback.
        - Fitness
      fallback_shuffle_interval_seconds: 45
      cycle_users: false
      cycle_interval_seconds: 15
      session_cleanup:
        paused_after_seconds: 5
        missing_after_seconds: 5
      session_timer:
        enabled: true
        size: 42
      session_count:
        mode: small
      user_transition:
        enabled: true
        duration_seconds: 5
        background_color: "#000000"
        avatar_size: 240
        username_font_size: 126
        message_font_size: 71
        source_icon_size: 150
      mediawall_fallback:
        modes:
          - dvd
        image: banner
        background_color: "#565954"
        min_logo_width: 260
        max_logo_width: 760
        sizes:
          centered: 760
          breathing: 760
          float: 700
          spotlight: 760
          dvd: 520
          minimal: 300
      custom_logo:
        directory: /app/custom_logo
      multiple_backdrops:
        enabled: true
        interval_seconds: 15
      collections:
        # Supply ./app/sounds/starwars.mp3 and ./app/collections/starwars.png.
        enabled: true
        global:
          enabled: false
          sound: toned.mp3
          user_transition_image: ""
          image_size: 260
        groups:
          - name: star-wars
            title_regexes:
              - (?i).*star\s+wars.*
            users:
              - All
            sound: starwars.mp3
            user_transition_image: starwars.png
            image_size: 260
      sounds:
        enabled: true
        sources:
          jellyfin: true
          subsonic: true
          external_music: true
        quiet_hours:
          enabled: false
          start: 23:00
          end: 08:00
        continuous_sessions:
          subsonic: true
          external_music: true
          jellyfin_libraries:
            - Music
            - Music Videos
        session_start:
          retrigger_after_inactive_seconds: 30
        session_end:
          enabled: false
          tone: close.mp3
        trigger: new_session
        directory: /app/sounds
        tone: noted.mp3
        volume: 0.35
    display:
      ui:
        scale: 0.85
      music_artist_images: albumartists
      music_logo_artist: artists
      cycle_interval_seconds: 15
      require_logos: true
      backdrop_background_color: "#050508"
      multiple_backdrops:
        mode: single_backdrop
        single_backdrop: random
        cycle_order: numbered
      animations:
        enabled: true
        style: kenburns
        scale: 1.08
        duration_seconds: 26
      logo:
        max_width: 520
      live_tv:
        channel_image_size: 713
      music_video_indicator:
        enabled: true
        text: "[MV]"
      music_video_album_art:
        # Inherits album_art.size. Optionally set size here for music videos only.
        {}
      album_art:
        size: 300
      fallback_title:
        font_size: 86
      nowplaying_text:
        enabled: true
        text: Now playing on
        show_text: true
        font_size: 16
        show_source_icon: true
        icon_size: 24
        show_user_avatar: true
        user_avatar_size: 24
        user_avatar_resize:
          enabled: true
          size: 96
        show_jellyfin_username: true
        show_subsonic_username: true
        user_font_size: 13
      screensaver_text:
        enabled: true
        text: Featured on jones-server
        font_size: 16
        icon_size: 24
      media_info:
        font_size: 40
        release_year_font_size: 40
        episode_info_font_size: 28
        episode_title_font_size: 40
        music_album_font_size: 24
        music_song_title_font_size: 40
      transitions:
        duration_ms: 1200
        order: written
        styles:
          - crossfade
    password: ${LIVINGROOM_PASSWORD}
    anonymous_mode:
      enabled: true
      shown:
        - bob
        - alice
        - jacob
      not_shown:
        - All
      anonymous_username: someone
      now_playing_info:
        show_anonymous_username: true
        show_anonymous_avatar: true
      user_transition_info:
        show_anonymous_avatar: true
  homelab:
    jellyfin:
      excluded_jellyfin_users:
        - monica
    # Bob's dashboard: no Anonymous Mode, all identities visible, DVD idle screen.
    playback_source: All
    users:
      - All
    password: ${HOMELAB_PASSWORD}
    now_playing:
      fallback: mediawall
      mediawall_fallback:
        modes:
          - dvd
      collections:
        enabled: true
        groups:
          - name: star-wars
            title_regexes:
              - (?i).*star\s+wars.*
            users:
              - All
            sound: starwars.mp3
            user_transition_image: starwars.png
            image_size: 260
    display:
      nowplaying_text:
        enabled: true
        show_user_avatar: true
        show_jellyfin_username: true
        show_subsonic_username: true
```
<!-- END CONFIG EXAMPLE -->

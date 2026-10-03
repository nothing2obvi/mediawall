# Anonymous Mode

Anonymous Mode lets a display say **someone started watching** or **someone started listening to** without showing the person's name or avatar. You can hide everyone, make exceptions, or hide just selected users.

## Where it goes

Define your users and their Jellyfin/Subsonic accounts or external-music tokens under `users`, as usual. Then add `anonymous_mode` to a space. Its lists refer to those same MediaWall user keys, so one rule covers all of a user's services. Each space can have a different policy.

```yaml
users:
  bob:
    jellyfin_user: bob-jellyfin
    subsonic_user: bob-subsonic
    subsonic_password: "${SUBSONIC_BOB_PASSWORD}"
    external_music_token: "${EXTERNAL_MUSIC_BOB_TOKEN}"

spaces:
  livingroom:
    users: [All]
    anonymous_mode:
      enabled: true
      shown: [bob]
      not_shown: [All]
      anonymous_username: someone
      now_playing_info:
        show_anonymous_username: true
        show_anonymous_avatar: true
      user_transition_info:
        show_anonymous_avatar: true
```

This keeps `bob` visible and makes everyone else anonymous. Keep your existing connection settings and put passwords and tokens in `.env`. You only need the mappings for services you use.

Matching ignores case and surrounding spaces: `bob`, `Bob`, and `BOB` match the same key. A user's optional `name` setting doesn't change which key you put in these lists. If you use a source's `All` user mapping, MediaWall uses a matching individual user definition when available; otherwise, use the source account's username.

## Who stays visible?

`shown` always wins, including when both lists contain the same user or `All`. Users who match neither list keep their normal identity.

| What you want | `shown` | `not_shown` |
| --- | --- | --- |
| Everyone anonymous | `[]` | `[All]` |
| Everyone visible | `[All]` | `[All]` |
| Everyone anonymous except bob | `[bob]` | `[All]` |
| Only bob anonymous | `[]` | `[bob]` |

These rules only apply with `enabled: true`. Leaving out Anonymous Mode or setting `enabled: false` keeps existing behavior. When enabled, the defaults are `shown: []` and `not_shown: [All]`.

## Names and avatars

`anonymous_username` defaults to `someone`. You can change it to another nonempty label, such as `Anonymous`. It doesn't rename the actual account or change which sessions MediaWall follows.

**Now Playing info** means the top-right badge. For hidden users, `show_anonymous_username` controls the replacement name, and `show_anonymous_avatar` controls the generic avatar. Both default to `true`. These replace the normal username/avatar switches for hidden users; the badge's `display.nowplaying_text.enabled` switch still controls whether the badge appears at all.

**User transition info** means the session-start screen. It always uses `anonymous_username`. Its `show_anonymous_avatar` switch defaults to `true`. The usual `now_playing.user_transition.enabled` setting still controls whether transitions appear.

MediaWall ships with a default avatar at `/app/avatars/anonymous.png`. Replace it with your own `anonymous.png`, `.jpg`, `.jpeg`, or `.webp` in `/app/avatars/`. With the standard mount, that's `./app/avatars/` beside your Compose file:

```yaml
volumes:
  - ./app/avatars:/app/avatars:ro
```

If several files exist, MediaWall uses **WebP, JPG, JPEG, then PNG**, in that order. A custom JPG or WebP therefore overrides the shipped PNG without needing to delete it. Docker also keeps a bundled copy as the default when a mounted folder has no anonymous image.

Replacing the image updates anonymous badges and any open anonymous transitions across all spaces automatically, normally within a few seconds. You don't need to restart, refresh, or change user mappings or Anonymous Mode rules.

Turn off `show_anonymous_avatar` separately under `now_playing_info` or `user_transition_info` wherever you don't want an avatar. Hidden users never fall back to real Jellyfin or custom Spotify avatars. If neither a custom nor bundled image is available, no avatar appears. Users allowed by `shown` keep their existing settings.

## Don't show any real identities

Use this in each space where everyone should be anonymous:

```yaml
spaces:
  livingroom:
    anonymous_mode:
      enabled: true
      shown: []
      not_shown: [All]
      anonymous_username: someone
      now_playing_info:
        show_anonymous_username: false
        show_anonymous_avatar: false
      user_transition_info:
        show_anonymous_avatar: false
```

The badge shows no username or avatar. Transitions say `someone` and show no avatar. To show a generic name or image, turn on the corresponding switch. To let `bob` remain visible, change `shown` to `[bob]`.

This controls identity presentation on the display and remote. It doesn't anonymize administrator logs, the underlying media services, or every API field. Custom sounds and collection images are unchanged, so choose neutral ones if they could identify a person.

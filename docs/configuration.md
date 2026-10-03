## Configuration

Secrets should live in `.env`. Display behavior should live in `config.yml`.

See the [Configuration Reference](configuration-reference.md) for every setting and its default. You can leave out optional settings.

### Environment Variables

```env
JELLYFIN_URL=http://jellyfin.example.local:8096
JELLYFIN_API_KEY=replace-with-a-jellyfin-admin-api-key
JELLYFIN_BOB_USER=bob-jellyfin

SUBSONIC_URL=http://navidrome.example.local:4533
SUBSONIC_BOB_USER=bob-subsonic
SUBSONIC_BOB_PASSWORD=replace-with-a-subsonic-password

LIVINGROOM_PASSWORD=
HOMELAB_PASSWORD=

LOG_LEVEL=info
```

The Jellyfin API key should belong to a Jellyfin admin user. MediaWall uses it to read sessions, users, libraries, and artwork. Choose which Jellyfin users to watch in `config.yml`, or use `All`.

For Subsonic, configure each Subsonic account you want MediaWall to distinguish as its own MediaWall user. For example, you can add `SUBSONIC_BOB_USER`, `SUBSONIC_BOB_PASSWORD`, `SUBSONIC_BOB2_USER`, and `SUBSONIC_BOB2_PASSWORD`, then reference those from separate `users` entries in `config.yml`.

Use a separate password variable for each protected space. In addition to `LIVINGROOM_PASSWORD=` and `HOMELAB_PASSWORD=`, you can create any others you need, such as `OFFICE_PASSWORD=` or `KITCHEN_PASSWORD=`, then reference them from the matching space.

Use `LOG_LEVEL=debug` when troubleshooting playback, session cycling, scans, or artwork behavior. Supported values are `debug`, `info`, `warn`, `error`, and `silent`; the default is `info`.


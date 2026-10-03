## Quick Start

Create a `docker-compose.yml`:

```yaml
services:
  mediawall:
    image: ghcr.io/nothing2obvi/mediawall:latest
    container_name: mediawall
    restart: unless-stopped
    ports:
      - "1221:1221"
    env_file:
      - .env
    volumes:
      - ./config.yml:/app/config.yml:ro
      - ./data:/app/data
      - ./library:/library
      - ./app/sounds:/app/sounds:ro
      - ./app/custom_logo:/app/custom_logo:ro
      - ./app/collections:/app/collections:ro
      - ./app/avatars:/app/avatars:ro
      # Only needed when using Subsonic with local artist backdrop/logo files.
      # - /path/to/your/subsonic/music:/navidrome_music:rw
```

Then:

1. Copy `.env.example` to `.env`.
2. Fill in Jellyfin and/or Subsonic connection values, or follow [External Music](external-music.md) for Multi-Scrobbler.
3. Edit `config.yml` for your spaces and libraries.
4. Start the app:

```sh
docker compose up -d
```

Open a space:

```text
http://localhost:1221/livingroom
http://localhost:1221/office
http://localhost:1221/homelab
```

If a space has a password, pass it in the URL:

```text
http://localhost:1221/livingroom?password=your-password
```

You can also open a mobile-friendly remote for any space by adding `-remote` to the space name:

```text
http://localhost:1221/livingroom-remote
```

The remote follows the same password rule as the space, so a protected remote uses the same `?password=` value.

Keep `./data` and `./library` between upgrades. `data/state.json` holds your display choices, `/app/data/grid-cache` holds cached images, and `/library/Artists` holds your [Library images](external-music-images.md).


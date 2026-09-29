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
      - ./app/sounds:/app/sounds:ro
      - ./app/custom_logo:/app/custom_logo:ro
      - ./app/collections:/app/collections:ro
      # Only needed when using Navidrome with local artist backdrop/logo files.
      # - /path/to/your/navidrome/music:/navidrome_music:rw
```

Then:

1. Copy `.env.example` to `.env`.
2. Fill in Jellyfin and/or Navidrome connection values.
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

Interactive state is stored in `data/state.json`. Image cache data is stored under the configured library scan directory, which defaults to `/app/data/grid-cache` inside the container.


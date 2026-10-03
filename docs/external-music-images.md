## External Music Images

MediaWall keeps its own artist logos and backdrops in **Library**. These are permanent library images, not disposable cache files. You can browse them in the grid and use them for Wallpaper/Screensaver mode, even without a Jellyfin or Subsonic library.

### Set up the folder

Add this writable mount to your Compose service:

```yaml
volumes:
  - ./library:/library
```

MediaWall creates `Artists` inside it. The folder beside your Compose file is where you can add or back up images. For a non-Docker setup, set `library.directory` to a writable local folder; its default is `/library`.

```yaml
library:
  directory: /library
```

### Artist folders and image names

Use one folder per artist:

```text
library/
└── Artists/
    └── Taylor Swift/
        ├── logo.png
        ├── backdrop.jpg
        ├── backdrop1.jpg
        └── backdrop2.jpg
```

MediaWall writes Jellyfin-compatible names: `logo`, `backdrop`, `backdrop1`, `backdrop2`, and so on. It also recognizes numbered backdrops with a hyphen, such as `backdrop-1.jpg`. Supported extensions are PNG, JPG/JPEG, WebP, GIF, and AVIF. The upload dialog supports PNG, JPEG, WebP, and GIF. See [Jellyfin's image naming guide](https://jellyfin.org/docs/general/server/media/music/).

Folder names match artist names without regard to case. Use [artist aliases](configuration-reference.md#artist-aliases) if a music service spells a name differently. Characters that can't be used in folder names are replaced when MediaWall creates a folder. Don't use symbolic links for the Library or its artist folders and images.

MediaWall scans Library at startup and during scheduled library scans. Adding, replacing, or removing an image also updates the display automatically, normally within a few seconds. You don't need to restart. Let a file finish copying before expecting it to display.

### Where images come from

With `external_music.artwork.preference: local`, enabled Jellyfin and local-file sources are tried first. When those don't supply artwork, MediaWall uses Library images or downloads artist images from the configured providers. Set `preference: fetched` to prefer Library/provider artwork. The existing `subsonic.artwork.jellyfin_fallback` and `local_files` switches also control those lookups for external music.

Use the [provider API key setup](external-music.md#image-provider-api-keys) to enable downloads. Existing Library images don't expire. You can also add your own images or use [Edit images](image-editor.md). Saved edits take priority over automatic selections.

Album covers still use the album cache. Grid thumbnails are also cache data. Neither belongs in an artist's Library folder.

### Upgrading existing artwork

Before starting the updated container, add the mount and replace the removed `external_music.artwork.cache_directory` and `cache_ttl_days` settings with `album_cache_directory` and `album_cache_ttl_days`. Keep the old directory value so MediaWall can find both the album cache and existing artist downloads.

At startup, MediaWall copies existing artist downloads into Library, preserving provider details and backdrop order. Existing Library images aren't overwritten. The original files stay in the old folder as a backup, with a `migrated-metadata.json` marker so they aren't imported again. Back up both locations before upgrading. If migration fails, check the log and folder permissions before retrying.

### Clearing Library images

With MediaWall running:

```sh
docker exec -it mediawall npm run mediawall -- clear library-images
```

Read the warning and type `clear`. This deletes artist logos and backdrops from Library, **including images you added manually**, and clears their saved image selections. Other files are left alone. Close image editors and let scans finish first. Add `--yes` only when you want to skip the confirmation in a script.

Cleared artists stay empty rather than downloading everything again immediately. Add files or use Edit images to give them artwork again. `clear cache` leaves Library images alone.

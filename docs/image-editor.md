## Image Editor

**Edit images** works much like Jellyfin's image editor: view existing images, search providers, upload your own with the **+** button, replace a logo, add backdrops, reorder them, or delete individual images. It appears beside Themes on the display and remote. It is hidden during fallback screens, including Immich Kiosk.

### Button colors

The button and dialog color show where edits are saved:

- **Purple:** Jellyfin. Images are changed on your Jellyfin server, using its enabled image providers.
- **Blue:** local/Navidrome artist files. The mapped music folder must be writable; MediaWall only changes recognized artwork, never audio or video files.
- **Orange:** MediaWall's external artwork cache. Searches use MediaWall's configured image providers, and selected images remain in its cache until cleared.

The color follows the artwork source, so Spotify playback using Jellyfin artwork has a purple button. Music edits apply to the configured artist/album artist; album covers are managed automatically.

### Viewing and changing images

Click a thumbnail for a larger view. Left/Right keys or arrow buttons browse images of the same type. Enter selects a search result, replacing the logo or adding a backdrop. Backspace deletes an existing backdrop. Escape, the close button, or clicking outside returns one dialog level at a time. Search currently uses one continuous result list; Jellyfin returns up to 100 images.

Changes save immediately. Closing a dialog or clicking Cancel in search/upload does not undo saved changes. Uploads support PNG, JPEG, WebP, and GIF up to 10 MB. MediaWall pauses its presentation while editing, not the underlying media playback.

### Clearing the cache

Use cache clearing when you want MediaWall to discard downloaded/cached artwork and fetch it again. This also discards saved external artwork selections. It preserves original Jellyfin and local artwork, media files, and personal assets.

With MediaWall running:

```sh
docker exec -it mediawall npm run mediawall -- clear cache
```

Read the warning and type `clear` to confirm. For a local Node installation, use `npm run mediawall -- clear cache`; scripts can add `--yes` to confirm explicitly. Active library scans must finish first. Connected displays show a success toast and play the trash sound when global sounds and browser audio are enabled.

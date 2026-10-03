## Image Editor

**Edit images** works much like Jellyfin's editor. You can search for artwork, upload your own, replace a logo, add or reorder backdrops, and delete images. The button sits beside Themes on the display and remote. You won't see it during fallback screens, including Immich Kiosk.

### Button colors

The color tells you where edits are saved:

- **Purple: Jellyfin.** Edits change images on your Jellyfin server. Search uses Jellyfin's enabled providers.
- **Blue: local/Subsonic files.** Edits change artwork in your mapped music folder, which must be writable. Audio and video files aren't touched.
- **Orange: MediaWall Library.** Edits save artist images under `/library/Artists`. Search uses MediaWall's configured providers.

The color follows the artwork, not the music service. Spotify using Jellyfin images gets a purple button. Music edits apply to the displayed artist; album covers are handled automatically.

### Viewing and changing images

Logos appear above the larger backdrop cards. Each image has dimensions, a search button, and a red delete button. Use the backdrop arrows to change their order.

The search button beside **Images** starts with Logo. You can switch between Logo and Backdrop, choose a provider, and browse up to 30 results per page. Filters stay selected as you change pages. **All languages** is available for Jellyfin searches.

Click an image to enlarge it. Left/Right keys or buttons browse images of the same type, including across search pages. Enter selects a search result. Backspace deletes an existing backdrop. Escape, the close button, or a click outside takes you back one dialog level.

Use **+** to upload: drop a file or click **Choose file**, check the preview, and choose Logo or Backdrop. Nothing saves until you click **Add** or **Replace**. Logos replace the existing logo; backdrops are added. Uploads accept PNG, JPEG, WebP, and GIF up to 10 MB.

Saved edits appear on the display automatically. Closing a dialog doesn't undo them. Editing holds the display in place without pausing your music or video.

### Local Subsonic filenames

Local artist edits save into the existing artist folder using Jellyfin-compatible names: `logo.png`, `backdrop.jpg`, `backdrop1.jpg`, and so on, with the extension matching the image format. New backdrops use the first free numbered slot without overwriting existing files. MediaWall keeps your chosen backdrop order in `.mediawall-images.json`.

Older UUID-named images still work; they aren't renamed automatically. Replacing an older logo saves it under `logo.ext`. The music mount must be writable. Audio and video files aren't modified.

### Clearing the cache

To refresh cached grid images and album covers:

```sh
docker exec -it mediawall npm run mediawall -- clear cache
```

Type `clear` to confirm, or add `--yes` for a script. Wait for any active scan to finish. The display shows a success message and plays the trash sound if sounds are enabled and the browser allows audio.

This doesn't delete Library images. Those have a [separate clearing command](external-music-images.md#clearing-library-images), which also removes manually added artist images. Neither command deletes Jellyfin artwork, Subsonic artwork, music, or video files.

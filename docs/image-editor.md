## Image Editor

Use **Edit images** beside Themes in the display or remote controls to manage the current artist, movie, or TV series. The button and dialog show the artwork source: orange for MediaWall's external cache, purple for Jellyfin, and blue for local/Navidrome files. Music uses the configured canonical artwork artist, including album artist.

Search opens a separate dialog; Cancel, Escape, or an outside click returns to the image editor, and using the editor’s close button, Escape, or outside click exits the editor. Search for logos or backdrops, add backdrops without replacing existing ones, move them with left/right arrows, or delete individual images. Album covers are managed automatically outside this editor. Changes save immediately; the close button, Escape, or clicking outside closes the editor. MediaWall's presentation timer pauses while editing and resumes with its remaining time; media playback continues.

Jellyfin edits are written to the configured server and search its enabled image providers. Local artwork edits change recognized artist image files and save order in `.mediawall-images.json`; the mapped artist directory must be writable. Audio and video files are never edited by the artwork editor: mutations require a supported image extension and image signature inside the configured music root. Local and external searches use configured Fanart.tv/TheAudioDB providers. External selections persist in MediaWall's artist cache until explicitly cleared.

Use the **+** button in the image editor to upload your own image. Drag and drop a file or choose one from your device, preview it, and select **Logo** (replace) or **Backdrop** (append). PNG, JPEG, WebP, and GIF files up to 10 MB are supported. Uploads save to the active artwork source; local files still require a writable music mount. Cancel, Escape, or clicking outside returns to the image editor.

### Clear artwork cache

With MediaWall running, use:

```sh
npm run mediawall -- clear cache
# Docker: run in an interactive terminal
docker exec -it mediawall npm run mediawall -- clear cache
```

Read the warning and type `clear` to confirm. For scripts, `clear cache --yes` explicitly confirms the same operation. This removes recognized MediaWall grid/wallpaper cache files and external artist/album image caches, including saved external artwork selections. It preserves original Jellyfin/local artwork, audio, personal assets, and unrelated files. Active library scans must finish first.

Connected displays show a bottom-right success toast after completion. The built-in `trash.mp3` plays only with global sounds enabled (browser audio permission still applies). No separate sound toggle is needed.

See [image editor implementation and validation](image-editor-implementation.md) for persistence details and limitations.


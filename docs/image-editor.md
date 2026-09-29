## Image Editor

Use **Edit images** beside Themes in the display or remote controls to manage the current artist, movie, or TV series. The button and dialog show the artwork source: orange for MediaWall's external cache, purple for Jellyfin, and blue for local/Navidrome files. Music uses the configured canonical artwork artist, including album artist. The version remains at the far right of the controls. Edit images is hidden while Immich Kiosk or any other fallback is displayed.

Search opens a separate dialog; Cancel, Escape, or an outside click returns to the image editor, and using the editor’s close button, Escape, or outside click exits the editor. Search for logos or backdrops, add backdrops without replacing existing ones, move them with left/right arrows, or delete individual images. Album covers are managed automatically outside this editor. Changes save immediately; the close button, Escape, or clicking outside closes the editor. MediaWall's presentation timer pauses while editing and resumes with its remaining time; media playback continues.

Jellyfin edits are written to the configured server and search its enabled image providers. Local artwork edits change recognized artist image files and save order in `.mediawall-images.json`; the mapped artist directory must be writable. Audio and video files are never edited by the artwork editor: mutations require a supported image extension and image signature inside the configured music root. Local and external searches use configured Fanart.tv/TheAudioDB providers. External selections persist in MediaWall's artist cache until explicitly cleared.

Use the **+** button in the image editor to upload your own image. Drag and drop a file or choose one from your device, preview it, and select **Logo** (replace) or **Backdrop** (append). PNG, JPEG, WebP, and GIF files up to 10 MB are supported. Uploads save to the active artwork source; local files still require a writable music mount. Cancel, Escape, or clicking outside returns to the image editor.

### Enlarged previews and keyboard controls

Click an existing image or a search-result thumbnail to open a larger preview. Left and Right arrow keys browse images of the same type within the current collection or search results. On-screen previous/next buttons appear when more than one image of that type exists, and are disabled at the first and last image. Search results currently form one continuous list, without separate pages; Jellyfin searches return up to 100 images.

| Key | Action in the enlarged preview |
| --- | --- |
| `ArrowLeft` / `ArrowRight` | View the previous/next image of the same type. |
| `Enter` | Select a search result: replace the current logo or append a backdrop. Existing artwork is already selected and is not added again. |
| `Backspace` | Delete the displayed existing backdrop from its source. Does not delete logos or search results. |
| `Escape` | Close the enlarged preview and return to the image list. |

The enlarged preview also has **Use logo** or **Add backdrop** for search results, **Delete backdrop** for existing backdrops, and a close button. Clicking outside closes only the enlarged preview. A successful selection or deletion closes the preview; selecting a logo also closes search, while adding a backdrop returns to the search results. Errors remain visible in the preview so you can retry. Holding Enter or Backspace does not repeat the mutation.

Edits save immediately; closing a dialog does not undo them. The main image editor has no Cancel button. Cancel in search or upload returns to the editor without undoing completed edits. Escape or an outside click dismisses one dialog layer at a time.

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


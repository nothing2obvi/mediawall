## Display Setup

### Apple Devices

Open your MediaWall space in Safari, tap the Share button, then choose **Add to Home Screen**. It opens like an app from your Home Screen. If sounds are enabled, tap the MediaWall screen once after opening so Safari allows audio playback.

On a regular computer, you can also open the space in a browser and make MediaWall fullscreen with the [keyboard shortcuts](controls.md#keyboard-shortcuts).

If animation changes seem to stick in the Home Screen app even though Safari shows the new behavior, delete the Home Screen app, go to **Settings -> Safari -> Clear History and Website Data**, open the MediaWall URL in Safari, refresh it, then add it to the Home Screen again.

Different devices handle motion differently. On older devices such as a 2017 iPad, start with simpler transitions like `crossfade` or `fade`, and gentler animations like `breathe`, `pan`, or `focus`. `kenburns`, `drift`, and the directional slide/push transitions can look great on faster displays, but they may feel heavier on older tablets.

### Android Devices

Open your MediaWall space in Chrome, open the browser menu, then choose **Add to Home screen** or **Install app** if Chrome offers it. If sounds are enabled, tap the screen once after opening so the browser allows audio playback.

On devices with a keyboard or touch display, use the [keyboard shortcuts](controls.md#keyboard-shortcuts).

### Raspberry Pi

One common setup is to launch Chromium in kiosk mode after the desktop starts:

```sh
chromium-browser --kiosk --app=http://localhost:1221/livingroom
```

Use the URL for the space you want to display. If the MediaWall container is running on another machine, replace `localhost` with that machine's IP address.

If you're not using kiosk mode, open the space in a regular browser and press `f` for fullscreen.


### Custom logos

Put one PNG or SVG in `./app/custom_logo` and keep the `./app/custom_logo:/app/custom_logo:ro` mount. In a space, set `now_playing.fallback: mediawall` and `now_playing.mediawall_fallback.image: custom`. Choose `mediawall_fallback.modes: [centered]` for a stationary logo, or another supported mode for animation.

`now_playing.custom_logo.directory` defaults to `/app/custom_logo`. If it contains several PNG/SVG files, MediaWall uses the first filename alphabetically. Use one image to keep the choice predictable.

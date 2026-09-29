## Remote

Every display space has a matching remote URL. For example, `/livingroom` has `/livingroom-remote`. The remote is meant for a phone or small tablet, works vertically or horizontally, and exposes the main controls: previous/next, pause/play in Wallpaper/Screensaver mode, mode, selection, grid, shuffle, favorites, media info, fullscreen, and sound mute when sounds are enabled.

The remote controls the same server-owned presentation state as the display. Browsers connected to the same space share the current mode, item/session, backdrop position, pause state, and transition deadline; another space keeps its own independent timeline. MediaWall uses a lightweight server-sent events connection to wake clients when that shared state changes, plus shared server timestamps so it doesn't need to send timer ticks every second.

Dialogs and the grid can be dismissed by tapping outside them or tapping the same remote button again. The grid uses the same libraries, favorite filtering, and password rules as the display. Remote button presses also show the same brief center-screen feedback icons on the display.

Display and remote routes install as distinct PWAs. A route ending in `-remote` uses the remote icon and its own manifest identity; normal space routes use the MediaWall logo. Query-string passwords are preserved in the launch URL but aren't used when deciding which icon/identity applies.


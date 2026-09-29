## Themes

MediaWall v0.3 includes the existing `default` appearance plus 20 selectable themes: Dracula, Nord, Catppuccin Latte, Catppuccin Mocha, Gruvbox Dark, Gruvbox Light, Solarized Dark, Solarized Light, Tokyo Night, One Dark, Monokai, Rose Pine, Everforest, Kanagawa, Synthwave 84, Material Palenight, Night Owl, Ayu Mirage, GitHub Light, and Tomorrow Night.

Set `theme: All` on a space, or omit `theme`, to let viewers change it using the Themes button or the `t` key. The Themes button sits immediately before the version number and stays open while choices are applied, so colors can be compared quickly. The selected theme is stored in the synchronized space state: displays, remotes, reconnects, and refreshes all use the same choice. The remote includes the same selector and an explicit Cancel button. Selecting the current theme again does nothing and doesn't create another toast.

Set a specific theme name to lock that space to it. Fixed-theme spaces hide the Themes button, ignore `t`, and reject interactive theme changes from remotes or browsers. Themes change text, secondary text, accent colors, borders, controls, dialogs, toasts, and avatar outlines. They don't alter media artwork. Existing translucent surfaces, text shadows, and contrast treatments remain in place so both light and dark themes stay legible over changing backdrops.


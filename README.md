<img src="src/logos/banner.png" alt="MediaWall" width="100%">

<p align="center">
  <a href="https://ko-fi.com/yeahnoforsure_" target="_blank" rel="noopener noreferrer">
    <img src="src/logos/ko-fi.png" alt="Support me on Ko-fi" width="360">
  </a>
</p>

<p align="center">
  Also by me:
  <a href="https://github.com/nothing2obvi/pixelfin">Pixelfin</a> ·
  <a href="https://github.com/nothing2obvi/jellyfin-plugins/tree/main/Jellytag">JellyTag-Plus</a> ·
  <a href="https://github.com/nothing2obvi/jellyfin-plugins/tree/main/TaskGrid">TaskGrid</a>
</p>

# MediaWall

## TL;DR

MediaWall is a self-hosted display for Jellyfin, Subsonic-compatible music servers, and external music sources like Spotify. Subsonic support is primarily tested with Navidrome.

MediaWall is a way to take advantage of an old iPad, a Raspberry Pi with a display, or any spare screen by turning it into a live window into your Jellyfin and Subsonic-compatible music servers. It can show what you and your users are currently watching or listening to, cycle through artwork from your libraries as a screensaver, or display favorite media as wallpapers. With Multi-Scrobbler, it can also show Now Playing from external music sources such as Spotify. It also supports custom sounds, layouts, and fallback screens. Basically, it's a fun little project that's an overengineered way to view active sessions and make your media library visible instead of leaving all that artwork buried in storage.

## What's your use case for MediaWall?

Personally I use it as a “What’s now playing on the server?” passive display, with sounds so I know when a session starts. We might be doing something else, hear a pleasant chime, then go, “Ooh, someone started the new season of Ted Lasso.” I have about 25 regular users, so it’s just like a fun little thing that happens randomly. Sounds, of course, are optional. Showing usernames and avatars is completely optional, too. There's also an Anonymous Mode.

It’s also been particularly useful when my wife and I host parties. One of us plays music via Bluetooth on our speakers, and the display shows us what’s playing, complete with backdrop artwork, album cover, and media info, whether I play music from Navidrome or my wife plays music from Spotify. When someone asks what’s playing, we just tell them to check the screen.

And when nothing’s playing at all, it falls back to [Immich Kiosk](https://github.com/damongolding/immich-kiosk), so our family photos are displayed. Immich Kiosk integration is also optional.

## Screenshots

![MediaWall monitor setup](src/screenshots/monitor_3.jpg)

![MediaWall on a monitor](src/screenshots/monitor_1.jpg)

![MediaWall monitor detail](src/screenshots/monitor_2.jpg)

<p align="center">
  <img src="src/screenshots/gif_1.gif" alt="MediaWall animated display">
</p>

![MediaWall on iPad](src/screenshots/ipad_1.jpg)

![MediaWall on iPad, alternate setup](src/screenshots/ipad_2.jpg)

![Jellyfin Now Playing](src/screenshots/jellyfin_1.png)

![Jellyfin Session Cycling](src/screenshots/jellyfin_2.png)

![Navidrome Now Playing](src/screenshots/navidrome_1.png)

![MediaWall UI Controls](src/screenshots/ui_1.png)

![MediaWall Grid](src/screenshots/ui_2.png)

## ⚠️ Disclaimers

MediaWall is under active development. There may be breaking changes, which will be highlighted in every release.

Like [Pixelfin](https://github.com/nothing2obvi/pixelfin), this project is vibecoded with Codex. It's built with security in mind, but because it's a vibecoded self-hosted app, I can't promise it's hardened for hostile public exposure. Prioritize running it locally or behind access controls you trust.

## Intro

In line with my ongoing obsession with Jellyfin artwork, as seen in my other project, [Pixelfin](https://github.com/nothing2obvi/pixelfin), I wanted to combine my appreciation for the Jellyfin Android TV screensaver with being able to glance over and see what people are watching or listening to on my Jellyfin and Navidrome servers.

Then I realized I had an old iPad doing absolutely nothing. I wanted something that could run on that, a Raspberry Pi connected to a display, or really any device with a browser. MediaWall was born.

MediaWall is a display app for Jellyfin, Subsonic-compatible music servers (e.g. Navidrome), and external music sources (e.g. Spotify) via Multi-Scrobbler, built around three main features. Each display space also has a phone-friendly remote at the same route with `-remote` appended.

The first, and most prominent, is **Now Playing**. It shows what's currently being watched or listened to, along with artwork, user information, media details, and optional sounds when sessions start or end. You can choose which users are allowed to appear, or use Anonymous Mode to hide selected users behind a shared anonymous identity (e.g. "someone"). Sounds can be global, assigned to individual users, or customized for Jellyfin collections, which can also use their own transition images.

The second is **Screensaver mode**, inspired by the Jellyfin Android TV screensaver. It cycles through artwork from your Jellyfin libraries and gives you control over what appears and how it's displayed. If you've got terabytes of media mostly sitting there as data, it's a way to actually see more of the artwork that comes with it.

Third is **Wallpaper mode**. You can pause on an item you like and leave it as a static wallpaper, or favorite items and have MediaWall cycle through your own curated selection.

When nothing is playing, MediaWall can cycle through library artwork, show the bundled MediaWall screensaver or your own custom logo, or hand the display over to an **Immich Kiosk** setup so it can double as a digital photo frame.

Depending on how you use it, MediaWall can be a live window into your media servers, a Jellyfin-powered art display, or a very overengineered way to give an old iPad, Raspberry Pi, or spare screen something useful to do.

## Use Cases

### See What Everyone Is Watching or Listening To

Put MediaWall on an iPad, tablet, TV, or Raspberry Pi display in a shared room and use it as a live window into your media server.

If someone is watching something on Jellyfin or listening to music through a Subsonic-compatible server, MediaWall can automatically show active sessions with backdrop artwork, logos, playback information, source icons, and, if you want, the name or avatar of the person using it.

So instead of asking, "What are we listening to?" or checking Jellyfin manually, you can just glance at the display.

### Turn It Into a Homelab Playback Dashboard

If you run Jellyfin for multiple people, MediaWall can also act as a simple visual dashboard for your server. Set it to watch all Jellyfin users, and the display will automatically show all active sessions.

It's an easy way to make activity on your server feel a little more visible and alive without opening an admin dashboard or staring at a list of sessions.

### Use It as an Artwork Display

MediaWall doesn't have to show playback activity at all.

You can put it on a desk, shelf, wall-mounted tablet, or Raspberry Pi-connected display and use it as a rotating screensaver for the artwork in your Jellyfin library.

If you don't want it pulling from everything, open the grid and favorite the artwork you actually want to see, or only allow specific libraries. MediaWall can then rotate through only those favorites or libraries, essentially turning your media collection into a curated digital art display.

And if one image looks especially good, just pause the slideshow and leave it there as a clean static wallpaper.

That's really the idea behind MediaWall: it can be a Now Playing display, a homelab dashboard, a screensaver, a wallpaper, or some combination of all of them depending on where you put it.

## What It Does

- Shows active playback sessions from Jellyfin, Subsonic-compatible servers (e.g. Navidrome), or both, including Jellyfin Live TV channels
- Shows active playback sessions from external music sources such as Spotify through Multi-Scrobbler.
- Supports multiple MediaWall users per space, including Jellyfin `All` users.
- Can show a configurable user-intro transition when a Now Playing session first appears.
- Falls back to a default MediaWall screen, shuffled artwork, or an optional per-space Immich Kiosk display when nothing is playing.
- Provides a full-screen Wallpaper/Screensaver mode with library browsing, favorites, shuffle, logos, media info, transitions, and subtle backdrop motion.
- Uses Jellyfin, Subsonic-compatible servers (e.g. Navidrome), and Multi-Scrobbler supported services (e.g. Spotify) backdrops/logos where available.
- Can use Subsonic playback for music-focused setups, and Subsonic servers can use Jellyfin's images when both services are configured.
- Can use local artist backdrop and logo files for Subsonic-only artwork.
- Includes an image editor for logos and backdrops, with provider search, uploads, enlarged previews, ordering, and deletion across Jellyfin, local artwork, and the external artwork cache.

Subsonic-compatible servers (e.g. Navidrome) such as Navidrome can drive a music-only wall using local artist artwork or matching Jellyfin artist images. Jellyfin is recommended because MediaWall can use its rich backdrop, logo, user avatar, movie, series, and artist metadata.

## [Documentation](docs/README.md)

We've included a full configuration example for a fictional family with two different MediaWall spaces. Start with [Bob, Alice, and Jacob](docs/configuration.md#bob-alice-and-jacob), then use [config.yml.example](config.yml.example) as a starting point for your own setup.

Upgrading from v0.3.1? Read the [configuration migration notes](docs/upgrading.md) before starting v0.4.0.

## License

Starting with v0.2, MediaWall is licensed under the [GNU Affero General Public License v3.0](LICENSE). MediaWall remains open source and may still be used commercially, but modified versions used over a network must make the corresponding source code available under the terms of the AGPLv3. Previously released MIT versions remain under the license that accompanied those releases.

## Contributors

Contributions welcome.

export function externalServiceKey(value?: string): string | undefined {
  const name = (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Array<[string, string[]]> = [
    ["spotify", ["spotify"]], ["apple_music", ["applemusic", "musicapplecom"]],
    ["chromecast", ["chromecast", "googlecast"]], ["jriver", ["jriver"]],
    ["kodi", ["kodi"]], ["mopidy", ["mopidy"]], ["mpd", ["mpd", "musicplayerdaemon"]],
    ["musikcube", ["musikcube"]], ["plex", ["plex"]], ["sonos", ["sonos"]],
    ["subsonic", ["subsonic", "airsonic", "gonic", "navidrome"]], ["vlc", ["vlc"]],
    ["yamaha-musiccast", ["yamahamusiccast", "musiccast", "yamaha"]],
    ["yandex-music", ["yandexmusic", "musicyandex", "yandex"]]
  ];
  return aliases.find(([, values]) => values.some(alias => name.includes(alias)))?.[0];
}

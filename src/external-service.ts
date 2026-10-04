const aliases: Record<string, string> = {
  spotify: "spotify", applemusic: "apple_music", musicapplecom: "apple_music",
  chromecast: "google-cast", googlecast: "google-cast", googlecastchromecast: "google-cast",
  jriver: "jriver", jrivermediacenter: "jriver", kodi: "kodi", mopidy: "mopidy",
  mpd: "mpd", musicplayerdaemon: "mpd", musikcube: "musikcube", plex: "plex", sonos: "sonos",
  subsonic: "subsonic", subsoniccompatible: "subsonic", subsoniccompatibleapis: "subsonic",
  airsonic: "subsonic", airsonicadvanced: "airsonic-advanced", gonic: "gonic", navidrome: "navidrome",
  ampache: "ampache", nextcloud: "nextcloud", funkwhale: "funkwhale", lms: "lms",
  vlc: "vlc", yamahamusiccast: "yamaha-musiccast", musiccast: "yamaha-musiccast", yamaha: "yamaha-musiccast",
  yandexmusic: "yandex-music", musicyandex: "yandex-music", yandex: "yandex-music",
  webscrobbler: "webscrobbler", librefm: "librefm", lastfm: "lastfm", lastfmendpoint: "lastfm", endpointlfm: "lastfm", icecast: "icecast", azuracast: "azuracast",
  jellyfin: "jellyfin"
};
export function externalServiceKey(value?: string): string | undefined {
  let name = (value ?? "").trim().toLowerCase();
  if (/^https?:\/\//.test(name)) {
    try {
      const host = new URL(name).hostname;
      const services: Array<[string, string]> = [["spotify.com", "spotify"], ["music.apple.com", "apple_music"],
        ["music.yandex.ru", "yandex-music"], ["music.yandex.com", "yandex-music"], ["last.fm", "lastfm"], ["libre.fm", "librefm"]];
      return services.find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1];
    } catch { return undefined; }
  }
  return aliases[name.replace(/[^a-z0-9]/g, "")];
}
// Unknown services can have an exact, filename-safe custom icon without a config option.
export function externalIconKey(value?: string) {
  return externalServiceKey(value) ?? (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

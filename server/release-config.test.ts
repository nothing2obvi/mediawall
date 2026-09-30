import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "./config.js";
import { watchesSource } from "./playback-source.js";
import { externalServiceKey } from "../src/external-service.js";
import { ExternalMusicReceiver } from "./external-music.js";

test("playback selectors watch only their requested sources", () => {
  const sources = ["jellyfin", "navidrome", "external-music"] as const;
  for (const selection of [...sources, "All"] as const) {
    for (const source of sources) assert.equal(watchesSource(selection, source), selection === "All" || selection === source);
  }
});

test("configuration accepts new selectors and rejects removed settings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mediawall-config-"));
  const previous = process.env.MEDIAWALL_CONFIG;
  process.env.MEDIAWALL_CONFIG = path.join(dir, "config.yml");
  const read = (body: string) => { fs.writeFileSync(process.env.MEDIAWALL_CONFIG!, body); return loadConfig(); };
  try {
    for (const source of ["jellyfin", "navidrome", "external-music", "All"]) {
      assert.equal(read(`spaces:\n  wall:\n    playback_source: ${source}\n`).spaces.wall.playback_source, source);
    }
    assert.equal(read("spaces:\n  wall: {}\n").spaces.wall.playback_source, "All");
    assert.throws(() => read("spaces:\n  wall:\n    playback_source: both\n"));
    assert.throws(() => read("spaces:\n  wall:\n    playback_user: alex\n"), /playback_user was removed/);
    const config = read(`external_music:
  enabled: true
users:
  primary:
    name: Alex
    external_music_token: test-primary-secret
  secondary:
    external_music_token: test-secondary-secret
spaces:
  wall:
    users: [primary, secondary]
`);
    const receiver = new ExternalMusicReceiver(config);
    assert.equal(receiver.validateToken("test-primary-secret")?.user, "Alex");
    assert.equal(receiver.validateToken("test-secondary-secret")?.user, "secondary");
    assert.equal(receiver.receiveSubmitListens("test-primary-secret", {listen_type:"playing_now",payload:[{track_metadata:{artist_name:"Artist",track_name:"Song",additional_info:{music_service_name:"Spotify"}}}]}).ok, true);
    assert.equal(receiver.activePlaybacks(config.spaces.wall.users[0].name).length, 1);
    assert.equal(receiver.activePlaybacks("secondary").length, 0);
  } finally {
    if (previous === undefined) delete process.env.MEDIAWALL_CONFIG; else process.env.MEDIAWALL_CONFIG = previous;
    fs.rmSync(dir, {recursive:true,force:true});
  }
});

test("external service names and URLs select the added logos", () => {
  const cases: Record<string,string> = {Spotify:"spotify", "https://open.spotify.com":"spotify", "Apple Music":"apple_music", Chromecast:"chromecast", "JRiver Media Center":"jriver", Kodi:"kodi", Mopidy:"mopidy", MPD:"mpd", Musikcube:"musikcube", Plex:"plex", Sonos:"sonos", "Subsonic-compatible":"subsonic", Airsonic:"subsonic", VLC:"vlc", "Yamaha MusicCast":"yamaha-musiccast", "Yandex Music":"yandex-music", "https://music.yandex.ru":"yandex-music"};
  for (const [name,key] of Object.entries(cases)) assert.equal(externalServiceKey(name),key,name);
  assert.equal(externalServiceKey("unknown service"), undefined);
});

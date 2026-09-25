import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./config.js";
import { ExternalMusicReceiver } from "./external-music.js";

function receiver(grace = 10) {
  const config = loadConfig();
  config.external_music.enabled = true;
  config.external_music.track_transition_grace_seconds = grace;
  config.external_music.tokens = {
    first: { user: "listener", source: "spotify" },
    second: { user: "other", source: "spotify" },
    apple: { user: "listener", source: "apple_music" }
  };
  return new ExternalMusicReceiver(config);
}
function event(track: string, listenType = "playing_now") {
  return { listen_type: listenType, payload: [{ track_metadata: {
    track_name: track, artist_name: "Artist", additional_info: { duration: 300 }
  } }] };
}
test("skipping tracks immediately replaces the previous Spotify track", () => {
  const value = receiver();
  value.receiveSubmitListens("first", event("Old track"));
  const old = value.activePlaybacks("listener")[0]!;
  value.receiveSubmitListens("first", event("Next track"));
  const active = value.activePlaybacks("listener");
  assert.equal(active.length, 1);
  assert.equal(active[0]!.title, "Next track");
  assert.notEqual(active[0]!.signature, old.signature);
  value.receiveSubmitListens("first", event("Next track"));
  assert.equal(value.activePlaybacks("listener").length, 1);
});
test("replacement preserves other users and music services", () => {
  const value = receiver();
  value.receiveSubmitListens("first", event("Old track"));
  value.receiveSubmitListens("second", event("Other listener"));
  value.receiveSubmitListens("apple", event("Apple track"));
  value.receiveSubmitListens("first", event("Next track"));
  assert.deepEqual(value.activePlaybacks("listener").map(s => s.title).sort(), ["Apple track", "Next track"]);
  assert.equal(value.activePlaybacks("other")[0]!.title, "Other listener");
});
test("completed scrobbles and invalid updates do not replace current playback", () => {
  const value = receiver();
  value.receiveSubmitListens("first", event("Current track"));
  value.receiveSubmitListens("first", event("Old track", "single"));
  value.receiveSubmitListens("first", event(""));
  value.receiveSubmitListens("invalid", event("Invalid track"));
  assert.deepEqual(value.activePlaybacks("listener").map(s => s.title), ["Current track"]);
});

test("track-end grace bridges a delayed update but expires when playback stops", (t) => {
  t.mock.method(Date, "now", () => 1_000_000);
  const value = receiver();
  value.receiveSubmitListens("first", event("Old track"));
  t.mock.method(Date, "now", () => 1_303_000);
  assert.equal(value.activePlaybacks("listener")[0]!.title, "Old track");
  value.receiveSubmitListens("first", event("Next track"));
  assert.deepEqual(value.activePlaybacks("listener").map(s => s.title), ["Next track"]);
  t.mock.method(Date, "now", () => 1_613_000);
  assert.equal(value.activePlaybacks("listener").length, 0);
});
test("track-end grace can be disabled", (t) => {
  t.mock.method(Date, "now", () => 1_000_000);
  const value = receiver(0);
  value.receiveSubmitListens("first", event("Track"));
  t.mock.method(Date, "now", () => 1_300_000);
  assert.equal(value.activePlaybacks("listener").length, 0);
});

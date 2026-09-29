import test from "node:test";
import assert from "node:assert/strict";
import { holdMissingLiveTv } from "./live-tv-grace.js";

test("Live TV survives a channel-switch gap for exactly fifteen seconds", () => {
  assert.equal(holdMissingLiveTv(1000, 1000, 0), true);
  assert.equal(holdMissingLiveTv(1000, 15999, 0), true);
  assert.equal(holdMissingLiveTv(1000, 16000, 0), false);
  assert.equal(holdMissingLiveTv(1000, 20000, 0), false);
});
test("fresh playback immediately supersedes a missing Live TV channel", () => {
  assert.equal(holdMissingLiveTv(1000, 1001, 1), false);
});

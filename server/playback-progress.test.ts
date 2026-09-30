import test from "node:test";
import assert from "node:assert/strict";
import { updatePlaybackProgress, type PlaybackProgress } from "./playback-progress.js";
const ticks = (seconds: number) => seconds * 10_000_000;

for (const span of [1, 2, 5]) test(`Jellyfin repeating a ${span}-second range expires and stays inactive`, () => {
  let progress: PlaybackProgress | undefined;
  for (let second = 0; second < 90; second++) {
    progress = updatePlaybackProgress(progress, ticks(2921 + second % (span + 1)), second * 1000);
    if (second >= span + 15) assert.ok(second * 1000 - progress.lastAdvanceAt >= 15_000);
  }
  const resumed = updatePlaybackProgress(progress, ticks(2921 + span + 1), 90_000);
  assert.equal(resumed.lastAdvanceAt, 90_000);
  assert.equal(resumed.confirmed, true);
});
test("normal playback, short rewind, and deliberate long rewind stay usable", () => {
  let progress = updatePlaybackProgress(undefined, ticks(100), 0);
  for (let second = 1; second <= 20; second++) progress = updatePlaybackProgress(progress, ticks(100 + second), second * 1000);
  assert.equal(progress.lastAdvanceAt, 20_000);
  progress = updatePlaybackProgress(progress, ticks(117), 21_000);
  assert.equal(progress.highWaterTicks, ticks(120));
  progress = updatePlaybackProgress(progress, ticks(121), 25_000);
  assert.equal(progress.lastAdvanceAt, 25_000);
  progress = updatePlaybackProgress(progress, ticks(30), 26_000);
  assert.equal(progress.highWaterTicks, ticks(30));
  assert.equal(progress.lastAdvanceAt, 26_000);
});
test("a fixed position never confirms playback and a new item resets the baseline", () => {
  const initial = updatePlaybackProgress(undefined, ticks(90), 1000);
  assert.equal(updatePlaybackProgress(initial, ticks(90), 60_000).confirmed, false);
  assert.equal(updatePlaybackProgress(undefined, ticks(0), 61_000).lastAdvanceAt, 61_000);
});

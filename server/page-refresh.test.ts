import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPageRefresh } from "../src/page-refresh.js";

test("refresh today before the scheduled time", () => {
  assert.equal(nextPageRefresh(new Date(2026, 8, 24, 5, 59), "06:00").getTime(), new Date(2026, 8, 24, 6).getTime());
});
test("at or after the deadline, schedule tomorrow to prevent reload loops", () => {
  for (const hour of [6, 7, 23]) {
    assert.equal(nextPageRefresh(new Date(2026, 8, 24, hour), "06:00").getTime(), new Date(2026, 8, 25, 6).getTime());
  }
});
test("midnight rolls into the next month", () => {
  assert.equal(nextPageRefresh(new Date(2026, 8, 30, 23, 59), "00:00").getTime(), new Date(2026, 9, 1).getTime());
});

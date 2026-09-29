import test from "node:test";
import assert from "node:assert/strict";
import {cycleLiveTvInfo} from "../src/live-tv-info.js";
test("Live TV info cycles channel, label, both, neither and back",()=>{
  let prefs={live_tv_channel:true,live_tv_label:false};
  for(const expected of [[false,true],[true,true],[false,false],[true,false]]){
    prefs=cycleLiveTvInfo(prefs);assert.deepEqual([prefs.live_tv_channel,prefs.live_tv_label],expected);
  }
});

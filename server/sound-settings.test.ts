import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {loadConfig} from "./config.js";
import {soundSourceAllowed} from "../src/sound-sources.js";

test("sound source defaults, legacy switches, explicit precedence and configurable inactivity",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"sound-settings-"));const old=process.env.MEDIAWALL_CONFIG;process.env.MEDIAWALL_CONFIG=path.join(root,"config.yml");
 const read=(sounds:string)=>{fs.writeFileSync(process.env.MEDIAWALL_CONFIG!,`spaces:\n  wall:\n    now_playing:\n      sounds: ${sounds}\n`);return loadConfig().spaces.wall.now_playing.sounds;};
 try {
  assert.deepEqual(read('{}').sources,{jellyfin:true,subsonic:true,external_music:true});
  assert.equal(read('{}').session_start.retrigger_after_inactive_seconds,30);
  for(const key of ['jellyfin','subsonic','external_music']){
   assert.equal(read(`{${key}: false}`).sources[key as 'jellyfin'],false);
   assert.equal(read(`{${key}: true, sources: {${key}: false}}`).sources[key as 'jellyfin'],false);
   assert.equal(read(`{${key}: false, sources: {${key}: true}}`).sources[key as 'jellyfin'],true);
  }
  assert.equal(read('{navidrome: false}').sources.subsonic,false);
  for(const seconds of [0,12,90])assert.equal(read(`{session_start: {retrigger_after_inactive_seconds: ${seconds}}}`).session_start.retrigger_after_inactive_seconds,seconds);
  assert.throws(()=>read('{session_start: {retrigger_after_inactive_seconds: -1}}'));
  const sounds=read('{sources: {external_music: false}}');
  for(const source of ['spotify','apple_music','external_music'])assert.equal(soundSourceAllowed(source,sounds),false);
  for(const source of ['jellyfin','subsonic'])assert.equal(soundSourceAllowed(source,sounds),true);
 }finally{if(old===undefined)delete process.env.MEDIAWALL_CONFIG;else process.env.MEDIAWALL_CONFIG=old;fs.rmSync(root,{recursive:true,force:true});}
});

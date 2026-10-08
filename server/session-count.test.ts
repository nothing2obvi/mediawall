import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {SessionCount} from "../src/session-count.js";
import {normalizeSessionCount} from "./session-count-config.js";
import {loadConfig} from "./config.js";

test("session count canonical modes, hidden legacy behavior and warnings",()=>{
 const warnings:string[]=[];
 const normalize=(count:any)=>normalizeSessionCount({spaces:{wall:{now_playing:{session_count:count}}}},s=>warnings.push(s)).spaces.wall.now_playing.session_count;
 assert.deepEqual(normalize({enabled:true,font_size:17}),{mode:"small",font_size:17});
 assert.deepEqual(normalize({enabled:false}),{mode:false});
 assert.deepEqual(normalize({enabled:false,mode:"large"}),{mode:"large"});
 assert.deepEqual(normalize({enabled:true,mode:false}),{mode:false});
 assert.equal(warnings.length,4);normalize({mode:"small"});assert.equal(warnings.length,4);
 assert.match(warnings[0],/deprecated but still supported/);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"counter-config-"));const old=process.env.MEDIAWALL_CONFIG;process.env.MEDIAWALL_CONFIG=path.join(root,"config.yml");
 try {
  for(const body of ['spaces: {wall: {}}','spaces: {wall: {now_playing: {}}}','spaces: {wall: {now_playing: {session_count: {}}}}']){
   fs.writeFileSync(process.env.MEDIAWALL_CONFIG,body);const cfg=loadConfig();assert.equal(cfg.spaces.wall.now_playing.session_count.mode,'small');assert.equal(cfg.spaces.wall.now_playing.session_cleanup.paused_after_seconds,5);assert.equal(cfg.avatars.prefer_custom_avatars,false);
  }
  fs.writeFileSync(process.env.MEDIAWALL_CONFIG,'avatars: {prefer_custom_avatars: true}\nusers: {bob: {custom_avatar: bob.webp}}\nspaces: {wall: {now_playing: {session_count: {mode: large}, session_cleanup: {paused_after_seconds: 15}}}}');
  const cfg=loadConfig();assert.equal(cfg.avatars.prefer_custom_avatars,true);assert.equal(cfg.users.bob.custom_avatar,'bob.webp');assert.equal(cfg.spaces.wall.now_playing.session_count.mode,'large');assert.equal(cfg.spaces.wall.now_playing.session_cleanup.paused_after_seconds,15);
 }finally{if(old===undefined)delete process.env.MEDIAWALL_CONFIG;else process.env.MEDIAWALL_CONFIG=old;fs.rmSync(root,{recursive:true,force:true});}
});

test("small counter keeps the existing class and text; large uses the same centered counter slot",()=>{
 const render=(mode:'small'|'large'|false)=>renderToStaticMarkup(createElement(SessionCount,{mode,position:2,total:4}));
 assert.equal(render('small'),'<div class="session-timer-count">2 of 4</div>');
 assert.equal(render('large'),'<div class="session-timer-count session-timer-count-large">2</div>');
 assert.equal(render(false),'');
});

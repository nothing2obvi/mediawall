import test from "node:test";
import assert from "node:assert/strict";
import {loadConfig} from "./config.js";
import {SubsonicClient} from "./subsonic.js";

test("Subsonic retains Navidrome authentication, playback states, identities, and cover lookup",async t=>{
 const config=loadConfig();config.subsonic.enabled=true;config.subsonic.url="http://subsonic.test";config.subsonic.artwork.local_files=false;config.subsonic.artwork.jellyfin_fallback=false;
 const user={name:"bob",subsonic_user:"bob-subsonic",subsonic_password:"password"};config.users={bob:user};
 const display=structuredClone(Object.values(config.spaces)[0]);display.users=[user];display.source_user="bob-subsonic";
 let entry:any={id:"track",username:"bob-subsonic",title:"Song",artist:"Artist",album:"Album",coverArt:"cover",minutesAgo:0,positionMs:5000,playerId:"player"};
 t.mock.method(globalThis,"fetch",async(input:unknown)=>{
  const url=new URL(String(input));assert.equal(url.searchParams.get("u"),"bob-subsonic");assert.equal(url.searchParams.get("p"),"password");assert.equal(url.searchParams.get("v"),"1.16.1");assert.equal(url.searchParams.get("c"),"mediawall");
  if(url.pathname.endsWith("getCoverArt.view"))return new Response("image");
  assert.equal(url.searchParams.get("f"),"json");
  const data=url.pathname.endsWith("getNowPlaying.view")?{nowPlaying:{entry}}:url.pathname.endsWith("search3.view")?{searchResult3:{album:[{name:"Album",artist:"Artist",coverArt:"cover"}]}}:{};
  return Response.json({"subsonic-response":{status:"ok",...data}});
 });
 const client=new SubsonicClient(config,{} as any);assert.equal(await client.reachable(),true);
 const playing=(await client.activePlaybacks(display))[0];assert.equal(playing.source,"subsonic");assert.equal(playing.user,"bob-subsonic");assert.equal(playing.playing,true);assert.equal(playing.stale,false);assert.equal(playing.playbackPositionTicks,50000000);assert.equal(playing.albumArtUrl,"/api/subsonic/cover/cover");
 entry={...entry,state:"paused"};const paused=(await client.activePlaybacks(display))[0];assert.equal(paused.paused,true);assert.equal(paused.sessionKey,playing.sessionKey);
 entry={...entry,state:"playing"};assert.equal((await client.activePlaybacks(display))[0].paused,false);
 entry={...entry,state:"stopped"};assert.equal((await client.activePlaybacks(display))[0].playing,false);
 entry={...entry,state:undefined,minutesAgo:10};assert.equal((await client.activePlaybacks(display))[0].stale,true);
 assert.equal(await client.albumCoverForName("Album","Artist"),"/api/subsonic/cover/cover");assert.equal(await (await client.proxyCoverArt("cover")).text(),"image");
});

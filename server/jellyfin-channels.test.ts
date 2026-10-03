import test from "node:test";
import assert from "node:assert/strict";
import {loadConfig} from "./config.js";
import {JellyfinClient} from "./jellyfin.js";

for (const mediaType of ["Video","Audio"]) test(`Jellyfin ${mediaType} live channel remains a session with centered channel art and text`, async t => {
  const cfg=loadConfig(); cfg.jellyfin.url="http://jellyfin.test";cfg.jellyfin.api_key="test";
  const display=Object.values(cfg.spaces)[0];display.source_user="viewer";
  t.mock.method(globalThis,"fetch",async(input:unknown)=>new URL(String(input)).pathname==="/Sessions"
    ? Response.json([{Id:"session",UserName:"viewer",NowPlayingItem:{Id:"channel",Type:"TvChannel",MediaType:mediaType,Name:"News",ImageTags:{Primary:"channel-image",Logo:"unused"}},PlayState:{IsPaused:false,PositionTicks:123}}])
    : Response.json([]));
  const [playing]=await new JellyfinClient(cfg).activePlaybacks(display);
  assert.equal(playing.playing,true);assert.equal(playing.logoText,"News");assert.equal(playing.title,"News");
  assert.equal(playing.artwork?.mediaType,"TvChannel");assert.match(playing.artwork!.backdropUrl!,/channel\/Primary\?tag=channel-image/);
  assert.equal(playing.artwork?.logoUrl,undefined);assert.equal(playing.artwork?.imageType,"Primary");assert.equal(playing.playbackPositionTicks,123);
});
test("live programs resolve channel imagery and keep channel session identity across programs", async t=>{
  const cfg=loadConfig();cfg.jellyfin.url="http://jellyfin.test";cfg.jellyfin.api_key="test";
  const display=Object.values(cfg.spaces)[0];display.source_user="viewer";let program="one";
  t.mock.method(globalThis,"fetch",async(input:unknown)=>{
    const pathname=new URL(String(input)).pathname;
    if(pathname==="/Sessions")return Response.json([{Id:"session",UserName:"viewer",NowPlayingItem:{Id:program,Type:"Program",Name:"Show",ChannelId:"channel"},PlayState:{IsPaused:true}}]);
    if(pathname==="/LiveTv/Channels/channel")return Response.json({Id:"channel",Type:"TvChannel",Name:"Station",ImageTags:{Primary:"station"}});
    return Response.json([]);
  });
  const client=new JellyfinClient(cfg);const [first]=await client.activePlaybacks(display);program="two";const [second]=await client.activePlaybacks(display);
  assert.equal(first.title,"Station");assert.equal(first.paused,true);assert.equal(first.sessionKey,second.sessionKey);assert.equal(first.signature,second.signature);
  assert.match(first.artwork!.backdropUrl!,/channel\/Primary/);assert.equal(first.artwork?.logoUrl,undefined);
});
test("a live channel without an image still produces a text-only session",async t=>{
  const cfg=loadConfig();cfg.jellyfin.url="http://jellyfin.test";cfg.jellyfin.api_key="test";
  const display=Object.values(cfg.spaces)[0];display.source_user="viewer";
  t.mock.method(globalThis,"fetch",async(input:unknown)=>new URL(String(input)).pathname==="/Sessions" ? Response.json([{Id:"s",UserName:"viewer",NowPlayingItem:{Id:"channel",Type:"TvChannel",Name:"Radio"}}]) : new Response("",{status:404}));
  const [playing]=await new JellyfinClient(cfg).activePlaybacks(display);
  assert.equal(playing.playing,true);assert.equal(playing.logoText,"Radio");assert.equal(playing.artwork?.backdropUrl,undefined);
  assert.equal(display.display.live_tv.channel_image_size,713);
});

test("music videos use their Music Videos artist folder instead of the Music library artist", async t => {
  const cfg=loadConfig();cfg.jellyfin.url="http://jellyfin.test";cfg.jellyfin.api_key="test";
  const display=Object.values(cfg.spaces)[0];display.source_user="viewer";
  t.mock.method(globalThis,"fetch",async(input:unknown)=>{
    const pathname=new URL(String(input)).pathname;
    if(pathname==="/Sessions")return Response.json([{Id:"session",UserName:"viewer",NowPlayingItem:{Id:"video",Type:"MusicVideo",MediaType:"Video",Name:"Song",IndexNumber:3,ParentIndexNumber:1}}]);
    if(pathname==="/Items/video")return Response.json({Id:"video",Type:"MusicVideo",Name:"Song",ParentId:"video-artist-folder",Artists:["Artist"],ArtistItems:[{Id:"music-library-artist",Name:"Artist"}],AlbumArtist:"Album Artist",Album:"Album",BackdropImageTags:["backdrop-one","backdrop-two"],ImageTags:{Primary:"video-poster",Logo:"video-logo"}});
    if(pathname==="/Items/music-library-artist")throw new Error("Must not use Music library artist");
    if(pathname==="/Items/video-artist-folder")return Response.json({Id:"video-artist-folder",Type:"Folder",Name:"Artist",BackdropImageTags:["artist-one","artist-two"],ImageTags:{Logo:"artist-logo"}});
    return Response.json([]);
  });
  const [playing]=await new JellyfinClient(cfg).activePlaybacks(display);
  assert.equal(playing.artwork?.mediaType,"MusicVideo");
  assert.equal(playing.artwork?.backdropCount,2);
  assert.deepEqual(playing.artwork?.backdropTags,["artist-one","artist-two"]);
  assert.equal(playing.artwork?.itemId,"video-artist-folder");
  assert.match(playing.artwork!.backdropUrl!,/video-artist-folder\/Backdrop\/0\?tag=artist-one/);
  assert.match(playing.artwork!.logoUrl!,/video-artist-folder\/Logo/);
  assert.equal(playing.episodeNumber,undefined);assert.equal(playing.seasonNumber,undefined);
  assert.equal(playing.album,"Album");assert.equal(playing.artist,"Artist");assert.equal(playing.albumArtist,"Album Artist");
  assert.equal(playing.albumArtUrl,undefined,"video poster must not be used as an album cover");
});

test("music video inherited folder tags work when Jellyfin item detail requests return 400", async t => {
  const cfg=loadConfig();cfg.jellyfin.url="http://jellyfin.test";cfg.jellyfin.api_key="test";
  const display=Object.values(cfg.spaces)[0];display.source_user="viewer";
  t.mock.method(globalThis,"fetch",async(input:unknown)=>new URL(String(input)).pathname==="/Sessions"
    ? Response.json([{Id:"session",UserName:"viewer",NowPlayingItem:{Id:"video",Type:"MusicVideo",Name:"Song",Artists:["Artist"],ParentId:"video-folder",ParentBackdropItemId:"video-folder",ParentBackdropImageTags:["one","two","three"],ParentLogoItemId:"video-folder",ParentLogoImageTag:"logo",Album:"Album"}}])
    : new Response("",{status:400}));
  const [playing]=await new JellyfinClient(cfg).activePlaybacks(display);
  assert.equal(playing.artwork?.itemId,"video-folder");assert.equal(playing.artwork?.backdropCount,3);
  assert.match(playing.artwork!.backdropUrl!,/video-folder\/Backdrop\/0\?tag=one/);
  assert.match(playing.artwork!.logoUrl!,/video-folder\/Logo\?tag=logo/);
  assert.equal(playing.album,"Album");
});

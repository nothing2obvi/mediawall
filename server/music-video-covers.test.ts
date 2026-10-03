import test from "node:test";
import assert from "node:assert/strict";
import {loadConfig} from "./config.js";
import {JellyfinClient} from "./jellyfin.js";

for (const [title, expected] of [["Song","plain"],["Song (Performance ver.)","plain"],["Song (Performance ver.) (4K Remaster)","plain"],["Song (This Remix)","remix"],["  SONG  ","plain"],["Unknown","none"]]) {
  test(`music-video album lookup: ${title}`, async t => {
    const config=loadConfig();config.jellyfin.url="http://jellyfin.test";config.jellyfin.api_key="test";
    const roots:string[]=[];
    t.mock.method(globalThis,"fetch",async(input:unknown)=>{
      const url=new URL(String(input));
      if(url.pathname==="/Users")return Response.json([{Id:"u",Name:"bob"}]);
      if(url.pathname.endsWith("/Views"))return Response.json({Items:[{Id:"a",Name:"Records",CollectionType:"music"},{Id:"b",Name:"More records",CollectionType:"music"},{Id:"v",Name:"Music",CollectionType:"musicvideos"}]});
      if(url.pathname==="/Items") {
        const root=url.searchParams.get("ParentId")!; roots.push(root);
        const tracks=root==="a" ? [{Id:"wrong",Name:"Song",Artists:["Other Artist"],AlbumId:"wrong",AlbumPrimaryImageTag:"tag"},{Id:"plain",Name:"Song",Artists:["ARTIST"],AlbumId:"plain",AlbumPrimaryImageTag:"tag"}]
          : [{Id:"remix",Name:"Song (This Remix)",Artists:["Artist"],AlbumId:"remix",AlbumPrimaryImageTag:"tag"}];
        return Response.json({Items:tracks,TotalRecordCount:tracks.length});
      }
      throw new Error(`Unexpected request ${url.pathname}`);
    });
    const result=await new JellyfinClient(config).albumCoverForMusicVideo(title,[" artist "],"bob");
    assert.deepEqual(roots,["a","b"]);
    if(expected==="none")assert.equal(result,undefined);else assert.equal(result,`/api/jellyfin/image/${expected}/Primary?tag=tag`);
  });
}

test("canonical artist and closest title win deterministically over aliases and shorter versions",async t=>{
  const config=loadConfig();config.jellyfin.url="http://jellyfin.test";config.jellyfin.api_key="test";
  t.mock.method(globalThis,"fetch",async(input:unknown)=>{
    const url=new URL(String(input));
    if(url.pathname==="/Users")return Response.json([{Id:"u",Name:"bob"}]);
    if(url.pathname.endsWith("/Views"))return Response.json({Items:[{Id:"music",CollectionType:"music"}]});
    return Response.json({Items:[
      {Id:"a",Name:"Song",Artists:["Artist"],AlbumId:"plain",AlbumPrimaryImageTag:"tag"},
      {Id:"b",Name:"Song (Remix)",Artists:["Alias"],AlbumId:"alias",AlbumPrimaryImageTag:"tag"},
      {Id:"c",Name:"Song (Remix)",Artists:["Artist"],AlbumId:"canonical",AlbumPrimaryImageTag:"tag"}
    ]});
  });
  assert.match((await new JellyfinClient(config).albumCoverForMusicVideo("Song (Remix) (Video)",["Artist","Alias"],"bob"))!,/canonical\/Primary/);
});

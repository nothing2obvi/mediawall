import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "./config.js";
import { ExternalArtworkResolver, artistLookupNames, artworkArtistFor } from "./external-artwork.js";
import { ExternalMusicReceiver } from "./external-music.js";
import { SourceAvatarStore } from "./source-avatars.js";
import type { AppConfig, ArtworkRef, NowPlayingState } from "./types.js";

const mbid = "11111111-1111-1111-1111-111111111111";
const localArtwork: ArtworkRef = {
  source: "jellyfin",
  itemId: "local-artist",
  title: "Artist A",
  mediaType: "MusicArtist",
  imageType: "Backdrop",
  imageIndex: 0,
  backdropUrl: "/local/backdrop.jpg",
  logoUrl: "/local/logo.png",
  backdropCount: 1
};

function state(overrides: Partial<NowPlayingState> = {}): NowPlayingState {
  return {
    source: "spotify",
    user: "primary",
    playing: true,
    paused: false,
    title: "Example Song",
    artist: "Artist A & Artist B",
    artists: ["Artist A", "Artist B"],
    albumArtist: "Artist A",
    externalIds: { artistMbids: [mbid] },
    ...overrides
  };
}

function config(root: string, preference: "local" | "fetched", backdropCount = 3): AppConfig {
  const value = loadConfig();
  value.library.directory = path.join(root,"library");
  value.external_music.artwork = {
    preference,
    minimum_backdrop_width: 1920,
    minimum_backdrop_height: 1080,
    backdrop_count: backdropCount,
    album_cache_directory: root,
    album_cache_ttl_days: 30
  };
  value.image_providers = {
    musicbrainz: { enabled: false, contact: "" },
    fanart: { enabled: true, api_key: "test-key" },
    theaudiodb: { enabled: false, api_key: "" },
    cover_art_archive: { enabled: false }
  };
  return value;
}

function localClients(artwork: ArtworkRef | null = localArtwork, albumCover?: string) {
  return {
    jellyfin: {
      artworkForArtistName: async () => artwork ?? undefined,
      albumCoverForMusicVideo: async () => undefined,
      albumCoverForName: async () => albumCover
    },
    subsonic: {
      localArtistArtworks: () => [],
      albumCoverForName: async () => undefined
    }
  };
}

function png(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function mockFanart(backdrops: Array<{ name: string; width: number; height: number }>, logo = true) {
  let providerCalls = 0;
  let imageCalls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("webservice.fanart.tv")) {
      providerCalls += 1;
      return Response.json({
        hdmusiclogo: logo ? [{ url: "https://images.test/logo.png", likes: "8" }] : [],
        artistbackground: backdrops.map((item, index) => ({ url: `https://images.test/${item.name}.png`, likes: String(20 - index) }))
      });
    }
    const item = backdrops.find((candidate) => url.endsWith(`/${candidate.name}.png`));
    if (url.endsWith("/logo.png")) {
      imageCalls += 1;
      return new Response(png(1000, 400), { headers: { "content-type": "image/png" } });
    }
    if (item) {
      imageCalls += 1;
      return new Response(png(item.width, item.height), { headers: { "content-type": "image/png" } });
    }
    return new Response(null, { status: 404 });
  };
  return {
    calls: () => ({ providerCalls, imageCalls }),
    restore: () => { globalThis.fetch = original; }
  };
}

async function fixture(preference: "local" | "fetched", local: ArtworkRef | null = localArtwork, backdropCount = 3) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "mediawall-artwork-"));
  const clients = localClients(local);
  const resolver = new ExternalArtworkResolver(
    config(root, preference, backdropCount),
    clients.jellyfin as never,
    clients.subsonic as never,
    root
  );
  return { root, resolver };
}

test("artwork artist uses album artist and rejects generic album artists", () => {
  assert.equal(artworkArtistFor(state()), "Artist A");
  assert.equal(artworkArtistFor(state({ albumArtist: "Various Artists" })), "Artist A");
});

test("artist aliases are bidirectional, Unicode-safe, case tolerant, and loop safe", () => {
  const aliases = {
    "  a子  ": [" ako ", "AKO"],
    "Ako": ["A-Ko"],
    "A-Ko": ["a子"]
  };
  assert.deepEqual(artistLookupNames("a子", aliases), ["a子", "ako", "A-Ko"]);
  assert.deepEqual(artistLookupNames("  AKO  ", aliases), ["AKO", "a子", "A-Ko"]);
});

for (const [encountered, resolvedName] of [["a子", "ako"], ["ako", "a子"]] as const) {
  test(`artist alias lookup resolves ${encountered} through ${resolvedName} without changing display identity`, async (t) => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "mediawall-artwork-alias-"));
    t.after(() => fsp.rm(root, { recursive: true, force: true }));
    const value = config(root, "local");
    value.aliases.artists = { "a子": ["ako"] };
    value.image_providers = {
      musicbrainz: { enabled: false, contact: "" },
      fanart: { enabled: false, api_key: "" },
      theaudiodb: { enabled: false, api_key: "" },
      cover_art_archive: { enabled: false }
    };
    const lookups: string[] = [];
    const jellyfin = {
      artworkForArtistName: async (name: string) => {
        lookups.push(name);
        return name === resolvedName ? { ...localArtwork, title: resolvedName } : undefined;
      },
      albumCoverForName: async () => undefined
    };
    const subsonic = { localArtistArtworks: () => [], albumCoverForName: async () => undefined };
    const resolver = new ExternalArtworkResolver(value, jellyfin as never, subsonic as never, root);
    const resolved = await resolver.resolveExternal(state({
      artist: encountered,
      artists: [encountered],
      albumArtist: encountered,
      externalIds: undefined
    }));
    assert.deepEqual(lookups, [encountered, resolvedName]);
    assert.equal(resolved.artist, encountered);
    assert.equal(resolved.artworkArtist, encountered);
    assert.equal(resolved.artwork?.title, resolvedName);
  });
}

test("external sessions preserve album-artist identifiers for canonical artwork lookup", () => {
  const value = loadConfig();
  value.external_music.enabled = true;
  value.external_music.tokens = { test: { user: "primary", source: "spotify" } };
  const receiver = new ExternalMusicReceiver(value);
  const result = receiver.receiveSubmitListens("test", {
    listen_type: "playing_now",
    payload: [{
      track_metadata: {
        artist_name: "Artist A & Artist B",
        track_name: "Example Song",
        additional_info: {
          albumartist: "Artist A",
          album_artist_mbids: [mbid],
          artist_mbids: ["22222222-2222-2222-2222-222222222222"]
        }
      }
    }]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(receiver.activePlaybacks("primary")[0]?.externalIds?.albumArtistMbids, [mbid]);
});

test("1. local preference uses an existing Jellyfin/Subsonic artist", async (t) => {
  const item = await fixture("local");
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([{ name: "one", width: 2400, height: 1400 }]);
  t.after(mock.restore);
  const resolved = await item.resolver.resolveExternal(state());
  assert.equal(resolved.artwork?.source, "jellyfin");
  assert.equal(mock.calls().providerCalls, 0);
});

test("2. fetched preference chooses available external artwork over local artwork", async (t) => {
  const item = await fixture("fetched");
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([{ name: "one", width: 2400, height: 1400 }]);
  t.after(mock.restore);
  const resolved = await item.resolver.resolveExternal(state());
  assert.equal(resolved.artwork?.source, "fetched");
});

test("3. fetched preference falls back to local artwork when providers find nothing", async (t) => {
  const item = await fixture("fetched");
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([], false);
  t.after(mock.restore);
  const resolved = await item.resolver.resolveExternal(state());
  assert.equal(resolved.artwork?.source, "jellyfin");
});

test("4. a non-local artist can resolve entirely through external providers", async (t) => {
  const item = await fixture("local", null);
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([{ name: "one", width: 2400, height: 1400 }]);
  t.after(mock.restore);
  const resolved = await item.resolver.resolveExternal(state());
  assert.equal(resolved.artwork?.source, "fetched");
});

test("5. a logo and three qualifying backdrops are retained", async (t) => {
  const item = await fixture("fetched", null, 3);
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([
    { name: "one", width: 2400, height: 1400 },
    { name: "two", width: 2200, height: 1200 },
    { name: "three", width: 1920, height: 1080 },
    { name: "four", width: 3000, height: 1600 }
  ]);
  t.after(mock.restore);
  const resolved = await item.resolver.resolveExternal(state());
  assert.ok(resolved.artwork?.logoUrl);
  assert.equal(resolved.artwork?.backdropCount, 3);
});

test("6. fewer qualifying backdrops than requested still produce artwork", async (t) => {
  const item = await fixture("fetched", null, 3);
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([
    { name: "one", width: 2400, height: 1400 },
    { name: "two", width: 2200, height: 1200 }
  ]);
  t.after(mock.restore);
  const resolved = await item.resolver.resolveExternal(state());
  assert.equal(resolved.artwork?.backdropCount, 2);
});

test("7. backdrops below the configured minimum are rejected", async (t) => {
  const item = await fixture("fetched", null);
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([{ name: "small", width: 1280, height: 720 }], false);
  t.after(mock.restore);
  const resolved = await item.resolver.resolveExternal(state());
  assert.equal(resolved.artwork, undefined);
});

test("8. album artwork remains usable when no artist backdrop exists", async (t) => {
  const item = await fixture("fetched", null);
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([], false);
  t.after(mock.restore);
  const resolved = await item.resolver.resolveExternal(state({ album: "Example Album", albumArtUrl: "https://spotify.test/cover.jpg" }));
  assert.equal(resolved.artwork, undefined);
  assert.equal(resolved.albumArtUrl, "https://spotify.test/cover.jpg");
});

test("9. missing artwork never prevents the external session from resolving", async (t) => {
  const item = await fixture("fetched", null);
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([], false);
  t.after(mock.restore);
  const resolved = await item.resolver.resolveExternal(state());
  assert.equal(resolved.playing, true);
  assert.equal(resolved.title, "Example Song");
  assert.equal(resolved.logoText, "Artist A");
});

test("10. repeat playback reuses the MediaWall cache without provider requests", async (t) => {
  const item = await fixture("fetched", null);
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([{ name: "one", width: 2400, height: 1400 }]);
  t.after(mock.restore);
  await item.resolver.resolveExternal(state());
  const firstCalls = mock.calls();
  await item.resolver.resolveExternal(state());
  assert.deepEqual(mock.calls(), firstCalls);
});

test("adding a provider credential invalidates an earlier empty cache entry", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "mediawall-artwork-credentials-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const clients = localClients(null);
  const withoutKey = config(root, "fetched");
  withoutKey.image_providers.fanart.api_key = "";
  const first = new ExternalArtworkResolver(withoutKey, clients.jellyfin as never, clients.subsonic as never, root);
  assert.equal((await first.resolveExternal(state())).artwork, undefined);

  const mock = mockFanart([{ name: "one", width: 2400, height: 1400 }]);
  t.after(mock.restore);
  const withKey = new ExternalArtworkResolver(config(root, "fetched"), clients.jellyfin as never, clients.subsonic as never, root);
  assert.equal((await withKey.resolveExternal(state())).artwork?.source, "fetched");
  assert.equal(mock.calls().providerCalls, 1);
});

test("11. switching preference changes the selected artwork source", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "mediawall-artwork-switch-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const clients = localClients();
  const mock = mockFanart([{ name: "one", width: 2400, height: 1400 }]);
  t.after(mock.restore);
  const local = new ExternalArtworkResolver(config(root, "local"), clients.jellyfin as never, clients.subsonic as never, root);
  const fetched = new ExternalArtworkResolver(config(root, "fetched"), clients.jellyfin as never, clients.subsonic as never, root);
  assert.equal((await local.resolveExternal(state())).artwork?.source, "jellyfin");
  assert.equal((await fetched.resolveExternal(state())).artwork?.source, "fetched");
});

test("Spotify source avatars support common formats and case-insensitive username matching", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "mediawall-avatar-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "app/avatars/spotify");
  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(path.join(directory, "Primary.WeBp"), "avatar");
  const avatars = new SourceAvatarStore(root);
  assert.equal(path.basename(avatars.avatarPath("spotify", "primary") ?? ""), "Primary.WeBp");
  assert.equal(avatars.avatarPath("spotify", "missing"), undefined);
  assert.equal(avatars.avatarPath("subsonic", "primary"), undefined);
});

test("Jellyfin avatar fallback only returns URLs for users with profile images", async () => {
  const value = loadConfig();
  const { JellyfinClient } = await import("./jellyfin.js");
  const jellyfin = new JellyfinClient(value);
  (jellyfin as unknown as { usersCache: unknown[] }).usersCache = [
    { Id: "with-image", Name: "primary", PrimaryImageTag: "tag" },
    { Id: "without-image", Name: "sam" }
  ];
  const display = Object.values(value.spaces)[0];
  assert.ok(display);
  assert.match((await jellyfin.userAvatarUrl("primary", display!)) ?? "", /with-image/);
  assert.equal(await jellyfin.userAvatarUrl("sam", display!), undefined);
});


test("artwork logs identify providers, counts, rejection reasons, cache reuse and redact URLs", async (t) => {
  const item = await fixture("fetched", null);
  t.after(() => fsp.rm(item.root, { recursive: true, force: true }));
  const mock = mockFanart([{ name: "small", width: 640, height: 480 }, { name: "large", width: 2400, height: 1400 }]);
  t.after(mock.restore);
  const lines: string[] = [];
  t.mock.method(console, "log", (...args: unknown[]) => lines.push(args.join(" ")));
  const resolved = await item.resolver.resolveExternal(state({ albumArtUrl: "https://example.test/cover?token=private-secret" }));
  assert.match(item.resolver.imageSource(resolved.artwork?.backdropUrl), /fanart.tv/);
  assert.ok(lines.some(line => line.includes("saved=2") && line.includes("backdrops=1/3")));
  assert.ok(lines.some(line => line.includes("dimensions=640x480") && line.includes("minimum=1920x1080")));
  await item.resolver.resolveExternal(state({ albumArtUrl: "https://example.test/cover?token=private-secret" }));
  assert.ok(lines.some(line => line.includes("downloaded=0")));
  assert.ok(!lines.join("\n").includes("private-secret"));
  const count = lines.length;
  await item.resolver.resolveExternal(state({ albumArtUrl: "https://example.test/cover?token=private-secret" }));
  assert.equal(lines.length, count, "unchanged polling should not repeat selection logs");
  assert.equal(item.resolver.imageSource("/api/jellyfin/image/123/Backdrop"), "Jellyfin");
  assert.equal(item.resolver.imageSource("/api/subsonic/local-artist/Artist/0"), "local files");
});

test("music-video cover lookup preserves video artwork and tolerates missing metadata or provider failure", async t => {
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),"music-video-cover-"));
  try {
    const clients=localClients();
    const resolver=new ExternalArtworkResolver(config(root,"fetched"),clients.jellyfin as any,clients.subsonic as any,root);
    const video=state({source:"jellyfin",itemId:"video",album:"Album",artwork:{...localArtwork,itemId:"video",mediaType:"MusicVideo",backdropCount:2}});
    const lookup=t.mock.method(resolver as any,"resolveFetchedAlbum",async()=>"/provider/album.jpg");
    const resolved=await resolver.resolveMusicVideo(video);
    assert.equal(resolved.albumArtUrl,"/provider/album.jpg");assert.deepEqual(resolved.artwork,video.artwork);
    await resolver.resolveMusicVideo({...video,album:undefined});
    await resolver.resolveMusicVideo({...video,albumArtUrl:"/jellyfin/album.jpg"});
    assert.equal(lookup.mock.callCount(),1);
    lookup.mock.mockImplementation(async()=>{throw new Error("provider unavailable");});
    const failed=await resolver.resolveMusicVideo(video);
    assert.deepEqual(failed.artwork,video.artwork);assert.equal(failed.albumArtUrl,undefined);
  } finally {await fsp.rm(root,{recursive:true,force:true});}
});

test("music videos configured Jellyfin-only never use external artist artwork", async t => {
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),"music-video-artist-"));
  try {
    const clients=localClients();const cfg=config(root,"local");cfg.jellyfin.music_videos={artwork:{order:["jellyfin"]}};const resolver=new ExternalArtworkResolver(cfg,clients.jellyfin as any,clients.subsonic as any,root);
    t.mock.method(resolver as any,"editedArtist",async()=>undefined);
    const lookup=t.mock.method(resolver as any,"resolveLocalArtist",async()=>({...localArtwork,backdropCount:3}));
    const video=state({source:"jellyfin",artist:"Performing Artist",albumArtist:"Different Album Artist",album:undefined,albumArtUrl:"/existing-cover.jpg",artwork:{...localArtwork,itemId:"video",mediaType:"MusicVideo",backdropUrl:undefined}});
    const resolved=await resolver.resolveMusicVideo(video);
    assert.equal(resolved.artwork?.itemId,"video");assert.equal(resolved.artwork?.backdropUrl,undefined);
    assert.equal(resolved.artwork?.mediaType,"MusicVideo");assert.equal(resolved.albumArtUrl,"/existing-cover.jpg");
    assert.equal(lookup.mock.callCount(),0);
  } finally {await fsp.rm(root,{recursive:true,force:true});}
});

test("music-video Jellyfin track covers win without changing metadata or normal music",async t=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),"music-video-priority-"));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
 const clients=localClients();const cfg=config(root,"fetched");cfg.aliases.artists={"Artist":["Alias"]};
 const matching=t.mock.method(clients.jellyfin,"albumCoverForMusicVideo",async(...args:any[])=>{assert.deepEqual(args[1],["Alias","Artist"]);return "/jellyfin/matched-album";});
 const resolver=new ExternalArtworkResolver(cfg,clients.jellyfin as any,clients.subsonic as any,root);
 const provider=t.mock.method(resolver as any,"resolveAlbumCover",async()=>{throw new Error("Must prefer Jellyfin track");});
 const video=state({source:"jellyfin",title:"Song (Remix)",artist:"Alias",album:"Video metadata album",artwork:{...localArtwork,mediaType:"MusicVideo"}});
 const result=await resolver.resolveMusicVideo(video);assert.equal(result.albumArtUrl,"/jellyfin/matched-album");assert.equal(result.title,video.title);assert.equal(result.artist,video.artist);assert.equal(result.album,video.album);assert.equal(provider.mock.callCount(),0);
 const audio={...video,artwork:localArtwork};assert.equal(await resolver.resolveMusicVideo(audio),audio);assert.equal(matching.mock.callCount(),1);
});

for (const source of ["subsonic", "external"] as const) test(`${source} canonical order fills missing artwork and honors disabled sources`, async t => {
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),"art-order-"));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
  const cfg=config(root,"local");cfg.external_music.artwork.preference=undefined;cfg.external_music.artwork.order=["jellyfin","local","fetched"];
  cfg.subsonic.artwork.order=["jellyfin","local","fetched"];cfg.subsonic.artwork.local_files=true;cfg.subsonic.artwork.jellyfin_fallback=true;
  const clients=localClients();const resolver=new ExternalArtworkResolver(cfg,clients.jellyfin as any,clients.subsonic as any,root);
  const calls:string[]=[];
  t.mock.method(resolver as any,"resolveJellyfinArtist",async()=>{calls.push("jellyfin");return {...localArtwork,logoUrl:undefined};});
  t.mock.method(resolver as any,"resolveSubsonicLocalArtist",async()=>{calls.push("local");return {...localArtwork,backdropUrl:undefined,logoUrl:"/local-file-logo"};});
  t.mock.method(resolver as any,"resolveFetchedArtist",async()=>{calls.push("fetched");return {...localArtwork,backdropUrl:"/fetched",logoUrl:"/fetched-logo"};});
  const run=()=>source === "subsonic" ? resolver.resolveSubsonic(state()) : resolver.resolveExternal(state());
  const merged=await run();assert.equal(merged.artwork?.backdropUrl,localArtwork.backdropUrl);assert.equal(merged.artwork?.logoUrl,"/local-file-logo");assert.deepEqual(calls,["jellyfin","local"]);
  cfg.subsonic.artwork.jellyfin_fallback=false;cfg.subsonic.artwork.local_files=false;calls.length=0;
  assert.equal((await run()).artwork?.backdropUrl,"/fetched");assert.deepEqual(calls,["fetched"]);
  cfg.subsonic.artwork.order=[];cfg.external_music.artwork.order=[];calls.length=0;await run();assert.deepEqual(calls,[]);
});

test("music-video orders supplement Jellyfin art, support fetched-first, and never use local files", async t => {
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),"video-order-"));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
  const cfg=config(root,"local"), clients=localClients();const resolver=new ExternalArtworkResolver(cfg,clients.jellyfin as any,clients.subsonic as any,root);
  t.mock.method(resolver as any,"resolveSubsonicLocalArtist",async()=>{throw Error("no local videos");});
  const fetched=t.mock.method(resolver as any,"resolveFetchedArtist",async()=>({...localArtwork,source:"fetched",backdropUrl:"/fetched",logoUrl:"/fetched-logo"}));
  const cover=t.mock.method(resolver as any,"resolveFetchedAlbum",async(...args:any[])=>{assert.equal(args[3],true);return "/fetched-cover";});
  t.mock.method(clients.jellyfin,"albumCoverForMusicVideo",async()=>"/jellyfin-cover");
  const video=state({source:"jellyfin",artist:"Artist",title:"Song",album:"Album",artwork:{...localArtwork,mediaType:"MusicVideo",logoUrl:undefined}});
  let result=await resolver.resolveMusicVideo(video);
  assert.equal(result.artwork?.backdropUrl,localArtwork.backdropUrl);assert.equal(result.artwork?.logoUrl,"/fetched-logo");assert.equal(result.albumArtUrl,"/jellyfin-cover");assert.equal(cover.mock.callCount(),0);
  assert.equal(result.title,video.title);assert.equal(result.artist,video.artist);assert.equal(result.artwork?.mediaType,"MusicVideo");
  cfg.jellyfin.music_videos={artwork:{order:["fetched","jellyfin"]}};
  result=await resolver.resolveMusicVideo(video);assert.equal(result.artwork?.backdropUrl,"/fetched");assert.equal(result.albumArtUrl,"/fetched-cover");
  cfg.jellyfin.music_videos.artwork.order=["jellyfin"];const count=fetched.mock.callCount();await resolver.resolveMusicVideo(video);assert.equal(fetched.mock.callCount(),count);
  cfg.jellyfin.music_videos.artwork.order=["fetched"];const covers=cover.mock.callCount();await resolver.resolveMusicVideo({...video,album:undefined,externalIds:{}});assert.equal(cover.mock.callCount(),covers);
});

test("strict music-video release matching rejects weak, wrong-artist, and ambiguous matches", async t => {
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),"release-match-"));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
  const cfg=config(root,"local");cfg.image_providers.musicbrainz.enabled=true;
  const clients=localClients(), resolver=new ExternalArtworkResolver(cfg,clients.jellyfin as any,clients.subsonic as any,root);
  await (resolver as any).ready;
  let releases:any[]=[];t.mock.method(resolver as any,"fetchMusicBrainz",async()=>({releases}));
  const resolve=()=> (resolver as any).resolveReleaseMbid(" Artist  Name ","Ａlbum",true);
  releases=[{id:mbid,title:"Wrong Album",score:100,"artist-credit":[{name:"Artist Name"}]}];assert.equal(await resolve(),undefined);
  releases=[{id:mbid,title:"Album",score:100,"artist-credit":[{name:"Someone Else"}]}];assert.equal(await resolve(),undefined);
  releases=[{id:mbid,title:"album","artist-credit":[{artist:{name:"artist name"}}]}];assert.equal(await resolve(),mbid);
  releases.push({...releases[0],id:"22222222-2222-2222-2222-222222222222"});assert.equal(await resolve(),undefined);
  for(const release of releases)release["release-group"]={id:"same-group"};assert.equal(await resolve(),mbid);
});

test("music-video canonical release IDs use Cover Art Archive without guessing album metadata", async t => {
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),"video-caa-"));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
  const cfg=config(root,"local");cfg.image_providers.cover_art_archive.enabled=true;
  const clients=localClients(), resolver=new ExternalArtworkResolver(cfg,clients.jellyfin as any,clients.subsonic as any,root);
  await (resolver as any).ready;
  t.mock.method(resolver as any,"resolveReleaseMbid",async()=>{throw Error("canonical ID must win");});
  t.mock.method(resolver as any,"fetchJson",async(url:URL)=>{assert.equal(url.href,`https://coverartarchive.org/release/${mbid}`);return {images:[{front:true,image:"https://art.test/front.jpg"}]};});
  t.mock.method(resolver as any,"downloadFirst",async(candidates:any[])=>{assert.equal(candidates[0].provider,"cover-art-archive");return {file:"cover.jpg",provider:"cover-art-archive"};});
  const result=await (resolver as any).resolveFetchedAlbum("Artist","",{releaseMbid:mbid},true);assert.match(result,/\/albums\//);
});

test("strict album lookup rejects unrelated TheAudioDB results without changing ordinary lookup", async t => {
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),"album-audiodb-"));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
  const cfg=config(root,"local");cfg.image_providers.theaudiodb={enabled:true,api_key:"fixture-key"};
  const clients=localClients(),resolver=new ExternalArtworkResolver(cfg,clients.jellyfin as any,clients.subsonic as any,root);await (resolver as any).ready;
  let album=[{strAlbum:"Wrong",strArtist:"Wrong",strAlbumThumb:"https://art.test/wrong"}];
  t.mock.method(resolver as any,"fetchJson",async()=>({album}));
  let candidates:any[]=[];t.mock.method(resolver as any,"downloadFirst",async(items:any[])=>{candidates=items;return undefined;});
  await (resolver as any).fetchAlbum("Artist","Album",undefined,"strict",true);assert.deepEqual(candidates,[]);
  await (resolver as any).fetchAlbum("Artist","Album",undefined,"ordinary",false);assert.equal(candidates.length,1);
  album=[{strAlbum:" ALBUM ",strArtist:"artist",strAlbumThumb:"https://art.test/right"}];
  await (resolver as any).fetchAlbum("Artist","Album",undefined,"matched",true);assert.equal(candidates.length,1);
});

for (const preference of ["local","fetched"] as const) test(`legacy ${preference} preserves grouped local lookup rather than filling from a local file`,async t=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),"legacy-order-"));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
 const cfg=config(root,preference);cfg.subsonic.artwork.local_files=true;
 const clients=localClients({...localArtwork,logoUrl:undefined});const local=t.mock.method(clients.subsonic,"localArtistArtworks",()=>[{...localArtwork,logoUrl:"/file-logo"}] as any);
 const resolver=new ExternalArtworkResolver(cfg,clients.jellyfin as any,clients.subsonic as any,root);
 t.mock.method(resolver as any,"resolveFetchedArtist",async()=>({...localArtwork,backdropUrl:"/fetched",logoUrl:"/provider-logo"}));
 const result=await resolver.resolveExternal(state());assert.equal(local.mock.callCount(),0);
 assert.equal(result.artwork?.backdropUrl,preference === "local" ? localArtwork.backdropUrl : "/fetched");assert.equal(result.artwork?.logoUrl,"/provider-logo");
});

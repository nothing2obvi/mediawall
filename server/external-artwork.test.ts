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
  value.external_music.artwork = {
    preference,
    minimum_backdrop_width: 1920,
    minimum_backdrop_height: 1080,
    backdrop_count: backdropCount,
    cache_directory: root,
    cache_ttl_days: 30
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
      albumCoverForName: async () => albumCover
    },
    navidrome: {
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
    clients.navidrome as never,
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
    const navidrome = { localArtistArtworks: () => [], albumCoverForName: async () => undefined };
    const resolver = new ExternalArtworkResolver(value, jellyfin as never, navidrome as never, root);
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

test("1. local preference uses an existing Jellyfin/Navidrome artist", async (t) => {
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
  const first = new ExternalArtworkResolver(withoutKey, clients.jellyfin as never, clients.navidrome as never, root);
  assert.equal((await first.resolveExternal(state())).artwork, undefined);

  const mock = mockFanart([{ name: "one", width: 2400, height: 1400 }]);
  t.after(mock.restore);
  const withKey = new ExternalArtworkResolver(config(root, "fetched"), clients.jellyfin as never, clients.navidrome as never, root);
  assert.equal((await withKey.resolveExternal(state())).artwork?.source, "fetched");
  assert.equal(mock.calls().providerCalls, 1);
});

test("11. switching preference changes the selected artwork source", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "mediawall-artwork-switch-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const clients = localClients();
  const mock = mockFanart([{ name: "one", width: 2400, height: 1400 }]);
  t.after(mock.restore);
  const local = new ExternalArtworkResolver(config(root, "local"), clients.jellyfin as never, clients.navidrome as never, root);
  const fetched = new ExternalArtworkResolver(config(root, "fetched"), clients.jellyfin as never, clients.navidrome as never, root);
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
  assert.equal(avatars.avatarPath("navidrome", "primary"), undefined);
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
  assert.equal(item.resolver.imageSource("/api/navidrome/local-artist/Artist/0"), "local files");
});

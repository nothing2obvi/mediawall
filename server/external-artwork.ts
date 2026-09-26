import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { AppConfig, ArtworkRef, NowPlayingState } from "./types.js";
import { JellyfinClient } from "./jellyfin.js";
import { NavidromeClient } from "./navidrome.js";
import { logger } from "./logger.js";

type CachedImage = {
  file: string;
  provider: string;
  sourceUrl: string;
  width?: number;
  height?: number;
};

type ArtistCache = {
  edited?: boolean;
  version: 2;
  configuration: string;
  resolvedAt: number;
  artist: string;
  artistMbid?: string;
  providers: string[];
  logo?: CachedImage;
  backdrops: CachedImage[];
};

type AlbumCache = {
  edited?: boolean;
  version: 2;
  configuration: string;
  resolvedAt: number;
  artist: string;
  album: string;
  releaseMbid?: string;
  providers: string[];
  cover?: CachedImage;
};

type ImageCandidate = { url: string; provider: string; score: number; language?: string; width?: number; height?: number };

export class ExternalArtworkResolver {
  private readonly root: string;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private lastMusicBrainzRequestAt = 0;
  private imageProviders = new Map<string, string>();
  private selections = new Map<string, string>();

  imageSource(url?: string): string {
    if (!url) return "none";
    const provider = this.imageProviders.get(url);
    if (provider) return `Image provider (${provider}; MediaWall cache)`;
    if (url.startsWith("/api/jellyfin/")) return "Jellyfin";
    if (url.startsWith("/api/navidrome/local-")) return "local files";
    if (url.startsWith("/api/navidrome/")) return "Navidrome";
    if (url.startsWith("/api/external-artwork/")) return "Image provider (MediaWall cache; provider unknown)";
    if (url.startsWith("/")) return "MediaWall local asset";
    try { return `external image host (${new URL(url).hostname})`; }
    catch { return "unknown"; }
  }

  logSelection(key: string, context: string, artwork?: ArtworkRef, albumArtUrl?: string, reason = "display selection") {
    const details = `backdrop=${this.imageSource(artwork?.backdropUrl)} logo=${this.imageSource(artwork?.logoUrl)} album_cover=${this.imageSource(albumArtUrl)} backdrops_available=${artwork?.backdropCount ?? (artwork?.backdropUrl ? 1 : 0)} reason=${reason}`;
    const signature = JSON.stringify([context, artwork, albumArtUrl, details]);
    if (this.selections.get(key) === signature) return;
    if (this.selections.size >= 1000) this.selections.delete(this.selections.keys().next().value!);
    this.selections.set(key, signature);
    logger.info(`Artwork selection ${context}: ${details}`);
  }

  private rememberImage(scope: string, key: string, image?: CachedImage) {
    if (!image) return;
    if (this.imageProviders.size >= 10000) this.imageProviders.delete(this.imageProviders.keys().next().value!);
    this.imageProviders.set(fetchedUrl(scope, key, image.file), image.provider);
  }

  constructor(
    private readonly config: AppConfig,
    private readonly jellyfin: JellyfinClient,
    private readonly navidrome: NavidromeClient,
    appRoot: string
  ) {
    const configured = config.external_music.artwork.cache_directory;
    this.root = path.resolve(path.isAbsolute(configured) ? configured : path.join(appRoot, configured));
  }

  async resolveExternal(state: NowPlayingState) {
    const artworkArtist = artworkArtistFor(state);
    if (!artworkArtist) return state;
    const lookupArtists = artistLookupNames(artworkArtist, this.config.aliases.artists);
    const base = { ...state, artworkArtist, logoText: state.logoText ?? artworkArtist };
    const pinned = await this.editedArtist(lookupArtists);
    if (pinned) return { ...base, artwork: pinned, albumArtUrl: state.albumArtUrl ?? await this.resolveAlbumCover(lookupArtists, state.album, state.externalIds, this.config.external_music.artwork.preference) };
    const local = () => this.resolveLocalArtist(lookupArtists);
    const fetched = () => this.resolveFetchedArtist(lookupArtists, state.externalIds);
    const artwork = this.config.external_music.artwork.preference === "fetched"
      ? await completeArtwork(fetched, local)
      : await completeArtwork(local, fetched);
    const albumArtUrl = state.albumArtUrl ?? await this.resolveAlbumCover(
      lookupArtists,
      state.album,
      state.externalIds,
      this.config.external_music.artwork.preference
    );
    this.logSelection(`external:${state.source}:${state.user}`, `source=${state.source} artist=${JSON.stringify(artworkArtist)} track=${JSON.stringify(state.title)}`, artwork ?? state.artwork, albumArtUrl,
      `preference=${this.config.external_music.artwork.preference}; secondary sources fill missing backdrop/logo; incoming album cover wins when supplied`);
    return { ...base, artwork: artwork ?? state.artwork, albumArtUrl };
  }

  async resolveNavidrome(state: NowPlayingState) {
    const artworkArtist = artworkArtistFor(state);
    if (!artworkArtist) return state;
    const lookupArtists = artistLookupNames(artworkArtist, this.config.aliases.artists);
    const pinned = await this.editedArtist(lookupArtists);
    if (pinned) return { ...state, artworkArtist, artwork: pinned };
    let artwork: ArtworkRef | undefined;
    for (const source of this.config.navidrome.artwork.order) {
      let candidate: ArtworkRef | undefined;
      if (source === "local" && this.config.navidrome.artwork.local_files) {
        candidate = await this.resolveNavidromeLocalArtist(lookupArtists);
      } else if (source === "jellyfin" && this.config.navidrome.artwork.jellyfin_fallback) {
        candidate = await this.resolveJellyfinArtist(lookupArtists);
      } else if (source === "fetched") {
        candidate = await this.resolveFetchedArtist(lookupArtists, state.externalIds);
      }
      artwork = mergeArtwork(artwork, candidate);
      if (artwork?.backdropUrl && artwork.logoUrl) break;
    }
    this.logSelection(`navidrome:${state.user}`, `source=navidrome artist=${JSON.stringify(artworkArtist)} track=${JSON.stringify(state.title)}`, artwork ?? state.artwork, state.albumArtUrl,
      `configured order=${this.config.navidrome.artwork.order.join(",")}; enabled sources fill missing backdrop/logo`);
    return { ...state, artworkArtist, artwork: artwork ?? state.artwork };
  }

  assetPath(scope: string, key: string, filename: string) {
    if (!safeSegment(scope) || !safeSegment(key) || !safeSegment(filename)) return undefined;
    const directory = path.resolve(this.root, scope, key);
    const candidate = path.resolve(directory, filename);
    if (!candidate.startsWith(`${directory}${path.sep}`)) return undefined;
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : undefined;
  }

  async cachedArtistArtworks(key: string) {
    const cache = await this.readFreshCache<ArtistCache>("artists", key, this.artistCacheConfiguration());
    if (!cache) return [];
    const base = this.artistArtwork(key, cache);
    if (!base) return [];
    if (!cache.backdrops.length && cache.edited) return [base];
    return cache.backdrops.map((image, imageIndex) => ({
      ...base,
      imageIndex,
      imageType: "Backdrop" as const,
      backdropUrl: fetchedUrl("artists", key, image.file),
      thumbUrl: fetchedUrl("artists", key, image.file)
    }));
  }

  private async resolveLocalArtist(artists: string[]) {
    let artwork: ArtworkRef | undefined;
    for (const artist of artists) {
      const candidate = await this.jellyfin.artworkForArtistName(artist).catch(() => undefined)
        ?? this.navidrome.localArtistArtworks(artist)[0];
      artwork = mergeArtwork(artwork, candidate);
      if (artwork?.backdropUrl && artwork.logoUrl) break;
    }
    return artwork;
  }

  private async resolveJellyfinArtist(artists: string[]) {
    return this.resolveArtistCandidates(artists, (artist) => this.jellyfin.artworkForArtistName(artist).catch(() => undefined));
  }

  private async resolveNavidromeLocalArtist(artists: string[]) {
    return this.resolveArtistCandidates(artists, async (artist) => this.navidrome.localArtistArtworks(artist)[0]);
  }

  private async resolveArtistCandidates(
    artists: string[],
    resolve: (artist: string) => Promise<ArtworkRef | undefined>
  ) {
    let artwork: ArtworkRef | undefined;
    for (const artist of artists) {
      artwork = mergeArtwork(artwork, await resolve(artist));
      if (artwork?.backdropUrl && artwork.logoUrl) break;
    }
    return artwork;
  }

  private async resolveAlbumCover(
    artists: string[],
    album: string | undefined,
    externalIds: Record<string, unknown> | undefined,
    preference: "local" | "fetched"
  ) {
    if (!album) return undefined;
    const local = async () => {
      for (const artist of artists) {
        const cover = await this.jellyfin.albumCoverForName(album, artist).catch(() => undefined)
          ?? await this.navidrome.albumCoverForName(album, artist).catch(() => undefined);
        if (cover) return cover;
      }
      return undefined;
    };
    const fetched = async () => {
      for (const [index, artist] of artists.entries()) {
        const cover = await this.resolveFetchedAlbum(artist, album, index === 0 ? externalIds : undefined);
        if (cover) return cover;
      }
      return undefined;
    };
    return preference === "fetched" ? await firstValue(fetched, local) : await firstValue(local, fetched);
  }

  private async resolveFetchedArtist(artists: string[], externalIds?: Record<string, unknown>) {
    let artwork: ArtworkRef | undefined;
    for (const [index, artist] of artists.entries()) {
      const candidate = await this.resolveFetchedArtistName(artist, index === 0 ? externalIds : undefined);
      artwork = mergeArtwork(artwork, candidate);
      if (artwork?.backdropUrl && artwork.logoUrl) break;
    }
    return artwork;
  }

  private async resolveFetchedArtistName(artist: string, externalIds?: Record<string, unknown>) {
    const suppliedMbid = firstId(
      externalIds?.albumArtistMbids,
      nested(externalIds, "rawAdditionalInfo", "album_artist_mbids"),
      nested(externalIds, "rawAdditionalInfo", "albumartist_mbids"),
      nested(externalIds, "rawAdditionalInfo", "release_artist_mbids"),
      externalIds?.artistMbids,
      nested(externalIds, "rawMbidMapping", "artist_mbids")
    );
    const key = cacheKey(suppliedMbid ?? artist);
    const configuration = this.artistCacheConfiguration();
    const cache = await this.readFreshCache<ArtistCache>("artists", key, configuration);
    if (cache) {
      const artwork = this.artistArtwork(key, cache);
      this.logSelection(`cache:artists:${key}`, `artist=${JSON.stringify(artist)}`, artwork, undefined, "fresh provider cache reused; downloaded=0");
      return artwork;
    }
    const pendingKey = `artist:${key}`;
    const existing = this.inFlight.get(pendingKey) as Promise<ArtistCache> | undefined;
    const pending = existing ?? this.fetchArtist(artist, suppliedMbid, key);
    if (!existing) this.trackPending(pendingKey, pending);
    return this.artistArtwork(key, await pending);
  }

  async searchArtistImages(artist: string, type: "Logo" | "Backdrop", suppliedMbid?: string) {
    const mbid = suppliedMbid ?? await this.resolveArtistMbid(artist);
    const candidates = await this.artistCandidates(artist, mbid);
    return uniqueCandidates(type === "Logo" ? candidates.logos : candidates.backdrops);
  }

  private async artistCandidates(artist: string, artistMbid?: string) {
    const logos: ImageCandidate[] = [];
    const backdrops: ImageCandidate[] = [];
    const providers = new Set<string>();

    if (artistMbid && this.config.image_providers.fanart.enabled && this.config.image_providers.fanart.api_key) {
      const url = new URL(`https://webservice.fanart.tv/v3.2/music/${encodeURIComponent(artistMbid)}`);
      url.searchParams.set("api_key", this.config.image_providers.fanart.api_key);
      const payload = await this.fetchJson<Record<string, unknown>>(url).catch(() => undefined);
      if (payload) {
        providers.add("fanart.tv");
        logos.push(...fanartCandidates(payload, ["hdmusiclogo", "musiclogo"], "fanart.tv"));
        backdrops.push(...fanartCandidates(payload, ["artistbackground"], "fanart.tv"));
      }
    }

    if (this.config.image_providers.theaudiodb.enabled && this.config.image_providers.theaudiodb.api_key) {
      const endpoint = artistMbid ? "artist-mb.php" : "search.php";
      const url = new URL(`https://www.theaudiodb.com/api/v1/json/${encodeURIComponent(this.config.image_providers.theaudiodb.api_key)}/${endpoint}`);
      url.searchParams.set(artistMbid ? "i" : "s", artistMbid ?? artist);
      const payload = await this.fetchJson<{ artists?: Array<Record<string, unknown>> | null }>(url).catch(() => undefined);
      const match = payload?.artists?.[0];
      if (match) {
        providers.add("theaudiodb");
        addStringCandidate(logos, match.strArtistLogo, "theaudiodb", 100);
        for (const [index, field] of ["strArtistFanart", "strArtistFanart2", "strArtistFanart3", "strArtistFanart4"].entries()) {
          addStringCandidate(backdrops, match[field], "theaudiodb", 100 - index);
        }
      }
    }

    return { logos, backdrops, providers };
  }

  async editorCache(key: string): Promise<ArtistCache> {
    if (!/^[a-f0-9]{24}$/.test(key)) throw new Error("Invalid artwork key");
    return JSON.parse(await fsp.readFile(path.join(this.root, "artists", key, "metadata.json"), "utf8"));
  }

  async editorArtwork(key: string) { return this.artistArtwork(key, await this.editorCache(key)); }

  async editorSave(key: string, cache: ArtistCache) {
    cache.edited = true;
    cache.resolvedAt = Date.now();
    await this.writeCache(await this.cacheDirectory("artists", key), cache);
  }

  async editorDownload(key: string, candidate: ImageCandidate, type: "Logo" | "Backdrop") {
    if (!/^[a-f0-9]{24}$/.test(key)) throw new Error("Invalid artwork key");
    const image = await this.downloadImage(candidate, await this.cacheDirectory("artists", key),
      `${type.toLowerCase()}-${crypto.randomUUID()}`, type === "Backdrop");
    if (!image) throw new Error("Image download rejected; check artwork logs for the reason");
    return image;
  }

  async editorRemoveFile(key: string, file: string) {
    const target = this.assetPath("artists", key, file);
    if (target) await fsp.unlink(target);
  }

  private async editedArtist(artists: string[]) {
    const entries = await fsp.readdir(path.join(this.root, "artists")).catch(() => []);
    for (const key of entries) {
      if (!/^[a-f0-9]{24}$/.test(key)) continue;
      const cache = await this.editorCache(key).catch(() => undefined);
      if (cache?.edited && artists.some(a => a.toLowerCase() === cache.artist.toLowerCase())) return this.artistArtwork(key, cache);
    }
    return undefined;
  }

  private async fetchArtist(artist: string, suppliedMbid: string | undefined, key: string): Promise<ArtistCache> {
    logger.info(`Artwork lookup artist=${JSON.stringify(artist)} reason=no fresh matching cache; fanart.tv=${!this.config.image_providers.fanart.enabled ? "disabled" : !this.config.image_providers.fanart.api_key ? "missing credential" : "enabled"} TheAudioDB=${!this.config.image_providers.theaudiodb.enabled ? "disabled" : !this.config.image_providers.theaudiodb.api_key ? "missing credential" : "enabled"}`);
    const artistMbid = suppliedMbid ?? await this.resolveArtistMbid(artist);
    if (!artistMbid) logger.info(`Artwork lookup artist=${JSON.stringify(artist)} fanart.tv skipped: no MusicBrainz artist ID`);
    const { logos, backdrops, providers } = await this.artistCandidates(artist, artistMbid);

    const directory = await this.cacheDirectory("artists", key);
    const logo = await this.downloadFirst(logos, directory, "logo", false);
    const backdropResults: CachedImage[] = [];
    for (const candidate of uniqueCandidates(backdrops)) {
      if (backdropResults.length >= this.config.external_music.artwork.backdrop_count) break;
      const image = await this.downloadImage(candidate, directory, `backdrop-${backdropResults.length}`, true).catch(() => undefined);
      if (image) backdropResults.push(image);
    }
    const result: ArtistCache = {
      version: 2,
      configuration: this.artistCacheConfiguration(),
      resolvedAt: Date.now(),
      artist,
      artistMbid,
      providers: [...providers],
      logo,
      backdrops: backdropResults
    };
    await this.writeCache(directory, result);
    logger.info(`Artwork download summary artist=${JSON.stringify(artist)} providers_with_results=${[...providers].join(",") || "none"} saved=${backdropResults.length + Number(Boolean(logo))} logo=${logo?.provider ?? "none"} backdrops=${backdropResults.length}/${this.config.external_music.artwork.backdrop_count} backdrop_providers=${backdropResults.map(i => i.provider).join(",") || "none"} candidates=${uniqueCandidates(logos).length + uniqueCandidates(backdrops).length} reason=${backdropResults.length >= this.config.external_music.artwork.backdrop_count ? "configured backdrop limit reached" : "available candidates exhausted; see rejection logs"}`);
    return result;
  }

  private artistArtwork(key: string, cache: ArtistCache): ArtworkRef | undefined {
    for (const image of cache.backdrops) this.rememberImage("artists", key, image);
    this.rememberImage("artists", key, cache.logo);
    const backdrop = cache.backdrops[0];
    if (!backdrop && !cache.logo && !cache.edited) return undefined;
    return {
      source: "fetched",
      edited: cache.edited,
      itemId: key,
      title: cache.artist,
      mediaType: "MusicArtist",
      imageType: backdrop ? "Backdrop" : "Primary",
      imageIndex: 0,
      backdropUrl: backdrop ? fetchedUrl("artists", key, backdrop.file) : undefined,
      thumbUrl: backdrop ? fetchedUrl("artists", key, backdrop.file) : undefined,
      logoUrl: cache.logo ? fetchedUrl("artists", key, cache.logo.file) : undefined,
      backdropCount: cache.backdrops.length,
      backdropTags: cache.backdrops.map((image) => image.file),
      logoTag: cache.logo?.file,
      groupKey: `fetched:${key}`
    };
  }

  private async resolveFetchedAlbum(artist: string, album: string, externalIds?: Record<string, unknown>) {
    const suppliedReleaseMbid = firstId(
      externalIds?.releaseMbid,
      nested(externalIds, "rawMbidMapping", "release_mbid"),
      nested(externalIds, "rawAdditionalInfo", "release_mbid")
    );
    const key = cacheKey(`${suppliedReleaseMbid ?? artist}:${album}`);
    const configuration = this.albumCacheConfiguration();
    const cache = await this.readFreshCache<AlbumCache>("albums", key, configuration);
    if (cache) {
      this.rememberImage("albums", key, cache.cover);
      this.logSelection(`cache:albums:${key}`, `album=${JSON.stringify(album)}`, undefined,
        cache.cover ? fetchedUrl("albums", key, cache.cover.file) : undefined, "fresh provider cache reused; downloaded=0");
      return cache.cover ? fetchedUrl("albums", key, cache.cover.file) : undefined;
    }
    const pendingKey = `album:${key}`;
    const existing = this.inFlight.get(pendingKey) as Promise<AlbumCache> | undefined;
    const pending = existing ?? this.fetchAlbum(artist, album, suppliedReleaseMbid, key);
    if (!existing) this.trackPending(pendingKey, pending);
    const result = await pending;
    this.rememberImage("albums", key, result.cover);
    return result.cover ? fetchedUrl("albums", key, result.cover.file) : undefined;
  }

  private async fetchAlbum(artist: string, album: string, suppliedReleaseMbid: string | undefined, key: string): Promise<AlbumCache> {
    logger.info(`Album artwork lookup artist=${JSON.stringify(artist)} album=${JSON.stringify(album)} reason=no fresh matching cache; Cover Art Archive=${this.config.image_providers.cover_art_archive.enabled ? "enabled" : "disabled"} TheAudioDB=${!this.config.image_providers.theaudiodb.enabled ? "disabled" : !this.config.image_providers.theaudiodb.api_key ? "missing credential" : "enabled"}`);
    const releaseMbid = suppliedReleaseMbid ?? await this.resolveReleaseMbid(artist, album);
    if (!releaseMbid) logger.info("Album artwork: Cover Art Archive skipped: no MusicBrainz release ID");
    const candidates: ImageCandidate[] = [];
    const providers = new Set<string>();
    if (releaseMbid && this.config.image_providers.cover_art_archive.enabled) {
      const payload = await this.fetchJson<{ images?: Array<Record<string, unknown>> }>(
        new URL(`https://coverartarchive.org/release/${encodeURIComponent(releaseMbid)}`)
      ).catch(() => undefined);
      const images = payload?.images ?? [];
      const front = images.filter((image) => image.front === true || arrayIncludes(image.types, "Front"));
      for (const [index, image] of [...front, ...images.filter((image) => !front.includes(image))].entries()) {
        const thumbnails = isObject(image.thumbnails) ? image.thumbnails : {};
        addStringCandidate(candidates, thumbnails["1200"] ?? image.image, "cover-art-archive", 200 - index);
      }
      if (images.length) providers.add("cover-art-archive");
    }
    if (this.config.image_providers.theaudiodb.enabled && this.config.image_providers.theaudiodb.api_key) {
      const url = new URL(`https://www.theaudiodb.com/api/v1/json/${encodeURIComponent(this.config.image_providers.theaudiodb.api_key)}/searchalbum.php`);
      url.searchParams.set("s", artist);
      url.searchParams.set("a", album);
      const payload = await this.fetchJson<{ album?: Array<Record<string, unknown>> | null }>(url).catch(() => undefined);
      const match = payload?.album?.[0];
      if (match) {
        providers.add("theaudiodb");
        addStringCandidate(candidates, match.strAlbumThumbHQ ?? match.strAlbumThumb, "theaudiodb", 100);
      }
    }
    const directory = await this.cacheDirectory("albums", key);
    const cover = await this.downloadFirst(candidates, directory, "cover", false);
    const result: AlbumCache = {
      version: 2,
      configuration: this.albumCacheConfiguration(),
      resolvedAt: Date.now(),
      artist,
      album,
      releaseMbid,
      providers: [...providers],
      cover
    };
    await this.writeCache(directory, result);
    logger.info(`Album artwork download summary artist=${JSON.stringify(artist)} album=${JSON.stringify(album)} saved=${Number(Boolean(cover))} provider=${cover?.provider ?? "none"} candidates=${uniqueCandidates(candidates).length} reason=${cover ? "first usable cover selected" : "no usable cover; candidates exhausted"}`);
    return result;
  }

  private async resolveArtistMbid(artist: string) {
    if (!this.config.image_providers.musicbrainz.enabled) return undefined;
    const url = new URL("https://musicbrainz.org/ws/2/artist");
    url.searchParams.set("query", `artist:\"${escapeMusicBrainz(artist)}\"`);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", "5");
    const payload = await this.fetchMusicBrainz<{ artists?: Array<{ id?: string; name?: string; score?: number }> }>(url).catch(() => undefined);
    const normalized = artist.trim().toLowerCase();
    return payload?.artists?.find((entry) => entry.name?.trim().toLowerCase() === normalized)?.id
      ?? payload?.artists?.find((entry) => (entry.score ?? 0) >= 90)?.id;
  }

  private async resolveReleaseMbid(artist: string, album: string) {
    if (!this.config.image_providers.musicbrainz.enabled) return undefined;
    const url = new URL("https://musicbrainz.org/ws/2/release");
    url.searchParams.set("query", `release:\"${escapeMusicBrainz(album)}\" AND artist:\"${escapeMusicBrainz(artist)}\"`);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", "10");
    const payload = await this.fetchMusicBrainz<{ releases?: Array<{ id?: string; title?: string; score?: number }> }>(url).catch(() => undefined);
    const normalized = album.trim().toLowerCase();
    return payload?.releases?.find((entry) => entry.title?.trim().toLowerCase() === normalized)?.id
      ?? payload?.releases?.find((entry) => (entry.score ?? 0) >= 90)?.id;
  }

  private async fetchMusicBrainz<T>(url: URL) {
    const elapsed = Date.now() - this.lastMusicBrainzRequestAt;
    if (elapsed < 1100) await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
    this.lastMusicBrainzRequestAt = Date.now();
    return this.fetchJson<T>(url);
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    const contact = this.config.image_providers.musicbrainz.contact.trim();
    const userAgent = `MediaWall/0.4${contact ? ` (${contact})` : ""}`;
    try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error(`${url.hostname} returned ${response.status}`);
    return await response.json() as T;
    } catch (error) {
      logger.warn(`Artwork metadata lookup failed provider=${url.hostname} reason=${error instanceof Error ? error.name : "request failure"}; continuing with other sources`);
      throw error;
    }
  }

  private async downloadFirst(candidates: ImageCandidate[], directory: string, base: string, backdrop: boolean) {
    for (const candidate of uniqueCandidates(candidates)) {
      const image = await this.downloadImage(candidate, directory, base, backdrop).catch(() => undefined);
      if (image) return image;
    }
    return undefined;
  }

  private async downloadImage(candidate: ImageCandidate, directory: string, base: string, backdrop: boolean): Promise<CachedImage | undefined> {
    const reject = (reason: string) => {
      logger.info(`Artwork download rejected provider=${candidate.provider} kind=${backdrop ? "backdrop" : base} reason=${reason}`);
      return undefined;
    };
    try {
      const url = new URL(candidate.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") return reject("unsupported URL protocol");
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
      if (!response.ok) return reject(`HTTP ${response.status}`);
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > 25 * 1024 * 1024) return reject("content length exceeds 25 MiB");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > 25 * 1024 * 1024) return reject("empty image or body exceeds 25 MiB");
      const dimensions = imageDimensions(buffer);
      if (backdrop && (!dimensions
        || dimensions.width < this.config.external_music.artwork.minimum_backdrop_width
        || dimensions.height < this.config.external_music.artwork.minimum_backdrop_height)) {
        return reject(`dimensions=${dimensions ? `${dimensions.width}x${dimensions.height}` : "unknown"} minimum=${this.config.external_music.artwork.minimum_backdrop_width}x${this.config.external_music.artwork.minimum_backdrop_height}`);
      }
      const extension = imageExtension(response.headers.get("content-type"), url.pathname, buffer);
      if (!extension) return reject("unsupported image format");
      const file = `${base}.${extension}`;
      await fsp.writeFile(path.join(directory, file), buffer);
      logger.info(`Artwork downloaded provider=${candidate.provider} kind=${backdrop ? "backdrop" : base} saved=1 bytes=${buffer.length} dimensions=${dimensions ? `${dimensions.width}x${dimensions.height}` : "unknown"} reason=usable candidate selected for cache`);
      return { file, provider: candidate.provider, sourceUrl: candidate.url, ...dimensions };
    } catch (error) {
      return reject(error instanceof Error ? error.name : "download or cache write failed");
    }
  }

  private artistCacheConfiguration() {
    return configurationHash({
      musicbrainz: this.config.image_providers.musicbrainz.enabled,
      fanart: providerCredentialFingerprint(
        this.config.image_providers.fanart.enabled,
        this.config.image_providers.fanart.api_key
      ),
      theaudiodb: providerCredentialFingerprint(
        this.config.image_providers.theaudiodb.enabled,
        this.config.image_providers.theaudiodb.api_key
      ),
      minimumBackdropWidth: this.config.external_music.artwork.minimum_backdrop_width,
      minimumBackdropHeight: this.config.external_music.artwork.minimum_backdrop_height,
      backdropCount: this.config.external_music.artwork.backdrop_count
    });
  }

  private albumCacheConfiguration() {
    return configurationHash({
      musicbrainz: this.config.image_providers.musicbrainz.enabled,
      coverArtArchive: this.config.image_providers.cover_art_archive.enabled,
      theaudiodb: providerCredentialFingerprint(
        this.config.image_providers.theaudiodb.enabled,
        this.config.image_providers.theaudiodb.api_key
      )
    });
  }

  private async readFreshCache<T extends { resolvedAt: number; configuration?: string; edited?: boolean }>(
    scope: string,
    key: string,
    configuration: string
  ): Promise<T | undefined> {
    const file = path.join(this.root, scope, key, "metadata.json");
    try {
      const cache = JSON.parse(await fsp.readFile(file, "utf8")) as T;
      const ttl = this.config.external_music.artwork.cache_ttl_days * 86_400_000;
      return cache.edited || (cache.configuration === configuration && Date.now() - cache.resolvedAt <= ttl) ? cache : undefined;
    } catch {
      return undefined;
    }
  }

  private async cacheDirectory(scope: string, key: string) {
    const directory = path.join(this.root, scope, key);
    await fsp.mkdir(directory, { recursive: true });
    return directory;
  }

  private async writeCache(directory: string, value: ArtistCache | AlbumCache) {
    const temporary = path.join(directory, `metadata-${crypto.randomUUID()}.tmp`);
    await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fsp.rename(temporary, path.join(directory, "metadata.json"));
  }

  private trackPending(key: string, promise: Promise<unknown>) {
    this.inFlight.set(key, promise);
    void promise.finally(() => this.inFlight.delete(key));
  }
}

export function artworkArtistFor(state: NowPlayingState) {
  const albumArtist = cleanArtist(state.albumArtist);
  if (albumArtist && !genericAlbumArtist(albumArtist)) return albumArtist;
  for (const artist of state.artists ?? []) {
    const clean = cleanArtist(artist);
    if (clean) return clean;
  }
  return cleanArtist(state.artist);
}

export function artistLookupNames(artist: string, aliases: Record<string, string[]>) {
  const original = artist.trim();
  if (!original) return [];
  const names = new Map<string, string>();
  const edges = new Map<string, Set<string>>();
  const addName = (value: string) => {
    const clean = value.trim();
    if (!clean) return undefined;
    const normalized = normalizeArtistAlias(clean);
    if (!names.has(normalized)) names.set(normalized, clean);
    if (!edges.has(normalized)) edges.set(normalized, new Set());
    return normalized;
  };
  addName(original);
  for (const [canonical, configuredAliases] of Object.entries(aliases)) {
    const canonicalKey = addName(canonical);
    if (!canonicalKey) continue;
    for (const alias of configuredAliases) {
      const aliasKey = addName(alias);
      if (!aliasKey || aliasKey === canonicalKey) continue;
      edges.get(canonicalKey)?.add(aliasKey);
      edges.get(aliasKey)?.add(canonicalKey);
    }
  }
  const start = normalizeArtistAlias(original);
  const orderedKeys: string[] = [];
  const queue = [start];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    orderedKeys.push(current);
    for (const neighbor of edges.get(current) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return orderedKeys.map((key) => key === start ? original : names.get(key)).filter((value): value is string => Boolean(value));
}

function normalizeArtistAlias(value: string) {
  return value.trim().toLocaleLowerCase();
}

function cleanArtist(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function genericAlbumArtist(value: string) {
  return /^(various(?: artists)?|va|unknown artist|soundtrack)$/i.test(value.trim());
}

async function completeArtwork(first: () => Promise<ArtworkRef | undefined>, second: () => Promise<ArtworkRef | undefined>) {
  const primary = await first();
  if (primary?.edited || (primary?.backdropUrl && primary.logoUrl)) return primary;
  return mergeArtwork(primary, await second());
}

function mergeArtwork(primary: ArtworkRef | undefined, fallback: ArtworkRef | undefined) {
  if (!primary) return fallback;
  if (primary.edited || !fallback) return primary;
  if (primary.backdropUrl) {
    return {
      ...primary,
      logoUrl: primary.logoUrl ?? fallback.logoUrl,
      logoTag: primary.logoTag ?? fallback.logoTag
    };
  }
  return {
    ...fallback,
    logoUrl: primary.logoUrl ?? fallback.logoUrl,
    logoTag: primary.logoTag ?? fallback.logoTag
  };
}

async function firstValue(first: () => Promise<string | undefined>, second: () => Promise<string | undefined>) {
  return await first() ?? await second();
}

function cacheKey(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 24);
}

function configurationHash(value: Record<string, unknown>) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

function providerCredentialFingerprint(enabled: boolean, credential: string) {
  if (!enabled) return "disabled";
  if (!credential) return "missing";
  return `configured:${crypto.createHash("sha256").update(credential).digest("hex").slice(0, 12)}`;
}

function fetchedUrl(scope: string, key: string, file: string) {
  return `/api/external-artwork/${encodeURIComponent(scope)}/${encodeURIComponent(key)}/${encodeURIComponent(file)}`;
}

function safeSegment(value: string) {
  return Boolean(value) && !value.includes("/") && !value.includes("\\") && !value.includes("\0") && value !== "." && value !== "..";
}

function nested(value: unknown, objectKey: string, propertyKey: string) {
  if (!isObject(value) || !isObject(value[objectKey])) return undefined;
  return value[objectKey][propertyKey];
}

function firstId(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find((entry) => typeof entry === "string" && entry.trim());
      if (typeof first === "string") return first.trim();
    }
  }
  return undefined;
}

function fanartCandidates(payload: Record<string, unknown>, fields: string[], provider: string) {
  const candidates: ImageCandidate[] = [];
  for (const field of fields) {
    const entries = Array.isArray(payload[field]) ? payload[field] : [];
    for (const entry of entries) {
      if (!isObject(entry)) continue;
      if (typeof entry.url === "string" && entry.url.trim()) candidates.push({url:entry.url.trim(), provider, score:Number(entry.likes) || 0,
        language: typeof entry.lang === "string" ? entry.lang : undefined,
        width: Number(entry.width) > 0 ? Number(entry.width) : undefined,
        height: Number(entry.height) > 0 ? Number(entry.height) : undefined});
    }
  }
  return candidates;
}

function addStringCandidate(target: ImageCandidate[], value: unknown, provider: string, score: number) {
  if (typeof value === "string" && value.trim()) target.push({ url: value.trim(), provider, score });
}

function uniqueCandidates(candidates: ImageCandidate[]) {
  const seen = new Set<string>();
  return [...candidates]
    .sort((left, right) => right.score - left.score)
    .filter((candidate) => {
      if (seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    });
}

function arrayIncludes(value: unknown, expected: string) {
  return Array.isArray(value) && value.some((entry) => String(entry).toLowerCase() === expected.toLowerCase());
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeMusicBrainz(value: string) {
  return value.replace(/([+\-&|!(){}\[\]^"~*?:\\/])/g, "\\$1");
}

function imageExtension(contentType: string | null, pathname: string, buffer: Buffer) {
  const type = contentType?.split(";")[0].trim().toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  const extension = path.extname(pathname).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return extension === ".jpeg" ? "jpg" : extension.slice(1);
  if (buffer.subarray(1, 4).toString("ascii") === "PNG") return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return undefined;
}

export function imageDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer.length >= 24 && buffer.subarray(1, 4).toString("ascii") === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += length + 2;
    }
  }
  if (buffer.length >= 30 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    const kind = buffer.subarray(12, 16).toString("ascii");
    if (kind === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3)
      };
    }
    if (kind === "VP8 " && buffer.length >= 30 && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff
      };
    }
    if (kind === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      return {
        width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
        height: 1 + (buffer[22] >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10)
      };
    }
  }
  return undefined;
}

import fs from "node:fs";
import path from "node:path";
import type { AppConfig, ArtworkRef, DisplayConfig, NowPlayingState } from "./types.js";
import { JellyfinClient } from "./jellyfin.js";

type SubsonicResponse<T> = {
  "subsonic-response": T & {
    status: "ok" | "failed";
    error?: { code: number; message: string };
  };
};

type NowPlayingEntry = {
  id?: string;
  title?: string;
  album?: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  username?: string;
  playerName?: string;
  playerId?: string;
  minutesAgo?: number | string;
  duration?: number | string;
  path?: string;
  parent?: string;
  isDir?: boolean;
};

type ArtistIndexResponse = {
  artists?: {
    index?: Array<{
      name?: string;
      artist?: NavidromeArtist | NavidromeArtist[];
    }>;
  };
};

type NavidromeArtist = {
  id?: string;
  name?: string;
  coverArt?: string;
  artistImageUrl?: string;
  albumCount?: number;
};

export class NavidromeClient {
  private workingBaseUrl?: string;
  private authUser?: { username: string; password: string };

  constructor(private config: AppConfig, private jellyfin: JellyfinClient) {}

  private get baseUrl() {
    return this.config.navidrome.url.replace(/\/+$/, "");
  }

  configured() {
    return Boolean(
      this.config.navidrome.enabled
      && this.baseUrl
      && Object.values(this.config.users).some((user) => user.navidrome_user && !isAllUsers(user.navidrome_user) && user.navidrome_password)
    );
  }

  async reachable() {
    if (!this.config.navidrome.enabled) return true;
    if (!this.configured()) throw new Error("Navidrome is enabled but has no usable user credentials");
    await this.getJson<Record<string, never>>("/rest/ping.view");
    return true;
  }

  async activePlayback(displayConfig: DisplayConfig): Promise<NowPlayingState | undefined> {
    return (await this.activePlaybacks(displayConfig))[0];
  }

  async activePlaybacks(displayConfig: DisplayConfig): Promise<NowPlayingState[]> {
    if (!this.configured()) return [];
    const requestedUser = displayConfig.users[0]?.navidrome_user ?? displayConfig.playback_user;
    const includeAllUsers = isAllUsers(requestedUser) || isAllUsers(displayConfig.playback_user);
    const authUser = includeAllUsers
      ? firstNavidromeUser(this.config)
      : {
        username: requestedUser,
        password: displayConfig.users[0]?.navidrome_password ?? ""
      };
    if (!authUser?.username || !authUser.password) return [];
    this.authUser = authUser;
    const response = await this.getJson<{ nowPlaying?: { entry?: NowPlayingEntry | NowPlayingEntry[] } }>("/rest/getNowPlaying.view");
    const entries = normalizeArray(response.nowPlaying?.entry);
    const matchingEntries = includeAllUsers
      ? entries
      : entries.filter((candidate) => candidate.username?.toLowerCase() === displayConfig.playback_user.toLowerCase());
    const candidates = matchingEntries.length ? matchingEntries : includeAllUsers ? [] : entries.filter((entry) => !entry.username);
    return Promise.all(candidates.map((entry) => this.nowPlayingFromEntry(entry, displayConfig)));
  }

  private async nowPlayingFromEntry(entry: NowPlayingEntry, displayConfig: DisplayConfig): Promise<NowPlayingState> {
    const requestedUser = displayConfig.users[0]?.navidrome_user ?? displayConfig.playback_user;
    const navidromeUser = entry.username ?? requestedUser;
    const displayUser = navidromeUser;
    const activityAt = navidromeTimestamp(entry.minutesAgo);
    const stale = navidromeEntryStale(entry);
    const resolvedArtwork = await this.resolveNowPlayingArtwork(entry);

    const coverArtUrl = entry.coverArt ? this.coverArtUrl(entry.coverArt) : undefined;
    const artwork: ArtworkRef = resolvedArtwork ?? {
      source: "navidrome",
      itemId: entry.artistId ?? entry.id ?? entry.coverArt ?? entry.artist ?? entry.title ?? "navidrome",
      title: entry.artist ?? entry.album ?? entry.title ?? "Navidrome",
      mediaType: "MusicArtist",
      imageType: "Primary",
      imageIndex: 0,
      thumbUrl: undefined
    };

    return {
      source: "navidrome",
      user: navidromeUser,
      displayUser,
      playing: true,
      paused: false,
      stale,
      sessionKey: [
        "navidrome",
        entry.username ?? displayConfig.playback_user,
        entry.playerId,
        entry.playerName,
        entry.id,
        entry.path
      ].filter(Boolean).join(":"),
      activityAt,
      title: entry.title,
      artist: entry.artist,
      album: entry.album,
      logoText: entry.artist,
      itemId: entry.id,
      artistId: entry.artistId,
      artistName: entry.artist,
      albumArtUrl: coverArtUrl,
      artwork,
      signature: resolvedArtwork?.itemId ?? entry.artistId ?? entry.artist ?? entry.id
    };
  }

  private async resolveNowPlayingArtwork(entry: NowPlayingEntry) {
    const order = this.config.navidrome.artwork.order.length
      ? this.config.navidrome.artwork.order
      : ["jellyfin", "local"] as const;
    for (const source of order) {
      if (source === "jellyfin" && this.config.navidrome.artwork.jellyfin_fallback) {
        const artwork = await this.jellyfin.artworkForArtistName(entry.artist).catch(() => undefined);
        if (artwork) return artwork;
      }
      if (source === "local" && this.config.navidrome.artwork.local_files && entry.artist) {
        const artwork = this.localArtistArtworks(entry.artist)[0];
        if (artwork) return artwork;
      }
    }
    return undefined;
  }

  coverArtUrl(id: string) {
    return `/api/navidrome/cover/${encodeURIComponent(id)}`;
  }

  async proxyCoverArt(id: string) {
    this.authUser = firstNavidromeUser(this.config);
    return this.fetchWithFallback("/rest/getCoverArt.view", new URLSearchParams({ id }), false);
  }

  async proxyArtistImage(url: string) {
    const parsed = new URL(url);
    const allowed = this.candidateBaseUrls().some((base) => {
      const candidate = new URL(base);
      return candidate.protocol === parsed.protocol && candidate.host === parsed.host;
    });
    if (!allowed) throw new Error(`Unsupported Navidrome image URL: ${url}`);
    return fetch(url, { signal: AbortSignal.timeout(6500) });
  }

  async browseLibraries(displayConfig: DisplayConfig) {
    if (!this.configured()) return [];
    return displayConfig.libraries.map((name) => ({ id: name, name, type: "music" }));
  }

  async browseItems(_libraryId: string) {
    if (!this.configured()) return [];
    this.authUser = firstNavidromeUser(this.config);
    const response = await this.getJson<ArtistIndexResponse>("/rest/getArtists.view");
    const artists = normalizeArray(response.artists?.index).flatMap((index) => normalizeArray(index.artist));
    return artists
      .filter((artist) => artist.id && artist.name)
      .sort((left, right) => String(left.name).localeCompare(String(right.name)))
      .map((artist) => {
        const localArtworks = this.localArtistArtworks(String(artist.name));
        if (localArtworks.length === 0) return undefined;
        const thumbUrl = localArtworks[0]?.backdropUrl;
        return {
          id: String(artist.id),
          name: String(artist.name),
          type: "MusicArtist",
          thumbUrl,
          backdropCount: localArtworks.length,
          artwork: localArtworks[0]
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  localArtistImagePath(artistName: string) {
    return this.localArtistImagePaths(artistName)[0];
  }

  localArtistArtworks(artistName: string) {
    const logoUrl = this.localArtistLogoPath(artistName)
      ? `/api/navidrome/local-artist-logo/${encodeURIComponent(artistName)}`
      : undefined;
    return this.localArtistImagePaths(artistName).map((imagePath, index, paths) => ({
      source: "navidrome" as const,
      itemId: artistName,
      title: artistName,
      mediaType: "MusicArtist",
      imageType: "Backdrop" as const,
      imageIndex: index,
      backdropUrl: `/api/navidrome/local-artist/${encodeURIComponent(artistName)}/${index}`,
      logoUrl,
      thumbUrl: `/api/navidrome/local-artist/${encodeURIComponent(artistName)}/${index}`,
      backdropCount: paths.length
    } satisfies ArtworkRef));
  }

  localArtistLogoPath(artistName: string) {
    if (!this.config.navidrome.artwork.local_files) return undefined;
    const roots = this.config.navidrome.artwork.path_mappings.map((mapping) => mapping.mediawall);
    const filenames = [
      "logo.png",
      "logo.webp",
      "logo.jpg",
      "logo.jpeg",
      "logo.avif",
      "clearlogo.png",
      "clearlogo.webp",
      "clearlogo.jpg",
      "clearlogo.jpeg",
      "clearlogo.avif",
      "artist-logo.png",
      "artist-logo.webp",
      "artist-logo.jpg",
      "artist-logo.jpeg",
      "artist-logo.avif"
    ];

    for (const root of roots) {
      const artistDir = path.resolve(root, artistName);
      const rootDir = path.resolve(root);
      if (!artistDir.startsWith(`${rootDir}${path.sep}`)) continue;
      for (const filename of filenames) {
        const candidate = path.join(artistDir, filename);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      }
      if (fs.existsSync(artistDir) && fs.statSync(artistDir).isDirectory()) {
        const extra = fs.readdirSync(artistDir)
          .filter((filename) => /\.(avif|jpe?g|png|webp)$/i.test(filename))
          .filter((filename) => /(?:^|[-_\s])(clearlogo|logo|artist-logo)(?:[-_\s.]|$)/i.test(filename))
          .sort((left, right) => left.localeCompare(right))
          .map((filename) => path.join(artistDir, filename))
          .find((candidate) => fs.statSync(candidate).isFile());
        if (extra) return extra;
      }
    }
    return undefined;
  }

  localArtistImagePaths(artistName: string) {
    if (!this.config.navidrome.artwork.local_files) return [];
    const roots = this.config.navidrome.artwork.path_mappings.map((mapping) => mapping.mediawall);
    const filenames = [
      "fanart.jpg",
      "fanart.jpeg",
      "fanart.png",
      "fanart.webp",
      "backdrop.jpg",
      "backdrop.jpeg",
      "backdrop.png",
      "backdrop.webp",
      "background.jpg",
      "background.jpeg",
      "background.png",
      "background.webp",
      "landscape.jpg",
      "landscape.jpeg",
      "landscape.png",
      "landscape.webp",
      "banner.jpg",
      "banner.jpeg",
      "banner.png",
      "banner.webp",
      "wallpaper.jpg",
      "wallpaper.jpeg",
      "wallpaper.png",
      "wallpaper.webp"
    ];

    const matches: string[] = [];
    for (const root of roots) {
      const artistDir = path.resolve(root, artistName);
      const rootDir = path.resolve(root);
      if (!artistDir.startsWith(`${rootDir}${path.sep}`)) continue;
      for (const filename of filenames) {
        const candidate = path.join(artistDir, filename);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) matches.push(candidate);
      }
      if (fs.existsSync(artistDir) && fs.statSync(artistDir).isDirectory()) {
        const preferred = new Set(matches.map((match) => path.basename(match).toLowerCase()));
        const extras = fs.readdirSync(artistDir)
          .filter((filename) => /\.(avif|jpe?g|png|webp)$/i.test(filename))
          .filter((filename) => /(backdrop|background|fanart|landscape|banner|wallpaper)/i.test(filename))
          .filter((filename) => !preferred.has(filename.toLowerCase()))
          .sort((left, right) => left.localeCompare(right))
          .map((filename) => path.join(artistDir, filename))
          .filter((candidate) => fs.statSync(candidate).isFile());
        matches.push(...extras);
      }
    }

    return [...new Set(matches)];
  }

  private localArtistImageUrl(artistName?: string) {
    return artistName && this.localArtistImagePath(artistName)
      ? `/api/navidrome/local-artist/${encodeURIComponent(artistName)}`
      : undefined;
  }

  private artistImageProxyUrl(url: string, artistName?: string) {
    const params = new URLSearchParams({ url });
    if (artistName) params.set("artist", artistName);
    return `/api/navidrome/artist-image?${params}`;
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchWithFallback(path, new URLSearchParams({ f: "json" }), true);
    if (!response.ok) throw new Error(`Navidrome ${response.status} for ${path}`);
    const payload = await response.json() as SubsonicResponse<T>;
    const body = payload["subsonic-response"];
    if (body.status !== "ok") {
      throw new Error(`Navidrome API error: ${body.error?.message ?? "unknown error"}`);
    }
    return body;
  }

  private authParams() {
    const authUser = this.authUser ?? firstNavidromeUser(this.config);
    return new URLSearchParams({
      u: authUser?.username ?? "",
      p: authUser?.password ?? "",
      v: "1.16.1",
      c: "mediawall"
    });
  }

  private async fetchWithFallback(path: string, params = new URLSearchParams(), json = false) {
    const separator = path.startsWith("/") ? "" : "/";
    const bases = this.candidateBaseUrls();
    let lastError: unknown;

    for (const base of bases) {
      try {
        const query = this.authParams();
        for (const [key, value] of params.entries()) query.set(key, value);
        if (json) query.set("f", "json");
        const response = await fetch(`${base}${separator}${path}?${query}`, {
          signal: AbortSignal.timeout(6500)
        });
        this.workingBaseUrl = base;
        return response;
      } catch (error) {
        lastError = error;
        if (base === this.baseUrl) {
          console.warn(`Navidrome request to configured URL failed; trying Docker host gateway for ${path}`);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Unable to reach Navidrome for ${path}`);
  }

  private candidateBaseUrls() {
    const urls = [this.workingBaseUrl, this.baseUrl, this.dockerHostFallbackUrl()]
      .filter((url): url is string => Boolean(url));
    return [...new Set(urls)];
  }

  private dockerHostFallbackUrl() {
    try {
      const url = new URL(this.baseUrl);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "host.docker.internal") {
        return undefined;
      }
      url.hostname = "host.docker.internal";
      return url.toString().replace(/\/+$/, "");
    } catch {
      return undefined;
    }
  }
}

function normalizeArray<T>(value: T | T[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function navidromeTimestamp(minutesAgo: NowPlayingEntry["minutesAgo"]) {
  if (minutesAgo === undefined || minutesAgo === null) return undefined;
  const minutes = Number(minutesAgo);
  return Number.isFinite(minutes) ? Date.now() - (minutes * 60_000) : undefined;
}

function navidromeEntryStale(entry: NowPlayingEntry) {
  const minutesAgo = Number(entry.minutesAgo);
  const durationSeconds = Number(entry.duration);
  if (!Number.isFinite(minutesAgo) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  return minutesAgo * 60_000 > (durationSeconds * 1000) + 60_000;
}

function firstNavidromeUser(config: AppConfig) {
  const user = Object.values(config.users).find((candidate) =>
    candidate.navidrome_user && !isAllUsers(candidate.navidrome_user) && candidate.navidrome_password
  );
  return user ? { username: user.navidrome_user!, password: user.navidrome_password! } : undefined;
}

function isAllUsers(name?: string) {
  return name?.toLowerCase() === "all";
}

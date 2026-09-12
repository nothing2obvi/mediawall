import type { AppConfig, ArtworkRef, DisplayConfig, NowPlayingState } from "./types.js";

type JellyfinItem = Record<string, any>;

export class JellyfinClient {
  private workingBaseUrl?: string;
  private userIds = new Map<string, string>();

  constructor(private config: AppConfig) {}

  private get baseUrl() {
    return this.config.jellyfin.url.replace(/\/+$/, "");
  }

  private get headers() {
    return {
      "Authorization": `MediaBrowser Token="${this.config.jellyfin.api_key}"`,
      "X-Emby-Token": this.config.jellyfin.api_key,
      "X-MediaBrowser-Token": this.config.jellyfin.api_key,
      "Accept": "application/json"
    };
  }

  configured() {
    return Boolean(this.baseUrl && this.config.jellyfin.api_key);
  }

  async reachable() {
    if (!this.configured()) return true;
    const response = await this.fetchWithFallback("/System/Info");
    if (!response.ok) throw new Error(`Jellyfin ${response.status}`);
    return true;
  }

  imageUrl(itemId: string, type: "Backdrop" | "Logo" | "Primary", index = 0, tag?: string) {
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (type === "Backdrop") params.set("quality", "92");
    const suffix = params.toString() ? `?${params}` : "";
    const indexSegment = type === "Backdrop" ? `/${index}` : "";
    return `/api/jellyfin/image/${encodeURIComponent(itemId)}/${type}${indexSegment}${suffix}`;
  }

  userImageUrl(userId: string, tag?: string, resize?: { enabled: boolean; size: number }) {
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (resize?.enabled) {
      const size = String(Math.max(16, Math.round(resize.size)));
      params.set("maxWidth", size);
      params.set("maxHeight", size);
      params.set("quality", "90");
    }
    const suffix = params.toString() ? `?${params}` : "";
    return `/api/jellyfin/user-image/${encodeURIComponent(userId)}/Primary${suffix}`;
  }

  async proxyImage(itemId: string, type: string, index?: string, query = "") {
    const indexSegment = type === "Backdrop" && index ? `/${index}` : "";
    return this.fetchWithFallback(`/Items/${encodeURIComponent(itemId)}/Images/${type}${indexSegment}${query}`);
  }

  async proxyUserImage(userId: string, query = "") {
    return this.fetchWithFallback(`/Users/${encodeURIComponent(userId)}/Images/Primary${query}`);
  }

  async activePlayback(displayConfig: DisplayConfig): Promise<NowPlayingState | undefined> {
    return (await this.activePlaybacks(displayConfig))[0];
  }

  async activePlaybacks(displayConfig: DisplayConfig): Promise<NowPlayingState[]> {
    if (!this.configured()) return [];
    const sessions = await this.getJson<JellyfinItem[]>("/Sessions");
    const includeAllUsers = isAllUsers(displayConfig.playback_user);
    const activeSessions = sessions.filter((entry) => {
      const userName = entry.UserName ?? entry.User?.Name;
      const item = entry.NowPlayingItem;
      return (includeAllUsers || userName?.toLowerCase() === displayConfig.playback_user.toLowerCase())
        && item;
    });
    const playbacks: NowPlayingState[] = [];
    for (const session of activeSessions) {
      const item = session.NowPlayingItem as JellyfinItem;
      const libraryName = await this.nowPlayingLibraryName(item);
      if (libraryName && normalizedNameSet(displayConfig.now_playing.ignored_libraries).has(libraryName.toLowerCase())) {
        const userName = String(session.UserName ?? session.User?.Name ?? displayConfig.playback_user);
        const title = String(item.Name ?? "Unknown item");
        console.log(`Ignoring Jellyfin Now Playing session from library "${libraryName}" for user "${userName}": ${title}`);
        continue;
      }
      playbacks.push(await this.nowPlayingFromSession(session, displayConfig, libraryName));
    }
    return playbacks;
  }

  private async nowPlayingFromSession(session: JellyfinItem, displayConfig: DisplayConfig, libraryName?: string): Promise<NowPlayingState> {
    const item = session.NowPlayingItem as JellyfinItem;
    const jellyfinUser = String(session.UserName ?? session.User?.Name ?? displayConfig.playback_user);
    const mediaWallUser = isAllUsers(displayConfig.playback_user)
      ? jellyfinUser
      : displayConfig.users[0]?.name ?? displayConfig.playback_user;
    const sessionKey = [
      "jellyfin",
      session.Id,
      session.DeviceId,
      session.Client,
      session.DeviceName,
      item.Id
    ].filter(Boolean).join(":");
    const activityAt = jellyfinTimestamp(session.LastActivityDate ?? session.LastPlaybackCheckIn ?? session.NowPlayingItem?.DateCreated);
    const playbackPositionTicks = numberOrUndefined(session.PlayState?.PositionTicks);
    const isAudio = item.MediaType === "Audio" || item.Type === "Audio";
    if (!isAudio) {
      const displayItem = await this.displayItemForVideo(item).catch(() => item);
      const artwork = this.artworkFromItem(displayItem, displayItem.Name ?? item.SeriesName ?? item.Name ?? "Now Playing", displayItem.Type ?? item.Type ?? "Media");
      return {
        source: "jellyfin",
        user: jellyfinUser,
        displayUser: mediaWallUser,
        displayUserAvatarUrl: await this.userAvatarUrl(jellyfinUser, displayConfig),
        playing: true,
        paused: Boolean(session.PlayState?.IsPaused),
        sessionKey,
        activityAt,
        playbackPositionTicks,
        title: item.Name,
        year: item.ProductionYear,
        seasonNumber: item.ParentIndexNumber,
        episodeNumber: item.IndexNumber,
        seriesName: item.SeriesName,
        logoText: displayItem.Name ?? item.SeriesName ?? item.Name,
        itemId: item.Id,
        libraryName,
        artwork,
        signature: `${artwork?.itemId ?? displayItem.Id ?? item.Id}:${item.Id}`
      };
    }

    const artistName = this.artistName(item, displayConfig.display.music_artist_images);
    const artistId = this.artistId(item, displayConfig.display.music_artist_images);
    const artist = artistId ? await this.getItem(artistId).catch(() => undefined) : await this.findArtist(artistName).catch(() => undefined);
    const artwork = artist
      ? this.artworkFromItem(artist, artist.Name ?? artistName ?? "Artist", "MusicArtist")
      : this.artworkFromItem(item, artistName ?? item.Album ?? item.Name ?? "Music", "Audio");

    return {
      source: "jellyfin",
      user: jellyfinUser,
      displayUser: mediaWallUser,
      displayUserAvatarUrl: await this.userAvatarUrl(jellyfinUser, displayConfig),
      playing: true,
      paused: Boolean(session.PlayState?.IsPaused),
      sessionKey,
      activityAt,
      playbackPositionTicks,
      title: item.Name,
      artist: artistName,
      album: item.Album,
      logoText: artist?.Name ?? artistName,
      itemId: item.Id,
      artistId: artist?.Id ?? artistId,
      artistName: artist?.Name ?? artistName,
      libraryName,
      albumArtUrl: item.Id ? this.imageUrl(item.Id, "Primary", 0, item.ImageTags?.Primary) : undefined,
      artwork,
      signature: artist?.Id ?? artistId ?? artistName ?? item.Id
    };
  }

  async randomArtwork(displayConfig: DisplayConfig): Promise<ArtworkRef | undefined> {
    if (!this.configured()) return fallbackArtwork();
    const userId = await this.userIdFor(this.browseUser(displayConfig));
    const views = await this.getJson<{ Items?: JellyfinItem[] }>(`/Users/${encodeURIComponent(userId)}/Views`);
    const allEnabled = displayConfig.libraries.some((name) => name.toLowerCase() === "all");
    const enabled = new Set(displayConfig.libraries.map((name) => name.toLowerCase()));
    const libraryOrder = new Map(displayConfig.libraries.map((name, index) => [name.toLowerCase(), index]));
    const parentViews = (views.Items ?? [])
      .filter((view) => allEnabled || enabled.has(String(view.Name ?? "").toLowerCase()))
      .sort((left, right) =>
        (libraryOrder.get(String(left.Name ?? "").toLowerCase()) ?? Number.MAX_SAFE_INTEGER)
        - (libraryOrder.get(String(right.Name ?? "").toLowerCase()) ?? Number.MAX_SAFE_INTEGER)
      )
      .map((view) => ({
        id: view.Id as string | undefined,
        type: String(view.CollectionType ?? view.Type ?? "").toLowerCase()
      }))
      .filter((view) => Boolean(view.id));

    const batches = parentViews.length ? shuffle(parentViews) : [{ id: undefined, type: "" }];
    for (const parent of batches) {
      const items = parent.type === "music"
        ? await this.musicArtistItems(userId, parent.id, displayConfig.display.music_artist_images, "Random", 40)
        : await this.randomMediaItems(userId, parent.id);
      const item = items.find((entry) =>
        (entry.BackdropImageTags?.length ?? 0) > 0
        && (!displayConfig.display.require_logos || Boolean(entry.ImageTags?.Logo))
      );
      const artwork = item ? this.artworkFromItem(item, item.Name ?? "Untitled", item.Type ?? "Media") : undefined;
      if (artwork) return artwork;
    }
    return fallbackArtwork();
  }

  async browseLibraries(displayConfig: DisplayConfig) {
    if (!this.configured()) return [];
    const userId = await this.userIdFor(this.browseUser(displayConfig));
    const views = await this.getJson<{ Items?: JellyfinItem[] }>(`/Users/${encodeURIComponent(userId)}/Views`);
    const allEnabled = displayConfig.libraries.some((name) => name.toLowerCase() === "all");
    const enabled = new Set(displayConfig.libraries.map((name) => name.toLowerCase()));
    return (views.Items ?? [])
      .filter((view) => allEnabled || enabled.has(String(view.Name ?? "").toLowerCase()))
      .map((view) => ({ id: view.Id, name: view.Name, type: view.CollectionType ?? view.Type }));
  }

  async browseItems(parentId: string, playbackUser?: string, libraryType?: string, musicArtistImages: DisplayConfig["display"]["music_artist_images"] = "artists") {
    const userId = playbackUser ? await this.userIdFor(playbackUser) : undefined;
    const isMusic = libraryType === "music";
    if (isMusic && userId) {
      const artists = await this.musicArtistItems(userId, parentId, musicArtistImages, "SortName", 10_000);
      return artists.flatMap((item) => this.browseEntriesForItem(item, item.Name ?? "Artist", "MusicArtist"));
    }
    const baseParams = new URLSearchParams({
      ParentId: parentId,
      Recursive: "true",
      SortBy: "SortName",
      Fields: "ImageTags,BackdropImageTags,PrimaryImageAspectRatio",
      IncludeItemTypes: "Movie,Series"
    });
    if (userId) baseParams.set("UserId", userId);
    const items = await this.pagedItems("/Items", baseParams, 200);
    return items.flatMap((item) => this.browseEntriesForItem(item, item.Name ?? "Untitled", item.Type ?? "Media"));
  }

  browseUser(displayConfig: DisplayConfig) {
    const spaceUser = displayConfig.users.find((user) => user.jellyfin_user && !isAllUsers(user.jellyfin_user));
    if (spaceUser?.jellyfin_user) return spaceUser.jellyfin_user;
    const configuredUser = Object.values(this.config.users).find((user) => user.jellyfin_user && !isAllUsers(user.jellyfin_user));
    return configuredUser?.jellyfin_user ?? displayConfig.playback_user;
  }

  async artworkForItem(itemId: string, imageIndex = 0) {
    const item = await this.getItem(itemId);
    const displayItem = await this.displayItemForVideo(item).catch(() => item);
    return this.artworkFromItem(displayItem, displayItem.Name ?? item.SeriesName ?? item.Name ?? "Untitled", displayItem.Type ?? item.Type ?? "Media", imageIndex);
  }

  async artworkForVideoPartTitle(title: string, imageIndex = 0) {
    const movie = await this.findMovieForVideoPart({ Name: title, Type: "Video" });
    return movie ? this.artworkFromItem(movie, movie.Name ?? title, movie.Type ?? "Movie", imageIndex) : undefined;
  }

  async artworkForArtistName(name?: string) {
    const artist = await this.findArtist(name);
    return artist ? this.artworkFromItem(artist, artist.Name ?? name ?? "Artist", "MusicArtist") : undefined;
  }

  private async seriesForEpisode(item: JellyfinItem) {
    if (item.SeriesId) {
      const series = await this.getItem(item.SeriesId).catch(() => undefined);
      if (series) return series;
    }
    if (item.SeriesName) {
      const series = await this.findSeries(item.SeriesName).catch(() => undefined);
      if (series) return series;
    }
    return item;
  }

  private async displayItemForVideo(item: JellyfinItem) {
    if (item.Type === "Episode") return this.seriesForEpisode(item);
    if (item.Type === "Video" && item.ParentId) {
      const parent = await this.getItem(item.ParentId).catch(() => undefined);
      if (parent?.Type === "Movie") return parent;
    }
    if (item.Type === "Video") {
      const movie = await this.findMovieForVideoPart(item).catch(() => undefined);
      if (movie) return movie;
    }
    return item;
  }

  private async findMovieForVideoPart(item: JellyfinItem) {
    for (const title of moviePartSearchTitles(String(item.Name ?? ""))) {
      const params = new URLSearchParams({
        SearchTerm: title,
        IncludeItemTypes: "Movie",
        Recursive: "true",
        Limit: "8",
        Fields: "ImageTags,BackdropImageTags"
      });
      const response = await this.getJson<{ Items?: JellyfinItem[] }>(`/Items?${params}`);
      const normalizedTitle = normalizeMovieTitle(title);
      const matches = response.Items ?? [];
      const exact = matches.find((entry) => normalizeMovieTitle(String(entry.Name ?? "")) === normalizedTitle);
      if (exact) return exact;
      const close = matches.find((entry) => {
        const entryTitle = normalizeMovieTitle(String(entry.Name ?? ""));
        return entryTitle.length > 4 && (normalizedTitle.includes(entryTitle) || entryTitle.includes(normalizedTitle));
      });
      if (close) return close;
      if (matches[0]) return matches[0];
    }
    return undefined;
  }

  private async getItem(itemId: string) {
    return this.getJson<JellyfinItem>(`/Items/${encodeURIComponent(itemId)}`);
  }

  private async findSeries(name?: string) {
    if (!name) return undefined;
    const params = new URLSearchParams({
      SearchTerm: name,
      IncludeItemTypes: "Series",
      Recursive: "true",
      Limit: "5",
      Fields: "ImageTags,BackdropImageTags"
    });
    const response = await this.getJson<{ Items?: JellyfinItem[] }>(`/Items?${params}`);
    return (response.Items ?? []).find((entry) => String(entry.Name ?? "").toLowerCase() === name.toLowerCase())
      ?? response.Items?.[0];
  }

  private async findArtist(name?: string) {
    if (!name) return undefined;
    const params = new URLSearchParams({
      SearchTerm: name,
      IncludeItemTypes: "MusicArtist",
      Recursive: "true",
      Limit: "1",
      Fields: "ImageTags,BackdropImageTags"
    });
    const response = await this.getJson<{ Items?: JellyfinItem[] }>(`/Items?${params}`);
    return response.Items?.[0];
  }

  private async nowPlayingLibraryName(item: JellyfinItem) {
    if (!item.Id) return undefined;
    const ancestors = await this.getJson<JellyfinItem[]>(`/Items/${encodeURIComponent(item.Id)}/Ancestors`)
      .catch(() => [] as JellyfinItem[]);
    const library = ancestors.find((ancestor) => {
      const type = String(ancestor.Type ?? "");
      return type === "CollectionFolder" || Boolean(ancestor.CollectionType);
    }) ?? ancestors[0];
    return library?.Name ? String(library.Name) : undefined;
  }

  private async randomMediaItems(userId: string, parentId?: string) {
    const params = new URLSearchParams({
      Recursive: "true",
      SortBy: "Random",
      Limit: "25",
      ImageTypes: "Backdrop",
      Fields: "PrimaryImageAspectRatio,ImageTags,BackdropImageTags",
      UserId: userId,
      IncludeItemTypes: "Movie,Series"
    });
    if (parentId) params.set("ParentId", parentId);
    const response = await this.getJson<{ Items?: JellyfinItem[] }>(`/Items?${params}`);
    return response.Items ?? [];
  }

  private async musicArtistItems(
    userId: string,
    parentId: string | undefined,
    role: DisplayConfig["display"]["music_artist_images"],
    sortBy: "Random" | "SortName",
    limit: number
  ) {
    const fetchArtists = (albumArtists: boolean, nextSortBy = sortBy, nextLimit = limit) =>
      this.fetchMusicArtists(userId, parentId, albumArtists, nextSortBy, nextLimit);
    const albumArtists = role === "albumartists" || role === "both"
      ? await fetchArtists(true)
      : await fetchArtists(true, "SortName", 10_000);
    const artists = role !== "albumartists" ? await fetchArtists(false) : [];

    if (role === "albumartists") return albumArtists;
    if (role === "both") return dedupeItems([...albumArtists, ...artists]);

    const albumArtistKeys = new Set(albumArtists.map(artistIdentityKey));
    return artists.filter((artist) => !albumArtistKeys.has(artistIdentityKey(artist)));
  }

  private async fetchMusicArtists(
    userId: string,
    parentId: string | undefined,
    albumArtists: boolean,
    sortBy: "Random" | "SortName",
    limit: number
  ) {
    const params = new URLSearchParams({
      Recursive: "true",
      SortBy: sortBy,
      SortOrder: "Ascending",
      Fields: "PrimaryImageAspectRatio,ImageTags,BackdropImageTags",
      UserId: userId
    });
    if (parentId) params.set("ParentId", parentId);
    const endpoint = albumArtists ? "/Artists/AlbumArtists" : "/Artists";
    if (sortBy === "Random") {
      params.set("Limit", String(limit));
      const response = await this.getJson<{ Items?: JellyfinItem[] }>(`${endpoint}?${params}`);
      return response.Items ?? [];
    }
    return this.pagedItems(endpoint, params, 200, limit);
  }

  private async pagedItems(endpoint: string, baseParams: URLSearchParams, pageSize: number, maxItems = 10_000) {
    const items: JellyfinItem[] = [];
    let startIndex = 0;
    while (items.length < maxItems) {
      const params = new URLSearchParams(baseParams);
      params.set("StartIndex", String(startIndex));
      params.set("Limit", String(Math.min(pageSize, maxItems - items.length)));
      const response = await this.getJson<{ Items?: JellyfinItem[]; TotalRecordCount?: number }>(`${endpoint}?${params}`);
      const page = response.Items ?? [];
      items.push(...page);
      startIndex += page.length;
      if (!page.length || startIndex >= (response.TotalRecordCount ?? startIndex)) break;
    }
    return items;
  }

  private async userIdFor(name: string) {
    const normalized = name.toLowerCase();
    const cached = this.userIds.get(normalized);
    if (cached) return cached;

    const users = await this.getJson<JellyfinItem[]>("/Users");
    const user = users.find((entry) => String(entry.Name ?? "").toLowerCase() === normalized);
    if (!user?.Id) throw new Error(`Jellyfin user not found: ${name}`);
    this.userIds.set(normalized, user.Id);
    return user.Id;
  }

  private artworkFromItem(item: JellyfinItem, title: string, mediaType: string, imageIndex = 0): ArtworkRef | undefined {
    const backdropTags = item.BackdropImageTags ?? [];
    const hasBackdrop = backdropTags.length > 0;
    const fallbackPrimary = item.ImageTags?.Primary;
    const logoTag = item.ImageTags?.Logo;
    if (!hasBackdrop && !fallbackPrimary && !logoTag) return undefined;
    const chosenIndex = hasBackdrop ? Math.min(imageIndex, backdropTags.length - 1) : 0;
    return {
      source: "jellyfin",
      itemId: item.Id,
      title,
      mediaType,
      year: item.ProductionYear,
      imageType: hasBackdrop ? "Backdrop" : "Primary",
      imageIndex: chosenIndex,
      backdropCount: backdropTags.length || 1,
      backdropUrl: hasBackdrop ? this.imageUrl(item.Id, "Backdrop", chosenIndex, backdropTags[chosenIndex]) : undefined,
      logoUrl: logoTag ? this.imageUrl(item.Id, "Logo", 0, logoTag) : undefined,
      thumbUrl: fallbackPrimary ? this.imageUrl(item.Id, "Primary", 0, fallbackPrimary) : undefined,
      backdropTags,
      primaryTag: fallbackPrimary,
      logoTag
    };
  }

  private browseEntriesForItem(item: JellyfinItem, title: string, mediaType: string) {
    const backdropCount = item.BackdropImageTags?.length ?? 0;
    if (backdropCount > 0) {
      const artwork = this.artworkFromItem(item, title, mediaType, 0);
      return [{
        id: `${item.Id}:Backdrop:0`,
        itemId: item.Id,
        name: title,
        type: mediaType,
        thumbUrl: artwork?.backdropUrl,
        backdropCount,
        artwork
      }];
    }
    return [];
  }

  async userAvatarUrl(name: string, displayConfig: DisplayConfig) {
    const user = await this.userFor(name).catch(() => undefined);
    return user?.Id ? this.userImageUrl(user.Id, user.PrimaryImageTag, displayConfig.display.nowplaying_text.user_avatar_resize) : undefined;
  }

  private artistName(item: JellyfinItem, role: DisplayConfig["display"]["music_artist_images"]) {
    if (role === "albumartists") return item.AlbumArtist ?? item.AlbumArtists?.[0]?.Name;
    if (role === "both") return item.Artists?.[0] ?? item.AlbumArtist ?? item.AlbumArtists?.[0]?.Name;
    return item.Artists?.[0];
  }

  private artistId(item: JellyfinItem, role: DisplayConfig["display"]["music_artist_images"]) {
    if (role === "albumartists") return item.AlbumArtists?.[0]?.Id;
    if (role === "both") return item.ArtistItems?.[0]?.Id ?? item.AlbumArtists?.[0]?.Id;
    return item.ArtistItems?.[0]?.Id;
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchWithFallback(path);
    if (!response.ok) throw new Error(`Jellyfin ${response.status} for ${path}`);
    return response.json() as Promise<T>;
  }

  private async userFor(name: string) {
    const users = await this.getJson<JellyfinItem[]>("/Users");
    return users.find((entry) => String(entry.Name ?? "").toLowerCase() === name.toLowerCase());
  }

  private async fetchWithFallback(path: string): Promise<Response> {
    const separator = path.startsWith("/") ? "" : "/";
    const bases = this.candidateBaseUrls();
    let lastError: unknown;

    for (const base of bases) {
      try {
        const response = await fetch(`${base}${separator}${path}`, {
          headers: this.headers,
          signal: AbortSignal.timeout(6500)
        });
        this.workingBaseUrl = base;
        return response;
      } catch (error) {
        lastError = error;
        if (base === this.baseUrl) {
          console.warn(`Jellyfin request to configured URL failed; trying Docker host gateway for ${path}`);
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Unable to reach Jellyfin for ${path}`);
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

function shuffle<T>(input: T[]) {
  return [...input].sort(() => Math.random() - 0.5);
}

function jellyfinTimestamp(value: unknown) {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function artistIdentityKey(item: JellyfinItem) {
  return String(item.Id ?? item.Name ?? "").toLowerCase();
}

function dedupeItems(items: JellyfinItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = artistIdentityKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isAllUsers(name: string) {
  return name.toLowerCase() === "all";
}

function normalizedNameSet(names: string[]) {
  return new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean));
}

function moviePartSearchTitles(name: string) {
  const stripped = name
    .replace(/^\s*(?:disc|disk|part|cd|dvd|bd|blu[- ]?ray)?\s*\d+\s*[-_.:) ]+/i, "")
    .replace(/\s+(?:disc|disk|part|cd|dvd|bd|blu[- ]?ray)\s*\d+\s*$/i, "")
    .trim();
  return [...new Set([
    stripped,
    stripped.replace(/\s+episode\b.*$/i, "").trim(),
    stripped.replace(/\s+disc\b.*$/i, "").trim(),
    stripped.replace(/\s+part\b.*$/i, "").trim()
  ].filter((title) => title.length > 2))];
}

function moviePartSearchTitle(name: string) {
  return moviePartSearchTitles(name)[0] ?? name.trim();
}

function normalizeMovieTitle(name: string) {
  return moviePartSearchTitle(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function fallbackArtwork(): ArtworkRef {
  return {
    source: "fallback",
    itemId: "fallback",
    title: "MediaWall",
    mediaType: "Fallback",
    imageType: "Backdrop",
    imageIndex: 0,
    backdropCount: 1,
    backdropUrl: "/fallback.svg"
  };
}

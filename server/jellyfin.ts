import type { AppConfig, ArtworkRef, DisplayConfig, NowPlayingState } from "./types.js";
import { logger } from "./logger.js";
import fs from "node:fs/promises";
import path from "node:path";

type JellyfinItem = Record<string, any>;

export class JellyfinClient {
  private workingBaseUrl?: string;
  private userIds = new Map<string, string>();
  private libraryNames = new Map<string, string>();
  private missingMusicBackdropWarnings = new Set<string>();
  private collectionCache?: { checkedAt: number; collections: Array<{ id: string; name: string; itemIds: Set<string> }> };
  private collectionLoad?: Promise<Array<{ id: string; name: string; itemIds: Set<string> }>>;
  private usersCache?: JellyfinItem[];

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

  async loadUsers() {
    if (!this.configured()) return [];
    let users: JellyfinItem[];
    try {
      users = await this.getJson<JellyfinItem[]>("/Users");
      await this.writeMetadataCache("jellyfin-users.json", users);
    } catch (error) {
      const persisted = await this.readMetadataCache<JellyfinItem[]>("jellyfin-users.json");
      if (!persisted) throw error;
      users = persisted;
      logger.warn("Jellyfin user directory refresh failed; using the persisted startup cache", error);
    }
    this.usersCache = users;
    this.userIds.clear();
    for (const user of users) {
      if (user.Id && user.Name) this.userIds.set(String(user.Name).toLowerCase(), String(user.Id));
    }
    return users.map((user) => ({
      id: String(user.Id ?? ""),
      name: String(user.Name ?? ""),
      primaryImageTag: typeof user.PrimaryImageTag === "string" ? user.PrimaryImageTag : undefined
    })).filter((user) => user.id && user.name);
  }

  async warmCollections() {
    if (!this.configured()) return 0;
    let collections: Array<{ id: string; name: string; itemIds: Set<string> }>;
    try {
      collections = await this.collectionsWithItems(true);
    } catch (error) {
      const persisted = await this.readPersistedCollections();
      if (!persisted) throw error;
      collections = persisted;
      this.collectionCache = { checkedAt: Date.now(), collections };
      logger.warn("Jellyfin collection refresh failed; using the persisted startup cache", error);
    }
    return collections.length;
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
        logger.info(`Ignoring Jellyfin Now Playing session from library "${libraryName}" for user "${userName}": ${title}`);
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

    const musicItem = await this.musicDisplayItem(item, displayConfig.display.music_artist_images);
    const artistRefs = this.artistRefs(musicItem, displayConfig.display.music_artist_images);
    const artistArtworks = await Promise.all(artistRefs.map(async (ref) => {
      const artist = ref.id ? await this.getItem(ref.id).catch(() => undefined) : await this.findArtist(ref.name).catch(() => undefined);
      const artwork = artist ? this.artworkFromItem(artist, artist.Name ?? ref.name ?? "Artist", "MusicArtist") : undefined;
      return { artist, artwork, name: artist?.Name ?? ref.name };
    }));
    const selectedArtist = artistArtworks.find((candidate) => candidate.artwork?.backdropUrl)
      ?? artistArtworks.find((candidate) => candidate.artwork)
      ?? { artist: undefined, artwork: undefined, name: this.artistName(musicItem, displayConfig.display.music_artist_images) };
    const artistName = selectedArtist.name ?? this.artistName(musicItem, displayConfig.display.music_artist_images);
    const artistId = selectedArtist.artist?.Id ?? this.artistId(musicItem, displayConfig.display.music_artist_images);
    const rawArtwork = selectedArtist.artwork
      ?? this.artworkFromItem(musicItem, artistName ?? musicItem.Album ?? musicItem.Name ?? "Music", "Audio");
    const artwork = this.ensureNowPlayingBackdrop(rawArtwork, artistName ?? musicItem.Album ?? musicItem.Name ?? "Music");
    const logo = await this.musicLogoPresentation(item, musicItem, selectedArtist, displayConfig.display.music_logo_artist);
    const displayArtwork = {
      ...artwork,
      logoUrl: logo.logoUrl,
      logoTag: logo.logoTag
    };

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
      title: musicItem.Name ?? item.Name,
      artist: artistName,
      album: musicItem.Album ?? item.Album,
      logoText: logo.text,
      itemId: musicItem.Id ?? item.Id,
      artistId: selectedArtist.artist?.Id ?? artistId,
      artistName: selectedArtist.artist?.Name ?? artistName,
      libraryName,
      albumArtUrl: musicItem.Id ? this.imageUrl(musicItem.Id, "Primary", 0, musicItem.ImageTags?.Primary) : undefined,
      artwork: displayArtwork,
      signature: selectedArtist.artist?.Id ?? artistId ?? artistName ?? item.Id
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
        && (!displayConfig.display.require_logos || itemHasLogo(entry))
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

  async collectionMatchForItem(itemIds: Array<string | undefined>, displayConfig: DisplayConfig, mediaWallUser?: string) {
    const config = displayConfig.now_playing.collections;
    if (!config.enabled) return undefined;
    const normalizedIds = itemIds.filter((id): id is string => Boolean(id));
    if (!normalizedIds.length) return undefined;
    const collections = await this.collectionsWithItems();
    const matches = collections.filter((collection) => normalizedIds.some((id) => collection.itemIds.has(id)));
    if (!matches.length) return undefined;
    if (config.global.enabled) {
      return {
        collectionName: matches[0]?.name,
        sound: config.global.sound,
        user_transition_image: config.global.user_transition_image,
        image_size: config.global.image_size
      };
    }
    for (const group of config.groups) {
      if (!collectionGroupAllowsUser(group.users, mediaWallUser)) continue;
      const matchedCollection = matches.find((collection) =>
        group.title_regexes.some((pattern) => regexMatches(pattern, collection.name))
      );
      if (!matchedCollection) continue;
      return {
        collectionName: matchedCollection.name,
        sound: group.sound,
        user_transition_image: group.user_transition_image,
        image_size: group.image_size
      };
    }
    return undefined;
  }

  private async collectionsWithItems(force = false) {
    const cached = this.collectionCache;
    if (!force && cached) return cached.collections;
    if (this.collectionLoad) return this.collectionLoad;
    this.collectionLoad = (async () => {
      const params = new URLSearchParams({
        IncludeItemTypes: "BoxSet",
        Recursive: "true",
        SortBy: "SortName",
        Fields: "BasicSyncInfo,ChildCount"
      });
      const collections = await this.pagedItems("/Items", params, 200);
      const withItems = await Promise.all(collections.filter((collection) => collection.Id).map(async (collection) => {
        const itemIds = await this.collectionItemIds(String(collection.Id)).catch((error) => {
          logger.warn(`Jellyfin collection lookup failed for "${collection.Name ?? collection.Id}"`, error);
          return new Set<string>();
        });
        return { id: String(collection.Id), name: String(collection.Name ?? "Collection"), itemIds };
      }));
      this.collectionCache = { checkedAt: Date.now(), collections: withItems };
      await this.writeMetadataCache("jellyfin-collections.json", withItems.map((collection) => ({
        id: collection.id,
        name: collection.name,
        itemIds: [...collection.itemIds]
      })));
      return withItems;
    })();
    try {
      return await this.collectionLoad;
    } finally {
      this.collectionLoad = undefined;
    }
  }

  private async collectionItemIds(collectionId: string) {
    const params = new URLSearchParams({
      ParentId: collectionId,
      Recursive: "true",
      Fields: "SeriesId,ParentId"
    });
    const items = await this.pagedItems("/Items", params, 200);
    const ids = new Set<string>();
    for (const item of items) {
      if (item.Id) ids.add(String(item.Id));
      if (item.SeriesId) ids.add(String(item.SeriesId));
      if (item.ParentId) ids.add(String(item.ParentId));
    }
    return ids;
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
    return (response.Items ?? []).find((entry) => String(entry.Name ?? "").toLowerCase() === name.toLowerCase())
      ?? response.Items?.[0];
  }

  private async musicDisplayItem(item: JellyfinItem, role: DisplayConfig["display"]["music_artist_images"]) {
    const enriched = item.Id
      ? await this.getItem(String(item.Id)).catch(() => item)
      : item;
    if (role === "artists") return enriched;

    const album = await this.albumForMusicItem(enriched);
    const albumArtistRefs = album ? this.albumArtistRefs(album) : [];
    if (!album || albumArtistRefs.length === 0) return enriched;

    const albumArtistName = albumArtistRefs[0]?.name;
    logger.debug(
      `Jellyfin album artist metadata supplied by album "${album.Name ?? enriched.Album ?? "unknown"}" for track "${enriched.Name ?? item.Name}": ${albumArtistName ?? "unknown"}`
    );
    return {
      ...enriched,
      AlbumArtist: albumArtistName ?? enriched.AlbumArtist,
      AlbumArtists: albumArtistRefs.map((ref) => ({ Id: ref.id, Name: ref.name })).filter((ref) => ref.Id || ref.Name),
      AlbumId: enriched.AlbumId ?? album.Id,
      Album: enriched.Album ?? album.Name
    };
  }

  private albumArtistRefs(album: JellyfinItem) {
    const refs: Array<{ id?: string; name?: string }> = [];
    const seen = new Set<string>();
    const add = (id?: string, name?: string) => {
      const cleanName = typeof name === "string" ? name.trim() : undefined;
      const key = id ? `id:${id}` : cleanName ? `name:${cleanName.toLowerCase()}` : undefined;
      if (!key || seen.has(key)) return;
      seen.add(key);
      refs.push({ id, name: cleanName });
    };

    for (const artist of album.AlbumArtists ?? []) {
      const names = splitArtistCredit(artist.Name);
      if (names.length > 1) {
        for (const name of names) add(undefined, name);
      } else {
        add(artist.Id, artist.Name);
      }
    }
    for (const name of splitArtistCredit(album.AlbumArtist)) add(undefined, name);

    // On MusicAlbum items, Jellyfin may expose album artists as Artists/ArtistItems.
    for (const artist of album.ArtistItems ?? []) {
      const names = splitArtistCredit(artist.Name);
      if (names.length > 1) {
        for (const name of names) add(undefined, name);
      } else {
        add(artist.Id, artist.Name);
      }
    }
    for (const artist of album.Artists ?? []) {
      for (const name of splitArtistCredit(artist)) add(undefined, name);
    }

    return refs;
  }

  private async albumForMusicItem(item: JellyfinItem) {
    const albumId = item.AlbumId ?? item.ParentId;
    if (albumId) {
      const album = await this.getItem(String(albumId)).catch(() => undefined);
      if (album) return album;
    }
    if (!item.Album) return undefined;
    const params = new URLSearchParams({
      SearchTerm: String(item.Album),
      IncludeItemTypes: "MusicAlbum",
      Recursive: "true",
      Limit: "5",
      Fields: "ImageTags,BackdropImageTags,AlbumArtist,AlbumArtists"
    });
    const response = await this.getJson<{ Items?: JellyfinItem[] }>(`/Items?${params}`).catch(() => undefined);
    const normalizedAlbum = String(item.Album).toLowerCase();
    return (response?.Items ?? []).find((entry) => String(entry.Name ?? "").toLowerCase() === normalizedAlbum)
      ?? response?.Items?.[0];
  }

  private async nowPlayingLibraryName(item: JellyfinItem) {
    if (!item.Id) return undefined;
    const cached = this.libraryNames.get(item.Id);
    if (cached) return cached;
    const ancestors = await this.getJson<JellyfinItem[]>(`/Items/${encodeURIComponent(item.Id)}/Ancestors`)
      .catch(() => [] as JellyfinItem[]);
    const library = ancestors.find((ancestor) => {
      const type = String(ancestor.Type ?? "");
      return type === "CollectionFolder" || Boolean(ancestor.CollectionType);
    }) ?? ancestors[0];
    if (!library?.Name) return undefined;
    const name = String(library.Name);
    this.libraryNames.set(item.Id, name);
    return name;
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

    const users = this.usersCache ?? await this.getJson<JellyfinItem[]>("/Users");
    const user = users.find((entry) => String(entry.Name ?? "").toLowerCase() === normalized);
    if (!user?.Id) throw new Error(`Jellyfin user not found: ${name}`);
    this.userIds.set(normalized, user.Id);
    return user.Id;
  }

  private artworkFromItem(item: JellyfinItem, title: string, mediaType: string, imageIndex = 0): ArtworkRef | undefined {
    const backdropTags = item.BackdropImageTags ?? [];
    const hasBackdrop = backdropTags.length > 0;
    const fallbackPrimary = item.ImageTags?.Primary;
    const logoTag = item.ImageTags?.Logo ?? item.ParentLogoImageTag;
    const logoItemId = item.ImageTags?.Logo ? item.Id : item.ParentLogoItemId;
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
      logoUrl: logoTag && logoItemId ? this.imageUrl(logoItemId, "Logo", 0, logoTag) : undefined,
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
    if (role === "albumartists") return this.albumArtistName(item);
    if (role === "both") return item.Artists?.[0] ?? this.albumArtistName(item);
    return item.Artists?.[0];
  }

  private artistId(item: JellyfinItem, role: DisplayConfig["display"]["music_artist_images"]) {
    if (role === "albumartists") return item.AlbumArtists?.[0]?.Id;
    if (role === "both") return item.ArtistItems?.[0]?.Id ?? item.AlbumArtists?.[0]?.Id;
    return item.ArtistItems?.[0]?.Id;
  }

  private artistRefs(item: JellyfinItem, role: DisplayConfig["display"]["music_artist_images"]) {
    const refs: Array<{ id?: string; name?: string }> = [];
    const seen = new Set<string>();
    const add = (id?: string, name?: string) => {
      const cleanName = typeof name === "string" ? name.trim() : undefined;
      const key = id ? `id:${id}` : cleanName ? `name:${cleanName.toLowerCase()}` : undefined;
      if (!key || seen.has(key)) return;
      seen.add(key);
      refs.push({ id, name: cleanName });
    };
    const addArtists = () => {
      for (const artist of item.ArtistItems ?? []) add(artist.Id, artist.Name);
      for (const name of item.Artists ?? []) add(undefined, name);
    };
    const addAlbumArtists = () => {
      const albumArtists = item.AlbumArtists ?? [];
      for (const artist of albumArtists) {
        const names = splitArtistCredit(artist.Name);
        if (names.length > 1) {
          for (const name of names) add(undefined, name);
        } else {
          add(artist.Id, artist.Name);
        }
      }
      if (albumArtists.length > 0) return;
      const split = splitArtistCredit(item.AlbumArtist);
      add(undefined, split[0] ?? item.AlbumArtist);
    };

    if (role === "artists") addArtists();
    else if (role === "albumartists") addAlbumArtists();
    else {
      addArtists();
      addAlbumArtists();
    }

    return refs;
  }

  private albumArtistName(item: JellyfinItem) {
    const splitAlbumArtist = splitArtistCredit(item.AlbumArtist);
    if (splitAlbumArtist[0]) return splitAlbumArtist[0];
    const first = item.AlbumArtists?.[0];
    const splitFirst = splitArtistCredit(first?.Name);
    return splitFirst[0] ?? first?.Name;
  }

  private async musicLogoPresentation(
    rawItem: JellyfinItem,
    musicItem: JellyfinItem,
    selectedArtist: { artist?: JellyfinItem; artwork?: ArtworkRef; name?: string },
    mode: DisplayConfig["display"]["music_logo_artist"]
  ) {
    if (mode === "albumartist") {
      return {
        text: selectedArtist.artist?.Name ?? selectedArtist.name ?? this.artistName(musicItem, "albumartists"),
        logoUrl: selectedArtist.artwork?.logoUrl,
        logoTag: selectedArtist.artwork?.logoTag
      };
    }

    const text = this.trackArtistCredit(rawItem, musicItem)
      ?? selectedArtist.artist?.Name
      ?? selectedArtist.name
      ?? this.artistName(musicItem, "albumartists");
    const trackRefs = this.artistRefs(rawItem, "artists");
    const hasMultipleArtistCredit = splitArtistCredit(text).length > 1;
    const singleArtist = !hasMultipleArtistCredit && trackRefs.length === 1
      ? await this.artistFromRef(trackRefs[0]).catch(() => undefined)
      : undefined;
    const logoArtist = singleArtist;
    const logoArtwork = logoArtist ? this.artworkFromItem(logoArtist, logoArtist.Name ?? text ?? "Artist", "MusicArtist") : undefined;
    return {
      text,
      logoUrl: logoArtwork?.logoUrl,
      logoTag: logoArtist?.ImageTags?.Logo
    };
  }

  private async artistFromRef(ref: { id?: string; name?: string }) {
    if (ref.id) return this.getItem(ref.id);
    return this.findArtist(ref.name);
  }

  private trackArtistCredit(rawItem: JellyfinItem, musicItem: JellyfinItem) {
    const artists = [
      ...this.cleanStringArray(rawItem.Artists),
      ...this.cleanStringArray(rawItem.ArtistItems?.map((artist: JellyfinItem) => artist.Name))
    ].flatMap((artist) => splitArtistCredit(artist));
    if (artists.length > 0) return [...new Set(artists)].join(" • ");
    return formatArtistCredit(rawItem.Artist ?? musicItem.Artist);
  }

  private cleanStringArray(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  }

  private nonEmptyArray(value: unknown): value is unknown[] {
    return Array.isArray(value) && value.length > 0;
  }

  private ensureNowPlayingBackdrop(artwork: ArtworkRef | undefined, title: string): ArtworkRef {
    if (!artwork) {
      this.warnMissingMusicBackdrop(`fallback:${title}`, title);
      return fallbackArtworkForTitle(title, "MusicArtist");
    }
    if (artwork.backdropUrl) return artwork;
    this.warnMissingMusicBackdrop(`${artwork.itemId}:${artwork.primaryTag ?? ""}:${artwork.logoTag ?? ""}`, title);
    return {
      ...artwork,
      imageType: "Backdrop",
      imageIndex: 0,
      backdropUrl: "/fallback.svg",
      backdropCount: 1,
      backdropTags: []
    };
  }

  private warnMissingMusicBackdrop(key: string, title: string) {
    if (this.missingMusicBackdropWarnings.has(key)) return;
    this.missingMusicBackdropWarnings.add(key);
    logger.warn(`Jellyfin music artwork for "${title}" has no artist backdrop; using MediaWall fallback backdrop.`);
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchWithFallback(path);
    if (!response.ok) throw new Error(`Jellyfin ${response.status} for ${path}`);
    return response.json() as Promise<T>;
  }

  private async userFor(name: string) {
    const users = this.usersCache ?? await this.getJson<JellyfinItem[]>("/Users");
    return users.find((entry) => String(entry.Name ?? "").toLowerCase() === name.toLowerCase());
  }

  private async readPersistedCollections() {
    const persisted = await this.readMetadataCache<Array<{ id: string; name: string; itemIds: string[] }>>("jellyfin-collections.json");
    return persisted?.map((collection) => ({
      id: collection.id,
      name: collection.name,
      itemIds: new Set(collection.itemIds)
    }));
  }

  private async readMetadataCache<T>(fileName: string): Promise<T | undefined> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.config.library_scan.directory, fileName), "utf8")) as T;
    } catch {
      return undefined;
    }
  }

  private async writeMetadataCache(fileName: string, value: unknown) {
    await fs.mkdir(this.config.library_scan.directory, { recursive: true });
    await fs.writeFile(path.join(this.config.library_scan.directory, fileName), JSON.stringify(value));
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
          logger.warn(`Jellyfin request to configured URL failed; trying Docker host gateway for ${path}`);
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

function collectionGroupAllowsUser(users: string[], mediaWallUser?: string) {
  if (!users.length) return true;
  const current = String(mediaWallUser ?? "").trim().toLowerCase();
  return users.some((user) => {
    const normalized = user.trim().toLowerCase();
    return normalized === "all" || normalized === current;
  });
}

function regexMatches(pattern: string, value: string) {
  try {
    const normalized = pattern.startsWith("(?i)") ? pattern.slice(4) : pattern;
    return new RegExp(normalized, "i").test(value);
  } catch {
    logger.warn(`Ignoring invalid collection title regex: ${pattern}`);
    return false;
  }
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

function splitArtistCredit(value: unknown) {
  if (typeof value !== "string") return [];
  return value
    .split(/\s*(?:;|,|\/|\+|&|\u2022|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b)\s*/i)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatArtistCredit(value: unknown) {
  const artists = splitArtistCredit(value);
  return artists.length > 1 ? artists.join(" • ") : artists[0];
}

function itemHasLogo(item: JellyfinItem) {
  return Boolean(item.ImageTags?.Logo || (item.ParentLogoItemId && item.ParentLogoImageTag));
}

export function fallbackArtwork(): ArtworkRef {
  return fallbackArtworkForTitle("MediaWall", "Fallback");
}

function fallbackArtworkForTitle(title: string, mediaType: string): ArtworkRef {
  return {
    source: "fallback",
    itemId: "fallback",
    title,
    mediaType,
    imageType: "Backdrop",
    imageIndex: 0,
    backdropCount: 1,
    backdropUrl: "/fallback.svg"
  };
}

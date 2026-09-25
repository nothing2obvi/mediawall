import crypto from "node:crypto";
import type { AppConfig, NowPlayingSource, NowPlayingState } from "./types.js";

type JsonObject = Record<string, unknown>;

type ExternalMusicSession = NowPlayingState & {
  receivedAt: number;
  expiresAt: number;
  tokenUser: string;
  listenType: string;
};

export class ExternalMusicReceiver {
  private sessions = new Map<string, ExternalMusicSession>();

  constructor(private readonly config: AppConfig) {}

  configured() {
    return this.config.external_music.enabled;
  }

  validateToken(rawToken: string | undefined) {
    if (!this.config.external_music.enabled || !rawToken) return undefined;
    const mapping = this.config.external_music.tokens[rawToken];
    if (!mapping?.user) return undefined;
    return mapping;
  }

  activePlaybacks(mediaWallUser: string): NowPlayingState[] {
    if (!this.config.external_music.enabled) return [];
    const now = Date.now();
    const active: NowPlayingState[] = [];
    for (const [key, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(key);
        continue;
      }
      if (session.mediaWallUser !== mediaWallUser) continue;
      active.push(session);
    }
    return active;
  }

  receiveSubmitListens(rawToken: string | undefined, body: unknown) {
    const tokenMapping = this.validateToken(rawToken);
    if (!tokenMapping) return { ok: false as const, status: 401, error: "Invalid ListenBrainz token" };
    if (!isObject(body)) return { ok: false as const, status: 400, error: "Request body must be an object" };
    const listenType = readString(body.listen_type) || "single";
    const payload = Array.isArray(body.payload) ? body.payload : [];
    if (!payload.length) return { ok: false as const, status: 400, error: "payload is required" };
    if (listenType !== "playing_now") {
      return { ok: true as const, status: 200, accepted: 0, ignored: payload.length };
    }

    let accepted = 0;
    for (const item of payload) {
      const session = this.sessionFromPayload(tokenMapping.user, tokenMapping.source, listenType, item);
      if (!session) continue;
      // A playing_now event supersedes the previous track for this user/service.
      // Track-specific identity remains on the session for artwork and UI updates.
      const playbackKey = JSON.stringify([
        session.mediaWallUser,
        session.source,
        session.source === "external_music" ? session.externalMusicSource?.trim().toLowerCase() : undefined
      ]);
      this.sessions.set(playbackKey, session);
      accepted += 1;
    }
    return { ok: true as const, status: 200, accepted, ignored: payload.length - accepted };
  }

  private sessionFromPayload(mediaWallUser: string, mappedSource: string | undefined, listenType: string, item: unknown): ExternalMusicSession | undefined {
    if (!isObject(item) || !isObject(item.track_metadata)) return undefined;
    const metadata = item.track_metadata;
    const additional = isObject(metadata.additional_info) ? metadata.additional_info : {};
    const mbidMapping = isObject(metadata.mbid_mapping) ? metadata.mbid_mapping : {};
    const track = readString(metadata.track_name);
    const artist = readString(metadata.artist_name);
    if (!track || !artist) return undefined;

    const artists = readStringArray(additional.artist_names);
    const albumArtist = firstString(
      additional.albumartist,
      additional.album_artist,
      additional.albumArtist,
      additional.release_artist_name,
      readStringArray(additional.release_artist_names)[0]
    );
    const sourceName = firstString(
      mappedSource,
      additional.music_service_name,
      additional.music_service,
      additional.media_player,
      additional.submission_client
    );
    const source = normalizeExternalMusicSource(sourceName);
    const albumArtUrl = firstString(
      additional.release_image_url,
      additional.album_art_url,
      additional.albumart,
      additional.cover_art_url,
      additional.coverart,
      additional.artwork_url
    );
    const durationSeconds = readDurationSeconds(additional.duration, additional.duration_ms);
    const sessionLifetimeSeconds = Math.max(
      this.config.external_music.session_timeout_seconds,
      Math.min(durationSeconds ?? 0, 12 * 60 * 60)
    );
    const externalIds = externalIdsFrom(metadata, additional, mbidMapping);
    const now = Date.now();
    const sessionKey = [
      source,
      mediaWallUser,
      readString(additional.origin_url),
      readString(additional.spotify_id),
      readString(additional.isrc),
      track,
      artist
    ].filter(Boolean).join(":");
    const signature = crypto.createHash("sha256").update(JSON.stringify({
      source,
      mediaWallUser,
      track,
      artist,
      album: readString(metadata.release_name),
      albumArtist,
      durationSeconds,
      externalIds
    })).digest("hex").slice(0, 16);

    return {
      source,
      user: mediaWallUser,
      displayUser: mediaWallUser,
      mediaWallUser,
      playing: true,
      paused: false,
      title: track,
      artist,
      artists: artists.length ? artists : splitArtistCredit(artist),
      albumArtist,
      album: readString(metadata.release_name),
      logoText: artist,
      albumArtUrl,
      durationSeconds,
      externalMusicSource: sourceName,
      externalIds,
      itemId: readString(additional.spotify_id) ?? readString(additional.origin_url) ?? signature,
      sessionKey,
      signature,
      activityAt: now,
      receivedAt: now,
      // Bridge the gap between a track ending and the next playing_now update.
      // A replacement event still takes over immediately during this grace period.
      expiresAt: now + (Math.max(5, sessionLifetimeSeconds) + this.config.external_music.track_transition_grace_seconds) * 1000,
      tokenUser: mediaWallUser,
      listenType
    };
  }
}

export function authorizationToken(value: string | undefined) {
  const match = value?.match(/^Token\s+(.+)$/i);
  return match?.[1]?.trim();
}

function normalizeExternalMusicSource(value: string | undefined): NowPlayingSource {
  const normalized = value?.trim().toLowerCase().replace(/[\s.-]+/g, "_") ?? "";
  if (normalized.includes("spotify")) return "spotify";
  if (normalized.includes("apple") || normalized.includes("music_apple_com")) return "apple_music";
  return "external_music";
}

function externalIdsFrom(metadata: JsonObject, additional: JsonObject, mbidMapping: JsonObject) {
  return removeEmpty({
    isrc: readString(additional.isrc),
    originUrl: readString(additional.origin_url),
    spotifyId: readString(additional.spotify_id),
    spotifyAlbumId: readString(additional.spotify_album_id),
    spotifyArtistIds: readStringArray(additional.spotify_artist_ids),
    spotifyAlbumArtistIds: readStringArray(additional.spotify_album_artist_ids),
    albumArtistMbids: firstStringArray(
      additional.album_artist_mbids,
      additional.albumartist_mbids,
      additional.release_artist_mbids
    ),
    trackMbid: firstString(additional.track_mbid, additional.recording_mbid, mbidMapping.recording_mbid),
    recordingMbid: firstString(additional.recording_mbid, mbidMapping.recording_mbid),
    releaseMbid: firstString(additional.release_mbid, mbidMapping.release_mbid),
    releaseGroupMbid: readString(additional.release_group_mbid),
    artistMbids: readStringArray(additional.artist_mbids).length
      ? readStringArray(additional.artist_mbids)
      : readStringArray(mbidMapping.artist_mbids),
    rawAdditionalInfo: additional,
    rawMbidMapping: mbidMapping,
    rawTrackMetadata: metadata
  });
}

function readDurationSeconds(duration: unknown, durationMs: unknown) {
  const seconds = Number(duration);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds);
  const ms = Number(durationMs);
  if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 1000);
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const stringValue = readString(value);
    if (stringValue) return stringValue;
  }
  return undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function firstStringArray(...values: unknown[]) {
  for (const value of values) {
    const result = readStringArray(value);
    if (result.length) return result;
  }
  return [];
}

function splitArtistCredit(value: string) {
  return value.split(/\s*,\s*|\s+&\s+|\s+feat\.?\s+/i).map((entry) => entry.trim()).filter(Boolean);
}

function removeEmpty(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined
      && value !== ""
      && (!Array.isArray(value) || value.length > 0)
      && (!isObject(value) || Object.keys(value).length > 0)
    )
  );
}

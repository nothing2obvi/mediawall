import type { DisplayConfig, MediaWallUser, NowPlayingState } from "./types.js";
import type { JellyfinClient } from "./jellyfin.js";
import type { SourceAvatarStore } from "./source-avatars.js";
import { anonymousIdentity, mappedUserKey } from "./anonymous-mode.js";

export function playbackOwner(state: NowPlayingState, fallback: MediaWallUser, users: Record<string, MediaWallUser>) {
  const key = mappedUserKey(state, fallback, users);
  return {key, user: users[key] ?? fallback};
}

export async function userAvatar(state: NowPlayingState, user: MediaWallUser, space: DisplayConfig,
  jellyfin: Pick<JellyfinClient, "userAvatarUrl">, avatars: Pick<SourceAvatarStore, "avatarUrl" | "anonymousUrl">) {
  const anonymous = anonymousIdentity(space.anonymous_mode, state.mediaWallUserKey ?? user.key ?? user.name, avatars.anonymousUrl());
  // Keep real avatars out of anonymous candidates, including transition-only cases.
  if (anonymous) return anonymous.avatarUrl ?? anonymous.transitionAvatarUrl;
  const mapped = user.jellyfin_user;
  const jellyfinName = mapped && mapped.trim().toLowerCase() !== "all" ? mapped
    : state.source === "jellyfin" ? state.user : undefined;
  const image = jellyfinName ? await jellyfin.userAvatarUrl(jellyfinName, space).catch(() => undefined) : undefined;
  return image ?? avatars.avatarUrl(state.source, user.key ?? user.name)
    ?? (user.key && user.key !== user.name ? avatars.avatarUrl(state.source, user.name) : undefined);
}

export function dedupePlaybackCandidates(candidates: NowPlayingState[]) {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = [candidate.source, candidate.user, candidate.sessionKey, candidate.itemId, candidate.artistId, candidate.signature].filter(Boolean).join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

import type { DisplayConfig } from "./types.js";

/** Additional per-space restrictions on actual Jellyfin session usernames. */
export function jellyfinUserAllowed(username: unknown, filters: DisplayConfig["jellyfin"]) {
  const normalize = (value: string) => value.trim().toLowerCase();
  const user = typeof username === "string" ? normalize(username) : "";
  const included = filters?.included_jellyfin_users ?? [];
  const excluded = filters?.excluded_jellyfin_users ?? [];
  return (!included.length || included.some(name => normalize(name) === user))
    && !excluded.some(name => normalize(name) === user);
}

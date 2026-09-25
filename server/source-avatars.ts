import fs from "node:fs";
import path from "node:path";
import type { NowPlayingSource } from "./types.js";

const supportedAvatarExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export class SourceAvatarStore {
  private readonly root: string;

  constructor(appRoot: string) {
    const mountedRoot = path.resolve("/app/avatars");
    this.root = fs.existsSync(mountedRoot) ? mountedRoot : path.resolve(appRoot, "app/avatars");
  }

  avatarUrl(source: NowPlayingSource, username: string) {
    return this.avatarPath(source, username)
      ? `/api/avatars/${encodeURIComponent(source)}/${encodeURIComponent(username)}`
      : undefined;
  }

  avatarPath(source: string, username: string) {
    if (source !== "spotify" || !safeSegment(username)) return undefined;
    const directory = path.resolve(this.root, source);
    if (!directory.startsWith(`${this.root}${path.sep}`) || !fs.existsSync(directory)) return undefined;
    const normalizedUsername = username.trim().toLowerCase();
    const filename = fs.readdirSync(directory)
      .filter((entry) => supportedAvatarExtensions.has(path.extname(entry).toLowerCase()))
      .sort((left, right) => left.localeCompare(right))
      .find((entry) => path.basename(entry, path.extname(entry)).toLowerCase() === normalizedUsername);
    if (!filename) return undefined;
    const candidate = path.resolve(directory, filename);
    if (!candidate.startsWith(`${directory}${path.sep}`)) return undefined;
    return fs.statSync(candidate).isFile() ? candidate : undefined;
  }
}

function safeSegment(value: string) {
  return Boolean(value.trim()) && !value.includes("/") && !value.includes("\\") && !value.includes("\0");
}

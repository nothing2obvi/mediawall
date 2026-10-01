import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NowPlayingSource } from "./types.js";

const supportedAvatarExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export class SourceAvatarStore {
  private readonly root: string;
  private readonly bundledAnonymous: string;

  constructor(appRoot: string) {
    const mountedRoot = path.resolve("/app/avatars");
    this.root = fs.existsSync(mountedRoot) ? mountedRoot : path.resolve(appRoot, "app/avatars");
    this.bundledAnonymous = path.resolve(appRoot,"default-assets/anonymous.png");
  }

  anonymousPath() {
    const files=fs.existsSync(this.root) ? fs.readdirSync(this.root).sort() : [];
    // An administrator's alternate format overrides the shipped PNG.
    for(const extension of [".webp",".jpg",".jpeg",".png"]) {
      for(const filename of files) {
        if(path.basename(filename,path.extname(filename)).toLowerCase()!=="anonymous" || path.extname(filename).toLowerCase()!==extension)continue;
        const file=path.join(this.root,filename),stat=fs.lstatSync(file,{throwIfNoEntry:false});
        if(stat?.isFile() && !stat.isSymbolicLink())return file;
      }
    }
    const fallback=fs.lstatSync(this.bundledAnonymous,{throwIfNoEntry:false});
    return fallback?.isFile() && !fallback.isSymbolicLink() ? this.bundledAnonymous : undefined;
  }
  anonymousUrl() {
    const file=this.anonymousPath();if(!file)return undefined;
    try {return `/api/avatars/anonymous?v=${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0,24)}`;}catch{return undefined;}
  }
  watchAnonymous(changed:()=>void) {
    let previous=this.anonymousUrl();
    const timer=setInterval(()=>{const current=this.anonymousUrl();if(current!==previous){previous=current;changed();}},1000);
    timer.unref();return ()=>clearInterval(timer);
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

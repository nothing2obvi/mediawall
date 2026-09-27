import { decodeImageUpload, type ImageUpload } from "./image-upload.js";
import { logger } from "./logger.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig, ArtworkRef, DisplaySnapshot } from "./types.js";
import type { JellyfinClient } from "./jellyfin.js";
import type { NavidromeClient } from "./navidrome.js";
import { ExternalArtworkResolver, imageDimensions } from "./external-artwork.js";

export type ImageType = "Logo" | "Backdrop";
export type EditorSource = "jellyfin" | "local" | "external";
export interface EditorImage { id: string; type: ImageType; url: string; provider?: string; width?: number; height?: number; rating?: number; language?: string }
export interface EditorTarget { source: EditorSource; id: string; name: string; kind: string }
export interface EditorModel { target: EditorTarget; revision: string; images: EditorImage[] }
export interface ImageAdapter {
  list(target: EditorTarget): Promise<EditorImage[]>;
  search(target: EditorTarget, type: ImageType): Promise<EditorImage[]>;
  add(target: EditorTarget, image: EditorImage): Promise<void>;
  upload(target: EditorTarget, type: ImageType, image: ImageUpload): Promise<void>;
  remove(target: EditorTarget, image: EditorImage): Promise<void>;
  move(target: EditorTarget, from: number, to: number): Promise<void>;
}
export function editorTarget(snapshot: DisplaySnapshot): EditorTarget {
  const playing = snapshot.state.mode === "now-playing" ? snapshot.nowPlaying : undefined;
  const art = playing?.artwork ?? snapshot.state.current;
  if (!art || art.source === "fallback") throw new Error("No editable artwork is displayed");
  const source = art.source === "jellyfin" ? "jellyfin" : art.source === "navidrome" ? "local" : "external";
  const name = art.mediaType === "MusicArtist" ? (playing?.artworkArtist ?? playing?.albumArtist ?? art.title) : art.title;
  return { source, id: art.itemId, name, kind: art.mediaType };
}
export function artworkAfterEdit(model: EditorModel, previous?: ArtworkRef): ArtworkRef {
  const backdrops = model.images.filter(image => image.type === "Backdrop");
  const logo = model.images.find(image => image.type === "Logo");
  return {
    ...previous, source: model.target.source === "external" ? "fetched" : model.target.source === "local" ? "navidrome" : "jellyfin",
    itemId: model.target.id, title: model.target.name, mediaType: model.target.kind,
    imageType: "Backdrop", imageIndex: 0, backdropCount: backdrops.length,
    backdropUrl: backdrops[0]?.url, thumbUrl: backdrops[0]?.url, logoUrl: logo?.url,
    backdropTags: undefined, logoTag: undefined, edited: true
  };
}
const revision = (images: EditorImage[]) => crypto.createHash("sha256").update(JSON.stringify(images)).digest("hex");
export class ImageEditor {
  private sessions = new Map<string, { space: string; target: EditorTarget; candidates: Map<string, EditorImage>; touched: number }>();
  private locks = new Set<string>();
  constructor(private adapters: Record<EditorSource, ImageAdapter>) {}
  async open(space: string, snapshot: DisplaySnapshot) {
    const target = editorTarget(snapshot);
    const model = await this.model(target);
    const id = crypto.randomUUID();
    for (const [key, session] of this.sessions) if (Date.now() - session.touched > 120_000) this.sessions.delete(key);
    this.sessions.set(id, { space, target, candidates: new Map(), touched: Date.now() });
    return { id, ...model };
  }
  close(id: string) { this.sessions.delete(id); }
  session(space: string, id: string) {
    const session = this.sessions.get(id);
    if (!session || session.space !== space || Date.now() - session.touched > 120_000) {
      this.sessions.delete(id); throw new Error("Editor session expired; reopen the editor");
    }
    session.touched = Date.now();
    return session;
  }
  async model(target: EditorTarget): Promise<EditorModel> {
    const images = await this.adapters[target.source].list(target);
    return { target, images, revision: revision(images) };
  }
  async search(space: string, id: string, type: ImageType) {
    if (type !== "Logo" && type !== "Backdrop") throw new Error("Unsupported image type");
    const session = this.session(space, id);
    const results = await this.adapters[session.target.source].search(session.target, type);
    for (const image of results) session.candidates.set(image.id, image);
    return results;
  }
  async mutate(space: string, id: string, body: { revision: string; action: string; imageId?: string; direction?: number; type?: ImageType; data?: string }) {
    const session = this.session(space, id), target = session.target;
    const key = `${target.source}:${target.id}`;
    if (this.locks.has(key)) throw new Error("Another edit is in progress; retry shortly");
    this.locks.add(key);
    try {
      const current = await this.model(target), adapter = this.adapters[target.source];
      if (body.revision !== current.revision) throw new Error("Artwork changed; reopen the editor before editing again");
      if (body.action === "upload") {
        if (body.type !== "Logo" && body.type !== "Backdrop") throw new Error("Unsupported image type");
        const upload = decodeImageUpload(body.data);
        await adapter.upload(target, body.type, upload);
        logger.info(`Artwork source=Upload destination=${target.source} type=${body.type}: saved 1 uploaded image (${upload.width}x${upload.height}); ${body.type === "Logo" ? "replaced logo" : "appended backdrop"}.`);
      } else if (body.action === "add") {
        const candidate = session.candidates.get(body.imageId ?? "");
        if (!candidate) throw new Error("Search result expired; search again");
        await adapter.add(target, candidate);
      } else {
        const image = current.images.find(i => i.id === body.imageId);
        if (!image) throw new Error("Image no longer exists");
        if (body.action === "delete") await adapter.remove(target, image);
        else if (body.action === "move" && image.type === "Backdrop" && (body.direction === -1 || body.direction === 1)) {
          const backdrops = current.images.filter(i => i.type === "Backdrop");
          const from = backdrops.findIndex(i => i.id === image.id), to = from + body.direction;
          if (to < 0 || to >= backdrops.length) throw new Error("Invalid backdrop position");
          await adapter.move(target, from, to);
        } else throw new Error("Unsupported image operation");
      }
      return await this.model(target);
    } finally { this.locks.delete(key); }
  }
}
export class JellyfinImageAdapter implements ImageAdapter {
  constructor(private client: JellyfinClient) {}
  private base(t: EditorTarget) { return `/Items/${encodeURIComponent(t.id)}`; }
  async list(t: EditorTarget): Promise<EditorImage[]> {
    const values = await this.client.imageEditorRequest(`${this.base(t)}/Images`) as Array<Record<string, any>>;
    return (values ?? []).filter(v => v.ImageType === "Logo" || v.ImageType === "Backdrop").map(v => ({
      id: `${v.ImageType}:${v.ImageIndex ?? 0}`, type: v.ImageType,
      url: this.client.imageUrl(t.id, v.ImageType, v.ImageIndex ?? 0, v.ImageTag),
      provider: "Jellyfin", width: v.Width, height: v.Height
    }));
  }
  async search(t: EditorTarget, type: ImageType): Promise<EditorImage[]> {
    const result = await this.client.imageEditorRequest(`${this.base(t)}/RemoteImages?type=${type}&limit=100&includeAllLanguages=true`);
    return (result?.Images ?? []).filter((v: any) => v.Type === type).map((v: any) => ({
      id: crypto.randomUUID(), type, url: v.Url, provider: v.ProviderName,
      width: v.Width, height: v.Height, language: v.Language, rating: v.CommunityRating
    }));
  }
  async add(t: EditorTarget, image: EditorImage) {
    await this.client.imageEditorRequest(`${this.base(t)}/RemoteImages/Download?${new URLSearchParams({ type: image.type, imageUrl: image.url })}`, "POST");
  }
  async upload(t: EditorTarget, type: ImageType, image: ImageUpload) {
    await this.client.imageEditorRequest(`${this.base(t)}/Images/${type}`, "POST", {body: image.buffer.toString("base64"), contentType: image.mime});
  }
  async remove(t: EditorTarget, image: EditorImage) {
    await this.client.imageEditorRequest(`${this.base(t)}/Images/${image.type}/${image.id.split(":")[1]}`, "DELETE");
  }
  async move(t: EditorTarget, from: number, to: number) {
    await this.client.imageEditorRequest(`${this.base(t)}/Images/Backdrop/${from}/Index?newIndex=${to}`, "POST");
  }
}
export class ExternalImageAdapter implements ImageAdapter {
  constructor(protected resolver: ExternalArtworkResolver) {}
  async search(t: EditorTarget, type: ImageType): Promise<EditorImage[]> {
    const mbid = t.source === "external" ? (await this.resolver.editorCache(t.id)).artistMbid : undefined;
    return (await this.resolver.searchArtistImages(t.name, type, mbid)).map(c => ({ id: crypto.randomUUID(), type, url: c.url, provider: c.provider, rating: c.score, language: c.language, width: c.width, height: c.height }));
  }
  async list(t: EditorTarget): Promise<EditorImage[]> {
    const cache = await this.resolver.editorCache(t.id);
    return [...(cache.logo ? [{ ...cache.logo, type: "Logo" as const }] : []), ...cache.backdrops.map(i => ({ ...i, type: "Backdrop" as const }))].map(i => ({
      id: i.file, type: i.type, url: `/api/external-artwork/artists/${t.id}/${encodeURIComponent(i.file)}`,
      provider: i.provider || undefined, width: i.width, height: i.height
    }));
  }
  async add(t: EditorTarget, image: EditorImage) {
    const cache = await this.resolver.editorCache(t.id);
    const downloaded = await this.resolver.editorDownload(t.id, {url: image.url, provider: image.provider ?? "unknown", score: 0}, image.type);
    const old = cache.logo;
    if (image.type === "Logo") cache.logo = downloaded; else cache.backdrops.push(downloaded);
    await this.resolver.editorSave(t.id, cache);
    if (image.type === "Logo" && old) await this.resolver.editorRemoveFile(t.id, old.file);
  }
  async upload(t: EditorTarget, type: ImageType, image: ImageUpload) {
    const cache = await this.resolver.editorCache(t.id);
    const stored = await this.resolver.editorStoreUpload(t.id, type, image);
    const old = cache.logo;
    if (type === "Logo") cache.logo = stored; else cache.backdrops.push(stored);
    await this.resolver.editorSave(t.id, cache);
    if (type === "Logo" && old) await this.resolver.editorRemoveFile(t.id, old.file);
  }
  async remove(t: EditorTarget, image: EditorImage) {
    const cache = await this.resolver.editorCache(t.id);
    if (image.type === "Logo") delete cache.logo; else cache.backdrops = cache.backdrops.filter(i => i.file !== image.id);
    await this.resolver.editorSave(t.id, cache);
    await this.resolver.editorRemoveFile(t.id, image.id);
  }
  async move(t: EditorTarget, from: number, to: number) {
    const cache = await this.resolver.editorCache(t.id);
    const [image] = cache.backdrops.splice(from, 1); cache.backdrops.splice(to, 0, image);
    await this.resolver.editorSave(t.id, cache);
  }
}
export class LocalImageAdapter extends ExternalImageAdapter {
  constructor(resolver: ExternalArtworkResolver, private navidrome: NavidromeClient, private config: AppConfig) { super(resolver); }
  private async files(t: EditorTarget) {
    const files = [...this.navidrome.localArtistImagePaths(t.id), this.navidrome.localArtistLogoPath(t.id)].filter((v): v is string => Boolean(v));
    for (const file of files) await this.safe(file);
    return files;
  }
  private async safe(file: string) {
    if ((await fs.lstat(file)).isSymbolicLink()) throw new Error("Symbolic-link artwork cannot be edited");
    const real = await fs.realpath(file);
    const roots = await Promise.all(this.config.navidrome.artwork.path_mappings.map(m => fs.realpath(m.mediawall).catch(() => "")));
    if (!roots.some(root => root && real.startsWith(root + path.sep))) throw new Error("Artwork is outside configured local music roots");
    return real;
  }
  private async directory(t: EditorTarget) {
    const files = await this.files(t);
    if (files.length) return path.dirname(files[0]);
    for (const m of this.config.navidrome.artwork.path_mappings) {
      const dir = path.resolve(m.mediawall, t.id);
      if (!dir.startsWith(path.resolve(m.mediawall) + path.sep)) continue;
      if (await fs.stat(dir).then(s => s.isDirectory()).catch(() => false)) return this.safe(dir);
    }
    throw new Error("No existing artist directory; refusing to create a media-library directory");
  }
  async list(t: EditorTarget): Promise<EditorImage[]> {
    const backdrops = this.navidrome.localArtistImagePaths(t.id), logo = this.navidrome.localArtistLogoPath(t.id);
    return Promise.all((await this.files(t)).map(async file => {
      const stat = await fs.stat(file), type = file === logo ? "Logo" as const : "Backdrop" as const;
      return { id: crypto.createHash("sha256").update(file).digest("hex"), type, provider: "Local",
        url: (type === "Logo" ? `/api/navidrome/local-artist-logo/${encodeURIComponent(t.id)}` : `/api/navidrome/local-artist/${encodeURIComponent(t.id)}/${backdrops.indexOf(file)}`) + `?v=${stat.mtimeMs}`,
        ...imageDimensions(await fs.readFile(file)) };
    }));
  }
  private async manifest(t: EditorTarget, backdrops: string[], logo?: string) {
    const dir = await this.directory(t);
    const file = path.join(dir, ".mediawall-images.json");
    const tmp = file + ".tmp";
    await fs.writeFile(tmp, JSON.stringify({ backdrops, logo: logo ?? null }, null, 2), {flag: "wx"});
    await fs.rename(tmp, file);
  }
  async add(t: EditorTarget, image: EditorImage) {
    const dir = await this.directory(t);
    const key = crypto.createHash("sha256").update(t.id).digest("hex").slice(0,24);
    const downloaded = await this.resolver.editorDownload(key, {url: image.url, provider: image.provider ?? "unknown", score: 0}, image.type);
    const source = this.resolver.assetPath("artists", key, downloaded.file);
    if (!source) throw new Error("Downloaded image missing");
    const backdrops = this.navidrome.localArtistImagePaths(t.id), oldLogo = this.navidrome.localArtistLogoPath(t.id);
    const target = path.join(dir, downloaded.file);
    await fs.copyFile(source, target, 1);
    await this.manifest(t, image.type === "Backdrop" ? [...backdrops, target] : backdrops, image.type === "Logo" ? target : oldLogo);
    if (image.type === "Logo" && oldLogo) { await this.safe(oldLogo); await fs.unlink(oldLogo); }
    await this.resolver.editorRemoveFile(key, downloaded.file);
  }
  async upload(t: EditorTarget, type: ImageType, image: ImageUpload) {
    const dir = await this.directory(t);
    const backdrops = this.navidrome.localArtistImagePaths(t.id), oldLogo = this.navidrome.localArtistLogoPath(t.id);
    const file = path.join(dir, `${type.toLowerCase()}-${crypto.randomUUID()}.${image.extension}`);
    await fs.writeFile(file, image.buffer, {flag: "wx"});
    try { await this.manifest(t, type === "Backdrop" ? [...backdrops, file] : backdrops, type === "Logo" ? file : oldLogo); }
    catch (error) { await fs.unlink(file).catch(() => undefined); throw error; }
    if (type === "Logo" && oldLogo) { await this.safe(oldLogo); await fs.unlink(oldLogo); }
  }
  async remove(t: EditorTarget, image: EditorImage) {
    const file = (await this.files(t)).find(f => crypto.createHash("sha256").update(f).digest("hex") === image.id);
    if (!file) throw new Error("Artwork file no longer exists");
    const backdrops = this.navidrome.localArtistImagePaths(t.id).filter(f => f !== file);
    const logo = image.type === "Logo" ? undefined : this.navidrome.localArtistLogoPath(t.id);
    await this.manifest(t, backdrops, logo);
    await fs.unlink(file);
  }
  async move(t: EditorTarget, from: number, to: number) {
    const backdrops = this.navidrome.localArtistImagePaths(t.id);
    const [file] = backdrops.splice(from, 1); backdrops.splice(to, 0, file);
    await this.manifest(t, backdrops, this.navidrome.localArtistLogoPath(t.id));
  }
}

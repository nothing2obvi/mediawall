import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./types.js";
export const cacheWarning = "Clear MediaWall artwork cache? This removes cached grid/wallpaper images and cached album covers. MediaWall Library images, original Jellyfin artwork, local/Navidrome artwork, audio files and personal assets are not removed.";
export async function clearArtworkCache(config: AppConfig, appRoot: string) {
  let removed = 0;
  const unlinkFile = async (file: string) => {
    const stat = await fs.lstat(file).catch(() => undefined);
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) return;
    await fs.unlink(file); removed++;
  };
  // Never recursively remove a configured directory: it may contain user files.
  const grid = path.resolve(config.library_scan.directory);
  if (!(await fs.lstat(grid).catch(() => undefined))?.isSymbolicLink()) {
    for (const name of await fs.readdir(grid).catch(() => [])) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const metadata = await fs.readFile(path.join(grid, name), "utf8").then(JSON.parse).catch(() => undefined);
      if (!metadata || typeof metadata.createdAt !== "number" || typeof metadata.status !== "number") continue;
      await unlinkFile(path.join(grid, name.replace(/\.json$/, ".bin")));
      await unlinkFile(path.join(grid, name));
    }
  }
  const configured = config.external_music.artwork.album_cache_directory;
  const external = path.resolve(appRoot, configured);
  for (const scope of ["albums"]) {
    const parent = path.join(external, scope);
    if ((await fs.lstat(external).catch(() => undefined))?.isSymbolicLink() || (await fs.lstat(parent).catch(() => undefined))?.isSymbolicLink()) continue;
    for (const key of await fs.readdir(parent).catch(() => [])) {
      if (!/^[a-f0-9]{24}$/.test(key)) continue;
      const dir = path.join(parent, key);
      if (!(await fs.lstat(dir)).isDirectory() || (await fs.lstat(dir)).isSymbolicLink()) continue;
      const metadataPath = path.join(dir, "metadata.json");
      const metadata = await fs.readFile(metadataPath, "utf8").then(JSON.parse).catch(() => undefined);
      if (!metadata || metadata.version !== 2 || typeof metadata.resolvedAt !== "number") continue;
      const images = [metadata.logo, metadata.cover, ...(metadata.backdrops ?? [])];
      for (const image of images) {
        if (typeof image?.file !== "string" || path.basename(image.file) !== image.file || !/\.(png|jpe?g|webp|gif|avif)$/i.test(image.file)) continue;
        await unlinkFile(path.join(dir, image.file));
      }
      await unlinkFile(metadataPath);
      // Only empty MediaWall cache directories are removed; unrelated files survive.
      await fs.rmdir(dir).catch(() => undefined);
    }
  }
  return removed;
}

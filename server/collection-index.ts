import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppConfig, DisplayConfig } from "./types.js";
import type { JellyfinClient } from "./jellyfin.js";
import { logger } from "./logger.js";

const indexVersion = 1;

export type IndexedCollectionPresentation = {
  collectionName: string;
  collectionNames: string[];
  sound?: string;
  images: Array<{ collectionName: string; file: string; size: number }>;
};

type StoredPresentation = IndexedCollectionPresentation & {
  collectionSounds: Array<{ collectionName: string; sound?: string }>;
};

type PresentationRow = {
  collection_name: string;
  collection_names: string;
  sound: string | null;
  images: string;
  collection_sounds: string;
};

export class JellyfinCollectionIndex {
  private database?: DatabaseSync;
  private building?: Promise<void>;

  constructor(private config: AppConfig, private jellyfin: JellyfinClient) {
    this.openExisting();
  }

  lookup(space: string, mediaWallUser: string, itemIds: Array<string | undefined>) {
    const ids = [...new Set(itemIds.filter((itemId): itemId is string => Boolean(itemId)))];
    if (!this.database || !ids.length) return undefined;
    try {
      const placeholders = ids.map(() => "?").join(",");
      const rows = this.database.prepare(`
        SELECT collection_name, collection_names, sound, images, collection_sounds
        FROM presentations
        WHERE space = ? AND mediawall_user = ? AND item_id IN (${placeholders})
      `).all(space, mediaWallUser, ...ids) as unknown as PresentationRow[];
      return mergePresentations(rows.map(rowToPresentation));
    } catch (error) {
      logger.warn("Jellyfin collection index lookup failed; using normal session behavior", error);
      return undefined;
    }
  }

  async rebuild() {
    if (this.building) return this.building;
    this.building = this.build().finally(() => {
      this.building = undefined;
    });
    return this.building;
  }

  private async build() {
    const relevantSpaces = Object.entries(this.config.spaces).filter(([, space]) =>
      space.now_playing.collections.enabled
      && (space.playback_source === "jellyfin" || space.playback_source === "both")
    );
    if (!relevantSpaces.length || !this.jellyfin.configured()) return;

    const includeAllCollections = relevantSpaces.some(([, space]) => space.now_playing.collections.global.enabled);
    const patterns = includeAllCollections ? [] : relevantSpaces.flatMap(([, space]) =>
      space.now_playing.collections.groups.flatMap((group) => group.title_regexes)
    );
    const regexes = patterns.map(compileRegex).filter((regex): regex is RegExp => Boolean(regex));
    const memberships = await this.jellyfin.collectionMemberships((name) =>
      includeAllCollections || regexes.some((regex) => regex.test(name))
    );

    const file = this.filePath();
    const temporary = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.rmSync(temporary, { force: true });
    const next = new DatabaseSync(temporary);
    let closed = false;
    try {
      next.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
      createSchema(next);
      next.exec("BEGIN IMMEDIATE");
      const insertMetadata = next.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
      insertMetadata.run("version", String(indexVersion));
      insertMetadata.run("built_at", new Date().toISOString());
      insertMetadata.run("config_fingerprint", configFingerprint(this.config));

      const insertMembership = next.prepare("INSERT INTO memberships (item_id, collection_id, collection_name) VALUES (?, ?, ?)");
      for (const collection of memberships) {
        for (const itemId of collection.itemIds) insertMembership.run(itemId, collection.id, collection.name);
      }

      const rows = next.prepare(`
        SELECT item_id, collection_id, collection_name FROM memberships
        ORDER BY item_id, collection_name COLLATE NOCASE, collection_id
      `).all() as unknown as Array<{ item_id: string; collection_id: string; collection_name: string }>;
      const grouped = groupMembershipRows(rows);
      const insertPresentation = next.prepare(`
        INSERT INTO presentations
          (space, mediawall_user, item_id, collection_name, collection_names, sound, images, collection_sounds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let resolvedCount = 0;
      for (const [spaceName, space] of relevantSpaces) {
        for (const user of space.users) {
          for (const [itemId, collections] of grouped) {
            const resolved = resolvePresentation(collections, space, user.name);
            if (!resolved) continue;
            insertPresentation.run(spaceName, user.name, itemId, resolved.collectionName,
              JSON.stringify(resolved.collectionNames), resolved.sound ?? null,
              JSON.stringify(resolved.images), JSON.stringify(resolved.collectionSounds));
            resolvedCount += 1;
          }
        }
      }
      next.exec("COMMIT");
      const check = next.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
      if (check?.integrity_check !== "ok") throw new Error(`collection index integrity check failed: ${check?.integrity_check ?? "unknown"}`);
      next.close();
      closed = true;

      fs.renameSync(temporary, file);
      const replacement = this.open(file);
      this.database?.close();
      this.database = replacement;
      for (const legacy of ["jellyfin-collections.json", "jellyfin-collection-index.json"]) {
        fs.rmSync(path.join(this.config.library_scan.directory, legacy), { force: true });
      }
      logger.info(`Jellyfin collection index complete: collections=${memberships.length} memberships=${grouped.size} resolved=${resolvedCount}`);
    } catch (error) {
      if (!closed) {
        try { next.exec("ROLLBACK"); } catch { /* The transaction may not have started. */ }
        try { next.close(); } catch { /* Preserve the original error. */ }
      }
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }

  private openExisting() {
    const file = this.filePath();
    if (!fs.existsSync(file)) return;
    try {
      this.database = this.open(file);
      const version = this.database.prepare("SELECT value FROM metadata WHERE key = 'version'").get() as { value?: string } | undefined;
      if (Number(version?.value) !== indexVersion) throw new Error("unsupported collection index format");
      const builtAt = this.database.prepare("SELECT value FROM metadata WHERE key = 'built_at'").get() as { value?: string } | undefined;
      const fingerprint = this.database.prepare("SELECT value FROM metadata WHERE key = 'config_fingerprint'").get() as { value?: string } | undefined;
      if (fingerprint?.value !== configFingerprint(this.config)) {
        logger.warn("Jellyfin collection index was built from different collection settings; it will remain available until the next configured scan rebuilds it");
      }
      logger.info(`Loaded Jellyfin collection index built ${builtAt?.value ?? "at an unknown time"}`);
    } catch (error) {
      try { this.database?.close(); } catch { /* Ignore close failures for an invalid index. */ }
      this.database = undefined;
      logger.warn("Jellyfin collection index could not be loaded; collection-specific behavior will remain disabled until a successful scan", error);
    }
  }

  private open(file: string) {
    return new DatabaseSync(file, { readOnly: true });
  }

  private filePath() {
    return path.join(this.config.library_scan.directory, "jellyfin-collection-index.sqlite");
  }
}

function createSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE memberships (
      item_id TEXT NOT NULL, collection_id TEXT NOT NULL, collection_name TEXT NOT NULL,
      PRIMARY KEY (item_id, collection_id)
    ) WITHOUT ROWID;
    CREATE TABLE presentations (
      space TEXT NOT NULL, mediawall_user TEXT NOT NULL, item_id TEXT NOT NULL,
      collection_name TEXT NOT NULL, collection_names TEXT NOT NULL, sound TEXT,
      images TEXT NOT NULL, collection_sounds TEXT NOT NULL,
      PRIMARY KEY (space, mediawall_user, item_id)
    ) WITHOUT ROWID;
  `);
}

function groupMembershipRows(rows: Array<{ item_id: string; collection_id: string; collection_name: string }>) {
  const grouped = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of rows) {
    const collections = grouped.get(row.item_id) ?? [];
    collections.push({ id: row.collection_id, name: row.collection_name });
    grouped.set(row.item_id, collections);
  }
  return grouped;
}

function resolvePresentation(collections: Array<{ id: string; name: string }>, space: DisplayConfig, mediaWallUser: string): StoredPresentation | undefined {
  const sorted = [...collections].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id));
  const matches = sorted.map((collection) => {
    if (space.now_playing.collections.global.enabled) return { collection, rule: space.now_playing.collections.global };
    const rule = space.now_playing.collections.groups.find((group) =>
      groupAllowsUser(group.users, mediaWallUser)
      && group.title_regexes.some((pattern) => compileRegex(pattern)?.test(collection.name)));
    return rule ? { collection, rule } : undefined;
  }).filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (!matches.length) return undefined;

  const images: StoredPresentation["images"] = [];
  const seenImages = new Set<string>();
  for (const match of matches) {
    const file = match.rule.user_transition_image;
    if (!file) continue;
    const key = `${file}:${match.rule.image_size}`;
    if (seenImages.has(key)) continue;
    seenImages.add(key);
    images.push({ collectionName: match.collection.name, file, size: match.rule.image_size });
  }
  return {
    collectionName: matches[0].collection.name,
    collectionNames: matches.map((match) => match.collection.name),
    sound: matches[0].rule.sound,
    collectionSounds: matches.map((match) => ({ collectionName: match.collection.name, sound: match.rule.sound })),
    images
  };
}

function rowToPresentation(row: PresentationRow): StoredPresentation {
  return {
    collectionName: row.collection_name,
    collectionNames: JSON.parse(row.collection_names) as string[],
    sound: row.sound ?? undefined,
    images: JSON.parse(row.images) as StoredPresentation["images"],
    collectionSounds: JSON.parse(row.collection_sounds) as StoredPresentation["collectionSounds"]
  };
}

function mergePresentations(entries: StoredPresentation[]): IndexedCollectionPresentation | undefined {
  if (!entries.length) return undefined;
  const sounds = new Map<string, string | undefined>();
  for (const entry of entries) for (const value of entry.collectionSounds) sounds.set(value.collectionName, value.sound);
  const collectionNames = [...sounds.keys()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  const firstName = collectionNames[0];
  if (!firstName) return undefined;
  const seenImages = new Set<string>();
  const images = entries.flatMap((entry) => entry.images)
    .sort((left, right) => left.collectionName.localeCompare(right.collectionName, undefined, { sensitivity: "base" }))
    .filter((image) => {
      const key = `${image.collectionName}:${image.file}:${image.size}`;
      if (seenImages.has(key)) return false;
      seenImages.add(key);
      return true;
    });
  return { collectionName: firstName, collectionNames, sound: sounds.get(firstName), images };
}

function compileRegex(pattern: string) {
  try {
    return new RegExp(pattern.startsWith("(?i)") ? pattern.slice(4) : pattern, "i");
  } catch {
    logger.warn(`Ignoring invalid collection title regex while building index: ${pattern}`);
    return undefined;
  }
}

function groupAllowsUser(users: string[], mediaWallUser: string) {
  const current = mediaWallUser.trim().toLowerCase();
  return !users.length || users.some((user) => user.trim().toLowerCase() === "all" || user.trim().toLowerCase() === current);
}

function configFingerprint(config: AppConfig) {
  const collectionConfig = Object.fromEntries(Object.entries(config.spaces).map(([name, space]) => [name, {
    users: space.users.map((user) => user.name), collections: space.now_playing.collections
  }]));
  return crypto.createHash("sha256").update(JSON.stringify(collectionConfig)).digest("hex");
}

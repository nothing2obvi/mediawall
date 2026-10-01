import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "./logger.js";

export type LibraryImage = { file: string; provider: string; sourceUrl: string; width?: number; height?: number };
export type ArtistRecord = { edited?: boolean; version: 2; configuration: string; resolvedAt: number; artist: string; artistMbid?: string; providers: string[]; logo?: LibraryImage; backdrops: LibraryImage[] };
const imageName = /^(logo|backdrop(?:-?\d+)?)\.(png|jpe?g|webp|gif|avif)$/i;
export const libraryWarning = "Clear MediaWall Library images? This deletes artist logos and backdrops, including manually added images and saved selections. It doesn't delete music, video, Jellyfin artwork, or Navidrome artwork.";
export class ArtistLibrary {
  readonly artists: string;
  private directories = new Map<string, string>();
  private revision = "";
  private pending?: Promise<boolean>;
  private writing = 0;
  get busy() {return this.writing > 0;}
  async mutation<T>(action:()=>Promise<T>):Promise<T> {this.writing++;try{return await action();}finally{this.writing--;}}
  constructor(readonly root: string) { this.artists = path.join(root, "Artists"); }
  private safeDirectory(dir: string) {
    for (const p of [this.root, this.artists, dir]) {
      const st = fs.lstatSync(p); if (!st.isDirectory() || st.isSymbolicLink()) throw new Error("Library paths must be real directories, not symbolic links");
    }
    if (path.dirname(dir) !== this.artists) throw new Error("Invalid artist folder");
    return dir;
  }
  directory(key: string) {
    const dir = this.directories.get(key); if (!dir) throw new Error("Unknown Library artist");
    return this.safeDirectory(dir);
  }
  asset(key: string, file: string) {
    if (!imageName.test(file) || path.basename(file) !== file) return undefined;
    try { const target = path.join(this.directory(key), file); const s = fs.lstatSync(target); if(!s.isFile() || s.isSymbolicLink())return undefined;
      const handle=fs.openSync(target,"r");const header=Buffer.alloc(32);try{fs.readSync(handle,header,0,32,0);}finally{fs.closeSync(handle);}
      const valid=header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || (header[0]===255&&header[1]===216&&header[2]===255) || ["GIF87a","GIF89a"].includes(header.toString("ascii",0,6)) || (header.toString("ascii",0,4)==="RIFF"&&header.toString("ascii",8,12)==="WEBP") || (header.toString("ascii",4,8)==="ftyp"&&/avif|avis/.test(header.toString("ascii",8)));
      return valid ? target : undefined; } catch { return undefined; }
  }
  async ensure(artist: string, key: string) {
    await fsp.mkdir(this.artists, {recursive:true});
    if (this.directories.has(key)) return this.directory(key);
    const existing = await this.find(artist); if (existing) { this.directories.set(key,this.directory(existing.key)); return this.directory(key); }
    let name = artist.normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").replace(/[. ]+$/g,"").slice(0,180) || "Artist";
    if (name === "." || name === "..") name = "Artist";
    let dir = path.join(this.artists,name);
    if (fs.existsSync(dir)) dir += ` (${key.slice(0,8)})`;
    await fsp.mkdir(dir,{recursive:true}); this.directories.set(key,dir); this.safeDirectory(dir);
    await this.save(key,{version:2,configuration:"",resolvedAt:0,artist,providers:[],backdrops:[]});
    return dir;
  }
  async read(key: string): Promise<ArtistRecord> {
    const dir = this.directory(key);
    let record: ArtistRecord;
    const meta = path.join(dir,".mediawall.json");
    try { if ((await fsp.lstat(meta)).isSymbolicLink()) throw new Error(); record=JSON.parse(await fsp.readFile(meta,"utf8")); }
    catch { record={version:2,configuration:"",resolvedAt:0,artist:path.basename(dir),providers:[],backdrops:[]}; }
    const old = new Map([...(record.backdrops ?? []), ...(record.logo ? [record.logo] : [])].map(i=>[i.file,i]));
    const names=(await fsp.readdir(dir)).filter(n=>this.asset(key,n)).sort((a,b)=>Number(a.match(/^backdrop-?(\d*)\./i)?.[1] || 0)-Number(b.match(/^backdrop-?(\d*)\./i)?.[1] || 0) || a.localeCompare(b,undefined,{numeric:true}));
    const image=(file:string): LibraryImage => old.get(file) ?? {file,provider:"Manually added",sourceUrl:"library"};
    const backdrops=names.filter(n=>/^backdrop/i.test(n));
    const ordered=[...(record.backdrops ?? []).map(i=>i.file).filter(n=>backdrops.includes(n)),...backdrops.filter(n=>!old.has(n))];
    record.backdrops=ordered.map(image); const logo=names.find(n=>/^logo\./i.test(n)); record.logo=logo ? image(logo) : undefined;
    return record;
  }
  async save(key:string,record:ArtistRecord) {
    const dir=this.directory(key);const temp=path.join(dir,`.mediawall-${crypto.randomUUID()}.tmp`);
    await fsp.writeFile(temp,JSON.stringify({...record,key},null,2),{flag:"wx"}); await fsp.rename(temp,path.join(dir,".mediawall.json"));
  }
  async find(artist:string) {
    for (const key of this.directories.keys()) { const record=await this.read(key).catch(()=>undefined); if(record?.artist.trim().toLowerCase()===artist.trim().toLowerCase()) return {key,record}; }
    return undefined;
  }
  keys() { return [...this.directories.keys()]; }
  async nextName(key:string,type:"Logo"|"Backdrop") {
    if(type==="Logo") return "logo";
    const names=await fsp.readdir(this.directory(key)); let i=0;
    while(names.some(n=>n.replace(/\.[^.]+$/,"") === (i ? `backdrop${i}` : "backdrop"))) i++;
    return i ? `backdrop${i}` : "backdrop";
  }
  async scan():Promise<boolean> {
    if(this.pending) return this.pending;
    this.pending=this.scanNow();try{return await this.pending;}finally{this.pending=undefined;}
  }
  private async scanNow() {
    if(this.busy) return false;
    await fsp.mkdir(this.artists,{recursive:true});
    if((await fsp.lstat(this.root)).isSymbolicLink() || (await fsp.lstat(this.artists)).isSymbolicLink()) throw new Error("Library must not be a symbolic link");
    const dirs=new Map<string,string>();const signatures:string[]=[];
    for(const entry of await fsp.readdir(this.artists,{withFileTypes:true})) {
      if(!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const dir=this.safeDirectory(path.join(this.artists,entry.name));let key=crypto.createHash("sha256").update(entry.name.trim().toLowerCase()).digest("hex").slice(0,24);
      const meta=path.join(dir,".mediawall.json");
      try {if(!(await fsp.lstat(meta)).isSymbolicLink()){const m=JSON.parse(await fsp.readFile(meta,"utf8"));if(/^[a-f0-9]{24}$/.test(m.key)) key=m.key;}}catch{}
      if(dirs.has(key)) {logger.warn(`Library: duplicate artist ID in ${entry.name}; using the folder name`);key=crypto.createHash("sha256").update(entry.name).digest("hex").slice(0,24);}
      dirs.set(key,dir);
      for(const file of await fsp.readdir(dir)) {
        if(!imageName.test(file) && file!==".mediawall.json") continue;
        const st=await fsp.lstat(path.join(dir,file)).catch(()=>undefined);if(st?.isFile()&&!st.isSymbolicLink())signatures.push(`${entry.name}/${file}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`);
      }
    }
    this.directories=dirs;const revision=signatures.sort().join("|");const changed=revision!==this.revision;this.revision=revision;return changed;
  }
  watch(onChange:()=>void) {
    let timer:NodeJS.Timeout|undefined;
    const refresh=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>{void this.scan().then(changed=>{if(changed)onChange();}).catch(e=>logger.warn("Library scan failed",e));},200);timer.unref();};
    let watcher:fs.FSWatcher|undefined;
    try {watcher=fs.watch(this.artists,{recursive:true},refresh);watcher.unref();watcher.on("error",e=>logger.warn("Library watcher unavailable; periodic checks remain active",e));}catch{logger.warn("Library watcher unavailable; using periodic checks");}
    const fallback=setInterval(refresh,3000);fallback.unref();
    return ()=>{watcher?.close();clearInterval(fallback);if(timer)clearTimeout(timer);};
  }
  async clear() {
    await this.scan();let removed=0;
    for(const key of this.keys()) {
      const dir=this.directory(key);
      for(const file of await fsp.readdir(dir)) {const target=this.asset(key,file);if(target){await fsp.unlink(target);removed++;}}
      // Preserve the artist identity and mark the empty selection as intentional.
      const record=await this.read(key);record.edited=true;record.logo=undefined;record.backdrops=[];await this.save(key,record);
    }
    await this.scan();return removed;
  }
  async migrate(legacyRoot:string) {
    const parent=path.join(legacyRoot,"artists");
    if(!fs.existsSync(parent))return;
    if((await fsp.lstat(legacyRoot)).isSymbolicLink()||(await fsp.lstat(parent)).isSymbolicLink())throw new Error("Refusing to migrate a symbolic-link cache");
    let count=0;
    for(const key of await fsp.readdir(parent)) {
      if(!/^[a-f0-9]{24}$/.test(key))continue;
      const dir=path.join(parent,key);if(!(await fsp.lstat(dir)).isDirectory()||(await fsp.lstat(dir)).isSymbolicLink())continue;
      const meta=path.join(dir,"metadata.json");
      if((await fsp.lstat(meta).catch(()=>undefined))?.isSymbolicLink())continue;
      const old:ArtistRecord|undefined=await fsp.readFile(meta,"utf8").then(JSON.parse).catch(()=>undefined);
      if(!old || old.version!==2 || typeof old.artist!=="string")continue;
      const found=await this.find(old.artist);const targetKey=found?.key ?? key;await this.ensure(old.artist,targetKey);
      const current=await this.read(targetKey);const target=this.directory(targetKey);
      const copy=async(image:LibraryImage|undefined,type:"Logo"|"Backdrop")=>{
        if(!image || path.basename(image.file)!==image.file || !/\.(png|jpe?g|webp|gif|avif)$/i.test(image.file))return undefined;
        const input=path.join(dir,image.file);const st=await fsp.lstat(input).catch(()=>undefined);if(!st?.isFile()||st.isSymbolicLink())return undefined;
        const file=(await this.nextName(targetKey,type))+path.extname(image.file).toLowerCase();
        await fsp.copyFile(input,path.join(target,file),fs.constants.COPYFILE_EXCL);count++;return {...image,file};
      };
      if(!current.logo)current.logo=await copy(old.logo,"Logo");
      for(const image of old.backdrops ?? []) {const imported=await copy(image,"Backdrop");if(imported)current.backdrops.push(imported);}
      current.edited=old.edited||current.edited;current.artistMbid=old.artistMbid;current.configuration=old.configuration;current.resolvedAt=old.resolvedAt;current.providers=old.providers;
      await this.save(targetKey,current);
      // Keep original files as a migration backup, but remove them from the legacy lookup.
      await fsp.rename(meta,path.join(dir,"migrated-metadata.json"));
    }
    if(count)logger.warn(`Migration: external artist cache is now MediaWall Library. Migrated ${count} images to ${this.artists}; originals remain as a backup. clear cache no longer deletes Library images; use clear library-images.`);
  }
}

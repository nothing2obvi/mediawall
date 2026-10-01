import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ArtistLibrary } from "./artist-library.js";
import { loadConfig } from "./config.js";
function png(){const b=Buffer.alloc(24);b.set([137,80,78,71,13,10,26,10]);b.writeUInt32BE(1920,16);b.writeUInt32BE(1080,20);return b;}
async function fixture(t:any){const root=await fs.mkdtemp(path.join(os.tmpdir(),"mediawall-library-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));const library=new ArtistLibrary(path.join(root,"library"));await library.scan();return {root,library};}
test("manual Library images are discovered, naturally ordered, and updated by the watcher",async t=>{
 const {library}=await fixture(t);const dir=path.join(library.artists,"Taylor Swift");await fs.mkdir(dir);
 for(const name of ["backdrop10.png","backdrop-2.png","backdrop.png","logo.png"])await fs.writeFile(path.join(dir,name),png());
 assert.equal(await library.scan(),true);const found=await library.find("taylor swift");assert.ok(found);
 assert.deepEqual(found.record.backdrops.map(i=>i.file),["backdrop.png","backdrop-2.png","backdrop10.png"]);
 const changed=new Promise<void>(resolve=>{const stop=library.watch(()=>{stop();resolve();});t.after(stop);});
 await fs.writeFile(path.join(dir,"backdrop3.png"),png());await Promise.race([changed,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error("Watcher did not update Library")),6000);t.after(()=>clearTimeout(timer));})]);
 assert.equal((await library.read(found.key)).backdrops.length,4);
 await fs.unlink(path.join(dir,"backdrop3.png"));await library.scan();assert.equal((await library.read(found.key)).backdrops.length,3);
});
test("Library clearing preserves media, unrecognized files, invalid images and symlink targets",async t=>{
 const {root,library}=await fixture(t);const key="a".repeat(24);const dir=await library.ensure("Artist",key);
 await fs.writeFile(path.join(dir,"backdrop.png"),png());await fs.writeFile(path.join(dir,"song.flac"),"audio");await fs.writeFile(path.join(dir,"backdrop1.png"),"actually not an image");
 const original=path.join(root,"private.png");await fs.writeFile(original,png());await fs.symlink(original,path.join(dir,"logo.png"));
 assert.equal(library.asset(key,"logo.png"),undefined);assert.equal(library.asset(key,"../private.png"),undefined);
 assert.equal(await library.clear(),1);assert.equal(await fs.readFile(path.join(dir,"song.flac"),"utf8"),"audio");assert.equal(await fs.readFile(path.join(dir,"backdrop1.png"),"utf8"),"actually not an image");assert.deepEqual(await fs.readFile(original),png());assert.equal((await library.read(key)).edited,true);
});
test("legacy migration preserves images and order and does not repeat on restart",async t=>{
 const {root,library}=await fixture(t);const key="b".repeat(24),old=path.join(root,"old","artists",key);await fs.mkdir(old,{recursive:true});
 for(const file of ["logo.png","backdrop-8.png","backdrop-2.png"])await fs.writeFile(path.join(old,file),png());
 await fs.writeFile(path.join(old,"metadata.json"),JSON.stringify({version:2,artist:"Artist",edited:true,configuration:"test",resolvedAt:1,providers:["fanart.tv"],logo:{file:"logo.png",provider:"fanart.tv"},backdrops:[{file:"backdrop-8.png",provider:"first"},{file:"backdrop-2.png",provider:"second"}]}));
 await library.migrate(path.join(root,"old"));await library.scan();let data=await library.read(key);assert.deepEqual(data.backdrops.map(i=>[i.file,i.provider]),[["backdrop.png","first"],["backdrop1.png","second"]]);assert.equal(data.edited,true);assert.ok(await fs.stat(path.join(old,"backdrop-8.png")));
 await library.migrate(path.join(root,"old"));assert.equal((await library.read(key)).backdrops.length,2);
 const restarted=new ArtistLibrary(library.root);await restarted.scan();assert.equal((await restarted.read(key)).logo?.file,"logo.png");
});
test("removed configuration names explain their replacements together",async t=>{
 const {root}=await fixture(t);const file=path.join(root,"config.yml"),previous=process.env.MEDIAWALL_CONFIG;t.after(()=>{if(previous===undefined)delete process.env.MEDIAWALL_CONFIG;else process.env.MEDIAWALL_CONFIG=previous;});process.env.MEDIAWALL_CONFIG=file;
 await fs.writeFile(file,"external_music:\n  artwork:\n    cache_directory: /old\n    cache_ttl_days: 30\nspaces:\n  wall:\n    playback_source: both\n    playback_user: primary\n");
 assert.throws(()=>loadConfig(),error=>{const message=String(error);return ["album_cache_directory","album_cache_ttl_days","jellyfin, navidrome, external-music, All","users: [primary]"].every(s=>message.includes(s));});
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { ImageEditor, JellyfinImageAdapter, LocalImageAdapter, ExternalImageAdapter, editorTarget, type EditorTarget } from "./image-editor.js";
import { ExternalArtworkResolver } from "./external-artwork.js";
import { SubsonicClient } from "./subsonic.js";
import { JellyfinClient } from "./jellyfin.js";
import { EditorClock } from "./editor-clock.js";
import { clearArtworkCache } from "./artwork-cache.js";
import type { DisplaySnapshot } from "./types.js";

const key = "a".repeat(24);
const target: EditorTarget = {source:"external",id:key,name:"Album Artist",kind:"MusicArtist"};
function snapshot(source = "fetched", kind = "MusicArtist") {
  return {state:{mode:"now-playing"}, nowPlaying:{source:"spotify", artist:"Artist A & Artist B", albumArtist:"Album Artist", artworkArtist:"Album Artist", artwork:{source,itemId: source === "fetched" ? key : "entity-id",title:"Album Artist",mediaType:kind}}} as unknown as DisplaySnapshot;
}
function png() { const b=Buffer.alloc(24); b.set([137,80,78,71,13,10,26,10]); b.writeUInt32BE(2400,16); b.writeUInt32BE(1400,20); return b; }
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"mediawall-editor-")); t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const cfg = loadConfig(); cfg.library.directory=path.join(root,"library"); cfg.external_music.artwork.album_cache_directory=path.join(root,"external"); cfg.library_scan.directory=path.join(root,"grid");
  cfg.subsonic.artwork.local_files=true; cfg.subsonic.artwork.path_mappings=[{subsonic:"/music",mediawall:path.join(root,"music")}];
  const jellyfin=new JellyfinClient(cfg), nav=new SubsonicClient(cfg,jellyfin);
  const dir=path.join(root,"external","artists",key);await fs.mkdir(dir,{recursive:true});
  const cache={version:2,configuration:"test",resolvedAt:Date.now(),artist:"Album Artist",providers:["fanart.tv"],logo:{file:"logo.png",provider:"fanart.tv",sourceUrl:"https://images.test/logo"},backdrops:[0,1,2].map(i=>({file:`backdrop-${i}.png`,provider:"fanart.tv",sourceUrl:`https://images.test/${i}`,width:2400,height:1400}))};
  for(const image of [cache.logo,...cache.backdrops])await fs.writeFile(path.join(dir,image.file),png());
  await fs.writeFile(path.join(dir,"metadata.json"),JSON.stringify(cache));
  const resolver=new ExternalArtworkResolver(cfg,jellyfin,nav,root);await resolver.ready;
  return {root,cfg,resolver,nav,dir:resolver.library.directory(key),cache};
}
test("source and canonical entity come from displayed artwork, not playback service",()=>{
  assert.equal(editorTarget(snapshot("jellyfin")).source,"jellyfin");
  assert.equal(editorTarget(snapshot("subsonic")).source,"local");
  assert.equal(editorTarget(snapshot()).source,"external");
  assert.equal(editorTarget(snapshot()).name,"Album Artist");
  for(const kind of ["Movie","Series"])assert.equal(editorTarget(snapshot("jellyfin",kind)).kind,kind);
});
for(const kind of ["MusicArtist","Movie","Series"])test(`Jellyfin ${kind}: filter types, append, move, individual delete, replace/delete logo`,async()=>{
  let backdrops=["a","b","c"],logo=true; const calls:string[]=[];
  const client={imageUrl:(id:string,type:string,index:number,tag:string)=>`/api/jellyfin/image/${id}/${type}/${index}?tag=${tag}`,
    imageEditorRequest:async(url:string,method="GET")=>{
      calls.push(`${method} ${url}`); const u=new URL(url,"http://test");
      if(url.endsWith("/Images"))return [{ImageType:"Primary"},...(logo?[{ImageType:"Logo",ImageIndex:0,Width:800,Height:400}]:[]),...backdrops.map((tag,i)=>({ImageType:"Backdrop",ImageIndex:i,ImageTag:tag,Width:1920,Height:1080}))];
      if(u.pathname.endsWith("/RemoteImages"))return {Images:[{Type:u.searchParams.get("type"),Url:"https://provider.test/image",ProviderName:"Enabled Jellyfin provider",Width:2000,Height:1200},{Type:"Banner",Url:"bad"}]};
      if(u.pathname.endsWith("/Download")){if(u.searchParams.get("type")==="Backdrop")backdrops.push("new");else logo=true;}
      else if(method==="DELETE"){if(url.includes("/Logo/"))logo=false;else backdrops.splice(Number(u.pathname.split("/").at(-1)),1);}
      else if(u.pathname.endsWith("/Index")){const i=Number(u.pathname.split("/").at(-2)),j=Number(u.searchParams.get("newIndex"));const [v]=backdrops.splice(i,1);backdrops.splice(j,0,v);}
    }};
  const adapter=new JellyfinImageAdapter(client as never);const t={source:"jellyfin",id:"entity",name:"Name",kind} as EditorTarget;
  const images=await adapter.list(t);assert.ok(images.every(i=>["Logo","Backdrop"].includes(i.type)));assert.equal(images[1].width,1920);
  const result=(await adapter.search(t,"Backdrop"))[0];await adapter.add(t,result);await adapter.add(t,result);assert.deepEqual(backdrops,["a","b","c","new","new"]);
  await adapter.move(t,2,1);assert.deepEqual(backdrops.slice(0,3),["a","c","b"]);
  await adapter.remove(t,(await adapter.list(t)).filter(i=>i.type==="Backdrop")[1]);assert.equal(backdrops.length,4);assert.ok(!backdrops.includes("c"));
  await adapter.remove(t,(await adapter.list(t)).find(i=>i.type==="Logo")!);assert.equal(logo,false);
  await adapter.add(t,{...result,type:"Logo"});assert.equal(logo,true);
  assert.ok(calls.some(c=>c.includes("RemoteImages?type=Backdrop")));assert.ok(!calls.some(c=>c.includes("api_key")));
});
test("external edits append backdrops, persist order and retain intentional logo deletion",async t=>{
  const f=await fixture(t);t.mock.method(globalThis,"fetch",async()=>new Response(png(),{headers:{"content-type":"image/png"}}));
  const adapter=new ExternalImageAdapter(f.resolver);const candidate={id:"remote",type:"Backdrop" as const,url:"https://images.test/new",provider:"theaudiodb"};
  await adapter.add(target,candidate);await adapter.add(target,candidate);assert.equal((await adapter.list(target)).filter(i=>i.type==="Backdrop").length,5);
  await adapter.move(target,4,0);let images=await adapter.list(target);assert.equal(images.filter(i=>i.type==="Backdrop")[0].provider,"theaudiodb");
  await adapter.remove(target,images.filter(i=>i.type==="Backdrop")[1]);assert.equal((await adapter.list(target)).filter(i=>i.type==="Backdrop").length,4);
  await adapter.add(target,{...candidate,type:"Logo"});assert.equal((await adapter.list(target)).find(i=>i.type==="Logo")!.provider,"theaudiodb");
  await adapter.remove(target,(await adapter.list(target)).find(i=>i.type==="Logo")!);
  for(const source of ["spotify","apple_music"] as const){const state=await f.resolver.resolveExternal({source,user:"test",playing:true,paused:false,title:"Track",artist:"Artist A & Artist B",albumArtist:"Album Artist",artworkArtist:"Album Artist"});assert.equal(state.artwork?.logoUrl,undefined);assert.equal(state.artwork?.backdropCount,4);}
  for(const image of (await adapter.list(target)))await adapter.remove(target,image);
  assert.equal((await f.resolver.editorArtwork(key))?.backdropCount,0);assert.equal((await f.resolver.editorCache(key)).edited,true);
});
test("local adapter touches only selected artwork and persists order across instances",async t=>{
  const f=await fixture(t),dir=path.join(f.root,"music","Album Artist");await fs.mkdir(dir,{recursive:true});
  for(const name of ["fanart.png","backdrop.png","background.png","logo.png","album.jpg","track.flac"])await fs.writeFile(path.join(dir,name),png());
  const adapter=new LocalImageAdapter(f.resolver,f.nav,f.cfg),local={...target,source:"local" as const,id:"Album Artist"};
  const original=f.nav.localArtistImagePaths(local.id);await adapter.move(local,2,0);assert.equal(f.nav.localArtistImagePaths(local.id)[0],original[2]);
  t.mock.method(globalThis,"fetch",async()=>new Response(png(),{headers:{"content-type":"image/png"}}));
  await adapter.add(local,{id:"new",type:"Backdrop",url:"https://images.test/new",provider:"fanart.tv"});assert.equal(f.nav.localArtistImagePaths(local.id).length,4);
  await adapter.remove(local,(await adapter.list(local)).find(i=>i.type==="Backdrop")!);assert.equal(f.nav.localArtistImagePaths(local.id).length,3);
  await adapter.remove(local,(await adapter.list(local)).find(i=>i.type==="Logo")!);assert.equal(f.nav.localArtistLogoPath(local.id),undefined);
  assert.ok(await fs.stat(path.join(dir,"track.flac")));assert.ok(await fs.stat(path.join(dir,"album.jpg")));
  const fresh=new SubsonicClient(f.cfg,new JellyfinClient(f.cfg));assert.deepEqual(fresh.localArtistImagePaths(local.id),f.nav.localArtistImagePaths(local.id));
});
test("editor rejects stale revisions, unknown search results, unsupported types and cross-space sessions",async()=>{
  const adapter={list:async()=>[],search:async()=>[],add:async()=>{},upload:async()=>{},remove:async()=>{},move:async()=>{}};
  const editor=new ImageEditor({jellyfin:adapter,local:adapter,external:adapter});const model=await editor.open("room",snapshot());
  await assert.rejects(editor.search("room",model.id,"Primary" as never),/Unsupported/);
  await assert.rejects(editor.mutate("room",model.id,{revision:"old",action:"delete",imageId:"x"}),/changed/);
  await assert.rejects(editor.mutate("room",model.id,{revision:model.revision,action:"add",imageId:"x"}),/expired/);
  assert.throws(()=>editor.session("other",model.id),/expired/);
});
for(const mode of ["now-playing","screensaver"])test(`${mode} timer resumes with the same 18 seconds; multiple editors and expired leases`,()=>{
  let now=1000,deadline=19000;const clock=new EditorClock((_space,elapsed)=>{deadline+=elapsed},()=>now);
  clock.hold("room","one");const remaining=deadline-clock.frozenAt("room")!;assert.equal(remaining,18000);
  for(let i=0;i<12;i++){now+=10000;clock.hold("room","one");}
  clock.hold("room","two");clock.release("room","one");assert.equal(clock.frozenAt("room"),1000);
  clock.release("room","two");assert.equal(deadline-now,18000);
  clock.hold("room","gone");now+=31000;assert.equal(clock.frozenAt("room"),undefined);assert.equal(deadline-now,18000);
});
test("cache clearing removes owned images only; retains original media, metadata and symlink targets",async t=>{
  const f=await fixture(t);await fs.mkdir(f.cfg.library_scan.directory,{recursive:true});const hash="b".repeat(64);
  await fs.writeFile(path.join(f.cfg.library_scan.directory,hash+".json"),JSON.stringify({status:200,createdAt:Date.now()}));await fs.writeFile(path.join(f.cfg.library_scan.directory,hash+".bin"),"cache");
  await fs.writeFile(path.join(f.cfg.library_scan.directory,"users.json"),"{}");await fs.writeFile(path.join(f.dir,"original.flac"),"music");
  const original=path.join(f.root,"original.jpg");await fs.writeFile(original,"original");await fs.symlink(original,path.join(f.dir,"not-owned.png"));
  const removed=await clearArtworkCache(f.cfg,f.root);assert.equal(removed,2);
  assert.equal(await fs.readFile(original,"utf8"),"original");assert.equal(await fs.readFile(path.join(f.dir,"original.flac"),"utf8"),"music");assert.ok(await fs.stat(path.join(f.cfg.library_scan.directory,"users.json")));
});


test("Fanart.tv and TheAudioDB search returns artist images with provider metadata",async t=>{
  const f=await fixture(t);f.cfg.image_providers.musicbrainz.enabled=false;f.cfg.image_providers.fanart={enabled:true,api_key:"test"};f.cfg.image_providers.theaudiodb={enabled:true,api_key:"test"};
  t.mock.method(globalThis,"fetch",async(input: unknown)=> String(input).includes("fanart.tv") ? Response.json({hdmusiclogo:[{url:"https://images.test/logo",lang:"en",likes:"9",width:800,height:310}],artistbackground:[{url:"https://images.test/backdrop",likes:"5"}]}) : Response.json({artists:[{strArtistLogo:"https://images.test/audiologo",strArtistFanart:"https://images.test/audiofanart"}]}));
  const logos=await f.resolver.searchArtistImages("Album Artist","Logo","mbid");assert.deepEqual(new Set(logos.map(i=>i.provider)),new Set(["fanart.tv","theaudiodb"]));assert.equal(logos.find(i=>i.provider==="fanart.tv")!.language,"en");
  const backdrops=await f.resolver.searchArtistImages("Album Artist","Backdrop","mbid");assert.equal(backdrops.length,2);assert.ok(backdrops.every(i=>!i.url.includes("logo")));
});
test("cache feedback only sounds after success with global sound enabled",async()=>{
  const {cacheClearFeedback}=await import("../src/cache-feedback.js");
  assert.deepEqual(cacheClearFeedback(undefined,undefined,100,true),{show:false,sound:undefined});
  assert.deepEqual(cacheClearFeedback({id:"success",at:200},undefined,100,true),{show:true,sound:"trash.mp3"});
  assert.deepEqual(cacheClearFeedback({id:"success",at:200},undefined,100,false),{show:true,sound:undefined});
  assert.equal(cacheClearFeedback({id:"success",at:200},"success",100,true).show,false);
  assert.equal(cacheClearFeedback({id:"old",at:50},undefined,100,true).show,false);
});

test("post-edit artwork uses returned images without a second Jellyfin item request", async () => {
  const {artworkAfterEdit} = await import("./image-editor.js");
  const previous = snapshot("jellyfin").nowPlaying!.artwork!;
  const model = {target:{source:"jellyfin" as const,id:"entity-id",name:"Album Artist",kind:"MusicArtist"},revision:"new",images:[
    {id:"Logo:0",type:"Logo" as const,url:"/logo?tag=new"},
    {id:"Backdrop:0",type:"Backdrop" as const,url:"/backdrop?tag=new"},
    {id:"Backdrop:1",type:"Backdrop" as const,url:"/backdrop2?tag=new"}
  ]};
  const updated = artworkAfterEdit(model, previous);
  assert.equal(updated.logoUrl, "/logo?tag=new");
  assert.equal(updated.backdropUrl, "/backdrop?tag=new");
  assert.equal(updated.backdropCount, 2);
  assert.equal(updated.source, "jellyfin");
  const empty = artworkAfterEdit({...model,images:[]}, updated);
  assert.equal(empty.logoUrl, undefined);
  assert.equal(empty.backdropUrl, undefined);
  assert.equal(empty.backdropCount, 0);
});

for (const source of ["external", "local"] as const) test(`${source} uploads append backdrops and replace only the logo`, async t => {
  const {decodeImageUpload} = await import("./image-upload.js");
  const f = await fixture(t);
  const image = decodeImageUpload(png().toString("base64"));
  const dir = path.join(f.root, "music", "Album Artist");
  await fs.mkdir(dir, {recursive:true});
  for (const name of ["backdrop.png", "logo.png", "track.flac"]) await fs.writeFile(path.join(dir,name), png());
  const adapter = source === "local" ? new LocalImageAdapter(f.resolver,f.nav,f.cfg) : new ExternalImageAdapter(f.resolver);
  const entity = {...target, source, id: source === "local" ? "Album Artist" : key};
  const before = await adapter.list(entity);
  await adapter.upload(entity, "Backdrop", image);
  await adapter.upload(entity, "Backdrop", image);
  let after = await adapter.list(entity);
  assert.equal(after.filter(i=>i.type==="Backdrop").length, before.filter(i=>i.type==="Backdrop").length + 2);
  assert.ok(before.every(i=>after.some(j=>j.id===i.id)));
  await adapter.upload(entity, "Logo", image);
  after = await adapter.list(entity);
  assert.equal(after.filter(i=>i.type==="Logo").length, 1);
  if (source === "local") assert.equal(after.find(i=>i.type==="Logo")!.id,before.find(i=>i.type==="Logo")!.id);
  else assert.equal(after.find(i=>i.type==="Logo")!.id,"logo.png");
  assert.equal(after.filter(i=>i.type==="Backdrop").length, before.filter(i=>i.type==="Backdrop").length + 2);
  assert.ok(await fs.stat(path.join(dir,"track.flac")));
  if (source === "external") assert.equal(after.find(i=>i.type==="Logo")!.provider,"Upload");
});
test("Jellyfin uploads use its base64 image endpoint with detected content type",async()=>{
  const {decodeImageUpload} = await import("./image-upload.js");
  const image=decodeImageUpload(png().toString("base64"));
  const calls: unknown[][]=[];
  const adapter=new JellyfinImageAdapter({imageEditorRequest:async(...args:unknown[])=>{calls.push(args);}} as never);
  for(const type of ["Logo","Backdrop"] as const)await adapter.upload({...target,source:"jellyfin",id:"item"},type,image);
  assert.deepEqual(calls, ["Logo","Backdrop"].map(type=>[`/Items/item/Images/${type}`,"POST",{body:png().toString("base64"),contentType:"image/png"}]));
});
test("uploads reject unsupported image types, invalid data and stale revisions before writing", async()=>{
  const {decodeImageUpload,maxUploadBytes}=await import("./image-upload.js");
  assert.throws(()=>decodeImageUpload(Buffer.from("<svg>not a raster image</svg>").toString("base64")),/Unsupported/);
  assert.throws(()=>decodeImageUpload("not base64!"));
  assert.throws(()=>decodeImageUpload(Buffer.alloc(maxUploadBytes+1).toString("base64")),/10 MB/);
  const bad=png();bad.writeUInt32BE(0,16);assert.throws(()=>decodeImageUpload(bad.toString("base64")),/dimensions/);
  let writes=0;
  const adapter={list:async()=>[],search:async()=>[],add:async()=>{},upload:async()=>{writes++;},remove:async()=>{},move:async()=>{}};
  const editor=new ImageEditor({jellyfin:adapter,local:adapter,external:adapter});const model=await editor.open("room",snapshot());
  await assert.rejects(editor.mutate("room",model.id,{revision:model.revision,action:"upload",type:"Primary" as never,data:png().toString("base64")}),/Unsupported/);
  await assert.rejects(editor.mutate("room",model.id,{revision:"stale",action:"upload",type:"Logo",data:png().toString("base64")}),/changed/);
  assert.equal(writes,0);
  await editor.mutate("room",model.id,{revision:model.revision,action:"upload",type:"Logo",data:png().toString("base64")});
  assert.equal(writes,1);
});

test("local editing refuses audio/video files and files disguised as artwork", async t => {
  const f=await fixture(t),dir=path.join(f.root,"music","Album Artist");await fs.mkdir(dir,{recursive:true});
  const local={...target,source:"local" as const,id:"Album Artist"};
  const adapter=new LocalImageAdapter(f.resolver,f.nav,f.cfg);
  for(const name of ["song.flac","song.mp3","movie.mkv","movie.mp4","logo.png"]){
    const file=path.join(dir,name),content=Buffer.from("original audio or video bytes");await fs.writeFile(file,content);
    const mock=t.mock.method(f.nav,"localArtistLogoPath",()=>file);
    await assert.rejects(adapter.remove(local,{id:crypto.createHash("sha256").update(file).digest("hex"),type:"Logo",url:"unused"}),/protected|not a supported artwork/);
    assert.deepEqual(await fs.readFile(file),content);mock.mock.restore();
  }
});

test("Jellyfin search pages preserve provider, language and 30-result limits", async () => {
  const calls: URL[] = [];
  const adapter = new JellyfinImageAdapter({imageEditorRequest: async (url: string) => {
    calls.push(new URL(url, "http://fixture"));
    return {Images:[{Type:"Logo",Url:"https://fixture/logo",ProviderName:"Jellyfin provider",Language:"fr"}],TotalRecordCount:65,Providers:["Jellyfin provider","Other provider"]};
  }} as any);
  const t = {source:"jellyfin",id:"item",name:"Item",kind:"Movie"} as const;
  const page = await adapter.searchPage(t,"Logo",{start:30,provider:"Jellyfin provider",allLanguages:true});
  assert.equal(calls[0].pathname,"/Items/item/RemoteImages");
  assert.equal(calls[0].searchParams.get("limit"),"30");
  assert.equal(calls[0].searchParams.get("startIndex"),"30");
  assert.equal(calls[0].searchParams.get("providerName"),"Jellyfin provider");
  assert.equal(calls[0].searchParams.get("includeAllLanguages"),"true");
  assert.equal(page.total,65); assert.equal(page.start,30); assert.equal(page.supportsLanguageFilter,true);
  assert.deepEqual(page.providers,["Jellyfin provider","Other provider"]);
  await adapter.searchPage(t,"Backdrop",{start:0,provider:"",allLanguages:false});
  assert.equal(calls[1].searchParams.get("includeAllLanguages"),"false");
});

test("local/external result paging caches provider lookup and registers selectable candidates", async () => {
  let searches = 0; let selected = "";
  const adapter = {list:async()=>[],search:async(_target: EditorTarget,type: "Logo" | "Backdrop")=>{
    searches++;
    return Array.from({length:65},(_,i)=>({id:String(i),type,url:`https://fixture/${i}`,provider:i%2 ? "theaudiodb" : "fanart.tv"}));
  },add:async(_target:EditorTarget,image:{id:string})=>{selected=image.id;},upload:async()=>{},remove:async()=>{},move:async()=>{}};
  for (const source of ["fetched","subsonic"]) {
    const editor = new ImageEditor({external:adapter,local:adapter,jellyfin:adapter});
    const model = await editor.open("room",snapshot(source));
    const first = await editor.searchPage("room",model.id,"Backdrop");
    const second = await editor.searchPage("room",model.id,"Backdrop",{start:30});
    const last = await editor.searchPage("room",model.id,"Backdrop",{start:60});
    assert.equal(first.images.length,30);assert.equal(second.images[0].id,"30");assert.equal(last.images.length,5);
    assert.equal(first.total,65);assert.equal(first.supportsLanguageFilter,false);
    const filtered = await editor.searchPage("room",model.id,"Backdrop",{start:30,provider:"fanart.tv"});
    assert.equal(filtered.total,33);assert.equal(filtered.images.length,3);assert.equal(filtered.images[0].id,"60");
    await editor.mutate("room",model.id,{revision:model.revision,action:"add",imageId:second.images[0].id});
    assert.equal(selected,"30");
    for(const invalid of [{start:-1},{start:1.5},{provider:42},{allLanguages:"true"}]) await assert.rejects(editor.searchPage("room",model.id,"Backdrop",invalid as any),/Invalid search/);
    await assert.rejects(editor.searchPage("room",model.id,"Primary" as any),/Unsupported/);
  }
  assert.equal(searches,2,"one provider lookup per editor and type despite paging/filtering");
});

test("local uploads use Jellyfin names, reserve occupied slots and preserve media", async t => {
  const f=await fixture(t), dir=path.join(f.root,"music","Album Artist");await fs.mkdir(dir,{recursive:true});
  const local={...target,source:"local" as const,id:"Album Artist"};
  const adapter=new LocalImageAdapter(f.resolver,f.nav,f.cfg);
  const {decodeImageUpload}=await import("./image-upload.js");const image=decodeImageUpload(png().toString("base64"));
  await fs.writeFile(path.join(dir,"backdrop.jpg"),png());
  await fs.writeFile(path.join(dir,"backdrop1.png"),Buffer.from("not artwork"));
  await fs.writeFile(path.join(dir,".mediawall-images.json"),JSON.stringify({backdrops:[path.join(dir,"backdrop.jpg")],logo:null}));
  await fs.writeFile(path.join(dir,"track.flac"),Buffer.from("music unchanged"));
  await adapter.upload(local,"Backdrop",image);
  assert.deepEqual(await fs.readFile(path.join(dir,"backdrop2.png")),image.buffer);
  assert.equal(await fs.readFile(path.join(dir,"backdrop1.png"),"utf8"),"not artwork");
  await adapter.upload(local,"Logo",image);
  assert.deepEqual(await fs.readFile(path.join(dir,"logo.png")),image.buffer);
  const replacement={...image,buffer:Buffer.concat([image.buffer,Buffer.from("new image bytes")])};
  await adapter.upload(local,"Logo",replacement);
  assert.deepEqual(await fs.readFile(path.join(dir,"logo.png")),replacement.buffer);
  assert.equal(await fs.readFile(path.join(dir,"track.flac"),"utf8"),"music unchanged");
  const manifest=JSON.parse(await fs.readFile(path.join(dir,".mediawall-images.json"),"utf8"));
  assert.equal(manifest.logo,path.join(dir,"logo.png"));
  assert.equal(manifest.backdrops.at(-1),path.join(dir,"backdrop2.png"));
});

test("local logo replacement rolls back if the manifest cannot be saved", async t => {
  const f=await fixture(t),dir=path.join(f.root,"music","Album Artist");await fs.mkdir(dir,{recursive:true});
  const local={...target,source:"local" as const,id:"Album Artist"};const adapter=new LocalImageAdapter(f.resolver,f.nav,f.cfg);
  const original=png();await fs.writeFile(path.join(dir,"logo.png"),original);
  await fs.writeFile(path.join(dir,".mediawall-images.json.tmp"),"occupied");
  const {decodeImageUpload}=await import("./image-upload.js");const image=decodeImageUpload(Buffer.concat([original,Buffer.from("new")]).toString("base64"));
  await assert.rejects(adapter.upload(local,"Logo",image));
  assert.deepEqual(await fs.readFile(path.join(dir,"logo.png")),original);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {loadConfig} from "./config.js";
import {JellyfinClient} from "./jellyfin.js";
import {ExternalArtworkResolver} from "./external-artwork.js";

const artist={Id:'artist',Name:'Artist',Type:'MusicArtist',ImageTags:{Logo:'logo'},BackdropImageTags:['backdrop','backdrop2']};

test("Jellyfin audio retains artist logo/backdrops when item detail returns 400 and artist refs are duplicated",async t=>{
 const cfg=loadConfig();cfg.jellyfin.url='http://jellyfin.test';cfg.jellyfin.api_key='fixture';const client=new JellyfinClient(cfg);
 const space=Object.values(cfg.spaces)[0];space.display.music_artist_images='artists';space.display.music_logo_artist='artists';
 const track={Id:'track',Type:'Audio',MediaType:'Audio',Name:'Song',Artists:['Artist'],ArtistItems:[{Id:'artist',Name:'Artist'}]};
 const direct:string[]=[];
 t.mock.method(client as any,'getJson',async(p:string)=>{
  if(p.startsWith('/Items/')){direct.push(p);throw Error(`Jellyfin 400 for ${p}`);}
  const url=new URL(p,'http://fixture');const id=url.searchParams.get('Ids');
  if(id)return {Items:[id==='track'?track:artist]};
  return {Items:[artist]};
 });
 t.mock.method(client,'userAvatarUrl',async()=>undefined);
 const result=await (client as any).nowPlayingFromSession({Id:'session',UserName:'bob',NowPlayingItem:track,PlayState:{}},space,'Music');
 assert.match(result.artwork.logoUrl,/artist\/Logo/);assert.match(result.artwork.backdropUrl,/artist\/Backdrop/);assert.equal(result.artwork.backdropCount,2);assert.equal(result.title,'Song');
 assert.equal(direct.length,1,'unsupported detail endpoint is not retried on every item');
});

test("artist searches select exact normalized artwork matches beyond the first result and alternate endpoints",async t=>{
 const cfg=loadConfig();cfg.jellyfin.url='http://jellyfin.test';cfg.jellyfin.api_key='fixture';const client=new JellyfinClient(cfg);
 t.mock.method(client as any,'getJson',async(p:string)=>{
  const url=new URL(p,'http://fixture');if(url.searchParams.get('SearchTerm')==='Absent')return {Items:[{...artist,Name:'Not Absent'}]};
  return {Items:url.pathname==='/Items'?[{...artist,Id:'wrong',Name:'Artist Tribute'},{Id:'empty',Name:'ARTIST'}]:[artist]};
 });
 const art=await client.artworkForArtistName('  Artist  ');assert.equal(art?.itemId,'artist');assert.match(art?.logoUrl??'',/artist\/Logo/);
 assert.equal(await client.artworkForArtistName('Absent'),undefined);
});

test("external music uses matching Jellyfin artist artwork through aliases before fetched providers",async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'external-jellyfin-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const cfg=loadConfig();cfg.library.directory=path.join(root,'library');cfg.external_music.artwork.album_cache_directory=path.join(root,'cache');cfg.external_music.artwork.order=['jellyfin','local','fetched'];cfg.external_music.artwork.preference=undefined;cfg.subsonic.artwork.jellyfin_fallback=true;cfg.aliases.artists={Artist:['Alias']};cfg.jellyfin.url='http://jellyfin.test';cfg.jellyfin.api_key='fixture';
 const client=new JellyfinClient(cfg);t.mock.method(client as any,'getJson',async(p:string)=>({Items:new URL(p,'http://fixture').searchParams.get('SearchTerm')==='Artist'?[artist]:[]}));
 const resolver=new ExternalArtworkResolver(cfg,client,{localArtistArtworks:()=>[]} as any,root);
 const fetched=t.mock.method(resolver as any,'resolveFetchedArtist',async()=>{throw Error('complete Jellyfin artwork should win');});
 const result=await resolver.resolveExternal({source:'spotify',user:'bob',artist:'Alias',playing:true,paused:false,title:'Song'});
 assert.equal(result.artwork?.source,'jellyfin');assert.match(result.artwork?.logoUrl??'',/artist\/Logo/);assert.equal(result.artwork?.backdropCount,2);assert.equal(fetched.mock.callCount(),0);
});

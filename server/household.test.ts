import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {loadConfig} from "./config.js";
import {playbackOwner,userAvatar,dedupePlaybackCandidates} from "./user-presentation.js";
import {anonymousIdentity} from "./anonymous-mode.js";
import {badgeIdentity,transitionIdentity} from "../src/identity-presentation.js";
import {SourceAvatarStore} from "./source-avatars.js";
import {JellyfinClient} from "./jellyfin.js";
import {JellyfinCollectionIndex} from "./collection-index.js";
import {externalServiceKey,externalIconKey} from "../src/external-service.js";
import type {NowPlayingState} from "./types.js";

function fixture() {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mediawall-household-"));
 const old=process.env.MEDIAWALL_CONFIG;process.env.MEDIAWALL_CONFIG=path.join(root,"config.yml");
 const example=fs.readFileSync("config.yml.example","utf8").replace(/\$\{([A-Z_]+)\}/g,(_,key:string)=>{
  const match=key.match(/^(JELLYFIN|SUBSONIC)_(BOB|ALICE|JACOB)_USER$/);
  if(match)return `${match[2].toLowerCase()}-${match[1].toLowerCase()}`;
  return key.endsWith('_URL') ? 'http://service.test' : `test-${key.toLowerCase()}`;
 });
 fs.writeFileSync(process.env.MEDIAWALL_CONFIG,example);
 try{return loadConfig();}finally{if(old===undefined)delete process.env.MEDIAWALL_CONFIG;else process.env.MEDIAWALL_CONFIG=old;fs.rmSync(root,{recursive:true,force:true});}
}
const playing=(user:string,source:NowPlayingState['source']='jellyfin'):NowPlayingState=>({source,user,playing:true,paused:false,title:'Movie',itemId:'movie',sessionKey:`session-${user}`});

test('household example and complete documentation stay synchronized',()=>{
 const example=fs.readFileSync('config.yml.example','utf8');const doc=fs.readFileSync('docs/configuration.md','utf8');
 const block=doc.split('<!-- BEGIN CONFIG EXAMPLE: kept in sync by server/household.test.ts -->\n```yaml\n')[1]?.split('```\n<!-- END CONFIG EXAMPLE -->')[0];assert.equal(block,example);
 const cfg=fixture();assert.deepEqual(Object.keys(cfg.users),['bob','alice','jacob','All']);
 assert.deepEqual(cfg.spaces.livingroom.users.map(u=>u.key),['bob','alice','jacob','All']);
 assert.equal(cfg.users.All.subsonic_user,undefined);assert.equal(cfg.users.All.subsonic_password,undefined);assert.equal(cfg.users.All.external_music_token,undefined);
 assert.equal(cfg.spaces.livingroom.anonymous_mode?.enabled,true);assert.equal(cfg.spaces.homelab.anonymous_mode?.enabled,undefined);
 assert.deepEqual(cfg.spaces.livingroom.libraries,['Shows','Anime','Movies','Music']);assert.deepEqual(cfg.spaces.livingroom.now_playing.ignored_libraries,['Fitness']);
 assert.equal(cfg.spaces.livingroom.now_playing.fallback,'immich_kiosk');assert.deepEqual(cfg.spaces.homelab.now_playing.mediawall_fallback.modes,['dvd']);
});

test('specific family mappings win over All independent of candidate order; other users remain catch-all',()=>{
 const cfg=fixture();const catchall=cfg.users.All;const candidates:NowPlayingState[]=[];
 for(const who of ['bob','alice','jacob']) {
  const state=playing(`${who}-jellyfin`);const owner=playbackOwner(state,catchall,cfg.users);
  assert.equal(owner.key,who);assert.equal(owner.user,cfg.users[who]);
  candidates.push({...state,mediaWallUserKey:owner.key},{...state,mediaWallUserKey:who});
 }
 const guest=playbackOwner(playing('guest-jellyfin'),catchall,cfg.users);assert.equal(guest.key,'guest-jellyfin');assert.equal(guest.user,catchall);
 assert.equal(dedupePlaybackCandidates(candidates).length,3);
});

test('livingroom keeps family visible and prevents guest identity or avatar fallback',()=>{
 const cfg=fixture();const mode=cfg.spaces.livingroom.anonymous_mode;
 for(const who of ['bob','alice','jacob'])assert.equal(anonymousIdentity(mode,who,'/anonymous'),undefined);
 const identity=anonymousIdentity(mode,'guest-jellyfin','/anonymous')!;
 const now={user:'private-name',displayUser:'private-name',displayUserAvatarUrl:'/private-avatar',anonymousIdentity:identity};
 assert.deepEqual(badgeIdentity(now,true,true),{username:'someone',avatarUrl:'/anonymous'});
 assert.deepEqual(transitionIdentity(now,'fallback'),{username:'someone',avatarUrl:'/anonymous'});
 const hidden=anonymousIdentity({...mode!,now_playing_info:{show_anonymous_avatar:false,show_anonymous_username:false},user_transition_info:{show_anonymous_avatar:false}},'guest',undefined)!;
 assert.deepEqual(badgeIdentity({...now,anonymousIdentity:hidden},true,true),{username:undefined,avatarUrl:undefined});
 assert.equal(transitionIdentity({...now,anonymousIdentity:hidden},'fallback').avatarUrl,undefined);
});

for(const source of ['jellyfin','subsonic','spotify','external_music'] as const)test(`${source} uses mapped Jellyfin avatar before custom avatar`,async()=>{
 const cfg=fixture(),space=cfg.spaces.livingroom,user=cfg.users.bob;let customCalls=0;
 const avatars={customAvatarUrl:()=>{customCalls++;return '/custom';},avatarUrl:()=>{customCalls++;return '/legacy';},anonymousUrl:()=>'/anonymous'};
 const state={...playing('service-user',source),mediaWallUserKey:'bob'};
 const jellyfin={userAvatarUrl:async(name:string)=>{assert.equal(name,'bob-jellyfin');return '/jellyfin';}};
 assert.equal(await userAvatar(state,user,space,jellyfin as any,avatars),'/jellyfin');assert.equal(customCalls,0);
 assert.equal(await userAvatar(state,user,space,{userAvatarUrl:async()=>undefined} as any,avatars),'/custom');
 assert.equal(await userAvatar(state,user,space,{userAvatarUrl:async()=>undefined} as any,{...avatars,avatarUrl:()=>undefined,customAvatarUrl:()=>undefined}),undefined);
});

test('anonymous avatar resolution never queries real/custom identities',async()=>{
 const cfg=fixture(),space=cfg.spaces.livingroom;
 const fail=()=>{throw new Error('Real avatar lookup must not run');};
 assert.equal(await userAvatar({...playing('guest'),mediaWallUserKey:'guest'},cfg.users.All,space,{userAvatarUrl:fail} as any,{avatarUrl:fail,anonymousUrl:()=>'/anonymous'}),'/anonymous');
 space.anonymous_mode!.now_playing_info.show_anonymous_avatar=false;space.anonymous_mode!.user_transition_info.show_anonymous_avatar=false;
 assert.equal(await userAvatar({...playing('guest'),mediaWallUserKey:'guest'},cfg.users.All,space,{userAvatarUrl:fail} as any,{avatarUrl:fail,anonymousUrl:()=>'/anonymous'}),undefined);
});

test('custom Spotify and Subsonic avatar files are supported and cache-busted',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mediawall-avatars-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const source of ['spotify','subsonic']) {const dir=path.join(root,'app/avatars',source);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'bob.png'),'first');}
 const store=new SourceAvatarStore(root);
 for(const source of ['spotify','subsonic'] as const) {const old=store.avatarUrl(source,'bob');assert.match(old!,new RegExp(`/api/avatars/${source}/bob\\?v=`));fs.writeFileSync(path.join(root,'app/avatars',source,'bob.png'),'changed');assert.notEqual(store.avatarUrl(source,'bob'),old);}
 assert.equal(store.avatarPath('subsonic','../bob'),undefined);
});

test('ignored Jellyfin libraries are filtered before candidate, count, transition, or sound creation',async t=>{
 const cfg=fixture();cfg.jellyfin.url='http://jellyfin.test';cfg.jellyfin.api_key='test';const space=cfg.spaces.livingroom;space.source_user='All';space.now_playing.ignored_libraries=['  Fitness  '];
 const libraries=['Movies','Fitness','fitness',' Fitness ','Fitness Videos'];
 t.mock.method(globalThis,'fetch',async()=>Response.json(libraries.map((name,i)=>({Id:String(i),UserName:'bob-jellyfin',NowPlayingItem:{Id:String(i),Name:name}}))));
 const client=new JellyfinClient(cfg);
 t.mock.method(client as any,'nowPlayingLibraryName',async(item:any)=>item.Name);
 const construct=t.mock.method(client as any,'nowPlayingFromSession',async(session:any)=>playing(session.NowPlayingItem.Name));
 const result=await client.activePlaybacks(space);assert.deepEqual(result.map(r=>r.user),['Movies','Fitness Videos']);assert.equal(construct.mock.callCount(),2);
});

test('Star Wars collection applies to eligible family and catch-all users in both spaces',async t=>{
 const cfg=fixture();const root=fs.mkdtempSync(path.join(os.tmpdir(),'mediawall-collections-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));cfg.library_scan.directory=root;
 const client={configured:()=>true,collectionMemberships:async(include:(name:string)=>boolean)=>{assert.equal(include('The STAR   WARS Collection'),true);assert.equal(include('Star Trek'),false);return [{id:'starwars',name:'The STAR   WARS Collection',itemIds:new Set(['movie'])}];}};
 const index=new JellyfinCollectionIndex(cfg,client as any);await index.rebuild();
 for(const space of ['livingroom','homelab'])for(const who of ['bob','alice','jacob','All']) {const result=index.lookup(space,who,['movie']);assert.equal(result?.sound,'starwars.mp3');assert.equal(result?.images[0].file,'starwars.png');assert.equal(result?.images[0].size,260);}
 assert.equal(index.lookup('livingroom','not-eligible',['movie']),undefined);
});

test('new source icons use known aliases and exact custom names, not fuzzy matches',()=>{
 for(const [name,key] of Object.entries({'WebScrobbler':'webscrobbler','Libre.fm':'librefm','Last.fm':'lastfm','Icecast':'icecast','Google Cast':'google-cast','Chromecast':'google-cast','AzuraCast':'azuracast','LMS':'lms'}))assert.equal(externalServiceKey(name),key);
 assert.equal(externalServiceKey('notspotify'),undefined);assert.equal(externalServiceKey('https://spotify.com.evil.test'),undefined);assert.equal(externalIconKey('My Server'),'my-server');
});

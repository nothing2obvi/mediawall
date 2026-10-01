import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {anonymousIdentity,mappedUserKey,type AnonymousMode} from "./anonymous-mode.js";
import {badgeIdentity,transitionIdentity} from "../src/identity-presentation.js";
import {SourceAvatarStore} from "./source-avatars.js";
import {loadConfig} from "./config.js";
import type {NowPlayingState} from "./types.js";
const policy:AnonymousMode={enabled:true,shown:[],not_shown:["All"],anonymous_username:"someone",now_playing_info:{show_anonymous_username:true,show_anonymous_avatar:true},user_transition_info:{show_anonymous_avatar:true}};
test("anonymous rules are case insensitive with shown taking precedence",()=>{
 assert.equal(anonymousIdentity(undefined,"bob"),undefined);assert.equal(anonymousIdentity({...policy,enabled:false},"bob"),undefined);
 assert.equal(anonymousIdentity(policy,"bob")?.username,"someone");
 for(const key of ["bob","Bob","BOB"])assert.equal(anonymousIdentity({...policy,shown:[" bob "]},key),undefined);
 assert.equal(anonymousIdentity({...policy,shown:["All"],not_shown:["bob"]},"bob"),undefined);
 assert.equal(anonymousIdentity({...policy,not_shown:[]},"bob"),undefined);
 assert.equal(anonymousIdentity({...policy,not_shown:["BOB"]},"bob")?.username,"someone");
 assert.equal(anonymousIdentity({...policy,not_shown:["bob"]},"unlisted"),undefined);
});
test("source accounts resolve to one MediaWall key, including All-user mappings",()=>{
 const user={key:"bob",name:"Display label",jellyfin_user:"video-account",navidrome_user:"audio-account"};
 for(const source of ["jellyfin","navidrome","spotify","external_music"] as const){const state={source,user:"source-account"} as NowPlayingState;assert.equal(mappedUserKey(state,user,{bob:user}),"bob");}
 assert.equal(mappedUserKey({source:"jellyfin",user:"VIDEO-ACCOUNT"} as NowPlayingState,{name:"all",jellyfin_user:"All"},{bob:user}),"bob");
 assert.equal(mappedUserKey({source:"navidrome",user:"AUDIO-ACCOUNT"} as NowPlayingState,{name:"all",navidrome_user:"All"},{bob:user}),"bob");
});
test("anonymous UI paths never use real fallback identities for any toggle combination",()=>{
 for(const showName of [false,true])for(const showAvatar of [false,true])for(const transitionAvatar of [false,true])for(const avatar of [undefined,"/api/avatars/anonymous"]){
  const selected={...policy,anonymous_username:"Anonymous",now_playing_info:{show_anonymous_username:showName,show_anonymous_avatar:showAvatar},user_transition_info:{show_anonymous_avatar:transitionAvatar}};
  const now={displayUser:"private display",user:"private user",mediaWallUser:"private mapping",displayUserAvatarUrl:"/private-avatar",anonymousIdentity:anonymousIdentity(selected,"bob",avatar)};
  assert.deepEqual(badgeIdentity(now,true,true),{username:showName?"Anonymous":undefined,avatarUrl:showAvatar?avatar:undefined});
  assert.deepEqual(transitionIdentity(now,"private fallback"),{username:"Anonymous",avatarUrl:transitionAvatar?avatar:undefined});
  assert.equal(now.user,"private user");
 }
 const normal={displayUser:"bob",displayUserAvatarUrl:"/normal"};assert.deepEqual(badgeIdentity(normal,true,true),{username:"bob",avatarUrl:"/normal"});assert.deepEqual(transitionIdentity(normal,"fallback"),{username:"bob",avatarUrl:"/normal"});
});
test("generic avatar discovery supports all custom formats and never uses Spotify fallback",async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"mediawall-anonymous-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dir=path.join(root,"app/avatars");await fs.mkdir(path.join(dir,"spotify"),{recursive:true});await fs.writeFile(path.join(dir,"spotify/bob.png"),"fixture");const store=new SourceAvatarStore(root);assert.equal(store.anonymousUrl(),undefined);
 for(const extension of ["png","jpg","jpeg","webp"]){const file=path.join(dir,`anonymous.${extension}`);await fs.writeFile(file,"fixture");assert.equal(store.anonymousPath(),file);assert.match(store.anonymousUrl()!,/^\/api\/avatars\/anonymous\?v=/);await fs.unlink(file);}
 assert.equal(store.anonymousUrl(),undefined);
});
test("configuration supports opt-in defaults and per-space policy",async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"mediawall-anonymous-config-"));const previous=process.env.MEDIAWALL_CONFIG;t.after(async()=>{if(previous===undefined)delete process.env.MEDIAWALL_CONFIG;else process.env.MEDIAWALL_CONFIG=previous;await fs.rm(root,{recursive:true,force:true});});const file=path.join(root,"config.yml");process.env.MEDIAWALL_CONFIG=file;
 await fs.writeFile(file,"users:\n  bob:\n    name: Display label\nspaces:\n  private:\n    users: [bob]\n    anonymous_mode:\n      enabled: true\n  normal: {}\n");const config=loadConfig();assert.deepEqual(config.spaces.private.anonymous_mode,policy);assert.equal(config.spaces.private.users[0].key,"bob");assert.equal(config.spaces.normal.anonymous_mode,undefined);
});

test("anonymous avatar overrides have deterministic priority and content-based refresh",async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"mediawall-anonymous-live-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dir=path.join(root,"app/avatars");await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(root,"default-assets"));await fs.writeFile(path.join(root,"default-assets/anonymous.png"),"bundled");
 const store=new SourceAvatarStore(root);assert.equal(store.anonymousPath(),path.join(root,"default-assets/anonymous.png"));
 for(const extension of ["png","jpeg","jpg","webp"]) {await fs.writeFile(path.join(dir,`anonymous.${extension}`),extension);assert.equal(store.anonymousPath(),path.join(dir,`anonymous.${extension}`));}
 const file=path.join(dir,"anonymous.webp"),before=store.anonymousUrl(),stat=await fs.stat(file);
 await fs.writeFile(file,"edit");await fs.utimes(file,stat.atime,stat.mtime);assert.notEqual(store.anonymousUrl(),before,"Same-size replacement with preserved mtime must change URL");
 const changed=new Promise<void>(resolve=>{const stop=store.watchAnonymous(()=>{stop();resolve();});t.after(stop);});
 await fs.unlink(file);
 await Promise.race([changed,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error("Anonymous avatar refresh not detected")),4000);t.after(()=>clearTimeout(timer));})]);
 assert.equal(store.anonymousPath(),path.join(dir,"anonymous.jpg"));
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {SourceAvatarStore} from "./source-avatars.js";
import {userAvatar} from "./user-presentation.js";
import {loadConfig} from "./config.js";
import type {NowPlayingState} from "./types.js";

test("canonical avatar references are exact, deterministic, confined, and cache-busted",t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'canonical-avatar-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'app/avatars');fs.mkdirSync(dir,{recursive:true});
 for(const ext of ['webp','jpeg','jpg','png'])fs.writeFileSync(path.join(dir,`bob.${ext}`),ext);
 const store=new SourceAvatarStore(root);assert.equal(store.customAvatarPath('bob'),path.join(dir,'bob.png'));
 assert.equal(store.customAvatarPath('bob.webp'),path.join(dir,'bob.webp'));
 assert.equal(store.customAvatarPath('bo'),undefined);assert.equal(store.customAvatarPath('bob.gif'),undefined);
 for(const bad of ['..','../bob','/tmp/bob','a/bob','a\\bob','bob\0.png'])assert.equal(store.customAvatarPath(bad),undefined);
 fs.writeFileSync(path.join(root,'outside.png'),'private');fs.symlinkSync(path.join(root,'outside.png'),path.join(dir,'link.png'));assert.equal(store.customAvatarPath('link'),undefined);
 const before=store.customAvatarUrl('bob');fs.writeFileSync(path.join(dir,'bob.png'),'changed');assert.notEqual(store.customAvatarUrl('bob'),before);
 fs.unlinkSync(path.join(dir,'bob.png'));assert.equal(store.customAvatarPath('bob'),path.join(dir,'bob.jpg'));
});

for(const prefer of [false,true])test(`mapped avatar priority and fallbacks across every source: prefer custom ${prefer}`,async()=>{
 const cfg=loadConfig(),space=Object.values(cfg.spaces)[0];space.anonymous_mode=undefined;
 const user={name:'Bob',key:'bob',jellyfin_user:'bob-jellyfin',custom_avatar:'bob'};
 let jf:string|undefined='/jellyfin',custom:string|undefined='/custom';let legacyCalls=0;
 const store={anonymousUrl:()=>'/anonymous',customAvatarUrl:(name:string)=>{assert.equal(name,'bob');return custom;},avatarUrl:()=>{legacyCalls++;return '/legacy';}};
 const jellyfin={userAvatarUrl:async(name:string)=>{assert.equal(name,'bob-jellyfin');return jf;}};
 for(const source of ['jellyfin','subsonic','spotify','apple_music','external_music'] as const){
  const state:NowPlayingState={source,user:'service-name',mediaWallUserKey:'bob',playing:true,paused:false};
  jf='/jellyfin';custom='/custom';assert.equal(await userAvatar(state,user,space,jellyfin,store,prefer),prefer?'/custom':'/jellyfin');
  custom=undefined;assert.equal(await userAvatar(state,user,space,jellyfin,store,prefer),'/jellyfin');
  custom='/custom';jf=undefined;assert.equal(await userAvatar(state,user,space,jellyfin,store,prefer),'/custom');
  custom=undefined;assert.equal(await userAvatar(state,user,space,jellyfin,store,prefer),undefined);
  assert.equal(legacyCalls,0,'canonical reference never silently selects legacy art');
  const {custom_avatar,...legacyUser}=user;assert.equal(await userAvatar(state,legacyUser,space,jellyfin,store,prefer),'/legacy');legacyCalls=0;
 }
});

test("anonymous identity overrides canonical and Jellyfin avatars under both preference orders",async()=>{
 const cfg=loadConfig(),space=Object.values(cfg.spaces)[0];space.anonymous_mode={enabled:true,shown:[],not_shown:['All'],anonymous_username:'someone',now_playing_info:{show_anonymous_avatar:true,show_anonymous_username:true},user_transition_info:{show_anonymous_avatar:true}};
 const fail=()=>{throw Error('real avatar resolution must not occur');};
 const state:NowPlayingState={source:'spotify',user:'bob',mediaWallUserKey:'bob',playing:true,paused:false};
 for(const prefer of [false,true]){
  assert.equal(await userAvatar(state,{name:'bob',custom_avatar:'bob',jellyfin_user:'bob-jellyfin'},space,{userAvatarUrl:fail},{anonymousUrl:()=>'/anonymous',avatarUrl:fail,customAvatarUrl:fail},prefer),'/anonymous');
 }
 space.anonymous_mode.now_playing_info.show_anonymous_avatar=false;space.anonymous_mode.user_transition_info.show_anonymous_avatar=false;
 assert.equal(await userAvatar(state,{name:'bob',custom_avatar:'bob'},space,{userAvatarUrl:fail},{anonymousUrl:()=>'/anonymous',avatarUrl:fail,customAvatarUrl:fail},true),undefined);
});

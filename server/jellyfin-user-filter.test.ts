import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadConfig} from './config.js';
import {JellyfinClient} from './jellyfin.js';
import {jellyfinUserAllowed} from './jellyfin-user-filter.js';
import type {DisplayConfig} from './types.js';

test('Jellyfin username filters have exact normalized matching and exclusion precedence',()=>{
 const cases:Array<[string,DisplayConfig['jellyfin'],boolean]>=[
  ['monica',undefined,true],['monica',{included_jellyfin_users:[],excluded_jellyfin_users:[]},true],
  ['bob',{included_jellyfin_users:['bob'],excluded_jellyfin_users:[]},true],
  ['alice',{included_jellyfin_users:['bob'],excluded_jellyfin_users:[]},false],
  ['monica',{included_jellyfin_users:[],excluded_jellyfin_users:['Monica']},false],
  [' MONICA ',{included_jellyfin_users:['monica'],excluded_jellyfin_users:[' Monica ']},false],
  [' BoB ',{included_jellyfin_users:[' bob '],excluded_jellyfin_users:['monica']},true],
  ['monica2',{included_jellyfin_users:[],excluded_jellyfin_users:['monica']},true],
  ['Monica Jones',{included_jellyfin_users:[],excluded_jellyfin_users:['monica']},true],
  ['bob',{included_jellyfin_users:['All'],excluded_jellyfin_users:[]},false]
 ];
 for(const [name,filters,expected] of cases)assert.equal(jellyfinUserAllowed(name,filters),expected,JSON.stringify([name,filters]));
});

test('omitted space block and empty lists normalize to unrestricted defaults',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mediawall-user-filter-'));const old=process.env.MEDIAWALL_CONFIG;process.env.MEDIAWALL_CONFIG=path.join(root,'config.yml');
 try {
  fs.writeFileSync(process.env.MEDIAWALL_CONFIG,'jellyfin:\n  url: http://jellyfin.test\n  api_key: test\nspaces:\n  old: {}\n  empty:\n    jellyfin:\n      included_jellyfin_users: []\n      excluded_jellyfin_users: []\n');
  const cfg=loadConfig();assert.deepEqual(cfg.spaces.old.jellyfin,{included_jellyfin_users:[],excluded_jellyfin_users:[]});assert.deepEqual(cfg.spaces.old,cfg.spaces.empty);assert.equal(cfg.jellyfin.url,'http://jellyfin.test');
 }finally{if(old===undefined)delete process.env.MEDIAWALL_CONFIG;else process.env.MEDIAWALL_CONFIG=old;fs.rmSync(root,{recursive:true,force:true});}
});

for(const selector of ['All','monica'])test(`excluded session is absent before any downstream presentation with ${selector} mapping`,async t=>{
 const cfg=loadConfig();cfg.jellyfin.url='http://jellyfin.test';cfg.jellyfin.api_key='test';
 const space=structuredClone(Object.values(cfg.spaces)[0]);space.source_user=selector;
 space.jellyfin={included_jellyfin_users:['bob','monica'],excluded_jellyfin_users:['MONICA']};
 space.anonymous_mode={enabled:true,shown:['bob'],not_shown:['All'],anonymous_username:'someone',now_playing_info:{show_anonymous_username:true,show_anonymous_avatar:true},user_transition_info:{show_anonymous_avatar:true}};
 space.now_playing.ignored_libraries=['Fitness'];
 t.mock.method(globalThis,'fetch',async()=>Response.json([
  {UserName:'monica',NowPlayingItem:{Id:'excluded',Name:'The Great British Bake Off',Library:'Shows'}},
  {UserName:'bob',NowPlayingItem:{Id:'allowed',Library:'Shows'}},
  {UserName:'bob',NowPlayingItem:{Id:'workout',Library:'Fitness'}}
 ]));
 const client=new JellyfinClient(cfg);const libraries:string[]=[];const candidates:string[]=[];
 t.mock.method(client as any,'nowPlayingLibraryName',async(item:any)=>{libraries.push(item.Id);assert.notEqual(item.Id,'excluded');return item.Library;});
 t.mock.method(client as any,'nowPlayingFromSession',async(session:any)=>{candidates.push(session.NowPlayingItem.Id);return {source:'jellyfin',user:session.UserName,playing:true,paused:false,itemId:session.NowPlayingItem.Id};});
 const result=await client.activePlaybacks(space);
 assert.deepEqual(result.map(r=>r.itemId),selector==='All'?['allowed']:[]);
 assert.deepEqual(candidates,selector==='All'?['allowed']:[]);
 assert.equal(result.some(r=>r.user==='monica'||r.displayUser==='someone'),false);
 assert.equal(libraries.includes('excluded'),false,'Excluded session never reaches library/artwork/avatar/candidate construction');
 // Every downstream subsystem receives this same empty/filtered candidate set,
 // including anonymous presentation, collections, counts, cycling, sounds and fallback.
 const other=structuredClone(space);other.jellyfin=undefined;
 t.mock.method(client as any,'nowPlayingLibraryName',async(item:any)=>item.Library);
 const elsewhere=await client.activePlaybacks(other);assert.equal(elsewhere.some(r=>r.user==='monica'),true);
});

test('new include list narrows existing user selection rather than expanding it',async t=>{
 const cfg=loadConfig();cfg.jellyfin.url='http://jellyfin.test';cfg.jellyfin.api_key='test';
 const space=structuredClone(Object.values(cfg.spaces)[0]);space.source_user='bob';space.jellyfin={included_jellyfin_users:['bob','alice'],excluded_jellyfin_users:[]};
 t.mock.method(globalThis,'fetch',async()=>Response.json(['bob','alice'].map(UserName=>({UserName,NowPlayingItem:{Id:UserName}}))));
 const client=new JellyfinClient(cfg);t.mock.method(client as any,'nowPlayingLibraryName',async()=>undefined);t.mock.method(client as any,'nowPlayingFromSession',async(session:any)=>({user:session.UserName}));
 assert.deepEqual((await client.activePlaybacks(space)).map(s=>s.user),['bob']);
});

test('Live TV can be excluded independently of browsable libraries',async t=>{
 const cfg=loadConfig();cfg.jellyfin.url='http://jellyfin.test';cfg.jellyfin.api_key='test';
 const space=structuredClone(Object.values(cfg.spaces)[0]);space.source_user='All';space.jellyfin=undefined;space.now_playing.ignored_libraries=[' live tv '];
 t.mock.method(globalThis,'fetch',async()=>Response.json([{UserName:'bob',NowPlayingItem:{Id:'channel',Type:'TvChannel'}}]));
 const client=new JellyfinClient(cfg);const present=t.mock.method(client as any,'nowPlayingFromSession',async()=>({user:'bob'}));
 assert.deepEqual(await client.activePlaybacks(space),[]);assert.equal(present.mock.callCount(),0);
 space.now_playing.ignored_libraries=[];assert.equal((await client.activePlaybacks(space)).length,1);
});

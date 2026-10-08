import test from "node:test";
import assert from "node:assert/strict";
import {SessionStarts} from "./session-starts.js";
import {soundSessionIdentity,soundSessionContinuous} from "./sound-sessions.js";
import {ExternalMusicReceiver} from "./external-music.js";
import {loadConfig} from "./config.js";
import {soundSourceAllowed} from "../src/sound-sources.js";
import type {NowPlayingState} from "./types.js";

for(const source of ['spotify','subsonic','jellyfin','external_music'] as const)test(`${source} first-play lifecycle fires once per space, survives track updates, and rearms after inactivity`,()=>{
 const cfg=loadConfig(),space=Object.values(cfg.spaces)[0];space.now_playing.sounds.continuous_sessions={subsonic:true,external_music:true,jellyfin_libraries:['Music']};
 const first:NowPlayingState={source,user:'bob',playing:true,paused:false,title:'Track One',itemId:'one',libraryName:'Music',soundTone:'bob.mp3'};
 const key=soundSessionIdentity(first,space),next=soundSessionIdentity({...first,title:'Track Two',itemId:'two',signature:'new'},space);assert.equal(key,next);
 const a=new SessionStarts(),b=new SessionStarts();const active=[{key,continuous:soundSessionContinuous(first,space)}];
 a.observe(active,1000,30000);b.observe(active,1000,30000);
 assert.equal(a.select(key),true);assert.equal(b.select(key),true,'one space cannot consume another space’s event');
 for(const time of [2000,3000,10000]){a.observe(active,time,30000);assert.equal(a.select(key),false);}
 a.observe([],11000,30000);a.observe(active,15000,30000);assert.equal(a.select(key),false,'brief interruption does not replay');
 a.observe([],20000,30000);a.observe([],30000,30000);a.observe(active,50000,30000);assert.equal(a.select(key),true);assert.equal(a.select(key),false);
 assert.equal(soundSourceAllowed(source,space.now_playing.sounds),true);
});

test("external receiver updates drive one lifecycle; distinct user/services remain independent",t=>{
 const cfg=loadConfig();cfg.external_music.enabled=true;cfg.external_music.tokens={bob:{user:'bob'},alice:{user:'alice'}};const receiver=new ExternalMusicReceiver(cfg);const space=Object.values(cfg.spaces)[0];
 const event=(service:string,title:string)=>({listen_type:'playing_now',payload:[{track_metadata:{artist_name:'Artist',track_name:title,additional_info:{music_service_name:service,duration:300}}}]});
 t.mock.method(Date,'now',()=>1000000);receiver.receiveSubmitListens('bob',event('Spotify','First'));const life=new SessionStarts();
 const observe=()=>{const active=receiver.activePlaybacks('bob').map(s=>({key:soundSessionIdentity(s,space),continuous:soundSessionContinuous(s,space)}));life.observe(active,Date.now(),30000);return active;};
 let active=observe();assert.equal(life.select(active[0].key),true);
 receiver.receiveSubmitListens('bob',event('Spotify','First'));receiver.receiveSubmitListens('bob',event('Spotify','Next'));active=observe();assert.equal(active.length,1);assert.equal(life.select(active[0].key),false);
 receiver.receiveSubmitListens('bob',event('Kodi','Song'));receiver.receiveSubmitListens('bob',event('JRiver','Song'));receiver.receiveSubmitListens('alice',event('Spotify','Other'));
 active=observe();assert.equal(new Set(active.map(s=>s.key)).size,3);assert.equal(receiver.activePlaybacks('alice').length,1);
 // No ListenBrainz pause event exists. A history submission is not a stop signal.
 receiver.receiveSubmitListens('bob',{...event('Spotify','Next'),listen_type:'single'});
 t.mock.method(Date,'now',()=>1006000);assert.equal(receiver.activePlaybacks('bob').length,3,'missing updates cannot be treated as five-second pause');
 t.mock.method(Date,'now',()=>1311000);assert.deepEqual(observe(),[]);assert.deepEqual(receiver.activePlaybacks('bob'),[],'expiry removal is idempotent');
 t.mock.method(Date,'now',()=>1350000);receiver.receiveSubmitListens('bob',event('Spotify','Next'));active=observe();assert.equal(life.select(active[0].key),true);
});

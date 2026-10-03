import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {normalizeSubsonicConfig,normalizeSubsonicState} from "./subsonic-compat.js";
import {resolveServerIcon,serverIconPresentation} from "./server-icons.js";

test("legacy Navidrome settings normalize to canonical Subsonic settings",()=>{
 const legacy={navidrome:{enabled:true,artwork:{path_mappings:[{navidrome:"/music",mediawall:"/mounted"}]}},users:{bob:{navidrome_user:"bob",navidrome_password:"secret"}},spaces:{room:{playback_source:"navidrome",now_playing:{sounds:{navidrome:false,continuous_sessions:{navidrome:false}}},display:{nowplaying_text:{show_navidrome_username:false}}}}};
 const canonical=JSON.parse(JSON.stringify(legacy).replaceAll("navidrome","subsonic"));
 assert.deepEqual(normalizeSubsonicConfig(legacy),canonical);
 assert.deepEqual(normalizeSubsonicConfig(canonical),canonical);
 assert.equal(legacy.spaces.room.playback_source,"navidrome");
});
test("canonical values win including false, empty strings, and empty arrays; legacy fills missing fields",()=>{
 const result=normalizeSubsonicConfig({navidrome:{enabled:true,url:"old",artwork:{local_files:true,order:["local"],path_mappings:[{navidrome:"old"}]}},subsonic:{enabled:false,url:"",artwork:{order:[],path_mappings:[{navidrome:"old",subsonic:"new"}]}},users:{bob:{navidrome_user:"old",subsonic_user:"",navidrome_password:"secret"}},spaces:{room:{now_playing:{sounds:{navidrome:true,subsonic:false,continuous_sessions:{navidrome:true,subsonic:false}}},display:{nowplaying_text:{show_navidrome_username:true,show_subsonic_username:false}}}}});
 assert.equal(result.subsonic.enabled,false);assert.equal(result.subsonic.url,"");assert.equal(result.subsonic.artwork.local_files,true);assert.deepEqual(result.subsonic.artwork.order,[]);assert.deepEqual(result.subsonic.artwork.path_mappings,[{subsonic:"new"}]);assert.equal(result.users.bob.subsonic_user,"");assert.equal(result.users.bob.subsonic_password,"secret");assert.equal(result.spaces.room.now_playing.sounds.subsonic,false);assert.equal(result.spaces.room.now_playing.sounds.continuous_sessions.subsonic,false);assert.equal(result.spaces.room.display.nowplaying_text.show_subsonic_username,false);
});
test("saved legacy artwork retains URL while normalizing source",()=>assert.deepEqual(normalizeSubsonicState([{source:"navidrome",backdropUrl:"/api/navidrome/image/x"}]),[{source:"subsonic",backdropUrl:"/api/navidrome/image/x"}]));
test("icons use custom precedence, case-insensitive keys, safe paths, and content versions",t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"mediawall-icons-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const custom=path.join(root,"custom"),packaged=path.join(root,"packaged");fs.mkdirSync(custom);fs.mkdirSync(packaged);
 fs.writeFileSync(path.join(packaged,"LMS.png"),"one");fs.writeFileSync(path.join(packaged,"navidrome.svg"),"default");
 assert.equal(resolveServerIcon("lms",custom,packaged),path.join(packaged,"LMS.png"));assert.equal(resolveServerIcon("../lms",custom,packaged),undefined);
 fs.writeFileSync(path.join(custom,"lms.webp"),"custom");assert.equal(resolveServerIcon("lms",custom,packaged),path.join(custom,"lms.webp"));
 const before=serverIconPresentation("LMS","lms",custom,packaged);fs.writeFileSync(path.join(custom,"lms.webp"),"changed");assert.notEqual(before.iconUrl,serverIconPresentation("LMS","lms",custom,packaged).iconUrl);
 fs.symlinkSync(path.join(packaged,"LMS.png"),path.join(custom,"bad.png"));assert.equal(resolveServerIcon("bad",custom,packaged),undefined);
 assert.equal(serverIconPresentation("Other","missing",custom,packaged).iconUrl,serverIconPresentation("Navidrome","navidrome",custom,packaged).iconUrl);
});

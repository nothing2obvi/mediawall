import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {MusicSongTitle} from "../src/music-song-title.js";

test("music-video indicator follows the quoted title and can be hidden or customized",()=>{
 const render=(musicVideo:boolean,indicator?:{enabled:boolean;text:string})=>renderToStaticMarkup(createElement(MusicSongTitle,{title:"Darjeeling",musicVideo,indicator}));
 assert.match(render(true),/&quot;Darjeeling&quot; <span class="music-video-indicator">\[MV\]<\/span>/);
 assert.doesNotMatch(render(false),/\[MV\]/);
 assert.doesNotMatch(render(true,{enabled:false,text:'[MV]'}),/\[MV\]/);
 assert.match(render(true,{enabled:true,text:'<video>'}),/&lt;video&gt;/);
});

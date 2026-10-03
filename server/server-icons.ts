import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const extensions=[".webp",".png",".jpg",".jpeg",".svg",".gif"];
export function resolveServerIcon(key: string, custom: string, packaged: string): string | undefined {
  if (!/^[a-z0-9_-]+$/i.test(key)) return undefined;
  for(const directory of [custom,packaged]) {
    const entries=fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
    for(const extension of extensions) {
      const name=entries.find(name=>name.toLowerCase()===key.toLowerCase()+extension);
      if(!name)continue;
      const file=path.join(directory,name),stat=fs.lstatSync(file);
      if(stat.isFile() && !stat.isSymbolicLink())return file;
    }
  }
  return undefined;
}
export function serverIconPresentation(name: string, icon: string, custom: string, packaged: string) {
  const file=resolveServerIcon(icon,custom,packaged) ?? resolveServerIcon("navidrome",custom,packaged);
  const version=file ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0,16) : "missing";
  return {name,iconUrl:`/api/subsonic/server-icon?v=${version}`};
}

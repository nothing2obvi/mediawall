// Accept old public configuration at the boundary; runtime code uses Subsonic only.
function object(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function merge(legacy: any, canonical: any): any {
  if (canonical === undefined) return legacy;
  if (!object(legacy) || !object(canonical)) return canonical;
  const result = {...legacy};
  for (const [key,value] of Object.entries(canonical)) result[key]=merge(legacy[key],value);
  return result;
}
function alias(value: any, canonical: string, legacy: string) {
  if (!object(value)) return;
  value[canonical]=merge(value[legacy],value[canonical]);
  delete value[legacy];
  if (value[canonical] === undefined) delete value[canonical];
}
export function normalizeSubsonicConfig(input: any) {
  const config=structuredClone(input);
  if (!object(config)) return config;
  // Normalize mapping aliases before merging the two server sections.
  for (const key of ["navidrome","subsonic"]) {
    for (const mapping of config[key]?.artwork?.path_mappings ?? []) alias(mapping,"subsonic","navidrome");
  }
  alias(config,"subsonic","navidrome");
  for (const user of Object.values(config.users ?? {})) {
    alias(user,"subsonic_user","navidrome_user");
    alias(user,"subsonic_password","navidrome_password");
  }
  for (const space of Object.values(config.spaces ?? {}) as any[]) {
    if (!object(space)) continue;
    if (space.playback_source === "navidrome") space.playback_source="subsonic";
    alias(space.now_playing?.sounds,"subsonic","navidrome");
    alias(space.now_playing?.sounds?.continuous_sessions,"subsonic","navidrome");
    alias(space.display?.nowplaying_text,"show_subsonic_username","show_navidrome_username");
  }
  return config;
}
// Saved selections/favorites predate the source rename. Preserve their URLs and identity.
export function normalizeSubsonicState(value: any): any {
  if (Array.isArray(value)) return value.map(normalizeSubsonicState);
  if (!object(value)) return value;
  const result=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalizeSubsonicState(item)]));
  if(result.source === "navidrome") result.source="subsonic";
  return result;
}

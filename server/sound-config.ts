/** Normalize legacy source switches without overriding explicit canonical values. */
export function normalizeSoundSources(input: any, warn: (message: string) => void = () => {}) {
  const config = structuredClone(input);
  for (const [name, space] of Object.entries(config.spaces ?? {}) as Array<[string, any]>) {
    const sounds = space?.now_playing?.sounds;
    if (!sounds || typeof sounds !== "object" || Array.isArray(sounds)) continue;
    for (const source of ["jellyfin", "subsonic", "external_music"]) {
      if (sounds[source] === undefined) continue;
      warn(`Configuration migration: spaces.${name}.now_playing.sounds.${source} is deprecated; use sounds.sources.${source}. Legacy values still work; explicit sources values take priority.`);
      if (sounds.sources === undefined) sounds.sources = {};
      if (sounds.sources && typeof sounds.sources === "object" && !Array.isArray(sounds.sources) && sounds.sources[source] === undefined) {
        sounds.sources[source] = sounds[source];
      }
      delete sounds[source];
    }
  }
  return config;
}

export interface SoundSources {
  jellyfin: boolean;
  subsonic: boolean;
  external_music: boolean;
}

export function soundSourceAllowed(source: string, sounds: { sources: SoundSources }) {
  if (source === "jellyfin") return sounds.sources.jellyfin;
  if (source === "subsonic") return sounds.sources.subsonic;
  return sounds.sources.external_music;
}

export function normalizeSessionCount(input: any, warn: (message: string) => void = () => {}) {
  const config = structuredClone(input);
  for (const [name, space] of Object.entries(config.spaces ?? {}) as Array<[string, any]>) {
    const count = space?.now_playing?.session_count;
    if (!count || typeof count !== "object" || Array.isArray(count)) continue;
    if (count.enabled !== undefined || count.font_size !== undefined) {
      warn(`Configuration migration: spaces.${name}.now_playing.session_count.enabled/font_size is deprecated but still supported. Use session_count.mode: small or large, or false to hide it. Explicit mode wins; legacy font_size still applies to small.`);
    }
    if (count.mode === undefined && count.enabled !== undefined) count.mode = count.enabled === false ? false : "small";
    delete count.enabled;
  }
  return config;
}

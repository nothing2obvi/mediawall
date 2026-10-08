/** One first-play event per continuous lifecycle, independently for each space. */
export class SessionStarts {
  private sessions = new Map<string, { shown: boolean; inactiveSince?: number; continuous: boolean }>();

  observe(active: Array<{ key: string; continuous: boolean }>, now: number, cooldownMs: number) {
    const keys = new Set(active.map(session => session.key));
    for (const [key, session] of this.sessions) {
      if (!keys.has(key)) session.inactiveSince ??= now;
    }
    for (const current of active) {
      const previous = this.sessions.get(current.key);
      const restarted = previous?.continuous && previous.inactiveSince !== undefined && now - previous.inactiveSince >= cooldownMs;
      this.sessions.set(current.key, { continuous: current.continuous, shown: restarted ? false : previous?.shown ?? false });
    }
  }

  select(key: string) {
    const session = this.sessions.get(key);
    if (!session || session.inactiveSince !== undefined || session.shown) return false;
    session.shown = true;
    return true;
  }
}

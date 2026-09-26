export class EditorClock {
  private holds = new Map<string, { since: number; leases: Map<string, number> }>();
  constructor(private resume: (space: string, elapsed: number) => void, private now = () => Date.now()) {}
  hold(space: string, id: string) {
    this.frozenAt(space);
    const hold = this.holds.get(space) ?? { since: this.now(), leases: new Map<string, number>() };
    hold.leases.set(id, this.now() + 30_000); this.holds.set(space, hold);
  }
  release(space: string, id: string) {
    const hold = this.holds.get(space); if (!hold) return;
    hold.leases.delete(id); this.frozenAt(space);
  }
  frozenAt(space: string) {
    const hold = this.holds.get(space); if (!hold) return undefined;
    for (const [id, expires] of hold.leases) if (expires <= this.now()) hold.leases.delete(id);
    if (!hold.leases.size) { this.holds.delete(space); this.resume(space, this.now() - hold.since); return undefined; }
    return hold.since;
  }
}

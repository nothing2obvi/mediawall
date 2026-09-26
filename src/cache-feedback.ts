export function cacheClearFeedback(event: {id: string; at: number} | undefined, lastId: string | undefined, mountedAt: number, soundEnabled: boolean) {
  const show = Boolean(event && event.id !== lastId && event.at >= mountedAt);
  return { show, sound: show && soundEnabled ? "trash.mp3" : undefined };
}

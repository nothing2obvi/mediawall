export function SessionCount({mode, position, total}: {mode: "small" | "large" | false; position: number; total: number}) {
  if (mode === false) return null;
  return <div className={mode === "large" ? "session-timer-count session-timer-count-large" : "session-timer-count"}>{mode === "large" ? position : `${position} of ${total}`}</div>;
}

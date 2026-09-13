type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const logLevelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

const configuredLevel = normalizeLogLevel(process.env.LOG_LEVEL);

function normalizeLogLevel(value: string | undefined): LogLevel {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error" || normalized === "silent") {
    return normalized;
  }
  return "info";
}

function shouldLog(level: Exclude<LogLevel, "silent">) {
  return logLevelOrder[level] >= logLevelOrder[configuredLevel];
}

function write(level: Exclude<LogLevel, "silent">, message: string, ...details: unknown[]) {
  if (!shouldLog(level)) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  if (level === "error") console.error(line, ...details);
  else if (level === "warn") console.warn(line, ...details);
  else console.log(line, ...details);
}

export const logger = {
  level: configuredLevel,
  debug: (message: string, ...details: unknown[]) => write("debug", message, ...details),
  info: (message: string, ...details: unknown[]) => write("info", message, ...details),
  warn: (message: string, ...details: unknown[]) => write("warn", message, ...details),
  error: (message: string, ...details: unknown[]) => write("error", message, ...details)
};

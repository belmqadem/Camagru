const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const defaultLevel = process.env.NODE_ENV === "production" ? "info" : "debug";
const configuredLevel = String(
  process.env.LOG_LEVEL || defaultLevel,
).toLowerCase();
const activeLevel = Object.prototype.hasOwnProperty.call(
  levels,
  configuredLevel,
)
  ? configuredLevel
  : defaultLevel;

const shouldLog = (level) => levels[level] <= levels[activeLevel];

const normalizeMeta = (meta) => {
  if (!meta) return "";
  if (meta instanceof Error) {
    return meta.stack || meta.message;
  }

  if (typeof meta === "object") {
    try {
      return JSON.stringify(meta);
    } catch (error) {
      return String(meta);
    }
  }

  return String(meta);
};

const write = (level, message, meta) => {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const normalizedMessage =
    typeof message === "string" ? message : String(message);
  const normalizedMeta = normalizeMeta(meta);
  const line = normalizedMeta
    ? `[${timestamp}] [${level.toUpperCase()}] ${normalizedMessage} ${normalizedMeta}`
    : `[${timestamp}] [${level.toUpperCase()}] ${normalizedMessage}`;

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
};

module.exports = {
  error: (message, meta) => write("error", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  info: (message, meta) => write("info", message, meta),
  debug: (message, meta) => write("debug", message, meta),
};

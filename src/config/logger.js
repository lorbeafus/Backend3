import winston from "winston";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export const LOG_LEVELS = Object.freeze({ fatal: 0, error: 1, warning: 2, info: 3, http: 4, debug: 5 });
// No se serializan requests ni errores crudos. Defensa adicional para metadatos accidentales.
const cleanString = value => value.replace(/[\r\n\t]/g, " ")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, "[REDACTED_URI]")
    .replace(/\$2[abxy]\$[^\s]+/g, "[REDACTED_HASH]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]");
function redact(value, depth = 0) {
    if (depth > 5) return "[TRUNCATED]";
    if (typeof value === "string") return cleanString(value).slice(0, 2000);
    if (Array.isArray(value)) return value.slice(0, 100).map(v => redact(v, depth + 1));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, val]) =>
        [key, /password|secret|token|cookie|authorization|mongo.*uri|email|address|body/i.test(key) ? "[REDACTED]" : redact(val, depth + 1)]));
    return value;
}
const safeFormat = winston.format(info => {
    for (const key of Object.keys(info)) info[key] = redact(info[key]);
    return info;
});
export const logger = winston.createLogger({
    levels: LOG_LEVELS, level: "debug", exitOnError: false,
    transports: [new winston.transports.Console({ format: winston.format.combine(safeFormat(), winston.format.timestamp(), winston.format.json()) })],
});
let activeDirectory;
export function configureLogger({ nodeEnv, logDir, maxSize, maxFiles }) {
    const directory = resolve(logDir);
    mkdirSync(directory, { recursive: true });
    logger.clear();
    logger.level = nodeEnv === "production" ? "info" : "debug";
    const format = () => winston.format.combine(safeFormat(), winston.format.timestamp(), winston.format.json());
    logger.add(new winston.transports.Console({ level: logger.level, format: format() }));
    for (const [filename, level] of [["error.log", "error"], ["application.log", logger.level]]) {
        logger.add(new winston.transports.File({ filename: resolve(directory, filename), level,
            maxsize: maxSize, maxFiles, tailable: true, format: format() }));
    }
    activeDirectory = directory;
}
logger.on("error", () => { process.stderr.write("No se pudo escribir un registro del logger.\n"); });
export const getLogDirectory = () => activeDirectory;
export const finishLogger = () => new Promise(resolve => { logger.once("finish", resolve); logger.end(); });

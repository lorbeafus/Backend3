import dotenv from "dotenv";
import { logger, configureLogger } from "./logger.js";
import { fileURLToPath } from "node:url";

// Cargar variables de entorno desde el archivo .env
dotenv.config({ quiet: true });
const logDirectory = process.env.LOG_DIR?.trim() || fileURLToPath(new URL("../../logs", import.meta.url));
const logMaxSize = Number(process.env.LOG_MAX_SIZE || 5242880);
const logMaxFiles = Number(process.env.LOG_MAX_FILES || 5);
configureLogger({ nodeEnv: process.env.NODE_ENV, logDir: logDirectory,
    maxSize: Number.isSafeInteger(logMaxSize) && logMaxSize >= 1024 ? logMaxSize : 5242880,
    maxFiles: Number.isSafeInteger(logMaxFiles) && logMaxFiles >= 2 ? logMaxFiles : 5 });

/**
 * Validador estricto de variables de entorno críticas.
 * Si alguna variable falta o contiene un valor inválido, lanza un error descriptivo
 * impidiendo que la aplicación arranque en un estado inconsistente.
 */
const validateEnvironment = () => {
    const errors = [];

    // 1. Validación de PORT
    const portRaw = process.env.PORT;
    if (!portRaw || portRaw.trim() === "") {
        errors.push("PORT es obligatoria y debe ser un número entero entre 1 y 65535.");
    } else {
        const portNum = Number(portRaw);
        if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
            errors.push(`PORT tiene un valor inválido (${portRaw}). Debe ser un número entero entre 1 y 65535.`);
        }
    }

    // 2. Validación de MONGODB_URI
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri || mongoUri.trim() === "") {
        errors.push("MONGODB_URI es obligatoria y no puede estar vacía.");
    }

    // 3. Validación de NODE_ENV
    const validEnvironments = ["development", "production", "test"];
    const nodeEnv = process.env.NODE_ENV;
    if (!nodeEnv || !validEnvironments.includes(nodeEnv.trim())) {
        errors.push(`NODE_ENV es obligatorio y debe ser uno de: ${validEnvironments.join(", ")}. Recibido: '${nodeEnv || ""}'`);
    }

    // 4. Validación de JWT_SECRET
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.trim() === "") {
        errors.push("JWT_SECRET es obligatoria para la seguridad de autenticación.");
    }

    if (!Number.isSafeInteger(logMaxSize) || logMaxSize < 1024 || logMaxSize > 104857600) errors.push("LOG_MAX_SIZE debe ser un entero entre 1024 y 104857600 bytes");
    if (!Number.isSafeInteger(logMaxFiles) || logMaxFiles < 2 || logMaxFiles > 30) errors.push("LOG_MAX_FILES debe ser un entero entre 2 y 30");
    if (errors.length > 0) {
        logger.fatal("Configuración inicial inválida", { event: "configuration_failed", validationCount: errors.length });
        throw new Error(
            `\n[FATAL] Error de configuración de variables de entorno al iniciar:\n - ${errors.join("\n - ")}\nVerificá tu archivo .env contra .env.example.\n`
        );
    }
};

// Ejecutar validación inmediata al cargar el módulo
validateEnvironment();

export const config = Object.freeze({
    // Opcionales para la API; el comando seed:admin los valida al ejecutarse.
    ADMIN_EMAIL: process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    LOG_DIR: logDirectory,
    LOG_MAX_SIZE: logMaxSize,
    LOG_MAX_FILES: logMaxFiles,
    PORT: Number(process.env.PORT),
    NODE_ENV: process.env.NODE_ENV.trim(),
    MONGODB_URI: process.env.MONGODB_URI.trim(),
    JWT_SECRET: process.env.JWT_SECRET.trim(),
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN?.trim() || "1h",
});

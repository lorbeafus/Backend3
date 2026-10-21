import { ERROR_DICTIONARY } from "../constants/index.js";
import { AppError } from "../utils/errors.js";

/**
 * Whitelist de claves públicas permitidas en el objeto `details`.
 * Evita filtración de datos sensibles, consultas internas o payloads completos.
 */
const ALLOWED_DETAIL_KEYS = new Set([
    "field",
    "fields",
    "expected",
    "received",
    "allowed",
    "limit",
    "min",
    "max",
    "method",
    "path",
    "phase",
    "insertedCounts",
    "errors",
]);

/**
 * Sanitiza el objeto de detalles aplicando la lista blanca estricta.
 */
function sanitizePublicDetails(rawDetails) {
    if (!rawDetails || typeof rawDetails !== "object" || Array.isArray(rawDetails)) {
        return {};
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(rawDetails)) {
        if (!ALLOWED_DETAIL_KEYS.has(key)) continue;

        // Validar estructura de contadores en fallos de seed
        if (key === "insertedCounts" && typeof value === "object" && value !== null) {
            cleaned.insertedCounts = {
                users: Number(value.users) || 0,
                drivers: Number(value.drivers) || 0,
                orders: Number(value.orders) || 0,
                deliveries: Number(value.deliveries) || 0,
            };
            continue;
        }

        // Sanitizar array de validaciones de campos
        if (key === "errors" && Array.isArray(value)) {
            cleaned.errors = value.map((errItem) => ({
                field: String(errItem.field || errItem.path || "unknown"),
                message: "El campo no cumple las reglas de validación",
            }));
            continue;
        }

        // Valores escalares seguros
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            const str = String(value);
            // Bloqueo de hashes bcrypt, contraseñas o tokens
            if (!/password|hash|token|\$2[abxy]\$/i.test(key) && !/\$2[abxy]\$/i.test(str)) {
                cleaned[key] = value;
            }
        } else if (Array.isArray(value)) {
            cleaned[key] = value.filter(
                (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean"
            );
        }
    }

    return cleaned;
}

/**
 * Middleware global de gestión y normalización de errores (Preentrega 3).
 * Es el único punto de construcción de respuestas de error HTTP de ShipNow API.
 */
export const errorHandler = (err, req, res, next) => {
    // Si la respuesta ya comenzó a enviarse, delegar en Express por especificación
    if (res.headersSent) {
        return next(err);
    }

    let statusCode = err.statusCode || err.status || 500;
    let code = err.code || ERROR_DICTIONARY.INTERNAL_SERVER_ERROR.code;
    let message = err.message || ERROR_DICTIONARY.INTERNAL_SERVER_ERROR.message;
    let rawDetails = err.details || {};

    // 1. Errores personalizados de la aplicación (AppError)
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        code = err.code;
        message = err.message;
        rawDetails = err.details || {};
        if (err.phase) rawDetails.phase = err.phase;
        if (err.insertedCounts) rawDetails.insertedCounts = err.insertedCounts;
    }
    // 2. Errores de parseo de JSON en body-parser
    else if (err.type === "entity.parse.failed") {
        statusCode = 400;
        code = ERROR_DICTIONARY.INVALID_JSON_BODY.code;
        message = "El cuerpo de la petición no es un JSON válido";
        rawDetails = {};
    }
    // 3. Errores de tamaño de cuerpo excedido
    else if (err.type === "entity.too.large") {
        statusCode = 413;
        code = ERROR_DICTIONARY.INVALID_INPUT_DATA.code;
        message = "El tamaño de la petición supera el límite permitido";
        rawDetails = {};
    }
    // 4. Errores de validación de Mongoose
    else if (err.name === "ValidationError") {
        statusCode = 400;
        code = ERROR_DICTIONARY.INVALID_INPUT_DATA.code;
        message = "Los datos ingresados no cumplen con las reglas de validación";
        rawDetails = {
            errors: Object.values(err.errors || {}).map((e) => ({
                field: e.path,
                message: "El campo no cumple las reglas de validación",
            })),
        };
    }
    // 5. Errores de casteo de Mongoose (ObjectId malformado)
    else if (err.name === "CastError") {
        statusCode = 400;
        code = ERROR_DICTIONARY.INVALID_ID.code;
        message = "El identificador proporcionado no es un identificador válido";
        rawDetails = { field: err.path };
    }
    // 6. Colisión de índice único en MongoDB (código 11000)
    else if (err.code === 11000 || err.cause?.code === 11000) {
        statusCode = 409;
        code = ERROR_DICTIONARY.DUPLICATE_RESOURCE.code;
        message = "Ya existe un registro con esos datos únicos";
        rawDetails = err.details || {};
        if (err.phase) rawDetails.phase = err.phase;
        if (err.insertedCounts) rawDetails.insertedCounts = err.insertedCounts;
    }
    // 7. Errores de JWT (token malformado o expirado)
    else if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
        statusCode = 401;
        code = ERROR_DICTIONARY.TOKEN_INVALID_OR_EXPIRED.code;
        message = "Token de autenticación inválido o expirado";
        rawDetails = {};
    }

    // 8. Manejo de errores internos / inesperados (500)
    if (statusCode >= 500) {
        // Registro de diagnóstico interno con stack y causa original sin exponer al cliente
        console.error("❌ [ShipNow Internal Error]:", {
            code,
            message: err.message,
            stack: err.stack,
            cause: err.cause,
        });

        statusCode = 500;
        code = ERROR_DICTIONARY.INTERNAL_SERVER_ERROR.code;
        message = ERROR_DICTIONARY.INTERNAL_SERVER_ERROR.message;
        // Solo metadatos construidos por nuestra clase; nunca detalles de la causa.
        rawDetails = err instanceof AppError
            ? { phase: err.phase, insertedCounts: err.insertedCounts }
            : {};
    }

    const sanitizedDetails = sanitizePublicDetails(rawDetails);

    // Formato uniforme de respuesta según requisitos de Preentrega 3
    const responsePayload = {
        status: "error",
        statusCode,
        message,
        error: {
            code,
            message,
            details: sanitizedDetails,
        },
    };

    // Si hubo fase o contadores de seed, conservarlos también para retrocompatibilidad
    if (sanitizedDetails.phase) {
        responsePayload.phase = sanitizedDetails.phase;
    }
    if (sanitizedDetails.insertedCounts) {
        responsePayload.insertedCounts = sanitizedDetails.insertedCounts;
    }

    return res.status(statusCode).json(responsePayload);
};

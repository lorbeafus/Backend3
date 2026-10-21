import { ERROR_DICTIONARY } from "../constants/index.js";

/**
 * Clase base para todos los errores controlados de la aplicación (Preentrega 3).
 * Extiende la clase nativa Error e integra el diccionario centralizado de errores
 * para garantizar códigos semánticos, mensajes consistentes y códigos de estado HTTP.
 */
export class AppError extends Error {
    /**
     * @param {Object} errorDef Definición proveniente de ERROR_DICTIONARY
     * @param {string|null} customMessage Mensaje específico o contextual opcional
     * @param {Object} options Opciones adicionales (details, cause, phase, insertedCounts, statusCode)
     */
    constructor(
        errorDef = ERROR_DICTIONARY.INTERNAL_SERVER_ERROR,
        customMessage = null,
        { details = null, cause = null, phase = null, insertedCounts = null, statusCode = null } = {}
    ) {
        const message = customMessage || errorDef?.message || "Error en la aplicación";
        super(message);
        this.name = this.constructor.name;
        this.code = errorDef?.code || "INTERNAL_SERVER_ERROR";
        this.statusCode = statusCode || errorDef?.statusCode || 500;
        this.details = details;

        if (cause) {
            this.cause = cause;
        }
        if (phase) {
            this.phase = phase;
        }
        if (insertedCounts) {
            this.insertedCounts = insertedCounts;
        }

        Error.captureStackTrace?.(this, this.constructor);
    }
}

/**
 * Especialización de AppError para fallos parciales durante la carga de mocks (seed).
 * Conserva la fase de fallo y los contadores confirmados de inserción.
 */
export class MockSeedError extends AppError {
    constructor(
        errorDef = ERROR_DICTIONARY.MOCK_PERSISTENCE_FAILED,
        customMessage = null,
        { phase = null, insertedCounts = null, cause = null, statusCode = null, details = null } = {}
    ) {
        super(errorDef, customMessage, {
            phase,
            insertedCounts,
            cause,
            statusCode,
            details: details || (phase || insertedCounts ? { phase, insertedCounts } : null),
        });
    }
}

/**
 * Mapeo auxiliar de fallback según código de estado HTTP para compatibilidad.
 */
const STATUS_FALLBACK_MAP = Object.freeze({
    400: ERROR_DICTIONARY.INVALID_INPUT_DATA,
    401: ERROR_DICTIONARY.AUTHENTICATION_REQUIRED,
    403: ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS,
    404: ERROR_DICTIONARY.ROUTE_NOT_FOUND,
    409: ERROR_DICTIONARY.DUPLICATE_RESOURCE,
    500: ERROR_DICTIONARY.INTERNAL_SERVER_ERROR,
});

/**
 * Adaptador retrocompatible de creación de errores HTTP.
 * Utiliza internamente AppError y el diccionario centralizado, evitando sistemas paralelos.
 */
export const httpError = (statusCode, message, options = {}) => {
    const defaultDef = STATUS_FALLBACK_MAP[statusCode] || ERROR_DICTIONARY.INTERNAL_SERVER_ERROR;
    return new AppError(defaultDef, message, { ...options, statusCode });
};

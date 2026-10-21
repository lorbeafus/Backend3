import { AppError } from "../utils/errors.js";
import { ERROR_DICTIONARY } from "../constants/index.js";

/**
 * Middleware para capturar peticiones a rutas inexistentes (404).
 * Construye un AppError con ROUTE_NOT_FOUND para que sea procesado de forma uniforme
 * por el errorHandler centralizado.
 */
export const notFoundHandler = (req, res, next) => {
    next(
        new AppError(
            ERROR_DICTIONARY.ROUTE_NOT_FOUND,
            `La ruta '${req.method} ${req.originalUrl}' no existe en este servidor`,
            { details: { method: req.method, path: req.originalUrl } }
        )
    );
};

import { passportCall } from "./passport.middleware.js";
import { AppError } from "../utils/errors.js";
import { ERROR_DICTIONARY } from "../constants/index.js";

/**
 * Middleware para autenticar la sesión del usuario mediante JWT en cookie.
 */
export const authMiddleware = passportCall("current");

/**
 * Middleware para autorizar roles específicos basados en constantes.
 * En lugar de responder manualmente con res.status().json(), delega al middleware
 * global centralizado mediante AppError.
 * @param  {...string} allowedRoles Roles autorizados
 */
export const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError(ERROR_DICTIONARY.AUTHENTICATION_REQUIRED, "No autenticado"));
        }
        if (!allowedRoles.includes(req.user.role)) {
            return next(
                new AppError(
                    ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS,
                    "No tenés permisos para realizar esta acción",
                    {
                        details: {
                            received: req.user.role,
                            allowed: allowedRoles,
                        },
                    }
                )
            );
        }
        next();
    };
};

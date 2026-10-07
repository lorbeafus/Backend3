import { passportCall } from "./passport.middleware.js";

/**
 * Middleware para autenticar la sesión del usuario mediante JWT en cookie.
 */
export const authMiddleware = passportCall("current");

/**
 * Middleware para autorizar roles específicos basados en constantes.
 * @param  {...string} allowedRoles Roles autorizados
 */
export const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status: "error",
                message: "No autenticado",
            });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                status: "error",
                message: "No tenés permisos para realizar esta acción",
            });
        }
        next();
    };
};

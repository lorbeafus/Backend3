import passport from "passport";
import { httpError } from "../utils/errors.js";

/**
 * Invoca una estrategia de Passport y traduce el resultado a errores HTTP consistentes.
 * Los errores lanzados por los Services (con statusCode) pasan tal cual al errorHandler.
 */
export const passportCall = (strategy) => {
    return (req, res, next) => {
        passport.authenticate(strategy, { session: false }, (err, user, info) => {
            if (err) return next(err);

            if (!user) {
                if (strategy === "register") {
                    // passport-local informa "Missing credentials" cuando faltan email o password
                    return next(httpError(400, "Todos los campos son obligatorios"));
                }
                if (strategy === "login") {
                    return next(httpError(400, "Email y contraseña son obligatorios"));
                }
                const noToken = String(info?.message ?? info ?? "").includes("No auth token");
                return next(httpError(401, noToken ? "No autenticado" : "Token inválido o expirado"));
            }

            req.user = user;
            next();
        })(req, res, next);
    };
};

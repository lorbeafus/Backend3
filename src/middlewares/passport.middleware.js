import passport from "passport";
import { AppError } from "../utils/errors.js";
import { ERROR_DICTIONARY } from "../constants/index.js";

/**
 * Invoca una estrategia de Passport y traduce el resultado a errores HTTP consistentes.
 * Delega cualquier excepción al errorHandler centralizado mediante AppError.
 */
export const passportCall = (strategy) => {
    return (req, res, next) => {
        passport.authenticate(strategy, { session: false }, (err, user, info) => {
            if (err) return next(err);

            if (!user) {
                if (strategy === "register") {
                    return next(
                        new AppError(
                            ERROR_DICTIONARY.INVALID_INPUT_DATA,
                            "Todos los campos son obligatorios"
                        )
                    );
                }
                if (strategy === "login") {
                    return next(
                        new AppError(
                            ERROR_DICTIONARY.INVALID_INPUT_DATA,
                            "Email y contraseña son obligatorios"
                        )
                    );
                }
                const noToken = !req.cookies?.currentUser;
                if (noToken) {
                    return next(
                        new AppError(
                            ERROR_DICTIONARY.AUTHENTICATION_REQUIRED,
                            "No autenticado"
                        )
                    );
                }
                return next(
                    new AppError(
                        ERROR_DICTIONARY.TOKEN_INVALID_OR_EXPIRED,
                        "Token inválido o expirado"
                    )
                );
            }

            req.user = user;
            next();
        })(req, res, next);
    };
};

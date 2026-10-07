import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as JwtStrategy } from "passport-jwt";
import { usersRepository } from "../repositories/users.repository.js";
import { sessionsService } from "../services/sessions.services.js";
import { config } from "./env.config.js";

const cookieExtractor = (req) => {
    let token = null;
    if (req && req.cookies) {
        token = req.cookies["currentUser"];
    }
    return token;
};

/**
 * Integración con Passport. Las estrategias solo extraen credenciales y delegan en
 * SessionsService; las validaciones y reglas de negocio viven en el Service.
 * Los errores (con statusCode) se propagan con done(error) al middleware de errores.
 */
export const initializePassport = () => {
    passport.use(
        "register",
        new LocalStrategy(
            { usernameField: "email", passReqToCallback: true },
            async (req, email, password, done) => {
                try {
                    const { first_name, last_name } = req.body ?? {};
                    const newUser = await sessionsService.register({ first_name, last_name, email, password });
                    return done(null, newUser);
                } catch (error) {
                    return done(error);
                }
            }
        )
    );

    passport.use(
        "login",
        new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
            try {
                const user = await sessionsService.login({ email, password });
                return done(null, user);
            } catch (error) {
                return done(error);
            }
        })
    );

    passport.use(
        "current",
        new JwtStrategy(
            {
                jwtFromRequest: cookieExtractor,
                secretOrKey: config.JWT_SECRET,
            },
            async (jwtPayload, done) => {
                try {
                    if (!jwtPayload || !jwtPayload.id) {
                        return done(null, false, { message: "Token inválido o expirado" });
                    }

                    // El rol se lee siempre de la base (no del token) para reflejar cambios y borrados.
                    const user = await usersRepository.getById(jwtPayload.id);
                    if (!user) {
                        return done(null, false, { message: "Usuario no encontrado" });
                    }

                    return done(null, user);
                } catch (error) {
                    return done(error);
                }
            }
        )
    );
};

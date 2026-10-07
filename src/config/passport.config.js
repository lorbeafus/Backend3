import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as JwtStrategy } from "passport-jwt";
import { usersRepository } from "../repositories/users.repository.js";
import { createHash, isValidPassword } from "../utils/hash.js";
import { config } from "./env.config.js";
import { USER_ROLES } from "../constants/index.js";

const cookieExtractor = (req) => {
    let token = null;
    if (req && req.cookies) {
        token = req.cookies["currentUser"];
    }
    return token;
};

export const initializePassport = () => {
    // 1. Estrategia de Registro local
    passport.use(
        "register",
        new LocalStrategy(
            {
                usernameField: "email",
                passReqToCallback: true,
            },
            async (req, email, password, done) => {
                try {
                    const { first_name, last_name } = req.body;

                    if (!first_name || !last_name || !email || !password) {
                        return done(null, false, { message: "Todos los campos son obligatorios" });
                    }

                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(email)) {
                        return done(null, false, { message: "Formato de email inválido" });
                    }

                    if (password.length < 6) {
                        return done(null, false, { message: "La contraseña debe tener al menos 6 caracteres" });
                    }

                    const normalizedEmail = email.trim().toLowerCase();

                    const existingUser = await usersRepository.getByEmail(normalizedEmail);
                    if (existingUser) {
                        return done(null, false, { message: "Ya existe un usuario registrado con ese email" });
                    }

                    const hashedPassword = await createHash(password);

                    // Por seguridad de la API, el registro público asigna estrictamente el rol USER
                    const newUser = await usersRepository.create({
                        first_name: first_name.trim(),
                        last_name: last_name.trim(),
                        email: normalizedEmail,
                        password: hashedPassword,
                        role: USER_ROLES.USER,
                    });

                    return done(null, newUser);
                } catch (error) {
                    return done(error);
                }
            }
        )
    );

    // 2. Estrategia de Login local
    passport.use(
        "login",
        new LocalStrategy(
            {
                usernameField: "email",
            },
            async (email, password, done) => {
                try {
                    if (!email || !password) {
                        return done(null, false, { message: "Email y contraseña son obligatorios" });
                    }

                    const normalizedEmail = email.trim().toLowerCase();
                    // Para autenticación necesitamos la contraseña hasheada
                    const user = await usersRepository.getByEmail(normalizedEmail);
                    if (!user) {
                        return done(null, false, { message: "Credenciales inválidas" });
                    }

                    const validPassword = await isValidPassword(password, user.password);
                    if (!validPassword) {
                        return done(null, false, { message: "Credenciales inválidas" });
                    }

                    return done(null, user);
                } catch (error) {
                    return done(error);
                }
            }
        )
    );

    // 3. Estrategia JWT para extracción desde cookie
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

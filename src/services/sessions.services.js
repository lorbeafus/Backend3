import { usersRepository } from "../repositories/users.repository.js";
import { usersService } from "./users.services.js";
import { USER_ROLES } from "../constants/index.js";
import { isValidPassword } from "../utils/hash.js";
import { httpError } from "../utils/errors.js";
import { assertBodyObject, isNonEmptyString } from "../utils/validation.js";

/**
 * Servicio de Sesiones para ShipNow API.
 * Única fuente de las reglas de registro y login. Passport solo actúa como integración
 * (extrae credenciales y delega acá); no contiene validaciones propias.
 */
export class SessionsService {
    /**
     * Registro público: el rol siempre es USER, se ignora lo que venga en el body.
     * Reutiliza las validaciones y el hasheo de UsersService.createUser.
     */
    async register(userData) {
        assertBodyObject(userData);
        const { first_name, last_name, email, password } = userData;
        return await usersService.createUser({
            first_name,
            last_name,
            email,
            password,
            role: USER_ROLES.USER,
        });
    }

    /**
     * Valida credenciales y devuelve el usuario sin password.
     * Pide explícitamente el hash al repository (que lo oculta por defecto) y lo compara con bcrypt.
     */
    async login({ email, password } = {}) {
        if (!isNonEmptyString(email) || typeof password !== "string" || password === "") {
            throw httpError(400, "Email y contraseña son obligatorios");
        }

        const user = await usersRepository.getByEmail(email.trim().toLowerCase());
        if (!user) {
            throw httpError(401, "Credenciales inválidas");
        }

        const validPassword = await isValidPassword(password, user.password);
        if (!validPassword) {
            throw httpError(401, "Credenciales inválidas");
        }

        const { password: _hash, ...safeUser } = user;
        return safeUser;
    }
}

export const sessionsService = new SessionsService();

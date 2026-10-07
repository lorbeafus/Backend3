import { usersRepository } from "../repositories/users.repository.js";
import { USER_ROLES } from "../constants/index.js";
import { createHash } from "../utils/hash.js";
import { httpError } from "../utils/errors.js";
import { assertBodyObject, assertValidId, isNonEmptyString } from "../utils/validation.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

/**
 * Servicio de Usuarios para ShipNow API.
 * Concentra validaciones de negocio, restricciones de roles y verificación de existencia.
 */
export class UsersService {
    async getUsers() {
        return await usersRepository.getAll();
    }

    async getUserById(id) {
        assertValidId(id);
        const user = await usersRepository.getById(id);
        if (!user) {
            throw httpError(404, "Usuario no encontrado");
        }
        return user;
    }

    async createUser(userData) {
        assertBodyObject(userData);
        const { first_name, last_name, email, password, role } = userData;

        if (!isNonEmptyString(first_name) || !isNonEmptyString(last_name) || !isNonEmptyString(email) || typeof password !== "string" || password === "") {
            throw httpError(400, "Todos los campos obligatorios deben completarse con texto válido");
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (!EMAIL_REGEX.test(normalizedEmail)) {
            throw httpError(400, "El formato del correo electrónico no es válido");
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            throw httpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
        }

        const existingUser = await usersRepository.getByEmail(normalizedEmail);
        if (existingUser) {
            throw httpError(409, "Ya existe un usuario registrado con ese email");
        }

        let assignedRole = USER_ROLES.USER;
        if (role !== undefined) {
            if (typeof role !== "string" || !Object.values(USER_ROLES).includes(role)) {
                throw httpError(400, `Rol no válido. Roles permitidos: ${Object.values(USER_ROLES).join(", ")}`);
            }
            assignedRole = role;
        }

        const hashedPassword = await createHash(password);

        return await usersRepository.create({
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: assignedRole,
        });
    }
}

export const usersService = new UsersService();

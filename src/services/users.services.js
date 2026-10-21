import { usersRepository } from "../repositories/users.repository.js";
import { USER_ROLES, ERROR_DICTIONARY } from "../constants/index.js";
import { createHash } from "../utils/hash.js";
import { AppError } from "../utils/errors.js";
import { assertBodyObject, assertValidId, isNonEmptyString, assertPassword } from "../utils/validation.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
            throw new AppError(ERROR_DICTIONARY.USER_NOT_FOUND, "Usuario no encontrado", {
                details: { field: "id" },
            });
        }
        return user;
    }

    async createUser(userData) {
        assertBodyObject(userData);
        const { first_name, last_name, email, password, role } = userData;

        if (!isNonEmptyString(first_name) || !isNonEmptyString(last_name) || !isNonEmptyString(email) || typeof password !== "string" || password === "") {
            throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "Todos los campos obligatorios deben completarse con texto válido");
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (!EMAIL_REGEX.test(normalizedEmail)) {
            throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, "El formato del correo electrónico no es válido", {
                details: { field: "email" },
            });
        }

        assertPassword(password, { registration: true });

        const existingUser = await usersRepository.getByEmail(normalizedEmail);
        if (existingUser) {
            throw new AppError(ERROR_DICTIONARY.DUPLICATE_RESOURCE, "Ya existe un usuario registrado con ese email", {
                details: { field: "email" },
            });
        }

        let assignedRole = USER_ROLES.USER;
        if (role !== undefined) {
            if (typeof role !== "string" || !Object.values(USER_ROLES).includes(role)) {
                throw new AppError(ERROR_DICTIONARY.INVALID_INPUT_DATA, `Rol no válido. Roles permitidos: ${Object.values(USER_ROLES).join(", ")}`, {
                    details: { field: "role", allowed: Object.values(USER_ROLES) },
                });
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

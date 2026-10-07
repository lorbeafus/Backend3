import { usersRepository } from "../repositories/users.repository.js";
import { USER_ROLES } from "../constants/index.js";
import { createHash } from "../utils/hash.js";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Servicio de Usuarios para ShipNow API.
 * Concentra validaciones de negocio, restricciones de roles y verificación de existencia.
 */
export class UsersService {
    _validateId(id) {
        if (!id || !OBJECT_ID_REGEX.test(id)) {
            const error = new Error("El ID proporcionado no es un identificador válido");
            error.statusCode = 400;
            throw error;
        }
    }

    async getUsers() {
        return await usersRepository.getAll();
    }

    async getUserById(id) {
        this._validateId(id);
        const user = await usersRepository.getById(id);
        if (!user) {
            const error = new Error("Usuario no encontrado");
            error.statusCode = 404;
            throw error;
        }
        return user;
    }

    async createUser(userData) {
        const { first_name, last_name, email, password, role } = userData;

        if (!first_name || !last_name || !email || !password) {
            const error = new Error("Todos los campos obligatorios deben completarse");
            error.statusCode = 400;
            throw error;
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (!EMAIL_REGEX.test(normalizedEmail)) {
            const error = new Error("El formato del correo electrónico no es válido");
            error.statusCode = 400;
            throw error;
        }

        if (password.length < 6) {
            const error = new Error("La contraseña debe tener al menos 6 caracteres");
            error.statusCode = 400;
            throw error;
        }

        const existingUser = await usersRepository.getByEmail(normalizedEmail);
        if (existingUser) {
            const error = new Error("Ya existe un usuario registrado con ese email");
            error.statusCode = 409;
            throw error;
        }

        let assignedRole = USER_ROLES.USER;
        if (role) {
            if (!Object.values(USER_ROLES).includes(role)) {
                const error = new Error(`Rol no válido. Roles permitidos: ${Object.values(USER_ROLES).join(", ")}`);
                error.statusCode = 400;
                throw error;
            }
            assignedRole = role;
        }

        const hashedPassword = await createHash(password);

        const newUser = await usersRepository.create({
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: assignedRole,
        });

        return newUser;
    }
}

export const usersService = new UsersService();

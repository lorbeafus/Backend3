import { usersRepository } from "../repositories/users.repository.js";
import { USER_ROLES, DOCUMENT_TYPES, ERROR_DICTIONARY } from "../constants/index.js";
import { createHash } from "../utils/hash.js";
import { AppError } from "../utils/errors.js";
import { assertBodyObject, assertValidId, isNonEmptyString, assertPassword } from "../utils/validation.js";
import { storageService } from "../utils/storage.js";
import { DocumentDTO } from "../dto/index.js";
import { logger } from "../config/logger.js";

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

    async uploadDocument({ userId, file, type, actor }) {
        assertValidId(userId);
        const user = await usersRepository.getById(userId);
        if (!user) {
            throw new AppError(ERROR_DICTIONARY.USER_NOT_FOUND, "Usuario no encontrado", {
                details: { field: "id" },
            });
        }

        const isOwner = String(actor._id) === String(userId);
        const isAdmin = actor.role === USER_ROLES.ADMIN;
        if (!isOwner && !isAdmin) {
            throw new AppError(
                ERROR_DICTIONARY.INSUFFICIENT_PERMISSIONS,
                "No tenés los permisos requeridos para realizar esta acción"
            );
        }

        if (!type || typeof type !== "string") {
            throw new AppError(
                ERROR_DICTIONARY.INVALID_DOCUMENT_TYPE,
                "El campo 'type' es obligatorio y debe ser 'user_document' o 'driver_license'"
            );
        }

        const normalizedType = type.trim();
        if (![DOCUMENT_TYPES.USER_DOCUMENT, DOCUMENT_TYPES.DRIVER_LICENSE].includes(normalizedType)) {
            throw new AppError(
                ERROR_DICTIONARY.INVALID_DOCUMENT_TYPE,
                "El tipo de documento debe ser 'user_document' o 'driver_license'"
            );
        }

        if (normalizedType === DOCUMENT_TYPES.DRIVER_LICENSE && user.role !== USER_ROLES.DRIVER) {
            throw new AppError(
                ERROR_DICTIONARY.INVALID_DOCUMENT_TYPE,
                "El tipo 'driver_license' solo corresponde a un usuario con rol DRIVER"
            );
        }

        // 1. Validar magic bytes del archivo en staging (antes de moverlo a la carpeta definitiva)
        await storageService.verifyMagicBytes(file.path, file.mimetype);

        // 2. Mover de staging a carpeta definitiva con nombre único y extensión normalizada
        const category = normalizedType === DOCUMENT_TYPES.DRIVER_LICENSE ? "licenses" : "documents";
        const committed = await storageService.commitFile(file, category);
        let associationConfirmed = false;
        let persistedDoc = null;

        const documentData = {
            original_name: file.originalname,
            filename: committed.filename,
            path: committed.path,
            mimetype: file.mimetype,
            size: file.size,
            type: normalizedType,
            uploaded_at: new Date(),
        };

        try {
            const updatedUser = await usersRepository.addDocument(userId, documentData);
            if (!updatedUser) {
                // El usuario fue eliminado concurrentemente o no se encontró
                await storageService.safeUnlink(committed.absolutePath);
                throw new AppError(ERROR_DICTIONARY.USER_NOT_FOUND, "Usuario no encontrado", {
                    details: { field: "id" },
                });
            }
            persistedDoc = updatedUser.documents?.find((d) => d.filename === committed.filename) || null;
            if (persistedDoc) {
                associationConfirmed = true;
            } else {
                await storageService.safeUnlink(committed.absolutePath);
                throw new AppError(ERROR_DICTIONARY.UPLOAD_ERROR, "No se pudo asociar el documento al usuario");
            }
        } catch (err) {
            if (associationConfirmed) {
                throw err;
            }
            if (err instanceof AppError) {
                throw err;
            }

            // Fallo en la persistencia de MongoDB: verificar si el documento llegó a guardarse
            let recoveredDoc = null;
            let checkFailed = false;
            try {
                const verified = await usersRepository.getById(userId);
                if (verified && Array.isArray(verified.documents)) {
                    recoveredDoc = verified.documents.find((d) => d.filename === committed.filename) || null;
                }
            } catch (queryErr) {
                checkFailed = true;
            }

            if (recoveredDoc) {
                // MongoDB sí persistió el documento antes del error de red/conexión: conservar el registro recuperado
                associationConfirmed = true;
                persistedDoc = recoveredDoc;
                logger.warning("Persistencia confirmada tras verificación post-error", {
                    event: "upload_persistence_verified_after_error",
                    userId,
                    filename: committed.filename,
                });
            } else if (checkFailed) {
                // Resultado incierto por fallo de red/conexión: no borrar a ciegas para evitar desincronización
                logger.error(
                    "Persistencia incierta al asociar documento: no se pudo verificar en MongoDB por fallo de conexión. Archivo preservado para reconciliación",
                    {
                        event: "upload_persistence_uncertain",
                        userId,
                        filename: committed.filename,
                        error: err.message,
                    }
                );
                throw err;
            } else {
                // Fallo confirmado antes de guardar: limpiar el archivo definitivo huérfano
                await storageService.safeUnlink(committed.absolutePath);
                logger.error("Fallo al persistir metadatos de documento en MongoDB. Archivo huérfano eliminado", {
                    event: "upload_persistence_failed",
                    userId,
                    filename: committed.filename,
                    error: err.message,
                });
                throw err;
            }
        }

        // Una vez confirmada la asociación, errores posteriores de DTO, logging o respuesta NO eliminan el archivo
        try {
            logger.info("Documento de usuario asociado exitosamente", {
                event: "document_uploaded",
                userId,
                type: normalizedType,
                filename: committed.filename,
                size: file.size,
                mimetype: file.mimetype,
            });
        } catch {
            // Ignorar fallo secundario de logging
        }

        const docDto = new DocumentDTO(persistedDoc);
        return {
            user_id: String(userId),
            id: docDto.id,
            original_name: docDto.original_name,
            filename: docDto.filename,
            path: docDto.path,
            mimetype: docDto.mimetype,
            size: docDto.size,
            type: docDto.type,
            uploaded_at: docDto.uploaded_at,
            document: docDto,
        };
    }
}

export const usersService = new UsersService();

import { usersService } from "../services/users.services.js";
import { UserDTO } from "../dto/index.js";
import { AppError } from "../utils/errors.js";
import { ERROR_DICTIONARY } from "../constants/index.js";
import { storageService } from "../utils/storage.js";

/**
 * Controlador de Usuarios para ShipNow API.
 * Gestiona peticiones HTTP de usuarios, sanitiza respuestas mediante DTOs
 * y delega errores a la capa de middleware.
 */
export class UsersController {
    static async getAllUsers(req, res, next) {
        try {
            const users = await usersService.getUsers();
            const usersDto = UserDTO.getFrom(users);
            res.status(200).json({
                status: "success",
                payload: usersDto,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getUserById(req, res, next) {
        try {
            const { id } = req.params;
            const user = await usersService.getUserById(id);
            const userDto = UserDTO.getFrom(user);
            res.status(200).json({
                status: "success",
                payload: userDto,
            });
        } catch (error) {
            next(error);
        }
    }

    static async uploadUserDocument(req, res, next) {
        const stagedFilePath = req.file?.path;
        try {
            if (!req.file) {
                throw new AppError(
                    ERROR_DICTIONARY.FILE_REQUIRED,
                    "Debe adjuntar un archivo en el campo 'document'"
                );
            }

            // Validación estricta de campos multipart: único campo de texto permitido es 'type'
            const bodyKeys = Object.keys(req.body || {});
            const extraFields = bodyKeys.filter((k) => k !== "type");
            if (extraFields.length > 0) {
                throw new AppError(
                    ERROR_DICTIONARY.INVALID_INPUT_DATA,
                    "Campos no permitidos en el cuerpo de la petición. Solo se admite el campo 'type'",
                    { details: { extraFields } }
                );
            }

            const rawType = req.body?.type;
            if (rawType === undefined || rawType === null || rawType === "") {
                throw new AppError(
                    ERROR_DICTIONARY.INVALID_DOCUMENT_TYPE,
                    "El campo 'type' es obligatorio y debe ser 'user_document' o 'driver_license'"
                );
            }

            if (typeof rawType !== "string" || Array.isArray(rawType)) {
                throw new AppError(
                    ERROR_DICTIONARY.INVALID_DOCUMENT_TYPE,
                    "El campo 'type' debe ser un valor de texto único"
                );
            }

            const result = await usersService.uploadDocument({
                userId: req.params.uid,
                file: req.file,
                type: rawType,
                actor: req.user,
            });

            res.status(200).json({
                status: "success",
                message: "Documento subido correctamente",
                payload: result,
            });
        } catch (error) {
            // Limpieza únicamente de archivo temporal en staging si no fue promovido y confirmado
            if (stagedFilePath) {
                await storageService.safeUnlink(stagedFilePath);
            }
            next(error);
        }
    }
}

export const getAllUsers = UsersController.getAllUsers;
export const getUserById = UsersController.getUserById;
export const uploadUserDocument = UsersController.uploadUserDocument;

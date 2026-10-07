import { usersService } from "../services/users.services.js";
import { UserDTO } from "../dto/index.js";

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
}

export const getAllUsers = UsersController.getAllUsers;
export const getUserById = UsersController.getUserById;

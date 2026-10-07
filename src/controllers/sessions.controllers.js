import { config } from "../config/index.js";
import { generateToken } from "../utils/jwt.js";
import { CurrentUserDTO, UserDTO } from "../dto/index.js";

export async function getSession(req, res, next) {
    try {
        const userDto = CurrentUserDTO.getFrom(req.user);
        res.status(200).json({
            status: "success",
            payload: userDto,
        });
    } catch (error) {
        next(error);
    }
}

export async function registerUser(req, res, next) {
    try {
        const userDto = UserDTO.getFrom(req.user);
        res.status(201).json({
            status: "success",
            message: "Usuario registrado correctamente",
            payload: userDto,
        });
    } catch (error) {
        next(error);
    }
}

export async function loginUser(req, res, next) {
    try {
        const user = req.user;

        const tokenUser = {
            id: user._id || user.id,
            email: user.email,
            role: user.role,
        };

        const token = generateToken(tokenUser);

        res.cookie("currentUser", token, {
            httpOnly: true,
            maxAge: 60 * 60 * 1000,
            sameSite: "lax",
            secure: config.NODE_ENV === "production",
        });

        res.status(200).json({
            status: "success",
            message: "Login exitoso",
        });
    } catch (error) {
        next(error);
    }
}

export async function logoutUser(req, res, next) {
    try {
        res.clearCookie("currentUser");
        res.status(200).json({
            status: "success",
            message: "Logout correcto",
        });
    } catch (error) {
        next(error);
    }
}

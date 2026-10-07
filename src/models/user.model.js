import { Schema, model } from "mongoose";
import { USER_ROLES } from "../constants/index.js";

const userSchema = new Schema(
    {
        first_name: {
            type: String,
            required: [true, "El nombre es obligatorio"],
            trim: true,
        },
        last_name: {
            type: String,
            required: [true, "El apellido es obligatorio"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "El email es obligatorio"],
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: [true, "La contraseña es obligatoria"],
        },
        role: {
            type: String,
            enum: {
                values: Object.values(USER_ROLES),
                message: "Rol de usuario no válido",
            },
            default: USER_ROLES.USER,
        },
    },
    {
        timestamps: true,
    }
);

export const userModel = model("User", userSchema);

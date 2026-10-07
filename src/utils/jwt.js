import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

export const generateToken = (user) => {
    return jwt.sign(user, config.JWT_SECRET, {
        expiresIn: config.JWT_EXPIRES_IN || "1h",
    });
};

export const verifyToken = (token) => {
    return jwt.verify(token, config.JWT_SECRET);
};

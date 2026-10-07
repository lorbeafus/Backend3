import { Router } from "express";
import { getAllUsers, getUserById } from "../controllers/users.controllers.js";
import { authMiddleware, authorizeRoles } from "../middlewares/auth.middleware.js";
import { USER_ROLES } from "../constants/index.js";

const router = Router();

// Endpoints protegidos para administración de usuarios
router.get("/", authMiddleware, authorizeRoles(USER_ROLES.ADMIN), getAllUsers);
router.get("/:id", authMiddleware, authorizeRoles(USER_ROLES.ADMIN), getUserById);

export default router;

import { Router } from "express";
import { getAllUsers, getUserById, uploadUserDocument } from "../controllers/users.controllers.js";
import { authMiddleware, authorizeRoles } from "../middlewares/auth.middleware.js";
import { uploadDocumentMiddleware } from "../utils/storage.js";
import { USER_ROLES } from "../constants/index.js";

const router = Router();

// Endpoints protegidos para administración de usuarios
router.get("/", authMiddleware, authorizeRoles(USER_ROLES.ADMIN), getAllUsers);
router.get("/:id", authMiddleware, authorizeRoles(USER_ROLES.ADMIN), getUserById);

// Carga de documentos de usuario y licencias de conducir (multipart/form-data)
router.post("/:uid/documents", authMiddleware, uploadDocumentMiddleware, uploadUserDocument);

export default router;

import { Router } from "express";
import {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
} from "../controllers/products.controller.js";
import { authMiddleware, authorizeRoles } from "../middlewares/auth.middleware.js";
import { USER_ROLES } from "../constants/index.js";

const router = Router();

// Rutas públicas de consulta
router.get("/", getAllProducts);
router.get("/:id", getProductById);

// Rutas protegidas exclusivas para administrador
router.post("/", authMiddleware, authorizeRoles(USER_ROLES.ADMIN), createProduct);
router.put("/:id", authMiddleware, authorizeRoles(USER_ROLES.ADMIN), updateProduct);
router.delete("/:id", authMiddleware, authorizeRoles(USER_ROLES.ADMIN), deleteProduct);

export default router;

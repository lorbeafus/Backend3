import { Router } from "express";
import {
    getMockUsers,
    getMockDrivers,
    getMockOrders,
    getMockDeliveries,
    seedDatabase,
} from "../controllers/mocks.controller.js";
import { authMiddleware, authorizeRoles } from "../middlewares/auth.middleware.js";
import { USER_ROLES } from "../constants/index.js";

const router = Router();

// Endpoints de generación en memoria (sin persistencia en base de datos)
router.get("/users", getMockUsers);
router.get("/drivers", getMockDrivers);
router.get("/orders", getMockOrders);
router.get("/deliveries", getMockDeliveries);

// Endpoint de carga controlada (persistente) - Exclusivo para administradores
router.post("/seed", authMiddleware, authorizeRoles(USER_ROLES.ADMIN), seedDatabase);

export default router;

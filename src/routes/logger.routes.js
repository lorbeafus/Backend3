import { Router } from "express";
import { testLogger } from "../controllers/logger.controller.js";
import { authMiddleware, authorizeRoles } from "../middlewares/auth.middleware.js";
import { USER_ROLES } from "../constants/index.js";
const router = Router();
router.get("/loggerTest", authMiddleware, authorizeRoles(USER_ROLES.ADMIN), testLogger);
export default router;

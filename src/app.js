import express from "express";
import cookieParser from "cookie-parser";
import passport from "passport";
import { initializePassport } from "./config/passport.config.js";
import { notFoundHandler } from "./middlewares/notFound.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import productsRouter from "./routes/products.routes.js";
import usersRouter from "./routes/users.routes.js";
import sessionsRouter from "./routes/sessions.routes.js";
import mocksRouter from "./routes/mocks.routes.js";

const app = express();

// Middlewares globales
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Inicialización de Passport y autenticación
initializePassport();
app.use(passport.initialize());

// Health check endpoint
app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "active", message: "ShipNow API está funcionando correctamente" });
});

// Routers principales de ShipNow
app.use("/api/products", productsRouter);
app.use("/api/users", usersRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/mocks", mocksRouter);

// Middleware para rutas inexistentes (404)
app.use(notFoundHandler);

// Middleware centralizado de gestión de errores
app.use(errorHandler);

export default app;

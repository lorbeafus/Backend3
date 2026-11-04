import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openapiSpecification } from "../docs/openapi.js";

const router = Router();

// Endpoint del documento OpenAPI en formato JSON para validación e importación externa
router.get("/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).json(openapiSpecification);
});

// Opciones de configuración de la interfaz Swagger UI
const swaggerUiOptions = {
    customSiteTitle: "ShipNow API - Documentación Swagger",
    swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: "list",
        filter: true,
    },
};

// Exposición de Swagger UI
router.use("/", swaggerUi.serve);
router.get("/", swaggerUi.setup(openapiSpecification, swaggerUiOptions));

export default router;


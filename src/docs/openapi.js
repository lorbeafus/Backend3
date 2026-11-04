import { schemas, responses, securitySchemes } from "./schemas.js";
import { healthPaths } from "./paths/health.paths.js";
import { sessionsPaths } from "./paths/sessions.paths.js";
import { usersPaths } from "./paths/users.paths.js";
import { productsPaths } from "./paths/products.paths.js";
import { ordersPaths } from "./paths/orders.paths.js";
import { deliveriesPaths } from "./paths/deliveries.paths.js";
import { mocksPaths } from "./paths/mocks.paths.js";
import { loggerPaths } from "./paths/logger.paths.js";

/**
 * Especificación OpenAPI 3.0.3 completa para ShipNow API.
 * Combina metadatos, esquemas reutilizables, configuración de seguridad por cookies
 * y la documentación detallada de todos los endpoints de negocio.
 */
export const openapiSpecification = {
    openapi: "3.0.3",
    info: {
        title: "ShipNow API",
        version: "1.0.0",
        description:
            "## Plataforma Integral de Logística — Backend III\n\n" +
            "ShipNow es una API modular orientada a la administración de pedidos logísticos, asignación y seguimiento de entregas en tiempo real, gestión de catálogo de productos e inventario, mocking y monitoreo con Winston.\n\n" +
            "### Arquitectura por Capas\n" +
            "- **Routers & Middlewares:** Enrutamiento, validación de sesiones JWT y control de acceso basado en roles (`admin`, `user`, `driver`).\n" +
            "- **Controllers:** Orquestación HTTP sin lógica de base de datos ni modelos Mongoose.\n" +
            "- **Services:** Lógica de negocio pura, cálculo de totales en centavos, derivación de estados y validación de dominios.\n" +
            "- **Repositories:** Acceso a datos, persistencia atómica y proyecciones seguras.\n" +
            "- **DTOs:** Sanitización estricta de usuarios y sesiones (nunca se exponen contraseñas ni hashes).\n\n" +
            "### Autenticación mediante Cookie HttpOnly\n" +
            "La API utiliza tokens **JWT alojados en una cookie firmada llamada `currentUser`** (HttpOnly, SameSite=Lax, Secure en producción).\n\n" +
            "> **¿Cómo probar endpoints protegidos desde esta interfaz Swagger UI?**\n" +
            "> 1. Abrí la sección **Sessions** y desplegá `POST /api/sessions/login`.\n" +
            "> 2. Hacé clic en **Try it out**, ingresá las credenciales (por ejemplo las creadas con `npm run seed:admin`) y ejecutá la petición.\n" +
            "> 3. Dado que Swagger UI se sirve en el mismo origen/servidor (`/api/docs`), el navegador web almacena la cookie `currentUser` automáticamente.\n" +
            "> 4. A partir de ese momento, cualquier petición posterior a endpoints protegidos (`/api/orders`, `/api/deliveries`, `/api/users`, etc.) enviará la cookie automáticamente sin necesidad de cargar tokens manualmente en el botón *Authorize*.\n" +
            "> 5. Para cerrar la sesión, ejecutá `POST /api/sessions/logout`.",
        contact: {
            name: "Equipo de Desarrollo ShipNow",
        },
    },
    servers: [
        {
            url: "/",
            description: "Servidor local (URL relativa al origen actual de la petición)",
        },
    ],
    tags: [
        {
            name: "Health",
            description: "Comprobación de estado y disponibilidad del servicio",
        },
        {
            name: "Sessions",
            description: "Autenticación por cookie JWT currentUser, registro, sesión actual y logout",
        },
        {
            name: "Users",
            description: "Administración y consulta de usuarios (acceso restringido a ADMIN)",
        },
        {
            name: "Products",
            description: "Catálogo de productos e inventario logístico con estado derivado por stock",
        },
        {
            name: "Orders",
            description: "Gestión de pedidos logísticos (cálculo en servidor, visibilidad por rol y cancelación)",
        },
        {
            name: "Deliveries",
            description: "Asignación y seguimiento de entregas (fuente de estado vinculada al pedido)",
        },
        {
            name: "Mocks",
            description: "Generación de datos simulados en memoria y carga controlada en MongoDB (seed)",
        },
        {
            name: "Logger",
            description: "Validación de niveles de registro y rotación de Winston",
        },
    ],
    paths: {
        ...healthPaths,
        ...sessionsPaths,
        ...usersPaths,
        ...productsPaths,
        ...ordersPaths,
        ...deliveriesPaths,
        ...mocksPaths,
        ...loggerPaths,
    },
    components: {
        schemas,
        responses,
        securitySchemes,
    },
};


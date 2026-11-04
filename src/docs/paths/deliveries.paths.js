export const deliveriesPaths = {
    "/api/deliveries": {
        get: {
            tags: ["Deliveries"],
            summary: "Listar entregas con paginación",
            description:
                "Consulta las entregas según los permisos del actor:\n" +
                "- **ADMIN:** visualiza todas las entregas del sistema.\n" +
                "- **DRIVER:** visualiza las entregas donde está asignado como conductor.\n" +
                "- **USER:** visualiza las entregas asociadas a los pedidos de los que es propietario.\n\n" +
                "**Fuente de estado única:** El estado expuesto de la entrega es dinámico y se calcula siempre desde la autoridad del pedido:\n" +
                "- `pending` -> `assigned`\n" +
                "- `in_transit` -> `in_progress`\n" +
                "- `delivered` -> `completed`\n" +
                "- `cancelled` -> `failed`\n\n" +
                "**Paginación:** Solo admite `page` (1–10000, default 1) y `limit` (20–100, default 20).",
            operationId: "listDeliveries",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "page",
                    in: "query",
                    required: false,
                    description: "Número de página (1 a 10000, default 1)",
                    schema: { type: "integer", minimum: 1, maximum: 10000, default: 1, example: 1 },
                },
                {
                    name: "limit",
                    in: "query",
                    required: false,
                    description: "Elementos por página (20 a 100, default 20)",
                    schema: { type: "integer", minimum: 20, maximum: 100, default: 20, example: 20 },
                },
            ],
            responses: {
                200: {
                    description: "Listado paginado de entregas",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/DeliveriesPaginatedResponse" },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
        post: {
            tags: ["Deliveries"],
            summary: "Asignar una entrega a un pedido pendiente (ADMIN)",
            description:
                "Crea una entrega asignando un pedido en estado `pending` a un repartidor con rol `driver`. Genera un código de seguimiento único `TRK-...` y fecha estimada de entrega.\n\n" +
                "**Restricciones de dominio:**\n" +
                "- Exclusivo para administradores (403 Forbidden para otros roles).\n" +
                "- El pedido debe encontrarse en estado `pending`.\n" +
                "- El usuario asignado debe existir y tener rol `driver`.\n" +
                "- Solo puede existir una entrega por pedido (colisión 409 Conflict).\n" +
                "- La fecha estimada debe ser futura, en formato ISO UTC con hora y sufijo Z.\n" +
                "- Notas de entrega opcionales hasta 1000 caracteres.",
            operationId: "createDelivery",
            security: [{ cookieAuth: [] }],
            requestBody: {
                required: true,
                description: "Datos de la entrega a asignar",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/DeliveryCreateInput" },
                        example: {
                            order: "673f1234567890abcdef9999",
                            driver: "673f1234567890abcdef0002",
                            estimated_delivery_date: "2026-12-01T15:00:00.000Z",
                            delivery_notes: "Entregar en conserjería",
                        },
                    },
                },
            },
            responses: {
                201: {
                    description: "Entrega asignada correctamente",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/DeliverySingleResponse" },
                        },
                    },
                },
                400: {
                    description: "Fecha inválida, formato incorrecto o usuario no es repartidor",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 400,
                                message: "El usuario asignado debe tener rol DRIVER",
                                error: {
                                    code: "INVALID_INPUT_DATA",
                                    message: "El usuario asignado debe tener rol DRIVER",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: { $ref: "#/components/responses/ForbiddenError" },
                404: {
                    description: "Pedido o repartidor no encontrado",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 404,
                                message: "Pedido no encontrado",
                                error: {
                                    code: "ORDER_NOT_FOUND",
                                    message: "Pedido no encontrado",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                409: {
                    description: "Conflicto: pedido no está pendiente o ya cuenta con una entrega",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 409,
                                message: "El pedido ya tiene una entrega",
                                error: {
                                    code: "DOMAIN_CONFLICT",
                                    message: "El pedido ya tiene una entrega",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },

    "/api/deliveries/{id}": {
        get: {
            tags: ["Deliveries"],
            summary: "Obtener una entrega por ID",
            description:
                "Recupera la entrega consultada. Permisos:\n" +
                "- **ADMIN:** acceso irrestricto.\n" +
                "- **DRIVER:** solo si es el conductor asignado.\n" +
                "- **USER:** solo si es el cliente propietario del pedido asociado.",
            operationId: "getDeliveryById",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    description: "ID de 24 caracteres hexadecimales de la entrega",
                    schema: {
                        type: "string",
                        pattern: "^[0-9a-fA-F]{24}$",
                        example: "673f1234567890abcdefffff",
                    },
                },
            ],
            responses: {
                200: {
                    description: "Detalle de la entrega",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/DeliverySingleResponse" },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: { $ref: "#/components/responses/ForbiddenError" },
                404: {
                    description: "Entrega no encontrada",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 404,
                                message: "Entrega no encontrada",
                                error: {
                                    code: "DELIVERY_NOT_FOUND",
                                    message: "Entrega no encontrada",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                409: {
                    description: "La entrega no cuenta con un pedido válido disponible",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 409,
                                message: "La entrega no tiene un pedido disponible",
                                error: {
                                    code: "DOMAIN_CONFLICT",
                                    message: "La entrega no tiene un pedido disponible",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },

    "/api/deliveries/{id}/status": {
        patch: {
            tags: ["Deliveries"],
            summary: "Actualizar estado operativo de la entrega",
            description:
                "Ejecuta una transición de estado en la entrega y actualiza atómicamente el estado del pedido asociado.\n\n" +
                "**Transiciones válidas:**\n" +
                "- `assigned` -> `in_progress` (sincroniza pedido a `in_transit`)\n" +
                "- `in_progress` -> `completed` (sincroniza pedido a `delivered`)\n" +
                "- `in_progress` -> `failed` (sincroniza pedido a `cancelled`)\n\n" +
                "**Reglas y validaciones:**\n" +
                "- **Permisos:** Solo permitido para **ADMIN** o para el **DRIVER asignado** a esta entrega.\n" +
                "- **Idempotencia:** Si se envía el mismo estado actual, responde 200 sin cambios.\n" +
                "- **Saltos y retrocesos prohibidos:** Intentar saltar directamente de `assigned` a `completed`, o retroceder de `completed` a `assigned` devuelve **409 Conflict** ('Transición de entrega no permitida').\n" +
                "- **Estado inválido:** Enviar un valor fuera de `assigned`, `in_progress`, `completed`, `failed` devuelve **400 Bad Request** (`INVALID_DOMAIN_STATE`).",
            operationId: "transitionDeliveryStatus",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    description: "ID de la entrega a actualizar",
                    schema: {
                        type: "string",
                        pattern: "^[0-9a-fA-F]{24}$",
                        example: "673f1234567890abcdefffff",
                    },
                },
            ],
            requestBody: {
                required: true,
                description: "Nuevo estado operativo de la entrega",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/DeliveryStatusTransitionInput" },
                        example: {
                            status: "in_progress",
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "Estado actualizado exitosamente",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/DeliverySingleResponse" },
                        },
                    },
                },
                400: {
                    description: "Estado de entrega no válido o campos adicionales en el cuerpo",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 400,
                                message: "El estado de la entidad o transición de dominio solicitada no es válido",
                                error: {
                                    code: "INVALID_DOMAIN_STATE",
                                    message: "El estado de la entidad o transición de dominio solicitada no es válido",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: {
                    description: "No autorizado (conductor ajeno a la entrega o usuario cliente)",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 403,
                                message: "No tenés los permisos requeridos para realizar esta acción",
                                error: {
                                    code: "INSUFFICIENT_PERMISSIONS",
                                    message: "No tenés los permisos requeridos para realizar esta acción",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                404: { $ref: "#/components/responses/NotFoundError" },
                409: {
                    description: "Transición no permitida (salto de estado o retroceso)",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 409,
                                message: "Transición de entrega no permitida",
                                error: {
                                    code: "DOMAIN_CONFLICT",
                                    message: "Transición de entrega no permitida",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },
};

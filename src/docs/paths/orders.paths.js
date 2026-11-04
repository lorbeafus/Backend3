export const ordersPaths = {
    "/api/orders": {
        get: {
            tags: ["Orders"],
            summary: "Listar pedidos con paginación",
            description:
                "Obtiene los pedidos según el rol del actor autenticado:\n" +
                "- **ADMIN:** visualiza todos los pedidos del sistema.\n" +
                "- **USER:** visualiza exclusivamente sus propios pedidos.\n" +
                "- **DRIVER:** visualiza los pedidos vinculados a las entregas que tiene asignadas.\n\n" +
                "**Paginación:** Solo admite los parámetros `page` y `limit`. Cualquier otro parámetro en la query es rechazado con 400 ('Filtro no permitido').",
            operationId: "listOrders",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "page",
                    in: "query",
                    required: false,
                    description: "Número de página (entero entre 1 y 10000; por defecto 1)",
                    schema: { type: "integer", minimum: 1, maximum: 10000, default: 1, example: 1 },
                },
                {
                    name: "limit",
                    in: "query",
                    required: false,
                    description: "Cantidad de elementos por página (entero entre 20 y 100; por defecto 20)",
                    schema: { type: "integer", minimum: 20, maximum: 100, default: 20, example: 20 },
                },
            ],
            responses: {
                200: {
                    description: "Página de pedidos obtenida con éxito",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/OrdersPaginatedResponse" },
                        },
                    },
                },
                400: {
                    description: "Parámetros de paginación inválidos o filtro no permitido",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 400,
                                message: "Filtro no permitido",
                                error: {
                                    code: "INVALID_INPUT_DATA",
                                    message: "Filtro no permitido",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
        post: {
            tags: ["Orders"],
            summary: "Crear un nuevo pedido logístico",
            description:
                "Crea un pedido con estado inicial 'pending'.\n\n" +
                "**Naturaleza logística:** Es una solicitud de envío/despacho logístico, NO una compra con pasarela de pago ni reserva o descuento de inventario. El servidor valida disponibilidad actual en el catálogo, toma los nombres y precios vigentes y calcula el total exacto en centavos.\n\n" +
                "**Reglas y restricciones:**\n" +
                "- No enviar `price`, `product_name` ni `total_amount`: el servidor los deriva y rechaza campos no permitidos.\n" +
                "- Entre 1 y 50 ítems sin productos duplicados.\n" +
                "- Cantidad por ítem entera entre 1 y 1000.\n" +
                "- **USER:** crea el pedido para su propio usuario.\n" +
                "- **ADMIN:** puede especificar opcionalmente el campo `user` con el ID de un cliente registrado.\n" +
                "- **DRIVER:** no tiene permisos para crear pedidos (403 Forbidden).",
            operationId: "createOrder",
            security: [{ cookieAuth: [] }],
            requestBody: {
                required: true,
                description: "Estructura estricta para creación de pedido",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/OrderCreateInput" },
                        example: {
                            items: [
                                {
                                    product: "673f1234567890abcdef5678",
                                    quantity: 2,
                                },
                            ],
                            priority: "medium",
                            shipping_address: {
                                street: "Calle Falsa 123",
                                city: "Buenos Aires",
                                zip_code: "C1000",
                            },
                        },
                    },
                },
            },
            responses: {
                201: {
                    description: "Pedido creado y calculado por el servidor",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/OrderSingleResponse" },
                        },
                    },
                },
                400: {
                    description: "Datos de entrada inválidos, campos no permitidos o ítems duplicados",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 400,
                                message: "La petición contiene campos no permitidos",
                                error: {
                                    code: "INVALID_INPUT_DATA",
                                    message: "La petición contiene campos no permitidos",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: {
                    description: "Permisos insuficientes (ej. rol DRIVER o usuario común intentando fijar campo 'user')",
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
                404: {
                    description: "Producto o cliente destinatario no encontrado",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 404,
                                message: "Producto no encontrado",
                                error: {
                                    code: "PRODUCT_NOT_FOUND",
                                    message: "Producto no encontrado",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                409: {
                    description: "Conflicto de dominio (stock o disponibilidad insuficiente del producto)",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 409,
                                message: "Producto sin disponibilidad suficiente",
                                error: {
                                    code: "DOMAIN_CONFLICT",
                                    message: "Producto sin disponibilidad suficiente",
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

    "/api/orders/{id}": {
        get: {
            tags: ["Orders"],
            summary: "Obtener un pedido por ID",
            description:
                "Recupera un pedido específico. Permisos:\n" +
                "- **ADMIN:** acceso a cualquier pedido.\n" +
                "- **USER:** solo si es el cliente propietario del pedido.\n" +
                "- **DRIVER:** solo si es el conductor asignado a la entrega vinculada a este pedido.\n" +
                "Si el actor no cumple la condición, se responde 403 Forbidden.",
            operationId: "getOrderById",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    description: "ID de 24 caracteres hexadecimales del pedido",
                    schema: {
                        type: "string",
                        pattern: "^[0-9a-fA-F]{24}$",
                        example: "673f1234567890abcdef9999",
                    },
                },
            ],
            responses: {
                200: {
                    description: "Detalle del pedido",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/OrderSingleResponse" },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: { $ref: "#/components/responses/ForbiddenError" },
                404: { $ref: "#/components/responses/NotFoundError" },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },

    "/api/orders/{id}/status": {
        patch: {
            tags: ["Orders"],
            summary: "Cancelar un pedido",
            description:
                "Esta ruta permite exclusivamente cancelar un pedido enviando `status: 'cancelled'`. El avance operativo (a `in_transit` o `delivered`) se gestiona desde el ciclo de vida de Entregas (`/api/deliveries`).\n\n" +
                "**Reglas de cancelación:**\n" +
                "- **USER dueño:** solo puede cancelar si el pedido está en estado `pending`.\n" +
                "- **ADMIN:** puede cancelar si el pedido está en estado `pending` o `in_transit`.\n" +
                "- **DRIVER:** no puede cancelar pedidos (403 Forbidden).\n" +
                "- Si ya está cancelado, la operación es idempotente (devuelve el pedido con status 200).\n" +
                "- Si el cliente intenta cancelar un pedido ya en tránsito o entregado, devuelve 409 Conflict.",
            operationId: "cancelOrder",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    description: "ID del pedido a cancelar",
                    schema: {
                        type: "string",
                        pattern: "^[0-9a-fA-F]{24}$",
                        example: "673f1234567890abcdef9999",
                    },
                },
            ],
            requestBody: {
                required: true,
                description: "Cuerpo estricto con el estado 'cancelled'",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/OrderStatusUpdateInput" },
                        example: {
                            status: "cancelled",
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "Pedido cancelado exitosamente",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/OrderSingleResponse" },
                        },
                    },
                },
                400: {
                    description: "Estado inválido o campos no permitidos en el cuerpo",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 400,
                                message: "Esta ruta solo permite cancelar; el avance se gestiona desde entregas",
                                error: {
                                    code: "INVALID_DOMAIN_STATE",
                                    message: "Esta ruta solo permite cancelar; el avance se gestiona desde entregas",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: { $ref: "#/components/responses/ForbiddenError" },
                404: { $ref: "#/components/responses/NotFoundError" },
                409: {
                    description: "Conflicto: pedido no cancelable en su estado actual (ej. cliente cancelando en tránsito)",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 409,
                                message: "El recurso cambió o la operación entra en conflicto con su estado actual",
                                error: {
                                    code: "DOMAIN_CONFLICT",
                                    message: "El recurso cambió o la operación entra en conflicto con su estado actual",
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

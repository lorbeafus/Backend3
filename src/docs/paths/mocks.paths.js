export const mocksPaths = {
    "/api/mocks/users": {
        get: {
            tags: ["Mocks"],
            summary: "Generar usuarios cliente simulados en memoria",
            description:
                "Genera datos de usuarios cliente (`role: 'user'`) en memoria mediante Faker.js sin consultar ni persistir en MongoDB. Nunca genera ni expone contraseñas en esta respuesta.\n\n" +
                "**Parámetro `qty`:** Entero positivo entre 1 y 100 (por defecto 10). Valores negativos, no numéricos o repetidos devuelven 400 (`INVALID_MOCK_QUANTITY`).",
            operationId: "getMockUsers",
            parameters: [
                {
                    name: "qty",
                    in: "query",
                    required: false,
                    description: "Cantidad de usuarios cliente a generar (1 a 100, default 10)",
                    schema: { type: "integer", minimum: 1, maximum: 100, default: 10, example: 5 },
                },
            ],
            responses: {
                200: {
                    description: "Usuarios simulados en memoria",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/MockUsersResponse" },
                        },
                    },
                },
                400: {
                    description: "Cantidad de mocks inválida",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 400,
                                message: "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
                                error: {
                                    code: "INVALID_MOCK_QUANTITY",
                                    message: "El parámetro 'qty' debe ser un número entero positivo mayor a 0",
                                    details: { field: "qty", min: 1 },
                                },
                            },
                        },
                    },
                },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },

    "/api/mocks/drivers": {
        get: {
            tags: ["Mocks"],
            summary: "Generar repartidores simulados en memoria",
            description:
                "Genera datos de usuarios con rol DRIVER (`role: 'driver'`) en memoria sin persistir en base de datos. Sin hashes ni contraseñas.\n\n" +
                "**Parámetro `qty`:** Entero positivo entre 1 y 100 (por defecto 10).",
            operationId: "getMockDrivers",
            parameters: [
                {
                    name: "qty",
                    in: "query",
                    required: false,
                    description: "Cantidad de choferes a generar (1 a 100, default 10)",
                    schema: { type: "integer", minimum: 1, maximum: 100, default: 10, example: 5 },
                },
            ],
            responses: {
                200: {
                    description: "Choferes simulados en memoria",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/MockDriversResponse" },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },

    "/api/mocks/orders": {
        get: {
            tags: ["Mocks"],
            summary: "Generar pedidos simulados en memoria",
            description:
                "Genera pedidos simulados en memoria. Incluye `related_users` para garantizar la verificabilidad de referencias relacionales entre las entidades ficticias sin tocar MongoDB.\n\n" +
                "**Parámetro `qty`:** Entero positivo entre 1 y 100 (por defecto 10).",
            operationId: "getMockOrders",
            parameters: [
                {
                    name: "qty",
                    in: "query",
                    required: false,
                    description: "Cantidad de pedidos a generar (1 a 100, default 10)",
                    schema: { type: "integer", minimum: 1, maximum: 100, default: 10, example: 5 },
                },
            ],
            responses: {
                200: {
                    description: "Pedidos simulados con clientes vinculados en memoria",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/MockOrdersResponse" },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },

    "/api/mocks/deliveries": {
        get: {
            tags: ["Mocks"],
            summary: "Generar entregas simuladas en memoria",
            description:
                "Genera entregas simuladas en memoria junto a sus entidades vinculadas (`related_orders`, `related_drivers`, `related_users`). Permite validar consistencia y estados sincronizados sin persistencia.\n\n" +
                "**Parámetro `qty`:** Entero positivo entre 1 y 100 (por defecto 10).",
            operationId: "getMockDeliveries",
            parameters: [
                {
                    name: "qty",
                    in: "query",
                    required: false,
                    description: "Cantidad de entregas a generar (1 a 100, default 10)",
                    schema: { type: "integer", minimum: 1, maximum: 100, default: 10, example: 5 },
                },
            ],
            responses: {
                200: {
                    description: "Entregas simuladas con dependencias en memoria",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/MockDeliveriesResponse" },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },

    "/api/mocks/seed": {
        post: {
            tags: ["Mocks"],
            summary: "Carga controlada y persistente en MongoDB (ADMIN)",
            description:
                "Inserta datos de prueba en la base de datos de desarrollo de forma secuencial y referencial:\n" +
                "1. `qty` usuarios cliente (USER)\n" +
                "2. `qty` repartidores (DRIVER)\n" +
                "3. `qty` pedidos asociados a esos usuarios\n" +
                "4. `qty` entregas asociadas a esos pedidos y repartidores\n" +
                "Total de documentos insertados: `4 * qty`.\n\n" +
                "**Parámetro `qty`:** Entero positivo entre 1 y 50 (por defecto 10).\n" +
                "- Puede recibirse por **query string** (`?qty=N`) o en el **cuerpo JSON** (`{ \"qty\": N }`).\n" +
                "- **Prioridad:** Si ambos están presentes, **query string tiene prioridad sobre body**.\n\n" +
                "**Seguridad y entorno:**\n" +
                "- Exclusivo para administradores (**ADMIN**).\n" +
                "- **Bloqueado estrictamente en producción:** Si `NODE_ENV=production`, responde **403 Forbidden** (`SEED_FORBIDDEN_IN_PRODUCTION`).\n" +
                "- Las contraseñas de los usuarios ficticios se hashean con bcrypt (`mockPassword123`) y nunca se retornan.\n\n" +
                "**Tolerancia y fallos parciales:**\n" +
                "Ante un fallo en alguna de las fases, se interrumpe la carga sin rollback y la respuesta de error incluye `phase` (fase interrumpida) e `insertedCounts` (documentos confirmados previamente).",
            operationId: "seedDatabase",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "qty",
                    in: "query",
                    required: false,
                    description: "Escala de generación (1 a 50, default 10). Prioridad sobre el cuerpo.",
                    schema: { type: "integer", minimum: 1, maximum: 50, default: 10, example: 5 },
                },
            ],
            requestBody: {
                required: false,
                description: "Opcional si se utiliza query string. Si query está ausente, toma qty del body.",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/MockSeedInput" },
                        example: { qty: 5 },
                    },
                },
            },
            responses: {
                201: {
                    description: "Carga de datos de prueba exitosa",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/MockSeedResponse" },
                        },
                    },
                },
                400: {
                    description: "Cantidad inválida (fuera del rango 1 a 50)",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 400,
                                message: "El parámetro 'qty' no puede superar el límite máximo de 50",
                                error: {
                                    code: "INVALID_MOCK_QUANTITY",
                                    message: "El parámetro 'qty' no puede superar el límite máximo de 50",
                                    details: { field: "qty", limit: 50 },
                                },
                            },
                        },
                    },
                },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: {
                    description: "No autorizado o seed deshabilitado en entorno de producción",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 403,
                                message: "La generación de datos de prueba (seed) está estrictamente deshabilitada en el entorno de producción",
                                error: {
                                    code: "SEED_FORBIDDEN_IN_PRODUCTION",
                                    message: "La generación de datos de prueba (seed) está estrictamente deshabilitada en el entorno de producción",
                                    details: {},
                                },
                            },
                        },
                    },
                },
                409: {
                    description: "Colisión de clave única durante la persistencia (incluye phase e insertedCounts)",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 409,
                                message: "Error en la carga de datos de prueba en la fase 'users': Ya existe un registro con esos datos únicos",
                                phase: "users",
                                insertedCounts: { users: 2, drivers: 0, orders: 0, deliveries: 0 },
                                error: {
                                    code: "DUPLICATE_RESOURCE",
                                    message: "Error en la carga de datos de prueba en la fase 'users': Ya existe un registro con esos datos únicos",
                                    details: { phase: "users", insertedCounts: { users: 2, drivers: 0, orders: 0, deliveries: 0 } },
                                },
                            },
                        },
                    },
                },
                500: {
                    description: "Fallo durante la persistencia (incluye phase e insertedCounts)",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 500,
                                message: "Error en la carga de datos de prueba en la fase 'orders': Error durante la persistencia de datos de prueba",
                                phase: "orders",
                                insertedCounts: { users: 5, drivers: 5, orders: 1, deliveries: 0 },
                                error: {
                                    code: "MOCK_PERSISTENCE_FAILED",
                                    message: "Error en la carga de datos de prueba en la fase 'orders': Error durante la persistencia de datos de prueba",
                                    details: { phase: "orders", insertedCounts: { users: 5, drivers: 5, orders: 1, deliveries: 0 } },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
};

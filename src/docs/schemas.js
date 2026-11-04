/**
 * Esquemas reutilizables OpenAPI 3.0 para ShipNow API.
 * Define modelos de datos, esquemas de entrada (separados de salida),
 * respuestas estándar y formatos normalizados de error.
 */
export const schemas = {
    // -------------------------------------------------------------
    // Respuestas de Error
    // -------------------------------------------------------------
    ErrorResponse: {
        type: "object",
        description: "Estructura uniforme de respuesta de error de ShipNow API",
        properties: {
            status: {
                type: "string",
                enum: ["error"],
                example: "error",
                description: "Indicador semántico de fallo",
            },
            statusCode: {
                type: "integer",
                example: 400,
                description: "Código de estado HTTP",
            },
            message: {
                type: "string",
                example: "Los datos de entrada no son válidos o están incompletos",
                description: "Mensaje descriptivo del motivo del error",
            },
            error: {
                type: "object",
                properties: {
                    code: {
                        type: "string",
                        example: "INVALID_INPUT_DATA",
                        description: "Código de error estable proveniente de ERROR_DICTIONARY",
                    },
                    message: {
                        type: "string",
                        example: "Los datos de entrada no son válidos o están incompletos",
                        description: "Descripción del error",
                    },
                    details: {
                        type: "object",
                        description: "Detalles adicionales públicos sanitizados (campos inválidos, límites o reglas)",
                        additionalProperties: true,
                        example: { field: "quantity", min: 1, limit: 1000 },
                    },
                },
                required: ["code", "message", "details"],
            },
            phase: {
                type: "string",
                description: "Fase en la que se interrumpió la operación en caso de fallo parcial de seed (opcional)",
                example: "orders",
            },
            insertedCounts: {
                type: "object",
                description: "Documentos confirmados antes de la interrupción en caso de fallo parcial de seed (opcional)",
                properties: {
                    users: { type: "integer", example: 10 },
                    drivers: { type: "integer", example: 10 },
                    orders: { type: "integer", example: 5 },
                    deliveries: { type: "integer", example: 0 },
                },
            },
        },
        required: ["status", "statusCode", "message", "error"],
    },

    // -------------------------------------------------------------
    // Modelos de Salida Sanitizados
    // -------------------------------------------------------------
    User: {
        type: "object",
        description: "Representación pública sanitizada de un usuario (sin contraseñas ni hashes)",
        properties: {
            id: {
                type: "string",
                example: "673f1234567890abcdef1234",
                description: "Identificador único de MongoDB",
            },
            first_name: {
                type: "string",
                example: "Juan",
                description: "Nombre del usuario",
            },
            last_name: {
                type: "string",
                example: "Pérez",
                description: "Apellido del usuario",
            },
            email: {
                type: "string",
                format: "email",
                example: "juan.perez@example.com",
                description: "Correo electrónico único",
            },
            role: {
                type: "string",
                enum: ["admin", "user", "driver"],
                example: "user",
                description: "Rol del usuario en la plataforma",
            },
        },
        required: ["id", "first_name", "last_name", "email", "role"],
    },

    CurrentUser: {
        type: "object",
        description: "Datos de la sesión activa recuperada a partir del token JWT en la cookie",
        properties: {
            id: {
                type: "string",
                example: "673f1234567890abcdef1234",
                description: "Identificador único del usuario",
            },
            email: {
                type: "string",
                format: "email",
                example: "admin@example.com",
                description: "Correo del usuario autenticado",
            },
            role: {
                type: "string",
                enum: ["admin", "user", "driver"],
                example: "admin",
                description: "Rol asignado al usuario",
            },
            first_name: {
                type: "string",
                example: "Administrador",
                description: "Nombre",
            },
            last_name: {
                type: "string",
                example: "Evaluacion",
                description: "Apellido",
            },
        },
        required: ["id", "email", "role"],
    },

    Product: {
        type: "object",
        description: "Producto del catálogo logístico",
        properties: {
            _id: {
                type: "string",
                example: "673f1234567890abcdef5678",
                description: "Identificador único del producto",
            },
            name: {
                type: "string",
                example: "Caja de embalaje reforzada 40x30x30",
                description: "Nombre del producto",
            },
            description: {
                type: "string",
                example: "Caja de cartón corrugado apta para envíos pesados y frágiles",
                description: "Descripción detallada",
            },
            price: {
                type: "number",
                example: 12.34,
                description: "Precio unitario (mayor a 0)",
            },
            stock: {
                type: "integer",
                example: 50,
                description: "Stock disponible en inventario (entero mayor o igual a 0)",
            },
            status: {
                type: "string",
                enum: ["available", "out_of_stock"],
                example: "available",
                description: "Estado derivado por el servidor según el stock (stock > 0 -> available; stock = 0 -> out_of_stock)",
            },
            createdAt: {
                type: "string",
                format: "date-time",
                example: "2026-11-04T12:00:00.000Z",
            },
            updatedAt: {
                type: "string",
                format: "date-time",
                example: "2026-11-04T12:00:00.000Z",
            },
        },
        required: ["_id", "name", "description", "price", "stock", "status"],
    },

    OrderItemBase: {
        type: "object",
        description: "Campos comunes de un ítem de pedido (nombre capturado, cantidad y precio unitario)",
        properties: {
            product_name: {
                type: "string",
                example: "Caja de embalaje reforzada 40x30x30",
                description: "Nombre del producto capturado desde el catálogo o generado ficticiamente",
            },
            quantity: {
                type: "integer",
                minimum: 1,
                maximum: 1000,
                example: 2,
                description: "Cantidad de unidades",
            },
            price: {
                type: "number",
                minimum: 0,
                example: 12.34,
                description: "Precio unitario",
            },
        },
        required: ["product_name", "quantity", "price"],
    },

    OrderItem: {
        type: "object",
        description:
            "Ítem de pedido persistido en MongoDB. En pedidos creados desde el catálogo contiene el ID del producto (string de 24 hex); en pedidos sembrados mediante seed contiene null ya que no vinculan productos reales del catálogo.",
        properties: {
            product: {
                type: "string",
                nullable: true,
                pattern: "^[0-9a-fA-F]{24}$",
                example: "673f1234567890abcdef5678",
                description: "ID del producto en catálogo (string ObjectId de 24 hex) o null en pedidos sembrados mediante seed",
            },
            product_name: {
                type: "string",
                example: "Caja de embalaje reforzada 40x30x30",
                description: "Nombre del producto capturado desde el catálogo",
            },
            quantity: {
                type: "integer",
                minimum: 1,
                maximum: 1000,
                example: 2,
                description: "Cantidad de unidades",
            },
            price: {
                type: "number",
                minimum: 0,
                example: 12.34,
                description: "Precio unitario al momento del pedido",
            },
        },
        required: ["product", "product_name", "quantity", "price"],
    },

    MockOrderItem: {
        type: "object",
        description: "Ítem de pedido generado en memoria (los mocks omiten la propiedad 'product' al no consultar el catálogo)",
        properties: {
            product_name: {
                type: "string",
                example: "Ergonomic Cotton Hat",
                description: "Nombre simulado generado por Faker",
            },
            quantity: {
                type: "integer",
                minimum: 1,
                example: 3,
                description: "Cantidad simulada",
            },
            price: {
                type: "number",
                minimum: 0,
                example: 1250,
                description: "Precio simulado",
            },
        },
        required: ["product_name", "quantity", "price"],
    },

    ShippingAddress: {
        type: "object",
        description: "Dirección física de destino del pedido logístico",
        properties: {
            street: {
                type: "string",
                maxLength: 200,
                example: "Av. Corrientes 1234",
                description: "Calle y altura",
            },
            city: {
                type: "string",
                maxLength: 200,
                example: "Ciudad Autónoma de Buenos Aires",
                description: "Ciudad o localidad",
            },
            zip_code: {
                type: "string",
                maxLength: 200,
                example: "C1043",
                description: "Código postal",
            },
        },
        required: ["street", "city", "zip_code"],
    },

    Order: {
        type: "object",
        description: "Pedido logístico persistido en el sistema (creado desde catálogo o sembrado mediante seed)",
        properties: {
            _id: {
                type: "string",
                example: "673f1234567890abcdef9999",
                description: "Identificador único de MongoDB",
            },
            order_number: {
                type: "string",
                example: "ORD-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
                description: "Código alfanumérico único generado por el servidor",
            },
            user: {
                description:
                    "Cliente destinatario del pedido. En listados (GET /api/orders) se devuelve expandido como objeto con los datos reales del repositorio (_id, first_name, last_name, role); en operaciones individuales sin expandir (como GET /api/orders/{id} o creación) se devuelve su ID de MongoDB como string de 24 caracteres hexadecimales.",
                oneOf: [
                    {
                        type: "string",
                        pattern: "^[0-9a-fA-F]{24}$",
                        example: "673f1234567890abcdef1234",
                        description: "ID de MongoDB del cliente destinatario (24 caracteres hexadecimales)",
                    },
                    {
                        type: "object",
                        description: "Datos del cliente destinatario poblados por el repositorio",
                        properties: {
                            _id: {
                                type: "string",
                                pattern: "^[0-9a-fA-F]{24}$",
                                example: "673f1234567890abcdef1234",
                                description: "Identificador único de MongoDB del usuario",
                            },
                            first_name: {
                                type: "string",
                                example: "Juan",
                                description: "Nombre del cliente",
                            },
                            last_name: {
                                type: "string",
                                example: "Pérez",
                                description: "Apellido del cliente",
                            },
                            role: {
                                type: "string",
                                enum: ["admin", "user", "driver"],
                                example: "user",
                                description: "Rol asignado al cliente en la plataforma",
                            },
                        },
                        required: ["_id", "first_name", "last_name", "role"],
                    },
                ],
            },
            items: {
                type: "array",
                items: { $ref: "#/components/schemas/OrderItem" },
                description: "Lista de ítems contenidos en el pedido (en pedidos de catálogo 'product' es un string ObjectId; en pedidos sembrados es null)",
            },
            total_amount: {
                type: "number",
                example: 24.68,
                description: "Monto total calculado por el servidor a partir del catálogo o generado por seed",
            },
            status: {
                type: "string",
                enum: ["pending", "in_transit", "delivered", "cancelled"],
                example: "pending",
                description: "Estado del pedido (autoridad de estado de la entrega asociada)",
            },
            priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                example: "medium",
                description: "Prioridad operativa del pedido",
            },
            shipping_address: {
                $ref: "#/components/schemas/ShippingAddress",
            },
            createdAt: {
                type: "string",
                format: "date-time",
                example: "2026-11-04T12:00:00.000Z",
            },
            updatedAt: {
                type: "string",
                format: "date-time",
                example: "2026-11-04T12:00:00.000Z",
            },
        },
        required: [
            "_id",
            "order_number",
            "user",
            "items",
            "total_amount",
            "status",
            "priority",
            "shipping_address",
        ],
    },

    MockOrder: {
        type: "object",
        description: "Pedido simulado generado en memoria (ítems sin campo 'product')",
        properties: {
            _id: {
                type: "string",
                example: "673f1234567890abcdef9999",
                description: "Identificador único generado en memoria",
            },
            order_number: {
                type: "string",
                example: "ORD-1730000000000-AB12CD",
                description: "Número de pedido generado con timestamp y caracteres alfanuméricos",
            },
            user: {
                type: "string",
                example: "673f1234567890abcdef1234",
                description: "Identificador del usuario ficticio asociado",
            },
            items: {
                type: "array",
                items: { $ref: "#/components/schemas/MockOrderItem" },
                description: "Lista de ítems simulados en memoria (sin campo 'product')",
            },
            total_amount: {
                type: "number",
                example: 3750,
                description: "Monto total simulado",
            },
            status: {
                type: "string",
                enum: ["pending", "in_transit", "delivered", "cancelled"],
                example: "pending",
            },
            priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                example: "medium",
            },
            shipping_address: {
                $ref: "#/components/schemas/ShippingAddress",
            },
            createdAt: {
                type: "string",
                format: "date-time",
            },
            updatedAt: {
                type: "string",
                format: "date-time",
            },
        },
        required: [
            "_id",
            "order_number",
            "user",
            "items",
            "total_amount",
            "status",
            "priority",
            "shipping_address",
        ],
    },

    Delivery: {
        type: "object",
        description: "Entrega logística con estado dinámico derivado de la orden asociada",
        properties: {
            _id: {
                type: "string",
                example: "673f1234567890abcdefffff",
                description: "Identificador único de la entrega",
            },
            tracking_code: {
                type: "string",
                example: "TRK-4f323a31-0d32-45a8-8e6d-5a8b79d20101",
                description: "Código de seguimiento único generado por el servidor",
            },
            order: {
                description: "Pedido asociado a la entrega (puede presentarse como ID o poblado)",
                oneOf: [
                    {
                        type: "string",
                        example: "673f1234567890abcdef9999",
                    },
                    {
                        type: "object",
                        properties: {
                            _id: { type: "string", example: "673f1234567890abcdef9999" },
                            order_number: { type: "string", example: "ORD-9b1deb4d-..." },
                            status: {
                                type: "string",
                                enum: ["pending", "in_transit", "delivered", "cancelled"],
                                example: "pending",
                            },
                            user: { type: "string", example: "673f1234567890abcdef1234" },
                        },
                    },
                ],
            },
            driver: {
                description: "Repartidor asignado a la entrega",
                oneOf: [
                    {
                        type: "string",
                        example: "673f1234567890abcdef0002",
                    },
                    {
                        type: "object",
                        properties: {
                            _id: { type: "string", example: "673f1234567890abcdef0002" },
                            first_name: { type: "string", example: "Carlos" },
                            last_name: { type: "string", example: "Chofer" },
                            email: { type: "string", format: "email", example: "driver@example.com" },
                            role: { type: "string", enum: ["driver"], example: "driver" },
                        },
                    },
                    { type: "null" },
                ],
            },
            status: {
                type: "string",
                enum: ["assigned", "in_progress", "completed", "failed"],
                example: "assigned",
                description: "Estado dinámico derivado del pedido (pending->assigned, in_transit->in_progress, delivered->completed, cancelled->failed)",
            },
            estimated_delivery_date: {
                type: "string",
                format: "date-time",
                example: "2026-12-01T15:00:00.000Z",
                description: "Fecha y hora estimada en formato ISO UTC futuro",
            },
            delivery_notes: {
                type: "string",
                example: "Entregar en recepción o portería",
                description: "Instrucciones de entrega opcionales",
            },
            createdAt: {
                type: "string",
                format: "date-time",
                example: "2026-11-04T12:00:00.000Z",
            },
            updatedAt: {
                type: "string",
                format: "date-time",
                example: "2026-11-04T12:00:00.000Z",
            },
        },
        required: [
            "_id",
            "tracking_code",
            "order",
            "status",
            "estimated_delivery_date",
        ],
    },

    // -------------------------------------------------------------
    // Cuerpos de Entrada (Inputs)
    // -------------------------------------------------------------
    RegisterInput: {
        type: "object",
        description: "Datos para registrar un nuevo usuario en la plataforma (siempre adquiere rol USER)",
        properties: {
            first_name: {
                type: "string",
                example: "Juan",
                description: "Nombre del usuario",
            },
            last_name: {
                type: "string",
                example: "Pérez",
                description: "Apellido del usuario",
            },
            email: {
                type: "string",
                format: "email",
                example: "juan.perez@example.com",
                description: "Correo electrónico único",
            },
            password: {
                type: "string",
                format: "password",
                minLength: 6,
                maxLength: 72,
                example: "Password123",
                description: "Contraseña (mínimo 6 caracteres, máximo 72 bytes UTF-8)",
            },
        },
        required: ["first_name", "last_name", "email", "password"],
        additionalProperties: false,
    },

    LoginInput: {
        type: "object",
        description: "Credenciales de acceso",
        properties: {
            email: {
                type: "string",
                format: "email",
                example: "admin@example.test",
                description: "Email del usuario",
            },
            password: {
                type: "string",
                format: "password",
                maxLength: 72,
                example: "AdminPass123",
                description: "Contraseña",
            },
        },
        required: ["email", "password"],
        additionalProperties: false,
    },

    ProductCreateInput: {
        type: "object",
        description: "Datos para la creación de un nuevo producto en el catálogo",
        properties: {
            name: {
                type: "string",
                example: "Caja de embalaje reforzada 40x30x30",
                description: "Nombre del producto",
            },
            description: {
                type: "string",
                example: "Caja apta para logística pesada",
                description: "Descripción del producto",
            },
            price: {
                type: "number",
                minimum: 0.01,
                example: 12.34,
                description: "Precio unitario mayor a 0",
            },
            stock: {
                type: "integer",
                minimum: 0,
                example: 50,
                description: "Stock inicial entero mayor o igual a 0",
            },
        },
        required: ["name", "description", "price", "stock"],
        additionalProperties: false,
    },

    ProductUpdateInput: {
        type: "object",
        description: "Campos modificables del producto. Al menos uno es obligatorio.",
        properties: {
            name: {
                type: "string",
                example: "Caja de embalaje extra reforzada",
            },
            description: {
                type: "string",
                example: "Caja de doble corrugado para traslados",
            },
            price: {
                type: "number",
                minimum: 0.01,
                example: 15.5,
            },
            stock: {
                type: "integer",
                minimum: 0,
                example: 30,
            },
        },
        additionalProperties: false,
    },

    OrderItemInput: {
        type: "object",
        description: "Ítem de entrada al crear un pedido. Debe contener obligatoriamente el producto y la cantidad. No debe contener precios ni subtotales.",
        properties: {
            product: {
                type: "string",
                pattern: "^[0-9a-fA-F]{24}$",
                example: "673f1234567890abcdef5678",
                description: "ID de 24 caracteres hexadecimales del producto en catálogo (obligatorio)",
            },
            quantity: {
                type: "integer",
                minimum: 1,
                maximum: 1000,
                example: 2,
                description: "Cantidad solicitada (entero entre 1 y 1000)",
            },
        },
        required: ["product", "quantity"],
        additionalProperties: false,
    },

    OrderCreateInput: {
        type: "object",
        description: "Cuerpo estricto para crear un pedido logístico. El cliente no envía precios ni totales calculados.",
        properties: {
            items: {
                type: "array",
                minItems: 1,
                maxItems: 50,
                items: { $ref: "#/components/schemas/OrderItemInput" },
                description: "Lista de 1 a 50 ítems sin productos repetidos",
            },
            shipping_address: {
                $ref: "#/components/schemas/ShippingAddress",
            },
            priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                default: "medium",
                example: "medium",
                description: "Prioridad operativa (opcional, por defecto medium)",
            },
            user: {
                type: "string",
                pattern: "^[0-9a-fA-F]{24}$",
                example: "673f1234567890abcdef1234",
                description: "ID del cliente destinatario (exclusivo para administradores; usuarios cliente reciben 403 si lo envían)",
            },
        },
        required: ["items", "shipping_address"],
        additionalProperties: false,
    },

    OrderStatusUpdateInput: {
        type: "object",
        description: "Cuerpo estricto para cancelar un pedido",
        properties: {
            status: {
                type: "string",
                enum: ["cancelled"],
                example: "cancelled",
                description: "Único valor admitido en esta ruta: 'cancelled'",
            },
        },
        required: ["status"],
        additionalProperties: false,
    },

    DeliveryCreateInput: {
        type: "object",
        description: "Cuerpo estricto para asignar un pedido pendiente a un repartidor",
        properties: {
            order: {
                type: "string",
                pattern: "^[0-9a-fA-F]{24}$",
                example: "673f1234567890abcdef9999",
                description: "ID del pedido pendiente de entrega",
            },
            driver: {
                type: "string",
                pattern: "^[0-9a-fA-F]{24}$",
                example: "673f1234567890abcdef0002",
                description: "ID del usuario repartidor (debe tener rol DRIVER)",
            },
            estimated_delivery_date: {
                type: "string",
                format: "date-time",
                example: "2026-12-01T15:00:00.000Z",
                description: "Fecha y hora estimada en formato ISO UTC con sufijo Z (debe ser futura)",
            },
            delivery_notes: {
                type: "string",
                maxLength: 1000,
                example: "Entregar en puerta principal",
                description: "Notas operativas opcionales (máximo 1000 caracteres)",
            },
        },
        required: ["order", "driver", "estimated_delivery_date"],
        additionalProperties: false,
    },

    DeliveryStatusTransitionInput: {
        type: "object",
        description: "Cuerpo estricto para avanzar o cambiar el estado de una entrega",
        properties: {
            status: {
                type: "string",
                enum: ["assigned", "in_progress", "completed", "failed"],
                example: "in_progress",
                description: "Nuevo estado para la entrega (debe respetar transiciones permitidas)",
            },
        },
        required: ["status"],
        additionalProperties: false,
    },

    MockSeedInput: {
        type: "object",
        description: "Parámetros para la carga de datos de prueba (seed)",
        properties: {
            qty: {
                type: "integer",
                minimum: 1,
                maximum: 50,
                default: 10,
                example: 5,
                description: "Escala de inserción por entidad (1 a 50; genera qty usuarios, qty choferes, qty pedidos y qty entregas)",
            },
        },
        additionalProperties: false,
    },

    // -------------------------------------------------------------
    // Envoltorios y Respuestas Exitosas
    // -------------------------------------------------------------
    HealthResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "active" },
            message: { type: "string", example: "ShipNow API está funcionando correctamente" },
        },
        required: ["status", "message"],
    },

    GenericSuccessMessage: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            message: { type: "string", example: "Operación realizada correctamente" },
        },
        required: ["status", "message"],
    },

    SessionCurrentResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: { $ref: "#/components/schemas/CurrentUser" },
        },
        required: ["status", "payload"],
    },

    SessionRegisterResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            message: { type: "string", example: "Usuario registrado correctamente" },
            payload: { $ref: "#/components/schemas/User" },
        },
        required: ["status", "message", "payload"],
    },

    UsersListResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: {
                type: "array",
                items: { $ref: "#/components/schemas/User" },
            },
        },
        required: ["status", "payload"],
    },

    UserSingleResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: { $ref: "#/components/schemas/User" },
        },
        required: ["status", "payload"],
    },

    ProductsListResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: {
                type: "array",
                items: { $ref: "#/components/schemas/Product" },
            },
        },
        required: ["status", "payload"],
    },

    ProductSingleResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: { $ref: "#/components/schemas/Product" },
            message: { type: "string", example: "Producto creado exitosamente" },
        },
        required: ["status", "payload"],
    },

    OrdersPaginatedResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Order" },
                    },
                    page: { type: "integer", example: 1 },
                    limit: { type: "integer", example: 20 },
                },
                required: ["items", "page", "limit"],
            },
        },
        required: ["status", "payload"],
    },

    OrderSingleResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: { $ref: "#/components/schemas/Order" },
        },
        required: ["status", "payload"],
    },

    DeliveriesPaginatedResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Delivery" },
                    },
                    page: { type: "integer", example: 1 },
                    limit: { type: "integer", example: 20 },
                },
                required: ["items", "page", "limit"],
            },
        },
        required: ["status", "payload"],
    },

    DeliverySingleResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: { $ref: "#/components/schemas/Delivery" },
        },
        required: ["status", "payload"],
    },

    MockUsersResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            count: { type: "integer", example: 10 },
            payload: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        _id: { type: "string", example: "673f1234567890abcdef1234" },
                        first_name: { type: "string", example: "Ana" },
                        last_name: { type: "string", example: "Gómez" },
                        email: { type: "string", format: "email", example: "ana.gomez.1730000000@mock.shipnow.internal" },
                        role: { type: "string", enum: ["user"], example: "user" },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                    },
                    required: ["_id", "first_name", "last_name", "email", "role"],
                },
            },
        },
        required: ["status", "count", "payload"],
    },

    MockDriversResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            count: { type: "integer", example: 10 },
            payload: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        _id: { type: "string", example: "673f1234567890abcdef0002" },
                        first_name: { type: "string", example: "Carlos" },
                        last_name: { type: "string", example: "Chofer" },
                        email: { type: "string", format: "email", example: "carlos.chofer.1730000000@mock.shipnow.internal" },
                        role: { type: "string", enum: ["driver"], example: "driver" },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                    },
                    required: ["_id", "first_name", "last_name", "email", "role"],
                },
            },
        },
        required: ["status", "count", "payload"],
    },

    MockOrdersResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            count: { type: "integer", example: 10 },
            payload: {
                type: "object",
                properties: {
                    orders: {
                        type: "array",
                        items: { $ref: "#/components/schemas/MockOrder" },
                    },
                    related_users: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                _id: { type: "string", example: "673f1234567890abcdef1234" },
                                first_name: { type: "string", example: "Ana" },
                                last_name: { type: "string", example: "Gómez" },
                                email: { type: "string", format: "email", example: "ana.gomez.1730000000@mock.shipnow.internal" },
                                role: { type: "string", enum: ["user"], example: "user" },
                            },
                            required: ["_id", "first_name", "last_name", "email", "role"],
                        },
                    },
                },
                required: ["orders", "related_users"],
            },
        },
        required: ["status", "count", "payload"],
    },

    MockDeliveriesResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            count: { type: "integer", example: 10 },
            payload: {
                type: "object",
                properties: {
                    deliveries: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Delivery" },
                    },
                    related_orders: {
                        type: "array",
                        items: { $ref: "#/components/schemas/MockOrder" },
                    },
                    related_drivers: { type: "array", items: { type: "object" } },
                    related_users: { type: "array", items: { type: "object" } },
                },
                required: ["deliveries", "related_orders", "related_drivers", "related_users"],
            },
        },
        required: ["status", "count", "payload"],
    },

    MockSeedResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: {
                type: "object",
                properties: {
                    inserted: {
                        type: "object",
                        properties: {
                            users: { type: "integer", example: 10 },
                            drivers: { type: "integer", example: 10 },
                            orders: { type: "integer", example: 10 },
                            deliveries: { type: "integer", example: 10 },
                            total: { type: "integer", example: 40 },
                        },
                        required: ["users", "drivers", "orders", "deliveries", "total"],
                    },
                    scale_qty: { type: "integer", example: 10 },
                    message: {
                        type: "string",
                        example: "Carga de prueba ejecutada exitosamente (40 documentos insertados respetando integridad referencial)",
                    },
                },
                required: ["inserted", "scale_qty", "message"],
            },
        },
        required: ["status", "payload"],
    },

    LoggerTestResponse: {
        type: "object",
        properties: {
            status: { type: "string", example: "success" },
            payload: {
                type: "object",
                properties: {
                    levels: {
                        type: "array",
                        items: { type: "string" },
                        example: ["fatal", "error", "warning", "info", "http", "debug"],
                    },
                    simulated: { type: "boolean", example: true },
                    message: {
                        type: "string",
                        example: "Registros de prueba emitidos; fatal simulado no detiene el proceso",
                    },
                },
                required: ["levels", "simulated", "message"],
            },
        },
        required: ["status", "payload"],
    },
};

export const responses = {
    BadRequestError: {
        description: "Petición inválida (cuerpo malformado, parámetros fuera de rango o campos no permitidos)",
        content: {
            "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: {
                    status: "error",
                    statusCode: 400,
                    message: "Los datos de entrada no son válidos o están incompletos",
                    error: {
                        code: "INVALID_INPUT_DATA",
                        message: "Los datos de entrada no son válidos o están incompletos",
                        details: { field: "quantity", min: 1, limit: 1000 },
                    },
                },
            },
        },
    },
    UnauthorizedError: {
        description: "No autenticado o token JWT en cookie inválido/expirado",
        content: {
            "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: {
                    status: "error",
                    statusCode: 401,
                    message: "Autenticación requerida para acceder a este recurso",
                    error: {
                        code: "AUTHENTICATION_REQUIRED",
                        message: "Autenticación requerida para acceder a este recurso",
                        details: {},
                    },
                },
            },
        },
    },
    ForbiddenError: {
        description: "Permisos insuficientes para el rol actual o restricción de entorno (ej. seed/logger en producción)",
        content: {
            "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: {
                    status: "error",
                    statusCode: 403,
                    message: "No tenés permisos para realizar esta acción",
                    error: {
                        code: "INSUFFICIENT_PERMISSIONS",
                        message: "No tenés permisos para realizar esta acción",
                        details: { received: "user", allowed: ["admin"] },
                    },
                },
            },
        },
    },
    NotFoundError: {
        description: "Recurso no encontrado en el sistema",
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
    ConflictError: {
        description: "Conflicto de dominio (recurso duplicado, stock insuficiente o transición no permitida)",
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
    InternalServerError: {
        description: "Error interno del servidor (sin exposición de causas sensibles o consultas internas)",
        content: {
            "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: {
                    status: "error",
                    statusCode: 500,
                    message: "Error interno del servidor",
                    error: {
                        code: "INTERNAL_SERVER_ERROR",
                        message: "Error interno del servidor",
                        details: {},
                    },
                },
            },
        },
    },
};

export const securitySchemes = {
    cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "currentUser",
        description:
            "Cookie HTTP-Only con token JWT de sesión. En Swagger UI sobre el mismo servidor, primero ejecutá 'POST /api/sessions/login' desde 'Try it out' con credenciales válidas; el navegador guardará la cookie automáticamente para todas las peticiones posteriores protegidas.",
    },
};

export const productsPaths = {
    "/api/products": {
        get: {
            tags: ["Products"],
            summary: "Listar productos del catálogo",
            description:
                "Permite consultar el catálogo con filtros opcionales de estado, rango de precios y búsqueda textual. Búsqueda literal segura contra inyección de expresiones regulares.",
            operationId: "getAllProducts",
            parameters: [
                {
                    name: "status",
                    in: "query",
                    required: false,
                    description: "Filtrar por estado del producto",
                    schema: {
                        type: "string",
                        enum: ["available", "out_of_stock"],
                        example: "available",
                    },
                },
                {
                    name: "minPrice",
                    in: "query",
                    required: false,
                    description: "Precio mínimo mayor o igual a 0",
                    schema: { type: "number", minimum: 0, example: 10 },
                },
                {
                    name: "maxPrice",
                    in: "query",
                    required: false,
                    description: "Precio máximo mayor o igual a minPrice",
                    schema: { type: "number", minimum: 0, example: 100 },
                },
                {
                    name: "search",
                    in: "query",
                    required: false,
                    description: "Término de búsqueda por nombre (máximo 100 caracteres)",
                    schema: { type: "string", maxLength: 100, example: "caja" },
                },
            ],
            responses: {
                200: {
                    description: "Listado de productos",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ProductsListResponse" },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
        post: {
            tags: ["Products"],
            summary: "Crear un producto (ADMIN)",
            description:
                "Agrega un producto al catálogo. El servidor calcula automáticamente el `status` a partir del stock indicado (stock > 0 -> 'available', stock = 0 -> 'out_of_stock'). Si se envía 'status' en el cuerpo, es ignorado. Requiere rol ADMIN.",
            operationId: "createProduct",
            security: [{ cookieAuth: [] }],
            requestBody: {
                required: true,
                description: "Datos del producto a crear",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ProductCreateInput" },
                        example: {
                            name: "Caja de embalaje reforzada 40x30x30",
                            description: "Caja cartón corrugado para traslados",
                            price: 12.34,
                            stock: 50,
                        },
                    },
                },
            },
            responses: {
                201: {
                    description: "Producto creado con éxito",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ProductSingleResponse" },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: { $ref: "#/components/responses/ForbiddenError" },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },

    "/api/products/{id}": {
        get: {
            tags: ["Products"],
            summary: "Obtener un producto por ID",
            description: "Consulta los detalles de un producto por su identificador de MongoDB.",
            operationId: "getProductById",
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    description: "ID de 24 caracteres hexadecimales del producto",
                    schema: {
                        type: "string",
                        pattern: "^[0-9a-fA-F]{24}$",
                        example: "673f1234567890abcdef5678",
                    },
                },
            ],
            responses: {
                200: {
                    description: "Producto obtenido",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ProductSingleResponse" },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                404: {
                    description: "Producto no encontrado",
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
                                    details: { field: "id" },
                                },
                            },
                        },
                    },
                },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
        put: {
            tags: ["Products"],
            summary: "Actualizar un producto (ADMIN)",
            description:
                "Modifica uno o más campos (name, description, price, stock). El estado se recalcula automáticamente según el stock resultante. Requiere rol ADMIN.",
            operationId: "updateProduct",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    description: "ID del producto a actualizar",
                    schema: {
                        type: "string",
                        pattern: "^[0-9a-fA-F]{24}$",
                        example: "673f1234567890abcdef5678",
                    },
                },
            ],
            requestBody: {
                required: true,
                description: "Campos a actualizar (al menos uno)",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ProductUpdateInput" },
                        example: {
                            price: 14.5,
                            stock: 45,
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "Producto modificado correctamente",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ProductSingleResponse" },
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
        delete: {
            tags: ["Products"],
            summary: "Eliminar un producto (ADMIN)",
            description: "Elimina definitivamente un producto del catálogo. Requiere rol ADMIN.",
            operationId: "deleteProduct",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    description: "ID del producto a eliminar",
                    schema: {
                        type: "string",
                        pattern: "^[0-9a-fA-F]{24}$",
                        example: "673f1234567890abcdef5678",
                    },
                },
            ],
            responses: {
                200: {
                    description: "Producto eliminado",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/GenericSuccessMessage" },
                            example: {
                                status: "success",
                                message: "Producto eliminado exitosamente",
                            },
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
};

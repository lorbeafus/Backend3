export const usersPaths = {
    "/api/users": {
        get: {
            tags: ["Users"],
            summary: "Listar todos los usuarios (ADMIN)",
            description: "Devuelve todos los usuarios registrados con información pública sanitizada (sin contraseñas ni hashes). Requiere rol ADMIN.",
            operationId: "getAllUsers",
            security: [{ cookieAuth: [] }],
            responses: {
                200: {
                    description: "Lista de usuarios obtenida exitosamente",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UsersListResponse" },
                        },
                    },
                },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: { $ref: "#/components/responses/ForbiddenError" },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },

    "/api/users/{id}": {
        get: {
            tags: ["Users"],
            summary: "Obtener un usuario por ID (ADMIN)",
            description: "Busca un usuario por su identificador de MongoDB de 24 caracteres hexadecimales. Requiere rol ADMIN.",
            operationId: "getUserById",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "id",
                    in: "path",
                    required: true,
                    description: "ID de 24 caracteres hexadecimales del usuario",
                    schema: {
                        type: "string",
                        pattern: "^[0-9a-fA-F]{24}$",
                        example: "673f1234567890abcdef1234",
                    },
                },
            ],
            responses: {
                200: {
                    description: "Usuario encontrado",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UserSingleResponse" },
                        },
                    },
                },
                400: {
                    description: "Identificador con formato inválido",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 400,
                                message: "El ID proporcionado no es un identificador válido",
                                error: {
                                    code: "INVALID_ID",
                                    message: "El ID proporcionado no es un identificador válido",
                                    details: { field: "id" },
                                },
                            },
                        },
                    },
                },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                403: { $ref: "#/components/responses/ForbiddenError" },
                404: {
                    description: "Usuario no encontrado",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 404,
                                message: "Usuario no encontrado",
                                error: {
                                    code: "USER_NOT_FOUND",
                                    message: "Usuario no encontrado",
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

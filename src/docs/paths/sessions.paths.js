export const sessionsPaths = {
    "/api/sessions/register": {
        post: {
            tags: ["Sessions"],
            summary: "Registrar un nuevo usuario cliente",
            description:
                "Crea una cuenta con rol inicial 'user'. La contraseña se almacena de forma segura usando bcrypt (mínimo 6 caracteres, máximo 72 bytes UTF-8). Nunca devuelve contraseñas ni hashes.",
            operationId: "registerUser",
            requestBody: {
                required: true,
                description: "Datos obligatorios para el registro",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/RegisterInput" },
                        example: {
                            first_name: "Juan",
                            last_name: "Pérez",
                            email: "juan.perez@example.com",
                            password: "Password123",
                        },
                    },
                },
            },
            responses: {
                201: {
                    description: "Usuario registrado exitosamente",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/SessionRegisterResponse" },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                409: {
                    description: "El correo electrónico ya se encuentra registrado",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 409,
                                message: "Ya existe un registro con esos datos únicos",
                                error: {
                                    code: "DUPLICATE_RESOURCE",
                                    message: "Ya existe un registro con esos datos únicos",
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

    "/api/sessions/login": {
        post: {
            tags: ["Sessions"],
            summary: "Iniciar sesión de usuario",
            description:
                "Valida las credenciales (email y contraseña). Si son correctas, emite una cookie `currentUser` con un JWT firmado (HttpOnly, SameSite=Lax, 1 hora de vigencia).\n\n" +
                "**Prueba desde Swagger UI:** Al ejecutar esta operación desde 'Try it out' en el mismo navegador y servidor, la cookie `currentUser` quedará automáticamente guardada en el cliente para subsecuentes llamadas a rutas protegidas.",
            operationId: "loginUser",
            requestBody: {
                required: true,
                description: "Credenciales de acceso",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/LoginInput" },
                        example: {
                            email: "admin@example.test",
                            password: "Password123",
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "Login correcto. Se emite la cookie 'currentUser'.",
                    headers: {
                        "Set-Cookie": {
                            description: "Cookie HttpOnly que contiene el token JWT de sesión",
                            schema: {
                                type: "string",
                                example: "currentUser=eyJhbGciOi...; Path=/; HttpOnly; SameSite=Lax",
                            },
                        },
                    },
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/GenericSuccessMessage" },
                            example: {
                                status: "success",
                                message: "Login exitoso",
                            },
                        },
                    },
                },
                400: { $ref: "#/components/responses/BadRequestError" },
                401: {
                    description: "Credenciales inválidas (email inexistente o contraseña errónea)",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                statusCode: 401,
                                message: "Credenciales de acceso inválidas",
                                error: {
                                    code: "INVALID_CREDENTIALS",
                                    message: "Credenciales de acceso inválidas",
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

    "/api/sessions/current": {
        get: {
            tags: ["Sessions"],
            summary: "Consultar datos del usuario autenticado actualmente",
            description:
                "Obtiene la información y rol del usuario correspondiente a la cookie de sesión `currentUser`. El rol y existencia se verifican directamente en la base de datos.",
            operationId: "getCurrentSession",
            security: [{ cookieAuth: [] }],
            responses: {
                200: {
                    description: "Sesión activa identificada",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/SessionCurrentResponse" },
                        },
                    },
                },
                401: { $ref: "#/components/responses/UnauthorizedError" },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },

    "/api/sessions/logout": {
        post: {
            tags: ["Sessions"],
            summary: "Cerrar la sesión actual",
            description: "Limpia la cookie `currentUser` en el navegador del cliente. Es una operación idempotente.",
            operationId: "logoutUser",
            responses: {
                200: {
                    description: "Sesión cerrada correctamente",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/GenericSuccessMessage" },
                            example: {
                                status: "success",
                                message: "Logout correcto",
                            },
                        },
                    },
                },
                500: { $ref: "#/components/responses/InternalServerError" },
            },
        },
    },
};

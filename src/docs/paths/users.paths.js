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

    "/api/users/{uid}/documents": {
        post: {
            tags: ["Users"],
            summary: "Subir documento de usuario o licencia de conductor",
            description:
                "Permite la carga de un archivo en formato multipart/form-data asociado a un usuario.\n" +
                "- **Permisos:** USER o DRIVER para sus propios documentos; ADMIN para cualquier usuario.\n" +
                "- **Campos multipart:** Archivo obligatorio `document` (exactamente 1 archivo binario) y único campo de texto permitido `type` (obligatorio, string único).\n" +
                "- **Tipos válidos:** `user_document` (para cualquier usuario) y `driver_license` (exclusivo para usuarios con rol `driver`).\n" +
                "- **Formatos aceptados:** PDF, JPEG, PNG (validación MIME y comprobación de firma mediante magic bytes iniciales; no constituye análisis semántico exhaustivo ni escaneo de malware).\n" +
                "- **Normalización de extensiones:** El nombre de archivo en disco se genera con UUIDv4 y su extensión definitiva se deriva estrictamente del MIME verificado (`application/pdf` → `.pdf`, `image/jpeg` → `.jpg`, `image/png` → `.png`). El nombre original solo se conserva en metadatos.\n" +
                "- **Límites:** 1 archivo por petición, tamaño máximo 5 MiB. No se aceptan campos de texto adicionales ni arrays duplicados.\n" +
                "- **Almacenamiento y persistencia:** Almacenamiento privado bajo subcarpetas (`documents`, `licenses`) y metadatos asociados en MongoDB. Ante fallos de conexión inciertos, el archivo físico se preserva para reconciliación evitando eliminaciones a ciegas.",
            operationId: "uploadUserDocument",
            security: [{ cookieAuth: [] }],
            parameters: [
                {
                    name: "uid",
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
            requestBody: {
                required: true,
                description: "Formulario multipart con archivo y tipo de documento",
                content: {
                    "multipart/form-data": {
                        schema: {
                            type: "object",
                            required: ["document", "type"],
                            properties: {
                                document: {
                                    type: "string",
                                    format: "binary",
                                    description: "Archivo binario (PDF, JPEG o PNG de hasta 5 MiB)",
                                },
                                type: {
                                    type: "string",
                                    enum: ["user_document", "driver_license"],
                                    description: "Tipo de documento. 'driver_license' requiere rol DRIVER",
                                    example: "user_document",
                                },
                            },
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "Documento cargado exitosamente",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/UploadDocumentResponse" },
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

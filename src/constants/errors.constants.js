/**
 * Diccionario centralizado de errores para ShipNow API (Preentrega 3 - Módulo 3).
 * Define códigos semánticos estables, estados HTTP y mensajes estándar
 * para todas las situaciones de dominio de la plataforma.
 */
export const ERROR_DICTIONARY = Object.freeze({
    // -------------------------------------------------------------
    // 400 Bad Request - Validaciones y datos de entrada
    // -------------------------------------------------------------
    INVALID_INPUT_DATA: Object.freeze({
        code: "INVALID_INPUT_DATA",
        statusCode: 400,
        message: "Los datos de entrada no son válidos o están incompletos",
    }),
    INVALID_ID: Object.freeze({
        code: "INVALID_ID",
        statusCode: 400,
        message: "El identificador proporcionado no es un identificador válido",
    }),
    INVALID_JSON_BODY: Object.freeze({
        code: "INVALID_JSON_BODY",
        statusCode: 400,
        message: "El cuerpo de la petición debe ser un objeto JSON válido",
    }),
    INVALID_MOCK_QUANTITY: Object.freeze({
        code: "INVALID_MOCK_QUANTITY",
        statusCode: 400,
        message: "La cantidad de mocks debe ser un número entero positivo dentro de los límites permitidos",
    }),
    INVALID_DOMAIN_STATE: Object.freeze({
        code: "INVALID_DOMAIN_STATE",
        statusCode: 400,
        message: "El estado de la entidad o transición de dominio solicitada no es válido",
    }),

    // -------------------------------------------------------------
    // 401 Unauthorized - Autenticación y tokens
    // -------------------------------------------------------------
    AUTHENTICATION_REQUIRED: Object.freeze({
        code: "AUTHENTICATION_REQUIRED",
        statusCode: 401,
        message: "Autenticación requerida para acceder a este recurso",
    }),
    TOKEN_INVALID_OR_EXPIRED: Object.freeze({
        code: "TOKEN_INVALID_OR_EXPIRED",
        statusCode: 401,
        message: "Token de autenticación inválido o expirado",
    }),
    INVALID_CREDENTIALS: Object.freeze({
        code: "INVALID_CREDENTIALS",
        statusCode: 401,
        message: "Credenciales de acceso inválidas",
    }),

    // -------------------------------------------------------------
    // 403 Forbidden - Autorización y restricciones de entorno
    // -------------------------------------------------------------
    INSUFFICIENT_PERMISSIONS: Object.freeze({
        code: "INSUFFICIENT_PERMISSIONS",
        statusCode: 403,
        message: "No tenés los permisos requeridos para realizar esta acción",
    }),
    SEED_FORBIDDEN_IN_PRODUCTION: Object.freeze({
        code: "SEED_FORBIDDEN_IN_PRODUCTION",
        statusCode: 403,
        message: "La generación de datos de prueba (seed) está estrictamente deshabilitada en el entorno de producción",
    }),

    // -------------------------------------------------------------
    // 404 Not Found - Recursos inexistentes y rutas
    // -------------------------------------------------------------
    USER_NOT_FOUND: Object.freeze({
        code: "USER_NOT_FOUND",
        statusCode: 404,
        message: "Usuario no encontrado",
    }),
    PRODUCT_NOT_FOUND: Object.freeze({
        code: "PRODUCT_NOT_FOUND",
        statusCode: 404,
        message: "Producto no encontrado",
    }),
    ORDER_NOT_FOUND: Object.freeze({
        code: "ORDER_NOT_FOUND",
        statusCode: 404,
        message: "Pedido no encontrado",
    }),
    ROUTE_NOT_FOUND: Object.freeze({
        code: "ROUTE_NOT_FOUND",
        statusCode: 404,
        message: "La ruta solicitada no existe en el servidor",
    }),

    // -------------------------------------------------------------
    // 409 Conflict - Unicidad y colisiones
    // -------------------------------------------------------------
    DUPLICATE_RESOURCE: Object.freeze({
        code: "DUPLICATE_RESOURCE",
        statusCode: 409,
        message: "Ya existe un registro con esos datos únicos",
    }),

    // -------------------------------------------------------------
    // 500 Internal Server Error - Fallos de infraestructura y mocks
    // -------------------------------------------------------------
    MOCK_GENERATION_FAILED: Object.freeze({
        code: "MOCK_GENERATION_FAILED",
        statusCode: 500,
        message: "Ocurrió un error inesperado durante la generación de datos simulados",
    }),
    MOCK_PERSISTENCE_FAILED: Object.freeze({
        code: "MOCK_PERSISTENCE_FAILED",
        statusCode: 500,
        message: "Error durante la persistencia de datos de prueba",
    }),
    INTERNAL_SERVER_ERROR: Object.freeze({
        code: "INTERNAL_SERVER_ERROR",
        statusCode: 500,
        message: "Error interno del servidor",
    }),
});

/**
 * Manejador centralizado de errores.
 * - Errores del dominio llevan statusCode.
 * - Errores de body-parser (JSON malformado) se responden como 400.
 * - Errores de Mongoose por validación/cast/duplicado se mapean a 400/409.
 * - Cualquier otro error devuelve 500 sin exponer detalles internos.
 */
export const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || err.status || 500;
    let message = err.message;

    if (err.type === "entity.parse.failed") {
        statusCode = 400;
        message = "El cuerpo de la petición no es un JSON válido";
    } else if (err.name === "ValidationError" || err.name === "CastError") {
        statusCode = 400;
    } else if (err.code === 11000) {
        statusCode = 409;
        message = "Ya existe un registro con esos datos únicos";
    }

    if (statusCode >= 500) {
        console.error("[Error]", err);
        message = "Error interno del servidor";
    }

    res.status(statusCode).json({
        status: "error",
        statusCode,
        message: message || "Error interno del servidor",
    });
};

/**
 * Crea un Error con código HTTP asociado. Lo consume el middleware de errores.
 */
export const httpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};
